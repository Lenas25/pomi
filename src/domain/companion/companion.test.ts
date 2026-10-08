import { describe, expect, it } from '@jest/globals';

import type { MorningCheckin } from '../formulas/sleep';
import { dayKeyFor } from '../time';
import { generateSyntheticDays, type SyntheticDay } from '../testing/syntheticData';

import {
  buildCompanion,
  buildRhythm,
  chronotypeOf,
  circularMean,
  midSleepMin,
  pickTodayCard,
  sleepDebt,
  socialJetlag,
  waterCurve,
  type CompanionData,
  type WaterEventRow,
} from './index';

const sixty = generateSyntheticDays({ days: 60 });
const today = sixty[sixty.length - 1]!.date;

const nightsOf = (days: readonly SyntheticDay[]): MorningCheckin[] =>
  days.map((day) => ({ date: day.date, bed: day.morning.bed, wake: day.morning.wake }));

/** A morning check-in that slept `sleepMin` ending at `wake`. */
function night(date: string, wake: string, sleepMin: number): MorningCheckin {
  const [h = 0, m = 0] = wake.split(':').map(Number);
  const bedMin = (((h * 60 + m - sleepMin) % 1440) + 1440) % 1440;
  const bed = `${String(Math.floor(bedMin / 60)).padStart(2, '0')}:${String(bedMin % 60).padStart(2, '0')}`;
  return { date, bed, wake };
}

/** Each 250 ml of `waterByHour` becomes one counter write at hh:10 (value = glasses so far). */
function waterEvents(days: readonly SyntheticDay[]): WaterEventRow[] {
  return days.flatMap((day) => {
    const [y = 0, mo = 1, d = 1] = day.date.split('-').map(Number);
    let glasses = 0;
    const rows: WaterEventRow[] = [];
    day.waterByHour.forEach((ml, hour) => {
      if (ml <= 0) return;
      glasses += ml / 250;
      rows.push({ date: day.date, at: new Date(y, mo - 1, d, hour, 10).getTime(), value: glasses });
    });
    return rows;
  });
}

describe('sleepDebt', () => {
  const week = (sleeps: number[]) =>
    sleeps.map((sleep, index) => night(`2026-02-0${index + 1}`, '06:30', sleep));

  it('sums the missing minutes of the last 7 days', () => {
    // Target 7 h 30: 60 + 30 + 90 + 0 = 180 missing over four nights.
    const result = sleepDebt(week([390, 420, 360, 450]), 450, '2026-02-04');
    expect(result).toEqual({ days: 4, targetMin: 450, debtMin: 180 });
  });

  it('caps what a long night gives back at 60 minutes', () => {
    // A 10 h night is +150 over the target but only gives back 60; the other three miss 60 each.
    const capped = sleepDebt(week([600, 390, 390, 390]), 450, '2026-02-04');
    expect(capped?.debtMin).toBe(180 - 60);
    // Without the cap the balance would be 180 - 150 = 30.
  });

  it('never goes below zero', () => {
    expect(sleepDebt(week([540, 540, 540, 540]), 450, '2026-02-04')?.debtMin).toBe(0);
  });

  it('needs 4 nights with data in the window and a known target', () => {
    expect(sleepDebt(week([390, 390, 390]), 450, '2026-02-03')).toBeNull();
    expect(sleepDebt(week([390, 390, 390, 390]), undefined, '2026-02-04')).toBeNull();
    // Nights older than 7 days do not count.
    expect(sleepDebt(week([390, 390, 390, 390]), 450, '2026-02-20')).toBeNull();
  });

  it('is stable on the 60-day synthetic data and matches a hand calculation', () => {
    const result = sleepDebt(nightsOf(sixty), 450, today);
    const last7 = sixty.slice(-7);
    const expected = Math.max(
      0,
      last7.reduce((sum, day) => sum + Math.max(450 - day.morning.sleepMin, -60), 0),
    );
    expect(result).toEqual({ days: 7, targetMin: 450, debtMin: expected });
  });
});

