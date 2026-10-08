import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_SEDENTARY,
  canNudgeNow,
  recordNudge,
  shouldNudge,
  type NudgeState,
  type SedentaryConfig,
} from './shouldNudge';

// Tuesday 2026-02-03. Wake 06:00, bed 22:30: the nudge window is 07:00 - 20:30.
const at = (hour: number, minute = 0, day = 3) => new Date(2026, 1, day, hour, minute);

function state(
  overrides: Partial<NudgeState> = {},
  config: Partial<SedentaryConfig> = {},
): NudgeState {
  return {
    config: { ...DEFAULT_SEDENTARY, enabled: true, ...config },
    permission: true,
    wakeMin: 6 * 60,
    bedMin: 22 * 60 + 30,
    history: undefined,
    reading: { steps: 40, hasRecentData: true },
    ...overrides,
  };
}

describe('shouldNudge', () => {
  it('sends a nudge after a long sit: fewer steps than the threshold with recent data', () => {
    expect(shouldNudge(state(), at(11))).toEqual({ send: true, reason: 'send' });
  });

  it('the threshold is strict: exactly 100 steps is enough movement', () => {
    expect(shouldNudge(state({ reading: { steps: 99, hasRecentData: true } }), at(11)).send).toBe(
      true,
    );
    expect(shouldNudge(state({ reading: { steps: 100, hasRecentData: true } }), at(11))).toEqual({
      send: false,
      reason: 'enough',
    });
  });

  it('no Health Connect data is not inactivity', () => {
    expect(shouldNudge(state({ reading: null }), at(11)).reason).toBe('noData');
    expect(shouldNudge(state({ reading: undefined }), at(11)).reason).toBe('noData');
    expect(shouldNudge(state({ reading: { steps: 0, hasRecentData: false } }), at(11))).toEqual({
      send: false,
      reason: 'noData',
    });
  });

  it('needs the permission, the switch and the plan', () => {
    expect(shouldNudge(state({ permission: false }), at(11)).reason).toBe('noPermission');
    expect(shouldNudge(state({}, { enabled: false }), at(11)).reason).toBe('disabled');
    expect(shouldNudge(state({ wakeMin: undefined }), at(11)).reason).toBe('noPlan');
    expect(shouldNudge(state({ bedMin: undefined }), at(11)).reason).toBe('noPlan');
  });

  it('"No llevo el celular cuando camino" turns it off', () => {
    expect(shouldNudge(state({}, { noPhone: true }), at(11))).toEqual({
      send: false,
      reason: 'noPhone',
    });
  });

  it('only on the selected days (default Monday to Friday)', () => {
    expect(shouldNudge(state(), at(11, 0, 7)).reason).toBe('dayNotSelected'); // Saturday
    expect(shouldNudge(state({}, { days: [6] }), at(11, 0, 7)).send).toBe(true);
  });

  it('only awake and out of quiet hours: wake + 1 h to bed - 2 h, edges included', () => {
    expect(shouldNudge(state(), at(6, 59)).reason).toBe('quietHours');
    expect(shouldNudge(state(), at(7, 0)).send).toBe(true);
    expect(shouldNudge(state(), at(20, 30)).send).toBe(true);
    expect(shouldNudge(state(), at(20, 31)).reason).toBe('quietHours');
    expect(shouldNudge(state(), at(23, 30)).reason).toBe('quietHours');
    expect(shouldNudge(state(), at(3, 0, 4)).reason).toBe('quietHours');
  });

  it('the "Mis avisos" quiet windows silence the nudge too', () => {
    // 2026-02-03 is a Tuesday (weekday 2).
    const quiet = state({ quietWindows: [{ from: '13:00', until: '15:00', days: [2] }] });
    expect(shouldNudge(quiet, at(14))).toEqual({ send: false, reason: 'quietHours' });
    expect(shouldNudge(quiet, at(15)).send).toBe(true);
    expect(shouldNudge(quiet, at(14, 0, 4)).send).toBe(true); // Wednesday: not its day
  });

  it('a bedtime after midnight moves the window end past midnight (bed 00:30)', () => {
    const late = state({ bedMin: 24 * 60 + 30 });
    expect(shouldNudge(late, at(22, 0)).send).toBe(true);
    expect(shouldNudge(late, at(22, 31)).reason).toBe('quietHours');
  });

  it('respects the cap per day and counts per logical day', () => {
    const history = { date: '2026-02-03', count: 3, lastAt: at(8).getTime() };
    expect(shouldNudge(state({ history }), at(14)).reason).toBe('dailyCap');
    expect(shouldNudge(state({ history }, { maxPerDay: 4 }), at(14)).send).toBe(true);
    // Another day starts from zero.
    expect(shouldNudge(state({ history }), at(14, 0, 4)).send).toBe(true);
  });

  it('waits for the cooldown: the larger of the window and 2 hours', () => {
    const history = { date: '2026-02-03', count: 1, lastAt: at(10).getTime() };
    expect(shouldNudge(state({ history }, { windowMin: 60 }), at(11, 59)).reason).toBe('cooldown');
    expect(shouldNudge(state({ history }, { windowMin: 60 }), at(12, 0)).send).toBe(true);
    // A 120 minute window cannot be shorter than itself either.
    expect(shouldNudge(state({ history }, { windowMin: 120 }), at(11, 59)).reason).toBe('cooldown');
  });

  it('the cooldown survives midnight', () => {
    // 03:30 is still the logical day of the night before (day rolls over at 04:00).
    const history = { date: '2026-02-02', count: 1, lastAt: at(23, 0, 2).getTime() };
    expect(canNudgeNow(state({ history }), at(8, 0, 3)).send).toBe(true);
    const recent = { date: '2026-02-03', count: 1, lastAt: at(8, 0).getTime() };
    expect(canNudgeNow(state({ history: recent }), at(9, 0)).reason).toBe('cooldown');
  });

  it('uses the weekday of the LOGICAL day: 02:00 still belongs to the day that is ending', () => {
    // Saturday 02:00 is Friday's logical day; with Friday selected the day check passes (it is then
    // stopped by the quiet hours, not by the day).
    expect(shouldNudge(state({}, { days: [5] }), at(2, 0, 7)).reason).toBe('quietHours');
    expect(shouldNudge(state({}, { days: [6] }), at(2, 0, 7)).reason).toBe('dayNotSelected');
  });

  it('skips the pre-checks cheaply: canNudgeNow does not need a reading', () => {
    expect(canNudgeNow(state({ reading: undefined }), at(11))).toEqual({
      send: true,
      reason: 'send',
    });
    expect(canNudgeNow(state({ permission: false }), at(11)).send).toBe(false);
  });
});

describe('recordNudge', () => {
  it('counts per logical day and remembers the moment', () => {
    const first = recordNudge(undefined, at(9));
    expect(first).toEqual({ date: '2026-02-03', count: 1, lastAt: at(9).getTime() });
    expect(recordNudge(first, at(12))).toEqual({
      date: '2026-02-03',
      count: 2,
      lastAt: at(12).getTime(),
    });
    expect(recordNudge(first, at(9, 0, 4))).toMatchObject({ date: '2026-02-04', count: 1 });
  });
});
