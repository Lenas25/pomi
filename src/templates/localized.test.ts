import { describe, expect, it } from '@jest/globals';

import gymJson from '../../templates/gym.json';
import habitosJson from '../../templates/habitos.json';
import metricasJson from '../../templates/metricas.json';
import { parseReps } from '../domain/gym/reps';

import { bundledTranslations, loadDefaultTemplates } from './defaults';
import { importTemplate } from './importer';
import {
  addKnownTranslations,
  collectTextFields,
  editableText,
  isBlankText,
  localizedText,
  mergeLocales,
  poseEntries,
  withLocalizedText,
  type LocalizedText,
} from './localized';
import { editReps } from '../domain/editor/stepForm';

const SHIPPED = { 'gym.json': gymJson, 'habitos.json': habitosJson, 'metricas.json': metricasJson };

function moduleWith(name: unknown): Record<string, unknown> {
  return { schemaVersion: 2, kind: 'module', id: 'x', name, icon: 'Drop' };
}

describe('schema: localized text', () => {
  it('accepts a plain string (legacy / community templates)', () => {
    expect(importTemplate(moduleWith('Agua')).ok).toBe(true);
  });

  it('accepts { es, en } and { es } alone', () => {
    expect(importTemplate(moduleWith({ es: 'Agua', en: 'Water' })).ok).toBe(true);
    expect(importTemplate(moduleWith({ es: 'Agua' })).ok).toBe(true);
  });

  it('rejects a map without Spanish, an empty text or an unknown language', () => {
    for (const bad of [{ en: 'Water' }, { es: '' }, { es: 'Agua', fr: 'Eau' }, 5]) {
      const result = importTemplate(moduleWith(bad));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.path.startsWith('name')).toBe(true);
    }
  });
});

describe('localizedText', () => {
  const both: LocalizedText = { es: 'Agua', en: 'Water' };

  it('picks the requested language, then Spanish, then the only text', () => {
    expect(localizedText(both, 'en')).toBe('Water');
    expect(localizedText(both, 'es')).toBe('Agua');
    expect(localizedText({ es: 'Agua' }, 'en')).toBe('Agua');
    expect(localizedText({ es: 'Agua', en: '' }, 'en')).toBe('Agua');
    expect(localizedText('Agua', 'en')).toBe('Agua');
    expect(localizedText(undefined, 'en')).toBeUndefined();
  });

  it('edits one language and keeps the other', () => {
    expect(withLocalizedText(both, 'en', 'Hydration')).toEqual({ es: 'Agua', en: 'Hydration' });
    expect(withLocalizedText(both, 'es', 'Hidratación')).toEqual({
      es: 'Hidratación',
      en: 'Water',
    });
    expect(withLocalizedText('Agua', 'es', 'Hidratación')).toBe('Hidratación');
    expect(withLocalizedText('Agua', 'en', 'Water')).toEqual({ es: 'Agua', en: 'Water' });
    // Unchanged text keeps its shape.
    expect(withLocalizedText('Agua', 'en', 'Agua')).toBe('Agua');
  });

  it('editor fields show the English being typed, even empty', () => {
    expect(editableText({ es: 'Agua', en: '' }, 'en')).toBe('');
    expect(editableText({ es: 'Agua' }, 'en')).toBe('Agua');
    expect(isBlankText({ es: 'Agua', en: ' ' })).toBe(true);
    expect(isBlankText({ es: 'Agua', en: 'Water' })).toBe(false);
  });

  it('a reps edit keeps the other language only while it means the same range', () => {
    const reps = { es: '8–10 por pierna', en: '8–10 per leg' };
    expect(editReps(reps, '8–10 por pierna.', 'es')).toEqual({ es: '8–10 por pierna.', en: '8–10 per leg' });
    expect(editReps(reps, '6–8 por pierna', 'es')).toBe('6–8 por pierna');
    expect(editReps('8–10', '6–8', 'en')).toBe('6–8');
  });

  it('poses keep the Spanish text as the photo id', () => {
    expect(poseEntries([{ es: 'frente', en: 'front' }, 'perfil'], 'en')).toEqual({
      ids: ['frente', 'perfil'],
      names: { frente: 'Front', perfil: 'Perfil' },
    });
  });
});

describe('mergeLocales and known translations', () => {
  it('merges the same structure rendered in two languages', () => {
    const es = { id: 'a', name: 'Día A', reps: '8–10', steps: [{ id: 's', name: 'Remo' }] };
    const en = { id: 'a', name: 'Day A', reps: '8–10', steps: [{ id: 's', name: 'Row' }] };
    expect(mergeLocales(es, en)).toEqual({
      id: 'a',
      name: { es: 'Día A', en: 'Day A' },
      reps: '8–10',
      steps: [{ id: 's', name: { es: 'Remo', en: 'Row' } }],
    });
  });

  it('upgrades Spanish-only bundled texts stored by older versions, not the person’s own', () => {
    const stored = { name: 'Agua', habits: [{ id: 'agua', name: 'Mis vasos', unit: 'vasos' }] };
    expect(addKnownTranslations(stored, bundledTranslations())).toEqual({
      name: { es: 'Agua', en: 'Water' },
      habits: [{ id: 'agua', name: 'Mis vasos', unit: { es: 'vasos', en: 'glasses' } }],
    });
  });
});

describe('shipped templates are fully translated', () => {
  it.each(Object.entries(SHIPPED))('%s has English for every text field', (_file, json) => {
    const fields = collectTextFields(json);
    expect(fields.length).toBeGreaterThan(0);
    const missing = fields
      .filter(({ value }) => {
        if (typeof value !== 'object' || value === null) return true;
        const { es, en } = value as { es?: unknown; en?: unknown };
        return typeof es !== 'string' || typeof en !== 'string' || en.trim() === '';
      })
      .map(({ path }) => path.join('.'));
    expect(missing).toEqual([]);
  });

  it('English rep texts parse exactly like the Spanish ones', () => {
    for (const module of loadDefaultTemplates().modules) {
      for (const routine of module.programs?.flatMap((program) => program.routines) ?? []) {
        for (const step of routine.steps) {
          if (step.type !== 'sets') continue;
          expect(parseReps(localizedText(step.reps, 'en'))).toEqual(
            parseReps(localizedText(step.reps, 'es')),
          );
        }
      }
    }
  });
});
