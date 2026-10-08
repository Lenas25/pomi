// "Meta de hoy" for one `sets` exercise (PLAN §9.4, double progression). Pure: returns i18n KEYS
// and params, never text.
import { parseReps } from './reps';

export type TargetMessageKey =
  | 'gym.target.weightUp'
  | 'gym.target.addRep'
  | 'gym.target.noHistory'
  | 'gym.target.chooseWeight'
  | 'gym.target.stalled'
  | 'gym.target.deload'
  | 'gym.target.deloadWeek'
  | 'gym.target.weightUpSuggested';

export type TargetMessage = {
  key: TargetMessageKey;
  params: Record<string, string | number>;
};

export type LoggedSet = {
  weightKg: number | null;
  reps: number | null;
  /** Reps in reserve; `null` = not recorded. */
  rir: number | null;
};

/** One past session of an exercise. History is keyed by step id globally (any routine). */
export type ExerciseSession = {
  date: string;
  sets: readonly LoggedSet[];
};

/** The part of a `sets` step the target needs; the rep range comes from TODAY's routine. */
export type TargetStep = {
  sets: number;
  reps: string;
  incrementKg?: number;
  weightHint?: string;
};

export type TargetRules = { stallSessions: number; deloadPct: number };

export const DEFAULT_TARGET_RULES: TargetRules = { stallSessions: 3, deloadPct: 10 };

export type TodayTargetKind =
  /** Reached the top of the range everywhere: more weight (or +1 rep without weight). */
  | 'increase'
  /** Same weight, +1 rep on the sets that fell short. */
  | 'add-rep'
  | 'no-history'
  /** Time-based or unparseable `reps`: no automatic progression. */
  | 'manual';

export type TodayTarget = {
  kind: TodayTargetKind;
  /** Working weight for today; `null` for bodyweight or when there is no reference. */
  weightKg: number | null;
  /** Target reps per set (length = `step.sets`); empty for `manual` / unparseable. */
  reps: number[];
  /** Why this target (key + params), when there is history. */
  reason: TargetMessage | null;
  /** Extra non-blocking suggestions: stall review, deload, "go heavier". */
  suggestions: TargetMessage[];
  /** `no-history` only: the template's weight hint and the "choose a weight" text. */
  hint: TargetMessage[];
};

const RIR_EASY = 3;
const RIR_EASY_SESSIONS = 2;

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function isDone(set: LoggedSet): boolean {
  return set.reps !== null && set.reps > 0;
}

function doneSets(session: ExerciseSession): LoggedSet[] {
  return session.sets.filter(isDone);
}

/** Working weight of a session: the heaviest set (warm-up ramps would otherwise mislead). */
function workingWeight(session: ExerciseSession): number | null {
  const weights = doneSets(session)
    .map((s) => s.weightKg)
    .filter((w): w is number => w !== null && w > 0);
  return weights.length > 0 ? Math.max(...weights) : null;
}

function totalReps(session: ExerciseSession): number {
  return doneSets(session).reduce((sum, s) => sum + (s.reps ?? 0), 0);
}

/** Better than `previous`: heavier, or same weight with more total reps. */
function improved(current: ExerciseSession, previous: ExerciseSession): boolean {
  const a = workingWeight(current) ?? 0;
  const b = workingWeight(previous) ?? 0;
  if (a !== b) return a > b;
  return totalReps(current) > totalReps(previous);
}

/** Allowed distance (in percentage points) between an actual weight drop and `deloadPct`. */
const DELOAD_TOLERANCE_PCT = 5;

/** `current` is a deload of `previous`: the working weight dropped by about `deloadPct`. */
function isDeload(current: ExerciseSession, previous: ExerciseSession, deloadPct: number): boolean {
  const now = workingWeight(current);
  const before = workingWeight(previous);
  if (now === null || before === null || now >= before) return false;
  const dropPct = (1 - now / before) * 100;
  return Math.abs(dropPct - deloadPct) <= DELOAD_TOLERANCE_PCT;
}

/**
 * Stalled when each of the last `stallSessions` sessions failed to improve on the one before it
 * (so it needs `stallSessions + 1` sessions). `history` is ordered most recent FIRST.
 * A deload (weight drop of about `deloadPct`) resets the window: the deload session becomes the new
 * baseline, so the stall suggestion does not fire again right after taking the lighter week.
 */
export function isStalled(
  fullHistory: readonly ExerciseSession[],
  stallSessions: number,
  deloadPct: number,
): boolean {
  const deloadIndex = fullHistory.findIndex((session, i) => {
    const previous = fullHistory[i + 1];
    return previous !== undefined && isDeload(session, previous, deloadPct);
  });
  const history = deloadIndex === -1 ? fullHistory : fullHistory.slice(0, deloadIndex + 1);
  if (history.length < stallSessions + 1) return false;
  for (let i = 0; i < stallSessions; i += 1) {
    const current = history[i];
    const previous = history[i + 1];
    if (!current || !previous || improved(current, previous)) return false;
  }
  return true;
}

/**
 * During an accepted deload week the working weight is lowered by `pct` (rounded to 0.5 kg).
 * Bodyweight targets (no weight) are left alone.
 */
export function applyDeload(target: TodayTarget, pct: number): TodayTarget {
  if (target.weightKg === null || target.kind === 'manual') return target;
  const weightKg = roundHalf(target.weightKg * (1 - pct / 100));
  return {
    ...target,
    weightKg,
    reason: { key: 'gym.target.deloadWeek', params: { weightKg, pct } },
  };
}

