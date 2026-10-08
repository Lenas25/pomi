// The exercise library (`templates/exercises.json`): data, not code. This module is its schema and
// the filters the generator uses. Names and how-tos live in i18n (`exercises.<id>.name|how`).
import { z } from 'zod';

import {
  EQUIPMENT,
  LEVELS,
  LIMITATIONS,
  MUSCLES,
  PATTERNS,
  type EffectiveInput,
  type Equipment,
  type Level,
  type Limitation,
  type Muscle,
  type Pattern,
} from './types';

const muscleSchema = z.enum(MUSCLES);

export const exerciseSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  nameKey: z.string().regex(/^exercises\.[A-Za-z0-9]+\.name$/),
  howKey: z.string().regex(/^exercises\.[A-Za-z0-9]+\.how$/),
  muscles: z.strictObject({
    primary: z.array(muscleSchema).min(1),
    secondary: z.array(muscleSchema),
  }),
  equipment: z.array(z.enum(EQUIPMENT)).min(1),
  pattern: z.enum(PATTERNS),
  minLevel: z.enum(LEVELS),
  /** Multi-joint: longer rest, goes first, costs more time per set. */
  compound: z.boolean(),
  /** Reps are per side. */
  unilateral: z.boolean(),
  bodyweight: z.boolean(),
  /** Done on a guided machine or a cable stack (the gentle routine of a PAR-Q+ "yes" only uses these). */
  machine: z.boolean().optional(),
  /** Ids that can stand in for it (same pattern or group, shared equipment). */
  substitutions: z.array(z.string()).min(1),
  /** Joints this exercise loads enough to avoid when they hurt. */
  contraindications: z.array(z.enum(LIMITATIONS)),
  incrementKg: z.number().positive().optional(),
  /** Isometric holds: seconds per set instead of reps. */
  timeSec: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});

export type Exercise = z.infer<typeof exerciseSchema>;

export const exerciseLibrarySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('exercises'),
    exercises: z.array(exerciseSchema).min(1),
  })
  .superRefine((library, ctx) => {
    const ids = new Set<string>();
    library.exercises.forEach((exercise, index) => {
      if (ids.has(exercise.id)) {
        ctx.addIssue({ code: 'custom', message: 'duplicate id', path: ['exercises', index, 'id'] });
      }
      ids.add(exercise.id);
    });
    library.exercises.forEach((exercise, index) => {
      exercise.substitutions.forEach((substitute, at) => {
        if (substitute === exercise.id || !ids.has(substitute)) {
          ctx.addIssue({
            code: 'custom',
            message: `unknown or self substitution "${substitute}"`,
            path: ['exercises', index, 'substitutions', at],
          });
        }
      });
    });
  });

export type ExerciseLibrary = readonly Exercise[];

export const levelRank = (level: Level): number => LEVELS.indexOf(level);

/** Primary movers count 1 set, secondary movers 0.5 (Pelland's fractional method, E1). */
export function muscleUnits(exercise: Exercise, muscle: Muscle): 0 | 1 | 2 {
  if (exercise.muscles.primary.includes(muscle)) return 2;
  return exercise.muscles.secondary.includes(muscle) ? 1 : 0;
}

export function fitsEquipment(exercise: Exercise, equipment: Equipment): boolean {
  return exercise.equipment.includes(equipment);
}

export function loadsLimitation(exercise: Exercise, limitations: readonly Limitation[]): boolean {
  return exercise.contraindications.some((tag) => limitations.includes(tag));
}

type EligibilityInput = Pick<EffectiveInput, 'equipment' | 'level' | 'limitations'> & {
  restricted?: boolean | undefined;
};

/**
 * The gentle routine of a PAR-Q+ "yes" (E10 [DESIGN]): machines and body weight only, and no loaded
 * hinge. A machine exercise needs the gym; any other exercise has to be doable with the body alone
 * (it is then done unloaded, see `isLoaded`). A hinge is only allowed when it is a body-weight one.
 */
