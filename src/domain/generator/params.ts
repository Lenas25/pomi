// Default parameters per goal x level (docs/evidence/training.md section 12). Each export names
// the evidence ids it comes from; values the document marks [DESIGN] are labelled as defaults.
import type { EvidenceId, EvidenceRef, Equipment, Goal, Level, Muscle, Region } from './types';

export const SOURCES: Record<EvidenceId, string> = {
  E1: 'Pelland 2025; Schoenfeld 2017',
  E2: 'Schoenfeld 2019; Currier 2023',
  E3: 'Schoenfeld 2017; Lopez 2021; Refalo 2023',
  E4: 'Singer 2024; Grgic 2017',
  E5: 'ACSM 2009; Coleman 2024',
  E6: 'Plotkin 2023; Pallares 2021',
  E7: 'Fradkin 2010',
  E8: 'Schumann 2022; Donnelly 2009',
  E9: 'WHO 2020',
  E10: 'PAR-Q+ 2025; Warburton 2011',
  E11: 'Evangelista 2021; Currier 2023',
  E12: 'Default table (section 12)',
  E13: 'Limits of the evidence',
};

export const evidenceRef = (id: EvidenceId): EvidenceRef => ({ id, source: SOURCES[id] });

/** Direct-equivalent hard sets per muscle per week (E1, E12). `target` is the [DESIGN] default. */
export type VolumeBand = { min: number; max: number; target: number; priorityBonus: number };

export const VOLUME: Record<Goal, Record<Level, VolumeBand>> = {
  hypertrophy: {
    beginner: { min: 8, max: 10, target: 8, priorityBonus: 2 },
    intermediate: { min: 10, max: 14, target: 12, priorityBonus: 3 },
    advanced: { min: 12, max: 18, target: 15, priorityBonus: 4 },
  },
  strength: {
    beginner: { min: 6, max: 8, target: 6, priorityBonus: 0 },
    intermediate: { min: 8, max: 10, target: 8, priorityBonus: 0 },
    advanced: { min: 8, max: 12, target: 10, priorityBonus: 0 },
  },
  fatLoss: {
    beginner: { min: 4, max: 6, target: 4, priorityBonus: 0 },
    intermediate: { min: 6, max: 10, target: 8, priorityBonus: 0 },
    advanced: { min: 6, max: 10, target: 8, priorityBonus: 0 },
  },
  health: {
    beginner: { min: 4, max: 8, target: 6, priorityBonus: 0 },
    intermediate: { min: 4, max: 8, target: 6, priorityBonus: 0 },
    advanced: { min: 4, max: 8, target: 6, priorityBonus: 0 },
  },
};

/** E1: never program fewer than 4 or more than 20 sets per muscle per week. */
export const WEEKLY_SETS_FLOOR = 4;
export const WEEKLY_SETS_CEILING = 20;
/** E1 [DESIGN]: at most this many hard sets of one muscle in a single session. */
export const SESSION_SETS_PER_MUSCLE_CAP = 10;

/** Large muscles that every goal tracks. */
export const MAJOR_MUSCLES: readonly Muscle[] = [
  'gluteo',
  'cuadriceps',
  'isquios',
  'pecho',
  'espalda',
  'hombro',
];
/** Smaller muscles tracked only for hypertrophy; the rest of the goals get them as indirect work. */
export const MINOR_MUSCLES: readonly Muscle[] = [
  'gemelos',
  'biceps',
  'triceps',
  'hombro_posterior',
  'gluteo_medio',
];

/** [DESIGN] band for the small muscles (hypertrophy): at least 4 sets, a modest ceiling. */
export const MINOR_BAND: Record<Level, { min: number; max: number; target: number }> = {
  beginner: { min: 4, max: 8, target: 4 },
  intermediate: { min: 4, max: 10, target: 6 },
  advanced: { min: 4, max: 12, target: 8 },
};

