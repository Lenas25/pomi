import { describe, expect, it } from '@jest/globals';
import { getDay, parseISO } from 'date-fns';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { shiftDay } from '../companion/sleepDebt';
import { generateSyntheticDays } from '../testing/syntheticData';
import { clockToMinutes, minutesToClock } from '../time';

import { buildInsights, gymPerformanceByDate, isoWeekStart } from './buildInsights';
import {
  GYM_PERFORMANCE_DIFF_MIN,
  MIN_CHECKIN_DAYS,
  MIN_GROUP_DAYS,
  SLEEP_DIFF_MIN,
  STEPS_DIFF_MIN,
} from './limits';
import { INSIGHT_KINDS, type InsightData, type InsightVariant } from './types';

// Saturday 2026-02-28; its ISO week is Mon 02-23 .. Sun 03-01.
const TODAY = '2026-02-28';
const day = (offset: number) => shiftDay(TODAY, -offset);

const empty: InsightData = {
  nights: [],
  quality: [],
  energy: [],
  checkinDates: [],
  gymDates: [],
  noGymDates: [],
  steps: [],
  activity: [],
  sessions: [],
  history: [],
};

/** Morning check-in whose sleep lasts `sleepMin` and ends at 07:00. */
const night = (date: string, sleepMin: number) => ({
  date,
  bed: minutesToClock(clockToMinutes('07:00') - sleepMin),
  wake: '07:00',
});

/** `count` consecutive days ending today, newest offset 0. */
const dates = (count: number) => Array.from({ length: count }, (_, index) => day(index));

/** Sleep data: gym days sleep `gymSleep`, the others `otherSleep`; `gymCount` of `total` days are gym days. */
function sleepData(gymCount: number, otherCount: number, gymSleep: number, otherSleep: number) {
  const all = dates(gymCount + otherCount);
  const gymDates = all.slice(0, gymCount);
  return {
    ...empty,
    nights: all.map((date, index) => night(date, index < gymCount ? gymSleep : otherSleep)),
    checkinDates: all,
    gymDates,
    noGymDates: all.slice(gymCount),
  };
}

describe('minimum data', () => {
  it('needs 21 days with check-ins', () => {
    const base = sleepData(10, 10, 480, 420);
    expect(buildInsights(base, TODAY)).toEqual([]);
    expect(MIN_CHECKIN_DAYS).toBe(21);
    const enough = sleepData(11, 10, 480, 420);
    expect(buildInsights(enough, TODAY)).toHaveLength(1);
  });

  it('needs 7 days in EACH compared group', () => {
    // 21 days of check-ins but only 6 gym days: nothing to compare.
    expect(buildInsights({ ...sleepData(6, 15, 480, 420) }, TODAY)).toEqual([]);
    expect(buildInsights({ ...sleepData(7, 14, 480, 420) }, TODAY)).toHaveLength(1);
    expect(buildInsights({ ...sleepData(14, 6, 480, 420) }, TODAY)).toEqual([]);
    expect(MIN_GROUP_DAYS).toBe(7);
  });

  it('ignores days older than the window', () => {
    const data = sleepData(11, 10, 480, 420);
    const old = { ...data, checkinDates: data.checkinDates.map((d) => shiftDay(d, -200)) };
    expect(buildInsights({ ...old, nights: [] }, TODAY)).toEqual([]);
  });
});

