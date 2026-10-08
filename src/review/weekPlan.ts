// "Planifica tu semana" (weekly review): which days the person plans to train this week and the
// approximate time. Stored as a one-week override (`gymWeekPlans`, keyed by the Monday of the
// week); every gym reader goes through `effectiveGymPlan(settings, date)`, so the agenda, the
// reminders, Hoy, the suggestions and the insights follow it for that week only.
import type { Repositories } from '../db/repositories';
import { planningWeekStart, pruneGymWeekPlans, sortGymPlan } from '../domain/gym/gymPlan';
import { loadScheduleSettings } from '../settings/schedule';
import type { Anchors, GymPlan } from '../templates/schema';

export type WeekPlanStep = {
  /** Monday (`yyyy-MM-dd`) of the planned week. */
  weekStart: string;
  /** The usual plan (Ajustes), what "Igual que siempre" keeps. */
  usual: GymPlan;
  /** The override already saved for that week, if any. */
  override?: GymPlan | undefined;
  anchors: Anchors;
};

export async function loadWeekPlanStep(repos: Repositories, today: string): Promise<WeekPlanStep> {
  const weekStart = planningWeekStart(today);
  const [schedule, plans] = await Promise.all([
    loadScheduleSettings(repos),
    repos.settings.get('gymWeekPlans'),
  ]);
  return {
    weekStart,
    usual: schedule.plan,
    override: plans?.[weekStart],
    anchors: schedule.anchors,
  };
}

/**
 * Saves the week's plan (`null` = "Igual que siempre": the override is removed and the usual plan
 * applies) and prunes old weeks. The caller reschedules the notifications right after.
 */
export async function saveWeekPlan(
  repos: Repositories,
  weekStart: string,
  plan: GymPlan | null,
  today: string,
): Promise<void> {
  await repos.settings.update('gymWeekPlans', (current) => {
    const next = { ...current };
    if (plan === null) delete next[weekStart];
    else next[weekStart] = sortGymPlan(plan);
    return pruneGymWeekPlans(next, today);
  });
}
