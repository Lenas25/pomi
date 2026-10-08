import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import {
  emptyDraft,
  currentSleepHours,
  parseDecimal,
  parseOptionalNumber,
  LIMITS,
  type OnboardingDraft,
} from './draft';
import { mapDraftToPersistence } from './mapDraft';
import { entryHref, routeGuards } from './redirect';
import { buildStartingPoint, type StartingPointKey } from './startingPoint';

function draftWith(patch: Partial<OnboardingDraft>): OnboardingDraft {
  return { ...emptyDraft(), ...patch };
}

const full = draftWith({
  name: '  Lena ',
  weightKg: 60,
  heightCm: 154,
  ageYears: 30,
  workType: 'sentada',
  wake: '05:10',
  bed: '22:00',
  sleepTargetH: 7.5,
  gymDays: [3, 1, 2, 4],
  gymSlots: { 1: 'gymMorning', 3: 'gymMorning', 2: 'gymEvening', 4: 'gymEvening' },
  gymMorning: '06:00',
  gymEvening: '18:00',
  level: 'intermedio',
  goal: 'musculo',
  stepsEstimate: 6200,
});

describe('mapDraftToPersistence', () => {
  it('maps a complete draft to profile, anchors, gym days and goals', () => {
    const { profile, settings } = mapDraftToPersistence(full);
    expect(profile).toEqual({
      weightKg: 60,
      heightCm: 154,
      ageYears: 30,
      workType: 'sentada',
      level: 'intermedio',
      goal: 'musculo',
    });
    expect(settings.userName).toBe('Lena');
    expect(settings.anchors).toEqual({
      wake: '05:10',
      sleepTargetH: 7.5,
      gymMorning: '06:00',
      gymEvening: '18:00',
    });
    expect(settings.gymDays).toEqual([
      { days: [1, 3], anchor: 'gymMorning' },
      { days: [2, 4], anchor: 'gymEvening' },
    ]);
    expect(settings.checkinPrefs).toEqual({ morning: true, night: true, monthlyReviewDay: 1 });
    expect(settings.stepsEstimate).toBe(6200);
    // 60 kg: 1,980 ml -> 8 glasses; gym day 2,480 ml -> 10 glasses. 6,200 + 1,000 -> 7,000 (7,200 to the nearest 500).
    expect(settings.goals).toEqual({ waterGlassesRest: 8, waterGlassesGym: 10, stepsGoal: 7000 });
  });

  it('leaves skipped answers out and only anchors the slots that are used', () => {
    const { profile, settings } = mapDraftToPersistence(
      draftWith({ gymDays: [5], gymSlots: { 5: 'gymEvening' }, checkinMorning: false }),
    );
    expect(profile).toEqual({});
    expect(settings.userName).toBeUndefined();
    expect(settings.anchors).toEqual({ sleepTargetH: 7.5, gymEvening: '18:00' });
    expect(settings.gymDays).toEqual([{ days: [5], anchor: 'gymEvening' }]);
    expect(settings.checkinPrefs).toMatchObject({ morning: false, night: true });
    expect(settings.goals).toEqual({});
    expect(settings.stepsEstimate).toBeUndefined();
  });

  it('defaults a gym day without a slot to the morning', () => {
    const { settings } = mapDraftToPersistence(draftWith({ gymDays: [2, 2, 1] }));
    expect(settings.gymDays).toEqual([{ days: [1, 2], anchor: 'gymMorning' }]);
    expect(settings.anchors.gymEvening).toBeUndefined();
  });

  it('stores edited goals instead of the formula values', () => {
    const { settings } = mapDraftToPersistence({
      ...full,
      goalOverrides: { waterRestGlasses: 9, stepsGoal: 8000 },
    });
    expect(settings.goals).toEqual({ waterGlassesRest: 9, waterGlassesGym: 10, stepsGoal: 8000 });
  });

  it('does not store a blank name', () => {
    expect(mapDraftToPersistence(draftWith({ name: '   ' })).settings.userName).toBeUndefined();
  });
});

