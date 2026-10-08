// String form <-> step. The screens keep what was typed as text; this decides if it is a step.
import { slugify, uniqueId } from './reducer';
import { sameRepsRange, validateStep } from './validate';
import type { EditorErrorCode, Program, Step } from './types';
import {
  allTexts,
  localizedText,
  withLocalizedText,
  type LocalizedText,
} from '../../templates/localized';
import { parseReps, repsRangeSpan } from '../gym/reps';

export const CUSTOM_STEP_KINDS = ['check', 'wait', 'timed'] as const;
export type CustomStepKind = (typeof CUSTOM_STEP_KINDS)[number];

export type StepForm = {
  name: string;
  how: string;
  /** Comma separated muscle ids. */
  muscles: string;
  sets: string;
  reps: string;
  /**
   * The reps in the OTHER language (`otherLanguage`), edited only when a new range could not be
   * carried into it (`editReps(...).stale`); empty when the reps have one language.
   */
  repsOther: string;
  restSec: string;
  weightHint: string;
  incrementKg: string;
  waitSec: string;
  /** Minutes (decimals allowed) of a timed step. */
  totalMin: string;
  target: string;
};

const text = (value: LocalizedText | undefined, language: string): string =>
  localizedText(value, language) ?? '';
const num = (value: number | undefined): string => (value === undefined ? '' : String(value));

/** The form shows (and edits) the texts in `language`; the other language is kept on save. */
export function formFromStep(step: Step, language = 'es'): StepForm {
  return {
    name: localizedText(step.name, language),
    how: text(step.how, language),
    muscles: (step.muscles ?? []).join(', '),
    sets: step.type === 'sets' ? num(step.sets) : '',
    reps: step.type === 'sets' ? localizedText(step.reps, language) : '',
    repsOther:
      step.type === 'sets' && typeof step.reps !== 'string'
        ? (step.reps[otherLanguage(language)] ?? '')
        : '',
    restSec: step.type === 'sets' ? num(step.restSec) : '',
    weightHint: step.type === 'sets' ? text(step.weightHint, language) : '',
    incrementKg: step.type === 'sets' ? num(step.incrementKg) : '',
    waitSec: step.type === 'wait' ? num(step.waitSec) : '',
    totalMin: step.type === 'timed' ? String(step.totalSec / 60) : '',
    target: step.type === 'counter' ? num(step.target) : '',
  };
}

