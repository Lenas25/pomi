import { describe, expect, it } from '@jest/globals';

import { loadDefaultTemplates } from '../../templates/defaults';
import type { ModuleBody } from '../../templates/schema';

import {
  BODY_MAX,
  MAX_SCHEDULED,
  TITLE_MAX,
  buildUpcoming,
  clampText,
  isQuietMinute,
  type PlannedNotification,
  type UpcomingState,
} from './buildUpcoming';

const defaults = loadDefaultTemplates();

// 2026-10-05 is a Monday. `from` is the start of the day unless stated.
const MONDAY = new Date(2026, 9, 5);
const SATURDAY = new Date(2026, 9, 10);

function state(overrides: Partial<UpcomingState> = {}): UpcomingState {
  const { settings, modules } = defaults;
  return {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: settings.anchors ?? {},
    gymDays: settings.gymDays ?? [],
    modules,
    today: {
      activityLogged: false,
      gymDone: false,
      checkinsDone: { morning: false, night: false },
      doneAgendaIds: [],
    },
    ...overrides,
  };
}

function ofKind(list: readonly PlannedNotification[], kind: PlannedNotification['kind']) {
  return list.filter((notification) => notification.kind === kind);
}

function clock(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

describe('buildUpcoming ids and ordering', () => {
  const list = buildUpcoming(state(), MONDAY);

  it('uses stable ids kind:module:item:yyyy-MM-dd:HH:mm', () => {
    expect(list.map((n) => n.id)).toContain('checkin:core:morning:2026-10-05:05:20');
    expect(list.map((n) => n.id)).toContain('water:agua:agua:2026-10-05:06:10');
    expect(list.map((n) => n.id)).toContain('reminder:sueno:dormir:2026-10-05:21:40');
    expect(buildUpcoming(state(), MONDAY).map((n) => n.id)).toEqual(list.map((n) => n.id));
  });

  it('is ordered by time and has unique ids', () => {
    const times = list.map((n) => n.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(list.map((n) => n.id)).size).toBe(list.length);
  });

  it('only returns notifications after `from`', () => {
    const noon = new Date(2026, 9, 5, 12, 0);
    expect(buildUpcoming(state(), noon).every((n) => n.at > noon.getTime())).toBe(true);
  });

  it('covers a 3-day window (today plus two days)', () => {
    const days = new Set(list.map((n) => n.data.date));
    expect([...days].sort()).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });
});

describe('check-ins', () => {
  it('sends the morning check-in at wake + 10 and the night one at bed − 30, once a day', () => {
    const checkins = ofKind(buildUpcoming(state(), MONDAY), 'checkin').filter(
      (n) => n.data.date === '2026-10-05',
    );
    expect(checkins.map((n) => [n.data.checkin, clock(n.at)])).toEqual([
      ['morning', '05:20'],
      ['night', '21:10'],
    ]);
  });

  it("skips today's check-in already done, but not tomorrow's", () => {
    const list = buildUpcoming(
      state({
        today: {
          activityLogged: false,
          gymDone: false,
          checkinsDone: { morning: true, night: false },
          doneAgendaIds: [],
        },
      }),
      MONDAY,
    );
    const morning = ofKind(list, 'checkin').filter((n) => n.data.checkin === 'morning');
    expect(morning.map((n) => n.data.date)).toEqual(['2026-10-06', '2026-10-07']);
  });

  it('respects the check-in preferences', () => {
    const list = buildUpcoming(state({ checkinPrefs: { morning: false, night: true } }), MONDAY);
    expect(ofKind(list, 'checkin').every((n) => n.data.checkin === 'night')).toBe(true);
  });
});

describe('"¿Te moviste hoy?" survey', () => {
  it('defaults to bed − 90 min', () => {
    const survey = ofKind(buildUpcoming(state(), MONDAY), 'survey')[0];
    // bed = 05:10 − 7.5 h = 21:40; minus 90 min = 20:10
    expect(clock(survey?.at ?? 0)).toBe('20:10');
    expect(survey?.category).toBe('pomi_survey');
  });

  it('uses the configured time', () => {
    const survey = ofKind(buildUpcoming(state({ surveyTime: '19:30' }), MONDAY), 'survey')[0];
    expect(clock(survey?.at ?? 0)).toBe('19:30');
  });

  it('is not sent today when an activity was already logged (a workout or an answer)', () => {
    const list = buildUpcoming(
      state({
        today: {
          activityLogged: true,
          gymDone: true,
          checkinsDone: { morning: false, night: false },
          doneAgendaIds: [],
        },
      }),
      MONDAY,
    );
    expect(ofKind(list, 'survey').map((n) => n.data.date)).toEqual(['2026-10-06', '2026-10-07']);
    // ... and the gym reminder of today is gone too.
    expect(ofKind(list, 'gym').some((n) => n.data.date === '2026-10-05')).toBe(false);
  });

  it('can be turned off', () => {
    expect(ofKind(buildUpcoming(state({ surveyEnabled: false }), MONDAY), 'survey')).toEqual([]);
  });
});

describe('weekly review', () => {
  it('is only planned on Sundays', () => {
    const list = buildUpcoming(state(), SATURDAY);
    expect(ofKind(list, 'review').map((n) => n.data.date)).toEqual(['2026-10-11']);
    expect(ofKind(buildUpcoming(state(), MONDAY), 'review')).toEqual([]);
  });
});

describe('habits and reminders', () => {
  it('repeats water every repeatEveryMin until `until`', () => {
    const water = ofKind(buildUpcoming(state(), MONDAY), 'water').filter(
      (n) => n.data.date === '2026-10-05',
    );
    // wake 05:10 + 60 = 06:10, hourly until 20:00
    expect(clock(water[0]?.at ?? 0)).toBe('06:10');
    expect(clock(water.at(-1)?.at ?? 0)).toBe('19:10');
    expect(water).toHaveLength(14);
    expect(water[0]?.category).toBe('pomi_water');
    expect(water[0]?.channel).toBe('habits');
  });

  it("stops today's water reminders once the goal is reached", () => {
    const list = buildUpcoming(
      state({
        today: {
          activityLogged: false,
          gymDone: false,
          checkinsDone: { morning: false, night: false },
          doneAgendaIds: ['water:agua:agua'],
        },
      }),
      MONDAY,
    );
    const water = ofKind(list, 'water');
    expect(water.some((n) => n.data.date === '2026-10-05')).toBe(false);
    expect(water.some((n) => n.data.date === '2026-10-06')).toBe(true);
  });

  it('plans the active pause only for people with a sitting job (onlyIf)', () => {
    const pauses = (workType: string) =>
      buildUpcoming(state({ profile: { weightKg: 60, workType } }), MONDAY).filter(
        (n) => n.data.habitId === 'pausa-activa',
      );
    expect(pauses('sentada').length).toBeGreaterThan(0);
    expect(pauses('activa')).toEqual([]);
  });

  it('plans the screens-off and bedtime reminders relative to bed', () => {
    const reminders = ofKind(buildUpcoming(state(), MONDAY), 'reminder').filter(
      (n) => n.data.date === '2026-10-05',
    );
    expect(reminders.map((n) => [n.data.reminderId, clock(n.at)])).toEqual([
      ['pantallas', '21:00'],
      ['dormir', '21:40'],
    ]);
    expect(reminders[0]?.channel).toBe('reminders');
  });

  it('plans the gym session on its anchor on gym days only', () => {
    const gym = ofKind(buildUpcoming(state(), MONDAY), 'gym');
    expect(gym.map((n) => [n.data.date, clock(n.at)])).toEqual([
      ['2026-10-05', '06:00'], // Monday morning
      ['2026-10-06', '18:00'], // Tuesday evening
      ['2026-10-07', '06:00'], // Wednesday morning
    ]);
  });

  it('clamps long template texts to the BRAND limits', () => {
    const long: ModuleBody = {
      id: 'x',
      habits: [
        {
          id: 'h',
          type: 'check',
          name: 'H',
          schedules: [{ days: [0, 1, 2, 3, 4, 5, 6], time: '10:00' }],
          notification: { title: 'T'.repeat(60), body: 'B'.repeat(200) },
        },
      ],
    } as unknown as ModuleBody;
    const [only] = ofKind(buildUpcoming(state({ modules: [long] }), MONDAY), 'habit');
    expect(only?.text.type).toBe('text');
    if (only?.text.type === 'text') {
      expect([...only.text.title].length).toBeLessThanOrEqual(TITLE_MAX);
      expect([...only.text.body].length).toBeLessThanOrEqual(BODY_MAX);
    }
    expect(clampText('short', 30)).toBe('short');
    expect([...clampText('a'.repeat(100), 10)]).toHaveLength(10);
  });
});

describe('quiet hours', () => {
  it('knows the circular window between bed and wake, bed itself excluded', () => {
    // bed 22:00, wake 06:00
    expect(isQuietMinute(22 * 60, 22 * 60, 6 * 60)).toBe(false);
    expect(isQuietMinute(23 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(isQuietMinute(3 * 60, 22 * 60, 6 * 60)).toBe(true);
    expect(isQuietMinute(6 * 60, 22 * 60, 6 * 60)).toBe(false);
    // bed after midnight: 00:30 (stored as 1470), wake 08:00
    expect(isQuietMinute(23 * 60, 1470, 8 * 60)).toBe(false);
    expect(isQuietMinute(2 * 60, 1470, 8 * 60)).toBe(true);
    expect(isQuietMinute(12 * 60, undefined, 8 * 60)).toBe(false);
  });

  it('drops anything scheduled while sleeping, except timers (which are not planned here)', () => {
    const nightOwl: ModuleBody = {
      id: 'x',
      habits: [
        {
          id: 'late',
          type: 'check',
          name: 'Late',
          schedules: [
            { days: [0, 1, 2, 3, 4, 5, 6], time: '23:30' },
            { days: [0, 1, 2, 3, 4, 5, 6], time: '03:00' },
            { days: [0, 1, 2, 3, 4, 5, 6], time: '12:00' },
          ],
        },
      ],
    } as unknown as ModuleBody;
    const list = buildUpcoming(
      state({
        modules: [nightOwl],
        anchors: { wake: '06:00', sleepTargetH: 8 }, // bed 22:00
      }),
      MONDAY,
    );
    expect(ofKind(list, 'habit').map((n) => clock(n.at))).toEqual(
      expect.arrayContaining(['12:00']),
    );
    expect(ofKind(list, 'habit').some((n) => ['23:30', '03:00'].includes(clock(n.at)))).toBe(false);
  });

  it('crosses midnight: a bedtime after 00:00 still fires on the right day, in order', () => {
    const list = buildUpcoming(
      state({ anchors: { wake: '08:00', sleepTargetH: 7.5 } }), // bed 00:30
      MONDAY,
    );
    const sleep = ofKind(list, 'reminder').find((n) => n.data.reminderId === 'dormir');
    expect(sleep?.id).toBe('reminder:sueno:dormir:2026-10-06:00:30');
    const nightCheckin = ofKind(list, 'checkin').find((n) => n.data.checkin === 'night');
    expect(nightCheckin?.id).toBe('checkin:core:night:2026-10-06:00:00');
    const survey = ofKind(list, 'survey')[0];
    expect(clock(survey?.at ?? 0)).toBe('23:00');
    const times = list.map((n) => n.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('the 64 notification cap', () => {
  function busy(): UpcomingState {
    const noisy: ModuleBody = {
      id: 'agua',
      habits: [
        {
          id: 'agua',
          type: 'counter',
          name: 'Agua',
          target: { formula: 'water' },
          schedules: [
            { days: [0, 1, 2, 3, 4, 5, 6], time: '06:00', repeatEveryMin: 10, until: '20:00' },
          ],
        },
      ],
    } as unknown as ModuleBody;
    return state({ modules: [noisy, ...defaults.modules.filter((m) => m.id !== 'agua')] });
  }

  it('never returns more than 64 and keeps the nearest days and the important kinds', () => {
    const list = buildUpcoming(busy(), MONDAY);
    expect(list).toHaveLength(MAX_SCHEDULED);
    const today = list.filter((n) => n.data.date === '2026-10-05');
    // Today is complete (check-ins, survey, gym, reminders all kept) ...
    expect(ofKind(today, 'checkin')).toHaveLength(2);
    expect(ofKind(today, 'survey')).toHaveLength(1);
    expect(ofKind(today, 'gym')).toHaveLength(1);
    // ... and water filled whatever room was left, ahead of the later days.
    expect(ofKind(list, 'water').filter((n) => n.data.date === '2026-10-07')).toHaveLength(0);
  });
});
