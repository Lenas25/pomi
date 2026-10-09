import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type TextInput } from 'react-native';
import { CheckCircle } from 'phosphor-react-native';

import { useLocaleStore, useT, type Translate } from '../i18n';
import type { Language } from '../i18n/types';
import { formatClock } from '../timers/timerModel';
import { BottomSheet } from '../ui/BottomSheet';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

import { SetHeader, SetRow, type LoggedValues } from './SetRow';
import { nextFocusTarget, type SetField } from './setRowLayout';
import {
  formatKg,
  localizeTargetParams,
  targetSummary,
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
  /** One exercise per page: the "meta de hoy" gets a tinted block and a larger type. */
  prominentTarget?: boolean;
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
  prominentTarget = false,
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
  const summaryLine = targetSummary(view.target, bodyweight, language);
  // One concise line ("Hoy: 40 kg × 9"); the explanation waits behind "¿Por qué?".
  const mainLine = summaryLine
    ? t('gym.session.targetToday', {
        target: summaryLine.kg
          ? t('gym.session.targetWeightReps', { kg: summaryLine.kg, reps: summaryLine.reps })
          : t('gym.session.targetRepsOnly', { reps: summaryLine.reps }),
      })
    : (lines[0] ?? null);
  const whyLines = summaryLine ? lines : lines.slice(1);
  const [whyOpen, setWhyOpen] = useState(false);
  const [rirInfo, setRirInfo] = useState(false);
  const openRirInfo = useCallback(() => setRirInfo(true), [setRirInfo]);

  // Keyboard chaining: kg -> reps -> next pending set (`nextFocusTarget`).
  const inputs = useRef(new Map<string, TextInput>());
  const registerInput = useCallback((index: number, field: SetField, input: TextInput | null) => {
    const key = `${index}:${field}`;
    if (input) inputs.current.set(key, input);
    else inputs.current.delete(key);
  }, []);
  const onSubmitInput = useCallback(
    (index: number, field: SetField) => {
      const next = nextFocusTarget({ index, field }, step.sets, (i) => byIndex.has(i), bodyweight);
      if (next) inputs.current.get(`${next.index}:${next.field}`)?.focus();
    },
    [step.sets, bodyweight, byIndex],
  );

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

        {mainLine ? (
          <View
            testID="exercise-target"
            style={{
              gap: theme.space[1],
              padding: prominentTarget ? theme.space[3] : 0,
              borderRadius: theme.radius.md,
              backgroundColor: prominentTarget ? theme.section.gym.soft : theme.color.transparent,
            }}
          >
            <Text style={[theme.text('caption'), { color: theme.section.gym.text }]}>
              {t('gym.session.targetTitle')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
              <Text
                style={[
                  theme.text(prominentTarget ? 'title-sm' : 'body-strong'),
                  { color: theme.color.text, flex: 1 },
                ]}
              >
                {mainLine}
              </Text>
              {whyLines.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: whyOpen }}
                  accessibilityLabel={t(
                    whyOpen ? 'gym.session.targetWhyHide' : 'gym.session.targetWhy',
                  )}
                  onPress={() => setWhyOpen((open) => !open)}
                  hitSlop={theme.space[1]}
                  style={{
                    minHeight: theme.touch.min,
                    justifyContent: 'center',
                    paddingHorizontal: theme.space[2],
                  }}
                >
                  <Text style={[theme.text('body-strong'), { color: theme.section.gym.text }]}>
                    {t(whyOpen ? 'gym.session.targetWhyHide' : 'gym.session.targetWhy')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {whyOpen
              ? whyLines.map((line) => (
                  <Text
                    key={line}
                    accessibilityLiveRegion="polite"
                    style={[theme.text('body'), { color: theme.color.text }]}
                  >
                    {line}
                  </Text>
                ))
              : null}
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
          <SetHeader bodyweight={bodyweight} hold={step.holdSec !== undefined && !!handleHold} />
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
              registerInput={registerInput}
              onSubmitInput={onSubmitInput}
              repsReturnKey={
                nextFocusTarget(
                  { index: row.index, field: 'reps' },
                  step.sets,
                  (i) => byIndex.has(i),
                  bodyweight,
                )
                  ? 'next'
                  : 'done'
              }
              onRirInfo={openRirInfo}
            />
          ))}
        </View>
      </View>
      <BottomSheet
        visible={rirInfo}
        onClose={() => setRirInfo(false)}
        title={t('gym.session.rirInfoTitle')}
        closeLabel={t('gym.session.rirInfoClose')}
      >
        <Text style={[theme.text('body'), { color: theme.color.text }]}>
          {t('gym.session.rirInfoBody')}
        </Text>
      </BottomSheet>
    </Card>
  );
}

/** Memoized: re-renders only when its own sets (or the stable handlers) change. */
export const ExerciseCard = memo(ExerciseCardBase);