describe('socialJetlag', () => {
  it('measures the shift of mid-sleep between free days and work days', () => {
    // Work days: 22:30-06:30 (mid 02:30). Free days: 23:30-09:30 (mid 04:30). 2 h apart.
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = `2026-02-${String(index + 1).padStart(2, '0')}`; // 2026-02-01 is a Sunday
      const weekday = (index + 0) % 7; // 0 = Sunday
      return weekday === 0 || weekday === 6 ? night(date, '09:30', 600) : night(date, '06:30', 480);
    });
    const result = socialJetlag(days, '2026-02-14');
    expect(result).toMatchObject({ jetlagMin: 120, freeNights: 4, workNights: 10, notable: true });
  });

  it('is below the mention threshold for a small shift', () => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = `2026-02-${String(index + 1).padStart(2, '0')}`;
      const free = index % 7 === 0 || index % 7 === 6;
      return night(date, free ? '07:00' : '06:30', 480);
    });
    const result = socialJetlag(days, '2026-02-14');
    expect(result?.jetlagMin).toBe(30);
    expect(result?.notable).toBe(false);
  });

  it('needs 2 free and 3 work nights', () => {
    const base = [
      night('2026-02-02', '06:30', 480), // Monday
      night('2026-02-03', '06:30', 480),
      night('2026-02-04', '06:30', 480),
      night('2026-02-07', '09:30', 480), // Saturday
    ];
    expect(socialJetlag(base, '2026-02-08')).toBeNull();
    expect(socialJetlag([...base, night('2026-02-08', '09:30', 480)], '2026-02-08')).not.toBeNull();
    expect(
      socialJetlag(
        [...base.slice(0, 2), ...base.slice(3), night('2026-02-08', '09:30', 480)],
        '2026-02-08',
      ),
    ).toBeNull();
  });

  it('works across midnight (mid-sleep around 00:00)', () => {
    const early = night('2026-02-03', '04:00', 480); // 20:00-04:00, mid 00:00
    expect(midSleepMin(early)).toBe(0);
    expect(Math.round(circularMean([1430, 10]))).toBe(0);
  });

  it('finds the weekend shift built into the 60-day synthetic data', () => {
    const result = socialJetlag(nightsOf(sixty), today);
    expect(result).not.toBeNull();
    expect(result!.jetlagMin).toBeGreaterThan(45);
    expect(result!.jetlagMin).toBeLessThan(90);
    expect(result!.notable).toBe(true);
    // The weekend is editable: with no free days there is nothing to compare.
    expect(socialJetlag(nightsOf(sixty), today, [])).toBeNull();
  });
});

describe('waterCurve', () => {
  const gapDays = generateSyntheticDays({ days: 60, afternoonGap: true });
  const gapToday = gapDays[gapDays.length - 1]!.date;

  it('averages the cumulative glasses by hour and finds a 3 hour afternoon gap', () => {
    const curve = waterCurve({ events: waterEvents(gapDays), today: gapToday });
    expect(curve).not.toBeNull();
    expect(curve!.days).toBe(14);
    // 14:00-17:00 has no water by construction; 17:00 itself is rare, so the gap may run to 18:00.
    expect(curve!.gap?.fromHour).toBe(14);
    expect(curve!.gap?.toHour).toBeGreaterThanOrEqual(17);
    expect(curve!.gap?.toHour).toBeLessThanOrEqual(18);
    // The curve never decreases and is flat through the gap.
    const glasses = curve!.byHour.map((entry) => entry.glasses);
    expect(glasses).toEqual([...glasses].sort((a, b) => a - b));
    const at = (hour: number) => curve!.byHour.find((entry) => entry.hour === hour)!.glasses;
    expect(at(16)).toBe(at(13));
    expect(at(18)).toBeGreaterThan(at(16));
  });

  it('reports no gap when water is spread through the day', () => {
    const even = Array.from({ length: 10 }, (_, index) => ({
      ...sixty[index]!,
      date: `2026-02-${String(index + 1).padStart(2, '0')}`,
      waterByHour: Array.from({ length: 24 }, (_, hour) => (hour >= 7 && hour <= 20 ? 250 : 0)),
    }));
    const curve = waterCurve({ events: waterEvents(even), today: '2026-02-12' });
    expect(curve?.gap).toBeNull();
  });

  it('needs 7 days with a record in the last 14 finished days', () => {
    const six = gapDays.slice(-7, -1);
    expect(waterCurve({ events: waterEvents(six), today: gapToday })).toBeNull();
    const seven = gapDays.slice(-8, -1);
    expect(waterCurve({ events: waterEvents(seven), today: gapToday })).not.toBeNull();
    // Today is never part of it (not finished).
    expect(waterCurve({ events: waterEvents(gapDays.slice(-7)), today: gapToday })).toBeNull();
  });

  it('ignores a gap outside the awake window or after the goal was already met', () => {
    const events = waterEvents(gapDays);
    // The person wakes at 16:00 (a shifted day): no 3 hour window fits between wake and 19:00.
    expect(waterCurve({ events, today: gapToday, wakeMin: 16 * 60 })?.gap).toBeNull();
    // Goal of 2 glasses: it is met before 14:00 every day, so there is nothing to catch up on.
    const targets = Object.fromEntries(gapDays.map((day) => [day.date, 2]));
    expect(waterCurve({ events, today: gapToday, targets })?.gap).toBeNull();
  });

  it('keeps the logical day: a write at 00:30 belongs to the day that is ending', () => {
    // 7 recorded days, each with ONE write at 00:30 of the next calendar day (logical day D).
    const events: WaterEventRow[] = Array.from({ length: 7 }, (_, index) => {
      const date = `2026-02-0${index + 1}`;
      return { date, at: new Date(2026, 1, index + 2, 0, 30).getTime(), value: 1 };
    });
    expect(dayKeyFor(new Date(events[0]!.at))).toBe('2026-02-01');
    const curve = waterCurve({ events, today: '2026-02-12' });
    // Nothing was logged during the drawn hours (06:00-22:00): the late write is hour 24.
    expect(curve?.byHour.every((entry) => entry.glasses === 0)).toBe(true);
  });
});