describe('sleep on gym vs non-gym days (threshold 20 min)', () => {
  it('19 minutes of difference is not enough, 20 is', () => {
    expect(buildInsights(sleepData(10, 11, 439, 420), TODAY)).toEqual([]);
    const [insight] = buildInsights(sleepData(10, 11, 440, 420), TODAY);
    expect(insight).toMatchObject({
      kind: 'sleepGym',
      variant: 'sleepGym.more',
      textKey: 'insights.sleepGym.more',
      params: { minutes: 20 },
      evidence: { days: 21, unit: 'days', value: 20, gymDays: 10, otherDays: 11 },
    });
    expect(SLEEP_DIFF_MIN).toBe(20);
  });

  it('days without positive evidence of no gym are in neither group', () => {
    const data = sleepData(10, 11, 480, 420);
    // Only 6 of the 11 other days have evidence of no gym: below the 7-day minimum.
    expect(buildInsights({ ...data, noGymDates: data.noGymDates.slice(0, 6) }, TODAY)).toEqual([]);
    expect(buildInsights({ ...data, noGymDates: data.noGymDates.slice(0, 7) }, TODAY)).toHaveLength(
      1,
    );
  });

  it('reads the other direction too', () => {
    const [insight] = buildInsights(sleepData(10, 11, 400, 420), TODAY);
    expect(insight).toMatchObject({ variant: 'sleepGym.less', params: { minutes: 20 } });
    expect(insight?.evidence.value).toBe(-20);
  });
});

describe('energy after >= 7 h nights vs shorter (threshold 0.5)', () => {
  /** `enoughEnergy` / `shortEnergy`: the energy values, one per day of each group. */
  function energyData(enoughEnergy: number[], shortEnergy: number[]): InsightData {
    const all = dates(enoughEnergy.length + shortEnergy.length);
    const enough = all.slice(0, enoughEnergy.length);
    return {
      ...empty,
      nights: all.map((date, index) => night(date, index < enoughEnergy.length ? 450 : 390)),
      energy: all.map((date, index) => ({
        date,
        value: [...enoughEnergy, ...shortEnergy][index] ?? 3,
      })),
      checkinDates: all,
      activity: enough.map((date) => ({ date, moved: false })),
    };
  }

  it('0.4 points is not enough, 0.5 is', () => {
    // enough: 6 threes + 4 fours = 3.4; short: ten threes = 3.0 -> 0.4
    expect(
      buildInsights(energyData([3, 3, 3, 3, 3, 3, 4, 4, 4, 4], Array(11).fill(3)), TODAY),
    ).toEqual([]);
    // enough: 5 threes + 5 fours = 3.5 -> 0.5
    const [insight] = buildInsights(
      energyData([3, 3, 3, 3, 3, 4, 4, 4, 4, 4], Array(11).fill(3)),
      TODAY,
    );
    expect(insight).toMatchObject({
      kind: 'energySleep',
      variant: 'energySleep.higher',
      params: { points: 0.5 },
      evidence: { days: 21, enoughDays: 10, shortDays: 11 },
    });
  });

  it('compares the means at two decimals: a gap of exactly 0.5 passes and the text uses it', () => {
    // 3.45 vs 2.95 (20 days each): float subtraction alone gives 0.4999999999999996.
    const enough = [...Array(11).fill(3), ...Array(9).fill(4)];
    const short = [...Array(1).fill(2), ...Array(19).fill(3)];
    const [insight] = buildInsights(energyData(enough, short), TODAY);
    expect(insight).toMatchObject({ variant: 'energySleep.higher', params: { points: 0.5 } });
    expect(insight?.evidence.value).toBe(0.5);
  });

  it('lower energy after long nights reads as lower', () => {
    const [insight] = buildInsights(energyData(Array(10).fill(3), Array(11).fill(4)), TODAY);
    expect(insight).toMatchObject({ variant: 'energySleep.lower', params: { points: 1 } });
  });
});

describe('steps on workdays vs weekends (threshold 1000)', () => {
  /** 28 days: weekends walk `weekend`, the other days `weekend + diff`. */
  function stepsData(diff: number): InsightData {
    const all = dates(28);
    return {
      ...empty,
      checkinDates: all,
      steps: all.map((date) => {
        const weekday = getDay(parseISO(date));
        return { date, steps: weekday === 0 || weekday === 6 ? 6000 : 6000 + diff };
      }),
    };
  }

  it('999 steps is not enough, 1000 is', () => {
    expect(buildInsights(stepsData(999), TODAY)).toEqual([]);
    const [insight] = buildInsights(stepsData(1000), TODAY);
    expect(insight).toMatchObject({
      kind: 'stepsWeek',
      variant: 'stepsWeek.more',
      params: { steps: 1000 },
      evidence: { days: 28, workdays: 20, weekends: 8, value: 1000 },
    });
    expect(STEPS_DIFF_MIN).toBe(1000);
  });

  it('more steps on weekends reads as less on weekdays', () => {
    expect(buildInsights(stepsData(-1500), TODAY)[0]).toMatchObject({
      variant: 'stepsWeek.less',
      params: { steps: 1500 },
    });
  });

  it('needs 7 weekend days', () => {
    const data = stepsData(2000);
    const fewWeekends = { ...data, steps: data.steps.slice(0, 20) };
    expect(buildInsights(fewWeekends, TODAY)).toEqual([]);
  });
});

