import { describe, expect, it } from '@jest/globals';

import { todaysRoutineId, type RotationSession } from './rotation';

const ids = ['d1', 'd2', 'd3', 'd4'];

function session(
  routineId: string,
  date: string,
  options: { finished?: boolean; sets?: number; startedAt?: number } = {},
): RotationSession {
  const { finished = true, sets = 5, startedAt = Date.parse(`${date}T06:00:00Z`) } = options;
  return {
    routineId,
    date,
    startedAt,
    finishedAt: finished ? startedAt + 3600_000 : null,
    setCount: sets,
  };
}

describe('todaysRoutineId', () => {
  it('starts with the first routine when there is no history', () => {
    expect(todaysRoutineId(ids, [], '2026-03-02')).toBe('d1');
  });

  it('returns null for a program without routines', () => {
    expect(todaysRoutineId([], [], '2026-03-02')).toBeNull();
  });

  it('goes to the next routine after the last completed session', () => {
    const history = [session('d1', '2026-02-26'), session('d2', '2026-02-28')];
    expect(todaysRoutineId(ids, history, '2026-03-02')).toBe('d3');
  });

  it('wraps around after the last routine', () => {
    expect(todaysRoutineId(ids, [session('d4', '2026-02-28')], '2026-03-02')).toBe('d1');
  });

  it('keeps the routine that already has sets logged today', () => {
    const history = [
      session('d1', '2026-02-26'),
      session('d2', '2026-03-02', { finished: false, sets: 3 }),
    ];
    expect(todaysRoutineId(ids, history, '2026-03-02')).toBe('d2');
  });

  it('still shows today routine after finishing it', () => {
    const history = [session('d1', '2026-02-26'), session('d2', '2026-03-02')];
    expect(todaysRoutineId(ids, history, '2026-03-02')).toBe('d2');
  });

  it('ignores a session today with no sets logged', () => {
    const history = [
      session('d1', '2026-02-26'),
      session('d3', '2026-03-02', { sets: 0, finished: false }),
    ];
    expect(todaysRoutineId(ids, history, '2026-03-02')).toBe('d2');
  });

  it('ignores unfinished sessions from other days', () => {
    const history = [session('d1', '2026-02-26'), session('d2', '2026-02-28', { finished: false })];
    expect(todaysRoutineId(ids, history, '2026-03-02')).toBe('d2');
  });

  it('prefers the most recently started session when several have sets today', () => {
    const history = [
      session('d1', '2026-03-02', { startedAt: 1000, finished: false }),
      session('d3', '2026-03-02', { startedAt: 2000, finished: false }),
    ];
    expect(todaysRoutineId(ids, history, '2026-03-02')).toBe('d3');
  });

  it('falls back to the first routine when the last one no longer exists in the program', () => {
    expect(todaysRoutineId(ids, [session('old', '2026-02-28')], '2026-03-02')).toBe('d1');
  });
});
