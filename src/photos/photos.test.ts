import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { MAX_BACKUP_BYTES } from '../backup/limits';
import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';

import { appendPage, cursorOf, withoutRows } from './photoPaging';
import {
  base64Length,
  buildPart,
  isValidPhotoBase64,
  parsePart,
  planParts,
  restorePart,
  MAX_PHOTO_PART_BYTES,
  PHOTO_ARCHIVE_FORMAT,
  PHOTO_PART_BYTES,
} from './photoArchive';
import { exportPhotoArchive, importPhotoArchive, type ShareFile } from './photoBackup';
import {
  deleteAllPhotos,
  deletePhoto,
  ensureThumbnail,
  isSafePhotoName,
  photoFileName,
  previousPhoto,
  savePhoto,
  sweepOrphanPhotos,
  thumbnailName,
  withPhotoLock,
  type PhotoFs,
} from './photoStore';

/** Valid base64 that starts like a JPEG. */
const JPEG_A = '/9j/QUJD';
const JPEG_B = '/9j/REVG';

/** In-memory file system: the "cache" holds captures, `files` is the private photo folder. */
function fakeFs(cache: Record<string, string> = {}, opts: { failThumbnails?: boolean } = {}) {
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
    writeBase64: async (name, base64) => void files.set(name, base64),
    discard: (uri) => void delete cache[uri],
    makeThumbnail: async (name, thumbName) => {
      if (opts.failThumbnails) throw new Error('no thumbnail');
      if (!files.has(name)) throw new Error('no photo');
      files.set(thumbName, `thumb of ${files.get(name)}`);
    },
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
    expect([...files.keys()].sort()).toEqual([second.uri, thumbnailName(second.uri)].sort());
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
    expect(files.size).toBe(2);
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

describe('deletePhoto order and deleteAllPhotos', () => {
  it('removes the file first and keeps the row when the file cannot be removed', async () => {
    const { fs, files } = fakeFs();
    await repos.photos.add({ date: '2026-09-01', pose: 'frente', uri: 'a.jpg' });
    files.set('a.jpg', 'x');
    const stuck: PhotoFs = {
      ...fs,
      remove: () => {
        throw new Error('locked');
      },
    };
    const [row] = await repos.photos.all();
    await expect(deletePhoto(stuck, repos.photos, row!.id)).rejects.toThrow('locked');
    expect(await repos.photos.all()).toHaveLength(1);
    expect(files.has('a.jpg')).toBe(true);
  });

  it('deletes every file in the store and every row', async () => {
    const { fs, files } = fakeFs();
    await repos.photos.add({ date: '2026-09-01', pose: 'frente', uri: 'a.jpg' });
    await repos.photos.add({ date: '2026-09-02', pose: 'perfil', uri: 'b.jpg' });
    files.set('a.jpg', 'x');
    files.set('b.jpg', 'y');
    files.set('stray.jpg', 'z');
    files.set('thumb-a.jpg', 't');
    expect(await deleteAllPhotos(fs, repos.photos)).toEqual({ total: 2, deleted: 2, failed: 0 });
    expect(files.size).toBe(0);
    expect(await repos.photos.all()).toEqual([]);
  });

  it('keeps the rows whose file cannot be removed and deletes the rest', async () => {
    const { fs, files } = fakeFs();
    for (const name of ['a.jpg', 'b.jpg', 'c.jpg']) {
      await repos.photos.add({ date: '2026-09-01', pose: name, uri: name });
      files.set(name, 'x');
    }
    const flaky: PhotoFs = {
      ...fs,
      remove: (name) => {
        if (name === 'b.jpg') throw new Error('locked');
        fs.remove(name);
      },
    };
    expect(await deleteAllPhotos(flaky, repos.photos)).toEqual({ total: 3, deleted: 2, failed: 1 });
    expect((await repos.photos.all()).map((row) => row.uri)).toEqual(['b.jpg']);
    expect([...files.keys()]).toEqual(['b.jpg']);
  });

  it('keeps a row whose file is still there after the remove call', async () => {
    const { fs, files } = fakeFs();
    await repos.photos.add({ date: '2026-09-01', pose: 'frente', uri: 'a.jpg' });
    files.set('a.jpg', 'x');
    const ghost: PhotoFs = { ...fs, remove: () => undefined };
    expect(await deleteAllPhotos(ghost, repos.photos)).toEqual({ total: 1, deleted: 0, failed: 1 });
    expect(await repos.photos.count()).toBe(1);
  });

  it('pages the photos newest first', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await repos.photos.add({ date: `2026-09-0${day}`, pose: 'frente', uri: `p${day}.jpg` });
    }
    expect(await repos.photos.count()).toBe(5);
    expect((await repos.photos.page(2, 0)).map((row) => row.uri)).toEqual(['p5.jpg', 'p4.jpg']);
    expect((await repos.photos.page(2, 4)).map((row) => row.uri)).toEqual(['p1.jpg']);
  });
});

