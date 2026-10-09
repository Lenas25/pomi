import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') && !name.includes('.test.') ? [path] : [];
  });
}

describe('scroll indicators', () => {
  it('every ScrollView / FlatList / SectionList spreads hiddenScrollIndicators first', () => {
    const missing: string[] = [];
    for (const file of [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'app'))]) {
      const text = readFileSync(file, 'utf8');
      const tag = /(?<!\w)<(?:Animated\.)?(ScrollView|FlatList|SectionList)(?=[\s>])([\s\S]*?)>/g;
      for (const match of text.matchAll(tag)) {
        const props = match[2] ?? '';
        if (!props.trimStart().startsWith('{...hiddenScrollIndicators}')) {
          missing.push(`${file.slice(ROOT.length + 1)}: ${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
