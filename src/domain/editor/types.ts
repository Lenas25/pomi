// The program editor (PLAN §15 v3): pure state and rules. The editor works on the template
// `Program` itself, so what it saves is exactly what the importer, the rotation and the session
// already read. Ids are the history key: an edit never changes an existing step id.
import type { ModuleTemplate, Step } from '../../templates/schema';

export type Program = NonNullable<ModuleTemplate['programs']>[number];
export type Routine = Program['routines'][number];
export type { Step };

export type EditorState = {
  program: Program;
  /** The program as loaded, to tell whether anything changed. */
  initial: Program;
};

/** Validation codes; `editor.errors.<code>` in i18n. */
export const EDITOR_ERROR_CODES = [
  'programNameEmpty',
  'noRoutines',
  'routineNameEmpty',
  'routineEmpty',
  'duplicateRoutineId',
  'duplicateStepId',
  'stepNameEmpty',
  'setsInvalid',
  'repsInvalid',
  'restInvalid',
  'incrementInvalid',
  'waitInvalid',
  'durationInvalid',
  'targetInvalid',
] as const;

export type EditorErrorCode = (typeof EDITOR_ERROR_CODES)[number];

export type EditorIssue = {
  code: EditorErrorCode;
  routineId?: string;
  stepId?: string;
};

export type EditorAction =
  | { type: 'renameProgram'; name: string }
  | { type: 'renameRoutine'; routineId: string; name: string }
  | { type: 'addRoutine'; name: string }
  | { type: 'removeRoutine'; routineId: string }
  | { type: 'moveRoutine'; routineId: string; direction: -1 | 1 }
  | { type: 'addStep'; routineId: string; step: Step }
  | { type: 'updateStep'; routineId: string; step: Step }
  | { type: 'replaceStep'; routineId: string; stepId: string; step: Step }
  | { type: 'removeStep'; routineId: string; stepId: string }
  | { type: 'moveStep'; routineId: string; stepId: string; direction: -1 | 1 };
