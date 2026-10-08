// The planning core: split the week into sessions and fill each one with exercises so every
// tracked muscle lands inside its weekly volume band (E1, E12), at least twice a week (E2, E11),
// inside the session time budget (E12 [DESIGN]), with no exercise that loads a limited joint.
// Pure and deterministic: ties are broken by a seeded hash, never by chance.
import {
  eligibleExercises,
  levelRank,
  muscleUnits,
  type Exercise,
  type ExerciseLibrary,
} from './library';
import {
  COMPOUND_SET_MIN,
  ISOLATION_SET_MIN,
  MAJOR_MUSCLES,
  MAX_DAYS,
  MAX_DAYS_ABSOLUTE,
  MAX_SESSION_MIN,
  MIN_DAYS,
  MIN_SESSION_MIN,
  MIN_SETS_PER_EXERCISE,
  MINOR_BAND,
  MINOR_MUSCLES,
  REGION_MUSCLES,
  SESSION_LIMITS,
  SESSION_SETS_PER_MUSCLE_CAP,
  UNILATERAL_FACTOR,
  VOLUME,
  WARMUP_MIN,
  WEEKLY_SETS_CEILING,
  WEEKLY_SETS_FLOOR,
  restFor,
} from './params';
import type { EffectiveInput, Muscle, Pattern, Plan, PlanSession, SessionKind } from './types';

// --- The split ----------------------------------------------------------------------------------

