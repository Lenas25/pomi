import type { Program } from './types';
import type { LocalizedText } from '../../templates/localized';

export type StepRemovalImpact = {
  /** The step has logged sets. */
  hasHistory: boolean;
  /** Other routines that keep the same step id: its history stays visible there. */
  stillIn: LocalizedText[];
};

/** What deleting `stepId` from `routineId` does to the exercise history (the step id is its key). */
export function stepRemovalImpact(
  program: Program,
  routineId: string,
  stepId: string,
  loggedStepIds: ReadonlySet<string>,
): StepRemovalImpact {
  return {
    hasHistory: loggedStepIds.has(stepId),
    stillIn: program.routines
      .filter((routine) => routine.id !== routineId && routine.steps.some((s) => s.id === stepId))
      .map((routine) => routine.name),
  };
}

/** Steps with logged sets that `routineId` holds and no other routine keeps. */
export function routineRemovalLosses(
  program: Program,
  routineId: string,
  loggedStepIds: ReadonlySet<string>,
): { id: string; name: LocalizedText }[] {
  const routine = program.routines.find((candidate) => candidate.id === routineId);
  if (!routine) return [];
  const elsewhere = new Set(
    program.routines
      .filter((other) => other.id !== routineId)
      .flatMap((other) => other.steps.map((step) => step.id)),
  );
  return routine.steps
    .filter((step) => loggedStepIds.has(step.id) && !elsewhere.has(step.id))
    .map((step) => ({ id: step.id, name: step.name }));
}
