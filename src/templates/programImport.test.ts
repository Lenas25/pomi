import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';

import gymJson from '../../templates/gym.json';
import habitosJson from '../../templates/habitos.json';

import { applyProgramImport, previewProgramImport } from './programImport';

let db: Db;
let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(test.db);
});
afterEach(() => close());

const trainerFile = JSON.stringify(gymJson);

describe('gym program import', () => {
  it('previews the programs of a valid file and whether they already exist', () => {
    const fresh = previewProgramImport(trainerFile, new Set());
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.items[0]).toMatchObject({ exists: false, programs: 1 });
    expect(fresh.items[0]?.routines).toBeGreaterThan(0);

    const id = fresh.items[0]?.module.id ?? '';
    const known = previewProgramImport(trainerFile, new Set([id]));
    expect(known.ok && known.items[0]?.exists).toBe(true);
  });

  it('reports plain errors with the path, and a file without programs', () => {
    const broken = JSON.parse(trainerFile) as { programs: { routines: { name?: string }[] }[] };
    delete broken.programs[0]!.routines[0]!.name;
    const result = previewProgramImport(JSON.stringify(broken), new Set());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ kind: 'field', error: { code: 'missing' } });
      expect(result.errors[0]?.kind === 'field' && result.errors[0].error.path).toContain(
        'programs[0].routines[0].name',
      );
    }
    expect(previewProgramImport(JSON.stringify(habitosJson), new Set())).toMatchObject({
      ok: false,
      errors: [{ kind: 'noProgram' }],
    });
    expect(previewProgramImport('{ nope', new Set()).ok).toBe(false);
  });

  it('adds without touching existing modules, or replaces them', async () => {
    const preview = previewProgramImport(trainerFile, new Set());
    if (!preview.ok) throw new Error('preview failed');
    const first = await applyProgramImport(db, repos, preview.items, 'add');
    expect(first.saved).toHaveLength(1);
    const again = await applyProgramImport(db, repos, preview.items, 'add');
    expect(again).toEqual({ saved: [], skipped: first.saved });
    const replaced = await applyProgramImport(db, repos, preview.items, 'replace');
    expect(replaced.saved).toEqual(first.saved);
  });

  it('activates the imported program and switches off other programs', async () => {
    const preview = previewProgramImport(trainerFile, new Set());
    if (!preview.ok) throw new Error('preview failed');
    const other = { ...preview.items[0]!.module, id: 'otro-gym', name: 'Otro' };
    await repos.templates.saveModules([other], 'add');
    await applyProgramImport(db, repos, preview.items, 'add');
    const modules = await repos.templates.listModules();
    expect(modules.find((m) => m.id === 'otro-gym')?.active).toBe(false);
    expect(modules.find((m) => m.id === preview.items[0]!.module.id)?.active).toBe(true);
  });
});
