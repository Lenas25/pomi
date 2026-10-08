import { describe, expect, it } from '@jest/globals';

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { Messages, TranslationKey } from '../i18n/types';

import gymJson from '../../templates/gym.json';
import habitosJson from '../../templates/habitos.json';
import metricasJson from '../../templates/metricas.json';
import settingsJson from '../../templates/settings.json';

import { loadDefaultTemplates } from './defaults';
import { describeImportError, type Translate } from './describeError';
import {
  importTemplate,
  importTemplateFromText,
  toModuleTemplates,
  type ImportError,
} from './importer';
import { moduleTemplateSchema } from './schema';

const shipped = { gym: gymJson, habitos: habitosJson, metricas: metricasJson, settings: settingsJson };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function errorsOf(json: unknown): ImportError[] {
  const result = importTemplate(json);
  if (result.ok) throw new Error('Expected the import to fail');
  return result.errors;
}

function minimalModule(extra: Record<string, unknown> = {}) {
  return { schemaVersion: 2, kind: 'module', id: 'm', name: 'M', icon: 'Barbell', ...extra };
}

describe('unknown keys', () => {
  it('rejects a typo key and reports its full path', () => {
    const json = clone(shipped.gym) as unknown as {
      programs: { routines: { steps: Record<string, unknown>[] }[] }[];
    };
    const step = json.programs[0]?.routines[0]?.steps.find((candidate) => candidate.type === 'sets');
    if (!step) throw new Error('gym template needs a sets step');
    step.repz = '8';
    const errors = errorsOf(json);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'unknownKey' });
    expect(errors[0]?.path).toMatch(/^programs\[0\]\.routines\[0\]\.steps\[\d+\]\.repz$/);
  });

  it('describes the typo in plain language with the path', () => {
    const [error] = errorsOf(minimalModule({ nmae: 'x' }));
    if (!error) throw new Error('expected an error');
    expect(error.path).toBe('nmae');
    expect(describeImportError(error, (key, options) => (key === 'importErrors.unknownKey' ? `unknown ${options?.path}` : key))).toBe(
      'unknown nmae',
    );
  });

  it('ignores author comment keys that start with "_" at any depth', () => {
    const json = minimalModule({
      _note: 'top',
      habits: [{ type: 'check', id: 'h', name: 'H', _why: 'because' }],
    });
    expect(importTemplate(json).ok).toBe(true);
  });
});

describe('shipped templates', () => {
  it.each(Object.entries(shipped))('accepts %s', (_name, json) => {
    const result = importTemplate(json);
    expect(result.ok).toBe(true);
  });

  it('loads the bundled defaults, splitting the habits bundle into modules', () => {
    const defaults = loadDefaultTemplates();
    expect(defaults.modules.map((module) => module.id)).toEqual([
      'gym',
      'agua',
      'movimiento',
      'sueno',
      'comida-notas',
      'metricas',
    ]);
    expect(defaults.settings.anchors?.wake).toBe('05:10');
  });

  it('keeps extended fields through the round trip', () => {
    const result = importTemplate(clone(shipped.gym));
    if (!result.ok || result.template.kind !== 'module') throw new Error('gym must be a module');
    const program = result.template.programs?.[0];
    expect(program?.rules).toEqual({
      progression: 'double',
      rirTarget: [1, 2],
      stallSessions: 3,
      deloadPct: 10,
    });
    const steps = program?.routines.flatMap((routine) => routine.steps) ?? [];
    expect(steps.some((step) => step.type === 'sets' && step.muscles !== undefined)).toBe(true);
    // Round trip: serialize the validated result and import it again.
    expect(importTemplate(JSON.parse(JSON.stringify(result.template)))).toEqual(result);
  });

  it('accepts habit targets as number or formula and reads onlyIf / glassMl / source', () => {
    const result = importTemplate(clone(shipped.habitos));
    if (!result.ok || result.template.kind !== 'modules') throw new Error('expected a bundle');
    const habits = result.template.modules.flatMap((module) => module.habits ?? []);
    const water = habits.find((habit) => habit.id === 'agua');
    const steps = habits.find((habit) => habit.id === 'pasos');
    const pause = habits.find((habit) => habit.id === 'pausa-activa');
    expect(water?.type === 'counter' && water.glassMl).toBe(250);
    expect(water?.type === 'counter' && water.target).toEqual({ formula: 'water' });
    expect(steps?.type === 'counter' && steps.source).toBe('health_connect_or_manual');
    expect(pause?.onlyIf).toEqual({ 'profile.workType': 'sentada' });
  });

  it('accepts a fixed numeric habit target', () => {
    const json = minimalModule({
      habits: [{ type: 'counter', id: 'h', name: 'H', target: 8 }],
    });
    expect(importTemplate(json).ok).toBe(true);
  });

  it('stores module templates that satisfy the module schema', () => {
    for (const module of loadDefaultTemplates().modules) {
      expect(moduleTemplateSchema.safeParse(module).success).toBe(true);
    }
  });

  it('flattens settings to no modules', () => {
    const result = importTemplate(clone(shipped.settings));
    if (!result.ok) throw new Error('settings must be valid');
    expect(toModuleTemplates(result.template)).toEqual([]);
  });
});

