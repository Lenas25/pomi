import { describe, expect, it } from '@jest/globals';

import { loadDefaultTemplates } from '../templates/defaults';

import { carouselOrder, pickProgram, resumableRoutineIds, toRotationSessions } from './program';

const { modules } = loadDefaultTemplates();
const stored = modules.map((template) => ({ active: true, template }));

describe('pickProgram', () => {
  it('picks the first program of the first active module that has one', () => {
    const program = pickProgram(stored);
    expect(program?.id).toBe('glute-4d');
    expect(program?.routines.map((routine) => routine.id)).toEqual(['d1', 'd2', 'd3', 'd4']);
    expect(program?.rules).toEqual({ stallSessions: 3, deloadPct: 10 });
  });

  it('skips inactive modules and returns null without any program', () => {
    expect(pickProgram(stored.map((entry) => ({ ...entry, active: false })))).toBeNull();
    expect(pickProgram([])).toBeNull();
  });
});

describe('toRotationSessions', () => {
  it('maps stored sessions to the rotation input with the set count', () => {
    expect(
      toRotationSessions([
        {
          session: { routineId: 'd1', date: '2026-10-05', startedAt: 1, finishedAt: 9 },
          sets: [1, 2, 3],
        },
      ]),
    ).toEqual([{ routineId: 'd1', date: '2026-10-05', startedAt: 1, finishedAt: 9, setCount: 3 }]);
  });
});

describe('carouselOrder', () => {
  it('puts the suggested routine first and wraps the rest in program order', () => {
    expect(carouselOrder(['d1', 'd2', 'd3', 'd4'], 'd3')).toEqual(['d3', 'd4', 'd1', 'd2']);
    expect(carouselOrder(['d1', 'd2'], 'd1')).toEqual(['d1', 'd2']);
    expect(carouselOrder(['d1', 'd2'], 'gone')).toEqual(['d1', 'd2']);
    expect(carouselOrder(['d1', 'd2'], null)).toEqual(['d1', 'd2']);
  });
});

describe('resumableRoutineIds', () => {
  const row = (routineId: string, date: string, finishedAt: number | null, sets: number) => ({
    session: { routineId, date, startedAt: 1, finishedAt },
    sets: Array.from({ length: sets }, () => ({})),
  });

  it('keys resume by routine: two routines open today each resume their own session', () => {
    const rows = [
      row('b', '2026-10-09', null, 2),
      row('a', '2026-10-09', null, 1),
      row('c', '2026-10-09', 5, 3),
      row('d', '2026-10-09', null, 0),
      row('a', '2026-10-08', null, 4),
    ];
    expect(resumableRoutineIds(rows, '2026-10-09', ['a', 'b', 'c', 'd'])).toEqual(['a', 'b']);
    expect(resumableRoutineIds(rows, '2026-10-09', ['b'])).toEqual(['b']);
    expect(resumableRoutineIds(rows, '2026-10-10', ['a', 'b'])).toEqual([]);
  });
});