describe('gym performance by sleep quality (threshold 15 points)', () => {
  /**
   * One exercise, a session every second day. `met[i]` says whether session i matched or beat the
   * previous one (weight +1 / -1 kg, one rep), `quality[i]` is that night's sleep quality.
   */
  function gymData(met: boolean[], quality: number[]): InsightData {
    let weight = 100;
    const days = met.map((_, index) => day((met.length - 1 - index) * 2));
    const sessions = met.map((ok, index) => {
      if (index > 0) weight += ok ? 1 : -1;
      return { date: days[index] ?? '', sets: [{ stepId: 'squat', weightKg: weight, reps: 1 }] };
    });
    return {
      ...empty,
      checkinDates: days,
      quality: days.map((date, index) => ({ date, value: quality[index] ?? 3 })),
      sessions,
    };
  }

  /** 21 sessions: the first has no predecessor; then 20 good-sleep and 20 poor-sleep ones are 2 x 20. */
  function split(goodMet: number, poorMet: number) {
    // Session 0 is unscored; sessions 1..40 alternate good / poor nights (20 each).
    const met = [true];
    const quality = [3];
    let good = 0;
    let poor = 0;
    for (let index = 1; index <= 40; index += 1) {
      if (index % 2 === 1) {
        met.push(good < goodMet);
        good += 1;
        quality.push(5);
      } else {
        met.push(poor < poorMet);
        poor += 1;
        quality.push(1);
      }
    }
    return gymData(met, quality);
  }

  it('measures a session by the share of exercises that matched or beat the previous one', () => {
    const data = gymData([true, true, false, true], [3, 3, 3, 3]);
    const performance = gymPerformanceByDate(data.sessions);
    expect([...performance.values()]).toEqual([100, 0, 100]);
    expect(performance.has(data.sessions[0]?.date ?? '')).toBe(false);
  });

  it('10 points is not enough, 15 is', () => {
    expect(buildInsights(split(12, 10), TODAY)).toEqual([]);
    const [insight] = buildInsights(split(13, 10), TODAY);
    expect(insight).toMatchObject({
      kind: 'gymSleepQuality',
      variant: 'gymSleepQuality.better',
      params: { points: 15 },
      evidence: { days: 40, goodDays: 20, poorDays: 20, value: 15 },
    });
    expect(GYM_PERFORMANCE_DIFF_MIN).toBe(15);
  });

  it('reads the other direction and ignores quality 3', () => {
    expect(buildInsights(split(5, 15), TODAY)[0]).toMatchObject({
      variant: 'gymSleepQuality.worse',
      params: { points: 50 },
    });
    const allThree = gymData(Array(41).fill(true), Array(41).fill(3));
    expect(buildInsights(allThree, TODAY)).toEqual([]);
  });
});