describe('keyset paging', () => {
  it('pages by (date, id) without skipping or repeating after a delete', async () => {
    for (let day = 1; day <= 5; day += 1) {
      await repos.photos.add({ date: `2026-09-0${day}`, pose: 'frente', uri: `p${day}.jpg` });
    }
    await repos.photos.add({ date: '2026-09-05', pose: 'perfil', uri: 'p5b.jpg' });
    const first = await repos.photos.pageAfter(3);
    expect(first.map((row) => row.uri)).toEqual(['p5b.jpg', 'p5.jpg', 'p4.jpg']);
    await repos.photos.remove(first[0]!.id);
    const second = await repos.photos.pageAfter(3, cursorOf(first));
    expect(second.map((row) => row.uri)).toEqual(['p3.jpg', 'p2.jpg', 'p1.jpg']);
    expect(await repos.photos.pageAfter(3, cursorOf(second))).toEqual([]);
  });

  it('cursor and list helpers', () => {
    const row = (id: number, date: string) => ({ id, date, pose: 'f', uri: `${id}.jpg` });
    expect(cursorOf([])).toBeUndefined();
    expect(cursorOf([row(2, '2026-09-02'), row(1, '2026-09-01')])).toEqual({
      date: '2026-09-01',
      id: 1,
    });
    expect(appendPage([row(2, 'a')], [row(2, 'a'), row(1, 'b')]).map((r) => r.id)).toEqual([2, 1]);
    expect(withoutRows([row(2, 'a'), row(1, 'b')], [2]).map((r) => r.id)).toEqual([1]);
  });
});

describe('thumbnails', () => {
  it('writes a thumbnail with the photo and removes both on delete', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'AAA' });
    const row = await savePhoto({
      fs,
      photos: repos.photos,
      tempUri: 'cache://a.jpg',
      date: '2026-09-01',
      pose: 'frente',
      now: 1,
    });
    expect(files.has(thumbnailName(row.uri))).toBe(true);
    await deletePhoto(fs, repos.photos, row.id);
    expect(files.size).toBe(0);
  });

  it('saves the photo even when the thumbnail fails, then backfills it lazily', async () => {
    const failing = fakeFs({ 'cache://a.jpg': 'AAA' }, { failThumbnails: true });
    const row = await savePhoto({
      fs: failing.fs,
      photos: repos.photos,
      tempUri: 'cache://a.jpg',
      date: '2026-09-01',
      pose: 'frente',
      now: 2,
    });
    expect([...failing.files.keys()]).toEqual([row.uri]);
    expect(await ensureThumbnail(failing.fs, row.uri)).toBe(false);

    const { fs, files } = fakeFs();
    files.set('old.jpg', 'x');
    expect(await ensureThumbnail(fs, 'old.jpg')).toBe(true);
    expect(files.has('thumb-old.jpg')).toBe(true);
    expect(await ensureThumbnail(fs, 'missing.jpg')).toBe(false);
  });

  it('a retake removes the earlier thumbnail and the sweep keeps used thumbnails', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'A', 'cache://b.jpg': 'B' });
    const input = { fs, photos: repos.photos, date: '2026-09-01', pose: 'frente' };
    const first = await savePhoto({ ...input, tempUri: 'cache://a.jpg', now: 1 });
    const second = await savePhoto({ ...input, tempUri: 'cache://b.jpg', now: 2 });
    expect([...files.keys()].sort()).toEqual([second.uri, thumbnailName(second.uri)].sort());
    files.set(thumbnailName(first.uri), 'orphan thumb');
    files.set('stray.jpg', 'z');
    expect(await sweepOrphanPhotos(fs, repos.photos)).toBe(2);
    expect(files.has(thumbnailName(second.uri))).toBe(true);
  });
});

