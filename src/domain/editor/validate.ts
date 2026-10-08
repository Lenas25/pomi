import { parseReps } from '../gym/reps';

import type { EditorErrorCode, EditorIssue, Program, Step } from './types';
import { allTexts, isBlankText, type LocalizedText } from '../../templates/localized';

/** Every language version of `reps` parses to the same target (the template schema rule). */
export function sameRepsRange(reps: LocalizedText): boolean {
  const parsed = allTexts(reps).map((text) => JSON.stringify(parseReps(text)));
  return parsed.every((value) => value === parsed[0]);
}

const isInt = (value: number, min: number): boolean => Number.isInteger(value) && value >= min;

/** Field rules of one step: the same ones the template schema and the reps parser enforce. */
export function validateStep(step: Step): EditorErrorCode[] {
  const codes: EditorErrorCode[] = [];
  if (isBlankText(step.name)) codes.push('stepNameEmpty');
  switch (step.type) {
    case 'sets':
      if (!isInt(step.sets, 1)) codes.push('setsInvalid');
      // Every language version must parse (the English one is shown when the app is in English).
      if (allTexts(step.reps).some((reps) => parseReps(reps) === null)) codes.push('repsInvalid');
      else if (!sameRepsRange(step.reps)) codes.push('repsLanguagesDiffer');
      if (!isInt(step.restSec, 0)) codes.push('restInvalid');
      if (step.incrementKg !== undefined && !(step.incrementKg > 0)) codes.push('incrementInvalid');
      break;
    case 'wait':
      if (!isInt(step.waitSec, 1)) codes.push('waitInvalid');
      break;
    case 'timed':
      if (!isInt(step.totalSec, 1)) codes.push('durationInvalid');
      break;
    case 'counter':
      if (!isInt(step.target, 1)) codes.push('targetInvalid');
      break;
    case 'check':
      break;
  }
  return codes;
}

/** Everything that would stop the program from saving, with where it is. */
export function validateProgram(program: Program): EditorIssue[] {
  const issues: EditorIssue[] = [];
  if (isBlankText(program.name)) issues.push({ code: 'programNameEmpty' });
  if (program.routines.length === 0) issues.push({ code: 'noRoutines' });
  const routineIds = new Set<string>();
  for (const routine of program.routines) {
    if (routineIds.has(routine.id))
      issues.push({ code: 'duplicateRoutineId', routineId: routine.id });
    routineIds.add(routine.id);
    if (isBlankText(routine.name)) issues.push({ code: 'routineNameEmpty', routineId: routine.id });
    if (routine.steps.length === 0) issues.push({ code: 'routineEmpty', routineId: routine.id });
    const stepIds = new Set<string>();
    for (const step of routine.steps) {
      if (stepIds.has(step.id)) {
        issues.push({ code: 'duplicateStepId', routineId: routine.id, stepId: step.id });
      }
      stepIds.add(step.id);
      for (const code of validateStep(step)) {
        issues.push({ code, routineId: routine.id, stepId: step.id });
      }
    }
  }
  return issues;
}
