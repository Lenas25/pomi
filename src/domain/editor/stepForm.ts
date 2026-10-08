// String form <-> step. The screens keep what was typed as text; this decides if it is a step.
import { slugify, uniqueId } from './reducer';
import { validateStep } from './validate';
import type { EditorErrorCode, Program, Step } from './types';

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

const text = (value: string | undefined): string => value ?? '';
const num = (value: number | undefined): string => (value === undefined ? '' : String(value));

export function formFromStep(step: Step): StepForm {
  return {
    name: step.name,
    how: text(step.how),
    muscles: (step.muscles ?? []).join(', '),
    sets: step.type === 'sets' ? num(step.sets) : '',
    reps: step.type === 'sets' ? step.reps : '',
    restSec: step.type === 'sets' ? num(step.restSec) : '',
    weightHint: step.type === 'sets' ? text(step.weightHint) : '',
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

export type StepFormResult = { ok: true; step: Step } | { ok: false; errors: EditorErrorCode[] };

/**
 * Applies the form to `base`. The id (and the type) never change, and fields the form does not
 * show (`holdSec`, `approach`, `bodyweight`, `when`, `segments`) are kept as they were.
 */
export function applyForm(base: Step, form: StepForm): StepFormResult {
  const common = {
    name: form.name.trim(),
    ...(form.how.trim() ? { how: form.how.trim() } : {}),
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
        reps: form.reps.trim(),
        restSec: parseNumber(form.restSec),
        ...(form.weightHint.trim() ? { weightHint: form.weightHint.trim() } : {}),
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
      step = { ...kept, ...common, totalSec: Math.round(parseNumber(form.totalMin) * 60) };
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

export function stepIdsOf(program: Program): Set<string> {
  return new Set(program.routines.flatMap((routine) => routine.steps.map((step) => step.id)));
}

/**
 * A new step of the person's own (not from the library). The id is new and unique in the whole
 * program, so it never collides with the history of another exercise.
 */
export function newCustomStep(kind: CustomStepKind, name: string, program: Program): Step {
  const id = uniqueId(`custom-${slugify(name)}`, stepIdsOf(program));
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
