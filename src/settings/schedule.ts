// Ajustes > "Horarios y gym": reads and writes the wake time, the sleep target, the per-day gym
// plan and the goals. Every write goes through the settings repository, so the plan keys stamp
// `gymDaysChangedOn` / `goalsChangedOn` themselves.
import type { Repositories } from '../db/repositories';
import type { SettingsValue } from '../db/repositories/settings';
import {
  effectiveGymPlan,
  gymDaysFromPlan,
  sortGymPlan,
  type EffectiveGymDay,
} from '../domain/gym/gymPlan';
import {
  DEFAULT_GYM_TIMES,
  DEFAULT_SLEEP_TARGET_H,
  DEFAULT_WAKE,
} from '../domain/onboarding/draft';
import type { Anchors, GymPlan } from '../templates/schema';

type StoredGoals = SettingsValue<'goals'>;

export type ScheduleSettings = {
  wake: string;
  sleepTargetH: number;
  plan: GymPlan;
  anchors: Anchors;
  goals: StoredGoals;
};

export async function loadScheduleSettings(repos: Repositories): Promise<ScheduleSettings> {
  const [anchors, gymDays, gymPlan, goals] = await Promise.all([
    repos.settings.get('anchors'),
    repos.settings.get('gymDays'),
    repos.settings.get('gymPlan'),
    repos.settings.get('goals'),
  ]);
  return {
    wake: anchors?.wake ?? DEFAULT_WAKE,
    sleepTargetH: anchors?.sleepTargetH ?? DEFAULT_SLEEP_TARGET_H,
    plan: withTimes(effectiveGymPlan({ gymPlan, gymDays, anchors }), anchors ?? {}),
    anchors: anchors ?? {},
    goals: goals ?? {},
  };
}

/** A migrated day without a slot anchor gets the default time, so the editor always has one. */
function withTimes(plan: readonly EffectiveGymDay[], anchors: Anchors): GymPlan {
  const fallback = anchors.gymEvening ?? anchors.gymMorning ?? DEFAULT_GYM_TIMES.gymEvening;
  return plan.map((entry) => ({ weekday: entry.weekday, time: entry.time ?? fallback }));
}

/** Stores the plan AND its weekday projection (`gymDays`, what the weekday-only readers use). */
export async function saveGymPlan(repos: Repositories, plan: GymPlan): Promise<void> {
  const sorted = sortGymPlan(plan);
  await repos.settings.set('gymPlan', sorted);
  await repos.settings.set('gymDays', gymDaysFromPlan(sorted));
}

export async function saveAnchors(repos: Repositories, patch: Partial<Anchors>): Promise<void> {
  await repos.settings.update('anchors', (current) => ({ ...current, ...patch }));
}

export async function saveGoals(repos: Repositories, patch: StoredGoals): Promise<void> {
  await repos.settings.update('goals', (current) => ({ ...current, ...patch }));
}

/** Time offered for a newly ticked gym day: the plan's first time, else the evening anchor. */
export function defaultGymTime(plan: GymPlan, anchors: Anchors): string {
  return plan[0]?.time ?? anchors.gymEvening ?? anchors.gymMorning ?? DEFAULT_GYM_TIMES.gymEvening;
}

/** The plan after the weekday selection changed: kept days keep their sessions, new ones get the default time. */
export function planForDays(plan: GymPlan, days: readonly number[], anchors: Anchors): GymPlan {
  const fallback = defaultGymTime(plan, anchors);
  return sortGymPlan(
    days.flatMap((weekday) => {
      const kept = plan.filter((entry) => entry.weekday === weekday);
      return kept.length > 0 ? kept : [{ weekday, time: fallback }];
    }),
  );
}
