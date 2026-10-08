import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useStore } from 'zustand';

import { ExerciseCard } from '../../src/gym/ExerciseCard';
import {
  SessionSummaryCard,
  StepRow,
  WarmupSection,
  type NonSetsStep,
} from '../../src/gym/StepBlocks';
import type { SetsStep, StoredSet } from '../../src/gym/sessionViewModel';
import { useGymSession } from '../../src/gym/useGym';
import { useT } from '../../src/i18n';
import { getTimerStore, useActiveTimer, useTimerFeedback } from '../../src/timers';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { ProgressBar } from '../../src/ui/ProgressBar';
import { Screen } from '../../src/ui/Screen';
import { TimerSheet } from '../../src/ui/TimerSheet';
import { Toast } from '../../src/ui/Toast';
import { useTheme } from '../../src/ui/theme';
import { useTemplateText } from '../../src/i18n/templateText';

const FINISHED_SHEET_MS = 5000;
const NO_LOGS: readonly StoredSet[] = [];

/**
 * Owns the timer subscription for the sheet, so the (busy) session screen does not re-render on
 * timer transitions; the 250 ms clock itself lives inside `TimerSheet`.
 */
function TimerSheetHost({ onLayoutHeight }: { onLayoutHeight: (height: number) => void }) {
  const timer = useActiveTimer();
  if (!timer) return null;
  const timers = getTimerStore().getState();
  return (
    <TimerSheet
      timer={timer}
      onPause={() => timers.pause()}
      onResume={() => timers.resume()}
      onAddTime={() => timers.addTime()}
      onSkip={() => timers.skip()}
      onClose={() => timers.dismiss()}
      onLayoutHeight={onLayoutHeight}
    />
  );
}

function stepOwner(step: NonSetsStep): string {
  return `${step.type === 'wait' ? 'wait' : 'timed'}:${step.id}`;
}

