import { eq } from 'drizzle-orm';

import { loadDefaultTemplates } from '../../templates/defaults';
import { moduleTemplateSchema, type ModuleTemplate } from '../../templates/schema';
import { templates } from '../schema';
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
          template: parsed.data,
        },
      ];
    });
  }

  return {
    listModules,

    async getModule(id: string): Promise<StoredModule | undefined> {
      return (await listModules()).find((module) => module.id === id);
    },

    /**
     * Stores modules. `replace` overwrites modules with the same id; `add` keeps existing ones
     * and reports them as skipped.
     */
    async saveModules(
      modules: ModuleTemplate[],
      mode: 'replace' | 'add',
    ): Promise<SaveModulesResult> {
      const existing = new Set((await listModules()).map((module) => module.id));
      const result: SaveModulesResult = { saved: [], skipped: [] };
      const importedAt = now();

      for (const module of modules) {
        if (mode === 'add' && existing.has(module.id)) {
          result.skipped.push(module.id);
          continue;
        }
        await db
          .insert(templates)
          .values({
            id: module.id,
            kind: 'module',
            name: module.name,
            json: module,
            importedAt,
            active: true,
          })
          .onConflictDoUpdate({
            target: templates.id,
            set: { name: module.name, json: module, importedAt },
          });
        result.saved.push(module.id);
      }
      return result;
    },

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
      if (await settingsRepo.get('templatesSeeded')) return false;
      const defaults = loadDefaultTemplates();
      await this.saveModules(defaults.modules, 'add');
      await settingsRepo.set('templatesSeeded', true);
      return true;
    },
  };
}

export type TemplatesRepository = ReturnType<typeof createTemplatesRepository>;
