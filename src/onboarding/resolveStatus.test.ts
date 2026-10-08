import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { resolveOnboardingComplete } from './resolveStatus';

let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db);
});

afterEach(() => close());

describe('resolveOnboardingComplete', () => {
  it('is incomplete on a fresh database', async () => {
    expect(await resolveOnboardingComplete(repos)).toBe(false);
    expect(await repos.settings.get('onboardingComplete')).toBeUndefined();
  });

  it('trusts the flag', async () => {
    await repos.settings.set('onboardingComplete', true);
    expect(await resolveOnboardingComplete(repos)).toBe(true);
  });

  it('treats an existing profile row as complete and sets the flag', async () => {
    await repos.profile.save({ weightKg: 60 });
    expect(await resolveOnboardingComplete(repos)).toBe(true);
    expect(await repos.settings.get('onboardingComplete')).toBe(true);
  });

  it('treats saved anchors as complete and sets the flag', async () => {
    await repos.settings.set('anchors', { wake: '06:30', sleepTargetH: 7.5 });
    expect(await resolveOnboardingComplete(repos)).toBe(true);
    expect(await repos.settings.get('onboardingComplete')).toBe(true);
  });
});
