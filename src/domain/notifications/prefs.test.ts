import { describe, expect, it } from '@jest/globals';

import { notificationPrefsSchema } from '../../db/repositories/settings';
import { loadDefaultTemplates } from '../../templates/defaults';

import {
  MAX_SCHEDULED,
  buildUpcoming,
  type PlannedNotification,
  type UpcomingState,
} from './buildUpcoming';
import {
  DEFAULT_SCREENS_BEFORE_MIN,
  applyCategoryTimes,
  isInQuietWindow,
  moveWindowStart,
  reminderRole,
  windowCrossesMidnight,
  type CategoryPrefs,
} from './prefs';
import { previewTomorrow } from './preview';

const defaults = loadDefaultTemplates();
// 2026-10-05 is a Monday; defaults: wake 05:10, bed 21:40, gym Mon/Wed 06:00, Tue/Thu 18:00.
const MONDAY = new Date(2026, 9, 5, 4, 0);

function state(categories?: CategoryPrefs, workType = 'sentada'): UpcomingState {
  const { settings, modules } = defaults;
  return {
    profile: { weightKg: 60, workType },
    anchors: settings.anchors ?? {},
    gymDays: settings.gymDays ?? [],
    modules,
    ...(categories ? { categories } : {}),
    today: {
      activityLogged: false,
      gymDone: false,
      checkinsDone: { morning: false, night: false },
      doneAgendaIds: [],
    },
  };
}

const monday = (list: readonly PlannedNotification[]) =>
  list.filter((n) => n.data.date === '2026-10-05');
const clock = (at: number) => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const times = (list: readonly PlannedNotification[], pick: (n: PlannedNotification) => boolean) =>
  monday(list)
    .filter(pick)
    .map((n) => clock(n.at));
const isPause = (n: PlannedNotification) => n.data.habitId === 'pausa-activa';
const isWater = (n: PlannedNotification) => n.kind === 'water';
const reminder = (id: string) => (n: PlannedNotification) => n.data.reminderId === id;

describe('no preferences = today behaviour', () => {
  it('an empty prefs object changes nothing', () => {
    expect(buildUpcoming(state({}), MONDAY)).toEqual(buildUpcoming(state(), MONDAY));
  });
});

describe('each category toggle', () => {
  const cases: [string, CategoryPrefs, (n: PlannedNotification) => boolean][] = [
    ['water', { water: { enabled: false } }, isWater],
    ['gym', { gym: { enabled: false } }, (n: PlannedNotification) => n.kind === 'gym'],
    [
      'morning check-in',
      { morningCheckin: { enabled: false } },
      (n: PlannedNotification) => n.data.checkin === 'morning',
    ],
    [
      'night check-in',
      { nightCheckin: { enabled: false } },
      (n: PlannedNotification) => n.data.checkin === 'night',
    ],
    ['bedtime', { bedtime: { enabled: false } }, reminder('dormir')],
    ['screens off', { screensOff: { enabled: false } }, reminder('pantallas')],
    ['active pause', { activePause: { enabled: false } }, isPause],
  ];
  it.each(cases)('turns %s off and leaves the rest', (_name, prefs, pick) => {
    const before = buildUpcoming(state(), MONDAY);
    const after = buildUpcoming(state(prefs), MONDAY);
    expect(before.some(pick)).toBe(true);
    expect(after.some(pick)).toBe(false);
    // Everything else stays (the freed room under the 64 cap may even let more in).
    const kept = new Set(after.map((n) => n.id));
    expect(before.filter((n) => !pick(n)).every((n) => kept.has(n.id))).toBe(true);
  });
});

