import { describe, expect, it } from '@jest/globals';

import {
  buildExerciseView,
  parseNumberInput,
  plannedSetCount,
  resolveSetValues,
  summarizeSession,
  toExerciseSession,
  type SetsStep,
  type StoredSession,
  type StoredSet,
} from './sessionViewModel';

const hipThrust: SetsStep = {
  type: 'sets',
  id: 'ht',
  name: 'Hip thrust',
  sets: 3,
  reps: '8–10',
  restSec: 120,
  incrementKg: 5,
  weightHint: '40–45 kg',
};

const plank: SetsStep = {
  type: 'sets',
  id: 'plank',
  name: 'Plank',
  sets: 2,
  reps: '30–45 s',
  restSec: 30,
  bodyweight: true,
};

function stored(
  stepId: string,
  setIndex: number,
  weightKg: number | null,
  reps: number | null,
  rir: number | null = null,
): StoredSet {
  return { stepId, setIndex, weightKg, reps, rir };
}

function session(date: string, sets: StoredSet[]): StoredSession {
  return { date, sets };
}

describe('toExerciseSession', () => {
  it('orders by set index and fills gaps so skipped sets keep their position', () => {
    const result = toExerciseSession(
      session('d', [stored('ht', 2, 40, 8), stored('ht', 0, 40, 10)]),
    );
    expect(result.sets).toEqual([
      { weightKg: 40, reps: 10, rir: null },
      { weightKg: null, reps: null, rir: null },
      { weightKg: 40, reps: 8, rir: null },
    ]);
  });
});

describe('buildExerciseView', () => {
  it('targets the next weight when every set hit the top, and shows "la última vez"', () => {
    const view = buildExerciseView(hipThrust, [
      session('2026-10-01', [
        stored('ht', 0, 40, 10),
        stored('ht', 1, 40, 10),
        stored('ht', 2, 40, 10),
      ]),
    ]);
    expect(view.target).toMatchObject({ kind: 'increase', weightKg: 45, reps: [8, 8, 8] });
    expect(view.lastTime).toEqual({
      date: '2026-10-01',
      sets: [
        { weightKg: 40, reps: 10 },
        { weightKg: 40, reps: 10 },
        { weightKg: 40, reps: 10 },
      ],
    });
    expect(view.targetReps(1)).toBe(8);
  });

  it('exposes the previous value of each planned set (empty where there is none)', () => {
    const view = buildExerciseView(hipThrust, [
      session('d', [stored('ht', 0, 40, 9), stored('ht', 2, 42.5, 8)]),
    ]);
    expect(view.previous).toEqual([
      { weightKg: 40, reps: 9 },
      { weightKg: null, reps: null },
      { weightKg: 42.5, reps: 8 },
    ]);
  });

  it('has no last time and an empty previous list without history', () => {
    const view = buildExerciseView(hipThrust, []);
    expect(view.target.kind).toBe('no-history');
    expect(view.lastTime).toBeNull();
    expect(view.previous).toEqual(
      Array.from({ length: 3 }, () => ({ weightKg: null, reps: null })),
    );
    expect(view.targetReps(0)).toBe(8);
  });

  it('flags time-based reps as manual', () => {
    const view = buildExerciseView(plank, []);
    expect(view.timeBased).toBe(true);
    expect(view.target.kind).toBe('manual');
    expect(view.targetReps(0)).toBeNull();
  });

  it('passes the program rules to the stall detection', () => {
    const flat = (date: string) =>
      session(date, [stored('ht', 0, 40, 9), stored('ht', 1, 40, 8), stored('ht', 2, 40, 8)]);
    const view = buildExerciseView(hipThrust, [flat('4'), flat('3'), flat('2')], {
      stallSessions: 2,
      deloadPct: 10,
    });
    expect(view.target.suggestions.map((s) => s.key)).toContain('gym.target.stalled');
  });
});

describe('parseNumberInput', () => {
  it('accepts dot and comma decimals and rejects junk', () => {
    expect(parseNumberInput('42.5')).toBe(42.5);
    expect(parseNumberInput(' 42,5 ')).toBe(42.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('-3')).toBeNull();
  });
});

describe('resolveSetValues (default on empty)', () => {
  const context = {
    previous: { weightKg: 40, reps: 9 },
    targetWeightKg: 45,
    targetReps: 8,
    bodyweight: false,
  };

  it('uses what was typed', () => {
    expect(resolveSetValues({ weightText: '42,5', repsText: '7' }, context)).toEqual({
      weightKg: 42.5,
      reps: 7,
    });
  });

  it('falls back to the previous value for empty inputs', () => {
    expect(resolveSetValues({ weightText: '', repsText: '' }, context)).toEqual({
      weightKg: 40,
      reps: 9,
    });
    expect(resolveSetValues({ weightText: '50', repsText: '' }, context)).toEqual({
      weightKg: 50,
      reps: 9,
    });
  });

  it('falls back to the target when there is no previous value', () => {
    expect(
      resolveSetValues(
        { weightText: '', repsText: '' },
        { ...context, previous: { weightKg: null, reps: null } },
      ),
    ).toEqual({ weightKg: 45, reps: 8 });
  });

  it('never logs a weight for bodyweight sets', () => {
    expect(
      resolveSetValues({ weightText: '20', repsText: '' }, { ...context, bodyweight: true }),
    ).toEqual({ weightKg: null, reps: 9 });
  });

  it('returns nulls when there is nothing to fall back to', () => {
    expect(
      resolveSetValues(
        { weightText: '', repsText: '' },
        {
          previous: { weightKg: null, reps: null },
          targetWeightKg: null,
          targetReps: null,
          bodyweight: false,
        },
      ),
    ).toEqual({ weightKg: null, reps: null });
  });
});

describe('summarizeSession', () => {
  const exercises = [
    {
      step: hipThrust,
      target: buildExerciseView(hipThrust, [
        session('d', [stored('ht', 0, 40, 10), stored('ht', 1, 40, 10), stored('ht', 2, 40, 10)]),
      ]).target,
    },
    { step: plank, target: buildExerciseView(plank, []).target },
  ];

  it('counts sets, volume and met targets', () => {
    const logs = [
      stored('ht', 0, 45, 8),
      stored('ht', 1, 45, 8),
      stored('ht', 2, 45, 9),
      stored('plank', 0, null, 40),
    ];
    expect(summarizeSession(exercises, logs)).toEqual({
      setsDone: 4,
      setsPlanned: 5,
      volumeKg: 45 * 8 + 45 * 8 + 45 * 9,
      targetsMet: 1,
      targetsTotal: 1,
    });
  });

  it('does not meet a target with too little weight, reps or sets', () => {
    const light = [stored('ht', 0, 40, 8), stored('ht', 1, 45, 8), stored('ht', 2, 45, 8)];
    expect(summarizeSession(exercises, light).targetsMet).toBe(0);
    const fewReps = [stored('ht', 0, 45, 8), stored('ht', 1, 45, 7), stored('ht', 2, 45, 8)];
    expect(summarizeSession(exercises, fewReps).targetsMet).toBe(0);
    const missing = [stored('ht', 0, 45, 8), stored('ht', 1, 45, 8)];
    expect(summarizeSession(exercises, missing).targetsMet).toBe(0);
  });

  it('ignores logs of other steps and sets without reps', () => {
    const logs = [stored('other', 0, 100, 10), stored('ht', 0, 45, null)];
    expect(summarizeSession(exercises, logs)).toMatchObject({ setsDone: 0, volumeKg: 0 });
  });

  it('counts the planned sets', () => {
    expect(plannedSetCount(exercises)).toBe(5);
  });
});
