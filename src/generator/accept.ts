// Accepting a generated proposal: it goes through the SAME path as an imported trainer program
// (template validation, `applyProgramImport`: one transaction, the app trains ONE program).
// The exercise history lives under the step id, so every exercise whose id the new program shares
// with the one being replaced keeps its history.
import type { Repositories } from '../db/repositories';
import type { Db } from '../db/types';
import { toModuleJson } from '../domain/generator/edit';
import { exerciseIdOfStep } from '../domain/generator/program';
import type { GeneratedProgram, TextResolver } from '../domain/generator/types';
import { pickProgram } from '../gym/program';
import { importTemplate, toModuleTemplates } from '../templates/importer';
import { applyProgramImport, type ProgramPreviewItem } from '../templates/programImport';
import type { ModuleTemplate } from '../templates/schema';

export type AcceptContext = {
  modules: readonly { id: string; name: string; active: boolean; template: ModuleTemplate }[];
  /** Step ids with logged sets. */
  loggedStepIds: ReadonlySet<string>;
};

export type HistoryImpact = {
  /** Exercises of the current program that keep their history in the new one (same step id). */
  kept: { id: string; name: string }[];
  /** Exercises with history that the new program does not have. */
  lost: { id: string; name: string }[];
  /**
   * The same exercise, but with other equipment or another rep family (a different step id), so
   * its history starts over: weights at 8-12 reps are not comparable with a 5 rep strength series.
   */
  restarted: { id: string; name: string }[];
};

/**
 * Pure: which logged exercises of the program being trained survive. The history lives under the
 * step id, and the generator changes the id when the equipment option or the rep family differs
 * (`stepIdFor`), so "kept" means the same exercise, equipment and rep family.
 */
export function historyImpact(
  context: AcceptContext,
  newStepIds: ReadonlySet<string>,
): HistoryImpact {
  const current = pickProgram(context.modules);
  const seen = new Map<string, string>();
  for (const routine of current?.routines ?? []) {
    for (const step of routine.steps) {
      if (step.type === 'sets' && context.loggedStepIds.has(step.id)) seen.set(step.id, step.name);
    }
  }
  const newBases = new Set([...newStepIds].map(exerciseIdOfStep));
  const kept: HistoryImpact['kept'] = [];
  const lost: HistoryImpact['lost'] = [];
  const restarted: HistoryImpact['restarted'] = [];
  for (const [id, name] of seen) {
    if (newStepIds.has(id)) kept.push({ id, name });
    else if (newBases.has(exerciseIdOfStep(id))) restarted.push({ id, name });
    else lost.push({ id, name });
  }
  return { kept, lost, restarted };
}

export type PreparedAccept =
  { ok: true; items: ProgramPreviewItem[]; impact: HistoryImpact } | { ok: false };

/** Validates the proposal as a template module and works out what accepting it does. */
export function prepareAccept(
  generated: GeneratedProgram,
  context: AcceptContext,
  t: TextResolver,
): PreparedAccept {
  const imported = importTemplate(toModuleJson(generated, t));
  if (!imported.ok) return { ok: false };
  const modules = toModuleTemplates(imported.template);
  const items: ProgramPreviewItem[] = modules.map((module) => ({
    module,
    programs: module.programs?.length ?? 0,
    routines: (module.programs ?? []).reduce((sum, program) => sum + program.routines.length, 0),
    exists: context.modules.some((stored) => stored.id === module.id),
  }));
  const ids = new Set(
    modules.flatMap((module) =>
      (module.programs ?? []).flatMap((program) =>
        program.routines.flatMap((routine) => routine.steps.map((step) => step.id)),
      ),
    ),
  );
  return { ok: true, items, impact: historyImpact(context, ids) };
}

export async function loadAcceptContext(repos: Repositories): Promise<AcceptContext> {
  const [modules, logged] = await Promise.all([
    repos.templates.listModules(),
    repos.workouts.loggedStepIds(),
  ]);
  return { modules, loggedStepIds: new Set(logged) };
}

/** Stores the proposal as the active program (replacing an earlier generated one). */
export async function acceptGenerated(
  db: Db,
  repos: Repositories,
  items: readonly ProgramPreviewItem[],
): Promise<{ saved: string[] }> {
  const result = await applyProgramImport(db, repos, items, 'replace');
  return { saved: result.saved };
}