describe('when they fire', () => {
  it('water follows its window, interval and weekdays', () => {
    const list = buildUpcoming(
      state({ water: { from: '08:00', until: '12:00', everyMin: 90, days: [1, 2] } }),
      MONDAY,
    );
    expect(times(list, isWater)).toEqual(['08:00', '09:30', '11:00']);
    expect(list.some((n) => isWater(n) && n.data.date === '2026-10-07')).toBe(false); // Wednesday
  });

  it('a partial water preference keeps the template for the rest', () => {
    // Template: wake + 60 (06:10), hourly until 20:00; only the interval changes.
    const list = buildUpcoming(state({ water: { everyMin: 180 } }), MONDAY);
    expect(times(list, isWater)).toEqual(['06:10', '09:10', '12:10', '15:10', '18:10']);
  });

  it('gym reminders move earlier by minutesBefore', () => {
    const list = buildUpcoming(state({ gym: { minutesBefore: 45 } }), MONDAY);
    expect(times(list, (n) => n.kind === 'gym')).toEqual(['05:15']);
  });

  it('check-in offsets move the morning and night prompts', () => {
    const list = buildUpcoming(
      state({
        morningCheckin: { offsetAfterWakeMin: 60 },
        nightCheckin: { offsetBeforeBedMin: 90 },
      }),
      MONDAY,
    );
    expect(times(list, (n) => n.kind === 'checkin')).toEqual(['06:10', '20:10']);
  });

  it('screens off follows its own minutes before bed', () => {
    const list = buildUpcoming(state({ screensOff: { minutesBefore: 75 } }), MONDAY);
    expect(times(list, reminder('pantallas'))).toEqual(['20:25']);
  });

  it('active pause can change window, interval and days (Saturday too)', () => {
    const list = buildUpcoming(
      state({ activePause: { from: '10:00', until: '12:00', everyMin: 60, days: [1, 6] } }),
      MONDAY,
    );
    expect(times(list, isPause)).toEqual(['10:00', '11:00', '12:00']);
    expect(list.some((n) => isPause(n) && n.data.date === '2026-10-06')).toBe(false);
    // Still bound to its onlyIf: no sitting job, no pause.
    expect(
      buildUpcoming(state({ activePause: { days: [1] } }, 'activa'), MONDAY).some(isPause),
    ).toBe(false);
  });

  it('everyMin at the bounds (30 and 180) is honoured and validated', () => {
    const fast = buildUpcoming(
      state({ water: { from: '08:00', until: '09:00', everyMin: 30 } }),
      MONDAY,
    );
    expect(times(fast, isWater)).toEqual(['08:00', '08:30', '09:00']);
    const parse = (everyMin: number) =>
      notificationPrefsSchema.safeParse({ water: { everyMin } }).success;
    expect([parse(29), parse(30), parse(180), parse(181)]).toEqual([false, true, true, false]);
  });
});

describe('custom quiet windows', () => {
  it('drops what falls inside a same-day window, only on its weekdays', () => {
    const list = buildUpcoming(
      state({ quietHours: [{ from: '12:00', until: '14:00', days: [1] }] }),
      MONDAY,
    );
    expect(times(list, isWater)).not.toContain('12:10');
    expect(times(list, isWater)).toContain('14:10');
    expect(
      list.some((n) => isWater(n) && n.data.date === '2026-10-06' && clock(n.at) === '12:10'),
    ).toBe(true);
  });

  it('crosses midnight: the window started on Monday covers Tuesday small hours', () => {
    const windows = [{ from: '23:00', until: '07:00', days: [1] }];
    expect(isInQuietWindow(new Date(2026, 9, 5, 23, 30), windows)).toBe(true); // Mon 23:30
    expect(isInQuietWindow(new Date(2026, 9, 6, 6, 59), windows)).toBe(true); // Tue 06:59
    expect(isInQuietWindow(new Date(2026, 9, 6, 7, 0), windows)).toBe(false); // until exclusive
    expect(isInQuietWindow(new Date(2026, 9, 6, 23, 30), windows)).toBe(false); // Tue night
    expect(isInQuietWindow(new Date(2026, 9, 5, 6, 30), windows)).toBe(false); // Mon morning
    const list = buildUpcoming(state({ quietHours: windows }), MONDAY);
    // Tuesday's morning check-in (05:20) is inside Monday's window.
    expect(list.some((n) => n.data.checkin === 'morning' && n.data.date === '2026-10-06')).toBe(
      false,
    );
    expect(list.some((n) => n.data.checkin === 'morning' && n.data.date === '2026-10-05')).toBe(
      true,
    );
  });
});

