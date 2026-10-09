// Gym session (`/gym/session`): a horizontal pager with ONE exercise per page (warm-up first,
// cardio / extras, then a finish page). The set, timer and finish logic is the same as before:
// `useGymSession` + the timer store; only the layout changed.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useReducedMotion } from 'react-native-reanimated';
import { useStore } from 'zustand';
import { CaretLeft, CaretRight, type Icon } from 'phosphor-react-native';

import { dayKeyFor } from '../domain/time';
import { useT } from '../i18n';
import { useTemplateText } from '../i18n/templateText';
import type { Step } from '../templates/schema';
import { getTimerStore, useActiveTimer, useTimerFeedback } from '../timers';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ProgressBar } from '../ui/ProgressBar';
import { Screen } from '../ui/Screen';
import { TimerBar } from '../ui/TimerBar';
import { Toast } from '../ui/Toast';
import { useTheme } from '../ui/theme';
import { ExerciseCard } from './ExerciseCard';
import type { StoredSet } from './sessionViewModel';
import { SessionSummaryCard, StepRow, WarmupSection, type NonSetsStep } from './StepBlocks';
import { clearDoneSteps, getDoneSteps, saveDoneSteps, sessionStepsKey } from './sessionStepsStore';
import { useGymSession, type SessionExercise } from './useGym';
import { SessionScrollContext } from './sessionScroll';
import { hiddenScrollIndicators } from '../ui/scroll';

const FINISHED_SHEET_MS = 5000;
const NO_LOGS: readonly StoredSet[] = [];
const EDGES = ['top', 'bottom', 'left', 'right'] as const;

export type SessionPage =
  | { kind: 'warmup'; key: string; steps: NonSetsStep[] }
  | { kind: 'exercise'; key: string; exercise: SessionExercise }
  | { kind: 'extras'; key: string; steps: NonSetsStep[] }
  | { kind: 'finish'; key: string };

/**
 * Pages of a session, in order: the warm-up (steps before the first exercise), one page per
 * exercise, one page per run of other steps after it (cardio, waits, checks), and the finish page.
 * Pure.
 */
export function buildSessionPages(
  steps: readonly Step[],
  exercises: readonly SessionExercise[],
): SessionPage[] {
  const pages: SessionPage[] = [];
  const firstSets = steps.findIndex((step) => step.type === 'sets');
  const warmupEnd = firstSets === -1 ? steps.length : firstSets;
  const warmup = steps
    .slice(0, warmupEnd)
    .filter((step): step is NonSetsStep => step.type !== 'sets');
  if (warmup.length > 0) pages.push({ kind: 'warmup', key: 'warmup', steps: warmup });
  let extras: NonSetsStep[] = [];
  const flush = () => {
    const first = extras[0];
    if (first) pages.push({ kind: 'extras', key: `extras:${first.id}`, steps: extras });
    extras = [];
  };
  for (const step of steps.slice(warmupEnd)) {
    if (step.type === 'sets') {
      const exercise = exercises.find((candidate) => candidate.step.id === step.id);
      if (!exercise) continue;
      flush();
      pages.push({ kind: 'exercise', key: `sets:${step.id}`, exercise });
    } else {
      extras.push(step);
    }
  }
  flush();
  pages.push({ kind: 'finish', key: 'finish' });
  return pages;
}

/**
 * The page a session opens on: the warm-up (first page) for a fresh session; on resume, the first
 * exercise with sets still pending, or the finish page when every exercise is done.
 */
export function initialPageIndex(
  pages: readonly SessionPage[],
  logsByStep: ReadonlyMap<string, readonly StoredSet[]>,
): number {
  const logged = (stepId: string) =>
    (logsByStep.get(stepId) ?? []).filter((log) => (log.reps ?? 0) > 0).length;
  const started = pages.some(
    (page) => page.kind === 'exercise' && logged(page.exercise.step.id) > 0,
  );
  if (!started) return 0;
  const pending = pages.findIndex(
    (page) => page.kind === 'exercise' && logged(page.exercise.step.id) < page.exercise.step.sets,
  );
  return pending === -1 ? Math.max(0, pages.length - 1) : pending;
}