describe('weekday with the most consistency', () => {
  /** 10 weeks ending on a Friday; `moved(weekday, n)` says whether the n-th such weekday moved. */
  function weekdayData(moved: (weekday: number, n: number) => boolean): InsightData {
    const all = dates(70);
    const seen = new Map<number, number>();
    return {
      ...empty,
      checkinDates: all,
      activity: all.map((date) => {
        const weekday = getDay(parseISO(date));
        const n = seen.get(weekday) ?? 0;
        seen.set(weekday, n + 1);
        return { date, moved: moved(weekday, n) };
      }),
    };
  }

  it('needs 20 points over the rest AND 25 over the second-best weekday', () => {
    // Wednesdays move 9 of 10 (0.9); every other weekday 6 of 10 (0.6): leads 0.3 and 0.3.
    const found = buildInsights(
      weekdayData((weekday, n) => (weekday === 3 ? n < 9 : n < 6)),
      TODAY,
    );
    expect(found[0]).toMatchObject({
      kind: 'bestWeekday',
      variant: 'bestWeekday.top',
      params: { weekday: 3, percent: 90, otherPercent: 60 },
      evidence: { days: 70, weekdayDays: 10, otherDays: 60, value: 3 },
    });
    // One other weekday at 7 of 10: lead over the runner-up is only 0.2.
    expect(
      buildInsights(
        weekdayData((weekday, n) => (weekday === 3 ? n < 9 : weekday === 1 ? n < 7 : n < 6)),
        TODAY,
      ),
    ).toEqual([]);
    // Everyone else at 7 of 10: lead over the rest is 0.2 but over the runner-up too.
    expect(
      buildInsights(
        weekdayData((weekday, n) => (weekday === 3 ? n < 9 : n < 7)),
        TODAY,
      ),
    ).toEqual([]);
  });

  it('a tie at the top is no finding, and a close runner-up either', () => {
    // Tuesday and Friday tie at 1.0: neither stands out from the other.
    expect(
      buildInsights(
        weekdayData((weekday) => weekday === 2 || weekday === 5),
        TODAY,
      ),
    ).toEqual([]);
    // Wednesday 1.0, Monday 0.9, the rest 0: the lead over the rest is huge, over Monday only 0.1.
    expect(
      buildInsights(
        weekdayData((weekday, n) => (weekday === 3 ? true : weekday === 1 ? n < 9 : false)),
        TODAY,
      ),
    ).toEqual([]);
  });

  it('needs 10 observed days of that weekday', () => {
    const nine = (offset: number) => {
      const all = dates(63);
      const seen = new Map<number, number>();
      return {
        ...empty,
        checkinDates: all,
        activity: all.map((date) => {
          const weekday = getDay(parseISO(date));
          const n = seen.get(weekday) ?? 0;
          seen.set(weekday, n + 1);
          return { date, moved: weekday === 3 ? true : n < offset };
        }),
      };
    };
    expect(buildInsights(nine(0), TODAY)).toEqual([]);
  });
});

describe('weekly maximum and repeat block', () => {
  const data = sleepData(10, 11, 480, 420);

  it('at most one NEW insight per ISO week', () => {
    const sameWeek = [{ kind: 'stepsWeek' as const, createdOn: '2026-02-23', value: 1500 }];
    expect(buildInsights({ ...data, history: sameWeek }, TODAY)).toEqual([]);
    const lastWeek = [{ kind: 'stepsWeek' as const, createdOn: '2026-02-22', value: 1500 }];
    expect(buildInsights({ ...data, history: lastWeek }, TODAY)).toHaveLength(1);
    expect(isoWeekStart('2026-03-01')).toBe('2026-02-23');
  });

  it('does not repeat a kind within 4 weeks (27 days blocked, 28 allowed)', () => {
    const entry = (ago: number, value = 60) => [
      { kind: 'sleepGym' as const, createdOn: day(ago), value },
    ];
    // value 60 (480 - 420) is unchanged.
    expect(buildInsights({ ...data, history: entry(27) }, TODAY)).toEqual([]);
    expect(buildInsights({ ...data, history: entry(28) }, TODAY)).toHaveLength(1);
  });

  it('repeats earlier only when the value changed by at least its threshold', () => {
    // Today's value is +60. A stored +41 differs by 19: still blocked; +40 differs by 20: allowed.
    const history = (value: number) => [{ kind: 'sleepGym' as const, createdOn: day(10), value }];
    expect(buildInsights({ ...data, history: history(41) }, TODAY)).toEqual([]);
    expect(buildInsights({ ...data, history: history(40) }, TODAY)).toHaveLength(1);
    // A stored row without a value cannot show a change.
    expect(
      buildInsights({ ...data, history: [{ kind: 'sleepGym', createdOn: day(10) }] }, TODAY),
    ).toEqual([]);
  });

  it('bestWeekday is blocked for 4 weeks whichever weekday it names', () => {
    const weekdayData: InsightData = {
      ...empty,
      checkinDates: dates(70),
      activity: dates(70).map((date) => ({
        date,
        moved: getDay(parseISO(date)) === 3,
      })),
    };
    expect(buildInsights(weekdayData, TODAY)).toHaveLength(1);
    const history = [{ kind: 'bestWeekday' as const, createdOn: day(10), value: 5 }];
    expect(buildInsights({ ...weekdayData, history }, TODAY)).toEqual([]);
  });

  it('a blocked kind yields to the next qualifying one', () => {
    const both: InsightData = {
      ...data,
      steps: dates(28).map((date) => {
        const weekday = getDay(parseISO(date));
        return { date, steps: weekday === 0 || weekday === 6 ? 5000 : 7000 };
      }),
    };
    expect(buildInsights(both, TODAY)[0]?.kind).toBe('sleepGym');
    const blocked = buildInsights(
      { ...both, history: [{ kind: 'sleepGym', createdOn: day(10), value: 60 }] },
      TODAY,
    );
    expect(blocked[0]?.kind).toBe('stepsWeek');
  });
});