describe('Tu ritmo', () => {
  const full = (days: readonly SyntheticDay[]) => ({
    today: days[days.length - 1]!.date,
    nights: nightsOf(days),
    energy: days.map((day) => ({ date: day.date, value: day.night.energy })),
    checkinDates: days.map((day) => day.date),
    activity: days.map((day) => ({
      date: day.date,
      moved: day.activity !== 'none',
      steps: day.steps,
    })),
  });

  it('builds the profile from the 60-day synthetic data', () => {
    const rhythm = buildRhythm(full(sixty));
    expect(rhythm.ready).toBe(true);
    expect(rhythm.daysWithData).toBe(42);
    expect(rhythm.chronotype?.tendency).toBe('morning');
    expect(rhythm.activeWeekdays).toHaveLength(2);
    expect(rhythm.activeWeekdays.every((weekday) => weekday >= 1 && weekday <= 4)).toBe(true);
    // Sleep is built to move energy up by more than half a point per hour of sleep.
    expect(rhythm.energy.status).toBe('found');
    if (rhythm.energy.status === 'found') {
      expect(rhythm.energy.value.diff).toBeGreaterThanOrEqual(0.5);
      expect(rhythm.energy.value.enoughDays).toBeGreaterThanOrEqual(7);
      expect(rhythm.energy.value.shortDays).toBeGreaterThanOrEqual(7);
    }
  });

  it('needs 21 days with check-ins: 20 is "still getting to know you"', () => {
    const slice = (count: number) => sixty.slice(-count);
    const twenty = buildRhythm(full(slice(20)));
    expect(twenty).toMatchObject({
      ready: false,
      daysWithData: 20,
      needed: 21,
      activeWeekdays: [],
    });
    expect(twenty.chronotype).toBeNull();
    expect(buildRhythm(full(slice(21))).ready).toBe(true);
  });

  it('does not compare energy until each group has 7 days', () => {
    const data = full(sixty);
    // Only 6 nights shorter than 7 hours get an energy answer.
    const shortDates = sixty.filter((day) => day.morning.sleepMin < 420).map((day) => day.date);
    const keep = new Set(shortDates.slice(0, 6));
    const energy = data.energy.filter((entry) => {
      const isShort = shortDates.includes(entry.date);
      return !isShort || keep.has(entry.date);
    });
    expect(buildRhythm({ ...data, energy }).energy.status).toBe('insufficient');
  });

  it('says "no clear difference" instead of inventing one below half a point', () => {
    const data = full(sixty);
    const flat = data.energy.map((entry) => ({ ...entry, value: 3 }));
    expect(buildRhythm({ ...data, energy: flat }).energy.status).toBe('none');
  });

  it('classifies the tendency from the mid-sleep of free days', () => {
    expect(chronotypeOf(2 * 60)).toBe('morning');
    expect(chronotypeOf(4 * 60)).toBe('intermediate');
    expect(chronotypeOf(6 * 60)).toBe('evening');
    expect(chronotypeOf(23 * 60)).toBe('morning');
  });
});

describe('buildCompanion and the card of Hoy', () => {
  const gapDays = generateSyntheticDays({ days: 60, afternoonGap: true });
  const data = (
    days: readonly SyntheticDay[],
    extra: Partial<CompanionData> = {},
  ): CompanionData => ({
    today: days[days.length - 1]!.date,
    sleepTargetMin: 450,
    nights: nightsOf(days),
    energy: days.map((day) => ({ date: day.date, value: day.night.energy })),
    checkinDates: days.map((day) => day.date),
    activity: days.map((day) => ({ date: day.date, moved: day.gym })),
    water: { events: waterEvents(days), targets: {} },
    ...extra,
  });

  it('computes every engine and picks ONE card by priority', () => {
    const companion = buildCompanion(data(gapDays));
    expect(companion.sleepDebt).not.toBeNull();
    expect(companion.jetlag).not.toBeNull();
    expect(companion.water?.gap).not.toBeNull();
    expect(companion.rhythm.ready).toBe(true);

    expect(
      pickTodayCard({ ...companion, sleepDebt: { days: 7, targetMin: 450, debtMin: 150 } }),
    ).toEqual({
      kind: 'sleepDebt',
      debtMin: 150,
    });
    expect(
      pickTodayCard({ ...companion, sleepDebt: { days: 7, targetMin: 450, debtMin: 90 } })?.kind,
    ).toBe('jetlag');
    expect(
      pickTodayCard({
        ...companion,
        sleepDebt: null,
        jetlag: { jetlagMin: 30, freeNights: 4, workNights: 10, notable: false },
      }),
    ).toEqual({ kind: 'waterGap', ...companion.water!.gap! });
    expect(pickTodayCard({ ...companion, sleepDebt: null, jetlag: null, water: null })).toBeNull();
  });

  it('stays quiet without data', () => {
    const companion = buildCompanion(data(gapDays.slice(0, 2)));
    expect(companion.sleepDebt).toBeNull();
    expect(companion.jetlag).toBeNull();
    expect(companion.water).toBeNull();
    expect(companion.rhythm.ready).toBe(false);
    expect(pickTodayCard(companion)).toBeNull();
  });
});
