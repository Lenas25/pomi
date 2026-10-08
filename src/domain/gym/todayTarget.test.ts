import { describe, expect, it } from '@jest/globals';

import { es } from '../../i18n/es';
import {
  todayTarget,
  type ExerciseSession,
  type LoggedSet,
  type TargetMessage,
  type TargetStep,
} from './todayTarget';

const step: TargetStep = { sets: 3, reps: '8–10', incrementKg: 5, weightHint: '20–30 kg' };
const rules = { stallSessions: 3, deloadPct: 10 };

function set(weightKg: number | null, reps: number | null, rir: number | null = null): LoggedSet {
  return { weightKg, reps, rir };
}

function session(date: string, sets: LoggedSet[]): ExerciseSession {
  return { date, sets };
}

function keys(messages: readonly TargetMessage[]): string[] {
  return messages.map((message) => message.key);
}

describe('todayTarget case 1: top of the range everywhere', () => {
  it('adds incrementKg and goes back to the minimum reps', () => {
    const target = todayTarget(
      step,
      [session('d3', [set(40, 10), set(40, 10), set(40, 10)])],
      rules,
    );
    expect(target).toMatchObject({ kind: 'increase', weightKg: 45, reps: [8, 8, 8] });
    expect(target.reason).toEqual({
      key: 'gym.target.weightUp',
      params: { weightKg: 45, reps: 8, lastWeightKg: 40, lastReps: 10 },
    });
  });

  it('accepts RIR >= 1 and no RIR, but not RIR 0 on any set', () => {
    const ok = [session('d', [set(40, 10, 1), set(40, 10, 2), set(40, 10, null)])];
    expect(todayTarget(step, ok, rules).kind).toBe('increase');
    const grinding = [session('d', [set(40, 10, 1), set(40, 10, 0), set(40, 10, 1)])];
    expect(todayTarget(step, grinding, rules).kind).toBe('add-rep');
  });

  it('needs every planned set logged', () => {
    const target = todayTarget(step, [session('d', [set(40, 10), set(40, 10)])], rules);
    expect(target.kind).toBe('add-rep');
    expect(target.reps).toEqual([10, 10, 8]);
  });

  it('is only +1 rep (beyond the range) without incrementKg', () => {
    const bodyweight: TargetStep = { sets: 2, reps: '8–10' };
    const target = todayTarget(bodyweight, [session('d', [set(null, 10), set(null, 10)])], rules);
    expect(target).toMatchObject({ kind: 'increase', weightKg: null, reps: [11, 11] });
    expect(target.reason?.key).toBe('gym.target.addRep');
  });
});

describe('todayTarget case 2: some sets below the top', () => {
  it('keeps the weight and adds 1 rep to sets below the top', () => {
    const target = todayTarget(step, [session('d', [set(40, 10), set(40, 9), set(40, 8)])], rules);
    expect(target).toMatchObject({ kind: 'add-rep', weightKg: 40, reps: [10, 10, 9] });
    expect(target.reason?.key).toBe('gym.target.addRep');
  });

  it('never targets below the minimum of the range', () => {
    const target = todayTarget(step, [session('d', [set(40, 5), set(40, 5), set(40, 5)])], rules);
    expect(target.reps).toEqual([8, 8, 8]);
  });

  it('uses the heaviest set as the working weight', () => {
    const target = todayTarget(step, [session('d', [set(20, 10), set(40, 8), set(40, 8)])], rules);
    expect(target.weightKg).toBe(40);
  });

  it('ignores sets without reps and sessions without completed sets', () => {
    const history = [
      session('empty', [set(40, null)]),
      session('d', [set(40, 9), set(40, 9), set(40, 9)]),
    ];
    expect(todayTarget(step, history, rules).reps).toEqual([10, 10, 10]);
  });
});

