// Pure view model for the Habits tab: everything is derived from `HabitsData` (loaded in
// `habitsData.ts`) and today's date key. No clock, no I/O.
import { consistency, doneDates, type Consistency } from '../domain/habits/consistency';
import { stepsPlan, type StepsPlan } from '../domain/habits/stepsPlan';
import { waterTargetFor, type WaterTarget } from '../domain/habits/waterTarget';
import { evaluateOnlyIf } from '../domain/agenda/conditions';
import type { CheckinPrefs, GymDays, ModuleTemplate } from '../templates/schema';
import type { StepsSourceId } from '../health/types';

/** Rows loaded for the last `HISTORY_DAYS` days. */
export const HISTORY_DAYS = 14;

export type HabitsData = {
  modules: readonly { active: boolean; template: ModuleTemplate }[];
  profile: { weightKg?: number | undefined; workType?: string | undefined };
  gymDays: GymDays;
  goals: { waterGlassesRest?: number; waterGlassesGym?: number; stepsGoal?: number };
  startedOn?: string | undefined;
  stepsEstimate?: number | undefined;
  checkinPrefs: Pick<CheckinPrefs, 'morning' | 'night'>;
  /** `habit_logs` of the history window. */
  habitLogs: readonly { habitId: string; date: string; value: number }[];
  /** `steps_daily` from the start of the baseline week (or the history window) to today. */
  steps: readonly { date: string; steps: number; source: StepsSourceId }[];
  foodNotes: readonly { date: string; text: string }[];
  activityToday?: 'gym' | 'walk' | 'none' | undefined;
  checkinsDoneToday: { morning: boolean; night: boolean };
};

export type WaterView = {
  habitId: string;
  name: string;
  glassMl: number;
  value: number;
  target: WaterTarget | null;
  consistency: Consistency | null;
};

export type StepsView = {
  habitId: string;
  name: string;
  steps: number;
  source: StepsSourceId | null;
  plan: StepsPlan;
  consistency: Consistency | null;
};

export type CheckView = {
  habitId: string;
  name: string;
  how?: string | undefined;
  done: boolean;
  consistency: Consistency;
};

export type FoodView = { prompt: string; note: string; consistency: Consistency };

export type HabitsView = {
  water: WaterView | null;
  steps: StepsView | null;
  checks: CheckView[];
  food: FoodView | null;
  checkins: {
    morning: { enabled: boolean; done: boolean };
    night: { enabled: boolean; done: boolean };
  };
  activityToday: 'gym' | 'walk' | 'none' | undefined;
};

export function buildHabitsView(data: HabitsData, today: string): HabitsView {
  const habits = data.modules
    .filter((module) => module.active)
    .flatMap((module) => module.template.habits ?? []);
  const profile = { workType: data.profile.workType };

  const logsFor = (habitId: string) =>
    data.habitLogs
      .filter((log) => log.habitId === habitId)
      .map((log) => ({ date: log.date, value: log.value }));
  const valueToday = (habitId: string) =>
    data.habitLogs.find((log) => log.habitId === habitId && log.date === today)?.value ?? 0;

  let water: WaterView | null = null;
  let steps: StepsView | null = null;
  const checks: CheckView[] = [];

  for (const habit of habits) {
    if (!evaluateOnlyIf(habit.onlyIf, profile)) continue;

    if (habit.type === 'counter' && typeof habit.target === 'object') {
      if (habit.target.formula === 'water' && water === null) {
        const glassMl = habit.glassMl;
        const targetFor = (date: string) =>
          waterTargetFor(date, {
            weightKg: data.profile.weightKg,
            gymDays: data.gymDays,
            glassMl,
            goals: data.goals,
          });
        const target = targetFor(today);
        const done = doneDates(logsFor(habit.id), (date) => targetFor(date)?.glasses ?? null);
        water = {
          habitId: habit.id,
          name: habit.name,
          glassMl: target?.glassMl ?? glassMl ?? 250,
          value: valueToday(habit.id),
          target,
          // Without a goal there is nothing to be consistent against.
          consistency: target ? consistency(today, done) : null,
        };
      } else if (habit.target.formula === 'steps' && steps === null) {
        const plan = stepsPlan({
          today,
          startedOn: data.startedOn,
          history: data.steps,
          estimate: data.stepsEstimate,
          editedGoal: data.goals.stepsGoal,
        });
        const todayRow = data.steps.find((row) => row.date === today);
        const goal = plan.goal;
        steps = {
          habitId: habit.id,
          name: habit.name,
          steps: todayRow?.steps ?? 0,
          source: todayRow?.source ?? null,
          plan,
          consistency:
            plan.phase === 'active' && goal !== null
              ? consistency(
                  today,
                  doneDates(
                    data.steps.map((row) => ({ date: row.date, value: row.steps })),
                    () => goal,
                  ),
                )
              : null,
        };
      }
      continue;
    }

    if (habit.type === 'check') {
      checks.push({
        habitId: habit.id,
        name: habit.name,
        how: habit.how,
        done: valueToday(habit.id) >= 1,
        consistency: consistency(
          today,
          doneDates(logsFor(habit.id), () => 1),
        ),
      });
    }
  }

  const notes = data.modules.find((module) => module.active && module.template.notes)?.template
    .notes;
  const food: FoodView | null = notes
    ? {
        prompt: notes.prompt,
        note: data.foodNotes.find((note) => note.date === today)?.text ?? '',
        consistency: consistency(
          today,
          data.foodNotes.map((note) => note.date),
        ),
      }
    : null;

  return {
    water,
    steps,
    checks,
    food,
    checkins: {
      morning: { enabled: data.checkinPrefs.morning, done: data.checkinsDoneToday.morning },
      night: { enabled: data.checkinPrefs.night, done: data.checkinsDoneToday.night },
    },
    activityToday: data.activityToday,
  };
}

/**
 * Water drop tap: tapping an empty drop fills up to it; tapping the LAST filled drop empties it;
 * tapping an earlier filled drop sets the count to that drop (to correct a mistake).
 */
export function nextWaterValue(current: number, tapped: number): number {
  if (tapped === current) return Math.max(0, current - 1);
  return Math.max(0, tapped);
}
