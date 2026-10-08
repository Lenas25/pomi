import { describe, expect, it } from '@jest/globals';

import { loadExerciseLibrary } from '../../templates/exercises';
import { importTemplate } from '../../templates/importer';

import {
  addableExercises,
  applyForm,
  createEditorState,
  editorReducer,
  formFromStep,
  isDirty,
  newCustomStep,
  routineRemovalLosses,
  stepFromExercise,
  stepRemovalImpact,
  swapCandidates,
  validateProgram,
  type EditorAction,
  type EditorState,
  type Program,
  type Step,
} from '.';

const bench: Step = {
  type: 'sets',
  id: 'bench-press',
  name: 'Bench press',
  sets: 3,
  reps: '8–10',
  restSec: 120,
  incrementKg: 2.5,
  approach: 'ramp',
};
const row: Step = { type: 'sets', id: 'row', name: 'Row', sets: 3, reps: '10–12', restSec: 90 };
const warm: Step = { type: 'check', id: 'w-general', name: 'Warm up' };

const program: Program = {
  id: 'p',
  name: 'Mine',
  rotation: true,
  routines: [
    { id: 'a', name: 'A', steps: [warm, bench, row] },
    { id: 'b', name: 'B', steps: [{ ...warm }, { ...bench }] },
  ],
};

const run = (state: EditorState, ...actions: EditorAction[]) =>
  actions.reduce(editorReducer, state);
const idsOf = (state: EditorState, routineId: string) =>
  state.program.routines.find((r) => r.id === routineId)?.steps.map((s) => s.id);

describe('editorReducer', () => {
  const state = createEditorState(program);

  it('reorders steps and routines, ignoring moves past the ends', () => {
    expect(
      idsOf(run(state, { type: 'moveStep', routineId: 'a', stepId: 'row', direction: -1 }), 'a'),
    ).toEqual(['w-general', 'row', 'bench-press']);
    expect(
      run(state, { type: 'moveStep', routineId: 'a', stepId: 'w-general', direction: -1 }),
    ).toEqual(state);
    expect(
      run(state, { type: 'moveRoutine', routineId: 'a', direction: 1 }).program.routines.map(
        (r) => r.id,
      ),
    ).toEqual(['b', 'a']);
  });

  it('adds and removes routines but never the last one', () => {
    const added = run(
      state,
      { type: 'addRoutine', name: 'Día de piernas' },
      { type: 'addRoutine', name: 'Día de piernas' },
    );
    expect(added.program.routines.map((r) => r.id)).toEqual([
      'a',
      'b',
      'r-dia-de-piernas',
      'r-dia-de-piernas-2',
    ]);
    const single = run(state, { type: 'removeRoutine', routineId: 'b' });
    expect(single.program.routines).toHaveLength(1);
    expect(run(single, { type: 'removeRoutine', routineId: 'a' })).toBe(single);
  });

  it('keeps the step id on edit and rejects a duplicate id on add', () => {
    const edited = applyForm(bench, { ...formFromStep(bench), sets: '4', reps: '6–8' });
    expect(edited.ok && edited.step.id).toBe('bench-press');
    if (!edited.ok) throw new Error('expected ok');
    const next = run(state, { type: 'updateStep', routineId: 'a', step: edited.step });
    expect(idsOf(next, 'a')).toEqual(['w-general', 'bench-press', 'row']);
    expect(next.program.routines[0]?.steps[1]).toMatchObject({
      sets: 4,
      reps: '6–8',
      approach: 'ramp',
    });
    expect(run(state, { type: 'addStep', routineId: 'a', step: row })).toBe(state);
    expect(isDirty(next)).toBe(true);
    expect(isDirty(state)).toBe(false);
  });

  it('gives a new id to a replaced exercise and removes steps', () => {
    const swapped = run(state, {
      type: 'replaceStep',
      routineId: 'a',
      stepId: 'row',
      step: { ...row, id: 'cable-row' },
    });
    expect(idsOf(swapped, 'a')).toEqual(['w-general', 'bench-press', 'cable-row']);
    expect(idsOf(run(state, { type: 'removeStep', routineId: 'a', stepId: 'row' }), 'a')).toEqual([
      'w-general',
      'bench-press',
    ]);
  });
});

