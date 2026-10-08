// String form <-> step. The screens keep what was typed as text; this decides if it is a step.
import { slugify, uniqueId } from './reducer';
import { validateStep } from './validate';
import type { EditorErrorCode, Program, Step } from './types';
import {
  allTexts,
  localizedText,
  withLocalizedText,
  type LocalizedText,
} from '../../templates/localized';
import { parseReps } from '../gym/reps';

export const CUSTOM_STEP_KINDS = ['check', 'wait', 'timed'] as const;
export type CustomStepKind = (typeof CUSTOM_STEP_KINDS)[number];

export type StepForm = {
  name: string;
  how: string;
  /** Comma separated muscle ids. */
  muscles: string;
  sets: string;
  reps: string;
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

/**
 * Reps are numbers first: an edit keeps the other language only while it still means the same
 * (same parsed range); otherwise the typed text replaces both, so no language shows stale numbers.
 */
export function editReps(previous: LocalizedText, typed: string, language: string): LocalizedText {
  const next = withLocalizedText(previous, language, typed);
  if (typeof next === 'string') return next;
  const parsed = allTexts(next).map((text) => JSON.stringify(parseReps(text)));
  return parsed.every((value) => value === parsed[0]) ? next : typed;
}

export type StepFormResult = { ok: true; step: Step } | { ok: false; errors: EditorErrorCode[] };

/**
 * Applies the form to `base`. The id (and the type) never change, and fields the form does not
 * show (`holdSec`, `approach`, `bodyweight`, `when`, `segments`) are kept as they were.
 */
export function applyForm(base: Step, form: StepForm, language = 'es'): StepFormResult {
  const edit = (previous: LocalizedText | undefined, value: string) =>
    withLocalizedText(previous, language, value.trim());
  const common = {
    name: edit(base.name, form.name),
    ...(form.how.trim() ? { how: edit(base.how, form.how) } : {}),
    ...(parseMuscles(form.muscles).length > 0 ? { muscles: parseMuscles(form.muscles) } : {}),
  };
  let step: Step;
  switch (base.type) {
    case 'sets': {
      const { how: _h, muscles: _m, weightHint: _w, incrementKg: _i, ...kept } = base;
      step = {
        ...kept,
        ...common,
        sets: parseNumber(form.sets),
        reps: editReps(base.reps, form.reps.trim(), language),
        restSec: parseNumber(form.restSec),
        ...(form.weightHint.trim() ? { weightHint: edit(base.weightHint, form.weightHint) } : {}),
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
