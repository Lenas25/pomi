// Ajustes: the one-line value shown under each entry ("Despiertas 07:00 · gym 3 días").
import type { Repositories } from '../db/repositories';
import { DEFAULT_SEDENTARY } from '../domain/sedentary/shouldNudge';
import type { Translate } from '../i18n';

import { FALLBACK_GOALS, loadScheduleSettings } from './schedule';

export type SettingsSummaryInput = {
  wake: string;
  /** Distinct weekdays with gym in the usual plan. */
  gymDays: number;
  waterGlassesRest: number;
  stepsGoal: number;
  notificationsOn: boolean;
  sedentaryOn: boolean;
};

export type SettingsSummary = {
  schedule: string;
  goals: string;
  notifications: string;
  sedentary: string;
};

export async function loadSettingsSummary(repos: Repositories): Promise<SettingsSummaryInput> {
  const [schedule, prefs, sedentary] = await Promise.all([
    loadScheduleSettings(repos),
    repos.settings.get('notificationPrefs'),
    repos.settings.get('sedentaryNudge'),
  ]);
  return {
    wake: schedule.wake,
    gymDays: new Set(schedule.plan.map((entry) => entry.weekday)).size,
    waterGlassesRest: schedule.goals.waterGlassesRest ?? FALLBACK_GOALS.waterGlassesRest,
    stepsGoal: schedule.goals.stepsGoal ?? FALLBACK_GOALS.stepsGoal,
    notificationsOn: prefs?.enabled !== false,
    sedentaryOn: (sedentary?.enabled ?? DEFAULT_SEDENTARY.enabled) && sedentary?.noPhone !== true,
  };
}

/** Pure: the summary lines for the loaded values. */
export function buildSettingsSummary(input: SettingsSummaryInput, t: Translate): SettingsSummary {
  return {
    schedule:
      input.gymDays > 0
        ? t('settings.schedule.value', { wake: input.wake, count: input.gymDays })
        : t('settings.schedule.valueNoGym', { wake: input.wake }),
    goals: t('settings.schedule.goalsValue', {
      glasses: input.waterGlassesRest,
      steps: input.stepsGoal,
    }),
    notifications: t(
      input.notificationsOn
        ? 'settings.myNotifications.entryOn'
        : 'settings.myNotifications.entryOff',
    ),
    sedentary: t(input.sedentaryOn ? 'sedentary.on' : 'sedentary.off'),
  };
}
