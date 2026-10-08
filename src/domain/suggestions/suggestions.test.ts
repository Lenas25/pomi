import { describe, expect, it } from '@jest/globals';
import { addDays, format, parseISO } from 'date-fns';

import type { ExerciseSession } from '../gym/todayTarget';
import { stepsPlan } from '../habits/stepsPlan';
import { generateSyntheticDays } from '../testing/syntheticData';

import { applyChange, isChangeStale, moveGymDay, type PlanSnapshot } from './applyChange';
import { buildSuggestions, createdThisWeek, isKindAvailable } from './buildSuggestions';
import {
  RULES,
  deloadRule,
  formatDuration,
  gymDayRule,
  sleepEarlierRule,
  stepsGoalRule,
  wakeRegularityRule,
  waterEarlierRule,
} from './rules';
import type { SuggestionData, SuggestionHistoryEntry, WaterDay } from './types';
import { valueAt } from './waterAt';

// 2026-01-31 is a Saturday; its ISO week runs Mon 2026-01-26 .. Sun 2026-02-01.
const TODAY = '2026-01-31';
const day = (offset: number) => format(addDays(parseISO(TODAY), offset), 'yyyy-MM-dd');
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** A morning check-in that slept `sleepMin` and woke at `wakeMin` (minutes of the day). */
function night(offset: number, sleepMin: number, wakeMin = 6 * 60) {
  return {
    date: day(offset),
    bed: clock((wakeMin - sleepMin + 1440) % 1440),
    wake: clock(wakeMin),
  };
}

const plan = stepsPlan({
  today: TODAY,
  startedOn: '2025-12-01',
  history: Array.from({ length: 7 }, (_, index) => ({
    date: format(addDays(parseISO('2025-12-01'), index), 'yyyy-MM-dd'),
    steps: 6000,
  })),
});

function data(overrides: Partial<SuggestionData> = {}): SuggestionData {
  return {
    anchors: { wake: '06:00', sleepTargetH: 8 },
    shifts: {},
    gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' }],
    startedOn: '2025-12-01',
    sleep: [],
    steps: { history: [], plan },
    water: [],
    gymDates: [],
    lifts: [],
    rules: { stallSessions: 3, deloadPct: 10 },
    deloadActive: false,
    history: [],
    ...overrides,
  };
}

// --- Dormir antes ------------------------------------------------------------------------------

describe('sleepEarlierRule', () => {
  const week = (sleepMin: number, days = 7) =>
    Array.from({ length: days }, (_, index) => night(-index, sleepMin));

  it('fires when the 7-day average is more than 30 min below the target, never at exactly 30', () => {
    expect(sleepEarlierRule(data({ sleep: week(450) }), TODAY)).toBeNull(); // 8 h − 30 min
    const fired = sleepEarlierRule(data({ sleep: week(449) }), TODAY);
    expect(fired?.change).toEqual({ type: 'bedtimeShift', fromMin: 0, toMin: -15 });
    expect(fired?.params).toMatchObject({ avg: '7 h 29 min', target: '8 h', minutes: 15 });
    expect(fired?.evidence).toMatchObject({ days: 7, avgMin: 449, targetMin: 480 });
  });

  it('needs 4 days of data and a sleep target', () => {
    expect(sleepEarlierRule(data({ sleep: week(360, 3) }), TODAY)).toBeNull();
    expect(sleepEarlierRule(data({ sleep: week(360, 4) }), TODAY)).not.toBeNull();
    expect(
      sleepEarlierRule(data({ sleep: week(360), anchors: { wake: '06:00' } }), TODAY),
    ).toBeNull();
  });

  it('only looks at the last 7 days', () => {
    const old = Array.from({ length: 7 }, (_, index) => night(-8 - index, 300));
    expect(sleepEarlierRule(data({ sleep: [...old, ...week(480, 4)] }), TODAY)).toBeNull();
  });

  it('moves 15 minutes at a time and never more than an hour in total', () => {
    expect(
      sleepEarlierRule(data({ sleep: week(360), shifts: { bedMin: -45 } }), TODAY)?.change,
    ).toEqual({ type: 'bedtimeShift', fromMin: -45, toMin: -60 });
    expect(sleepEarlierRule(data({ sleep: week(360), shifts: { bedMin: -60 } }), TODAY)).toBeNull();
  });
});

// --- Regularidad -------------------------------------------------------------------------------

