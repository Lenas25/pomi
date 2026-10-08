// Glue between the Hoy screen and the repositories. The decisions live in `src/domain/today`,
// `todayView.ts` and `todayActions.ts` (all tested); this file only wires them to React.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import { getRepositories } from '../db';
import type { ActivityKind } from '../domain/habits/activity';
import { clampText, TITLE_MAX, type PlannedChannel } from '../domain/notifications/buildUpcoming';
import { greetingKey, identityPhrase } from '../domain/today/identity';
import { buildTimeline, isAllDone, type TimelineEntry } from '../domain/today/timeline';
import { useT } from '../i18n';
import { requestNotificationSync } from '../notifications/sync';

import { entryTitle } from './labels';
import {
  markDone,
  postpone,
  skipToday,
  type ActionResult,
  type TodayActionDeps,
} from './todayActions';
import { loadTodayData, type TodayData } from './todayData';
import { progressFrom, todayStateFor } from './todayView';

const CLOCK_TICK_MS = 30_000;

export type TodayLoad =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: TodayData };

const CHANNEL_BY_KIND: Record<TimelineEntry['kind'], PlannedChannel> = {
  gym: 'gym',
  checkin: 'checkins',
  reminder: 'reminders',
  water: 'habits',
  steps: 'habits',
  habit: 'habits',
};

export function useToday() {
  const t = useT();
  const [load, setLoad] = useState<TodayLoad>({ status: 'loading' });
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);

  const reload = useCallback(async (): Promise<void> => {
    const ticket = (generation.current += 1);
    try {
      const data = await loadTodayData(getRepositories(), new Date());
      if (ticket === generation.current) {
        setNow(new Date());
        setLoad({ status: 'ready', data });
      }
    } catch (error) {
      if (__DEV__) console.error('Could not load Hoy', error);
      if (ticket === generation.current) setLoad({ status: 'error' });
    }
  }, []);

  // The "now" row follows the clock; coming back to the app also refreshes the data.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reload();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [reload]);

  const view = useMemo(() => {
    if (load.status !== 'ready') return null;
    const { data } = load;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const progress = progressFrom(data.agenda, data.facts, data.state, data.midnight);
    const entries = buildTimeline(data.agenda, nowMinutes, progress);
    const phrase = identityPhrase({ today: data.today, ...data.identity });
    const hasName = data.userName !== undefined;
    return {
      data,
      entries,
      allDone: isAllDone(entries),
      greeting: t(
        greetingKey(now.getHours(), hasName),
        hasName ? { name: data.userName ?? '' } : {},
      ),
      identity: t(phrase.key, phrase.params),
    };
  }, [load, now, t]);

  const deps = useCallback(
    (data: TodayData): TodayActionDeps => {
      const repos = getRepositories();
      return {
        today: data.today,
        now: Date.now,
        state: async () => todayStateFor(await repos.settings.get('todayState'), data.today),
        saveState: (state) => repos.settings.set('todayState', state),
        logCheck: (habitId, date) => repos.habitLogs.set(habitId, date, 1),
        addWater: (habitId, date) => repos.habitLogs.increment(habitId, date),
        scheduleSnooze: async (entry, at) => {
          if (!(await Notifications.getPermissionsAsync()).granted) return;
          await Notifications.scheduleNotificationAsync({
            identifier: `snooze:timeline:${entry.id}:${at}`,
            content: {
              title: clampText(entryTitle(entry, t), TITLE_MAX),
              body: t('notify.habit.body'),
              sound: true,
              data: {
                source: 'pomi',
                kind: entry.kind,
                channel: CHANNEL_BY_KIND[entry.kind],
                date: data.today,
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: at,
              channelId: CHANNEL_BY_KIND[entry.kind],
            },
          });
        },
      };
    },
    [t],
  );

  const navigate = (result: ActionResult) => {
    if (result.type !== 'navigate') return;
    if (result.target === 'gym') router.push('/gym');
    else if (result.target === 'habits') router.push('/habitos');
    else {
      router.push({
        pathname: '/checkin/[tipo]',
        params: { tipo: result.target === 'checkin:morning' ? 'morning' : 'night' },
      });
    }
  };

  const run = useCallback(
    async (action: (data: TodayData) => Promise<ActionResult>): Promise<void> => {
      if (load.status !== 'ready') return;
      try {
        const result = await action(load.data);
        if (result.type === 'changed') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          void requestNotificationSync('dataChanged');
          await reload();
        } else {
          navigate(result);
        }
      } catch (error) {
        if (__DEV__) console.error('Could not update Hoy', error);
        await reload();
      }
    },
    [load, reload],
  );

  return {
    load,
    view,
    reload,
    done: (entry: TimelineEntry) => run((data) => markDone(entry, deps(data))),
    postpone: (entry: TimelineEntry) => run((data) => postpone(entry, deps(data))),
    skip: (entry: TimelineEntry) => run((data) => skipToday(entry, deps(data))),
    open: (entry: TimelineEntry) => {
      // A reminder has no screen behind it.
      if (entry.kind === 'reminder') return;
      const target =
        entry.kind === 'gym'
          ? 'gym'
          : entry.kind === 'checkin'
            ? entry.id === 'checkin:morning'
              ? 'checkin:morning'
              : 'checkin:night'
            : 'habits';
      navigate({ type: 'navigate', target });
    },
    answerActivity: async (kind: ActivityKind): Promise<void> => {
      if (load.status !== 'ready') return;
      try {
        await getRepositories().activity.upsert(load.data.today, kind, 'manual');
        void requestNotificationSync('dataChanged');
      } finally {
        await reload();
      }
    },
  };
}
