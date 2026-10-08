import { loadExerciseLibrary } from '../templates/exercises';

import { resolveStepMuscles, type VolumeData } from './loadVolume';
import { buildVolumeView, formatSets, thisWeekRows } from './volumeView';

const step = (id: string, muscles?: string[]) => ({
  type: 'sets' as const,
  id,
  name: id,
  sets: 3,
  reps: '8-10',
  restSec: 90,
  ...(muscles ? { muscles } : {}),
});
const module = (active: boolean, steps: ReturnType<typeof step>[]) => ({
  active,
  template: {
    programs: [{ id: 'p', name: 'p', rotation: false, routines: [{ id: 'r', name: 'r', steps }] }],
  },
});

describe('resolveStepMuscles', () => {
  it('reads inactive (replaced) modules too, the active ones winning', () => {
    const resolved = resolveStepMuscles(
      [
        module(false, [step('old', ['pecho']), step('both', ['espalda'])]),
        module(true, [step('both', ['hombro'])]),
      ],
      [],
    );
    expect(resolved).toEqual({ old: ['pecho'], both: ['hombro'] });
  });

  it('falls back to the library for generated ids no program has any more', () => {
    const exercise = loadExerciseLibrary()[0];
    if (!exercise) throw new Error('empty library');
    const resolved = resolveStepMuscles([], [`${exercise.id}@db~s`, 'ghost']);
    expect(resolved[`${exercise.id}@db~s`]).toEqual({
      direct: exercise.muscles.primary,
      indirect: exercise.muscles.secondary,
    });
    expect(resolved['ghost']).toBeUndefined();
  });
});

describe('volume view', () => {
  const data: VolumeData = {
    today: '2026-10-07',
    level: 'beginner',
    goal: 'hypertrophy',
    stepMuscles: { a: ['gluteo', 'isquios'], b: ['biceps'] },
    sets: [
      { stepId: 'a', doneAt: new Date('2026-10-06T10:00:00').getTime() },
      { stepId: 'a', doneAt: new Date('2026-10-06T10:05:00').getTime() },
      { stepId: 'b', doneAt: new Date('2026-09-30T10:00:00').getTime() },
    ],
  };

  it('lists this week by sets with the level reference', () => {
    expect(thisWeekRows(data)).toEqual([
      { muscle: 'gluteo', sets: 2, reference: { min: 8, max: 10 } },
      { muscle: 'isquios', sets: 1, reference: { min: 8, max: 10 } },
    ]);
  });

  it('covers the requested weeks and finds the muscles in them', () => {
    const view = buildVolumeView(data, 4);
    expect(view.weeks).toHaveLength(4);
    expect(view.muscles).toEqual(['gluteo', 'isquios', 'biceps']);
  });

  it('formats halves with the language decimal mark', () => {
    expect(formatSets(0.5, 'es')).toBe('0,5');
    expect(formatSets(0.5, 'en')).toBe('0.5');
    expect(formatSets(3, 'es')).toBe('3');
  });
});
