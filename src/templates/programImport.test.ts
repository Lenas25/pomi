import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';

import gymJson from '../../templates/gym.json';
import habitosJson from '../../templates/habitos.json';

import { applyProgramImport, computeImportImpact, previewProgramImport } from './programImport';
import type { ModuleTemplate } from './schema';

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

describe('import impact preview', () => {
  async function stored() {
    const preview = previewProgramImport(trainerFile, new Set());
    if (!preview.ok) throw new Error('preview failed');
    await applyProgramImport(db, repos, preview.items, 'add');
    return preview.items[0]!.module;
  }

  function renameFirstStep(module: ModuleTemplate, newId: string): { module: ModuleTemplate; oldId: string } {
    const copy = JSON.parse(JSON.stringify(module)) as ModuleTemplate;
    const step = copy.programs![0]!.routines[0]!.steps[0]!;
    const oldId = step.id;
    for (const routine of copy.programs![0]!.routines) {
      for (const candidate of routine.steps) if (candidate.id === oldId) candidate.id = newId;
    }
    return { module: copy, oldId };
  }

  it('lists the exercises with history that the replacing program drops', async () => {
    const module = await stored();
    const { module: renamed, oldId } = renameFirstStep(module, 'paso-nuevo');
    const items = [{ module: renamed, programs: 1, routines: 1, exists: true }];
    const context = {
      modules: await repos.templates.listModules(),
      loggedStepIds: new Set([oldId]),
    };

    const replace = computeImportImpact(items, 'replace', context);
    expect(replace.losingHistory.map((step) => step.id)).toEqual([oldId]);
    expect(replace.losingHistory[0]?.name).not.toBe('');

    // `add` leaves the existing module alone, so nothing is lost and nothing is switched off.
    expect(computeImportImpact(items, 'add', context)).toEqual({
      losingHistory: [],
      deactivated: [],
    });
    // Steps without logged sets have no history to lose.
    expect(
      computeImportImpact(items, 'replace', { ...context, loggedStepIds: new Set() }).losingHistory,
    ).toEqual([]);
  });

  it('lists the other active modules with a program that would be switched off', async () => {
    const module = await stored();
    await repos.templates.saveModules([{ ...module, id: 'otro-gym', name: 'Otro' }], 'add');
    const context = {
      modules: await repos.templates.listModules(),
      loggedStepIds: new Set<string>(),
    };
    const fresh = { ...module, id: 'nuevo-gym', name: 'Nuevo' };
    const items = [{ module: fresh, programs: 1, routines: 1, exists: false }];
    const impact = computeImportImpact(items, 'add', context);
    expect(impact.deactivated.map((entry) => entry.id).sort()).toEqual(
      [module.id, 'otro-gym'].sort(),
    );
    // The module being replaced is not "switched off": it is saved and activated.
    const replacing = [{ module, programs: 1, routines: 1, exists: true }];
    expect(
      computeImportImpact(replacing, 'replace', context).deactivated.map((entry) => entry.id),
    ).toEqual(['otro-gym']);
  });
});
