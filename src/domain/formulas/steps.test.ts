import { describe, expect, it } from '@jest/globals';

import { daysGoalMet, initialStepsGoal, proposeStepsAdjustment, stepsBaseline } from './steps';

describe('stepsBaseline', () => {
  it('averages the last 7 days only', () => {
    expect(stepsBaseline([99999, 5000, 5000, 5000, 5000, 5000, 5000, 6000])).toBe(5143);
  });

  it('uses the onboarding answer when there is too little data', () => {
    expect(stepsBaseline([], 4000)).toBe(4000);
    expect(stepsBaseline([9000, 9000], 4000)).toBe(4000);
  });

  it('prefers measured data when there are at least 3 days', () => {
    expect(stepsBaseline([6000, 6000, 6000], 4000)).toBe(6000);
  });

  it('falls back to the little data it has, or null with nothing', () => {
    expect(stepsBaseline([6000, 7000])).toBe(6500);
    expect(stepsBaseline([])).toBeNull();
    expect(stepsBaseline([], null)).toBeNull();
  });

  it('ignores invalid values', () => {
    expect(stepsBaseline([Number.NaN, -5, 3000, 3000, 3000])).toBe(3000);
  });
});

describe('initialStepsGoal', () => {
  it('is baseline + 1,000 rounded to the nearest 500', () => {
    expect(initialStepsGoal(4000)).toBe(5000);
    expect(initialStepsGoal(4200)).toBe(5000); // 5200 -> 5000
    expect(initialStepsGoal(4300)).toBe(5500); // 5300 -> 5500
  });

  it('caps at 10,000 by default and honours a custom cap', () => {
    expect(initialStepsGoal(12000)).toBe(10000);
    expect(initialStepsGoal(9500)).toBe(10000);
    expect(initialStepsGoal(12000, 14000)).toBe(13000);
    expect(initialStepsGoal(12000, 8000)).toBe(8000);
  });

  it('rejects negative baselines', () => {
    expect(() => initialStepsGoal(-1)).toThrow(RangeError);
  });
});

describe('daysGoalMet', () => {
  it('counts days at or above the goal', () => {
    expect(daysGoalMet([5000, 4999, 6000], 5000)).toBe(2);
  });
});

describe('proposeStepsAdjustment', () => {
  const base = { currentGoal: 6000, baseline: 5000 };

  it('proposes +500 when the goal was met 5+ days', () => {
    expect(proposeStepsAdjustment({ ...base, daysMetThisWeek: 5 })).toEqual({
      kind: 'raise',
      newGoal: 6500,
    });
    expect(proposeStepsAdjustment({ ...base, daysMetThisWeek: 7 }).kind).toBe('raise');
  });

  it('keeps with 3 or 4 days met', () => {
    expect(proposeStepsAdjustment({ ...base, daysMetThisWeek: 4 }).kind).toBe('keep');
    expect(
      proposeStepsAdjustment({ ...base, daysMetThisWeek: 3, daysMetPreviousWeek: 0 }).kind,
    ).toBe('keep');
  });

  it('does not raise past the cap', () => {
    expect(proposeStepsAdjustment({ ...base, currentGoal: 10000, daysMetThisWeek: 7 }).kind).toBe(
      'keep',
    );
    expect(proposeStepsAdjustment({ ...base, currentGoal: 9800, daysMetThisWeek: 7 })).toEqual({
      kind: 'raise',
      newGoal: 10000,
    });
    expect(
      proposeStepsAdjustment({ ...base, currentGoal: 10000, cap: 12000, daysMetThisWeek: 7 }),
    ).toEqual({ kind: 'raise', newGoal: 10500 });
  });

  it('proposes -500 after two consecutive weeks under 3 days', () => {
    expect(proposeStepsAdjustment({ ...base, daysMetThisWeek: 2, daysMetPreviousWeek: 1 })).toEqual(
      { kind: 'lower', newGoal: 5500 },
    );
  });

  it('needs the previous week; one bad week alone is not enough', () => {
    expect(proposeStepsAdjustment({ ...base, daysMetThisWeek: 0 }).kind).toBe('keep');
    expect(
      proposeStepsAdjustment({ ...base, daysMetThisWeek: 2, daysMetPreviousWeek: 4 }).kind,
    ).toBe('keep');
  });

  it('never goes below the baseline', () => {
    expect(
      proposeStepsAdjustment({
        currentGoal: 5200,
        baseline: 5000,
        daysMetThisWeek: 1,
        daysMetPreviousWeek: 1,
      }),
    ).toEqual({ kind: 'lower', newGoal: 5000 });
    expect(
      proposeStepsAdjustment({
        currentGoal: 5000,
        baseline: 5000,
        daysMetThisWeek: 0,
        daysMetPreviousWeek: 0,
      }).kind,
    ).toBe('keep');
  });
});