describe('wording', () => {
  const VARIANTS: InsightVariant[] = [
    'sleepGym.more',
    'sleepGym.less',
    'energySleep.higher',
    'energySleep.lower',
    'gymSleepQuality.better',
    'gymSleepQuality.worse',
    'stepsWeek.more',
    'stepsWeek.less',
    'bestWeekday.top',
  ];
  const lookup = (messages: object, path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        messages,
      );

  it('every variant has a prudent sentence in both languages, never causal or guilt-driven', () => {
    expect(new Set(VARIANTS.map((variant) => variant.split('.')[0]))).toEqual(
      new Set(INSIGHT_KINDS),
    );
    for (const variant of VARIANTS) {
      for (const [messages, lead] of [
        [es, /^Notamos que/],
        [en, /^We noticed that/],
      ] as const) {
        const text = lookup(messages, `insights.${variant}`);
        expect(typeof text).toBe('string');
        expect(text).toMatch(lead);
        expect(text).not.toMatch(
          /te hace|hace que|because|causes|makes you|racha|streak|fallaste|failed/i,
        );
      }
    }
  });

  it('the evidence line is "Basado en N días"', () => {
    expect(es.insights.basedOn).toBe('Basado en {{days}} días');
    expect(en.insights.basedOn).toBe('Based on {{days}} days');
  });
});

describe('determinism with the 60-day synthetic generator', () => {
  const synthetic = generateSyntheticDays({ days: 60, seed: 1 });
  const today = synthetic.at(-1)?.date ?? TODAY;
  const data: InsightData = {
    ...empty,
    nights: synthetic.map((d) => ({ date: d.date, bed: d.morning.bed, wake: d.morning.wake })),
    quality: synthetic.map((d) => ({ date: d.date, value: d.morning.quality })),
    energy: synthetic.map((d) => ({ date: d.date, value: d.night.energy })),
    checkinDates: synthetic.map((d) => d.date),
    gymDates: synthetic.filter((d) => d.gym).map((d) => d.date),
    noGymDates: synthetic.filter((d) => !d.gym).map((d) => d.date),
    steps: synthetic.map((d) => ({ date: d.date, steps: d.steps })),
    activity: synthetic.map((d) => ({
      date: d.date,
      moved: d.activity !== 'none',
      steps: d.steps,
    })),
  };

  it('finds the embedded gym -> sleep effect, the same way every time', () => {
    const first = buildInsights(data, today);
    expect(buildInsights(structuredClone(data), today)).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'sleepGym', variant: 'sleepGym.more' });
    const minutes = Number(first[0]?.params.minutes);
    expect(minutes).toBeGreaterThanOrEqual(20);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it('a different seed is a different (but still deterministic) series', () => {
    const other = generateSyntheticDays({ days: 60, seed: 7 });
    expect(other.map((d) => d.steps)).not.toEqual(synthetic.map((d) => d.steps));
  });
});
