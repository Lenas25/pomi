import { describe, expect, it } from '@jest/globals';

import { loadDefaultTemplates } from '../../templates/defaults';
import type { ModuleBody, Step } from '../../templates/schema';

import { buildAgenda, type AgendaItem, type AgendaState } from './buildAgenda';

const defaults = loadDefaultTemplates();

// 2026-10-05 is a Monday.
const MONDAY = new Date(2026, 9, 5);
const TUESDAY = new Date(2026, 9, 6);
const SATURDAY = new Date(2026, 9, 10);
const SUNDAY = new Date(2026, 9, 11);

function stateWith(overrides: Partial<AgendaState> = {}): AgendaState {
  const { settings, modules } = defaults;
  return {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: settings.anchors ?? {},
    gymDays: settings.gymDays ?? [],
    modules,
    stepsGoal: 6000,
    ...overrides,
  };
}

function ids(items: readonly AgendaItem[]): string[] {
  return items.map((item) => item.id);
}

function find(items: readonly AgendaItem[], id: string): AgendaItem {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Agenda item "${id}" not found in ${ids(items).join(', ')}`);
  return item;
}

describe('buildAgenda on a gym day (Monday)', () => {
  const items = buildAgenda(MONDAY, stateWith());

  it('orders the whole timeline by time, all-day items last', () => {
    expect(ids(items)).toEqual([
      'checkin:morning',
      'gym',
      'water:agua:agua',
      'habit:movimiento:pausa-activa',
      'reminder:sueno:pantallas',
      'checkin:night',
      'reminder:sueno:dormir',
      'habit:movimiento:caminar-comida',
      'steps:movimiento:pasos',
    ]);
  });

  it('places the gym session on its anchor with the morning anchor from settings', () => {
    expect(find(items, 'gym').minutes).toBe(6 * 60);
  });

  it('derives check-ins: wake + 10 and bed − 30 (bed = wake − sleepTargetH)', () => {
    expect(find(items, 'checkin:morning').minutes).toBe(5 * 60 + 20);
    // wake 05:10 − 7.5 h = 21:40; minus 30 min = 21:10
    expect(find(items, 'checkin:night').minutes).toBe(21 * 60 + 10);
  });

  it('resolves relative bedtime reminders against the derived bed', () => {
    expect(find(items, 'reminder:sueno:pantallas').minutes).toBe(21 * 60); // bed − 40
    expect(find(items, 'reminder:sueno:dormir').minutes).toBe(21 * 60 + 40);
  });

  it('expands repeating schedules into occurrences', () => {
    const water = find(items, 'water:agua:agua');
    expect(water.minutes).toBe(6 * 60 + 10); // wake + 60
    expect(water.occurrences).toHaveLength(14);
    expect(water.occurrences.at(-1)).toBe(19 * 60 + 10);

    const pause = find(items, 'habit:movimiento:pausa-activa');
    expect(pause.occurrences).toEqual([540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080]);
  });

  it('adds the water goal (gym day: 10 glasses) and the steps goal', () => {
    expect(find(items, 'water:agua:agua').target).toEqual({ glasses: 10, ml: 2500 });
    expect(find(items, 'steps:movimiento:pasos').target).toEqual({ steps: 6000 });
    expect(find(items, 'steps:movimiento:pasos').minutes).toBeNull();
  });
});

describe('buildAgenda on other days', () => {
  it('uses the evening anchor on Tuesday', () => {
    expect(find(buildAgenda(TUESDAY, stateWith()), 'gym').minutes).toBe(18 * 60);
  });

  it('has no gym on a rest day, and a rest-day water goal of 8 glasses', () => {
    const items = buildAgenda(SATURDAY, stateWith());
    expect(ids(items)).not.toContain('gym');
    expect(find(items, 'water:agua:agua').target).toEqual({ glasses: 8, ml: 2000 });
  });

  it('drops weekday-only habits on the weekend', () => {
    expect(ids(buildAgenda(SUNDAY, stateWith()))).not.toContain('habit:movimiento:pausa-activa');
  });
});

describe('buildAgenda conditions and settings', () => {
  it('shows the active pause only when profile.workType is "sentada"', () => {
    const standing = buildAgenda(
      MONDAY,
      stateWith({ profile: { weightKg: 60, workType: 'de pie' } }),
    );
    expect(ids(standing)).not.toContain('habit:movimiento:pausa-activa');
    const unknown = buildAgenda(MONDAY, stateWith({ profile: { weightKg: 60 } }));
    expect(ids(unknown)).not.toContain('habit:movimiento:pausa-activa');
  });

  it('follows the check-in preferences', () => {
    const items = buildAgenda(MONDAY, stateWith({ checkinPrefs: { morning: false, night: true } }));
    expect(ids(items)).not.toContain('checkin:morning');
    expect(ids(items)).toContain('checkin:night');
  });

  it('takes gym days from settings, not from the program schedules', () => {
    const items = buildAgenda(
      MONDAY,
      stateWith({ gymDays: [{ days: [5], anchor: 'gymEvening' }] }),
    );
    expect(ids(items)).not.toContain('gym');
  });

  it('lists the routine steps whose `when` passes', () => {
    const steps: Step[] = [
      { type: 'check', id: 'always', name: 'A' },
      { type: 'check', id: 'mondays', name: 'B', when: { days: [1] } },
      { type: 'check', id: 'tuesdays', name: 'C', when: { days: [2] } },
      { type: 'check', id: 'deload', name: 'D', when: { flag: 'deload' } },
    ];
    const state = stateWith({ todayRoutine: { id: 'd1', steps }, flags: { deload: true } });
    const gym = find(buildAgenda(MONDAY, state), 'gym');
    expect(gym.routineId).toBe('d1');
    expect(gym.stepIds).toEqual(['always', 'mondays', 'deload']);
  });

  it('skips items that depend on a missing anchor', () => {
    const items = buildAgenda(MONDAY, stateWith({ anchors: { gymMorning: '06:00' } }));
    expect(ids(items)).toEqual(
      expect.arrayContaining(['gym', 'habit:movimiento:caminar-comida', 'steps:movimiento:pasos']),
    );
    expect(ids(items)).not.toEqual(expect.arrayContaining(['checkin:morning']));
    expect(ids(items)).not.toContain('checkin:night');
    expect(ids(items)).not.toContain('water:agua:agua'); // relative to wake
    expect(ids(items)).not.toContain('reminder:sueno:dormir'); // relative to the derived bed
  });

  it('keeps a gym item without a time when its anchor is missing', () => {
    const items = buildAgenda(MONDAY, stateWith({ anchors: { wake: '05:10', sleepTargetH: 7.5 } }));
    expect(find(items, 'gym').minutes).toBeNull();
  });

  it('omits the water goal without a weight', () => {
    const items = buildAgenda(MONDAY, stateWith({ profile: { workType: 'sentada' } }));
    expect(find(items, 'water:agua:agua').target).toBeUndefined();
  });
});

describe('buildAgenda when bed is after midnight', () => {
  it('sorts a past-midnight bedtime and its night items at the end of the day', () => {
    // wake 08:00, 7.5 h -> bed 00:30, i.e. 1470 on this day's timeline.
    const items = buildAgenda(
      MONDAY,
      stateWith({
        anchors: { wake: '08:00', sleepTargetH: 7.5, gymMorning: '09:00', gymEvening: '19:00' },
      }),
    );
    expect(find(items, 'reminder:sueno:dormir').minutes).toBe(24 * 60 + 30);
    expect(find(items, 'reminder:sueno:pantallas').minutes).toBe(24 * 60 - 10);
    expect(find(items, 'checkin:night').minutes).toBe(24 * 60);
    const order = ids(items);
    expect(order.indexOf('reminder:sueno:dormir')).toBeGreaterThan(order.indexOf('gym'));
  });
});

describe('buildAgenda edge cases', () => {
  const module = (
    habits: ModuleBody['habits'],
    reminders?: ModuleBody['reminders'],
  ): ModuleBody => ({
    id: 'm',
    name: 'M',
    icon: 'Drop',
    habits,
    reminders,
  });

  it('lets a repeating schedule cross midnight (22:00 -> 02:00)', () => {
    const items = buildAgenda(
      MONDAY,
      stateWith({
        modules: [
          module([
            {
              type: 'check',
              id: 'night',
              name: 'Night',
              schedules: [{ days: [1], time: '22:00', repeatEveryMin: 60, until: '02:00' }],
            },
          ]),
        ],
      }),
    );
    expect(find(items, 'habit:m:night').occurrences).toEqual([1320, 1380, 1440, 1500, 1560]);
  });

  it('keeps a same-day repeating schedule bounded by until', () => {
    const items = buildAgenda(
      MONDAY,
      stateWith({
        modules: [
          module([
            {
              type: 'check',
              id: 'day',
              name: 'Day',
              schedules: [{ days: [1], time: '09:00', repeatEveryMin: 60, until: '11:00' }],
            },
          ]),
        ],
      }),
    );
    expect(find(items, 'habit:m:day').occurrences).toEqual([540, 600, 660]);
  });

  it('wraps negative and overflowing relative offsets into the day', () => {
    const items = buildAgenda(
      MONDAY,
      stateWith({
        anchors: { wake: '00:30', sleepTargetH: 4 },
        modules: [
          module(undefined, [
            {
              id: 'before',
              text: 'B',
              schedule: { days: [1], relativeTo: 'wake', offsetMin: -60 },
            },
            {
              id: 'after',
              text: 'A',
              schedule: { days: [1], relativeTo: 'wake', offsetMin: 1500 },
            },
          ]),
        ],
      }),
    );
    expect(find(items, 'reminder:m:before').minutes).toBe(23 * 60 + 30);
    expect(find(items, 'reminder:m:after').minutes).toBe(30 + 1500 - 1440);
  });

  it('allows bed-relative offsets to stay past midnight', () => {
    const items = buildAgenda(
      MONDAY,
      stateWith({
        anchors: { wake: '08:00', sleepTargetH: 7.5 },
        modules: [
          module(undefined, [
            { id: 'late', text: 'L', schedule: { days: [1], relativeTo: 'bed', offsetMin: 15 } },
          ]),
        ],
      }),
    );
    expect(find(items, 'reminder:m:late').minutes).toBe(24 * 60 + 45);
  });

  it('pushes the bed past midnight for a late waker (wake 11:00, 8 h -> 03:00)', () => {
    const items = buildAgenda(MONDAY, stateWith({ anchors: { wake: '11:00', sleepTargetH: 8 } }));
    expect(find(items, 'checkin:night').minutes).toBe(24 * 60 + 3 * 60 - 30);
  });

  it('does not push a daytime bed clock past midnight (shifted day: wake 15:00, 8 h -> 07:00)', () => {
    const items = buildAgenda(MONDAY, stateWith({ anchors: { wake: '15:00', sleepTargetH: 8 } }));
    expect(find(items, 'checkin:night').minutes).toBe(7 * 60 - 30);
  });

  it('keeps an early waker evening bed on the same day', () => {
    const items = buildAgenda(MONDAY, stateWith({ anchors: { wake: '05:10', sleepTargetH: 7.5 } }));
    expect(find(items, 'checkin:night').minutes).toBe(21 * 60 + 10);
  });

  it('uses every gym entry of a weekday (morning and evening)', () => {
    const items = buildAgenda(
      MONDAY,
      stateWith({
        gymDays: [
          { days: [1, 3], anchor: 'gymMorning' },
          { days: [1], anchor: 'gymEvening' },
        ],
      }),
    );
    const gym = find(items, 'gym');
    expect(gym.occurrences).toEqual([6 * 60, 18 * 60]);
    expect(gym.minutes).toBe(6 * 60);
    // Two gym hours: 33 ml/kg * 60 kg + 1000 ml -> 12 glasses of 250 ml.
    expect(find(items, 'water:agua:agua').target).toEqual({ glasses: 12, ml: 3000 });
  });

  it('keeps ids unique when two modules share a habit id', () => {
    const habit = (id: string): NonNullable<ModuleBody['habits']>[number] => ({
      type: 'check',
      id,
      name: id,
    });
    const items = buildAgenda(
      MONDAY,
      stateWith({
        modules: [
          { ...module([habit('same')]), id: 'a' },
          { ...module([habit('same')]), id: 'b' },
        ],
      }),
    );
    expect(ids(items).filter((id) => id.startsWith('habit:'))).toEqual([
      'habit:a:same',
      'habit:b:same',
    ]);
  });
});