describe('64 cap with preferences', () => {
  it('still never schedules more than 64', () => {
    const list = buildUpcoming(
      state({
        water: { from: '06:00', until: '21:00', everyMin: 30 },
        activePause: { from: '06:00', until: '21:00', everyMin: 30, days: [0, 1, 2, 3, 4, 5, 6] },
      }),
      MONDAY,
    );
    expect(list).toHaveLength(MAX_SCHEDULED);
  });
});

describe('reminderRole', () => {
  it('classifies bed-relative reminders by their offset', () => {
    expect(reminderRole({ days: [1], relativeTo: 'bed', offsetMin: 0 })).toBe('bedtime');
    expect(reminderRole({ days: [1], relativeTo: 'bed', offsetMin: -40 })).toBe('screensOff');
    expect(reminderRole({ days: [1], time: '21:00' })).toBe('other');
  });
});

describe('review fixes', () => {
  it('screens off is at least 5 min before bed and never rings with bedtime', () => {
    const list = buildUpcoming(state({ screensOff: { minutesBefore: 0 } }), MONDAY);
    expect(times(list, reminder('pantallas'))).toEqual(['21:35']);
    const reminders = monday(list).filter((n) => n.kind === 'reminder');
    expect(new Set(reminders.map((n) => n.at)).size).toBe(reminders.length);
    expect(notificationPrefsSchema.parse({ screensOff: { minutesBefore: 0 } })).toEqual({
      screensOff: { minutesBefore: 5 },
    });
  });

  it('DEFAULT_SCREENS_BEFORE_MIN matches the template reminder', () => {
    // `defaults.modules` are the bundled templates (`templates/habitos.json` among them).
    const offsets = defaults.modules
      .flatMap((module) => module.reminders ?? [])
      .filter((entry) => reminderRole(entry.schedule) === 'screensOff')
      .map((entry) => -(entry.schedule.offsetMin ?? 0));
    expect(offsets).toEqual([DEFAULT_SCREENS_BEFORE_MIN]);
  });

  it('a start past the end moves the end along, never a ~23 h series', () => {
    expect(moveWindowStart({ from: '08:00', until: '20:00' }, '09:00')).toEqual({
      from: '09:00',
      until: '20:00',
    });
    // Span 3 h, capped before bed (22:00) and before midnight.
    expect(moveWindowStart({ from: '10:00', until: '13:00' }, '14:00', 22 * 60)).toEqual({
      from: '14:00',
      until: '17:00',
    });
    expect(moveWindowStart({ from: '08:00', until: '20:00' }, '21:00', 22 * 60)).toEqual({
      from: '21:00',
      until: '21:59',
    });
    const moved = moveWindowStart({ from: '08:00', until: '20:00' }, '21:00');
    expect(windowCrossesMidnight(moved)).toBe(false);
    const list = buildUpcoming(state({ water: { ...moved, everyMin: 30 } }), MONDAY);
    expect(times(list, isWater).length).toBeLessThanOrEqual(6);
    expect(windowCrossesMidnight({ from: '21:00', until: '20:00' })).toBe(true);
  });

  it('category prefs replace only the first schedule and keep the rest', () => {
    const base = defaults.modules.find((module) =>
      module.habits?.some((habit) => habit.id === 'pausa-activa'),
    );
    if (!base) throw new Error('module expected');
    const extra = { days: [6], time: '11:00' };
    const module = {
      ...base,
      habits: (base.habits ?? []).map((habit) =>
        habit.id === 'pausa-activa'
          ? { ...habit, schedules: [...(habit.schedules ?? []), extra] }
          : habit,
      ),
    };
    const [changed] = applyCategoryTimes([module], { activePause: { everyMin: 90 } });
    const schedules = changed?.habits?.find((habit) => habit.id === 'pausa-activa')?.schedules;
    expect(schedules).toHaveLength(2);
    expect(schedules?.[0]?.repeatEveryMin).toBe(90);
    expect(schedules?.[1]).toEqual(extra);
  });

  it('the gym lead comes from the session date-time (00:30 - 60 = previous evening)', () => {
    const night: UpcomingState = {
      ...state({ gym: { minutesBefore: 60 } }),
      anchors: {},
      gymDays: [{ days: [2], anchor: 'gymMorning' }],
      gymPlan: [{ weekday: 2, time: '00:30' }],
    };
    const gym = buildUpcoming(night, MONDAY).filter((n) => n.kind === 'gym');
    expect(gym.map((n) => new Date(n.at).toString())).toContain(
      new Date(2026, 9, 5, 23, 30).toString(),
    );
    expect(
      gym.some((n) => new Date(n.at).getTime() === new Date(2026, 9, 6, 23, 30).getTime()),
    ).toBe(false);
  });
});