describe('wakeRegularityRule', () => {
  const planWake = (wake: string) => ({ wake, sleepTargetH: 8 });
  const wakes = (spread: number) =>
    [0, 1, 2, 3, 4].map((index) => night(-index, 480, 6 * 60 + (index === 0 ? spread : 0)));

  it('fires when the wake time varies by MORE than 60 minutes', () => {
    expect(
      wakeRegularityRule(data({ sleep: wakes(60), anchors: planWake('07:00') }), TODAY),
    ).toBeNull();
    const fired = wakeRegularityRule(data({ sleep: wakes(61), anchors: planWake('07:00') }), TODAY);
    expect(fired?.change).toEqual({ type: 'wakeTime', to: '06:00' });
    expect(fired?.evidence).toMatchObject({ days: 5, rangeMin: 61 });
  });

  it('proposes the usual wake time when the plan has none, across midnight too', () => {
    const sleep = [-10, -5, 0, 5, 70].map((minutes, index) =>
      night(-index, 480, (24 * 60 + minutes) % 1440),
    );
    const fired = wakeRegularityRule(data({ sleep, anchors: { sleepTargetH: 8 } }), TODAY);
    expect(fired?.change).toEqual({ type: 'wakeTime', to: '00:00' });
  });

  it('stays quiet when the median is within 15 minutes of the plan wake time', () => {
    expect(
      wakeRegularityRule(data({ sleep: wakes(61), anchors: planWake('06:15') }), TODAY),
    ).toBeNull();
    expect(
      wakeRegularityRule(data({ sleep: wakes(61), anchors: planWake('06:20') }), TODAY)?.change,
    ).toEqual({ type: 'wakeTime', to: '06:00' });
  });

  it('needs 4 days', () => {
    expect(wakeRegularityRule(data({ sleep: wakes(120).slice(0, 3) }), TODAY)).toBeNull();
  });
});

// --- Pasos -------------------------------------------------------------------------------------

describe('stepsGoalRule', () => {
  // The plan's goal is baseline 6000 + 1000 = 7000.
  const stepsFor = (thisWeek: number[], previous: number[] = []) => [
    ...thisWeek.map((steps, index) => ({ date: day(-1 - index), steps })),
    ...previous.map((steps, index) => ({ date: day(-8 - index), steps })),
  ];
  const goal = plan.goal ?? 0;
  const hit = goal + 100;
  const miss = goal - 100;

  it('raises by 500 when the goal was met 5 or more of 7 days, not with 4', () => {
    const five = stepsGoalRule(
      data({ steps: { history: stepsFor([hit, hit, hit, hit, hit, miss, miss]), plan } }),
      TODAY,
    );
    expect(five?.variant).toBe('stepsRaise');
    expect(five?.change).toEqual({ type: 'stepsGoal', from: goal, to: goal + 500 });
    expect(five?.params).toMatchObject({ met: 5, total: 7 });
    const four = stepsGoalRule(
      data({ steps: { history: stepsFor([hit, hit, hit, hit, miss, miss, miss]), plan } }),
      TODAY,
    );
    expect(four).toBeNull();
  });

  it('lowers by 500 only after two weeks under 3 days, never below the baseline', () => {
    const low = [miss, miss, hit, miss, miss, miss, miss];
    const lowered = stepsGoalRule(data({ steps: { history: stepsFor(low, low), plan } }), TODAY);
    expect(lowered?.variant).toBe('stepsLower');
    expect(lowered?.change).toEqual({ type: 'stepsGoal', from: goal, to: goal - 500 });
    // One bad week is not enough.
    expect(stepsGoalRule(data({ steps: { history: stepsFor(low), plan } }), TODAY)).toBeNull();
    // The floor is the baseline rounded up to 500 (6000): a goal of 6000 stays.
    const atFloor = { ...plan, goal: 6000 };
    expect(
      stepsGoalRule(
        data({
          steps: { history: stepsFor([1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1]), plan: atFloor },
        }),
        TODAY,
      ),
    ).toBeNull();
  });

  it('does not count the previous week when the goal was changed by a suggestion lately', () => {
    const low = [miss, miss, hit, miss, miss, miss, miss];
    const history: SuggestionHistoryEntry[] = [
      { kind: 'stepsGoal', status: 'accepted', createdOn: day(-12), decidedOn: day(-10) },
    ];
    expect(
      stepsGoalRule(data({ steps: { history: stepsFor(low, low), plan }, history }), TODAY),
    ).toBeNull();
  });

  it('waits for the baseline week and needs at least 5 days of data', () => {
    const baseline = { ...plan, phase: 'baseline' as const };
    expect(
      stepsGoalRule(
        data({ steps: { history: stepsFor([hit, hit, hit, hit, hit, hit, hit]), plan: baseline } }),
        TODAY,
      ),
    ).toBeNull();
    expect(
      stepsGoalRule(data({ steps: { history: stepsFor([hit, hit, hit, hit]), plan } }), TODAY),
    ).toBeNull();
  });

  it('respects the cap', () => {
    const capped = { ...plan, goal: 10000 };
    expect(
      stepsGoalRule(
        data({
          steps: {
            history: stepsFor([10100, 10100, 10100, 10100, 10100, 1, 1]),
            plan: capped,
            cap: 10000,
          },
        }),
        TODAY,
      ),
    ).toBeNull();
  });
});

