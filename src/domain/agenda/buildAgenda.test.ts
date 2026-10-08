import { describe, expect, it } from '@jest/globals';

import { loadDefaultTemplates } from '../../templates/defaults';
import type { Step } from '../../templates/schema';

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
      'water:agua',
      'habit:pausa-activa',
      'reminder:pantallas',
      'checkin:night',
      'reminder:dormir',
      'habit:caminar-comida',
      'steps:pasos',
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
    expect(find(items, 'reminder:pantallas').minutes).toBe(21 * 60); // bed − 40
    expect(find(items, 'reminder:dormir').minutes).toBe(21 * 60 + 40);
  });

  it('expands repeating schedules into occurrences', () => {
    const water = find(items, 'water:agua');
    expect(water.minutes).toBe(6 * 60 + 10); // wake + 60
    expect(water.occurrences).toHaveLength(14);
    expect(water.occurrences.at(-1)).toBe(19 * 60 + 10);

    const pause = find(items, 'habit:pausa-activa');
    expect(pause.occurrences).toEqual([540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080]);
  });

  it('adds the water goal (gym day: 10 glasses) and the steps goal', () => {
    expect(find(items, 'water:agua').target).toEqual({ glasses: 10, ml: 2500 });
    expect(find(items, 'steps:pasos').target).toEqual({ steps: 6000 });
    expect(find(items, 'steps:pasos').minutes).toBeNull();
  });
});

describe('buildAgenda on other days', () => {
  it('uses the evening anchor on Tuesday', () => {
    expect(find(buildAgenda(TUESDAY, stateWith()), 'gym').minutes).toBe(18 * 60);
  });

  it('has no gym on a rest day, and a rest-day water goal of 8 glasses', () => {
    const items = buildAgenda(SATURDAY, stateWith());
    expect(ids(items)).not.toContain('gym');
    expect(find(items, 'water:agua').target).toEqual({ glasses: 8, ml: 2000 });
  });

  it('drops weekday-only habits on the weekend', () => {
    expect(ids(buildAgenda(SUNDAY, stateWith()))).not.toContain('habit:pausa-activa');
  });
});

describe('buildAgenda conditions and settings', () => {
  it('shows the active pause only when profile.workType is "sentada"', () => {
    const standing = buildAgenda(
      MONDAY,
      stateWith({ profile: { weightKg: 60, workType: 'de pie' } }),
    );
    expect(ids(standing)).not.toContain('habit:pausa-activa');
    const unknown = buildAgenda(MONDAY, stateWith({ profile: { weightKg: 60 } }));
    expect(ids(unknown)).not.toContain('habit:pausa-activa');
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
      expect.arrayContaining(['gym', 'habit:caminar-comida', 'steps:pasos']),
    );
    expect(ids(items)).not.toEqual(expect.arrayContaining(['checkin:morning']));
    expect(ids(items)).not.toContain('checkin:night');
    expect(ids(items)).not.toContain('water:agua'); // relative to wake
    expect(ids(items)).not.toContain('reminder:dormir'); // relative to the derived bed
  });

  it('keeps a gym item without a time when its anchor is missing', () => {
    const items = buildAgenda(MONDAY, stateWith({ anchors: { wake: '05:10', sleepTargetH: 7.5 } }));
    expect(find(items, 'gym').minutes).toBeNull();
  });

  it('omits the water goal without a weight', () => {
    const items = buildAgenda(MONDAY, stateWith({ profile: { workType: 'sentada' } }));
    expect(find(items, 'water:agua').target).toBeUndefined();
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
    expect(find(items, 'reminder:dormir').minutes).toBe(24 * 60 + 30);
    expect(find(items, 'reminder:pantallas').minutes).toBe(24 * 60 - 10);
    expect(find(items, 'checkin:night').minutes).toBe(24 * 60);
    const order = ids(items);
    expect(order.indexOf('reminder:dormir')).toBeGreaterThan(order.indexOf('gym'));
  });
});
