import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';

import {
  base64Length,
  buildPart,
  parsePart,
  planParts,
  restorePart,
  PHOTO_ARCHIVE_FORMAT,
} from './photoArchive';
import { exportPhotoArchive, importPhotoArchive, type ShareFile } from './photoBackup';
import {
  deletePhoto,
  isSafePhotoName,
  photoFileName,
  previousPhoto,
  savePhoto,
  sweepOrphanPhotos,
  type PhotoFs,
} from './photoStore';

/** In-memory file system: the "cache" holds captures, `files` is the private photo folder. */
function fakeFs(cache: Record<string, string> = {}) {
  const files = new Map<string, string>();
  const fs: PhotoFs = {
    async store(sourceUri, name) {
      const content = cache[sourceUri];
      if (content === undefined) throw new Error(`No capture at ${sourceUri}`);
      files.set(name, content);
      delete cache[sourceUri];
    },
    remove: (name) => void files.delete(name),
    exists: (name) => files.has(name),
    uriOf: (name) => `file:///photos/${name}`,
    list: () => [...files.keys()],
    size: (name) => files.get(name)?.length ?? 0,
    readBase64: async (name) => files.get(name) ?? '',
    writeBase64: (name, base64) => void files.set(name, base64),
  };
  return { fs, files, cache };
}

let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db);
});
afterEach(() => close());

describe('photo file names', () => {
  it('slugs the pose to ASCII and keeps the date and time', () => {
    expect(photoFileName('2026-10-01', 'Perfil derecho', 1759300000000)).toBe(
      '2026-10-01-perfil-derecho-1759300000000.jpg',
    );
    expect(photoFileName('2026-10-01', 'Pecho ñandú', 5)).toBe('2026-10-01-pecho-nandu-5.jpg');
    expect(photoFileName('2026-10-01', '???', 5)).toBe('2026-10-01-foto-5.jpg');
  });

  it('accepts only plain jpg names (no folders or tricks)', () => {
    expect(isSafePhotoName('2026-10-01-frente-5.jpg')).toBe(true);
    for (const bad of ['../x.jpg', 'a/b.jpg', 'a\\b.jpg', 'x.png', '.hidden.jpg', 'a..b.jpg', '']) {
      expect(isSafePhotoName(bad)).toBe(false);
    }
  });
});

describe('savePhoto / deletePhoto', () => {
  it('moves the capture into private storage and records the row', async () => {
    const { fs, files, cache } = fakeFs({ 'cache://a.jpg': 'AAA' });
    const row = await savePhoto({
      fs,
      photos: repos.photos,
      tempUri: 'cache://a.jpg',
      date: '2026-10-01',
      pose: 'frente',
      now: 10,
    });
    expect(row).toMatchObject({
      date: '2026-10-01',
      pose: 'frente',
      uri: '2026-10-01-frente-10.jpg',
    });
    expect(files.get(row.uri)).toBe('AAA');
    expect(cache['cache://a.jpg']).toBeUndefined();
    expect(await repos.photos.all()).toEqual([row]);
  });

  it('a retake replaces the photo of the same day and pose (row and file)', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'AAA', 'cache://b.jpg': 'BBB' });
    const first = await savePhoto({
      fs,
      photos: repos.photos,
      tempUri: 'cache://a.jpg',
      date: '2026-10-01',
      pose: 'frente',
      now: 10,
    });
    const second = await savePhoto({
      fs,
      photos: repos.photos,
      tempUri: 'cache://b.jpg',
      date: '2026-10-01',
      pose: 'frente',
      now: 20,
    });
    expect([...files.keys()]).toEqual([second.uri]);
    expect((await repos.photos.all()).map((photo) => photo.id)).toEqual([second.id]);
    expect(first.id).not.toBe(second.id);
  });

  it('keeps the old photo when the new capture cannot be stored', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'AAA' });
    await savePhoto({
      fs,
      photos: repos.photos,
      tempUri: 'cache://a.jpg',
      date: '2026-10-01',
      pose: 'frente',
      now: 10,
    });
    await expect(
      savePhoto({
        fs,
        photos: repos.photos,
        tempUri: 'cache://missing.jpg',
        date: '2026-10-01',
        pose: 'frente',
        now: 20,
      }),
    ).rejects.toThrow();
    expect(files.size).toBe(1);
    expect(await repos.photos.all()).toHaveLength(1);
  });

  it('removes the new file again if the row cannot be inserted', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'AAA' });
    const failing = {
      ...repos.photos,
      add: async () => {
        throw new Error('db');
      },
    };
    await expect(
      savePhoto({
        fs,
        photos: failing,
        tempUri: 'cache://a.jpg',
        date: '2026-10-01',
        pose: 'frente',
        now: 10,
      }),
    ).rejects.toThrow('db');
    expect(files.size).toBe(0);
  });

  it('deleting a photo deletes the file too', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'AAA' });
    const row = await savePhoto({
      fs,
      photos: repos.photos,
      tempUri: 'cache://a.jpg',
      date: '2026-10-01',
      pose: 'frente',
      now: 10,
    });
    expect(await deletePhoto(fs, repos.photos, row.id)).toBe(true);
    expect(files.size).toBe(0);
    expect(await repos.photos.all()).toEqual([]);
    expect(await deletePhoto(fs, repos.photos, row.id)).toBe(false);
  });
});