/** [DESIGN] (E11): full body for 2-3 days, upper/lower for 4, upper/lower + push/pull/legs for 5, PPL twice for 6. */
export const SPLITS: Record<number, readonly SessionKind[]> = {
  2: ['full', 'full'],
  3: ['full', 'full', 'full'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['upper', 'lower', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

const LOWER_FOCUS: readonly Muscle[] = [
  'gluteo',
  'gluteo_medio',
  'cuadriceps',
  'isquios',
  'gemelos',
  'core',
];

export const FOCUS: Record<SessionKind, readonly Muscle[]> = {
  full: [
    'gluteo',
    'gluteo_medio',
    'cuadriceps',
    'isquios',
    'gemelos',
    'pecho',
    'espalda',
    'espalda_alta',
    'hombro',
    'hombro_posterior',
    'biceps',
    'triceps',
    'core',
  ],
  upper: [
    'pecho',
    'espalda',
    'espalda_alta',
    'hombro',
    'hombro_posterior',
    'biceps',
    'triceps',
    'core',
  ],
  lower: LOWER_FOCUS,
  push: ['pecho', 'hombro', 'triceps', 'core'],
  pull: ['espalda', 'espalda_alta', 'hombro_posterior', 'biceps', 'core'],
  legs: LOWER_FOCUS,
};

/** Order inside a session: big multi-joint patterns first, small isolation and core last (E6). */
export const PATTERN_ORDER: readonly Pattern[] = [
  'squat',
  'hip_hinge',
  'lunge',
  'hip_thrust',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'knee_flexion',
  'knee_extension',
  'chest_fly',
  'lateral_raise',
  'rear_delt',
  'glute_iso',
  'glute_med',
  'biceps',
  'triceps',
  'calves',
  'core_anti_extension',
  'core_anti_rotation',
];

/** See `State.share`. */
const OPTIMIZER_TIME_SHARE = 0.85;

const CORE_PATTERNS: readonly Pattern[] = ['core_anti_extension', 'core_anti_rotation'];

export type DaysResolution = { used: number; requested: number };

/** Clamps the requested days to 2-6 and to what the goal and level support (E12 days column). */
export function resolveDays(
  goal: EffectiveInput['goal'],
  level: EffectiveInput['level'],
  requested: number,
): DaysResolution {
  const asked = Math.min(MAX_DAYS_ABSOLUTE, Math.max(MIN_DAYS, Math.round(requested)));
  return { requested: asked, used: Math.min(asked, MAX_DAYS[goal][level]) };
}

export const clampSessionMin = (minutes: number) =>
  Math.min(MAX_SESSION_MIN, Math.max(MIN_SESSION_MIN, Math.round(minutes)));

export function emptySessions(days: number): PlanSession[] {
  const kinds = SPLITS[Math.min(MAX_DAYS_ABSOLUTE, Math.max(MIN_DAYS, days))] ?? [];
  const seen = new Map<SessionKind, number>();
  return kinds.map((kind, index) => {
    const count = seen.get(kind) ?? 0;
    seen.set(kind, count + 1);
    return {
      id: `d${index + 1}`,
      kind,
      letter: String.fromCharCode(65 + count),
      entries: [],
      cardioMin: 0,
    };
  });
}

// --- Volume bands -------------------------------------------------------------------------------

export type Band = { min: number; max: number; target: number; priority: boolean };

/** Weekly band per tracked muscle (direct-equivalent sets). Priority muscles get the bonus (E1). */
export function trackedBands(input: EffectiveInput): Map<Muscle, Band> {
  const bands = new Map<Muscle, Band>();
  const priority = new Set<Muscle>(
    input.goal === 'hypertrophy' && input.focusRegion ? REGION_MUSCLES[input.focusRegion] : [],
  );
  const bonus = VOLUME[input.goal][input.level].priorityBonus;
  const put = (muscle: Muscle, base: { min: number; max: number; target: number }) => {
    const boost = priority.has(muscle) ? bonus : 0;
    bands.set(muscle, {
      min: Math.max(WEEKLY_SETS_FLOOR, base.min + boost),
      max: Math.min(WEEKLY_SETS_CEILING, base.max + boost),
      target: Math.min(WEEKLY_SETS_CEILING, base.target + boost),
      priority: boost > 0,
    });
  };
  for (const muscle of MAJOR_MUSCLES) put(muscle, VOLUME[input.goal][input.level]);
  if (input.goal === 'hypertrophy') {
    for (const muscle of MINOR_MUSCLES) put(muscle, MINOR_BAND[input.level]);
  }
  return bands;
}

// --- Time ---------------------------------------------------------------------------------------

/** Minutes of one working set, rest included (E12 [DESIGN]). */
export function minutesPerSet(exercise: Exercise, input: EffectiveInput): number {
  const base = exercise.compound ? COMPOUND_SET_MIN : ISOLATION_SET_MIN;
  const rest = restFor(input.goal, input.level, input.equipment, exercise.compound);
  const perSet = Math.max(base, rest / 60 + 0.5);
  return perSet * (exercise.unilateral ? UNILATERAL_FACTOR : 1);
}

export function sessionMinutes(
  session: PlanSession,
  byId: ReadonlyMap<string, Exercise>,
  input: EffectiveInput,
): number {
  const lifting = session.entries.reduce((sum, entry) => {
    const exercise = byId.get(entry.exerciseId);
    return exercise ? sum + entry.sets * minutesPerSet(exercise, input) : sum;
  }, 0);
  return WARMUP_MIN + lifting + session.cardioMin;
}

// --- Deterministic tie-break --------------------------------------------------------------------

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

// --- Structure: which exercises a session holds ------------------------------------------------

type Slot = {
  /** Movement patterns in order of preference; the first one with an allowed exercise wins. */
  patterns: readonly Pattern[];
  /** Rotates the preference by how many sessions of the same kind came before (A / B variety). */
  rotate?: boolean;
};

const slot = (patterns: readonly Pattern[], rotate = false): Slot => ({ patterns, rotate });

/**
 * The multi-joint (and key hamstring) slots of each kind of session, in order of importance
 * (E6: large before small muscle, multi-joint before single-joint). When the time budget is
 * short, the last slots are the first to go.
 */
const SLOTS: Record<SessionKind, readonly Slot[]> = {
  full: [
    slot(['squat', 'lunge']),
    slot(['hip_hinge', 'hip_thrust']),
    slot(['horizontal_push']),
    slot(['horizontal_pull']),
    slot(['vertical_push', 'vertical_pull'], true),
  ],
  upper: [
    slot(['horizontal_push']),
    slot(['horizontal_pull']),
    slot(['vertical_push']),
    slot(['vertical_pull']),
  ],
  lower: [
    slot(['squat']),
    slot(['hip_hinge']),
    slot(['lunge', 'hip_thrust'], true),
    slot(['knee_flexion']),
  ],
  push: [slot(['horizontal_push']), slot(['vertical_push'])],
  pull: [slot(['vertical_pull']), slot(['horizontal_pull'])],
  legs: [
    slot(['squat']),
    slot(['hip_hinge']),
    slot(['hip_thrust', 'lunge'], true),
    slot(['knee_flexion', 'knee_extension']),
  ],
};

/** Best first: the most advanced exercise the level allows, then the most specific equipment. */
function ranked(pool: readonly Exercise[], pattern: Pattern, order: ReadonlyMap<string, number>) {
  return pool
    .filter((exercise) => exercise.pattern === pattern)
    .sort(
      (a, b) =>
        levelRank(b.minLevel) - levelRank(a.minLevel) ||
        a.equipment.length - b.equipment.length ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
}

type State = {
  input: EffectiveInput;
  bands: ReadonlyMap<Muscle, Band>;
  pool: readonly Exercise[];
  byId: ReadonlyMap<string, Exercise>;
  order: ReadonlyMap<string, number>;
  sessions: PlanSession[];
  /**
   * Share of the time budget the set optimiser may use. It stays below 1 while the extra exercises
   * are placed, so growing the big lifts never crowds out the small muscles that still need a slot.
   */
  share: number;
};

function chooseFor(
  state: State,
  session: PlanSession,
  occurrence: number,
  sloted: Slot,
): Exercise | undefined {
  const focus = new Set(FOCUS[session.kind]);
  const chosen = new Set(session.entries.map((entry) => entry.exerciseId));
  const shift = sloted.rotate ? occurrence % sloted.patterns.length : 0;
  const patterns = [...sloted.patterns.slice(shift), ...sloted.patterns.slice(0, shift)];
  const week = weekUnits(state.sessions, state.byId);
  for (const pattern of patterns) {
    const options = ranked(state.pool, pattern, state.order).filter(
      (exercise) =>
        !chosen.has(exercise.id) && exercise.muscles.primary.every((muscle) => focus.has(muscle)),
    );
    if (options.length === 0) continue;
    // Variety between sessions of a kind, but only among the two best options.
    const first = occurrence % Math.min(2, options.length);
    const order = [...options.slice(first), ...options.slice(0, first)];
    const fits = order.find((exercise) =>
      canGrow(state, session, exercise, MIN_SETS_PER_EXERCISE, true, week),
    );
    if (fits) return fits;
  }
  return undefined;
}

// --- Accounting ---------------------------------------------------------------------------------

function weekUnits(
  sessions: readonly PlanSession[],
  byId: ReadonlyMap<string, Exercise>,
): Map<Muscle, number> {
  const units = new Map<Muscle, number>();
  for (const session of sessions) {
    for (const entry of session.entries) {
      const exercise = byId.get(entry.exerciseId);
      if (!exercise) continue;
      for (const muscle of [...exercise.muscles.primary, ...exercise.muscles.secondary]) {
        units.set(muscle, (units.get(muscle) ?? 0) + entry.sets * muscleUnits(exercise, muscle));
      }
    }
  }
  return units;
}

type SessionLoad = { minutes: number; sets: number; units: Map<Muscle, number> };

function loadOf(state: State, session: PlanSession): SessionLoad {
  const load: SessionLoad = { minutes: 0, sets: 0, units: new Map() };
  for (const entry of session.entries) {
    const exercise = state.byId.get(entry.exerciseId);
    if (!exercise) continue;
    load.minutes += entry.sets * minutesPerSet(exercise, state.input);
    load.sets += entry.sets;
    for (const muscle of [...exercise.muscles.primary, ...exercise.muscles.secondary]) {
      load.units.set(
        muscle,
        (load.units.get(muscle) ?? 0) + entry.sets * muscleUnits(exercise, muscle),
      );
    }
  }
  return load;
}

/** Whether `added` more sets of `exercise` fit this session and keep every ceiling. */
function canGrow(
  state: State,
  session: PlanSession,
  exercise: Exercise,
  added: number,
  isNew: boolean,
  week: ReadonlyMap<Muscle, number>,
  share = 1,
): boolean {
  const limits = SESSION_LIMITS[state.input.level];
  const load = loadOf(state, session);
  const budget = (state.input.sessionMin - WARMUP_MIN) * share;
  if (load.minutes + added * minutesPerSet(exercise, state.input) > budget + 1e-9) return false;
  if (load.sets + added > limits.sets) return false;
  if (isNew && session.entries.length + 1 > limits.exercises) return false;
  for (const muscle of [...exercise.muscles.primary, ...exercise.muscles.secondary]) {
    const delta = added * muscleUnits(exercise, muscle);
    const band = state.bands.get(muscle);
    if (band && (week.get(muscle) ?? 0) + delta > band.max * 2) return false;
    if ((load.units.get(muscle) ?? 0) + delta > SESSION_SETS_PER_MUSCLE_CAP * 2) return false;
  }
  return true;
}

/** Squared distance of the week from its targets (units): what the optimiser reduces. */
function error(state: State, week: ReadonlyMap<Muscle, number>): number {
  let total = 0;
  for (const [muscle, band] of state.bands) {
    const gap = band.target * 2 - (week.get(muscle) ?? 0);
    total += gap * gap;
  }
  return total;
}

function tieOf(state: State, key: string): number {
  return hash(`${state.input.seed}:${key}`);
}

type Move = { score: number; tie: number; apply: () => void };

/**
 * Coordinate descent on the set counts: add the set that brings the week closest to its targets,
 * then try moving a set from one exercise to another. Exercises never drop under two sets.
 */
function optimize(state: State): void {
  const limits = SESSION_LIMITS[state.input.level];
  for (let step = 0; step < 400; step += 1) {
    const week = weekUnits(state.sessions, state.byId);
    const base = error(state, week);
    const found: { best: Move | null } = { best: null };
    const consider = (move: Move) => {
      const current = found.best;
      if (
        !current ||
        move.score > current.score + 1e-9 ||
        (Math.abs(move.score - current.score) <= 1e-9 && move.tie < current.tie)
      ) {
        found.best = move;
      }
    };

    state.sessions.forEach((session, sessionIndex) => {
      session.entries.forEach((entry, entryIndex) => {
        const exercise = state.byId.get(entry.exerciseId);
        if (!exercise || entry.sets >= limits.setsPerExercise) return;
        if (!canGrow(state, session, exercise, 1, false, week, state.share)) return;
        entry.sets += 1;
        const gain = base - error(state, weekUnits(state.sessions, state.byId));
        entry.sets -= 1;
        if (gain > 1e-9) {
          consider({
            score: gain,
            tie: tieOf(state, `${sessionIndex}:${entryIndex}`),
            apply: () => {
              entry.sets += 1;
            },
          });
        }
      });
    });

    if (!found.best) {
      // No single set helps: try moving one (take from an exercise, give to another).
      state.sessions.forEach((from, fromSession) => {
        from.entries.forEach((source, fromEntry) => {
          if (source.sets <= MIN_SETS_PER_EXERCISE) return;
          source.sets -= 1;
          const afterTake = weekUnits(state.sessions, state.byId);
          state.sessions.forEach((to, toSession) => {
            to.entries.forEach((target, toEntry) => {
              const exercise = state.byId.get(target.exerciseId);
              if (!exercise || target === source || target.sets >= limits.setsPerExercise) return;
              if (!canGrow(state, to, exercise, 1, false, afterTake, state.share)) return;
              target.sets += 1;
              const gain = base - error(state, weekUnits(state.sessions, state.byId));
              target.sets -= 1;
              if (gain > 1e-9) {
                consider({
                  score: gain,
                  tie: tieOf(state, `${fromSession}:${fromEntry}>${toSession}:${toEntry}`),
                  apply: () => {
                    source.sets -= 1;
                    target.sets += 1;
                  },
                });
              }
            });
          });
          source.sets += 1;
        });
      });
    }

    const chosen = found.best;
    if (!chosen) return;
    chosen.apply();
  }
}

/** Sessions of the week with at least one set that touches the muscle. */
function frequencyOf(state: State, muscle: Muscle): number {
  return state.sessions.filter((session) =>
    session.entries.some((entry) => {
      const exercise = state.byId.get(entry.exerciseId);
      return exercise !== undefined && muscleUnits(exercise, muscle) > 0;
    }),
  ).length;
}

/**
 * The band-tracked muscles that are short: under their weekly minimum, or trained in fewer than
 * two sessions while two sessions could train them (E2). The value is the gap in units.
 */
function underMinimum(state: State): Map<Muscle, number> {
  const week = weekUnits(state.sessions, state.byId);
  const missing = new Map<Muscle, number>();
  for (const [muscle, band] of state.bands) {
    const possible = state.sessions.filter((session) =>
      FOCUS[session.kind].includes(muscle),
    ).length;
    const lacksFrequency = possible >= 2 && frequencyOf(state, muscle) < 2;
    const gap = Math.max(band.min * 2 - (week.get(muscle) ?? 0), lacksFrequency ? 2 : 0);
    if (gap > 0) missing.set(muscle, gap);
  }
  return missing;
}

/**
 * Adds the exercise (2 sets) that best closes the gap of the muscles under their weekly minimum,
 * in the session with the most spare time (so the extras spread out).
 */
function addExtra(state: State): boolean {
  const week = weekUnits(state.sessions, state.byId);
  const missing = underMinimum(state);
  const found: {
    best: { score: number; tie: number; session: PlanSession; exercise: Exercise } | null;
  } = { best: null };
  state.sessions.forEach((session, sessionIndex) => {
    const focus = new Set(FOCUS[session.kind]);
    const used = new Set(session.entries.map((entry) => state.byId.get(entry.exerciseId)?.pattern));
    const spare = state.input.sessionMin - WARMUP_MIN - loadOf(state, session).minutes;
    for (const exercise of state.pool) {
      if (session.entries.some((entry) => entry.exerciseId === exercise.id)) continue;
      // One exercise per pattern, unless the one there already holds as many sets as allowed.
      if (
        used.has(exercise.pattern) &&
        !session.entries
          .filter((entry) => state.byId.get(entry.exerciseId)?.pattern === exercise.pattern)
          .every((entry) => entry.sets >= SESSION_LIMITS[state.input.level].setsPerExercise)
      ) {
        continue;
      }
      if (!exercise.muscles.primary.every((muscle) => focus.has(muscle))) continue;
      // It must TRAIN a muscle that is short (primary mover), not just touch it on the side.
      if (!exercise.muscles.primary.some((muscle) => missing.has(muscle))) continue;
      if (!canGrow(state, session, exercise, MIN_SETS_PER_EXERCISE, true, week)) continue;
      let gain = 0;
      for (const [muscle, gap] of missing) {
        const delivered = MIN_SETS_PER_EXERCISE * muscleUnits(exercise, muscle);
        gain += gap * gap - Math.max(0, gap - delivered) ** 2;
      }
      if (gain <= 1e-9) continue;
      const score = gain + spare * 0.01 + (exercise.compound ? 0.001 : 0);
      const tie = tieOf(state, `${sessionIndex}:${exercise.id}`);
      const current = found.best;
      if (
        !current ||
        score > current.score + 1e-9 ||
        (Math.abs(score - current.score) <= 1e-9 && tie < current.tie)
      ) {
        found.best = { score, tie, session, exercise };
      }
    }
  });
  const chosen = found.best;
  if (!chosen) return false;
  chosen.session.entries.push({ exerciseId: chosen.exercise.id, sets: MIN_SETS_PER_EXERCISE });
  return true;
}

/** How far the tracked muscles are under their minimum (units squared): 0 when all are in band. */
function violation(state: State): number {
  let total = 0;
  for (const gap of underMinimum(state).values()) total += gap * gap;
  return total;
}

/**
 * When extra exercises cannot fix a short muscle (a ceiling or the time is in the way), try
 * dropping one exercise that over-delivers elsewhere and re-balance: keep the drop that helps most.
 */
function dropAndRebalance(state: State): boolean {
  const before = violation(state);
  if (before === 0) return false;
  const snapshot = () =>
    state.sessions.map((session) => session.entries.map((entry) => ({ ...entry })));
  const restore = (saved: { exerciseId: string; sets: number }[][]) => {
    state.sessions.forEach((session, index) => {
      session.entries = (saved[index] ?? []).map((entry) => ({ ...entry }));
    });
  };
  const original = snapshot();
  const found: { best: { score: number; plan: ReturnType<typeof snapshot> } | null } = {
    best: null,
  };
  state.sessions.forEach((session, sessionIndex) => {
    session.entries.forEach((_, entryIndex) => {
      restore(original);
      state.sessions[sessionIndex]?.entries.splice(entryIndex, 1);
      optimize(state);
      for (let extra = 0; extra < 6 && underMinimum(state).size > 0; extra += 1) {
        if (!addExtra(state)) break;
        optimize(state);
      }
      const after = violation(state);
      const current = found.best;
      if (after < before - 1e-9 && (!current || after < current.score - 1e-9)) {
        found.best = { score: after, plan: snapshot() };
      }
    });
  });
  restore(original);
  const chosen = found.best;
  if (!chosen) return false;
  restore(chosen.plan);
  return true;
}

/** One core exercise (2 sets) at the end of a session when the budget allows (E6, E12). */
function addCore(state: State, index: number): void {
  const session = state.sessions[index];
  if (!session) return;
  const week = weekUnits(state.sessions, state.byId);
  const wanted = CORE_PATTERNS[index % CORE_PATTERNS.length];
  const options = state.pool
    .filter(
      (exercise) =>
        CORE_PATTERNS.includes(exercise.pattern) &&
        canGrow(state, session, exercise, MIN_SETS_PER_EXERCISE, true, week),
    )
    .sort(
      (a, b) =>
        Number(b.pattern === wanted) - Number(a.pattern === wanted) ||
        a.equipment.length - b.equipment.length ||
        tieOf(state, a.id) - tieOf(state, b.id),
    );
  const pick = options[0];
  if (pick) session.entries.push({ exerciseId: pick.id, sets: MIN_SETS_PER_EXERCISE });
}

/** Sorts a session's entries: multi-joint first, then the pattern order (E6). */
export function orderEntries(session: PlanSession, byId: ReadonlyMap<string, Exercise>): void {
  const key = (entryId: string) => {
    const exercise = byId.get(entryId);
    return exercise
      ? [exercise.compound ? 0 : 1, PATTERN_ORDER.indexOf(exercise.pattern)]
      : [2, 99];
  };
  session.entries.sort((a, b) => {
    const [ac = 0, ap = 0] = key(a.exerciseId);
    const [bc = 0, bp = 0] = key(b.exerciseId);
    return ac - bc || ap - bp;
  });
}

/** Builds the plan for `input` from the exercises that are allowed for this person. */
export function buildPlan(input: EffectiveInput, library: ExerciseLibrary): Plan {
  const pool = eligibleExercises(library, input);
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const order = new Map(library.map((exercise, index) => [exercise.id, index]));
  const state: State = {
    input,
    bands: trackedBands(input),
    pool,
    byId,
    order,
    sessions: emptySessions(input.daysPerWeek),
    share: OPTIMIZER_TIME_SHARE,
  };

  // 1. Structure: the slots of each kind of session, trimmed from the end to fit the time.
  const seen = new Map<SessionKind, number>();
  for (const session of state.sessions) {
    const occurrence = seen.get(session.kind) ?? 0;
    seen.set(session.kind, occurrence + 1);
    for (const sloted of SLOTS[session.kind]) {
      const exercise = chooseFor(state, session, occurrence, sloted);
      if (!exercise) continue;
      session.entries.push({ exerciseId: exercise.id, sets: MIN_SETS_PER_EXERCISE });
    }
  }

  // 2. Sets: bring every tracked muscle to its target. 3. Extra exercises for what is still short.
  optimize(state);
  for (let extra = 0; extra < 40 && underMinimum(state).size > 0; extra += 1) {
    if (!addExtra(state)) break;
    optimize(state);
  }
  for (let attempt = 0; attempt < 4 && underMinimum(state).size > 0; attempt += 1) {
    if (!dropAndRebalance(state)) break;
  }
  // Now that the small muscles have their slot, the sets may use the whole budget.
  state.share = 1;
  optimize(state);
  state.sessions.forEach((_, index) => addCore(state, index));
  for (const session of state.sessions) orderEntries(session, byId);
  return { sessions: state.sessions };
}

/** Whole-week direct-equivalent volume per muscle (units / 2). */
export function weeklySets(plan: Plan, byId: ReadonlyMap<string, Exercise>): Map<Muscle, number> {
  return new Map([...weekUnits(plan.sessions, byId)].map(([muscle, value]) => [muscle, value / 2]));
}
