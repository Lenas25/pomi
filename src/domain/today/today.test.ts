import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { loadDefaultTemplates } from '../../templates/defaults';
import { buildAgenda, type AgendaState } from '../agenda/buildAgenda';

import { greetingKey, identityPhrase, trainingWeeks, type IdentityInput } from './identity';
import {
  buildTimeline,
  doneActionFor,
  isAllDone,
  isSwipeDone,
  shownMinute,
  type DayProgress,
  type TimelineEntry,
} from './timeline';

function lookup(messages: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

describe('greetingKey', () => {
  it('follows the hour and the presence of a name', () => {
    expect(greetingKey(8, false)).toBe('today.greeting.morning');
    expect(greetingKey(8, true)).toBe('today.greeting.morningNamed');
    expect(greetingKey(12, false)).toBe('today.greeting.afternoon');
    expect(greetingKey(18, true)).toBe('today.greeting.afternoonNamed');
    expect(greetingKey(19, false)).toBe('today.greeting.evening');
    expect(greetingKey(0, false)).toBe('today.greeting.morning');
  });
});

describe('identityPhrase', () => {
  // 2026-10-14 is a Wednesday.
  const base: IdentityInput = {
    today: '2026-10-14',
    gymDates: [],
    plannedGymDays: 3,
    waterDays: null,
    firstDay: false,
  };
  const weekly = (...dates: string[]) => dates;

  it('the first day gets the welcome phrase', () => {
    expect(identityPhrase({ ...base, firstDay: true }).key).toBe('today.identity.first');
  });

  it('counts training weeks (gaps allowed, never a streak) for "Llevas N semanas..."', () => {
    // This week: 12, 13. Last week: 6, 7. Two weeks ago: nothing. Three weeks ago: 22, 23.
    const gymDates = weekly(
      '2026-10-12',
      '2026-10-13',
      '2026-10-06',
      '2026-10-07',
      '2026-09-22',
      '2026-09-23',
    );
    expect(trainingWeeks({ ...base, gymDates })).toBe(3);
    expect(identityPhrase({ ...base, gymDates })).toEqual({
      key: 'today.identity.weeks',
      params: { n: 3 },
    });
  });

  it('needs min(2, planned days) sessions in a week, and 1 when the plan has one day', () => {
    const one = weekly('2026-10-13', '2026-10-06');
    expect(trainingWeeks({ ...base, gymDates: one })).toBe(0);
    expect(trainingWeeks({ ...base, plannedGymDays: 1, gymDates: one })).toBe(2);
  });

  it('falls back through "moving", water and a neutral phrase', () => {
    expect(identityPhrase({ ...base, gymDates: ['2026-10-10'] }).key).toBe('today.identity.moving');
    expect(identityPhrase({ ...base, waterDays: 6 })).toEqual({
      key: 'today.identity.water',
      params: { done: 6 },
    });
    expect(identityPhrase({ ...base, waterDays: 2 }).key).toBe('today.identity.fallback');
    expect(identityPhrase(base).key).toBe('today.identity.fallback');
  });

  it('every phrase exists in es and en, and none talks about streaks', () => {
    const keys = [
      'today.identity.first',
      'today.identity.weeks',
      'today.identity.moving',
      'today.identity.water',
      'today.identity.fallback',
      'today.greeting.morning',
      'today.greeting.morningNamed',
      'today.greeting.afternoon',
      'today.greeting.afternoonNamed',
      'today.greeting.evening',
      'today.greeting.eveningNamed',
    ];
    for (const key of keys) {
      for (const messages of [es, en]) {
        const text = lookup(messages, key);
        expect(typeof text).toBe('string');
        expect(String(text)).not.toMatch(/racha|streak/i);
      }
    }
  });
});

// --- Timeline ---------------------------------------------------------------------------------

const defaults = loadDefaultTemplates();
const MONDAY = new Date(2026, 9, 5);

function agendaState(): AgendaState {
  return {
    profile: { weightKg: 60, workType: 'sentada' },
    anchors: defaults.settings.anchors ?? {},
    gymDays: defaults.settings.gymDays ?? [],
    modules: defaults.modules,
  };
}

function progress(overrides: Partial<DayProgress> = {}): DayProgress {
  return {
    doneIds: new Set(),
    ackedIds: new Set(),
    skippedIds: new Set(),
    snoozedTo: new Map(),
    ...overrides,
  };
}

const agenda = buildAgenda(MONDAY, agendaState());
const at = (hour: number, minute = 0) => hour * 60 + minute;
const statusOf = (entries: readonly TimelineEntry[], id: string) =>
  entries.find((entry) => entry.id === id)?.status;

describe('buildTimeline status mapping', () => {
  it('marks the live occurrence as now and the rest as upcoming', () => {
    const entries = buildTimeline(agenda, at(6, 0), progress());
    expect(statusOf(entries, 'gym')).toBe('now'); // gym at 06:00, 45 min window
    expect(statusOf(entries, 'checkin:night')).toBe('upcoming');
    expect(statusOf(entries, 'checkin:morning')).toBe('now'); // 05:20
  });

  it('a past item that is not done stays "upcoming" (never a miss)', () => {
    const entries = buildTimeline(agenda, at(15), progress());
    expect(statusOf(entries, 'gym')).toBe('upcoming');
    expect(statusOf(entries, 'checkin:morning')).toBe('upcoming');
  });

  it('done and skipped win over time', () => {
    const entries = buildTimeline(
      agenda,
      at(6, 20),
      progress({
        doneIds: new Set(['gym']),
        ackedIds: new Set(['reminder:sueno:dormir']),
        skippedIds: new Set(['checkin:morning']),
      }),
    );
    expect(statusOf(entries, 'gym')).toBe('done');
    expect(statusOf(entries, 'reminder:sueno:dormir')).toBe('done');
    expect(statusOf(entries, 'checkin:morning')).toBe('skipped');
  });

  it('a postponed item moves to its new time as upcoming', () => {
    const entries = buildTimeline(
      agenda,
      at(6, 20),
      progress({ snoozedTo: new Map([['gym', at(6, 30)]]) }),
    );
    const gym = entries.find((entry) => entry.id === 'gym');
    expect(gym?.status).toBe('upcoming');
    expect(gym?.minutes).toBe(at(6, 30));
  });

  it('shows the next occurrence of a repeating item (water), then the last one', () => {
    const water = agenda.find((item) => item.kind === 'water');
    if (!water) throw new Error('no water item');
    expect(shownMinute(water, at(8, 55))).toBe(at(9, 10));
    expect(shownMinute(water, at(23))).toBe(at(19, 10));
    expect(shownMinute(water, at(9, 20))).toBe(at(9, 10)); // in effect
    expect(shownMinute(water, at(8, 30))).toBe(at(8, 10)); // still in effect
  });

  it('keeps all-day items without time and last', () => {
    const entries = buildTimeline(agenda, at(10), progress());
    const steps = entries.find((entry) => entry.kind === 'steps');
    expect(steps?.minutes).toBeNull();
    expect(entries.at(-1)?.kind).toBe('steps');
  });
});

describe('isAllDone', () => {
  const required = agenda
    .filter((item) => ['gym', 'checkin', 'water', 'habit'].includes(item.kind))
    .map((item) => item.id);

  it('needs every gym / check-in / water / habit item done or skipped', () => {
    const allDone = buildTimeline(agenda, at(22), progress({ doneIds: new Set(required) }));
    expect(isAllDone(allDone)).toBe(true);
    const missingOne = buildTimeline(
      agenda,
      at(22),
      progress({ doneIds: new Set(required.slice(1)) }),
    );
    expect(isAllDone(missingOne)).toBe(false);
  });

  it('counts skipped items, ignores steps and reminders, and an empty day is not done', () => {
    const skipped = buildTimeline(
      agenda,
      at(22),
      progress({ doneIds: new Set(required.slice(1)), skippedIds: new Set(required.slice(0, 1)) }),
    );
    expect(isAllDone(skipped)).toBe(true);
    expect(isAllDone([])).toBe(false);
  });
});

describe('what swipe-right / the check button do', () => {
  const entry = (id: string) => {
    const found = buildTimeline(agenda, at(10), progress()).find(
      (candidate) => candidate.id === id,
    );
    if (!found) throw new Error(`missing ${id}`);
    return found;
  };

  it('logs checks, adds a glass, acknowledges reminders', () => {
    expect(doneActionFor(entry('habit:movimiento:caminar-comida'))).toEqual({
      type: 'logCheck',
      habitId: 'caminar-comida',
    });
    expect(doneActionFor(entry('water:agua:agua'))).toEqual({ type: 'addWater', habitId: 'agua' });
    expect(doneActionFor(entry('reminder:sueno:dormir'))).toEqual({ type: 'acknowledge' });
  });

  it('opens the screen for things that need real input', () => {
    expect(doneActionFor(entry('gym'))).toEqual({ type: 'open', target: 'gym' });
    expect(doneActionFor(entry('checkin:morning'))).toEqual({
      type: 'open',
      target: 'checkin:morning',
    });
    expect(doneActionFor(entry('checkin:night'))).toEqual({
      type: 'open',
      target: 'checkin:night',
    });
    expect(doneActionFor(entry('steps:movimiento:pasos'))).toEqual({
      type: 'open',
      target: 'habits',
    });
  });

  it('a swipe counts only when long enough and mostly horizontal', () => {
    expect(isSwipeDone(120, 10)).toBe(true);
    expect(isSwipeDone(60, 0)).toBe(false);
    expect(isSwipeDone(-150, 0)).toBe(false);
    expect(isSwipeDone(120, 100)).toBe(false);
  });
});
