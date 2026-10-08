import { eq } from 'drizzle-orm';

import { bundledTranslations, loadDefaultTemplates } from '../../templates/defaults';
import { addKnownTranslations, sourceText } from '../../templates/localized';
import { moduleTemplateSchema, type ModuleTemplate } from '../../templates/schema';
import { templates } from '../schema';
import { withTransaction, type Tx } from '../transaction';
import type { Db } from '../types';

import type { SettingsRepository } from './settings';

export type StoredModule = {
  id: string;
  name: string;
  active: boolean;
  importedAt: number;
  template: ModuleTemplate;
};

export type SaveModulesResult = { saved: string[]; skipped: string[] };

export function createTemplatesRepository(
  db: Db,
  settingsRepo: SettingsRepository,
  now: () => number = Date.now,
) {
  async function listModules(): Promise<StoredModule[]> {
    const rows = await db.select().from(templates).where(eq(templates.kind, 'module'));
    return rows.flatMap((row) => {
      const parsed = moduleTemplateSchema.safeParse(row.json);
      // A stored module that no longer validates (older schema) is hidden instead of crashing.
      if (!parsed.success) return [];
      return [
        {
          id: row.id,
          name: row.name,
          active: row.active,
          importedAt: row.importedAt,
          // Older installs stored the bundled modules in Spanish only: add the known English.
          template: addKnownTranslations(parsed.data, bundledTranslations()),
        },
      ];
    });
  }

  /**
   * Stores modules atomically. `replace` overwrites modules with the same id; `add` keeps existing
   * ones (and ids already saved earlier in the same batch) and reports them as skipped.
   */
  async function saveModulesIn(
    tx: Tx,
    modules: ModuleTemplate[],
    mode: 'replace' | 'add',
  ): Promise<SaveModulesResult> {
    return withTransaction(tx, async () => {
      const known = new Set((await listModules()).map((module) => module.id));
      const result: SaveModulesResult = { saved: [], skipped: [] };
      const importedAt = now();

      for (const module of modules) {
        if (mode === 'add' && known.has(module.id)) {
          result.skipped.push(module.id);
          continue;
        }
        await db
          .insert(templates)
          .values({
            id: module.id,
            kind: 'module',
            name: sourceText(module.name),
            json: module,
            importedAt,
            active: true,
          })
          .onConflictDoUpdate({
            target: templates.id,
            set: { name: sourceText(module.name), json: module, importedAt },
          });
        known.add(module.id);
        result.saved.push(module.id);
      }
      return result;
    });
  }

  /** Read inside a transaction (requires the `Tx`, so a callback never reaches for a top-level twin). */
  const listModulesIn = (_tx: Tx) => listModules();

  /** Same as `setActive`, for use INSIDE a transaction callback. */
  async function setActiveIn(_tx: Tx, id: string, active: boolean): Promise<void> {
    await db.update(templates).set({ active }).where(eq(templates.id, id));
  }

  /** Opens its own top-level transaction: inside one, use `saveModulesIn(tx, ...)`. */
  const saveModules = (modules: ModuleTemplate[], mode: 'replace' | 'add') =>
    withTransaction(db, (tx) => saveModulesIn(tx, modules, mode));

  return {
    listModules,

    async getModule(id: string): Promise<StoredModule | undefined> {
      return (await listModules()).find((module) => module.id === id);
    },

    listModulesIn,
    saveModules,
    saveModulesIn,
    setActiveIn,

    async setActive(id: string, active: boolean): Promise<void> {
      await db.update(templates).set({ active }).where(eq(templates.id, id));
    },

    async remove(id: string): Promise<void> {
      await db.delete(templates).where(eq(templates.id, id));
    },

    /**
     * Seeds the bundled modules once. A `templatesSeeded` flag keeps a module the user deleted
     * from coming back on the next launch.
     */
    async seedDefaults(): Promise<boolean> {
      return withTransaction(db, async (tx) => {
        if (await settingsRepo.get('templatesSeeded')) return false;
        await saveModulesIn(tx, loadDefaultTemplates().modules, 'add');
        await settingsRepo.set('templatesSeeded', true);
        return true;
      });
    },
  };
}

export type TemplatesRepository = ReturnType<typeof createTemplatesRepository>;
