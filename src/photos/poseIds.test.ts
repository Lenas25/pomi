import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createBackup, restoreBackup } from '../backup/backup';
import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { loadDefaultTemplates } from '../templates/defaults';

import { activePoses, mapPhotoPoses, migratePhotoPoseIds } from './poseIds';

let db: Db;
let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(test.db);
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
});
afterEach(() => close());

const poseOf = async () => (await repos.photos.all()).map((photo) => [photo.uri, photo.pose]);

describe('stable pose ids', () => {
  it('the bundled poses have explicit ids', async () => {
    const poses = activePoses(await repos.templates.listModules());
    expect(poses).toEqual([
      { id: 'frente', label: { es: 'frente', en: 'front' } },
      { id: 'perfil', label: { es: 'perfil', en: 'side' } },
      { id: 'espalda', label: { es: 'espalda', en: 'back' } },
    ]);
  });

  it('migrates rows stored under a pose label to the pose id, idempotently', async () => {
    await repos.photos.add({ date: '2026-09-01', pose: 'front', uri: 'a.jpg' });
    await repos.photos.add({ date: '2026-10-01', pose: 'frente', uri: 'b.jpg' });
    await repos.photos.add({ date: '2026-10-01', pose: 'otra', uri: 'c.jpg' });
    const poses = activePoses(await repos.templates.listModules());
    await migratePhotoPoseIds(repos.photos, poses);
    await migratePhotoPoseIds(repos.photos, poses);
    expect(await poseOf()).toEqual([
      ['c.jpg', 'otra'],
      ['b.jpg', 'frente'],
      ['a.jpg', 'frente'],
    ]);
  });

  it('a custom pose id keeps the history stored under its legacy label', async () => {
    await repos.photos.add({ date: '2026-09-01', pose: 'frente', uri: 'a.jpg' });
    await migratePhotoPoseIds(repos.photos, [
      { id: 'front', label: { es: 'frente', en: 'front' } },
    ]);
    expect(await poseOf()).toEqual([['a.jpg', 'front']]);
    expect(mapPhotoPoses([{ pose: 'side' }], [{ es: 'perfil', en: 'side' }])).toEqual([
      { pose: 'perfil' },
    ]);
  });

  it('a backup restore maps legacy pose labels to the ids of the backup modules', async () => {
    await repos.photos.add({ date: '2026-09-01', pose: 'back', uri: 'a.jpg' });
    const backup = await createBackup(db, {
      appVersion: '1.0.0',
      now: () => new Date('2026-10-08T10:00:00Z'),
      includePhotos: true,
    });
    await restoreBackup(db, backup);
    expect(await poseOf()).toEqual([['a.jpg', 'espalda']]);
  });
});
