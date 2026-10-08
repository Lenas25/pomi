import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createBackup, restoreBackup } from '../backup/backup';
import { parseBackupText } from '../backup/parse';
import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { es } from '../i18n/es';
import type { Translate } from '../i18n';
import { loadDefaultTemplates } from '../templates/defaults';

import { mergeNotificationPrefs, savePrefsChange } from './useNotificationPrefs';
import { loadTomorrowPreview, previewRows } from './useTomorrowPreview';

let db: Db;
let repos: Repositories;
let close: () => void;

// Monday afternoon: tomorrow is Tuesday 2026-10-06 (gym 18:00 in the default settings).
const NOW = new Date(2026, 9, 5, 15, 0);

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(test.db, () => NOW.getTime());
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  await repos.settings.set('anchors', defaults.settings.anchors ?? {});
  await repos.settings.set('gymDays', defaults.settings.gymDays ?? []);
  await repos.settings.set('onboardingComplete', true);
  await repos.profile.save({ weightKg: 60, workType: 'sentada' });
});

afterEach(() => close());

const fakeT = ((key: string, params?: Record<string, unknown>) => {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], es);
  if (typeof value !== 'string') return key;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
}) as Translate;

describe('tomorrow preview', () => {
  it('lists tomorrow with exact times and follows the saved preferences', async () => {
    const before = await loadTomorrowPreview(repos, NOW);
    if (before.status !== 'ready') throw new Error('ready expected');
    const rows = previewRows(before.planned, fakeT);
    expect(rows.find((row) => row.id.startsWith('gym:'))?.time).toBe('18:00');
    expect(rows.every((row) => row.title.length > 0)).toBe(true);
    expect(rows.map((row) => row.time)).toEqual([...rows.map((row) => row.time)].sort());

    await repos.settings.set('notificationPrefs', {
      gym: { minutesBefore: 30 },
      water: { enabled: false },
    });
    const after = await loadTomorrowPreview(repos, NOW);
    if (after.status !== 'ready') throw new Error('ready expected');
    expect(after.planned.find((n) => n.kind === 'gym')?.id).toBe('gym:core:gym:2026-10-06:17:30');
    expect(after.planned.some((n) => n.kind === 'water')).toBe(false);
  });

  it('says off when the master switch is off', async () => {
    await repos.settings.set('notificationPrefs', { enabled: false });
    expect((await loadTomorrowPreview(repos, NOW)).status).toBe('off');
  });
});

describe('mergeNotificationPrefs', () => {
  it('merges a patch and an undefined value goes back to the default', () => {
    expect(
      mergeNotificationPrefs({ survey: false, water: { everyMin: 90 } }, { water: undefined }),
    ).toEqual({ survey: false });
    expect(mergeNotificationPrefs({}, { gym: { minutesBefore: 15 } })).toEqual({
      gym: { minutesBefore: 15 },
    });
  });
});

describe('savePrefsChange', () => {
  it('two rapid edits of one category both land (merged inside the mutex)', async () => {
    await repos.settings.set('notificationPrefs', { gym: { enabled: true } });
    await Promise.all([
      savePrefsChange(repos.settings, { gym: { minutesBefore: 30 } }),
      savePrefsChange(repos.settings, { gym: { enabled: false } }),
    ]);
    expect(await repos.settings.get('notificationPrefs')).toEqual({
      gym: { enabled: false, minutesBefore: 30 },
    });
  });

  it('a function change sees the current stored value', async () => {
    const add = (current: { quietHours?: { from: string; until: string; days: number[] }[] }) => ({
      quietHours: [...(current.quietHours ?? []), { from: '13:00', until: '15:00', days: [1] }],
    });
    await Promise.all([savePrefsChange(repos.settings, add), savePrefsChange(repos.settings, add)]);
    expect((await repos.settings.get('notificationPrefs'))?.quietHours).toHaveLength(2);
  });

  it('clearing every field removes the category', () => {
    expect(
      mergeNotificationPrefs(
        { water: { from: '08:00', until: '20:00' } },
        {
          water: { from: undefined, until: undefined },
        },
      ),
    ).toEqual({});
  });
});

describe('backups', () => {
  const prefs = {
    survey: false,
    water: { from: '08:00', until: '20:00', everyMin: 90, days: [1, 2, 3] },
    quietHours: [{ from: '22:00', until: '06:00', days: [5] }],
  };

  it('carry the notification preferences', async () => {
    await repos.settings.set('notificationPrefs', prefs);
    const backup = await createBackup(db, { appVersion: '1.0.0' });
    const target = await createTestDb();
    try {
      const parsed = parseBackupText(JSON.stringify(backup));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      await restoreBackup(target.db, parsed.backup);
      expect(await createRepositories(target.db).settings.get('notificationPrefs')).toEqual(prefs);
    } finally {
      target.close();
    }
  });

  it('old prefs restore, invalid ones are rejected with an error', async () => {
    await repos.settings.set('notificationPrefs', { enabled: true, weeklyReview: false });
    const backup = await createBackup(db, { appVersion: '1.0.0' });
    expect(parseBackupText(JSON.stringify(backup)).ok).toBe(true);

    const broken = {
      ...backup,
      data: {
        ...backup.data,
        settings: backup.data.settings.map((row) =>
          row.key === 'notificationPrefs'
            ? { ...row, value: JSON.stringify({ water: { everyMin: 5 } }) }
            : row,
        ),
      },
    };
    expect(parseBackupText(JSON.stringify(broken)).ok).toBe(false);
  });
});