// --- Agua --------------------------------------------------------------------------------------

describe('waterEarlierRule', () => {
  const water = (glasses: number[], target = 10): WaterDay[] =>
    glasses.map((glassesAt18, index) => ({
      date: day(-1 - index),
      glassesAt18,
      targetGlasses: target,
    }));

  it('fires with under 60% at 18:00 on 5 of the last 7 days', () => {
    const fired = waterEarlierRule(data({ water: water([5, 5, 5, 5, 5, 8, 8]) }), TODAY);
    expect(fired?.change).toEqual({ type: 'waterShift', fromMin: 0, toMin: -30 });
    expect(fired?.params).toMatchObject({ short: 5, total: 7 });
    expect(waterEarlierRule(data({ water: water([5, 5, 5, 5, 8, 8, 8]) }), TODAY)).toBeNull();
  });

  it('adds the afternoon gap of the water curve to the reason, never to the decision', () => {
    const gap = { fromHour: 14, toHour: 17 };
    const fired = waterEarlierRule(
      data({ water: water([5, 5, 5, 5, 5, 8, 8]), waterGap: gap }),
      TODAY,
    );
    expect(fired?.reasonKey).toBe('suggestions.waterEarlier.reasonGap');
    expect(fired?.params).toMatchObject({ gapFrom: '14:00', gapTo: '17:00', short: 5 });
    // A gap alone does not fire anything: the 18:00 rule still decides.
    expect(
      waterEarlierRule(data({ water: water([8, 8, 8, 8, 8, 8, 8]), waterGap: gap }), TODAY),
    ).toBeNull();
  });

  it('60% exactly is not short, 62.5% neither, 50% is', () => {
    expect(waterEarlierRule(data({ water: water([6, 6, 6, 6, 6, 6, 6]) }), TODAY)).toBeNull();
    expect(waterEarlierRule(data({ water: water([5, 5, 5, 5, 5, 5, 5], 8) }), TODAY)).toBeNull();
    expect(waterEarlierRule(data({ water: water([5, 5, 5, 5, 5], 10) }), TODAY)).not.toBeNull();
  });

  it('needs five days with data and stays inside the two hour cap', () => {
    expect(waterEarlierRule(data({ water: water([0, 0, 0, 0]) }), TODAY)).toBeNull();
    const five = water([0, 0, 0, 0, 0]);
    expect(
      waterEarlierRule(data({ water: five, shifts: { waterMin: -90 } }), TODAY)?.change,
    ).toEqual({
      type: 'waterShift',
      fromMin: -90,
      toMin: -120,
    });
    expect(waterEarlierRule(data({ water: five, shifts: { waterMin: -120 } }), TODAY)).toBeNull();
  });
});

describe('valueAt (water by 18:00)', () => {
  const at = (hour: number) => new Date(2026, 0, 30, hour).getTime();
  it('takes the value after the last write at or before the limit', () => {
    const events = [
      { at: at(7), value: 1 },
      { at: at(12), value: 3 },
      { at: at(18), value: 4 },
      { at: at(20), value: 8 },
    ];
    expect(valueAt(events, at(18))).toBe(4);
    expect(valueAt(events, at(17))).toBe(3);
    expect(valueAt([...events].reverse(), at(17))).toBe(3);
    expect(valueAt(events, at(6))).toBe(0);
    expect(valueAt([], at(18))).toBe(0);
  });
});

// --- Día del gym -------------------------------------------------------------------------------

