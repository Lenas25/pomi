// Check-in answers (PLAN §10): question lists come from the metrics template (`checkins.morning`
// / `checkins.night`); this module prefills, validates and maps them. Answers are stored keyed by
// question id: `time` -> "HH:mm", `scale` -> integer, `text` -> trimmed string (omitted if empty).
import type { CheckinQuestion } from '../../templates/schema';
import { clockToMinutes, minutesToClock } from '../time';
import type { MorningCheckin } from '../formulas/sleep';

export type CheckinKind = 'morning' | 'night';

export type AnswerValue = string | number;
export type CheckinAnswers = Record<string, AnswerValue>;

/** Step of the one-tap time adjustment (PLAN §10: "se ajustan con un toque"). */
export const TIME_ADJUST_MIN = 15;
export const MAX_NOTE_LENGTH = 280;

export type PrefillContext = {
  /** Planned bedtime of last night (derived: wake − sleep target). */
  bed?: string | undefined;
  /** Planned wake time. */
  wake?: string | undefined;
};

/** Starting answers: times from the plan; scales stay empty (the person must tap one). */
export function initialAnswers(
  questions: readonly CheckinQuestion[],
  context: PrefillContext,
  previous: CheckinAnswers = {},
): CheckinAnswers {
  const answers: CheckinAnswers = {};
  for (const question of questions) {
    const saved = previous[question.id];
    if (saved !== undefined) {
      answers[question.id] = saved;
    } else if (question.type === 'time' && question.prefill !== undefined) {
      const value = context[question.prefill];
      if (value !== undefined) answers[question.id] = value;
    }
  }
  return answers;
}

/** `clock` moved by `deltaMin`, wrapping around midnight. */
export function adjustClock(clock: string, deltaMin: number): string {
  return minutesToClock(clockToMinutes(clock) + deltaMin);
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ValidationResult =
  { ok: true; answers: CheckinAnswers } | { ok: false; missing: string[]; invalid: string[] };

/**
 * Required questions need an answer; scales must be an integer inside the template range, times a
 * valid `HH:mm`. Unknown keys are dropped. Optional empty answers are omitted.
 */
export function validateAnswers(
  questions: readonly CheckinQuestion[],
  raw: Readonly<Record<string, AnswerValue | undefined>>,
): ValidationResult {
  const answers: CheckinAnswers = {};
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const question of questions) {
    const value = raw[question.id];
    const empty = value === undefined || (typeof value === 'string' && value.trim() === '');
    if (empty) {
      if (question.optional !== true) missing.push(question.id);
      continue;
    }
    if (question.type === 'scale') {
      const [min, max] = question.scale;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        invalid.push(question.id);
      } else answers[question.id] = value;
    } else if (question.type === 'time') {
      if (typeof value !== 'string' || !CLOCK.test(value)) invalid.push(question.id);
      else answers[question.id] = value;
    } else if (typeof value !== 'string') {
      invalid.push(question.id);
    } else {
      answers[question.id] = value.trim().slice(0, MAX_NOTE_LENGTH);
    }
  }

  return missing.length > 0 || invalid.length > 0
    ? { ok: false, missing, invalid }
    : { ok: true, answers };
}

/** A saved morning check-in as sleep stats input (needs both prefilled time questions answered). */
export function toMorningCheckin(
  date: string,
  questions: readonly CheckinQuestion[],
  answers: Readonly<Record<string, unknown>>,
): MorningCheckin | null {
  const timeFor = (slot: 'bed' | 'wake'): string | null => {
    const question = questions.find((q) => q.type === 'time' && q.prefill === slot);
    const value = question ? answers[question.id] : undefined;
    return typeof value === 'string' && CLOCK.test(value) ? value : null;
  };
  const bed = timeFor('bed');
  const wake = timeFor('wake');
  return bed !== null && wake !== null ? { date, bed, wake } : null;
}
