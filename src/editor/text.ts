import type { EditorErrorCode, Step } from '../domain/editor';
import type { Translate } from '../i18n';
import { templateText } from '../i18n/templateText';

const ERROR_KEYS = {
  programNameEmpty: 'editor.errors.programNameEmpty',
  noRoutines: 'editor.errors.noRoutines',
  routineNameEmpty: 'editor.errors.routineNameEmpty',
  routineEmpty: 'editor.errors.routineEmpty',
  duplicateRoutineId: 'editor.errors.duplicateRoutineId',
  duplicateStepId: 'editor.errors.duplicateStepId',
  stepNameEmpty: 'editor.errors.stepNameEmpty',
  setsInvalid: 'editor.errors.setsInvalid',
  repsInvalid: 'editor.errors.repsInvalid',
  repsLanguagesDiffer: 'editor.errors.repsLanguagesDiffer',
  restInvalid: 'editor.errors.restInvalid',
  incrementInvalid: 'editor.errors.incrementInvalid',
  waitInvalid: 'editor.errors.waitInvalid',
  durationInvalid: 'editor.errors.durationInvalid',
  targetInvalid: 'editor.errors.targetInvalid',
} as const satisfies Record<EditorErrorCode, `editor.errors.${EditorErrorCode}`>;

export const errorText = (code: EditorErrorCode, t: Translate): string => t(ERROR_KEYS[code]);

/** One line under a step's name: "3 × 8–10", "5 min"... */
export function stepSummary(step: Step, t: Translate): string {
  switch (step.type) {
    case 'sets':
      return t('editor.summary.sets', { sets: step.sets, reps: templateText(step.reps) });
    case 'wait':
      return t('editor.summary.wait', { sec: step.waitSec });
    case 'timed':
      return t('editor.summary.timed', { min: Math.round((step.totalSec / 60) * 10) / 10 });
    case 'counter':
      return t('editor.summary.counter', { target: step.target });
    case 'check':
      return t('editor.summary.check');
  }
}