describe('gymDayRule', () => {
  // Today is Saturday 2026-01-31: the 28 days before it contain 4 of each weekday.
  const wednesdays = Array.from({ length: 4 }, (_, index) => day(-3 - 7 * index)); // Wed 01-28 ...
  const datesOf = (weekday: number) =>
    Array.from({ length: 28 }, (_, index) => day(-1 - index)).filter(
      (date) => parseISO(date).getDay() === weekday,
    );
  const trainedExcept = (weekday: number, skip: number) => {
    const all = [1, 3, 5].flatMap(datesOf);
    const skipped = new Set(datesOf(weekday).slice(0, skip));
    return all.filter((date) => !skipped.has(date));
  };

  it('fires when the same weekday was missed 3 of the last 4 weeks, not 2', () => {
    expect(wednesdays.every((date) => parseISO(date).getDay() === 3)).toBe(true);
    const fired = gymDayRule(data({ gymDates: trainedExcept(3, 3) }), TODAY);
    expect(fired?.change).toMatchObject({ type: 'moveGymDay', fromDay: 3 });
    expect(fired?.params).toMatchObject({ missed: 3, weeks: 4 });
    expect(gymDayRule(data({ gymDates: trainedExcept(3, 2) }), TODAY)).toBeNull();
  });

  it('a day planned off by a week override is not "missed"', () => {
    // Week of Monday 01-26: only Monday and Friday, so Wednesday 01-28 was planned off.
    const gymWeekPlans = {
      '2026-01-26': [
        { weekday: 1, time: '07:00' },
        { weekday: 5, time: '07:00' },
      ],
    };
    expect(gymDayRule(data({ gymDates: trainedExcept(3, 3), gymWeekPlans }), TODAY)).toBeNull();
    // An override of another week changes nothing.
    const other = { '2026-02-02': [] };
    expect(
      gymDayRule(data({ gymDates: trainedExcept(3, 3), gymWeekPlans: other }), TODAY)?.params,
    ).toMatchObject({ missed: 3 });
  });

  it('moves to the free weekday the person already trains on, else the next free one', () => {
    const base = trainedExcept(3, 4);
    const next = gymDayRule(data({ gymDates: base }), TODAY);
    expect(next?.change).toMatchObject({ toDay: 4 }); // Thursday follows Wednesday
    const usual = gymDayRule(data({ gymDates: [...base, ...datesOf(2).slice(0, 2)] }), TODAY);
    expect(usual?.change).toMatchObject({ toDay: 2 }); // Tuesday was used twice
  });

  it('judges four full weeks of the plan only, and needs a free weekday', () => {
    expect(gymDayRule(data({ gymDates: [], startedOn: day(-20) }), TODAY)).toBeNull();
    expect(
      gymDayRule(
        data({ gymDates: [], gymDays: [{ days: [0, 1, 2, 3, 4, 5, 6], anchor: 'gymMorning' }] }),
        TODAY,
      ),
    ).toBeNull();
    expect(gymDayRule(data({ gymDates: [], gymDays: [] }), TODAY)).toBeNull();
  });

  it('picks the weekday with the most misses first', () => {
    const fired = gymDayRule(data({ gymDates: [...datesOf(3), ...datesOf(5).slice(0, 1)] }), TODAY);
    // Monday (4 missed) and Friday (3 missed) qualify; Monday misses the most.
    expect(fired?.change).toMatchObject({ fromDay: 1 });
  });
});

// --- Descarga ----------------------------------------------------------------------------------

describe('deloadRule', () => {
  const session = (date: string, kg: number, reps: number): ExerciseSession => ({
    date,
    sets: [
      { weightKg: kg, reps, rir: 2 },
      { weightKg: kg, reps, rir: 2 },
    ],
  });
  // Most recent first: four sessions where none beat the one before.
  const stalled = [
    session('d4', 40, 8),
    session('d3', 40, 8),
    session('d2', 40, 9),
    session('d1', 40, 10),
  ];
  const improving = [
    session('d4', 45, 8),
    session('d3', 40, 9),
    session('d2', 40, 8),
    session('d1', 40, 7),
  ];

  it('is reactive: fires for a stalled lift, not for one that still improves', () => {
    const fired = deloadRule(
      data({ lifts: [{ stepId: 'hip-thrust', name: 'Hip thrust', sessions: stalled }] }),
      TODAY,
    );
    expect(fired?.change).toEqual({ type: 'deload', pct: 10, stepId: 'hip-thrust' });
    expect(fired?.params).toMatchObject({ exercise: 'Hip thrust', sessions: 3, pct: 10 });
    expect(
      deloadRule(data({ lifts: [{ stepId: 'x', name: 'X', sessions: improving }] }), TODAY),
    ).toBeNull();
    expect(deloadRule(data(), TODAY)).toBeNull();
  });

  it('waits while a deload week is running and after the deload session resets the stall', () => {
    expect(
      deloadRule(
        data({ deloadActive: true, lifts: [{ stepId: 'x', name: 'X', sessions: stalled }] }),
        TODAY,
      ),
    ).toBeNull();
    const afterDeload = [session('d5', 36, 10), ...stalled];
    expect(
      deloadRule(data({ lifts: [{ stepId: 'x', name: 'X', sessions: afterDeload }] }), TODAY),
    ).toBeNull();
  });
});

