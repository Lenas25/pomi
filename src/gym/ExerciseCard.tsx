import { memo, useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { CheckCircle } from 'phosphor-react-native';

import { useLocaleStore, useT, type Translate } from '../i18n';
import type { Language } from '../i18n/types';
import { formatClock } from '../timers/timerModel';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

import { SetRow, type LoggedValues } from './SetRow';
import {
  formatKg,
  localizeTargetParams,
  resolveSetValues,
  type ExerciseView,
  type SetInputs,
  type SetsStep,
  type StoredSet,
} from './sessionViewModel';
import { useTemplateText } from '../i18n/templateText';
import { localizedText } from '../templates/localized';

type ExerciseCardProps = {
  step: SetsStep;
  view: ExerciseView;
  /** Sets already logged in the current session for this step. */
  logs: readonly StoredSet[];
  /**
   * The handlers take the step as first argument so the screen can pass ONE stable function to
   * every card (the card is memoized and only re-renders when its own sets change).
   */
  onSetDone: (
    step: SetsStep,
    setIndex: number,
    values: { weightKg: number | null; reps: number | null; rir: number | null },
  ) => void;
  onSetUndone: (step: SetsStep, setIndex: number) => void;
  onRir: (step: SetsStep, setIndex: number, rir: number | null) => void;
  /** `holdSec` exercises: starts the hold timer of that set. */
  onHold?: (step: SetsStep, setIndex: number) => void;
};

function lastTimeText(
  view: ExerciseView,
  bodyweight: boolean,
  t: Translate,
  language: Language,
): string | null {
  if (!view.lastTime) return null;
  return view.lastTime.sets
    .map((set) =>
      bodyweight || set.weightKg === null
        ? t('gym.session.lastTimeBodyweight', { reps: set.reps ?? 0 })
        : t('gym.session.lastTimeSet', {
            kg: formatKg(set.weightKg, language),
            reps: set.reps ?? 0,
          }),
    )
    .join(' · ');
}

/** The "Meta de hoy" lines: the reason from the domain, or the hint / manual target. */
function targetLines(view: ExerciseView, step: SetsStep, t: Translate, language: Language) {
  const { target } = view;
  if (target.kind === 'manual') {
    return [t('gym.session.targetManual', { reps: localizedText(step.reps, language) })];
  }
  return target.reason
    ? [t(target.reason.key, localizeTargetParams(target.reason.params, language))]
    : target.hint.map((message) => t(message.key, message.params));
}

/**
 * Exercise card (HANDOFF §4): title, chips (sets × reps, rest, weight hint), the highlighted
 * "Meta de hoy", "la última vez" and one SetRow per planned set.
 */
function ExerciseCardBase({
  step,
  view,
  logs,
  onSetDone,
  onSetUndone,
  onRir,
  onHold,
}: ExerciseCardProps) {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const language = useLocaleStore((state) => state.language);
  const bodyweight = step.bodyweight === true;
  const byIndex = useMemo(() => new Map(logs.map((log) => [log.setIndex, log])), [logs]);
  const doneCount = Array.from({ length: step.sets }, (_, i) => byIndex.has(i)).filter(
    Boolean,
  ).length;
  const complete = doneCount === step.sets;
  const firstPending = Array.from({ length: step.sets }, (_, i) => i).find((i) => !byIndex.has(i));
  const lastTime = lastTimeText(view, bodyweight, t, language);
  const lines = targetLines(view, step, t, language);

  // One entry per planned set; objects keep their identity while the sets do not change.
  const rows = useMemo(
    () =>
      Array.from({ length: step.sets }, (_, index) => {
        const log = byIndex.get(index);
        const previous = view.previous[index] ?? { weightKg: null, reps: null };
        const logged: LoggedValues | null = log
          ? { weightKg: log.weightKg, reps: log.reps, rir: log.rir }
          : null;
        return {
          index,
          previous,
          placeholder: {
            weightKg: previous.weightKg ?? view.target.weightKg,
            reps: previous.reps ?? view.targetReps(index),
          },
          logged,
          done: log !== undefined,
        };
      }),
    [byIndex, step.sets, view],
  );

  const handleToggle = useCallback(
    (index: number, inputs: SetInputs & { rir: number | null }) => {
      const row = rows[index];
      if (!row) return;
      if (row.done) {
        onSetUndone(step, index);
        return;
      }
      const values = resolveSetValues(inputs, {
        previous: row.previous,
        targetWeightKg: view.target.weightKg,
        targetReps: view.targetReps(index),
        bodyweight,
      });
      onSetDone(step, index, { ...values, rir: inputs.rir });
    },
    [rows, onSetDone, onSetUndone, step, view, bodyweight],
  );
  const handleRir = useCallback(
    (index: number, rir: number | null) => onRir(step, index, rir),
    [onRir, step],
  );
  const handleHold = useMemo(
    () => (onHold ? (index: number) => onHold(step, index) : undefined),
    [onHold, step],
  );

  const chip = (label: string, key: string) => (
    <View
      key={key}
      style={{
        paddingHorizontal: theme.space[3],
        paddingVertical: theme.space[1],
        borderRadius: theme.radius.pill,
        backgroundColor: theme.color.brandSoft,
      }}
    >
      <Text style={[theme.text('caption'), { color: theme.color.text }]}>{label}</Text>
    </View>
  );

  return (
    <Card variant={complete ? 'highlight' : 'default'}>
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            style={[theme.text('title-sm'), { flex: 1, color: theme.color.text }]}
          >
            {text(step.name)}
          </Text>
          {complete ? (
            <View accessible accessibilityLabel={t('gym.session.exerciseComplete')}>
              <CheckCircle weight="fill" color={theme.color.success} />
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {chip(t('gym.session.chipSets', { sets: step.sets, reps: text(step.reps) }), 'sets')}
          {chip(t('gym.session.chipRest', { time: formatClock(step.restSec) }), 'rest')}
          {step.weightHint
            ? chip(t('gym.session.chipWeight', { hint: text(step.weightHint) }), 'weight')
            : null}
        </View>

        {lines.length > 0 ? (
          <View style={{ gap: theme.space[1] }}>
            <Text style={[theme.text('caption'), { color: theme.color.energyText }]}>
              {t('gym.session.targetTitle')}
            </Text>
            {lines.map((line) => (
              <Text
                key={line}
                style={[theme.text('body-strong'), { color: theme.color.energyText }]}
              >
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {view.target.suggestions.map((message) => (
          <Text key={message.key} style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {t(message.key, localizeTargetParams(message.params, language))}
          </Text>
        ))}
        {lastTime ? (
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {`${t('gym.session.lastTime')}: ${lastTime}`}
          </Text>
        ) : null}

        <View style={{ gap: theme.space[1] }}>
          {rows.map((row) => (
            <SetRow
              key={row.index}
              index={row.index}
              exerciseName={text(step.name)}
              bodyweight={bodyweight}
              status={row.done ? 'done' : row.index === firstPending ? 'current' : 'pending'}
              previous={row.previous}
              placeholder={row.placeholder}
              logged={row.logged}
              {...(step.holdSec !== undefined && handleHold
                ? { holdSec: step.holdSec, onHold: handleHold }
                : {})}
              onToggle={handleToggle}
              onRir={handleRir}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

/** Memoized: re-renders only when its own sets (or the stable handlers) change. */
export const ExerciseCard = memo(ExerciseCardBase);
