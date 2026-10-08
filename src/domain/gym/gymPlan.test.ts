import { describe, expect, it } from '@jest/globals';

import {
  gymDaysFromPlan,
  isIsoMonday,
  plannedGymWeekdays,
  slotForTime,
  usualGymPlan,
} from './gymPlan';

const anchors = { gymMorning: '07:00', gymEvening: '11:30' };

describe('slotForTime', () => {
  it('uses the anchor that matches the time exactly, else the 12:00 split', () => {
    expect(slotForTime('11:30', anchors)).toBe('gymEvening');
    expect(slotForTime('07:00', anchors)).toBe('gymMorning');
    expect(slotForTime('11:30')).toBe('gymMorning');
    expect(slotForTime('12:00')).toBe('gymEvening');
  });
});

describe('gymDaysFromPlan', () => {
  it('projects an anchor-matching time to that anchor slot', () => {
    expect(gymDaysFromPlan([{ weekday: 2, time: '11:30' }], anchors)).toEqual([
      { days: [2], anchor: 'gymEvening' },
    ]);
  });

  it('two sessions in the same slot still count as two', () => {
    const days = gymDaysFromPlan([
      { weekday: 1, time: '19:00' },
      { weekday: 1, time: '21:00' },
      { weekday: 4, time: '08:00' },
    ]);
    expect(days).toEqual([
      { days: [1, 4], anchor: 'gymMorning' },
      { days: [1], anchor: 'gymEvening' },
    ]);
    expect(days.filter((entry) => entry.days.includes(1))).toHaveLength(2);
  });
});

describe('usualGymPlan', () => {
  it('fills slots beyond the stored times from the anchors', () => {
    expect(
      usualGymPlan({
        gymPlan: [{ weekday: 1, time: '07:15' }],
        gymDays: [
          { days: [1], anchor: 'gymMorning' },
          { days: [1], anchor: 'gymEvening' },
        ],
        anchors: { gymMorning: '07:00', gymEvening: '19:00' },
      }),
    ).toEqual([
      { weekday: 1, time: '07:15' },
      { weekday: 1, time: '19:00' },
    ]);
  });

  it('keeps two stored same-slot times without adding a third session', () => {
    const gymPlan = [
      { weekday: 1, time: '07:00' },
      { weekday: 1, time: '09:00' },
    ];
    expect(
      usualGymPlan({
        gymPlan,
        gymDays: gymDaysFromPlan(gymPlan),
        anchors: { gymEvening: '19:00' },
      }),
    ).toEqual(gymPlan);
  });
});

describe('isIsoMonday', () => {
  it('accepts real Mondays only', () => {
    expect(isIsoMonday('2026-10-05')).toBe(true);
    expect(isIsoMonday('2026-10-06')).toBe(false);
    expect(isIsoMonday('2026-02-30')).toBe(false);
  });
});

describe('plannedGymWeekdays', () => {
  it('reads the override of the week of the date', () => {
    const settings = {
      gymDays: [{ days: [1, 3], anchor: 'gymMorning' as const }],
      gymWeekPlans: { '2026-10-05': [{ weekday: 5, time: '18:00' }] },
    };
    expect([...plannedGymWeekdays(settings, '2026-10-07')]).toEqual([5]);
    expect([...plannedGymWeekdays(settings, '2026-10-12')]).toEqual([1, 3]);
  });
});
