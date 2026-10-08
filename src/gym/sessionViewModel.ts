// Pure view-model for the gym session: maps stored sets to what the screen shows ("Meta de hoy",
// "la última vez", the greyed previous values), resolves what a ✓ with empty inputs logs, and
// summarizes the finished session. No React, no database: callers pass plain data.
import {
  DEFAULT_TARGET_RULES,
  todayTarget,
  type ExerciseSession,
  type LoggedSet,
  type TargetRules,
  type TodayTarget,
} from '../domain/gym/todayTarget';
import { parseReps } from '../domain/gym/reps';
import type { Step } from '../templates/schema';

export type SetsStep = Extract<Step, { type: 'sets' }>;

/** A stored set, as the repository returns it (only the fields the view-model needs). */
export type StoredSet = {
  stepId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
};

/** One past session of one exercise, most recent first when in a list. */
export type StoredSession = { date: string; sets: readonly StoredSet[] };

export type PreviousSet = { weightKg: number | null; reps: number | null };

/**
 * Converts stored sets into the domain shape, ordered by set index. Gaps (a skipped set) become
 * empty entries so per-set targets keep their position (see todayTarget case 2).
 */
export function toExerciseSession(session: StoredSession): ExerciseSession {
  const byIndex = new Map(session.sets.map((set) => [set.setIndex, set]));
  const length = Math.max(0, ...session.sets.map((set) => set.setIndex + 1));
  const sets: LoggedSet[] = Array.from({ length }, (_, index) => {
    const set = byIndex.get(index);
    return set
      ? { weightKg: set.weightKg, reps: set.reps, rir: set.rir }
      : { weightKg: null, reps: null, rir: null };
  });
  return { date: session.date, sets };
}

export type ExerciseView = {
  stepId: string;
  target: TodayTarget;
  /** "La última vez": the most recent finished session, for display. */
  lastTime: { date: string; sets: readonly PreviousSet[] } | null;
  /** Greyed "anterior" value per planned set, from the most recent finished session. */
  previous: PreviousSet[];
  /** Per-set target reps (falls back to the last one when the plan has fewer entries). */
  targetReps: (setIndex: number) => number | null;
  /** True when the reps are seconds / unparseable and the target must be read as text. */
  timeBased: boolean;
};

export function buildExerciseView(
  step: SetsStep,
  history: readonly StoredSession[],
  rules: TargetRules = DEFAULT_TARGET_RULES,
): ExerciseView {
  const sessions = history.map(toExerciseSession);
  const target = todayTarget(
    {
      sets: step.sets,
      reps: step.reps,
      ...(step.incrementKg !== undefined ? { incrementKg: step.incrementKg } : {}),
      ...(step.weightHint !== undefined ? { weightHint: step.weightHint } : {}),
    },
    sessions,
    rules,
  );
  const latest = sessions.find((session) => session.sets.some((set) => (set.reps ?? 0) > 0));
  const previous: PreviousSet[] = Array.from({ length: step.sets }, (_, index) => {
    const set = latest?.sets[index];
    return set && (set.reps ?? 0) > 0
      ? { weightKg: set.weightKg, reps: set.reps }
      : { weightKg: null, reps: null };
  });
  const parsed = parseReps(step.reps);

  return {
    stepId: step.id,
    target,
    lastTime: latest
      ? {
          date: latest.date,
          sets: latest.sets
            .filter((set) => (set.reps ?? 0) > 0)
            .map((set) => ({ weightKg: set.weightKg, reps: set.reps })),
        }
      : null,
    previous,
    targetReps: (setIndex) => target.reps[setIndex] ?? target.reps.at(-1) ?? null,
    timeBased: parsed === null || parsed.kind === 'time',
  };
}

/** Parses a typed number ("42.5" or "42,5"); empty or invalid text is `null`. */
export function parseNumberInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export type SetInputs = { weightText: string; repsText: string };

export type ResolvedSet = { weightKg: number | null; reps: number | null };

/**
 * What a ✓ logs. An empty input uses the "anterior" value of that set; with no previous value it
 * falls back to today's target. Bodyweight sets never log a weight.
 */
export function resolveSetValues(
  inputs: SetInputs,
  context: {
    previous: PreviousSet;
    targetWeightKg: number | null;
    targetReps: number | null;
    bodyweight: boolean;
  },
): ResolvedSet {
  const typedWeight = parseNumberInput(inputs.weightText);
  const typedReps = parseNumberInput(inputs.repsText);
  const reps = typedReps ?? context.previous.reps ?? context.targetReps;
  return {
    weightKg: context.bodyweight
      ? null
      : (typedWeight ?? context.previous.weightKg ?? context.targetWeightKg),
    reps: reps === null ? null : Math.round(reps),
  };
}

export type SummaryExercise = { step: SetsStep; target: TodayTarget };
export type SummaryLog = StoredSet;

export type SessionSummary = {
  setsDone: number;
  setsPlanned: number;
  /** Σ kg × reps over the logged sets (bodyweight sets add nothing). */
  volumeKg: number;
  targetsMet: number;
  /** Exercises that had a target (not manual and not without history). */
  targetsTotal: number;
};

export function plannedSetCount(exercises: readonly SummaryExercise[]): number {
  return exercises.reduce((sum, { step }) => sum + step.sets, 0);
}

/**
 * Target met = every planned set is logged with at least the target reps and, when the target has a
 * weight, at least that weight.
 */
function targetMet({ step, target }: SummaryExercise, logs: readonly SummaryLog[]): boolean {
  const mine = logs.filter((log) => log.stepId === step.id && (log.reps ?? 0) > 0);
  return Array.from({ length: step.sets }, (_, index) => {
    const log = mine.find((entry) => entry.setIndex === index);
    const wantedReps = target.reps[index] ?? target.reps.at(-1) ?? 0;
    if (!log) return false;
    if ((log.reps ?? 0) < wantedReps) return false;
    return target.weightKg === null || (log.weightKg ?? 0) >= target.weightKg;
  }).every(Boolean);
}

export function summarizeSession(
  exercises: readonly SummaryExercise[],
  logs: readonly SummaryLog[],
): SessionSummary {
  const stepIds = new Set(exercises.map(({ step }) => step.id));
  const relevant = logs.filter((log) => stepIds.has(log.stepId) && (log.reps ?? 0) > 0);
  const withTarget = exercises.filter(
    ({ target }) => target.kind === 'increase' || target.kind === 'add-rep',
  );
  return {
    setsDone: relevant.length,
    setsPlanned: plannedSetCount(exercises),
    volumeKg: relevant.reduce((sum, log) => sum + (log.weightKg ?? 0) * (log.reps ?? 0), 0),
    targetsMet: withTarget.filter((exercise) => targetMet(exercise, relevant)).length,
    targetsTotal: withTarget.length,
  };
}

/** At most one decimal, no trailing ".0" ("42.5", "40"). */
export function formatKg(value: number): string {
  return String(Math.round(value * 10) / 10);
}