describe('withPhotoLock', () => {
  it('rejects a reentrant call in development', async () => {
    await expect(withPhotoLock(async () => withPhotoLock(async () => 1))).rejects.toThrow(
      'deadlock',
    );
    // The lock still works afterwards.
    await expect(withPhotoLock(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('previousPhoto / sweepOrphanPhotos', () => {
  it('a sweep started while a photo is being saved does not delete the new file', async () => {
    const { fs, files } = fakeFs({ 'cache://a.jpg': 'AAA' });
    // The row insert is slow: without the lock the sweep would run in this gap.
    const slow = {
      ...repos.photos,
      add: async (input: Parameters<typeof repos.photos.add>[0]) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return repos.photos.add(input);
      },
    };
    const saving = savePhoto({
      fs,
      photos: slow,
      tempUri: 'cache://a.jpg',
      date: '2026-10-01',
      pose: 'frente',
      now: 10,
    });
    const sweeping = sweepOrphanPhotos(fs, repos.photos);
    await Promise.all([saving, sweeping]);
    expect(files.has('2026-10-01-frente-10.jpg')).toBe(true);
    expect(await repos.photos.all()).toHaveLength(1);
  });

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
  it('keeps parts small (about 5 MB) with a lower import cap than a full backup', () => {
    expect(PHOTO_PART_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_PHOTO_PART_BYTES).toBeGreaterThan(PHOTO_PART_BYTES);
    expect(MAX_PHOTO_PART_BYTES).toBeLessThan(MAX_BACKUP_BYTES);
  });

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
    source.files.set('2026-10-01-frente-5.jpg', JPEG_A);
    source.files.set('2026-10-01-perfil-6.jpg', JPEG_B);
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
    expect(await restorePart(target.fs, parsed.part)).toEqual({ restored: 2, failed: 0 });
    expect(target.files.get('2026-10-01-perfil-6.jpg')).toBe(JPEG_B);
  });

  it('validates base64 and the JPEG signature', () => {
    expect(isValidPhotoBase64(JPEG_A)).toBe(true);
    for (const bad of ['', 'QUJD', '/9j/QUJ', '/9j/QU*D', '/9j/=QUJ', 'not base64 at all']) {
      expect(isValidPhotoBase64(bad)).toBe(false);
    }
  });

  it('restores file by file: a bad or unwritable file is counted, the rest still land', async () => {
    const target = fakeFs();
    const flaky: PhotoFs = {
      ...target.fs,
      writeBase64: async (name, base64) => {
        if (name === 'b.jpg') throw new Error('disk full');
        await target.fs.writeBase64(name, base64);
      },
    };
    const part = {
      format: PHOTO_ARCHIVE_FORMAT as typeof PHOTO_ARCHIVE_FORMAT,
      version: 1 as const,
      part: 1,
      parts: 1,
      files: [
        { name: 'a.jpg', base64: JPEG_A },
        { name: 'b.jpg', base64: JPEG_B },
        { name: 'c.jpg', base64: '***' },
        { name: 'd.jpg', base64: JPEG_B },
      ],
    };
    expect(await restorePart(flaky, part)).toEqual({ restored: 2, failed: 2 });
    expect(target.fs.list().sort()).toEqual(['a.jpg', 'd.jpg']);
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
      await fs.writeBase64(name, content);
    }
  }

  it('shares every existing photo, in parts, sweeping old exports only before the first', async () => {
    const source = fakeFs();
    await withPhotos(
      { '2026-09-01-frente-1.jpg': JPEG_A, '2026-10-01-frente-2.jpg': JPEG_B },
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
    await withPhotos({ '2026-09-01-frente-1.jpg': JPEG_A }, empty.fs);
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
      { '2026-09-01-frente-1.jpg': JPEG_A, '2026-10-01-frente-2.jpg': JPEG_B },
      source.fs,
    );
    const text = await buildPart(source.fs, source.fs.list(), 1, 1);

    // A new phone: rows restored from the JSON backup (only one of them), files missing.
    const target = fakeFs();
    await repos.photos.remove((await repos.photos.all())[0]!.id);
    expect(await importPhotoArchive({ fs: target.fs, photos: repos.photos, text })).toEqual({
      status: 'restored',
      restored: 1,
      failed: 0,
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