export const REGION_MUSCLES: Record<Region, readonly Muscle[]> = {
  glutes: ['gluteo', 'gluteo_medio'],
  legs: ['cuadriceps', 'isquios', 'gemelos'],
  back: ['espalda', 'espalda_alta'],
  chest: ['pecho'],
  shoulders: ['hombro', 'hombro_posterior'],
  arms: ['biceps', 'triceps'],
};

/** [DESIGN] most days a goal and level support (E12 days column). */
export const MAX_DAYS: Record<Goal, Record<Level, number>> = {
  hypertrophy: { beginner: 4, intermediate: 5, advanced: 6 },
  strength: { beginner: 4, intermediate: 4, advanced: 4 },
  fatLoss: { beginner: 3, intermediate: 4, advanced: 4 },
  health: { beginner: 3, intermediate: 3, advanced: 3 },
};

export const MIN_DAYS = 2;
export const MAX_DAYS_ABSOLUTE = 6;
export const MIN_SESSION_MIN = 30;
export const MAX_SESSION_MIN = 90;
/** E12: warm-up counted out of the session budget. */
export const WARMUP_MIN = 5;
/** E12 [DESIGN]: minutes per working set, rest included (compound / isolation). */
export const COMPOUND_SET_MIN = 2.5;
export const ISOLATION_SET_MIN = 1.75;
/** [DESIGN] a unilateral set trains both sides. */
export const UNILATERAL_FACTOR = 1.6;

/**
 * [DESIGN] hard sets and exercises per session, by level. E11 suggests 5-7 exercises or ~12-16
 * hard sets for a beginner full-body session, so beginners are capped at 16 sets and 7 exercises
 * and only the large muscles are tracked for them (`MINOR_MUSCLES` get indirect work). When the
 * E12 weekly band does not fit under that cap, the proposal says so (`volumeBelowRange`).
 */
export const SESSION_LIMITS: Record<
  Level,
  { sets: number; exercises: number; setsPerExercise: number }
> = {
  beginner: { sets: 16, exercises: 7, setsPerExercise: 3 },
  intermediate: { sets: 22, exercises: 10, setsPerExercise: 4 },
  advanced: { sets: 26, exercises: 11, setsPerExercise: 4 },
};
export const MIN_SETS_PER_EXERCISE = 2;

/** E4/E12: rest in seconds as [compound, isolation]. Never below 60 s. */
export const REST: Record<Goal, Record<Level, readonly [number, number]>> = {
  hypertrophy: {
    beginner: [120, 75],
    intermediate: [150, 75],
    advanced: [180, 90],
  },
  strength: {
    beginner: [150, 90],
    intermediate: [180, 90],
    advanced: [210, 90],
  },
  fatLoss: {
    beginner: [90, 60],
    intermediate: [120, 60],
    advanced: [120, 60],
  },
  health: {
    beginner: [90, 60],
    intermediate: [90, 60],
    advanced: [90, 60],
  },
};
export const MIN_REST_SEC = 60;
/**
 * E4: home circuits rest 45-90 s. Applies ONLY to fat loss and health, whose table rest is already
 * circuit-like; hypertrophy and strength keep their table rests at home (rest is about recovery
 * between heavy sets, not about where the set is done).
 */
export const HOME_REST_CAP: readonly [number, number] = [90, 60];

export function restFor(goal: Goal, level: Level, equipment: Equipment, compound: boolean): number {
  const [longRest, shortRest] = REST[goal][level];
  const value = compound ? longRest : shortRest;
  const capHome = equipment !== 'gym' && (goal === 'fatLoss' || goal === 'health');
  const capped = capHome ? Math.min(value, compound ? HOME_REST_CAP[0] : HOME_REST_CAP[1]) : value;
  return Math.max(MIN_REST_SEC, capped);
}

export type RepRange = readonly [number, number];

