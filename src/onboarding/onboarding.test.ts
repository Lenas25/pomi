import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { emptyDraft, type OnboardingDraft } from '../domain/onboarding/draft';
import { completeOnboarding } from './complete';
import { QUESTION_IDS, TOTAL_QUESTIONS, nextHref, questionHref, questionNumber } from './flow';

describe('question flow', () => {
  it('has the 12 questions of PLAN §8 in order and numbers them from 1', () => {
    expect(TOTAL_QUESTIONS).toBe(12);
    expect(QUESTION_IDS[0]).toBe('name');
    expect(QUESTION_IDS[TOTAL_QUESTIONS - 1]).toBe('permissions');
    expect(questionNumber('name')).toBe(1);
    expect(questionNumber('permissions')).toBe(12);
  });

  it('chains every question to the next and the last one to the summary', () => {
    expect(questionHref('name')).toBe('/onboarding');
    expect(nextHref('name')).toBe('/onboarding/body');
    expect(nextHref('checkins')).toBe('/onboarding/permissions');
    expect(nextHref('permissions')).toBe('/onboarding/summary');
  });
});

describe('completeOnboarding', () => {
  let db: Db;
  let repos: Repositories;
  let close: () => void;

  beforeEach(async () => {
    const test = await createTestDb();
    db = test.db;
    close = test.close;
    repos = createRepositories(db, () => 1_000);
  });

  afterEach(() => close());

  const answered: OnboardingDraft = {
    ...emptyDraft(),
    name: 'Lena',
    weightKg: 60,
    heightCm: 154,
    workType: 'sentada',
    wake: '05:10',
    gymDays: [1, 3],
    gymSlots: { 1: 'gymMorning', 3: 'gymMorning' },
    level: 'intermedio',
    goal: 'musculo',
    stepsEstimate: 6200,
    checkinNight: false,
  };

  it('stores profile, settings and goals and marks the onboarding complete', async () => {
    expect(await repos.settings.get('onboardingComplete')).toBeUndefined();
    await completeOnboarding(db, repos, answered);

    expect(await repos.profile.get()).toMatchObject({
      weightKg: 60,
      heightCm: 154,
      workType: 'sentada',
      level: 'intermedio',
      goal: 'musculo',
      ageYears: null,
    });
    expect(await repos.settings.get('anchors')).toEqual({
      wake: '05:10',
      sleepTargetH: 7.5,
      gymMorning: '06:00',
    });
    expect(await repos.settings.get('gymDays')).toEqual([{ days: [1, 3], anchor: 'gymMorning' }]);
    expect(await repos.settings.get('checkinPrefs')).toEqual({
      morning: true,
      night: false,
      monthlyReviewDay: 1,
    });
    expect(await repos.settings.get('userName')).toBe('Lena');
    expect(await repos.settings.get('stepsEstimate')).toBe(6200);
    expect(await repos.settings.get('goals')).toEqual({
      waterGlassesRest: 8,
      waterGlassesGym: 10,
      stepsGoal: 7000,
    });
    expect(await repos.settings.get('onboardingComplete')).toBe(true);
  });

  it('works when every question was skipped', async () => {
    await completeOnboarding(db, repos, emptyDraft());
    expect(await repos.profile.get()).toBeUndefined();
    expect(await repos.settings.get('anchors')).toEqual({ sleepTargetH: 7.5 });
    expect(await repos.settings.get('gymDays')).toEqual([]);
    expect(await repos.settings.get('userName')).toBeUndefined();
    expect(await repos.settings.get('onboardingComplete')).toBe(true);
  });

  it('is atomic: nothing is stored when a write fails', async () => {
    // The profile is written first, so a failing settings write must roll it back.
    const failing = createRepositories(db, () => 1_000);
    failing.settings.set = () => Promise.reject(new Error('disk full'));
    await expect(completeOnboarding(db, failing, answered)).rejects.toThrow('disk full');
    expect(await repos.profile.get()).toBeUndefined();
    expect(await repos.settings.get('onboardingComplete')).toBeUndefined();
  });
});
