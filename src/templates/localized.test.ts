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
  legacyPoseIds,
  localizedText,
  mergeLocales,
  poseEntries,
  withLocalizedText,
  type LocalizedText,
} from './localized';
import { editReps } from '../domain/editor/stepForm';
import { notificationTextProblems } from './notificationLimits';

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
    // A plain string is one text shown as written: it is replaced and stays plain.
    expect(withLocalizedText('Agua', 'en', 'Water')).toBe('Water');
    // Unchanged text keeps its shape.
    expect(withLocalizedText('Agua', 'en', 'Agua')).toBe('Agua');
  });

  it('editor fields show the English being typed, even empty', () => {
    expect(editableText({ es: 'Agua', en: '' }, 'en')).toBe('');
    expect(editableText({ es: 'Agua' }, 'en')).toBe('Agua');
    expect(isBlankText({ es: 'Agua', en: ' ' })).toBe(true);
    expect(isBlankText({ es: 'Agua', en: 'Water' })).toBe(false);
  });

  it('a reps edit keeps the other language while it means the same range', () => {
    const reps = { es: '8–10 por pierna', en: '8–10 per leg' };
    expect(editReps(reps, '8–10 por pierna.', 'es')).toEqual({
      reps: { es: '8–10 por pierna.', en: '8–10 per leg' },
      stale: false,
    });
    expect(editReps('8–10', '6–8', 'en')).toEqual({ reps: '6–8', stale: false });
  });

  it('a new range is carried into the other language with its own suffix', () => {
    const reps = { es: '8–10 por pierna', en: '8–10 per leg' };
    expect(editReps(reps, '6–8 por pierna', 'es')).toEqual({
      reps: { es: '6–8 por pierna', en: '6–8 per leg' },
      stale: false,
    });
    expect(editReps(reps, '12 per leg', 'en')).toEqual({
      reps: { es: '12 por pierna', en: '12 per leg' },
      stale: false,
    });
    expect(editReps({ es: '3x8–10', en: '3x8–10' }, '3x6–8', 'es').reps).toEqual({
      es: '3x6–8',
      en: '3x6–8',
    });
  });

  it('keeps the other language and marks it stale when the range cannot be carried', () => {
    const reps = { es: '8–10 por pierna', en: '8–10 per leg' };
    // Seconds now: "6–8 per leg" would still be reps, so English is kept for review.
    expect(editReps(reps, '30–45 s por pierna', 'es')).toEqual({
      reps: { es: '30–45 s por pierna', en: '8–10 per leg' },
      stale: true,
    });
    // What the person writes for the other language after the notice replaces it.
    expect(editReps(reps, '30–45 s por pierna', 'es', '30–45 s per leg')).toEqual({
      reps: { es: '30–45 s por pierna', en: '30–45 s per leg' },
      stale: false,
    });
    expect(editReps(reps, '30–45 s por pierna', 'es', '10 per leg').stale).toBe(true);
  });

  it('poses use their explicit id, or the Spanish text for a legacy text pose', () => {
    expect(
      poseEntries([{ id: 'frente', label: { es: 'frente', en: 'front' } }, 'perfil'], 'en'),
    ).toEqual({
      ids: ['frente', 'perfil'],
      names: { frente: 'Front', perfil: 'Perfil' },
    });
    expect(poseEntries([{ es: 'espalda', en: 'back' }], 'en').ids).toEqual(['espalda']);
  });

  it('maps legacy pose texts (any language) to the pose id', () => {
    expect(
      legacyPoseIds([
        { id: 'front', label: { es: 'frente', en: 'front view' } },
        { es: 'perfil', en: 'side' },
      ]),
    ).toEqual(
      new Map([
        ['frente', 'front'],
        ['front view', 'front'],
        ['side', 'perfil'],
      ]),
    );
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

describe('reps languages and pose ids in the schema', () => {
  const withReps = (reps: unknown) => ({
    ...moduleWith('Gym'),
    programs: [
      {
        id: 'p',
        name: 'P',
        routines: [
          {
            id: 'r',
            name: 'R',
            steps: [{ type: 'sets', id: 's', name: 'Remo', sets: 3, reps, restSec: 60 }],
          },
        ],
      },
    ],
  });

  it('rejects language versions of reps with different ranges, with the path', () => {
    expect(importTemplate(withReps({ es: '8–10 por pierna', en: '8–10 per leg' })).ok).toBe(true);
    const result = importTemplate(withReps({ es: '8–10', en: '6–8' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => [error.code, error.path])).toEqual([
      ['repsLanguagesDiffer', 'programs[0].routines[0].steps[0].reps.en'],
    ]);
  });

  it('accepts poses with an explicit id and upgrades legacy pose labels at read time', () => {
    const photos = { frequency: 'monthly', poses: [{ id: 'frente', label: 'frente' }, 'perfil'] };
    expect(importTemplate({ ...moduleWith('Medidas'), photos }).ok).toBe(true);
    expect(addKnownTranslations(photos, bundledTranslations())).toEqual({
      frequency: 'monthly',
      poses: [
        { id: 'frente', label: { es: 'frente', en: 'front' } },
        { es: 'perfil', en: 'side' },
      ],
    });
  });
});

describe('notification text limits', () => {
  it('passes the shipped templates', () => {
    for (const json of Object.values(SHIPPED)) expect(notificationTextProblems(json)).toEqual([]);
  });

  it('reports long titles and bodies and extra emoji in any language', () => {
    const json = {
      habits: [
        {
          notification: {
            title: { es: 'Agua', en: 'A title that is much too long to fit' },
            body: { es: '💧 Bebe agua 💧', en: 'x'.repeat(81) },
          },
        },
      ],
    };
    expect(notificationTextProblems(json).map((problem) => [problem.code, problem.path])).toEqual([
      ['notificationTitleTooLong', 'habits[0].notification.title.en'],
      ['notificationBodyTooLong', 'habits[0].notification.body.en'],
      ['notificationTooManyEmoji', 'habits[0].notification.es'],
    ]);
  });
});