// --- The engine --------------------------------------------------------------------------------

describe('buildSuggestions', () => {
  // Everything fires at once: short sleep, irregular wake, water short.
  const sleep = [0, 1, 2, 3, 4, 5, 6].map((index) =>
    night(-index, 400, 6 * 60 + (index === 0 ? 90 : 0)),
  );
  const water: WaterDay[] = Array.from({ length: 7 }, (_, index) => ({
    date: day(-1 - index),
    glassesAt18: 1,
    targetGlasses: 10,
  }));
  const busy = () =>
    data({ sleep, water, gymDays: [], anchors: { wake: '07:00', sleepTargetH: 8 } });

  it('sets the priority order and shows at most 2 new per ISO week', () => {
    expect(RULES.length).toBe(6);
    const result = buildSuggestions(busy(), TODAY);
    expect(result.map((suggestion) => suggestion.kind)).toEqual(['sleepEarlier', 'wakeRegularity']);
  });

  it('counts what was already created this ISO week (Monday to Sunday)', () => {
    const history: SuggestionHistoryEntry[] = [
      { kind: 'gymDay', status: 'pending', createdOn: '2026-01-26', decidedOn: null }, // Monday
    ];
    expect(createdThisWeek(history, TODAY)).toBe(1);
    expect(buildSuggestions({ ...busy(), history }, TODAY).map((s) => s.kind)).toEqual([
      'sleepEarlier',
    ]);
    // Sunday 25th belongs to the previous ISO week.
    const lastWeek: SuggestionHistoryEntry[] = [
      { kind: 'gymDay', status: 'pending', createdOn: '2026-01-25', decidedOn: null },
      { kind: 'stepsGoal', status: 'accepted', createdOn: '2026-01-20', decidedOn: '2026-01-21' },
    ];
    expect(createdThisWeek(lastWeek, TODAY)).toBe(0);
    const full: SuggestionHistoryEntry[] = [
      { kind: 'gymDay', status: 'pending', createdOn: '2026-01-26', decidedOn: null },
      { kind: 'stepsGoal', status: 'rejected', createdOn: '2026-01-27', decidedOn: '2026-01-27' },
    ];
    expect(buildSuggestions({ ...busy(), history: full }, TODAY)).toEqual([]);
    // The next ISO week starts on Monday 2026-02-02.
    expect(buildSuggestions({ ...busy(), history: full }, '2026-02-02').length).toBeGreaterThan(0);
  });

  it('blocks a rejected kind for 4 weeks (28 days), then offers it again', () => {
    const rejected = (decidedOn: string): SuggestionHistoryEntry[] => [
      { kind: 'sleepEarlier', status: 'rejected', createdOn: decidedOn, decidedOn },
    ];
    expect(isKindAvailable('sleepEarlier', rejected(day(-27)), TODAY)).toBe(false);
    expect(isKindAvailable('sleepEarlier', rejected(day(-28)), TODAY)).toBe(true);
    expect(isKindAvailable('wakeRegularity', rejected(day(-1)), TODAY)).toBe(true);
    const result = buildSuggestions({ ...busy(), history: rejected(day(-27)) }, TODAY);
    expect(result.map((s) => s.kind)).not.toContain('sleepEarlier');
  });

  it('never duplicates a pending suggestion and gives accepted ones a week to work', () => {
    const pending: SuggestionHistoryEntry[] = [
      { kind: 'sleepEarlier', status: 'pending', createdOn: day(-20), decidedOn: null },
    ];
    expect(buildSuggestions({ ...busy(), history: pending }, TODAY).map((s) => s.kind)).toEqual([
      'wakeRegularity',
      'waterEarlier',
    ]);
    const accepted = (decidedOn: string): SuggestionHistoryEntry[] => [
      { kind: 'sleepEarlier', status: 'accepted', createdOn: decidedOn, decidedOn },
    ];
    expect(isKindAvailable('sleepEarlier', accepted(day(-6)), TODAY)).toBe(false);
    expect(isKindAvailable('sleepEarlier', accepted(day(-7)), TODAY)).toBe(true);
  });

  it('each suggestion carries its change, reason key, params and evidence', () => {
    for (const suggestion of buildSuggestions(busy(), TODAY)) {
      expect(suggestion.textKey).toBe(`suggestions.${suggestion.variant}.text`);
      expect(suggestion.reasonKey).toBe(`suggestions.${suggestion.variant}.reason`);
      expect(suggestion.evidence.days).toBeGreaterThan(0);
      expect(Object.keys(suggestion.params).length).toBeGreaterThan(0);
    }
  });
});

