// Reads everything `buildUpcoming` needs from the repositories (all local, near instant).
import type { Repositories } from '../db/repositories';
import type { UpcomingState } from '../domain/notifications/buildUpcoming';
import { waterTargetFor } from '../domain/habits/waterTarget';
import type { ModuleBody } from '../templates/schema';

export type NotificationPlan = {
  /** Master switch: `false` means nothing should stay scheduled. */
  enabled: boolean;
  state: UpcomingState;
};

export async function loadNotificationPlan(
  repos: Repositories,
  today: string,
): Promise<NotificationPlan> {
  const [
    modules,
    profile,
    anchors,
    gymDays,
    checkinPrefs,
    goals,
    prefs,
    complete,
    activity,
    sessions,
    morning,
    night,
    habitLogs,
  ] = await Promise.all([
    repos.templates.listModules(),
    repos.profile.get(),
    repos.settings.get('anchors'),
    repos.settings.get('gymDays'),
    repos.settings.get('checkinPrefs'),
    repos.settings.get('goals'),
    repos.settings.get('notificationPrefs'),
    repos.settings.get('onboardingComplete'),
    repos.activity.get(today),
    repos.workouts.sessionsInRange(today, today),
    repos.checkins.get(today, 'morning'),
    repos.checkins.get(today, 'night'),
    repos.habitLogs.forDate(today),
  ]);

  const active = modules.filter((module) => module.active).map((module) => module.template);
  const gymDone = sessions.some(
    (entry) => entry.session.finishedAt !== null && entry.sets.length > 0,
  );

  // Water reminders stop for today once the goal is reached.
  const doneAgendaIds: string[] = [];
  const glassesBy = new Map(habitLogs.map((log) => [log.habitId, log.value]));
  for (const module of active) {
    for (const habit of module.habits ?? []) {
      if (habit.type !== 'counter' || typeof habit.target !== 'object') continue;
      if (habit.target.formula !== 'water') continue;
      const target = waterTargetFor(today, {
        weightKg: profile?.weightKg ?? undefined,
        gymDays: gymDays ?? [],
        glassMl: habit.glassMl,
        goals: goals ?? {},
      });
      if (target && (glassesBy.get(habit.id) ?? 0) >= target.glasses) {
        doneAgendaIds.push(`water:${module.id}:${habit.id}`);
      }
    }
  }

  const state: UpcomingState = {
    profile: { weightKg: profile?.weightKg ?? undefined, workType: profile?.workType ?? undefined },
    anchors: anchors ?? {},
    gymDays: gymDays ?? [],
    checkinPrefs: { morning: checkinPrefs?.morning ?? true, night: checkinPrefs?.night ?? true },
    modules: active as readonly ModuleBody[],
    surveyEnabled: prefs?.survey ?? true,
    ...(prefs?.surveyTime !== undefined ? { surveyTime: prefs.surveyTime } : {}),
    weeklyReviewEnabled: prefs?.weeklyReview ?? true,
    today: {
      activityLogged: activity !== undefined || gymDone,
      gymDone,
      checkinsDone: { morning: morning !== undefined, night: night !== undefined },
      doneAgendaIds,
    },
  };
  // Before the onboarding finishes there is no plan to remind about.
  return { enabled: (prefs?.enabled ?? true) && complete === true, state };
}
