// Repos -> the editor and back. Saving goes through the SAME path as importing a trainer program:
// the edited module is validated by the template schema and stored by `applyProgramImport` (one
// transaction), so a failure never leaves a half-saved program.
import type { Repositories } from '../db/repositories';
import type { Db } from '../db/types';
import { validateProgram, type EditorIssue, type Program } from '../domain/editor';
import { requestNotificationSync } from '../notifications/sync';
import { importTemplate, toModuleTemplates, type ImportError } from '../templates/importer';
import {
  applyProgramImport,
  computeImportImpact,
  type ImportContext,
  type ImportImpact,
  type ProgramPreviewItem,
} from '../templates/programImport';
import type { ModuleTemplate } from '../templates/schema';

export type EditorSource = {
  /** The stored module the trained program belongs to; everything but the program is kept. */
  module: ModuleTemplate;
  /** When the stored module was last written, at load time: the baseline of the stale check. */
  moduleImportedAt: number;
  program: Program;
  context: ImportContext;
  /**
   * A generated proposal not stored yet ("Ajustar" in the routine creator): no stale check, and
   * saving it is what makes it the active program.
   */
  draft?: boolean;
};

/** The program the app trains: the first one of the first active module (as `pickProgram`). */
export async function loadEditorSource(repos: Repositories): Promise<EditorSource | null> {
  const [modules, logged] = await Promise.all([
    repos.templates.listModules(),
    repos.workouts.loggedStepIds(),
  ]);
  const owner = modules.find(
    (stored) => stored.active && (stored.template.programs?.length ?? 0) > 0,
  );
  const program = owner?.template.programs?.[0];
  if (!owner || !program) return null;
  return {
    module: owner.template,
    moduleImportedAt: owner.importedAt,
    program,
    context: { modules, loggedStepIds: new Set(logged) },
  };
}

/**
 * The stored module was written (import, generator, another save) after this edit started.
 * Saving would silently overwrite it, so the screen blocks and offers a reload.
 */
export async function isSourceStale(repos: Repositories, source: EditorSource): Promise<boolean> {
  if (source.draft) return false;
  const modules = await repos.templates.listModules();
  const current = modules.find((stored) => stored.id === source.module.id);
  return !current || current.importedAt !== source.moduleImportedAt;
}

/** "Rutina › Paso" for an import error path like `programs[0].routines[1].steps[3].reps`. */
export function importErrorLocation(path: string, program: Program): string | null {
  const routine = program.routines[Number(/routines\[(\d+)\]/.exec(path)?.[1] ?? Number.NaN)];
  const step = routine?.steps[Number(/steps\[(\d+)\]/.exec(path)?.[1] ?? Number.NaN)];
  const names = [routine?.name, step?.name].filter(Boolean);
  return names.length > 0 ? names.join(' › ') : null;
}

/** The module in the template file format with the edited program in place of the original. */
export function editedModuleJson(source: EditorSource, program: Program): Record<string, unknown> {
  const [, ...others] = source.module.programs ?? [];
  return { ...source.module, programs: [program, ...others] };
}

export type PreparedSave =
  | { ok: true; items: ProgramPreviewItem[]; impact: ImportImpact }
  | { ok: false; issues: EditorIssue[]; importErrors: ImportError[] };

/** Editor rules first, then the template schema (the importer) as the last word. */
export function prepareSave(source: EditorSource, program: Program): PreparedSave {
  const issues = validateProgram(program);
  if (issues.length > 0) return { ok: false, issues, importErrors: [] };
  const imported = importTemplate(editedModuleJson(source, program));
  if (!imported.ok) return { ok: false, issues: [], importErrors: imported.errors };
  const items: ProgramPreviewItem[] = toModuleTemplates(imported.template).map((module) => ({
    module,
    programs: module.programs?.length ?? 0,
    routines: (module.programs ?? []).reduce((sum, p) => sum + p.routines.length, 0),
    exists: true,
  }));
  return { ok: true, items, impact: computeImportImpact(items, 'replace', source.context) };
}

export async function saveEdited(
  db: Db,
  repos: Repositories,
  items: readonly ProgramPreviewItem[],
): Promise<void> {
  await applyProgramImport(db, repos, items, 'replace');
  // The routine days and names feed the reminders.
  void requestNotificationSync('dataChanged');
}

/** The pretty JSON of the edited module: the same file format the import screen reads. */
export function exportText(source: EditorSource, program: Program): string | null {
  const imported = importTemplate(editedModuleJson(source, program));
  return imported.ok ? `${JSON.stringify(editedModuleJson(source, program), null, 2)}\n` : null;
}
