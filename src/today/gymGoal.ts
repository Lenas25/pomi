// The "meta de hoy" shown on the gym row of Hoy: the target of the FIRST main exercise (the first
// `sets` step) of today's routine. It reuses the Gym tab's view model, so both always agree.
import { evaluateWhen } from '../domain/agenda/conditions';
import type { Repositories } from '../db/repositories';
import type { TargetRules } from '../domain/gym/todayTarget';
import type { TranslationKey } from '../i18n/types';
import type { GymProgram } from '../gym/program';
import { buildExerciseView, type ExerciseView, type SetsStep } from '../gym/sessionViewModel';

export type GoalMessage = { key: TranslationKey; params: Record<string, string | number> };

export type GymGoal = { exercise: string; message: GoalMessage };

/** The message of the target card: manual text, the reason, or the first hint. Pure. */
export function goalMessage(view: ExerciseView, step: SetsStep): GoalMessage | undefined {
  const { target } = view;
  if (target.kind === 'manual')
    return { key: 'gym.session.targetManual', params: { reps: step.reps } };
  return target.reason ?? target.hint[0];
}

/** First `sets` step that applies on `weekday`, or undefined (a routine of only checks). */
export function firstMainStep(
  steps: GymProgram['routines'][number]['steps'],
  weekday: number,
): SetsStep | undefined {
  return steps.find(
    (step): step is SetsStep => step.type === 'sets' && evaluateWhen(step.when, { weekday }),
  );
}

export async function loadGymGoal(
  repos: Repositories,
  routine: GymProgram['routines'][number] | undefined,
  rules: TargetRules,
  weekday: number,
): Promise<GymGoal | undefined> {
  if (!routine) return undefined;
  const step = firstMainStep(routine.steps, weekday);
  if (!step) return undefined;
  const history = await repos.workouts.recentSessionsForStep(step.id, rules.stallSessions + 2);
  const view = buildExerciseView(
    step,
    history.map(({ session, sets }) => ({ date: session.date, sets })),
    rules,
  );
  const message = goalMessage(view, step);
  return message ? { exercise: step.name, message } : undefined;
}