/** Every logged set had RIR >= 3 (sets without RIR disqualify the session). */
function wasEasy(session: ExerciseSession): boolean {
  const sets = doneSets(session);
  return sets.length > 0 && sets.every((s) => s.rir !== null && s.rir >= RIR_EASY);
}

/**
 * @param history past sessions of this exercise (by step id), most recent FIRST. Sessions with no
 *   completed set are ignored.
 */
export function todayTarget(
  step: TargetStep,
  history: readonly ExerciseSession[],
  rules: TargetRules = DEFAULT_TARGET_RULES,
): TodayTarget {
  const parsed = parseReps(step.reps);
  const past = history.filter((session) => doneSets(session).length > 0);
  const last = past[0];

  if (!parsed || parsed.kind !== 'reps') {
    return {
      kind: 'manual',
      weightKg: last ? workingWeight(last) : null,
      reps: [],
      reason: null,
      suggestions: [],
      hint: [],
    };
  }

  const { min, max } = parsed;

  // Case 5: no history.
  if (!last) {
    return {
      kind: 'no-history',
      weightKg: null,
      reps: Array.from({ length: step.sets }, () => min),
      reason: null,
      suggestions: [],
      hint: [
        { key: 'gym.target.noHistory', params: { weightHint: step.weightHint ?? '' } },
        { key: 'gym.target.chooseWeight', params: {} },
      ],
    };
  }

  const lastWeight = workingWeight(last);
  // Top-of-range check (case 1): lighter warm-up / drop sets (fatigue) are ignored here, and only
  // here. The per-set targets of case 2 index the UNFILTERED last session, so neither skipped
  // nor lighter sets shift the positions of the plan.
  const lastDone = last.sets.filter(
    (s) => isDone(s) && !(lastWeight !== null && s.weightKg !== null && s.weightKg < lastWeight),
  );
  const canAddWeight = step.incrementKg !== undefined && lastWeight !== null;
  const allAtTop =
    lastDone.length >= step.sets &&
    lastDone.every((s) => (s.reps ?? 0) >= max && (s.rir === null || s.rir >= 1));

  const suggestions: TargetMessage[] = [];
  let kind: TodayTargetKind;
  let weightKg: number | null = lastWeight;
  let reps: number[];
  let reason: TargetMessage;

  if (allAtTop && canAddWeight) {
    // Case 1: top of the range everywhere (and not grinding) -> heavier, back to the minimum.
    kind = 'increase';
    weightKg = lastWeight + (step.incrementKg ?? 0);
    reps = Array.from({ length: step.sets }, () => min);
    reason = {
      key: 'gym.target.weightUp',
      params: {
        weightKg,
        reps: min,
        lastWeightKg: lastWeight,
        lastReps: Math.max(...lastDone.map((s) => s.reps ?? 0)),
      },
    };
  } else if (allAtTop) {
    // Bodyweight / no increment: the only progression is +1 rep on top of the best set, beyond
    // the range if needed (so 11 -> 12 in the next session too).
    kind = 'increase';
    const next = Math.max(...lastDone.map((s) => s.reps ?? 0)) + 1;
    reps = Array.from({ length: step.sets }, () => next);
    reason = { key: 'gym.target.addRep', params: { weightKg: lastWeight ?? 0, reps: next } };
  } else {
    // Case 2: same weight, +1 rep on EVERY set below the top (capped at the top, floored at the
    // minimum). Indices follow the unfiltered last session so skipped or lighter sets do not shift them.
    kind = 'add-rep';
    const raised: number[] = [];
    reps = Array.from({ length: step.sets }, (_, index) => {
      const set = last.sets[index];
      const lastReps = set !== undefined && isDone(set) ? (set.reps ?? 0) : null;
      if (lastReps === null) {
        raised.push(min);
        return min;
      }
      if (lastReps >= max) return max;
      const target = Math.max(lastReps + 1, min);
      raised.push(target);
      return target;
    });
    reason = {
      key: 'gym.target.addRep',
      // The smallest raised target: what the weakest set has to reach.
      params: { weightKg: lastWeight ?? 0, reps: raised.length > 0 ? Math.min(...raised) : max },
    };
  }

  // Case 3: stalled -> review sleep/rest or take a lighter week.
  if (isStalled(past, rules.stallSessions, rules.deloadPct)) {
    suggestions.push({ key: 'gym.target.stalled', params: { sessions: rules.stallSessions } });
    if (lastWeight !== null) {
      suggestions.push({
        key: 'gym.target.deload',
        params: {
          weightKg: roundHalf(lastWeight * (1 - rules.deloadPct / 100)),
          pct: rules.deloadPct,
        },
      });
    }
  }

  // Case 4: RIR >= 3 in every set for 2 sessions -> go heavier even without reaching the top.
  const recent = past.slice(0, RIR_EASY_SESSIONS);
  if (
    canAddWeight &&
    kind !== 'increase' &&
    recent.length === RIR_EASY_SESSIONS &&
    recent.every(wasEasy)
  ) {
    suggestions.push({
      key: 'gym.target.weightUpSuggested',
      params: { weightKg: lastWeight + (step.incrementKg ?? 0) },
    });
  }

  return { kind, weightKg, reps, reason, suggestions, hint: [] };
}