describe('previousPhoto / sweepOrphanPhotos', () => {
  it('finds the latest earlier photo of the pose whose file still exists', async () => {
    const { fs, files } = fakeFs();
    for (const [date, pose, name] of [
      ['2026-08-01', 'frente', 'a.jpg'],
      ['2026-09-01', 'frente', 'b.jpg'],
      ['2026-09-01', 'perfil', 'c.jpg'],
      ['2026-10-01', 'frente', 'd.jpg'],
    ] as const) {
      await repos.photos.add({ date, pose, uri: name });
      files.set(name, 'x');
    }
    expect((await previousPhoto(repos.photos, 'frente', '2026-10-01', fs))?.uri).toBe('b.jpg');
    files.delete('b.jpg');
    expect((await previousPhoto(repos.photos, 'frente', '2026-10-01', fs))?.uri).toBe('a.jpg');
    expect(await previousPhoto(repos.photos, 'espalda', '2026-10-01', fs)).toBeUndefined();
  });

  it('deletes files that no row points at', async () => {
    const { fs, files } = fakeFs();
    await repos.photos.add({ date: '2026-09-01', pose: 'frente', uri: 'keep.jpg' });
    files.set('keep.jpg', 'x');
    files.set('orphan.jpg', 'y');
    expect(await sweepOrphanPhotos(fs, repos.photos)).toBe(1);
    expect([...files.keys()]).toEqual(['keep.jpg']);
  });
});

describe('photo archive (separate export of the image files)', () => {
  it('plans parts by size, one oversized photo getting its own part', () => {
    const files = [
      { name: 'a.jpg', bytes: 3 },
      { name: 'b.jpg', bytes: 3 },
      { name: 'c.jpg', bytes: 3 },
    ];
    expect(base64Length(3)).toBe(4);
    expect(planParts(files, 8)).toEqual([['a.jpg', 'b.jpg'], ['c.jpg']]);
    expect(planParts(files, 1)).toEqual([['a.jpg'], ['b.jpg'], ['c.jpg']]);
    expect(planParts([], 8)).toEqual([]);
  });

  it('builds a part, parses it back and restores the files into another store', async () => {
    const source = fakeFs();
    source.files.set('2026-10-01-frente-5.jpg', 'QUJD');
    source.files.set('2026-10-01-perfil-6.jpg', 'REVG');
    const text = await buildPart(
      source.fs,
      ['2026-10-01-frente-5.jpg', '2026-10-01-perfil-6.jpg'],
      1,
      1,
    );
    const parsed = parsePart(text);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.part).toMatchObject({ format: PHOTO_ARCHIVE_FORMAT, part: 1, parts: 1 });

    const target = fakeFs();
    expect(restorePart(target.fs, parsed.part)).toBe(2);
    expect(target.files.get('2026-10-01-perfil-6.jpg')).toBe('REVG');
  });

  it('rejects other files, damaged parts and unsafe names', () => {
    expect(parsePart('{ nope')).toEqual({ ok: false, reason: 'invalidJson' });
    expect(parsePart(JSON.stringify({ format: 'pomi-backup' }))).toEqual({
      ok: false,
      reason: 'notPhotos',
    });
    expect(parsePart('[]')).toEqual({ ok: false, reason: 'notPhotos' });
    const base = { format: PHOTO_ARCHIVE_FORMAT, version: 1, part: 1, parts: 1 };
    expect(parsePart(JSON.stringify({ ...base, version: 2, files: [] }))).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(
      parsePart(JSON.stringify({ ...base, files: [{ name: '../evil.jpg', base64: 'QQ==' }] })),
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(parsePart(JSON.stringify({ ...base, files: [{ name: 'ok.jpg', base64: '' }] }))).toEqual(
      { ok: false, reason: 'invalid' },
    );
  });
});