/**
 * Owns the timer subscription for the bar, so the (busy) session screen does not re-render on
 * timer transitions; the 250 ms clock itself lives inside `TimerBar`.
 */
function TimerBarHost() {
  const timer = useActiveTimer();
  if (!timer) return null;
  const timers = getTimerStore().getState();
  return (
    <TimerBar
      timer={timer}
      onPause={() => timers.pause()}
      onResume={() => timers.resume()}
      onAddTime={() => timers.addTime()}
      onSkip={() => timers.skip()}
      onClose={() => timers.dismiss()}
    />
  );
}

/**
 * One page's vertical scroll. A focused set input scrolls its row near the top (above the numeric
 * keyboard) through `SessionScrollContext`; no animation with reduce motion.
 */
function KeyboardAwarePage({
  bottomPadding,
  children,
}: {
  bottomPadding: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const margin = theme.space[8];
  // The last focused row: the keyboard opening (KAV padding) changes the layout after focus, so
  // the row is scrolled again when the keyboard is shown.
  const focusedRef = useRef<View | null>(null);
  const scrollNow = useCallback(
    (node: View | null) => {
      const content = contentRef.current;
      if (!node || !content) return;
      node.measureLayout(
        content,
        (_x, y) =>
          scrollRef.current?.scrollTo({ y: Math.max(0, y - margin), animated: !reduceMotion }),
        () => undefined,
      );
    },
    [margin, reduceMotion],
  );
  const scrollIntoView = useCallback(
    (node: View | null) => {
      focusedRef.current = node;
      scrollNow(node);
      // Next frame: the KeyboardAvoidingView padding has been applied by then.
      requestAnimationFrame(() => scrollNow(node));
    },
    [scrollNow],
  );
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      const node = focusedRef.current;
      if (node) requestAnimationFrame(() => scrollNow(node));
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      focusedRef.current = null;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [scrollNow]);
  return (
    <SessionScrollContext.Provider value={scrollIntoView}>
      <ScrollView
        {...hiddenScrollIndicators}
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: theme.space[3], paddingBottom: bottomPadding }}
      >
        <View ref={contentRef} style={{ gap: theme.space[3] }}>
          {children}
        </View>
      </ScrollView>
    </SessionScrollContext.Provider>
  );
}

function stepOwner(step: NonSetsStep): string {
  return `${step.type === 'wait' ? 'wait' : 'timed'}:${step.id}`;
}

function PageButton({
  icon: ButtonIcon,
  label,
  disabled,
  onPress,
}: {
  icon: Icon;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch.gym,
        height: theme.touch.gym,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.section.gym.soft,
        opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
      })}
    >
      <ButtonIcon color={theme.section.gym.text} />
    </Pressable>
  );
}

