import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

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

// Every module specifier in a file: `from 'x'`, bare `import 'x'`, `require('x')`, `import('x')`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const FORBIDDEN_BARE =
  /^(react($|\/)|react-native|@react-native|react-[^/]+|expo($|[-/])|@expo|drizzle-orm|zustand|expo-)/;
// Relative imports may only stay inside the domain (or take the template schema and the pure
// localized-text helpers, `templates/localized`).
const ALLOWED_RELATIVE_TARGET = /(^|\/)(domain|templates\/schema|templates\/localized)(\/|$)/;

function specifiersOf(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].flatMap((m) => (m[1] ? [m[1]] : []));
}

function violation(file: string, specifier: string): string | null {
  if (specifier.startsWith('.')) {
    const target = relative(srcRoot, resolve(dirname(file), specifier))
      .split(sep)
      .join('/');
    return ALLOWED_RELATIVE_TARGET.test(target) || target === 'templates/schema'
      ? null
      : `relative import leaves the domain: ${specifier}`;
  }
  if (FORBIDDEN_BARE.test(specifier)) return `forbidden package: ${specifier}`;
  return null;
}

const srcRoot = join(__dirname, '..');

describe('src/domain stays pure', () => {
  it.each(sourceFiles(__dirname))('has no React, Expo, database or UI imports: %s', (file) => {
    const problems = specifiersOf(file).flatMap((spec) => violation(file, spec) ?? []);
    expect(problems).toEqual([]);
  });

  it('detects every import form', () => {
    const forms = [
      "import x from 'react-native-svg';",
      "import 'expo-haptics';",
      "const a = require('react');",
      "const b = await import('../db/client');",
      "export { y } from 'drizzle-orm/sqlite-core';",
    ];
    for (const form of forms) {
      const spec = [...form.matchAll(SPECIFIER)][0]?.[1] ?? '';
      expect(violation(join(__dirname, 'x.ts'), spec)).not.toBeNull();
    }
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