// --- With the 60 day synthetic generator -------------------------------------------------------

describe('with 60 days of synthetic history', () => {
  const synthetic = generateSyntheticDays({ days: 60, gymSleepBonusMin: 0 });
  const sleep = synthetic.map((entry) => ({
    date: entry.date,
    bed: entry.morning.bed,
    wake: entry.morning.wake,
  }));
  const gymDates = synthetic.filter((entry) => entry.gym).map((entry) => entry.date);
  const water: WaterDay[] = synthetic.map((entry) => ({
    date: entry.date,
    glassesAt18: entry.waterByHour.slice(0, 18).reduce((sum, ml) => sum + ml, 0) / 250,
    // A 14 glass goal (heavy gym day): the afternoon dip leaves about half by 18:00.
    targetGlasses: 14,
  }));
  const history = synthetic.map((entry) => ({ date: entry.date, steps: entry.steps }));
  const last = synthetic.at(-1)?.date ?? TODAY;

  it('an eight hour target against ~7 h of sleep suggests going to bed earlier; seven hours does not', () => {
    const short = buildSuggestions(
      data({ sleep, gymDays: [{ days: [1, 2, 3, 4], anchor: 'gymMorning' }], gymDates }),
      last,
    );
    expect(short.map((s) => s.kind)).toContain('sleepEarlier');
    const fine = sleepEarlierRule(
      data({ sleep, anchors: { wake: '05:10', sleepTargetH: 6.5 } }),
      last,
    );
    expect(fine).toBeNull();
  });

  it('flags the weekend drift as an irregular wake time and the water dip as short afternoons', () => {
    const weekWithWeekend = sleep.filter((entry) => entry.date > day(-8) && entry.date <= last);
    expect(
      wakeRegularityRule(data({ sleep: weekWithWeekend, anchors: { sleepTargetH: 8 } }), last),
    ).not.toBeNull();
    expect(waterEarlierRule(data({ water }), last)?.change).toMatchObject({ toMin: -30 });
  });

  it('keeps attendance based gym suggestions quiet when the person went', () => {
    expect(
      gymDayRule(data({ gymDays: [{ days: [1, 2, 3, 4], anchor: 'gymMorning' }], gymDates }), last),
    ).toBeNull();
    expect(
      stepsGoalRule(data({ steps: { history, plan } }), last)?.change.type ?? 'stepsGoal',
    ).toBe('stepsGoal');
  });
});

// --- Applying a change -------------------------------------------------------------------------

describe('applyChange', () => {
  const snapshot: PlanSnapshot = {
    today: '2026-01-31',
    anchors: { wake: '06:00', sleepTargetH: 8 },
    shifts: { waterMin: -30 },
    gymDays: [
      { days: [1, 3], anchor: 'gymMorning' },
      { days: [5], anchor: 'gymEvening' },
    ],
    goals: { waterGlassesRest: 8, stepsGoal: 7000 },
  };

  it('moves the bedtime and the water reminders earlier, keeping the other shift', () => {
    expect(applyChange({ type: 'bedtimeShift', fromMin: 0, toMin: -15 }, snapshot)).toEqual({
      shifts: { waterMin: -30, bedMin: -15 },
    });
    expect(applyChange({ type: 'waterShift', fromMin: -30, toMin: -60 }, snapshot)).toEqual({
      shifts: { waterMin: -60 },
    });
    // Never past the caps, even for a stale suggestion.
    expect(
      applyChange({ type: 'bedtimeShift', fromMin: 0, toMin: -200 }, snapshot).shifts?.bedMin,
    ).toBe(-60);
  });

  it('fixes the wake time and changes the steps goal without touching the other goals', () => {
    expect(applyChange({ type: 'wakeTime', to: '05:10' }, snapshot).anchors).toEqual({
      wake: '05:10',
      sleepTargetH: 8,
    });
    expect(applyChange({ type: 'stepsGoal', from: 7000, to: 7500 }, snapshot).goals).toEqual({
      waterGlassesRest: 8,
      stepsGoal: 7500,
    });
  });

  it('moves a gym day inside its own slot and refuses stale or clashing moves', () => {
    expect(applyChange({ type: 'moveGymDay', fromDay: 3, toDay: 4 }, snapshot).gymDays).toEqual([
      { days: [1, 4], anchor: 'gymMorning' },
      { days: [5], anchor: 'gymEvening' },
    ]);
    expect(moveGymDay(snapshot.gymDays, 2, 4)).toBe(snapshot.gymDays);
    expect(moveGymDay(snapshot.gymDays, 3, 5)).toBe(snapshot.gymDays);
  });

  it('starts a one week deload today', () => {
    expect(applyChange({ type: 'deload', pct: 10, stepId: 'x' }, snapshot).deloadWeek).toEqual({
      startsOn: '2026-01-31',
      endsOn: '2026-02-06',
      pct: 10,
    });
  });
});

