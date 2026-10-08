// Real dependencies of the sedentary nudge: settings, Health Connect and expo-notifications. Runs
// from the periodic background job (`backgroundTasks.ts`), so it must not assume any UI.
import * as Notifications from 'expo-notifications';

import { getRepositories } from '../db';
import { resolveAnchors } from '../domain/agenda/buildAgenda';
import { t } from '../i18n';
import { getHealthAdapter } from '../health';
import { registerCategories } from '../notifications/categories';
import { CHANNEL_IDS, SOURCE } from '../notifications/constants';
import { dayKeyFor } from '../domain/time';

import { resolveSedentaryConfig, runSedentaryNudge } from './runNudge';

/** The pausa activa habit of `habitos.json` (only present for people who sit at work). */
const PAUSE_HABIT_ID = 'pausa-activa';

async function showNudge(): Promise<void> {
  const repos = getRepositories();
  const modules = (await repos.templates.listModules()).filter((module) => module.active);
  const hasHabit = modules.some((module) =>
    (module.template.habits ?? []).some((habit) => habit.id === PAUSE_HABIT_ID),
  );
  // The category (and its "Hecho" action) is registered here too: the headless run has no UI setup.
  await registerCategories(t);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: t('sedentary.notification.title'),
      body: t('sedentary.notification.body'),
      sound: true,
      categoryIdentifier: 'pomi_pause',
      data: {
        source: SOURCE,
        kind: 'sedentary',
        channel: 'habits',
        date: dayKeyFor(new Date()),
        ...(hasHabit ? { habitId: PAUSE_HABIT_ID } : {}),
      },
    },
    trigger: { channelId: CHANNEL_IDS.habits },
  });
}

export function runSedentaryNudgeForReal() {
  const repos = getRepositories();
  const adapter = getHealthAdapter();
  return runSedentaryNudge({
    now: () => new Date(),
    config: async () => resolveSedentaryConfig(await repos.settings.get('sedentaryNudge')),
    hasPermission: async () =>
      (await adapter.getAvailability()) === 'available' &&
      (await adapter.hasPermission()) &&
      (await adapter.hasBackgroundPermission()),
    anchors: async () => {
      const resolved = resolveAnchors(
        (await repos.settings.get('anchors')) ?? {},
        (await repos.settings.get('planShifts')) ?? {},
      );
      return { wakeMin: resolved.wake, bedMin: resolved.bed };
    },
    history: () => repos.settings.get('sedentaryHistory'),
    saveHistory: (history) => repos.settings.set('sedentaryHistory', history),
    readSteps: (windowMin, nowMs) => adapter.readRecentSteps(windowMin, nowMs),
    notify: showNudge,
  });
}
