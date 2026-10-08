import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { loadDefaultTemplates } from '../templates/defaults';

import { buildReport } from './buildReport';
import { loadReportData } from './loadReportData';
import { applyTemplate, defaultSelection } from './templates';

let repos: Repositories;
let close: () => void;

// 2026-10-07 12:00, TZ America/New_York: logical day 2026-10-07.
const NOW = new Date(2026, 9, 7, 12, 0);

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => NOW.getTime());
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
  await repos.settings.set('anchors', { wake: '06:00', sleepTargetH: 8 });
  await repos.settings.set('gymDays', [{ days: [1, 3, 5], anchor: 'gymMorning' }]);
  await repos.settings.set('startedOn', '2026-08-01');
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

describe('loadReportData + buildReport on the real migrations', () => {
  it('reads what was logged and builds a trainer report from it', async () => {
    const at = new Date(2026, 9, 5, 6, 0).getTime();
    const id = await repos.workouts.createSession({
      programId: 'p',
      routineId: 'r',
      date: '2026-10-05',
      startedAt: at,
    });
    await repos.workouts.logSet({
      sessionId: id,
      stepId: 'hip-thrust',
      setIndex: 0,
      reps: 10,
      weightKg: 50,
      rir: 2,
      doneAt: at + 1,
    });
    await repos.workouts.finishSession(id, at + 3_600_000);
    await repos.metrics.upsert('peso', '2026-10-01', 61.5);
    await repos.habitLogs.set('agua', '2026-10-05', 8);
    await repos.foodNotes.save('2026-10-05', 'Comí lentejas');
    await repos.photos.add({ date: '2026-10-05', pose: 'frente', uri: '2026-10-05-frente-1.jpg' });

    const data = await loadReportData(repos, NOW);
    expect(data.today).toBe('2026-10-07');
    expect(data.sessions).toHaveLength(1);
    expect(data.metrics.find((metric) => metric.id === 'peso')?.entries).toEqual([
      { date: '2026-10-01', value: 61.5 },
    ]);
    expect(data.water?.days).toEqual([
      { date: '2026-10-05', glasses: 8, targetGlasses: expect.any(Number) },
    ]);
    expect(data.photos).toEqual([
      { date: '2026-10-05', pose: 'frente', name: '2026-10-05-frente-1.jpg' },
    ]);

    const trainer = buildReport(
      data,
      { ...applyTemplate(defaultSelection(), 'trainer'), period: '30d' },
      NOW,
    );
    expect(trainer.sections.map((section) => section.kind)).toEqual(['gym', 'measures']);
    const everything = buildReport(
      data,
      {
        ...defaultSelection(),
        sections: ['gym', 'habits', 'sleep', 'measures', 'photos'],
        period: '30d',
        foodNotes: true,
      },
      NOW,
    );
    expect(everything.sections.map((section) => section.kind)).toEqual([
      'gym',
      'habits',
      'sleep',
      'measures',
      'photos',
    ]);
    expect(everything.sections[1]).toMatchObject({ foodNotes: [{ text: 'Comí lentejas' }] });
  });

  it('an empty database still builds every section as empty', async () => {
    const model = buildReport(
      await loadReportData(repos, NOW),
      { ...defaultSelection(), sections: ['gym', 'habits', 'sleep', 'measures', 'photos'] },
      NOW,
    );
    expect(model.sections.every((section) => section.empty)).toBe(true);
  });
});
