// `npm run validate:templates [path]` runs THIS file (see scripts/validate-templates.js): every
// JSON under `templates/` (or the file / folder in TEMPLATES_PATH) must pass the template importer.
// It also runs with the normal test suite, so a broken shipped or community template fails CI.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from '@jest/globals';

import { setLanguage, t } from '../i18n';

import { coverageProblems } from '../domain/generator/library';

import { describeImportError } from './describeError';
import { parseExerciseLibrary } from './exercises';
import { importTemplateFromText } from './importer';
import { describeNotificationProblem, notificationTextProblems } from './notificationLimits';

const ROOT = resolve(__dirname, '../..');
const TARGET = resolve(ROOT, process.env.TEMPLATES_PATH ?? 'templates');

function jsonFilesIn(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    if (entry.isDirectory()) return jsonFilesIn(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });
}

function isExerciseLibrary(text: string): boolean {
  try {
    return (JSON.parse(text) as { kind?: unknown }).kind === 'exercises';
  } catch {
    return false;
  }
}

describe('template files', () => {
  beforeAll(() => {
    setLanguage('es');
  });

  const files = jsonFilesIn(TARGET);

  it('finds at least one template', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [relative(ROOT, file), file]))('%s is valid', (_name, file) => {
    const text = readFileSync(file as string, 'utf8');
    // The exercise library (routine generator) is data of its own kind, with its own schema.
    if (isExerciseLibrary(text)) {
      const library = parseExerciseLibrary(JSON.parse(text));
      expect(library.ok ? coverageProblems(library.library) : library.problems).toEqual([]);
      return;
    }
    const result = importTemplateFromText(text);
    const problems = result.ok
      ? notificationTextProblems(JSON.parse(text)).map((problem) =>
          `${problem.path}: ${describeNotificationProblem(problem, t)}`,
        )
      : result.errors.map((error) => `${error.path || '(file)'}: ${describeImportError(error, t)}`);
    expect(problems).toEqual([]);
  });
});