/** `NaN` for an empty or unreadable number; accepts a decimal comma. */
export function parseNumber(value: string): number {
  const trimmed = value.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

const parseMuscles = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

/** The language a two-language text keeps while `language` is edited. */
export const otherLanguage = (language: string): 'es' | 'en' => (language === 'en' ? 'es' : 'en');

/**
 * `text` with its number or range replaced by the one in `typed` ("8–10 per leg" + "6–8 por
 * pierna" -> "6–8 per leg"), when the result means exactly what `typed` means; otherwise null.
 */
export function carryRange(text: string, typed: string): string | null {
  const target = parseReps(typed);
  const from = repsRangeSpan(typed);
  const into = repsRangeSpan(text);
  if (target === null || from === null || into === null) return null;
  const next = text.slice(0, into.start) + typed.slice(from.start, from.end) + text.slice(into.end);
  return JSON.stringify(parseReps(next)) === JSON.stringify(target) ? next : null;
}

export type RepsEdit = {
  reps: LocalizedText;
  /** The other language still holds a different range: the person must review it. */
  stale: boolean;
};

/**
 * Reps are numbers first. The typed text replaces the active language; the other language follows
 * the new range when its text allows it (same suffix, "por pierna" <-> "per leg"). When it does not,
 * it is kept as written (never dropped, never replaced by this language) and marked `stale`;
 * `otherTyped` (what the person wrote for it after the notice) then replaces it.
 */
export function editReps(
  previous: LocalizedText,
  typed: string,
  language: string,
  otherTyped?: string,
): RepsEdit {
  const next = withLocalizedText(previous, language, typed);
  // Unreadable typed reps are a `repsInvalid` error, not a review of the other language.
  if (typeof next === 'string' || sameRepsRange(next) || parseReps(typed) === null) {
    return { reps: next, stale: false };
  }
  const other = otherLanguage(language);
  const kept = next[other] ?? '';
  const carried = carryRange(kept, typed);
  if (carried !== null) return { reps: { ...next, [other]: carried }, stale: false };
  if (otherTyped !== undefined && otherTyped !== '' && otherTyped !== kept) {
    const reviewed = { ...next, [other]: otherTyped };
    return { reps: reviewed, stale: !sameRepsRange(reviewed) };
  }
  return { reps: next, stale: true };
}

export type StepFormResult = { ok: true; step: Step } | { ok: false; errors: EditorErrorCode[] };

/**
 * Applies the form to `base`. The id (and the type) never change, and fields the form does not
 * show (`holdSec`, `approach`, `bodyweight`, `when`, `segments`) are kept as they were.
 */
export function applyForm(base: Step, form: StepForm, language = 'es'): StepFormResult {
  const edit = (previous: LocalizedText | undefined, value: string) =>
    withLocalizedText(previous, language, value.trim());
  // Optional free text: clearing it in one language only blanks that language; the field goes
  // away only when no language has text left.
  const optional = (previous: LocalizedText | undefined, value: string) => {
    const next = edit(previous, value);
    return allTexts(next).every((text) => text.trim() === '') ? undefined : next;
  };
  const how = optional(base.how, form.how);
  const common = {
    name: edit(base.name, form.name),
    ...(how !== undefined ? { how } : {}),
    ...(parseMuscles(form.muscles).length > 0 ? { muscles: parseMuscles(form.muscles) } : {}),
  };
  let step: Step;
  switch (base.type) {
    case 'sets': {
      const { how: _h, muscles: _m, weightHint: _w, incrementKg: _i, ...kept } = base;
      const weightHint = optional(base.weightHint, form.weightHint);
      step = {
        ...kept,
        ...common,
        sets: parseNumber(form.sets),
        reps: editReps(base.reps, form.reps.trim(), language, form.repsOther.trim()).reps,
        restSec: parseNumber(form.restSec),
        ...(weightHint !== undefined ? { weightHint } : {}),
        ...(form.incrementKg.trim() ? { incrementKg: parseNumber(form.incrementKg) } : {}),
      };
      break;
    }
    case 'wait': {
      const { how: _h, muscles: _m, ...kept } = base;
      step = { ...kept, ...common, waitSec: parseNumber(form.waitSec) };
      break;
    }
    case 'timed': {
      const { how: _h, muscles: _m, ...kept } = base;
      const totalSec = Math.round(parseNumber(form.totalMin) * 60);
      step = { ...kept, ...common, totalSec, segments: fitSegments(base.segments, totalSec) };
      break;
    }
    case 'counter': {
      const { how: _h, muscles: _m, ...kept } = base;
      step = { ...kept, ...common, target: parseNumber(form.target) };
      break;
    }
    case 'check': {
      const { how: _h, muscles: _m, ...kept } = base;
      step = { ...kept, ...common };
      break;
    }
  }
  const errors = validateStep(step);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, step };
}

/**
 * Segments that start at or after the end of the step could never be announced, so a shorter
 * duration drops them. The first segment is never lost: if all are out, it moves to the start.
 */
export function fitSegments(
  segments: readonly { atSec: number; label: LocalizedText }[],
  totalSec: number,
): { atSec: number; label: LocalizedText }[] {
  if (!(totalSec > 0)) return [...segments];
  const inside = segments.filter((segment) => segment.atSec < totalSec);
  const first = segments[0];
  if (inside.length === 0 && first) return [{ ...first, atSec: 0 }];
  return inside;
}

export function stepIdsOf(program: Program): Set<string> {
  return new Set(program.routines.flatMap((routine) => routine.steps.map((step) => step.id)));
}

/**
 * A new step of the person's own (not from the library). The id is new and unique in the whole
 * program and against `reserved` (logged step ids), so it never collides with the history of
 * another exercise.
 */
export function newCustomStep(
  kind: CustomStepKind,
  name: string,
  program: Program,
  /** Ids that must not be reused either: steps with logged sets, even if no longer in the program. */
  reserved: ReadonlySet<string> = new Set(),
): Step {
  const id = uniqueId(`custom-${slugify(name)}`, new Set([...stepIdsOf(program), ...reserved]));
  const trimmed = name.trim();
  switch (kind) {
    case 'check':
      return { type: 'check', id, name: trimmed };
    case 'wait':
      return { type: 'wait', id, name: trimmed, waitSec: 60 };
    case 'timed':
      return {
        type: 'timed',
        id,
        name: trimmed,
        totalSec: 600,
        segments: [{ atSec: 0, label: trimmed }],
      };
  }
}