describe('todayTarget case 3: stalled', () => {
  const flat = (date: string) => session(date, [set(40, 9), set(40, 8), set(40, 8)]);

  it('suggests a review and a deload after stallSessions without improvement', () => {
    const target = todayTarget(step, [flat('d4'), flat('d3'), flat('d2'), flat('d1')], rules);
    expect(keys(target.suggestions)).toEqual(['gym.target.stalled', 'gym.target.deload']);
    expect(target.suggestions[1]?.params).toEqual({ weightKg: 36, pct: 10 });
  });

  it('does not fire with too little history', () => {
    expect(todayTarget(step, [flat('d3'), flat('d2'), flat('d1')], rules).suggestions).toEqual([]);
  });

  it('does not fire when any recent session improved', () => {
    const improving = session('d4', [set(40, 10), set(40, 9), set(40, 8)]);
    const target = todayTarget(step, [improving, flat('d3'), flat('d2'), flat('d1')], rules);
    expect(keys(target.suggestions)).not.toContain('gym.target.stalled');
  });

  it('counts a heavier weight as an improvement', () => {
    const heavier = session('d4', [set(45, 8), set(45, 8), set(45, 8)]);
    const target = todayTarget(step, [heavier, flat('d3'), flat('d2'), flat('d1')], rules);
    expect(keys(target.suggestions)).not.toContain('gym.target.stalled');
  });

  it('honours a custom stallSessions and deloadPct, rounding to 0.5 kg', () => {
    const target = todayTarget(step, [flat('d3'), flat('d2'), flat('d1')], {
      stallSessions: 2,
      deloadPct: 15,
    });
    expect(target.suggestions[1]?.params).toEqual({ weightKg: 34, pct: 15 });
  });
});

describe('todayTarget case 4: RIR >= 3 for 2 sessions', () => {
  const easy = (date: string) => session(date, [set(40, 9, 3), set(40, 8, 3), set(40, 8, 4)]);

  it('suggests more weight even without reaching the top', () => {
    const target = todayTarget(step, [easy('d2'), easy('d1')], rules);
    expect(target.kind).toBe('add-rep');
    expect(target.suggestions).toEqual([
      { key: 'gym.target.weightUpSuggested', params: { weightKg: 45 } },
    ]);
  });

  it('needs two consecutive easy sessions with RIR recorded on every set', () => {
    expect(todayTarget(step, [easy('d1')], rules).suggestions).toEqual([]);
    const missing = session('d2', [set(40, 9, 3), set(40, 8, null), set(40, 8, 3)]);
    expect(todayTarget(step, [missing, easy('d1')], rules).suggestions).toEqual([]);
    const hard = session('d1', [set(40, 9, 1), set(40, 8, 3), set(40, 8, 3)]);
    expect(todayTarget(step, [easy('d2'), hard], rules).suggestions).toEqual([]);
  });

  it('is not suggested without incrementKg', () => {
    const bodyweight: TargetStep = { sets: 3, reps: '8–10' };
    const easyBw = (date: string) =>
      session(date, [set(null, 9, 3), set(null, 8, 3), set(null, 8, 3)]);
    expect(todayTarget(bodyweight, [easyBw('d2'), easyBw('d1')], rules).suggestions).toEqual([]);
  });
});

describe('todayTarget case 5: no history', () => {
  it('returns the template hint and the choose-a-weight key, with no weight', () => {
    const target = todayTarget(step, [], rules);
    expect(target).toMatchObject({
      kind: 'no-history',
      weightKg: null,
      reps: [8, 8, 8],
      reason: null,
    });
    expect(target.hint).toEqual([
      { key: 'gym.target.noHistory', params: { weightHint: '20–30 kg' } },
      { key: 'gym.target.chooseWeight', params: {} },
    ]);
  });

  it('treats sessions with no completed sets as no history', () => {
    expect(todayTarget(step, [session('d', [set(40, null)])], rules).kind).toBe('no-history');
  });
});

describe('todayTarget edge cases', () => {
  it('does not progress time-based or unparseable reps', () => {
    for (const reps of ['30–45 s', 'al fallo']) {
      const target = todayTarget({ sets: 3, reps }, [session('d', [set(null, 30)])], rules);
      expect(target).toMatchObject({ kind: 'manual', reps: [], reason: null, suggestions: [] });
    }
  });

  it('works with a single-number target', () => {
    const target = todayTarget(
      { sets: 2, reps: '8 por lado', incrementKg: 2 },
      [session('d', [set(10, 8), set(10, 8)])],
      rules,
    );
    expect(target).toMatchObject({ kind: 'increase', weightKg: 12, reps: [8, 8] });
  });

  it('only returns i18n keys that exist in the Spanish messages', () => {
    const all: TargetMessage[] = [];
    const flat = (date: string) => session(date, [set(40, 9, 3), set(40, 8, 3), set(40, 8, 3)]);
    for (const history of [
      [],
      [flat('a'), flat('b')],
      [flat('a'), flat('b'), flat('c'), flat('d')],
      [session('a', [set(40, 10), set(40, 10), set(40, 10)])],
    ]) {
      const target = todayTarget(step, history, rules);
      all.push(...(target.reason ? [target.reason] : []), ...target.suggestions, ...target.hint);
    }
    expect(all.length).toBeGreaterThan(5);
    for (const { key } of all) {
      const [, , leaf] = key.split('.');
      expect(es.gym.target).toHaveProperty(leaf ?? '');
    }
  });
});