export function allowedWhenRestricted(exercise: Exercise): boolean {
  const bodyweightCapable = exercise.bodyweight || exercise.equipment.includes('bodyweight');
  if (exercise.pattern === 'hip_hinge') return bodyweightCapable && !exercise.machine;
  return exercise.machine === true || bodyweightCapable;
}

/** Whether the exercise is done with external load for this person (weights, machine stack). */
export function isLoaded(
  exercise: Exercise,
  input: Pick<EffectiveInput, 'equipment' | 'restricted'>,
) {
  if (exercise.bodyweight || input.equipment === 'bodyweight') return false;
  return !(input.restricted && exercise.machine !== true);
}

/** The exercises the generator may use for this person: equipment, level and joints respected. */
export function eligibleExercises(library: ExerciseLibrary, input: EligibilityInput): Exercise[] {
  return library.filter(
    (exercise) =>
      fitsEquipment(exercise, input.equipment) &&
      levelRank(exercise.minLevel) <= levelRank(input.level) &&
      !loadsLimitation(exercise, input.limitations) &&
      (!input.restricted || allowedWhenRestricted(exercise)),
  );
}

/** Patterns every equipment option must offer at beginner level (otherwise a plan has holes). */
const REQUIRED_PATTERNS: readonly Pattern[] = [
  'squat',
  'hip_thrust',
  'horizontal_push',
  'horizontal_pull',
  'vertical_pull',
  'core_anti_extension',
];

/** The gentle routine has no loaded hinge, so it needs a leg-curl style pattern for the hamstrings. */
const RESTRICTED_REQUIRED_PATTERNS: readonly Pattern[] = [
  'hip_thrust',
  'horizontal_push',
  'horizontal_pull',
  'knee_flexion',
  'core_anti_extension',
];

const REQUIRED_MUSCLES: readonly Muscle[] = [
  'gluteo',
  'cuadriceps',
  'isquios',
  'pecho',
  'espalda',
  'hombro',
];

/**
 * Coverage rules of the library, in plain English (`npm run validate:templates` prints them):
 * every equipment has a beginner exercise for each key pattern and each large muscle, and every
 * substitution can actually be done with the same equipment.
 */
export function coverageProblems(library: ExerciseLibrary): string[] {
  const problems: string[] = [];
  for (const equipment of EQUIPMENT) {
    const pool = library.filter(
      (exercise) => fitsEquipment(exercise, equipment) && exercise.minLevel === 'beginner',
    );
    for (const pattern of REQUIRED_PATTERNS) {
      if (!pool.some((exercise) => exercise.pattern === pattern)) {
        problems.push(`no beginner "${pattern}" exercise for ${equipment}`);
      }
    }
    for (const muscle of REQUIRED_MUSCLES) {
      if (!pool.some((exercise) => exercise.muscles.primary.includes(muscle))) {
        problems.push(`no beginner exercise with "${muscle}" as primary mover for ${equipment}`);
      }
    }
  }
  for (const equipment of EQUIPMENT) {
    const pool = eligibleExercises(library, {
      equipment,
      level: 'beginner',
      limitations: [],
      restricted: true,
    });
    for (const pattern of RESTRICTED_REQUIRED_PATTERNS) {
      if (!pool.some((exercise) => exercise.pattern === pattern)) {
        problems.push(`no gentle-routine "${pattern}" exercise for ${equipment}`);
      }
    }
    for (const muscle of REQUIRED_MUSCLES) {
      if (!pool.some((exercise) => exercise.muscles.primary.includes(muscle))) {
        problems.push(
          `no gentle-routine exercise with "${muscle}" as primary mover for ${equipment}`,
        );
      }
    }
  }
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  for (const exercise of library) {
    const shared = exercise.substitutions.some((id) => {
      const other = byId.get(id);
      return (
        other !== undefined && other.equipment.some((item) => exercise.equipment.includes(item))
      );
    });
    if (!shared) problems.push(`"${exercise.id}" has no substitution that shares its equipment`);
  }
  return problems;
}

export type { Pattern };
