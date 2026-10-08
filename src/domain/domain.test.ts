import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  MINUTES_PER_DAY,
  clockToMinutes,
  forwardMinutes,
  minutesToClock,
  wrapMinutes,
} from './time';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('src/domain stays pure', () => {
  const forbidden =
    /from\s+['"](react|react-native|expo[^'"]*|drizzle-orm[^'"]*|@expo[^'"]*|\.\.\/db[^'"]*|\.\.\/\.\.\/db[^'"]*)['"]/;

  it.each(sourceFiles(__dirname))('has no React, Expo or database imports: %s', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(forbidden);
  });
});

describe('time helpers', () => {
  it('converts clocks and minutes both ways', () => {
    expect(clockToMinutes('05:10')).toBe(310);
    expect(minutesToClock(310)).toBe('05:10');
    expect(minutesToClock(0)).toBe('00:00');
  });

  it('wraps across midnight in both directions', () => {
    expect(wrapMinutes(-30)).toBe(MINUTES_PER_DAY - 30);
    expect(minutesToClock(25 * 60)).toBe('01:00');
    expect(minutesToClock(-60)).toBe('23:00');
  });

  it('measures forward distance', () => {
    expect(forwardMinutes('23:00', '06:30')).toBe(450);
    expect(forwardMinutes('06:30', '23:00')).toBe(990);
    expect(forwardMinutes('10:00', '10:00')).toBe(0);
  });

  it('rejects malformed clocks', () => {
    for (const bad of ['5:10', '24:00', '12:60', 'abc', '']) {
      expect(() => clockToMinutes(bad)).toThrow(RangeError);
    }
  });
});