describe('formatDuration', () => {
  it('writes hours and minutes', () => {
    expect(formatDuration(400)).toBe('6 h 40 min');
    expect(formatDuration(420)).toBe('7 h');
  });
});

// --- Review findings ---------------------------------------------------------------------------

describe('review findings', () => {
  it('compares the UNROUNDED sleep mean: 449.57 min is short, though it rounds to the 450 edge', () => {
    const sleep = [450, 450, 450, 450, 450, 450, 447].map((minutes, index) =>
      night(-index, minutes),
    );
    const fired = sleepEarlierRule(data({ sleep }), TODAY);
    expect(fired).not.toBeNull();
    expect(fired?.params).toMatchObject({ avg: '7 h 30 min' });
  });

  it('wake regularity stays quiet when the plan already holds the usual wake time', () => {
    const sleep = [0, 1, 2, 3, 4].map((index) =>
      night(-index, 480, 6 * 60 + (index === 0 ? 61 : 0)),
    );
    expect(
      wakeRegularityRule(data({ sleep, anchors: { wake: '06:00', sleepTargetH: 8 } }), TODAY),
    ).toBeNull();
  });

  it('gym day only counts weeks since the gym plan last changed', () => {
    const planned = [1, 3, 5].flatMap((weekday) =>
      Array.from({ length: 28 }, (_, index) => day(-1 - index)).filter(
        (date) => parseISO(date).getDay() === weekday,
      ),
    );
    const trained = planned.filter((date) => parseISO(date).getDay() !== 3);
    expect(gymDayRule(data({ gymDates: trained }), TODAY)).not.toBeNull();
    // Changed 10 days ago: only ~1.5 weeks with the current plan, so nothing to judge yet.
    expect(gymDayRule(data({ gymDates: trained, gymPlanChangedOn: day(-10) }), TODAY)).toBeNull();
    // Changed exactly 4 weeks before the first judged day: judged.
    expect(
      gymDayRule(data({ gymDates: trained, gymPlanChangedOn: day(-28) }), TODAY),
    ).not.toBeNull();
  });

  it('steps goal ignores the previous week when the goal was edited by hand lately', () => {
    const goal = plan.goal ?? 0;
    const low = [
      goal - 100,
      goal - 100,
      goal + 100,
      goal - 100,
      goal - 100,
      goal - 100,
      goal - 100,
    ];
    const history = [
      ...low.map((steps, index) => ({ date: day(-1 - index), steps })),
      ...low.map((steps, index) => ({ date: day(-8 - index), steps })),
    ];
    expect(stepsGoalRule(data({ steps: { history, plan } }), TODAY)?.variant).toBe('stepsLower');
    expect(
      stepsGoalRule(data({ steps: { history, plan }, goalsChangedOn: day(-5) }), TODAY),
    ).toBeNull();
    expect(
      stepsGoalRule(data({ steps: { history, plan }, goalsChangedOn: day(-15) }), TODAY)?.variant,
    ).toBe('stepsLower');
  });

  it('deload is blocked for 14 days after a deload week ends', () => {
    const session = (date: string, kg: number, reps: number): ExerciseSession => ({
      date,
      sets: [{ weightKg: kg, reps, rir: 2 }],
    });
    const stalled = [
      session('d4', 40, 8),
      session('d3', 40, 8),
      session('d2', 40, 9),
      session('d1', 40, 10),
    ];
    const lifts = [{ stepId: 'x', name: 'X', sessions: stalled }];
    expect(deloadRule(data({ lifts, deloadEndedOn: day(-13) }), TODAY)).toBeNull();
    expect(deloadRule(data({ lifts, deloadEndedOn: day(-14) }), TODAY)).toBeNull();
    expect(deloadRule(data({ lifts, deloadEndedOn: day(-15) }), TODAY)).not.toBeNull();
  });

  it('a rejection blocks only its own (kind, target)', () => {
    const missed = (weekday: number) =>
      [1, 3, 5]
        .filter((day1) => day1 !== weekday)
        .flatMap((day1) =>
          Array.from({ length: 28 }, (_, index) => day(-1 - index)).filter(
            (date) => parseISO(date).getDay() === day1,
          ),
        );
    // Wednesday AND Friday were missed 4 times: Wednesday is the worst (earlier in the week).
    const trained = [...missed(3)].filter((date) => parseISO(date).getDay() === 1);
    const first = gymDayRule(data({ gymDates: trained }), TODAY);
    expect(first?.change).toMatchObject({ fromDay: 3 });
    const rejectedWednesday: SuggestionHistoryEntry[] = [
      {
        kind: 'gymDay',
        target: 'day:3',
        status: 'rejected',
        createdOn: day(-3),
        decidedOn: day(-3),
      },
    ];
    const next = gymDayRule(data({ gymDates: trained, history: rejectedWednesday }), TODAY);
    expect(next?.change).toMatchObject({ fromDay: 5 });
    expect(isKindAvailable('gymDay', rejectedWednesday, TODAY, 'day:3')).toBe(false);
    expect(isKindAvailable('gymDay', rejectedWednesday, TODAY, 'day:5')).toBe(true);
  });

  it('counts the right unit as evidence: sessions for a deload, days for the rest', () => {
    const sleep = Array.from({ length: 7 }, (_, index) => night(-index, 400));
    expect(sleepEarlierRule(data({ sleep }), TODAY)?.evidence.unit).toBe('days');
    const session = (date: string, kg: number, reps: number): ExerciseSession => ({
      date,
      sets: [{ weightKg: kg, reps, rir: 2 }],
    });
    const lifts = [
      {
        stepId: 'x',
        name: 'X',
        sessions: [
          session('d4', 40, 8),
          session('d3', 40, 8),
          session('d2', 40, 9),
          session('d1', 40, 10),
        ],
      },
    ];
    expect(deloadRule(data({ lifts }), TODAY)?.evidence.unit).toBe('sessions');
  });
});

