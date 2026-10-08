import gymJson from '../../templates/gym.json';
import habitosJson from '../../templates/habitos.json';
import metricasJson from '../../templates/metricas.json';
import settingsJson from '../../templates/settings.json';

import { importTemplate, toModuleTemplates } from './importer';
import type { ModuleTemplate, SettingsTemplate } from './schema';

export type DefaultTemplates = {
  /** Module templates seeded on first run (bundles are split into modules). */
  modules: ModuleTemplate[];
  /** Example author settings. Never seeded automatically; only applied if the user imports it. */
  settings: SettingsTemplate;
};

/** Validates and returns the templates bundled with the app. Throws if a shipped file is invalid. */
export function loadDefaultTemplates(): DefaultTemplates {
  const modules: ModuleTemplate[] = [];
  let settings: SettingsTemplate | null = null;

  for (const raw of [gymJson, habitosJson, metricasJson, settingsJson]) {
    const result = importTemplate(raw);
    if (!result.ok) {
      const detail = result.errors.map((error) => `${error.code} at "${error.path}"`).join('; ');
      throw new Error(`Bundled template is invalid: ${detail}`);
    }
    if (result.template.kind === 'settings') settings = result.template;
    else modules.push(...toModuleTemplates(result.template));
  }

  if (settings === null) throw new Error('Bundled settings template is missing');
  return { modules, settings };
}