describe('photo backup (export and import of the image files)', () => {
  async function withPhotos(files: Record<string, string>, fs: PhotoFs) {
    for (const [name, content] of Object.entries(files)) {
      await repos.photos.add({ date: name.slice(0, 10), pose: 'frente', uri: name });
      fs.writeBase64(name, content);
    }
  }

  it('shares every existing photo, in parts, sweeping old exports only before the first', async () => {
    const source = fakeFs();
    await withPhotos(
      { '2026-09-01-frente-1.jpg': 'QUJD', '2026-10-01-frente-2.jpg': 'REVG' },
      source.fs,
    );
    await repos.photos.add({ date: '2026-08-01', pose: 'frente', uri: 'gone.jpg' });
    const shared: { name: string; sweep: boolean; text: string }[] = [];
    const result = await exportPhotoArchive({
      fs: source.fs,
      photos: repos.photos,
      share: async (name, text, _title, options) => {
        shared.push({ name, sweep: options.sweep, text });
        return 'shared';
      },
      dialogTitle: 'Fotos',
      today: '2026-10-07',
      partBytes: 4,
    });
    expect(result).toEqual({ status: 'done', parts: 2, photos: 2 });
    expect(shared.map((entry) => [entry.name, entry.sweep])).toEqual([
      ['pomi-photos-2026-10-07-1-de-2.json', true],
      ['pomi-photos-2026-10-07-2-de-2.json', false],
    ]);
  });

  it('says so when there is nothing to export or sharing is unavailable', async () => {
    const empty = fakeFs();
    const share: ShareFile = async () => 'unavailable';
    expect(
      await exportPhotoArchive({
        fs: empty.fs,
        photos: repos.photos,
        share,
        dialogTitle: '',
        today: '2026-10-07',
      }),
    ).toEqual({ status: 'none' });
    await withPhotos({ '2026-09-01-frente-1.jpg': 'QUJD' }, empty.fs);
    expect(
      await exportPhotoArchive({
        fs: empty.fs,
        photos: repos.photos,
        share,
        dialogTitle: '',
        today: '2026-10-07',
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('restores only the files the restored rows point at', async () => {
    const source = fakeFs();
    await withPhotos(
      { '2026-09-01-frente-1.jpg': 'QUJD', '2026-10-01-frente-2.jpg': 'REVG' },
      source.fs,
    );
    const text = await buildPart(source.fs, source.fs.list(), 1, 1);

    // A new phone: rows restored from the JSON backup (only one of them), files missing.
    const target = fakeFs();
    await repos.photos.remove((await repos.photos.all())[0]!.id);
    expect(await importPhotoArchive({ fs: target.fs, photos: repos.photos, text })).toEqual({
      status: 'restored',
      restored: 1,
      part: 1,
      parts: 1,
    });
    expect(target.fs.list()).toHaveLength(1);

    // No rows at all: nothing matches, nothing is written.
    for (const row of await repos.photos.all()) await repos.photos.remove(row.id);
    const other = fakeFs();
    expect(await importPhotoArchive({ fs: other.fs, photos: repos.photos, text })).toEqual({
      status: 'noMatch',
    });
    expect(other.fs.list()).toEqual([]);
    expect(await importPhotoArchive({ fs: other.fs, photos: repos.photos, text: '{' })).toEqual({
      status: 'invalid',
      reason: 'invalidJson',
    });
  });
});
