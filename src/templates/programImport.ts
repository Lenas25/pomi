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

/** What an import would change besides the stored modules themselves. */
export type ImportImpact = {
  /** Exercises with logged history whose step id is missing from the replacing program. */
  losingHistory: { id: string; name: string }[];
  /** Other active modules with a program that the import switches off. */
  deactivated: { id: string; name: string }[];
};

/** What the import needs to know about the current data (loaded by the screen, pure here). */
export type ImportContext = {
  modules: readonly { id: string; name: string; active: boolean; template: ModuleTemplate }[];
  /** Step ids that have logged sets. */
  loggedStepIds: ReadonlySet<string>;
};

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

function stepsOf(module: ModuleTemplate): Map<string, string> {
  const steps = new Map<string, string>();
  for (const program of module.programs ?? []) {
    for (const routine of program.routines) {
      for (const step of routine.steps) steps.set(step.id, step.name);
    }
  }
  return steps;
}

/** The items `mode` actually stores: `add` skips modules that already exist. */
function storedItems(items: readonly ProgramPreviewItem[], mode: ImportMode) {
  return mode === 'add' ? items.filter((item) => !item.exists) : items;
}

/**
 * Lists the side effects of an import for the preview: which exercises stop showing their history
 * (replacing a module whose steps no longer exist in the new one: the history key is the step id)
 * and which other modules are switched off (the app trains one program). Pure.
 */
export function computeImportImpact(
  items: readonly ProgramPreviewItem[],
  mode: ImportMode,
  context: ImportContext,
): ImportImpact {
  const stored = storedItems(items, mode);
  const savedIds = new Set(stored.map((item) => item.module.id));

  const losing = new Map<string, string>();
  if (mode === 'replace') {
    for (const item of stored) {
      const previous = context.modules.find((module) => module.id === item.module.id);
      if (!previous) continue;
      const next = stepsOf(item.module);
      for (const [id, name] of stepsOf(previous.template)) {
        if (context.loggedStepIds.has(id) && !next.has(id)) losing.set(id, name);
      }
    }
  }

  const deactivated =
    stored.length === 0
      ? []
      : context.modules
          .filter(
            (module) =>
              module.active && !savedIds.has(module.id) && (module.template.programs?.length ?? 0) > 0,
          )
          .map((module) => ({ id: module.id, name: module.name }));

  return {
    losingHistory: [...losing].map(([id, name]) => ({ id, name })),
    deactivated,
  };
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
      // Only the `...In(tx)` forms inside the transaction callback.
      for (const stored of await repos.templates.listModulesIn(tx)) {
        const hasProgram = (stored.template.programs?.length ?? 0) > 0;
        if (result.saved.includes(stored.id)) {
          await repos.templates.setActiveIn(tx, stored.id, true);
        } else if (hasProgram && stored.active) {
          await repos.templates.setActiveIn(tx, stored.id, false);
        }
      }
    }
    return result;
  });
}
