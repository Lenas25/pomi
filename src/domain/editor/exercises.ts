// Adding / swapping an exercise from the generator's library: the same equipment and joint
// filters the generator uses (`eligibleExercises`), and the same step ids (`stepIdFor`).
import {
  eligibleExercises,
  isLoaded,
  type Exercise,
  type ExerciseLibrary,
} from '../generator/library';
import { repsFor, restFor } from '../generator/params';
import { exerciseIdOfStep, stepIdFor } from '../generator/program';
import type { Equipment, Limitation, TextResolver } from '../generator/types';

import type { Routine, Step } from './types';

export type LibraryFilter = {
  equipment: Equipment;
  /** Joints that hurt: exercises that load them are left out. */
  limitations: readonly Limitation[];
};

export const DEFAULT_LIBRARY_FILTER: LibraryFilter = { equipment: 'gym', limitations: [] };

const DEFAULT_SETS = 3;

/** Level is not filtered: the person edits their own program and knows what they can do. */
const filterInput = (filter: LibraryFilter) => ({
  equipment: filter.equipment,
  limitations: filter.limitations,
  level: 'advanced' as const,
});

const inRoutine = (routine: Routine | undefined, exercise: Exercise): boolean =>
  routine?.steps.some((step) => exerciseIdOfStep(step.id) === exercise.id) ?? false;

/** Exercises that can be added to `routine` (none of those it already has). */
export function addableExercises(
  library: ExerciseLibrary,
  filter: LibraryFilter,
  routine: Routine | undefined,
): Exercise[] {
  return eligibleExercises(library, filterInput(filter)).filter(
    (exercise) => !inRoutine(routine, exercise),
  );
}

/** The step's exercise in the library, `undefined` for custom steps and the warm-up checks. */
export function exerciseOfStep(library: ExerciseLibrary, step: Step): Exercise | undefined {
  return step.type === 'sets'
    ? library.find((exercise) => exercise.id === exerciseIdOfStep(step.id))
    : undefined;
}

/** Substitutions of the step's exercise that pass the filters and are not already in the routine. */
export function swapCandidates(
  library: ExerciseLibrary,
  filter: LibraryFilter,
  routine: Routine,
  step: Step,
): Exercise[] {
  const current = exerciseOfStep(library, step);
  if (!current) return [];
  const allowed = new Map(
    eligibleExercises(library, filterInput(filter)).map((exercise) => [exercise.id, exercise]),
  );
  return current.substitutions.flatMap((id) => {
    const option = allowed.get(id);
    return option && !inRoutine(routine, option) ? [option] : [];
  });
}

/** A `sets` step for a library exercise, with the generator's defaults for a general program. */
export function stepFromExercise(exercise: Exercise, filter: LibraryFilter, t: TextResolver): Step {
  const input = { equipment: filter.equipment, goal: 'hypertrophy' as const, restricted: false };
  const loadable = isLoaded(exercise, input);
  const [lo, hi] =
    exercise.timeSec ?? repsFor('hypertrophy', 'intermediate', filter.equipment, exercise.compound);
  const range = `${lo}–${hi}${exercise.timeSec ? ' s' : ''}`;
  return {
    type: 'sets',
    id: stepIdFor(exercise, input),
    name: t(exercise.nameKey),
    how: t(exercise.howKey),
    sets: DEFAULT_SETS,
    reps: exercise.unilateral ? `${range} ${t('generator.perSide')}` : range,
    restSec: restFor('hypertrophy', 'intermediate', filter.equipment, exercise.compound),
    muscles: [...new Set([...exercise.muscles.primary, ...exercise.muscles.secondary])],
    ...(loadable && exercise.incrementKg !== undefined
      ? { incrementKg: exercise.incrementKg }
      : {}),
    ...(!loadable ? { bodyweight: true } : {}),
  };
}