describe('importer errors', () => {
  it('reports a missing field with its path', () => {
    const json = clone(shipped.gym);
    delete (json.programs[0]!.routines[1]!.steps[3] as { name?: string }).name;
    const errors = errorsOf(json);
    expect(errors).toContainEqual({
      code: 'missing',
      path: 'programs[0].routines[1].steps[3].name',
      params: {},
    });
  });

  it('reports an unknown step type with its path', () => {
    const json = clone(shipped.gym);
    (json.programs[0]!.routines[0]!.steps[0] as { type: string }).type = 'lift';
    const errors = errorsOf(json);
    expect(errors[0]?.path).toBe('programs[0].routines[0].steps[0].type');
    expect(errors[0]?.code).toBe('invalidValue');
  });

  it('reports reps with the wrong type', () => {
    const json = clone(shipped.gym) as unknown as {
      programs: { routines: { steps: Record<string, unknown>[] }[] }[];
    };
    const index = json.programs[0]!.routines[0]!.steps.findIndex((step) => step.type === 'sets');
    json.programs[0]!.routines[0]!.steps[index]!.reps = 10;
    const errors = errorsOf(json);
    expect(errors).toEqual([
      {
        code: 'wrongType',
        path: `programs[0].routines[0].steps[${index}].reps`,
        params: { expected: 'string' },
      },
    ]);
  });

  it('rejects an emoji icon', () => {
    const errors = errorsOf(minimalModule({ icon: '🏋️' }));
    expect(errors).toEqual([{ code: 'invalidIcon', path: 'icon', params: {} }]);
  });

  it('rejects a bad time and a schedule without time or anchor', () => {
    const errors = errorsOf(
      minimalModule({
        reminders: [
          { id: 'a', text: 'A', schedule: { days: [1], time: '25:00' } },
          { id: 'b', text: 'B', schedule: { days: [1] } },
        ],
      }),
    );
    expect(errors.map((error) => [error.code, error.path])).toEqual([
      ['invalidTime', 'reminders[0].schedule.time'],
      ['invalidSchedule', 'reminders[1].schedule'],
    ]);
  });

  it('rejects an invalid habit target and a bad scale', () => {
    const errors = errorsOf(
      minimalModule({
        habits: [{ type: 'counter', id: 'h', name: 'H', target: 'many' }],
        checkins: { night: [{ id: 'q', type: 'scale', label: 'Q', scale: [5, 1] }] },
      }),
    );
    const codes = errors.map((error) => error.code);
    expect(codes).toContain('invalidScale');
    expect(errors.some((error) => error.path.startsWith('habits[0].target'))).toBe(true);
  });

  it('rejects non-objects, unknown kinds and other versions', () => {
    expect(errorsOf([])[0]?.code).toBe('notObject');
    expect(errorsOf({ schemaVersion: 2, kind: 'nope' })[0]?.code).toBe('unknownKind');
    const version = errorsOf({ schemaVersion: 1, kind: 'module' })[0];
    expect(version).toMatchObject({ code: 'unsupportedVersion', params: { found: '1', expected: 2 } });
  });

  it('reports JSON syntax errors with a line when the engine gives a position', () => {
    const result = importTemplateFromText('{\n  "kind": "module",\n  oops\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe('invalidJson');
  });

  it('imports valid text', () => {
    expect(importTemplateFromText(JSON.stringify(shipped.metricas)).ok).toBe(true);
  });
});

describe('error descriptions', () => {
  function interpolate(template: string, options: Record<string, string | number> = {}): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options[name] ?? ''));
  }

  function translatorFor(messages: Messages): Translate {
    return (key: TranslationKey, options) => {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
      return interpolate(String(value), options);
    };
  }

  it('describes errors in plain Spanish and English with the path', () => {
    const [error] = errorsOf(minimalModule({ icon: '🏋️' }));
    if (!error) throw new Error('expected an error');
    expect(describeImportError(error, translatorFor(es))).toContain('«icon»');
    expect(describeImportError(error, translatorFor(en))).toContain('"icon"');
  });

  it('has a message for every error code', () => {
    const codes: ImportError['code'][] = [
      'invalidJson',
      'notObject',
      'unknownKind',
      'unsupportedVersion',
      'missing',
      'wrongType',
      'invalidValue',
      'tooSmall',
      'tooBig',
      'invalidFormat',
      'invalidTime',
      'invalidIcon',
      'invalidSchedule',
      'invalidScale',
      'duplicateId',
      'unknownKey',
      'unknown',
    ];
    const translate = translatorFor(es);
    for (const code of codes) {
      const text = describeImportError({ code, path: 'a.b', params: { expected: 'string' } }, translate);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toContain('{{');
    }
  });
});
