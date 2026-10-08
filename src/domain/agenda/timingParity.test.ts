import { describe, expect, it } from '@jest/globals';

import { loadDefaultTemplates } from '../../templates/defaults';
import { buildUpcoming, isQuietMinute, type UpcomingState } from '../notifications/buildUpcoming';
import type { CategoryPrefs } from '../notifications/prefs';
import { minutesToClock } from '../time';

import { buildAgenda, resolveAnchors, type AgendaItem } from './buildAgenda';

// Hoy (`buildAgenda`) and the notifications (`buildUpcoming`) must show the SAME times for what
// "Mis avisos" controls: both read them through `agendaTiming`.

const defaults = loadDefaultTemplates();
// 2026-10-05 is a Monday; 04:00 is the start of the logical day.
const MONDAY = new Date(2026, 9, 5, 4, 0);
const TUESDAY = new Date(2026, 9, 6, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMED_KINDS = ['water', 'habit', 'reminder', 'checkin'] as const;

function state(overrides: Partial<UpcomingState> = {}): UpcomingState {
  return {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: defaults.settings.anchors ?? {},
    gymDays: defaults.settings.gymDays ?? [],
    modules: defaults.modules,
    today: {
      activityLogged: false,
      gymDone: false,
      checkinsDone: { morning: false, night: false },
      doneAgendaIds: [],
    },
    ...overrides,
  };
}

const isTimed = (kind: string): kind is (typeof TIMED_KINDS)[number] =>
  (TIMED_KINDS as readonly string[]).includes(kind);

/** `kind@yyyy-MM-dd HH:mm` of every timed agenda occurrence inside the first 24 h after MONDAY. */
function agendaTimes(input: UpcomingState): string[] {
  const anchors = resolveAnchors(input.anchors, input.shifts);
  const from = MONDAY.getTime();
  const days: [Date, AgendaItem[]][] = [
    [new Date(2026, 9, 5), buildAgenda(new Date(2026, 9, 5), input)],
    [TUESDAY, buildAgenda(TUESDAY, input)],
  ];
  return days.flatMap(([day, agenda]) =>
    agenda
      .filter((item) => isTimed(item.kind))
      .flatMap((item) =>
        item.occurrences.map((minutes) => ({
          kind: item.kind,
          at: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime(),
        })),
      )
      .filter(({ at }) => at > from && at <= from + DAY_MS)
      .filter(({ at }) => {
        const date = new Date(at);
        return !isQuietMinute(date.getHours() * 60 + date.getMinutes(), anchors.bed, anchors.wake);
      })
      .map(({ kind, at }) => label(kind, at)),
  );
}

function label(kind: string, at: number): string {
  const date = new Date(at);
  return `${kind}@${date.getDate()} ${minutesToClock(date.getHours() * 60 + date.getMinutes())}`;
}

function notificationTimes(input: UpcomingState): string[] {
  const from = MONDAY.getTime();
  return buildUpcoming(input, MONDAY)
    .filter((planned) => isTimed(planned.kind) && planned.at <= from + DAY_MS)
    .map((planned) => label(planned.kind, planned.at));
}

const sorted = (values: string[]) => [...values].sort();

const CUSTOM: CategoryPrefs = {
  water: { from: '08:00', until: '18:00', everyMin: 90 },
  activePause: { from: '10:00', until: '16:00', everyMin: 120 },
  morningCheckin: { offsetAfterWakeMin: 30 },
  nightCheckin: { offsetBeforeBedMin: 60 },
  screensOff: { minutesBefore: 90 },
};

describe('Hoy and notification times never diverge', () => {
  it.each<[string, Partial<UpcomingState>]>([
    ['no preferences', {}],
    ['custom windows and offsets', { categories: CUSTOM }],
    ['accepted shifts', { shifts: { waterMin: -30, bedMin: -15 } }],
    ['custom water start beats a shift', { categories: CUSTOM, shifts: { waterMin: -30 } }],
  ])('%s', (_name, overrides) => {
    const input = state(overrides);
    const expected = sorted(agendaTimes(input));
    expect(expected.length).toBeGreaterThan(0);
    expect(sorted(notificationTimes(input))).toEqual(expected);
  });

  it('Hoy follows the "Mis avisos" water window and check-in offsets', () => {
    const agenda = buildAgenda(new Date(2026, 9, 5), state({ categories: CUSTOM }));
    const water = agenda.find((item) => item.kind === 'water');
    expect(water?.occurrences.map(minutesToClock)).toEqual([
      '08:00',
      '09:30',
      '11:00',
      '12:30',
      '14:00',
      '15:30',
      '17:00',
    ]);
    // wake 05:10 + 30; bed 21:40 - 60; screens off 21:40 - 90.
    expect(agenda.find((item) => item.id === 'checkin:morning')?.minutes).toBe(5 * 60 + 40);
    expect(agenda.find((item) => item.id === 'checkin:night')?.minutes).toBe(20 * 60 + 40);
    expect(agenda.find((item) => item.reminderId === 'pantallas')?.minutes).toBe(20 * 60 + 10);
    const pause = agenda.find((item) => item.habitId === 'pausa-activa');
    expect(pause?.occurrences.map(minutesToClock)).toEqual(['10:00', '12:00', '14:00', '16:00']);
  });

  it('a category whose notifications are off still belongs to the day in Hoy', () => {
    const off: CategoryPrefs = { ...CUSTOM, water: { ...CUSTOM.water, enabled: false } };
    const input = state({ categories: off });
    expect(buildAgenda(new Date(2026, 9, 5), input).some((item) => item.kind === 'water')).toBe(
      true,
    );
    expect(buildUpcoming(input, MONDAY).some((planned) => planned.kind === 'water')).toBe(false);
  });
});
