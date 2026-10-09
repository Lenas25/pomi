// Pure view-model for the gym session: maps stored sets to what the screen shows ("Meta de hoy",
// "la última vez", the greyed previous values), resolves what a ✓ with empty inputs logs, and
// summarizes the finished session. No React, no database: callers pass plain data.
import {
  DEFAULT_TARGET_RULES,
  applyDeload,
  todayTarget,
  type ExerciseSession,
  type LoggedSet,
  type TargetRules,
  type TodayTarget,
} from '../domain/gym/todayTarget';
import { parseReps } from '../domain/gym/reps';
import type { Language } from '../i18n/types';
import type { Step } from '../templates/schema';
import { sourceText } from '../templates/localized';
import { templateText } from '../i18n/templateText';

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
  /** Percentage to lower the weight by during an accepted deload week. */
  deloadPct?: number,
): ExerciseView {
  const sessions = history.map(toExerciseSession);
  const planned = todayTarget(
    {
      sets: step.sets,
      // Parsing is language-agnostic: the source (Spanish) text is the one parsed.
      reps: sourceText(step.reps),
      ...(step.incrementKg !== undefined ? { incrementKg: step.incrementKg } : {}),
      ...(step.weightHint !== undefined ? { weightHint: templateText(step.weightHint) } : {}),
    },
    sessions,
    rules,
  );
  const target = deloadPct === undefined ? planned : applyDeload(planned, deloadPct);
  const latest = sessions.find((session) => session.sets.some((set) => (set.reps ?? 0) > 0));
  const previous: PreviousSet[] = Array.from({ length: step.sets }, (_, index) => {
    const set = latest?.sets[index];
    return set && (set.reps ?? 0) > 0
      ? { weightKg: set.weightKg, reps: set.reps }
      : { weightKg: null, reps: null };
  });
  const parsed = parseReps(sourceText(step.reps));

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

/** Result of reading a typed number: `value: null` means the field was left empty. */
export type ParsedInput = { ok: true; value: number | null } | { ok: false };

const KG_PATTERN = /^\d{1,4}([.,]\d)?$/;
const REPS_PATTERN = /^\d{1,3}$/;

/** Kilograms: up to 4 digits and one decimal ("42.5" or "42,5"), rounded to 0.1. Empty is fine. */
export function parseKgInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!KG_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, value: Math.round(Number(trimmed.replace(',', '.')) * 10) / 10 };
}

/** Repetitions: 1 to 3 digits, at least 1. Empty is fine. */
export function parseRepsInput(text: string): ParsedInput {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!REPS_PATTERN.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return value >= 1 ? { ok: true, value } : { ok: false };
}

export type SetInputs = { weightText: string; repsText: string };

export type ResolvedSet = { weightKg: number | null; reps: number | null };

export type InputErrors = { weight: boolean; reps: boolean };

/** Which typed fields are invalid (never a silent fallback). Bodyweight sets have no kg input. */
export function validateSetInputs(inputs: SetInputs, bodyweight: boolean): InputErrors {
  return {
    weight: !bodyweight && !parseKgInput(inputs.weightText).ok,
    reps: !parseRepsInput(inputs.repsText).ok,
  };
}

/**
 * What a ✓ logs for VALID inputs (see `validateSetInputs`; an invalid field reads as empty here).
 * An empty input uses the "anterior" value of that set; with no previous value it
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
  const weight = parseKgInput(inputs.weightText);
  const repsInput = parseRepsInput(inputs.repsText);
  const typedWeight = weight.ok ? weight.value : null;
  const typedReps = repsInput.ok ? repsInput.value : null;
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

/** At most one decimal, no trailing ".0", decimal comma in Spanish ("42,5", "40"). */
export function formatKg(value: number, language: Language = 'en'): string {
  const text = String(Math.round(value * 10) / 10);
  return language === 'es' ? text.replace('.', ',') : text;
}

/** Target messages carry raw numbers; weights are shown with the locale's decimal separator. */
export function localizeTargetParams(
  params: Record<string, string | number>,
  language: Language,
): Record<string, string | number> {
  const result: Record<string, string | number> = { ...params };
  for (const key of ['weightKg', 'lastWeightKg']) {
    const value = result[key];
    if (typeof value === 'number') result[key] = formatKg(value, language);
  }
  return result;
}

/**
 * Groups the logs by step, REUSING the previous array of a step whose logs did not change, so a
 * memoized exercise card re-renders only when its own sets change.
 */
export function groupLogsByStep(
  logs: readonly StoredSet[],
  previous: ReadonlyMap<string, readonly StoredSet[]> = new Map(),
): Map<string, readonly StoredSet[]> {
  const fresh = new Map<string, StoredSet[]>();
  for (const log of logs) {
    const list = fresh.get(log.stepId);
    if (list) list.push(log);
    else fresh.set(log.stepId, [log]);
  }
  const result = new Map<string, readonly StoredSet[]>();
  for (const [stepId, list] of fresh) {
    const before = previous.get(stepId);
    const same =
      before !== undefined &&
      before.length === list.length &&
      before.every((log, index) => log === list[index]);
    result.set(stepId, same ? before : list);
  }
  return result;
}

/**
 * The numbers of the concise "meta de hoy" (shown as "Hoy: 40 kg × 9" / "Hoy: 8–10 reps" by the
 * card): the weight (`null` for bodyweight or no weight) and the reps or reps range over the
 * sets. `null` when the target has no reps (manual / unparseable): the card shows its text.
 */
export function targetSummary(
  target: Pick<TodayTarget, 'weightKg' | 'reps'>,
  bodyweight: boolean,
  language: Language,
): { kg: string | null; reps: string } | null {
  if (target.reps.length === 0) return null;
  const low = Math.min(...target.reps);
  const high = Math.max(...target.reps);
  const reps = low === high ? String(low) : `${low}–${high}`;
  const kg = bodyweight || target.weightKg === null ? null : formatKg(target.weightKg, language);
  return { kg, reps };
}
