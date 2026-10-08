import { format, parseISO, subDays } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { HISTORY_DAYS, type HabitsData } from './habitsView';

export function dayKey(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/** Everything the Habits tab shows, read in one pass (all local, so this is near instant). */
export async function loadHabitsData(repos: Repositories, today: string): Promise<HabitsData> {
  const historyFrom = format(subDays(parseISO(today), HISTORY_DAYS - 1), 'yyyy-MM-dd');
  const startedOn = await repos.settings.get('startedOn');
  // Steps from the start of the baseline week so the plan can fix the goal from its first 7 days.
  const stepsFrom = startedOn !== undefined && startedOn < historyFrom ? startedOn : historyFrom;

  const [
    modules,
    profile,
    gymDays,
    goals,
    stepsEstimate,
    prefs,
    logs,
    steps,
    notes,
    activity,
    morning,
    night,
  ] = await Promise.all([
    repos.templates.listModules(),
    repos.profile.get(),
    repos.settings.get('gymDays'),
    repos.settings.get('goals'),
    repos.settings.get('stepsEstimate'),
    repos.settings.get('checkinPrefs'),
    repos.habitLogs.inRange(historyFrom, today),
    repos.steps.inRange(stepsFrom, today),
    repos.foodNotes.inRange(historyFrom, today),
    repos.activity.get(today),
    repos.checkins.get(today, 'morning'),
    repos.checkins.get(today, 'night'),
  ]);

  return {
    modules,
    profile: { weightKg: profile?.weightKg ?? undefined, workType: profile?.workType ?? undefined },
    gymDays: gymDays ?? [],
    goals: goals ?? {},
    startedOn,
    stepsEstimate,
    checkinPrefs: { morning: prefs?.morning ?? true, night: prefs?.night ?? true },
    habitLogs: logs,
    steps,
    foodNotes: notes,
    activityToday: activity?.kind,
    checkinsDoneToday: { morning: morning !== undefined, night: night !== undefined },
  };
}