describe('previewTomorrow', () => {
  it('is the real scheduled window filtered to tomorrow (same ids, 64-cap included)', () => {
    const busy = state({ water: { from: '06:00', until: '21:00', everyMin: 30 } });
    const now = new Date(2026, 9, 5, 15, 0);
    const scheduled = buildUpcoming(busy, now);
    const preview = previewTomorrow(busy, now);
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.map((n) => n.id)).toEqual(
      scheduled.filter((n) => n.data.date === '2026-10-06').map((n) => n.id),
    );
  });

  it("lists tomorrow's exact times; today's done flags only touch today", () => {
    const done: UpcomingState = {
      ...state({ gym: { minutesBefore: 30 } }),
      today: {
        activityLogged: true,
        gymDone: true,
        checkinsDone: { morning: true, night: true },
        doneAgendaIds: ['water:agua:agua'],
      },
    };
    const preview = previewTomorrow(done, new Date(2026, 9, 5, 15, 0));
    expect(preview.every((n) => n.data.date === '2026-10-06')).toBe(true);
    const gym = preview.filter((n) => n.kind === 'gym').map((n) => clock(n.at));
    expect(gym).toEqual(['17:30']); // Tuesday evening 18:00 - 30
    expect(preview.some((n) => n.data.checkin === 'morning')).toBe(true);
    expect(preview.some((n) => n.kind === 'survey')).toBe(true);
    expect(preview.map((n) => n.at)).toEqual([...preview.map((n) => n.at)].sort((a, b) => a - b));
  });

  it('after midnight (before 04:00) "tomorrow" is the next logical day', () => {
    const preview = previewTomorrow(state(), new Date(2026, 9, 6, 1, 0));
    expect(new Set(preview.map((n) => n.data.date))).toEqual(new Set(['2026-10-06']));
  });
});

describe('stored preferences', () => {
  it('old prefs (no categories) still validate, and so do full ones', () => {
    expect(notificationPrefsSchema.safeParse({ enabled: true, survey: false }).success).toBe(true);
    expect(
      notificationPrefsSchema.safeParse({
        water: { enabled: true, from: '08:00', until: '20:00', everyMin: 60, days: [1, 2] },
        gym: { enabled: true, minutesBefore: 120 },
        morningCheckin: { offsetAfterWakeMin: 30 },
        nightCheckin: { offsetBeforeBedMin: 45 },
        bedtime: { enabled: false },
        screensOff: { minutesBefore: 60 },
        activePause: { everyMin: 90, days: [1, 2, 3] },
        quietHours: [{ from: '22:00', until: '06:00', days: [5, 6] }],
      }).success,
    ).toBe(true);
    expect(notificationPrefsSchema.safeParse({ gym: { minutesBefore: 121 } }).success).toBe(false);
    expect(
      notificationPrefsSchema.safeParse({
        quietHours: [{ from: '22:00', until: '06:00', days: [] }],
      }).success,
    ).toBe(false);
  });
});
