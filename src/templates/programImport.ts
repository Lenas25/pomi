// Import of a gym program file (for example one a trainer wrote), PLAN §14. Reuses the template
// importer for validation; the screen shows the preview and then calls `applyProgramImport`.
import type { Repositories } from '../db/repositories';
import { withTransaction } from '../db/transaction';
import type { Db } from '../db/types';

import {
  importTemplateFromText,
  toModuleTemplates,
  type ImportError,
  type ImportResult,
} from './importer';
import type { ModuleTemplate } from './schema';

export type ProgramImportError = { kind: 'noProgram' } | { kind: 'field'; error: ImportError };

export type ProgramPreviewItem = {
  module: ModuleTemplate;
  programs: number;
  routines: number;
  /** A module with this id is already stored (replace overwrites it, add skips it). */
  exists: boolean;
};

export type ProgramPreview =
  | { ok: true; items: ProgramPreviewItem[] }
  | { ok: false; errors: ProgramImportError[] };

export type ImportMode = 'replace' | 'add';

function toPreview(result: ImportResult, existingIds: ReadonlySet<string>): ProgramPreview {
  if (!result.ok) {
    return { ok: false, errors: result.errors.map((error) => ({ kind: 'field', error })) };
  }
  const items = toModuleTemplates(result.template)
    .filter((module) => (module.programs?.length ?? 0) > 0)
    .map((module) => ({
      module,
      programs: module.programs?.length ?? 0,
      routines: (module.programs ?? []).reduce((sum, program) => sum + program.routines.length, 0),
      exists: existingIds.has(module.id),
    }));
  return items.length === 0
    ? { ok: false, errors: [{ kind: 'noProgram' }] }
    : { ok: true, items };
}

/** Validates the file text and lists what it would import. Pure. */
export function previewProgramImport(
  text: string,
  existingIds: ReadonlySet<string>,
): ProgramPreview {
  return toPreview(importTemplateFromText(text), existingIds);
}

/**
 * Stores the previewed modules in one transaction. The app trains ONE program (the first one of
 * the first active module), so the imported modules are activated and every other module that has
 * a program is switched off; a module skipped by `add` changes nothing.
 */
export async function applyProgramImport(
  db: Db,
  repos: Repositories,
  items: readonly ProgramPreviewItem[],
  mode: ImportMode,
): Promise<{ saved: string[]; skipped: string[] }> {
  return withTransaction(db, async (tx) => {
    const result = await repos.templates.saveModulesIn(
      tx,
      items.map((item) => item.module),
      mode,
    );
    if (result.saved.length > 0) {
      for (const stored of await repos.templates.listModules()) {
        const hasProgram = (stored.template.programs?.length ?? 0) > 0;
        if (result.saved.includes(stored.id)) await repos.templates.setActive(stored.id, true);
        else if (hasProgram && stored.active) await repos.templates.setActive(stored.id, false);
      }
    }
    return result;
  });
}