export function GymSessionScreen() {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const { routineId } = useLocalSearchParams<{ routineId?: string }>();
  const session = useGymSession(routineId);
  // Primitive selectors only: the screen re-renders when the status / owner change, never per tick.
  const store = getTimerStore();
  const timerStatus = useStore(store, (state) => state.active?.state.status ?? null);
  const activeOwner = useStore(store, (state) =>
    state.active && state.active.state.status !== 'finished' ? state.active.owner : '',
  );
  // Warm-up / cardio checks survive leaving and resuming today's session of this routine.
  const [stepsKey] = useState(() => sessionStepsKey(dayKeyFor(new Date()), routineId ?? ''));
  const [doneSteps, setDoneSteps] = useState<ReadonlySet<string>>(() => getDoneSteps(stepsKey));
  const [finishing, setFinishing] = useState(false);
  // `null` until the session loads: then it is seeded (resume opens the first pending exercise).
  const [page, setPage] = useState<number | null>(null);
  const [pageWidth, setPageWidth] = useState(
    Math.min(window.width, theme.layout.maxContentWidth) - theme.space[5] * 2,
  );
  const listRef = useRef<FlatList<SessionPage>>(null);

  useEffect(() => saveDoneSteps(stepsKey, doneSteps), [stepsKey, doneSteps]);

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

  const pages = useMemo(
    () =>
      session.state.status === 'ready'
        ? buildSessionPages(session.state.steps, session.state.exercises)
        : [],
    [session.state],
  );

  if (page === null && pages.length > 0) setPage(initialPageIndex(pages, session.logsByStep));
  const lastPage = pages.length - 1;
  const current = Math.max(0, Math.min(page ?? 0, lastPage));
  const pageName = (item: SessionPage | undefined): string => {
    if (!item) return '';
    if (item.kind === 'warmup') return t('gym.session.warmup');
    if (item.kind === 'exercise') return text(item.exercise.step.name);
    if (item.kind === 'extras') return t('gym.session.extrasTitle');
    return t('gym.session.finishTitle');
  };

  const pageLabel = (index: number) =>
    t('gym.session.pagePosition', {
      current: index + 1,
      total: pages.length,
      name: pageName(pages[index]),
    });

  // Moving to another page is announced (TalkBack and VoiceOver); the first page is not.
  const announcedPage = useRef<number | null>(null);
  useEffect(() => {
    if (page === null) return;
    if (announcedPage.current !== null && announcedPage.current !== current) {
      AccessibilityInfo.announceForAccessibility(pageLabel(current));
    }
    announcedPage.current = current;
    // Only when the page changes (the label follows it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, page === null]);

  // A new page width (rotation, split screen) keeps the current page in view.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: current * pageWidth, animated: false });
    // Only on width changes; page changes scroll by themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidth]);

  if (session.state.status === 'loading') {
    return <Screen edges={EDGES}>{null}</Screen>;
  }

  if (session.state.status !== 'ready') {
    const notFound = session.state.status === 'notFound';
    return (
      <Screen edges={EDGES}>
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
  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(lastPage, index));
    setPage(target);
    listRef.current?.scrollToOffset({ offset: target * pageWidth, animated: !reduceMotion });
  };

  const onPageScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPage(Math.max(0, Math.min(lastPage, index)));
  };

  const toggleDone = (step: NonSetsStep) =>
    setDoneSteps((currentIds) => {
      const next = new Set(currentIds);
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
      if (result.status !== 'error') clearDoneSteps(stepsKey);
      // No sets logged: nothing to summarize. An error keeps the session open (error toast).
      if (result.status === 'empty') router.back();
    } finally {
      setFinishing(false);
    }
  };

  const summary = session.summary;
  // The timer bar takes layout space under the pager, so the pages never hide behind it.
  const bottomPadding = theme.space[8];

  const pageTitle = (title: string) => (
    <Text accessibilityRole="header" style={[theme.text('title-md'), { color: theme.color.text }]}>
      {title}
    </Text>
  );

  const renderPage = ({ item, index }: { item: SessionPage; index: number }) => {
    let body;
    if (item.kind === 'warmup') {
      body = (
        <WarmupSection
          steps={item.steps}
          doneIds={doneSteps}
          runningStepId={runningStepId}
          onToggleDone={toggleDone}
          onStartTimer={startStepTimer}
        />
      );
    } else if (item.kind === 'exercise') {
      const { step, view } = item.exercise;
      body = (
        <ExerciseCard
          step={step}
          view={view}
          logs={session.logsByStep.get(step.id) ?? NO_LOGS}
          onSetDone={session.setDone}
          onSetUndone={session.setUndone}
          onRir={session.setRir}
          prominentTarget
          {...(step.holdSec !== undefined ? { onHold: session.startHold } : {})}
        />
      );
    } else if (item.kind === 'extras') {
      body = (
        <>
          {pageTitle(t('gym.session.extrasTitle'))}
          {item.steps.map((step) => (
            <Card key={step.id}>
              <StepRow
                step={step}
                done={doneSteps.has(step.id)}
                running={runningStepId === step.id}
                onToggleDone={() => toggleDone(step)}
                onStartTimer={() => startStepTimer(step)}
              />
            </Card>
          ))}
        </>
      );
    } else {
      body = (
        <>
          {pageTitle(t('gym.session.finishTitle'))}
          <Text style={[theme.text('body'), { color: theme.color.text }]}>
            {t('gym.session.finishBody', { done: session.setsDone, total: setsPlanned })}
          </Text>
          <Button
            label={t('gym.session.finish')}
            size="lg"
            loading={finishing}
            onPress={() => void onFinish()}
          />
        </>
      );
    }
    return (
      <View
        testID={`session-page-${item.key}`}
        // Only the visible page is in the screen reader's reach (the others are off-screen).
        accessibilityElementsHidden={index !== current}
        importantForAccessibility={index === current ? 'auto' : 'no-hide-descendants'}
        style={{ width: pageWidth }}
      >
        <KeyboardAwarePage bottomPadding={bottomPadding}>{body}</KeyboardAwarePage>
      </View>
    );
  };

  return (
    <Screen
      edges={EDGES}
      bottomBar={timerStatus !== null && !summary ? <TimerBarHost /> : undefined}
    >
      <View style={{ gap: theme.space[2], paddingTop: theme.space[4] }}>
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
        <ScrollView
          {...hiddenScrollIndicators}
          contentContainerStyle={{
            gap: theme.space[3],
            paddingTop: theme.space[3],
            paddingBottom: theme.space[8],
          }}
        >
          <SessionSummaryCard
            sets={summary.setsDone}
            volumeKg={t('gym.session.summaryVolumeValue', { kg: Math.round(summary.volumeKg) })}
            targets={t('gym.session.summaryTargetsValue', {
              met: summary.targetsMet,
              total: summary.targetsTotal,
            })}
          />
          <Button label={t('gym.session.summaryDone')} size="lg" onPress={() => router.back()} />
        </ScrollView>
      ) : (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[3],
              paddingVertical: theme.space[2],
            }}
          >
            <PageButton
              icon={CaretLeft}
              label={t('gym.session.pagePrev')}
              disabled={current === 0}
              onPress={() => goTo(current - 1)}
            />
            <View
              testID="session-dots"
              accessible
              accessibilityLabel={pageLabel(current)}
              style={{
                flex: 1,
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: theme.space[1],
              }}
            >
              {pages.map((item, index) => (
                <View
                  key={item.key}
                  style={{
                    width: index === current ? theme.space[4] : theme.space[2],
                    height: theme.space[2],
                    borderRadius: theme.radius.pill,
                    backgroundColor:
                      index === current ? theme.section.gym.text : theme.color.border,
                  }}
                />
              ))}
            </View>
            <PageButton
              icon={CaretRight}
              label={t('gym.session.pageNext')}
              disabled={current === lastPage}
              onPress={() => goTo(current + 1)}
            />
          </View>
          {/* Edge-to-edge (SDK 57): the window no longer resizes for the keyboard, so the pager
              takes the keyboard height as padding on both platforms. */}
          <KeyboardAvoidingView
            behavior="padding"
            style={{ flex: 1 }}
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              if (width > 0 && width !== pageWidth) setPageWidth(width);
            }}
          >
            <FlatList
              {...hiddenScrollIndicators}
              ref={listRef}
              testID="session-pager"
              data={pages}
              keyExtractor={(item) => item.key}
              renderItem={renderPage}
              extraData={[
                doneSteps,
                session.logsByStep,
                runningStepId,
                finishing,
                bottomPadding,
                current,
              ]}
              initialScrollIndex={current}
              horizontal
              pagingEnabled
              keyboardShouldPersistTaps="handled"
              initialNumToRender={pages.length}
              removeClippedSubviews={false}
              getItemLayout={(_, index) => ({
                length: pageWidth,
                offset: pageWidth * index,
                index,
              })}
              onMomentumScrollEnd={onPageScrollEnd}
            />
          </KeyboardAvoidingView>
        </>
      )}

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
    </Screen>
  );
}
