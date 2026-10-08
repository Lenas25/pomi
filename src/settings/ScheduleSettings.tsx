import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { getRepositories } from '../db';
import { bedtimeFor } from '../domain/formulas/sleep';
import { LIMITS } from '../domain/onboarding/draft';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';
import type { GymPlan } from '../templates/schema';
import { Card } from '../ui/Card';
import { NumberStepper, TimeStepper } from '../ui/Stepper';
import { useTheme } from '../ui/theme';
import { WEEK_ORDER, WeekdayChips } from '../ui/WeekdayChips';

import {
  loadScheduleSettings,
  planForDays,
  saveAnchors,
  saveGoals,
  saveGymPlan,
  type ScheduleSettings as Schedule,
} from './schedule';

const LONG_DAY = [
  'weekdays.long.d0',
  'weekdays.long.d1',
  'weekdays.long.d2',
  'weekdays.long.d3',
  'weekdays.long.d4',
  'weekdays.long.d5',
  'weekdays.long.d6',
] as const;

/** Shown when a goal was never set (the person can still move it from here). */
const FALLBACK_GOALS = { waterGlassesRest: 8, waterGlassesGym: 10, stepsGoal: 7000 } as const;
const SLEEP_STEP_H = 0.5;
const STEPS_STEP = 500;

type WriteKey = 'anchors' | 'gym' | 'goals';

/** Ajustes > "Horarios y gym": wake time, sleep target, gym days with a time per day, goals. */
export function ScheduleSettings() {
  const t = useT();
  const theme = useTheme();
  const [state, setState] = useState<Schedule | null>(null);
  const [failed, setFailed] = useState(false);
  // One write at a time; per key only the latest value is written (fast stepper taps never race).
  const pending = useRef(new Map<WriteKey, () => Promise<void>>());
  const writing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadScheduleSettings(getRepositories())
      .then((loaded) => {
        if (!cancelled) setState(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) return null;

  const flush = async () => {
    if (writing.current) return;
    writing.current = true;
    try {
      let wrote = false;
      for (let next = firstPending(); next; next = firstPending()) {
        try {
          await next();
          wrote = true;
        } catch {
          setFailed(true);
        }
      }
      if (wrote) void requestNotificationSync('settingsChanged');
    } finally {
      writing.current = false;
    }
  };

  const firstPending = (): (() => Promise<void>) | undefined => {
    const entry = pending.current.entries().next();
    if (entry.done) return undefined;
    pending.current.delete(entry.value[0]);
    return entry.value[1];
  };

  const queue = (key: WriteKey, job: () => Promise<void>) => {
    setFailed(false);
    pending.current.set(key, job);
    void flush();
  };

  const setAnchors = (patch: { wake?: string; sleepTargetH?: number }) => {
    const next = { ...state, ...patch, anchors: { ...state.anchors, ...patch } };
    setState(next);
    queue('anchors', () =>
      saveAnchors(getRepositories(), { wake: next.wake, sleepTargetH: next.sleepTargetH }),
    );
  };

  const setPlan = (plan: GymPlan) => {
    setState({ ...state, plan });
    queue('gym', () => saveGymPlan(getRepositories(), plan));
  };

  const setGoal = (patch: Schedule['goals']) => {
    const goals = { ...state.goals, ...patch };
    setState({ ...state, goals });
    queue('goals', () => saveGoals(getRepositories(), goals));
  };

  // Monday first; the index into `state.plan` identifies a session (a day may hold two).
  const weekPosition = (weekday: number) =>
    WEEK_ORDER.indexOf(weekday as (typeof WEEK_ORDER)[number]);
  const ordered = state.plan
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => weekPosition(a.weekday) - weekPosition(b.weekday));

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {t('settings.schedule.title')}
        </Text>
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('settings.schedule.hint')}
        </Text>
        <TimeStepper
          label={t('settings.schedule.wake')}
          value={state.wake}
          onChange={(wake) => setAnchors({ wake })}
        />
        <NumberStepper
          label={t('settings.schedule.sleepTarget')}
          value={state.sleepTargetH}
          step={SLEEP_STEP_H}
          min={LIMITS.sleepTargetH.min}
          max={LIMITS.sleepTargetH.max}
          format={(hours) => t('settings.schedule.sleepTargetValue', { hours })}
          onChange={(sleepTargetH) => setAnchors({ sleepTargetH })}
        />
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('settings.schedule.bed', { time: bedtimeFor(state.wake, state.sleepTargetH) })}
        </Text>
        <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
          {t('settings.schedule.gymDays')}
        </Text>
        <WeekdayChips
          selected={[...new Set(state.plan.map((entry) => entry.weekday))]}
          onChange={(days) => setPlan(planForDays(state.plan, days, state.anchors))}
          accessibilityLabel={t('settings.schedule.gymDays')}
        />
        {ordered.map((entry) => (
          <TimeStepper
            key={`${entry.weekday}-${entry.index}`}
            label={t('settings.schedule.gymTime', {
              day: t(LONG_DAY[entry.weekday] ?? LONG_DAY[0]),
            })}
            value={entry.time}
            onChange={(time) =>
              setPlan(
                state.plan.map((item, index) => (index === entry.index ? { ...item, time } : item)),
              )
            }
          />
        ))}
        <Text
          accessibilityRole="header"
          style={[theme.text('body-strong'), { color: theme.color.text }]}
        >
          {t('settings.schedule.goalsTitle')}
        </Text>
        <NumberStepper
          label={t('settings.schedule.waterRest')}
          value={state.goals.waterGlassesRest ?? FALLBACK_GOALS.waterGlassesRest}
          step={1}
          min={1}
          max={30}
          format={(count) => t('settings.schedule.glassesValue', { count })}
          onChange={(waterGlassesRest) => setGoal({ waterGlassesRest })}
        />
        <NumberStepper
          label={t('settings.schedule.waterGym')}
          value={state.goals.waterGlassesGym ?? FALLBACK_GOALS.waterGlassesGym}
          step={1}
          min={1}
          max={30}
          format={(count) => t('settings.schedule.glassesValue', { count })}
          onChange={(waterGlassesGym) => setGoal({ waterGlassesGym })}
        />
        <NumberStepper
          label={t('settings.schedule.steps')}
          value={state.goals.stepsGoal ?? FALLBACK_GOALS.stepsGoal}
          step={STEPS_STEP}
          min={STEPS_STEP}
          max={LIMITS.steps.max}
          format={(count) => t('settings.schedule.stepsValue', { count })}
          onChange={(stepsGoal) => setGoal({ stepsGoal })}
        />
        {failed ? (
          <Text
            accessibilityRole="alert"
            style={[theme.text('caption'), { color: theme.color.error }]}
          >
            {t('settings.schedule.saveFailed')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
