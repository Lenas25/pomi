import type { EditorAction, EditorState, Program, Routine, Step } from './types';

export function createEditorState(program: Program): EditorState {
  return { program, initial: program };
}

export function isDirty(state: EditorState): boolean {
  return JSON.stringify(state.program) !== JSON.stringify(state.initial);
}

function move<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return next;
  next.splice(target, 0, item);
  return next;
}

/** Lowercase ASCII slug for generated ids. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

/** `base`, or `base-2`, `base-3`... when taken. */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function withRoutine(
  state: EditorState,
  routineId: string,
  change: (routine: Routine) => Routine,
): EditorState {
  const current = state.program.routines.find((routine) => routine.id === routineId);
  if (!current) return state;
  const changed = change(current);
  if (changed === current) return state;
  return {
    ...state,
    program: {
      ...state.program,
      routines: state.program.routines.map((routine) => (routine === current ? changed : routine)),
    },
  };
}

const withSteps = (routine: Routine, steps: Step[]): Routine => ({ ...routine, steps });

/**
 * Pure reducer. Invalid requests (unknown ids, a step id already in the routine, removing the last
 * routine) return the SAME state, so callers can compare references. `updateStep` keeps the id
 * (history continues); `replaceStep` and `addStep` are the only ways an id appears.
 */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { program } = state;
  switch (action.type) {
    case 'renameProgram':
      return { ...state, program: { ...program, name: action.name } };
    case 'renameRoutine':
      return withRoutine(state, action.routineId, (routine) => ({ ...routine, name: action.name }));
    case 'addRoutine': {
      const id = uniqueId(`r-${slugify(action.name)}`, new Set(program.routines.map((r) => r.id)));
      return {
        ...state,
        program: {
          ...program,
          routines: [...program.routines, { id, name: action.name, steps: [] }],
        },
      };
    }
    case 'removeRoutine':
      if (program.routines.length <= 1) return state;
      if (!program.routines.some((routine) => routine.id === action.routineId)) return state;
      return {
        ...state,
        program: {
          ...program,
          routines: program.routines.filter((routine) => routine.id !== action.routineId),
        },
      };
    case 'moveRoutine': {
      const index = program.routines.findIndex((routine) => routine.id === action.routineId);
      if (index < 0) return state;
      return {
        ...state,
        program: { ...program, routines: move(program.routines, index, action.direction) },
      };
    }
    case 'addStep':
      return withRoutine(state, action.routineId, (routine) =>
        routine.steps.some((step) => step.id === action.step.id)
          ? routine
          : withSteps(routine, [...routine.steps, action.step]),
      );
    case 'updateStep':
      return withRoutine(state, action.routineId, (routine) =>
        withSteps(
          routine,
          routine.steps.map((step) => (step.id === action.step.id ? action.step : step)),
        ),
      );
    case 'replaceStep':
      return withRoutine(state, action.routineId, (routine) => {
        const clash =
          action.step.id !== action.stepId && routine.steps.some((s) => s.id === action.step.id);
        if (clash) return routine;
        return withSteps(
          routine,
          routine.steps.map((step) => (step.id === action.stepId ? action.step : step)),
        );
      });
    case 'removeStep':
      return withRoutine(state, action.routineId, (routine) =>
        withSteps(
          routine,
          routine.steps.filter((step) => step.id !== action.stepId),
        ),
      );
    case 'moveStep':
      return withRoutine(state, action.routineId, (routine) =>
        withSteps(
          routine,
          move(
            routine.steps,
            routine.steps.findIndex((step) => step.id === action.stepId),
            action.direction,
          ),
        ),
      );
  }
}
