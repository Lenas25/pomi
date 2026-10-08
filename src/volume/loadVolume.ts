// Repositories -> the inputs of the weekly volume per muscle (PLAN §9.4). The counting itself is
// the pure `weeklyVolume`; this file only reads and resolves which muscles each step trains.
import { addDays, format, parseISO, startOfISOWeek, subWeeks } from 'date-fns';

import type { Repositories } from '../db/repositories';
import { defaultsFrom } from '../generator/defaults';
import { exerciseIdOfStep } from '../domain/generator/program';
import type { Goal, Level } from '../domain/generator/types';
import type { StepMuscles, StepMuscleSpec, VolumeSet } from '../domain/volume/weeklyVolume';
import { loadExerciseLibrary } from '../templates/exercises';
import type { ModuleTemplate } from '../templates/schema';

/** The most weeks the Progress chart can show. */
export const MAX_VOLUME_WEEKS = 8;

export type VolumeData = {
  today: string;
  level: Level;
  goal: Goal;
  sets: VolumeSet[];
  stepMuscles: StepMuscles;
};

type ModuleLike = { active: boolean; template: Pick<ModuleTemplate, 'programs'> };

/**
 * Muscles by step id from EVERY stored module (sessions of replaced programs still have sets), the
 * active modules first so a step id that exists in several programs resolves to the current one.
 * Step ids a program no longer has (a generated `rdl@db~s`) fall back to their library exercise.
 * When two ACTIVE modules define the same step id differently, the first active module wins
 * (documented first-wins: the order is the repository's listing order).
 */
export function resolveStepMuscles(
  modules: readonly ModuleLike[],
  stepIds: Iterable<string>,
): Record<string, StepMuscleSpec> {
  const resolved: Record<string, StepMuscleSpec> = {};
  const ordered = [...modules].sort((a, b) => Number(b.active) - Number(a.active));
  for (const { template } of ordered) {
    for (const program of template.programs ?? []) {
      for (const routine of program.routines) {
        for (const step of routine.steps) {
          if (step.type !== 'sets' || step.muscles === undefined || step.muscles.length === 0) {
            continue;
          }
          resolved[step.id] ??= [...step.muscles];
        }
      }
    }
  }
  const library = loadExerciseLibrary();
  for (const stepId of stepIds) {
    if (resolved[stepId] !== undefined) continue;
    const exercise = library.find((item) => item.id === exerciseIdOfStep(stepId));
    // Every primary mover is direct (1 set), the secondary ones indirect (0.5): the library says
    // which muscles an exercise trains, not an order of importance.
    if (exercise) {
      resolved[stepId] = {
        direct: [...exercise.muscles.primary],
        indirect: [...exercise.muscles.secondary],
      };
    }
  }
  return resolved;
}

export async function loadVolumeData(repos: Repositories, today: string): Promise<VolumeData> {
  const firstWeek = startOfISOWeek(subWeeks(parseISO(today), MAX_VOLUME_WEEKS - 1));
  // One day of margin: a set's logical day can differ from its session's date.
  const from = format(addDays(firstWeek, -1), 'yyyy-MM-dd');
  const [modules, rows, profile, gymDays] = await Promise.all([
    repos.templates.listModules(),
    repos.workouts.sessionsInRange(from, today),
    repos.profile.get(),
    repos.settings.get('gymDays'),
  ]);
  const sets: VolumeSet[] = rows.flatMap(({ sets: logged }) =>
    logged
      .filter((set) => (set.reps ?? 0) > 0 || (set.durationSec ?? 0) > 0)
      .map((set) => ({ stepId: set.stepId, doneAt: set.doneAt })),
  );
  const { level, goal } = defaultsFrom(
    { goal: profile?.goal, level: profile?.level },
    gymDays ?? [],
  );
  return {
    today,
    level,
    goal,
    sets,
    stepMuscles: resolveStepMuscles(modules, new Set(sets.map((set) => set.stepId))),
  };
}