describe('forms and validation', () => {
  it('maps bad input to error codes', () => {
    const bad = applyForm(bench, {
      ...formFromStep(bench),
      sets: '0',
      reps: 'mucho',
      restSec: '-5',
      incrementKg: '0',
    });
    expect(bad).toEqual({
      ok: false,
      errors: ['setsInvalid', 'repsInvalid', 'restInvalid', 'incrementInvalid'],
    });
    expect(applyForm(bench, { ...formFromStep(bench), name: '  ' })).toEqual({
      ok: false,
      errors: ['stepNameEmpty'],
    });
  });

  it('accepts a decimal comma, clears optional fields and parses minutes', () => {
    const ok = applyForm(bench, {
      ...formFromStep(bench),
      incrementKg: '1,25',
      weightHint: '',
      how: '',
    });
    expect(ok.ok && ok.step).toMatchObject({ incrementKg: 1.25 });
    const timed = newCustomStep('timed', 'Cinta', program);
    const edited = applyForm(timed, { ...formFromStep(timed), totalMin: '12,5' });
    expect(edited.ok && edited.step).toMatchObject({ totalSec: 750 });
  });

  it('reports each problem of a program with where it is', () => {
    const broken: Program = {
      ...program,
      routines: [
        { id: 'a', name: ' ', steps: [] },
        { id: 'a', name: 'B', steps: [row, { ...row, reps: '' }] },
      ],
    };
    expect(
      validateProgram(broken).map((i) => `${i.code}:${i.routineId}:${i.stepId ?? ''}`),
    ).toEqual([
      'routineNameEmpty:a:',
      'routineEmpty:a:',
      'duplicateRoutineId:a:',
      'duplicateStepId:a:row',
      'repsInvalid:a:row',
    ]);
    expect(validateProgram(program)).toEqual([]);
  });

  it('a valid edited program passes the template schema', () => {
    const custom = newCustomStep('wait', 'Descanso largo', program);
    const next = run(createEditorState(program), { type: 'addStep', routineId: 'a', step: custom });
    const result = importTemplate({
      schemaVersion: 2,
      kind: 'module',
      id: 'm',
      name: 'M',
      icon: 'Barbell',
      programs: [next.program],
    });
    expect(result.ok).toBe(true);
  });
});

describe('library', () => {
  const library = loadExerciseLibrary();

  it('filters by equipment and joints and skips exercises already in the routine', () => {
    const all = addableExercises(library, { equipment: 'gym', limitations: [] }, undefined);
    const noKnee = addableExercises(
      library,
      { equipment: 'gym', limitations: ['knee'] },
      undefined,
    );
    expect(noKnee.length).toBeLessThan(all.length);
    expect(noKnee.every((e) => !e.contraindications.includes('knee'))).toBe(true);
    const some = all[0];
    if (!some) throw new Error('empty library');
    const routine = {
      id: 'r',
      name: 'R',
      steps: [stepFromExercise(some, { equipment: 'gym', limitations: [] }, (k) => k)],
    };
    expect(
      addableExercises(library, { equipment: 'gym', limitations: [] }, routine),
    ).not.toContainEqual(some);
  });

  it('builds a valid sets step and lists allowed substitutions', () => {
    const filter = { equipment: 'gym', limitations: [] } as const;
    const exercise = addableExercises(library, filter, undefined).find(
      (e) => e.substitutions.length > 0,
    );
    if (!exercise) throw new Error('no exercise');
    const step = stepFromExercise(exercise, filter, (key) => key);
    expect(step).toMatchObject({ type: 'sets', id: exercise.id });
    expect(applyForm(step, formFromStep(step)).ok).toBe(true);
    const options = swapCandidates(library, filter, { id: 'r', name: 'R', steps: [step] }, step);
    expect(options.every((o) => exercise.substitutions.includes(o.id))).toBe(true);
  });

  it('adds a home version with the generator step id', () => {
    const dumbbell = loadExerciseLibrary().find(
      (e) => e.equipment.length > 1 && e.equipment.includes('dumbbells') && !e.bodyweight,
    );
    if (!dumbbell) return;
    const step = stepFromExercise(dumbbell, { equipment: 'dumbbells', limitations: [] }, (k) => k);
    expect(step.id).toBe(`${dumbbell.id}@db`);
  });
});

describe('history impact', () => {
  const logged = new Set(['bench-press', 'row']);

  it('says if a step has history and where it stays visible', () => {
    expect(stepRemovalImpact(program, 'a', 'row', logged)).toEqual({
      hasHistory: true,
      stillIn: [],
    });
    expect(stepRemovalImpact(program, 'a', 'bench-press', logged)).toEqual({
      hasHistory: true,
      stillIn: ['B'],
    });
    expect(stepRemovalImpact(program, 'a', 'w-general', logged).hasHistory).toBe(false);
  });

  it('lists the steps with history that a removed routine takes along', () => {
    expect(routineRemovalLosses(program, 'a', logged)).toEqual([{ id: 'row', name: 'Row' }]);
    expect(routineRemovalLosses(program, 'b', logged)).toEqual([]);
  });
});
