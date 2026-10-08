import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { loadDefaultTemplates } from '../templates/defaults';

import { loadProgressData } from './loadProgress';
import { buildProgressView } from './progressView';

let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => 5_000);
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
});
afterEach(() => close());

describe('loadProgressData', () => {
  it('is empty for a new install (with the metric definitions from the template)', async () => {
    const data = await loadProgressData(repos, '2026-10-07');
    expect(data.sessions).toEqual([]);
    expect(data.habitDates).toEqual([]);
    expect(data.metrics.map((metric) => metric.id)).toEqual([
      'peso',
      'cintura',
      'cadera',
      'gluteo',
    ]);
    const view = buildProgressView(data);
    expect(view.weekly.hasData).toBe(false);
    expect(view.measurements.every((metric) => metric.due)).toBe(true);
  });

  it('reads finished sessions with sets, habit days and measurements', async () => {
    const finished = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'r1',
      date: '2026-10-05',
      startedAt: 1,
    });
    await repos.workouts.logSet({
      sessionId: finished,
      stepId: 'hip',
      setIndex: 0,
      weightKg: 50,
      reps: 8,
      doneAt: 2,
    });
    await repos.workouts.finishSession(finished, 3);
    // An unfinished session and a finished one without sets are not progress.
    const open = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'r1',
      date: '2026-10-06',
      startedAt: 4,
    });
    await repos.workouts.logSet({
      sessionId: open,
      stepId: 'hip',
      setIndex: 0,
      weightKg: 80,
      reps: 8,
      doneAt: 5,
    });
    const empty = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'r1',
      date: '2026-10-04',
      startedAt: 6,
    });
    await repos.workouts.finishSession(empty, 7);

    await repos.habitLogs.set('agua', '2026-10-06', 5);
    await repos.habitLogs.set('agua', '2026-10-05', 0);
    await repos.metrics.upsert('peso', '2026-10-01', 62);
    await repos.metrics.upsert('peso', '2026-10-06', 61.5);
    await repos.settings.set('gymDays', [{ days: [1, 3], anchor: 'gymMorning' }]);

    const data = await loadProgressData(repos, '2026-10-07');
    expect(data.sessions).toEqual([
      { date: '2026-10-05', sets: [{ stepId: 'hip', weightKg: 50, reps: 8 }] },
    ]);
    expect(data.habitDates).toEqual(['2026-10-06']);
    expect(data.metrics.find((metric) => metric.id === 'peso')?.entries).toEqual([
      { date: '2026-10-01', value: 62 },
      { date: '2026-10-06', value: 61.5 },
    ]);

    const view = buildProgressView(data);
    expect(view.weekly.planned).toBe(2);
    expect(view.strength.selectedId).toBe('hip');
    expect(view.measurements.find((metric) => metric.id === 'peso')).toMatchObject({
      latest: { date: '2026-10-06', value: 61.5 },
      due: false,
    });
  });
});