describe('todayTarget review fixes', () => {
  it('keeps progressing a bodyweight exercise past the range (11 -> 12)', () => {
    const bodyweight: TargetStep = { sets: 2, reps: '8–10' };
    const first = todayTarget(bodyweight, [session('d1', [set(null, 10), set(null, 10)])], rules);
    expect(first.reps).toEqual([11, 11]);
    const second = todayTarget(
      bodyweight,
      [
        session('d2', [set(null, 11), set(null, 11)]),
        session('d1', [set(null, 10), set(null, 10)]),
      ],
      rules,
    );
    expect(second).toMatchObject({ kind: 'increase', reps: [12, 12] });
    expect(second.reason?.params).toMatchObject({ reps: 12 });
  });

  it('does not shift per-set targets when a set was skipped', () => {
    // set 2 skipped: set 3 (8 reps) must still map to index 2.
    const target = todayTarget(
      step,
      [session('d', [set(40, 10), set(40, null), set(40, 8)])],
      rules,
    );
    expect(target.reps).toEqual([10, 8, 9]);
  });

  it('adds +1 rep on every set below the top and reports the smallest raised target', () => {
    const target = todayTarget(step, [session('d', [set(40, 8), set(40, 9), set(40, 10)])], rules);
    expect(target.reps).toEqual([9, 10, 10]);
    expect(target.reason).toEqual({
      key: 'gym.target.addRep',
      params: { weightKg: 40, reps: 9 },
    });
  });

  it('evaluates the top of the range on working sets only (warm-up and drop sets ignored)', () => {
    const target = todayTarget(
      step,
      [session('d', [set(20, 12), set(40, 10), set(40, 10), set(40, 10), set(30, 6)])],
      rules,
    );
    expect(target).toMatchObject({ kind: 'increase', weightKg: 45, reps: [8, 8, 8] });
    expect(target.reason?.params).toMatchObject({ lastWeightKg: 40, lastReps: 10 });
  });

  it('needs the planned number of WORKING sets, not warm-ups', () => {
    const target = todayTarget(
      step,
      [session('d', [set(20, 12), set(40, 10), set(40, 10)])],
      rules,
    );
    expect(target.kind).toBe('add-rep');
  });

  it('resets the stall window after a deload (no immediate re-fire)', () => {
    const flat = (date: string, kg = 40) => session(date, [set(kg, 9), set(kg, 8), set(kg, 8)]);
    const stalled = [flat('d4'), flat('d3'), flat('d2'), flat('d1')];
    expect(keys(todayTarget(step, stalled, rules).suggestions)).toContain('gym.target.stalled');

    // Took the suggested deload (36 kg): not stalled right after.
    const afterDeload = [flat('d5', 36), ...stalled];
    expect(keys(todayTarget(step, afterDeload, rules).suggestions)).not.toContain(
      'gym.target.stalled',
    );

    // ... but three flat sessions at the new weight stall again.
    const again = [flat('d8', 36), flat('d7', 36), flat('d6', 36), flat('d5', 36), ...stalled];
    expect(keys(todayTarget(step, again, rules).suggestions)).toContain('gym.target.stalled');
  });

  it('does not treat an unrelated weight drop as a deload', () => {
    const flat = (date: string, kg: number) => session(date, [set(kg, 9), set(kg, 8), set(kg, 8)]);
    const history = [flat('d4', 30), flat('d3', 40), flat('d2', 40), flat('d1', 40)];
    expect(keys(todayTarget(step, history, rules).suggestions)).toContain('gym.target.stalled');
  });
});
