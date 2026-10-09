import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { loadDefaultTemplates } from '../templates/defaults';
import { addGlassOfWater, checkinKindAt } from './quickAdd';

let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => 1_000);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
  await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);
  await repos.settings.set('startedOn', '2026-10-01');
});

afterEach(() => close());

describe('addGlassOfWater', () => {
  it('adds one glass to today, on top of what is already logged', async () => {
    await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
    await repos.habitLogs.set('agua', '2026-10-06', 3);
    // 2026-10-06 is a rest day: target 8 glasses for 60 kg.
    expect(await addGlassOfWater(repos, '2026-10-06')).toEqual({
      status: 'added',
      value: 4,
      target: 8,
    });
    expect(await addGlassOfWater(repos, '2026-10-06')).toMatchObject({ value: 5 });
  });

  it('does nothing when there is no water habit', async () => {
    expect(await addGlassOfWater(repos, '2026-10-06')).toEqual({ status: 'noWater' });
  });
});

describe('checkinKindAt', () => {
  it('opens the morning check-in before 15:00 and the night one after', () => {
    expect(checkinKindAt(7)).toBe('morning');
    expect(checkinKindAt(14)).toBe('morning');
    expect(checkinKindAt(15)).toBe('night');
    expect(checkinKindAt(23)).toBe('night');
  });
});
