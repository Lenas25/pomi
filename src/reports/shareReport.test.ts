import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  collectPhotoSources,
  isReportExportName,
  REPORT_PHOTO_WIDTH,
  sharePdf,
  type PhotoSourceIo,
} from './shareReport';

// Names must start with `mock` to be used inside the hoisted factories.
const mockFiles = new Map<string, { deleted: boolean }>();
const mockCalls: string[] = [];
let mockAvailable = true;
let mockShareFails = false;

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    name: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : 'cache')).join('/');
      this.name = this.uri.split('/').at(-1) ?? '';
      if (!mockFiles.has(this.uri)) mockFiles.set(this.uri, { deleted: false });
    }
    async move(destination: MockFile) {
      mockCalls.push(`move:${this.uri}->${destination.uri}`);
      this.uri = destination.uri;
      this.name = destination.name;
      mockFiles.set(this.uri, { deleted: false });
    }
    delete() {
      mockCalls.push(`delete:${this.uri}`);
      const entry = mockFiles.get(this.uri);
      if (entry) entry.deleted = true;
    }
  }
  class MockDirectory {
    list() {
      return [new MockFile('cache', 'pomi-report-old.pdf'), new MockFile('cache', 'other.txt')];
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: 'cache', document: 'doc' } };
});
jest.mock('expo-print', () => ({
  printToFileAsync: async () => {
    mockCalls.push('print');
    return { uri: 'file:///cache/Print/random.pdf', numberOfPages: 1 };
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => mockAvailable,
  shareAsync: async (uri: string, options: object) => {
    mockCalls.push(`share:${uri}:${JSON.stringify(options)}`);
    if (mockShareFails) throw new Error('no target');
  },
}));
jest.mock('../photos/expoPhotoFs', () => ({ expoPhotoFs: {} }));
jest.mock('../photos/imageResize', () => ({ resizeToJpeg: async () => 'cache://unused.jpg' }));

beforeEach(() => {
  jest.useFakeTimers();
  mockFiles.clear();
  mockCalls.length = 0;
  mockAvailable = true;
  mockShareFails = false;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('sharePdf', () => {
  it('says unavailable without printing anything when the phone cannot share', async () => {
    mockAvailable = false;
    expect(await sharePdf('<html></html>', 'pomi-report-x.pdf', 'Title')).toBe('unavailable');
    expect(mockCalls).toEqual([]);
  });

  it('prints, renames, shares as a PDF, sweeps the old ones and deletes after the grace period', async () => {
    expect(await sharePdf('<html></html>', 'pomi-report-x.pdf', 'Title')).toBe('shared');
    expect(mockCalls[0]).toBe('delete:cache/pomi-report-old.pdf'); // stale report first
    expect(mockCalls).toContain('print');
    expect(mockCalls.some((call) => call.startsWith('move:file:///cache/Print/random.pdf->'))).toBe(
      true,
    );
    expect(mockCalls.some((call) => call.includes('"mimeType":"application/pdf"'))).toBe(true);
    expect(mockCalls.some((call) => call.startsWith('delete:cache/pomi-report-x.pdf'))).toBe(false);
    jest.advanceTimersByTime(60_000);
    expect(mockCalls.some((call) => call.startsWith('delete:cache/pomi-report-x.pdf'))).toBe(true);
  });

  it('deletes the file right away when sharing fails', async () => {
    mockShareFails = true;
    await expect(sharePdf('<html></html>', 'pomi-report-x.pdf', 'Title')).rejects.toThrow(
      'no target',
    );
    expect(mockCalls.some((call) => call.startsWith('delete:cache/pomi-report-x.pdf'))).toBe(true);
  });
});

describe('helpers', () => {
  it('recognises only its own report files', () => {
    expect(isReportExportName('pomi-report-2026-10-06-0900.pdf')).toBe(true);
    expect(isReportExportName('pomi-backup-2026.json')).toBe(false);
    expect(isReportExportName('pomi-report-x.json')).toBe(false);
  });
});

describe('collectPhotoSources', () => {
  function fakeIo(overrides: Partial<PhotoSourceIo> = {}) {
    const resized: [string, number][] = [];
    const discarded: string[] = [];
    const io: PhotoSourceIo = {
      exists: (name) => name !== 'missing.jpg',
      uriOf: (name) => `file:///photos/${name}`,
      resize: async (uri, width) => {
        resized.push([uri, width]);
        return `cache://resized-${resized.length}.jpg`;
      },
      readBase64: async (uri) =>
        uri.includes('resized-2') ? Promise.reject(new Error('x')) : 'QQ==',
      discard: (uri) => void discarded.push(uri),
      ...overrides,
    };
    return { io, resized, discarded };
  }

  it('downscales each photo to ~1000 px, embeds it and deletes the temp copy', async () => {
    const { io, resized, discarded } = fakeIo();
    const result = await collectPhotoSources(['a.jpg', 'missing.jpg', 'b.jpg', 'c.jpg'], io);
    expect(REPORT_PHOTO_WIDTH).toBe(1000);
    expect(resized).toEqual([
      ['file:///photos/a.jpg', 1000],
      ['file:///photos/b.jpg', 1000],
      ['file:///photos/c.jpg', 1000],
    ]);
    // b's copy could not be read: left out, but its temp copy is still removed.
    expect(result).toEqual({
      sources: {
        'a.jpg': 'data:image/jpeg;base64,QQ==',
        'c.jpg': 'data:image/jpeg;base64,QQ==',
      },
      dropped: 2,
    });
    expect(discarded).toEqual([
      'cache://resized-1.jpg',
      'cache://resized-2.jpg',
      'cache://resized-3.jpg',
    ]);
  });

  it('keeps the total byte cap and reports the photos left out', async () => {
    const { io, discarded } = fakeIo({ readBase64: async () => 'A'.repeat(3_000_000) });
    const result = await collectPhotoSources(['a.jpg', 'b.jpg'], io);
    expect(Object.keys(result.sources)).toEqual(['a.jpg']);
    expect(result.dropped).toBe(1);
    expect(discarded).toHaveLength(2);
  });
});
