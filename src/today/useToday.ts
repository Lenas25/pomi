// Glue between the Hoy screen and the repositories. The decisions live in `src/domain/today`,
// `todayView.ts` and `todayActions.ts` (all tested); this file only wires them to React.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';

import { getDatabase, getRepositories } from '../db';
import type { ActivityKind } from '../domain/habits/activity';
import { type PlannedChannel } from '../domain/notifications/buildUpcoming';
import { greetingKey, identityPhrase } from '../domain/today/identity';
import { dayKeyFor, minutesIntoDay } from '../domain/time';
import { buildTimeline, isAllDone, type TimelineEntry } from '../domain/today/timeline';
import { useLocaleStore, useT } from '../i18n';
import { insightTexts } from '../insights/text';
import { runWeeklyInsights } from '../insights/run';
import { runDailySuggestions } from '../suggestions/run';
import { useSuggestionActions } from '../suggestions/useSuggestionActions';
import { suggestionTexts } from '../suggestions/text';
import { requestNotificationSync } from '../notifications/sync';

import { isBedtimeEntry, snoozeContent } from './labels';
import {
  markDone,
  postpone,
  skipToday,
  type ActionResult,
  type TodayActionDeps,
} from './todayActions';
import { loadTodayData, type TodayData } from './todayData';
import {
  progressFrom,
  resolveSessionInsight,
  settledSnoozeIds,
  todayStateFor,
  type SessionInsight,
} from './todayView';

const SNOOZE_PREFIX = 'snooze:timeline:';

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

/** Cancels the postponed reminders (`snooze:timeline:<entryId>:<at>`) of one row. */
async function cancelTimelineSnoozes(entryId: string): Promise<void> {
  const prefix = `${SNOOZE_PREFIX}${entryId}:`;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(prefix))
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

export function useToday() {
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  const [load, setLoad] = useState<TodayLoad>({ status: 'loading' });
  const [now, setNow] = useState(() => new Date());
  const generation = useRef(0);
  const loadedDay = useRef<string | undefined>(undefined);
  // The insight card of this session: once shown it is marked seen, and the next load no longer
  // returns it, but it must stay on Hoy until the app is closed (it would vanish under the reader).
  const sessionInsight = useRef<SessionInsight<NonNullable<TodayData['insight']>> | undefined>(
    undefined,
  );

  const reload = useCallback(async (): Promise<void> => {
    const ticket = (generation.current += 1);
    try {
      // Once per day (guarded in the engine); a failure here must never block Hoy.
      await runDailySuggestions(getDatabase(), getRepositories()).catch(() => []);
      await runWeeklyInsights(getDatabase(), getRepositories()).catch(() => []);
      const loaded = await loadTodayData(getRepositories(), new Date());
      const { remembered, keep } = resolveSessionInsight(sessionInsight.current, {
        day: loaded.today,
        insight: loaded.insight,
        hasSuggestion: Boolean(loaded.suggestion),
      });
      sessionInsight.current = remembered;
      const data: TodayData = keep
        ? { ...loaded, insight: keep, companionCard: undefined }
        : loaded;
      if (ticket === generation.current) {
        setNow(new Date());
        loadedDay.current = data.today;
        setLoad({ status: 'ready', data });
        // Done elsewhere (Hábitos, a notification action): the postponed reminder must not come back.
        for (const id of settledSnoozeIds(data.agenda, data.facts, data.state)) {
          void cancelTimelineSnoozes(id).catch(() => undefined);
        }
      }
    } catch (error) {
      if (__DEV__) console.error('Could not load Hoy', error);
      if (ticket === generation.current) setLoad({ status: 'error' });
    }
  }, []);

  // The "now" row follows the clock; coming back to the app also refreshes the data.
  useEffect(() => {
    const interval = setInterval(() => {
      const tick = new Date();
      setNow(tick);
      // The logical day rolled over (04:00) while the app stayed open: load the new day.
      if (loadedDay.current !== undefined && dayKeyFor(tick) !== loadedDay.current) void reload();
    }, CLOCK_TICK_MS);
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
    const nowMinutes = minutesIntoDay(now);
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
      suggestion: data.suggestion
        ? { id: data.suggestion.id, ...suggestionTexts(data.suggestion.payload, t, language) }
        : null,
      insight: data.insight
        ? { id: data.insight.id, ...insightTexts(data.insight, t, language) }
        : null,
    };
  }, [load, now, t, language]);

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
          const { title, body } = snoozeContent(entry, t);
          await Notifications.scheduleNotificationAsync({
            identifier: `${SNOOZE_PREFIX}${entry.id}:${at}`,
            content: {
              title,
              body,
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
        cancelSnoozes: cancelTimelineSnoozes,
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

  const suggestions = useSuggestionActions(reload);

  return {
    load,
    view,
    reload,
    suggestionBusy: suggestions.busy,
    notice: suggestions.notice,
    clearNotice: suggestions.clearNotice,
    acceptSuggestion: suggestions.accept,
    declineSuggestion: suggestions.decline,
    done: (entry: TimelineEntry) => run((data) => markDone(entry, deps(data))),
    postpone: (entry: TimelineEntry) => run((data) => postpone(entry, deps(data))),
    skip: (entry: TimelineEntry) => run((data) => skipToday(entry, deps(data))),
    open: (entry: TimelineEntry) => {
      // The bedtime reminder opens the sleep-cycle calculator; any other reminder has no screen.
      if (isBedtimeEntry(entry)) {
        router.push('/ciclos-sueno');
        return;
      }
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
    /** Marks the shown insight as seen. No reload: the card stays until Hoy is loaded again. */
    markInsightSeen: async (id: number): Promise<void> => {
      try {
        await getRepositories().insights.markSeen(id, Date.now());
      } catch (error) {
        if (__DEV__) console.warn('Could not mark the insight as seen', error);
      }
    },
    dismissCompanionCard: async (): Promise<void> => {
      if (load.status !== 'ready') return;
      try {
        await getRepositories().settings.set('companionCardDismissed', load.data.today);
      } finally {
        await reload();
      }
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
