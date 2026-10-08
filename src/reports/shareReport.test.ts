import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { isReportExportName, readPhotoSources, sharePdf } from './shareReport';

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
jest.mock('../photos/expoPhotoFs', () => ({
  expoPhotoFs: {
    exists: (name: string) => name !== 'missing.jpg',
    readBase64: async (name: string) =>
      name === 'broken.jpg' ? Promise.reject(new Error('x')) : 'QQ==',
  },
}));

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

  it('reads photos as data URIs and leaves out the missing or unreadable ones', async () => {
    expect(await readPhotoSources(['a.jpg', 'missing.jpg', 'broken.jpg'])).toEqual({
      'a.jpg': 'data:image/jpeg;base64,QQ==',
    });
  });
});
