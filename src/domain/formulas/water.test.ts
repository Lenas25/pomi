import { describe, expect, it } from '@jest/globals';

import { waterGoal } from './water';

describe('waterGoal', () => {
  it('60 kg on a rest day: 1,980 ml -> 8 glasses', () => {
    expect(waterGoal({ weightKg: 60 })).toMatchObject({ rawMl: 1980, glasses: 8, ml: 2000 });
  });

  it('60 kg on a gym day (1 h): 2,480 ml -> 10 glasses', () => {
    expect(waterGoal({ weightKg: 60, gymHours: 1 })).toMatchObject({
      rawMl: 2480,
      glasses: 10,
      ml: 2500,
    });
  });

  it('adds 500 ml per gym hour', () => {
    expect(waterGoal({ weightKg: 60, gymHours: 2 }).rawMl).toBe(2980);
  });

  it('rounds UP, and an exact multiple does not add a glass', () => {
    expect(waterGoal({ weightKg: 50 }).glasses).toBe(7); // 1650 -> 6.6 -> 7
    expect(waterGoal({ weightKg: 500 / 33, gymHours: 1 }).glasses).toBe(4); // 1000 ml exactly
  });

  it('supports another glass size', () => {
    expect(waterGoal({ weightKg: 60, glassMl: 200 })).toMatchObject({ glasses: 10, ml: 2000 });
  });

  it('rejects invalid input', () => {
    expect(() => waterGoal({ weightKg: 0 })).toThrow(RangeError);
    expect(() => waterGoal({ weightKg: Number.NaN })).toThrow(RangeError);
    expect(() => waterGoal({ weightKg: 60, gymHours: -1 })).toThrow(RangeError);
    expect(() => waterGoal({ weightKg: 60, glassMl: 0 })).toThrow(RangeError);
  });
});