export default function GymSession() {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const { routineId } = useLocalSearchParams<{ routineId?: string }>();
  const session = useGymSession(routineId);
  // Primitive selectors only: the screen re-renders when the status / owner change, never per tick.
  const store = getTimerStore();
  const timerStatus = useStore(store, (state) => state.active?.state.status ?? null);
  const activeOwner = useStore(store, (state) =>
    state.active && state.active.state.status !== 'finished' ? state.active.owner : '',
  );
  const [doneSteps, setDoneSteps] = useState<ReadonlySet<string>>(new Set());
  const [sheetHeight, setSheetHeight] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Screen stays on while training; ticking, beeps, alarm and haptics are handled by this hook.
  useKeepAwake();
  useTimerFeedback();

  const timers = getTimerStore().getState();

  // A warm-up / cardio timer that runs out checks its step off.
  useEffect(
    () =>
      getTimerStore().subscribe((state) => {
        const finished = state.active;
        if (!finished || finished.finishedBy !== 'elapsed') return;
        const match = /^(wait|timed):(.+)$/.exec(finished.owner);
        const stepId = match?.[2];
        if (stepId) setDoneSteps((current) => new Set(current).add(stepId));
      }),
    [],
  );

  // A finished sheet closes by itself after a few seconds (keyed by status, a new run re-arms it).
  const finishedOwner = useStore(store, (state) =>
    state.active?.state.status === 'finished' ? state.active.owner : null,
  );
  useEffect(() => {
    if (finishedOwner === null) return;
    const id = setTimeout(() => getTimerStore().getState().dismiss(), FINISHED_SHEET_MS);
    return () => clearTimeout(id);
  }, [finishedOwner]);

  const layout = useMemo(() => {
    if (session.state.status !== 'ready') return null;
    const { steps } = session.state;
    const firstSets = steps.findIndex((step) => step.type === 'sets');
    const warmupEnd = firstSets === -1 ? steps.length : firstSets;
    return {
      warmup: steps.slice(0, warmupEnd).filter((step): step is NonSetsStep => step.type !== 'sets'),
      rest: steps.slice(warmupEnd),
    };
  }, [session.state]);

  if (session.state.status === 'loading') {
    return <Screen edges={['top', 'bottom', 'left', 'right']}>{null}</Screen>;
  }

  if (session.state.status !== 'ready' || !layout) {
    const notFound = session.state.status === 'notFound';
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          title={t(notFound ? 'gym.session.notFoundTitle' : 'gym.session.loadError')}
          body={t('gym.session.notFoundBody')}
          action={{ label: t('gym.session.back'), onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const { exercises, routineName } = session.state;
  const setsPlanned = exercises.reduce((sum, { step }) => sum + step.sets, 0);
  const runningStepId = /^(wait|timed):/.test(activeOwner)
    ? activeOwner.slice(activeOwner.indexOf(':') + 1)
    : null;

  const toggleDone = (step: NonSetsStep) =>
    setDoneSteps((current) => {
      const next = new Set(current);
      if (next.has(step.id)) next.delete(step.id);
      else next.add(step.id);
      return next;
    });

  const startStepTimer = (step: NonSetsStep) => {
    if (step.type === 'wait') {
      timers.start({
        owner: stepOwner(step),
        kind: 'wait',
        durationSec: step.waitSec,
        notification: {
          title: t('timers.notification.waitTitle'),
          body: t('timers.notification.bodyDefault'),
        },
      });
    } else if (step.type === 'timed') {
      timers.start({
        owner: stepOwner(step),
        kind: 'cardio',
        durationSec: step.totalSec,
        segments: step.segments.map((segment) => ({ ...segment, label: text(segment.label) })),
        notification: {
          title: t('timers.notification.cardioTitle'),
          body: t('timers.notification.bodyDefault'),
        },
      });
    }
  };

  const onFinish = async () => {
    setFinishing(true);
    try {
      const result = await session.finish();
      // No sets logged: nothing to summarize. An error keeps the session open (error toast).
      if (result.status === 'empty') router.back();
    } finally {
      setFinishing(false);
    }
  };

  const summary = session.summary;
  const bottomPadding = timerStatus !== null ? sheetHeight + theme.space[4] : theme.space[8];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.space[3],
          paddingTop: theme.space[4],
          paddingBottom: bottomPadding,
        }}
      >
        <View style={{ gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {text(routineName)}
          </Text>
          <ProgressBar
            current={session.setsDone}
            total={setsPlanned}
            label={t('gym.session.setsProgress', { done: session.setsDone, total: setsPlanned })}
          />
        </View>

        {summary ? (
          <>
            <SessionSummaryCard
              sets={summary.setsDone}
              volumeKg={t('gym.session.summaryVolumeValue', { kg: Math.round(summary.volumeKg) })}
              targets={t('gym.session.summaryTargetsValue', {
                met: summary.targetsMet,
                total: summary.targetsTotal,
              })}
            />
            <Button label={t('gym.session.summaryDone')} size="lg" onPress={() => router.back()} />
          </>
        ) : (
          <>
            {layout.warmup.length > 0 ? (
              <WarmupSection
                steps={layout.warmup}
                doneIds={doneSteps}
                runningStepId={runningStepId}
                onToggleDone={toggleDone}
                onStartTimer={startStepTimer}
              />
            ) : null}
            {layout.rest.map((step) => {
              if (step.type === 'sets') {
                const exercise = exercises.find((candidate) => candidate.step.id === step.id);
                if (!exercise) return null;
                const setsStep: SetsStep = exercise.step;
                return (
                  <ExerciseCard
                    key={step.id}
                    step={setsStep}
                    view={exercise.view}
                    logs={session.logsByStep.get(step.id) ?? NO_LOGS}
                    onSetDone={session.setDone}
                    onSetUndone={session.setUndone}
                    onRir={session.setRir}
                    {...(setsStep.holdSec !== undefined ? { onHold: session.startHold } : {})}
                  />
                );
              }
              return (
                <Card key={step.id}>
                  <StepRow
                    step={step}
                    done={doneSteps.has(step.id)}
                    running={runningStepId === step.id}
                    onToggleDone={() => toggleDone(step)}
                    onStartTimer={() => startStepTimer(step)}
                  />
                </Card>
              );
            })}
            <Button
              label={t('gym.session.finish')}
              size="lg"
              loading={finishing}
              onPress={() => void onFinish()}
            />
          </>
        )}
      </ScrollView>

      {summary ? (
        <View style={{ position: 'absolute', top: theme.space[2], left: 0, right: 0 }}>
          <Toast
            variant="routineComplete"
            pose="celebra"
            title={t('gym.session.toastTitle')}
            subtitle={t('gym.session.toastSubtitle', {
              sets: summary.setsDone,
              kg: Math.round(summary.volumeKg),
            })}
          />
        </View>
      ) : null}

      {session.error ? (
        <View style={{ position: 'absolute', top: theme.space[2], left: 0, right: 0 }}>
          <Toast
            key={session.error.id}
            variant="error"
            title={t(
              session.error.kind === 'finish'
                ? 'gym.session.errorFinishTitle'
                : 'gym.session.errorSaveTitle',
            )}
            subtitle={t(
              session.error.kind === 'finish'
                ? 'gym.session.errorFinishBody'
                : 'gym.session.errorSaveBody',
            )}
            onHide={session.clearError}
          />
        </View>
      ) : null}

      {timerStatus !== null && !summary ? <TimerSheetHost onLayoutHeight={setSheetHeight} /> : null}
    </Screen>
  );
}
