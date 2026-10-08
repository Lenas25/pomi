import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CaretDown, CaretUp, Check, Play } from 'phosphor-react-native';

import { useT } from '../i18n';
import type { Step } from '../templates/schema';
import { formatClock } from '../timers/timerModel';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

export type NonSetsStep = Exclude<Step, { type: 'sets' }>;

type StepRowProps = {
  step: NonSetsStep;
  done: boolean;
  /** `wait` and `timed` steps: this step's timer is the one running. */
  running: boolean;
  onToggleDone: () => void;
  onStartTimer: () => void;
};

/** A warm-up / cardio step: a 48 dp check, and a Start button when it has a timer. */
export function StepRow({ step, done, running, onToggleDone, onStartTimer }: StepRowProps) {
  const theme = useTheme();
  const t = useT();
  const duration =
    step.type === 'wait' ? step.waitSec : step.type === 'timed' ? step.totalSec : null;

  return (
    <View style={{ gap: theme.space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={t(
            done ? 'gym.session.stepUndoneLabel' : 'gym.session.stepDoneLabel',
            {
              name: step.name,
            },
          )}
          accessibilityState={{ checked: done }}
          onPress={onToggleDone}
          style={{
            width: theme.touch.gym,
            height: theme.touch.gym,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.pill,
            borderWidth: theme.stroke.bold,
            borderColor: done ? theme.color.success : theme.color.border,
            backgroundColor: done ? theme.color.success : theme.color.surface,
          }}
        >
          <Check weight="bold" color={done ? theme.color.onPrimary : theme.color.textMuted} />
        </Pressable>
        <Text
          style={[
            theme.text('body'),
            {
              flex: 1,
              color: theme.color.text,
              ...(done ? { textDecorationLine: 'line-through' as const } : null),
            },
          ]}
        >
          {step.name}
        </Text>
      </View>
      {step.type === 'timed' && step.segments.length > 1 ? (
        <View style={{ paddingLeft: theme.touch.gym + theme.space[3] }}>
          {step.segments.map((segment) => (
            <Text
              key={segment.atSec}
              style={[theme.text('caption'), { color: theme.color.textMuted }]}
            >
              {`${formatClock(segment.atSec)} · ${segment.label}`}
            </Text>
          ))}
        </View>
      ) : null}
      {duration !== null && !done ? (
        <View style={{ paddingLeft: theme.touch.gym + theme.space[3], alignItems: 'flex-start' }}>
          <Button
            label={t(step.type === 'wait' ? 'gym.session.waitStart' : 'gym.session.timedStart', {
              time: formatClock(duration),
            })}
            icon={Play}
            variant="secondary"
            disabled={running}
            onPress={onStartTimer}
          />
        </View>
      ) : null}
    </View>
  );
}

type WarmupSectionProps = {
  steps: readonly NonSetsStep[];
  doneIds: ReadonlySet<string>;
  runningStepId: string | null;
  onToggleDone: (step: NonSetsStep) => void;
  onStartTimer: (step: NonSetsStep) => void;
};

/** Collapsible warm-up (HANDOFF §5): starts expanded until every step is done. */
export function WarmupSection({
  steps,
  doneIds,
  runningStepId,
  onToggleDone,
  onStartTimer,
}: WarmupSectionProps) {
  const theme = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(true);
  const done = steps.filter((step) => doneIds.has(step.id)).length;
  const Caret = expanded ? CaretUp : CaretDown;

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(expanded ? 'gym.session.warmupHide' : 'gym.session.warmupShow')}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={{
            minHeight: theme.touch.gym,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space[2],
          }}
        >
          <Text
            accessibilityRole="header"
            style={[theme.text('title-sm'), { flex: 1, color: theme.color.text }]}
          >
            {t('gym.session.warmup')}
          </Text>
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {t('gym.session.warmupProgress', { done, total: steps.length })}
          </Text>
          <Caret color={theme.color.text} />
        </Pressable>
        {expanded
          ? steps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                done={doneIds.has(step.id)}
                running={runningStepId === step.id}
                onToggleDone={() => onToggleDone(step)}
                onStartTimer={() => onStartTimer(step)}
              />
            ))
          : null}
      </View>
    </Card>
  );
}

type SessionSummaryCardProps = {
  sets: number;
  volumeKg: string;
  targets: string;
};

/** Post-workout summary (HANDOFF §5): sets, volume and targets met. */
export function SessionSummaryCard({ sets, volumeKg, targets }: SessionSummaryCardProps) {
  const theme = useTheme();
  const t = useT();
  const stat = (label: string, value: string) => (
    <View key={label} style={{ alignItems: 'center', flex: 1 }}>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[theme.text('title-md'), { color: theme.color.text }]}
      >
        {value}
      </Text>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
    </View>
  );
  return (
    <Card variant="celebrate">
      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-md'), { color: theme.color.text }]}
        >
          {t('gym.session.summaryTitle')}
        </Text>
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          {stat(t('gym.session.summarySets'), String(sets))}
          {stat(t('gym.session.summaryVolume'), volumeKg)}
          {stat(t('gym.session.summaryTargets'), targets)}
        </View>
      </View>
    </Card>
  );
}