/** E3/E12 rep ranges as [compound, isolation]. */
export const REPS: Record<Goal, Record<Level, readonly [RepRange, RepRange]>> = {
  hypertrophy: {
    beginner: [
      [8, 12],
      [10, 15],
    ],
    intermediate: [
      [6, 12],
      [10, 20],
    ],
    advanced: [
      [5, 12],
      [8, 20],
    ],
  },
  strength: {
    beginner: [
      [5, 8],
      [8, 12],
    ],
    intermediate: [
      [3, 8],
      [8, 12],
    ],
    advanced: [
      [2, 6],
      [6, 10],
    ],
  },
  fatLoss: {
    beginner: [
      [8, 15],
      [8, 15],
    ],
    intermediate: [
      [6, 15],
      [8, 15],
    ],
    advanced: [
      [6, 15],
      [8, 15],
    ],
  },
  health: {
    beginner: [
      [8, 15],
      [8, 15],
    ],
    intermediate: [
      [8, 15],
      [8, 15],
    ],
    advanced: [
      [8, 15],
      [8, 15],
    ],
  },
};

/** E3/E12: with light loads the reps go up (dumbbells 15-25, body weight 10-30 at 2 RIR). */
export function repsFor(
  goal: Goal,
  level: Level,
  equipment: Equipment,
  compound: boolean,
): RepRange {
  const [compoundRange, isolationRange] = REPS[goal][level];
  const base = compound ? compoundRange : isolationRange;
  if (equipment === 'bodyweight') return compound ? [10, 20] : [12, 25];
  if (equipment === 'dumbbells') {
    return compound
      ? [Math.min(base[0] + 2, 10), Math.max(base[1], 15)]
      : [base[0], Math.max(base[1], 20)];
  }
  return base;
}

/** E10 [DESIGN]: a PAR-Q+ "yes" that is not a referral gets a gentle routine at 3-4 RIR. */
export const RESTRICTED_RIR: readonly [number, number] = [3, 4];

/** E3: target reps in reserve [min, max] (docs section 3 and 12). */
export function rirTarget(goal: Goal, level: Level, restricted = false): readonly [number, number] {
  if (restricted) return RESTRICTED_RIR;
  if (goal === 'strength' && level === 'advanced') return [1, 2];
  if (level === 'advanced') return [0, 3];
  if (level === 'intermediate') return [1, 3];
  return [2, 3];
}

/** E8/E9: weekly aerobic minutes the plan is compared with, and the strengthening days. */
export const WHO_AEROBIC_MIN = 150;
export const WHO_STRENGTH_DAYS = 2;
export const CARDIO_MIN_SESSION = 10;
export const CARDIO_MAX_SESSION = 30;
export const CARDIO_STEP = 5;

/**
 * [DESIGN] share of the session budget (after the warm-up) RESERVED for cardio BEFORE the lifting
 * is planned, so the volume optimiser can never crowd it out. Health follows the WHO dose (E9,
 * mostly aerobic); fat loss keeps more room for lifting (E8: RT 2-4 d/wk preserves lean mass).
 */
export const CARDIO_RESERVE_SHARE: Record<'health' | 'fatLoss', number> = {
  health: 0.6,
  fatLoss: 0.4,
};

/** E8/E12: optional cardio for hypertrophy and strength, 1-2 sessions of 20-30 min when time allows. */
export const OPTIONAL_CARDIO_MIN = 20;
export const OPTIONAL_CARDIO_MAX = 30;
export const OPTIONAL_CARDIO_SESSIONS = 2;

/**
 * Minutes of cardio reserved in each session of a fat loss / health plan: the share of the budget
 * (session minutes minus warm-up), rounded down to 5 min and kept inside the 10-30 min session
 * range. 0 for the goals whose cardio is optional.
 */
export function cardioReserveMin(input: { goal: Goal; sessionMin: number }): number {
  if (input.goal !== 'fatLoss' && input.goal !== 'health') return 0;
  const budget = input.sessionMin - WARMUP_MIN;
  const raw = Math.floor((budget * CARDIO_RESERVE_SHARE[input.goal]) / CARDIO_STEP) * CARDIO_STEP;
  return Math.min(CARDIO_MAX_SESSION, Math.max(CARDIO_MIN_SESSION, raw));
}

/** E5: reactive deload only. Two sessions without improvement, then one lighter week at -10%. */
export const STALL_SESSIONS = 2;
export const DELOAD_PCT = 10;