describe('buildStartingPoint', () => {
  it('computes the goals with the domain formulas and explains them', () => {
    const point = buildStartingPoint(full);
    expect(point.water?.restGlasses).toEqual({ value: 8, suggested: 8, edited: false });
    expect(point.water?.gymGlasses.value).toBe(10);
    expect(point.waterExplanation).toEqual({
      key: 'onboarding.summary.waterExplain',
      params: { kg: 60, rawMl: 1980, glassMl: 250 },
    });
    expect(point.steps.baseline).toBe(6200);
    expect(point.steps.goal?.value).toBe(7000);
    expect(point.steps.explanation.params).toEqual({ baseline: 6200 });
    expect(point.sleep.bedtime).toBe('21:40');
    expect(point.sleep.cycles.map((option) => option.bedtime)).toEqual(['22:55', '21:25', '19:55']);
    expect(point.sleep.explanation).toEqual({
      key: 'onboarding.summary.sleepExplain',
      params: { wake: '05:10', hours: 7.5, bedtime: '21:40' },
    });
    expect(point.gym.days).toEqual([1, 2, 3, 4]);
    expect(point.gym.explanation).toEqual({
      key: 'onboarding.summary.gymExplain',
      params: { count: 4 },
    });
  });

  it('flags an edited goal and recomputes the bedtime from an edited sleep target', () => {
    const point = buildStartingPoint({
      ...full,
      sleepTargetH: 8,
      goalOverrides: { waterRestGlasses: 7 },
    });
    expect(point.water?.restGlasses).toEqual({ value: 7, suggested: 8, edited: true });
    expect(point.sleep.bedtime).toBe('21:10');
  });

  it('degrades gracefully when answers were skipped', () => {
    const point = buildStartingPoint(emptyDraft());
    expect(point.water).toBeNull();
    expect(point.waterExplanation.key).toBe('onboarding.summary.waterNoWeight');
    expect(point.steps.goal).toBeNull();
    expect(point.steps.explanation.key).toBe('onboarding.summary.stepsNoBaseline');
    expect(point.sleep.bedtime).toBeNull();
    expect(point.sleep.explanation.key).toBe('onboarding.summary.sleepNoWake');
    expect(point.gym.explanation.key).toBe('onboarding.summary.gymNone');
  });

  it('only emits i18n keys that exist in Spanish and English', () => {
    const keys = new Set<StartingPointKey>();
    for (const draft of [full, emptyDraft()]) {
      const point = buildStartingPoint(draft);
      keys.add(point.waterExplanation.key);
      keys.add(point.steps.explanation.key);
      keys.add(point.sleep.explanation.key);
      keys.add(point.gym.explanation.key);
    }
    for (const key of keys) {
      const name = key.replace('onboarding.summary.', '') as keyof typeof es.onboarding.summary;
      expect(es.onboarding.summary[name]).toEqual(expect.any(String));
      expect(en.onboarding.summary[name]).toEqual(expect.any(String));
    }
  });
});

describe('route gating', () => {
  it('exposes only the onboarding until it is complete', () => {
    expect(routeGuards('incomplete')).toEqual({ onboarding: true, app: false });
    expect(routeGuards('complete')).toEqual({ onboarding: false, app: true });
  });

  it('exposes nothing while the status is unknown', () => {
    expect(routeGuards('unknown')).toEqual({ onboarding: false, app: false });
    expect(entryHref('unknown')).toBeNull();
  });

  it('sends the entry route to the onboarding or to Hoy', () => {
    expect(entryHref('incomplete')).toBe('/onboarding');
    expect(entryHref('complete')).toBe('/(tabs)/hoy');
  });
});

describe('typed answers', () => {
  it('parses decimals with a comma or a dot and rejects other text', () => {
    expect(parseDecimal('60,5')).toBe(60.5);
    expect(parseDecimal(' 154 ')).toBe(154);
    expect(parseDecimal('6o')).toBeUndefined();
    expect(parseDecimal('-3')).toBeUndefined();
    expect(parseDecimal('')).toBeUndefined();
  });

  it('treats empty as no answer and enforces range and integers', () => {
    expect(parseOptionalNumber('', LIMITS.weightKg)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalNumber('60', LIMITS.weightKg)).toEqual({ ok: true, value: 60 });
    expect(parseOptionalNumber('5', LIMITS.weightKg)).toEqual({ ok: false });
    expect(parseOptionalNumber('abc', LIMITS.weightKg)).toEqual({ ok: false });
    expect(parseOptionalNumber('30.5', LIMITS.ageYears, true)).toEqual({ ok: false });
    expect(parseOptionalNumber('30', LIMITS.ageYears, true)).toEqual({ ok: true, value: 30 });
  });

  it('derives how long the person sleeps now across midnight', () => {
    expect(currentSleepHours({ wake: '05:10', bed: '22:00' })).toBe(7);
    expect(currentSleepHours({ wake: '06:30', bed: '23:00' })).toBe(7.5);
    expect(currentSleepHours({ wake: '06:30' })).toBeNull();
  });
});