describe('isChangeStale', () => {
  const base = {
    today: TODAY,
    anchors: { wake: '06:00', sleepTargetH: 8 },
    shifts: {},
    gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' as const }],
    goals: {},
    createdOn: day(-1),
    deloadActive: false,
  };

  it('is fresh while the plan still matches what the suggestion started from', () => {
    expect(isChangeStale({ type: 'bedtimeShift', fromMin: 0, toMin: -15 }, base)).toBe(false);
    expect(isChangeStale({ type: 'moveGymDay', fromDay: 3, toDay: 4 }, base)).toBe(false);
  });

  it('is stale when the plan moved on', () => {
    const shifted = { ...base, shifts: { bedMin: -15, waterMin: -30 } };
    expect(isChangeStale({ type: 'bedtimeShift', fromMin: 0, toMin: -15 }, shifted)).toBe(true);
    expect(isChangeStale({ type: 'waterShift', fromMin: 0, toMin: -30 }, shifted)).toBe(true);
    expect(isChangeStale({ type: 'wakeTime', to: '06:00' }, base)).toBe(true);
    expect(isChangeStale({ type: 'moveGymDay', fromDay: 2, toDay: 4 }, base)).toBe(true);
    expect(isChangeStale({ type: 'moveGymDay', fromDay: 3, toDay: 5 }, base)).toBe(true);
    expect(
      isChangeStale({ type: 'deload', pct: 10, stepId: 'x' }, { ...base, deloadActive: true }),
    ).toBe(true);
    expect(
      isChangeStale(
        { type: 'stepsGoal', from: 7000, to: 7500 },
        { ...base, goals: { stepsGoal: 8000 } },
      ),
    ).toBe(true);
    expect(
      isChangeStale(
        { type: 'stepsGoal', from: 7000, to: 7500 },
        { ...base, goalsChangedOn: TODAY },
      ),
    ).toBe(true);
  });
});
