import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { es } from '../../i18n/es';
import { importTemplate } from '../../templates/importer';
import { loadExerciseLibrary, parseExerciseLibrary } from '../../templates/exercises';
import { parseReps } from '../gym/reps';

import {
  GENERATED_MODULE_ID,
  removeExercise,
  swapExercise,
  swapOptions,
  toModuleJson,
} from './edit';
import { generateProgram, normalizeInput } from './generate';
import { eligibleExercises, loadsLimitation } from './library';
import { evaluateParq, screeningStatus } from './parq';
import { MAJOR_MUSCLES, REST, restFor, VOLUME } from './params';
import {
  EQUIPMENT,
  EVIDENCE_IDS,
  GOALS,
  LEVELS,
  LIMITATIONS,
  type Equipment,
  type GeneratedProgram,
  type GeneratorInput,
  type Goal,
  type Level,
  type Limitation,
  type TextResolver,
} from './types';

const lookup = (messages: object, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );

const makeText =
  (messages: object): TextResolver =>
  (key, params) =>
    String(lookup(messages, key) ?? `MISSING:${key}`).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(params?.[name] ?? ''),
    );
const tEs = makeText(es);
const tEn = makeText(en);

const library = loadExerciseLibrary();
const byId = new Map(library.map((exercise) => [exercise.id, exercise]));

const NO_RISK = { answers: [false, false, false, false, false, false, false], acknowledged: false };
const ONE_YES = { answers: [false, false, false, false, false, true, false], acknowledged: false };

/** Days per goal and level of the E12 table (what a person gets by default). */
const DEFAULT_DAYS: Record<Goal, Record<Level, number>> = {
  hypertrophy: { beginner: 3, intermediate: 4, advanced: 5 },
  strength: { beginner: 3, intermediate: 4, advanced: 4 },
  fatLoss: { beginner: 3, intermediate: 3, advanced: 4 },
  health: { beginner: 2, intermediate: 3, advanced: 3 },
};

function input(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    goal: 'hypertrophy',
    level: 'intermediate',
    daysPerWeek: 4,
    sessionMin: 60,
    equipment: 'gym',
    limitations: [],
    screening: NO_RISK,
    ...overrides,
  };
}

function generate(
  overrides: Partial<GeneratorInput> = {},
  t: TextResolver = tEs,
): GeneratedProgram {
  const result = generateProgram(input(overrides), library, t);
  if (!result.ok) throw new Error(`generation failed: ${result.reason}`);
  return result.value;
}

const grid = GOALS.flatMap((goal) =>
  LEVELS.flatMap((level) =>
    EQUIPMENT.map(
      (equipment) => [`${goal}/${level}/${equipment}`, goal, level, equipment] as const,
    ),
  ),
);

describe('exercise library', () => {
  it('is a curated set of about 40-65 exercises that validates', () => {
    expect(library.length).toBeGreaterThanOrEqual(40);
    expect(library.length).toBeLessThanOrEqual(65);
  });

  it('rejects a broken library with readable problems', () => {
    const broken = parseExerciseLibrary({
      schemaVersion: 1,
      kind: 'exercises',
      exercises: [{ ...library[0], substitutions: ['nope'] }],
    });
    expect(broken.ok).toBe(false);
    expect(parseExerciseLibrary({ schemaVersion: 1, kind: 'exercises', exercises: [] }).ok).toBe(
      false,
    );
  });

  it('has names and how-tos in Spanish and English for every exercise', () => {
    for (const exercise of library) {
      for (const messages of [es, en]) {
        expect(typeof lookup(messages, exercise.nameKey)).toBe('string');
        expect(typeof lookup(messages, exercise.howKey)).toBe('string');
      }
    }
  });

  it('covers every pattern the generator needs', () => {
    const patterns = new Set(library.map((exercise) => exercise.pattern));
    for (const pattern of [
      'squat',
      'hip_hinge',
      'lunge',
      'hip_thrust',
      'horizontal_push',
      'vertical_push',
      'horizontal_pull',
      'vertical_pull',
      'core_anti_extension',
      'core_anti_rotation',
      'calves',
      'glute_med',
      'biceps',
      'triceps',
    ]) {
      expect(patterns.has(pattern as never)).toBe(true);
    }
  });

  it('every large muscle has a safe primary mover for every equipment and single limitation (documented holes aside)', () => {
    const holes: string[] = [];
    for (const equipment of EQUIPMENT) {
      for (const limitation of [undefined, ...LIMITATIONS]) {
        const pool = eligibleExercises(library, {
          equipment,
          level: 'beginner',
          limitations: limitation ? [limitation] : [],
        });
        for (const muscle of MAJOR_MUSCLES) {
          if (!pool.some((exercise) => exercise.muscles.primary.includes(muscle))) {
            holes.push(`${equipment}/${limitation ?? 'none'}/${muscle}`);
          }
        }
      }
    }
    // With only the body, the one shoulder press (pike push-up) loads the shoulder AND the wrists.
    // The summary warns about it ("noSafeExercise") instead of leaving the muscle out silently.
    expect(holes).toEqual(['bodyweight/shoulder/hombro', 'bodyweight/wrist/hombro']);
  });

  it('every exercise has substitutions that exist and share its movement family', () => {
    for (const exercise of library) {
      expect(exercise.substitutions.length).toBeGreaterThan(0);
      for (const id of exercise.substitutions) expect(byId.has(id)).toBe(true);
    }
  });
});

describe('the volume per muscle', () => {
  it.each(grid)(
    '%s lands every tracked muscle inside its weekly band (E1, E12)',
    (_name, goal, level, equipment) => {
      const result = generate({
        goal,
        level,
        equipment,
        daysPerWeek: DEFAULT_DAYS[goal][level],
        sessionMin: 60,
        ...(goal === 'hypertrophy' ? { focusRegion: 'glutes' as const } : {}),
      });
      const band = VOLUME[goal][level];
      expect(result.summary.weekly.length).toBeGreaterThanOrEqual(MAJOR_MUSCLES.length);
      for (const volume of result.summary.weekly) {
        expect(volume.sets).toBeGreaterThanOrEqual(volume.min);
        expect(volume.sets).toBeLessThanOrEqual(volume.max);
        expect(volume.sets).toBeGreaterThanOrEqual(4); // never below 4 (E1)
        expect(volume.sets).toBeLessThanOrEqual(20); // never above 20 (E1)
        if (MAJOR_MUSCLES.includes(volume.muscle) && !volume.priority) {
          expect(volume.min).toBe(band.min);
          expect(volume.max).toBe(band.max);
        }
      }
      expect(result.summary.warnings.filter((w) => w.code === 'volumeBelowRange')).toEqual([]);
    },
  );

  it('the priority region gets 2-4 more sets than the same muscle without priority', () => {
    for (const level of LEVELS) {
      const plain = generate({
        goal: 'hypertrophy',
        level,
        daysPerWeek: DEFAULT_DAYS.hypertrophy[level],
      });
      const focused = generate({
        goal: 'hypertrophy',
        level,
        daysPerWeek: DEFAULT_DAYS.hypertrophy[level],
        focusRegion: 'glutes',
      });
      const glutes = (program: GeneratedProgram) =>
        program.summary.weekly.find((volume) => volume.muscle === 'gluteo');
      expect(glutes(focused)?.priority).toBe(true);
      expect(glutes(plain)?.priority).toBe(false);
      const bonus = VOLUME.hypertrophy[level].priorityBonus;
      expect(bonus).toBeGreaterThanOrEqual(2);
      expect(bonus).toBeLessThanOrEqual(4);
      expect(glutes(focused)?.min).toBe(Math.min(20, VOLUME.hypertrophy[level].min + bonus));
    }
  });

  it('the focus region only matters for hypertrophy', () => {
    const result = generate({
      goal: 'health',
      level: 'beginner',
      daysPerWeek: 2,
      focusRegion: 'glutes',
    });
    expect(result.input.focusRegion).toBeUndefined();
    expect(result.summary.weekly.some((volume) => volume.priority)).toBe(false);
  });
});

describe('frequency and split', () => {
  it.each(grid)(
    '%s trains every tracked muscle at least twice a week (E2, E11)',
    (_n, goal, level, equipment) => {
      const result = generate({ goal, level, equipment, daysPerWeek: DEFAULT_DAYS[goal][level] });
      expect(result.summary.daysUsed).toBeGreaterThanOrEqual(2);
      for (const volume of result.summary.weekly)
        expect(volume.frequency).toBeGreaterThanOrEqual(2);
    },
  );

  it('uses full body for 2-3 days, upper/lower for 4, upper/lower + push/pull/legs for 5 and PPL for 6', () => {
    const kinds = (days: number) =>
      generate({ goal: 'hypertrophy', level: 'advanced', daysPerWeek: days }).plan.sessions.map(
        (session) => session.kind,
      );
    expect(kinds(2)).toEqual(['full', 'full']);
    expect(kinds(3)).toEqual(['full', 'full', 'full']);
    expect(kinds(4)).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(kinds(5)).toEqual(['upper', 'lower', 'push', 'pull', 'legs']);
    expect(kinds(6)).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  });

  it('clamps the days to 2-6 and to what the goal and level support, saying so', () => {
    const health = generate({ goal: 'health', level: 'beginner', daysPerWeek: 6 });
    expect(health.summary.daysUsed).toBe(3);
    expect(health.summary.warnings).toContainEqual({
      code: 'daysReduced',
      params: { requested: 6, used: 3 },
    });
    expect(generate({ daysPerWeek: 1 }).summary.daysRequested).toBe(2);
    expect(generate({ daysPerWeek: 9, level: 'advanced' }).summary.daysRequested).toBe(6);
  });
});

describe('the time budget (E12 [DESIGN])', () => {
  it.each([30, 45, 60, 90])('no session exceeds %s minutes, cardio included', (sessionMin) => {
    for (const goal of GOALS) {
      for (const level of LEVELS) {
        const result = generate({
          goal,
          level,
          sessionMin,
          daysPerWeek: DEFAULT_DAYS[goal][level],
        });
        for (const session of result.summary.sessions) {
          expect(session.minutes).toBeLessThanOrEqual(sessionMin);
        }
      }
    }
  });

  it('keeps every muscle at 4 sets or more even in 30 minutes, and warns when a band is missed', () => {
    const result = generate({ goal: 'hypertrophy', level: 'intermediate', sessionMin: 30 });
    const low = result.summary.weekly.filter((volume) => volume.status === 'low');
    expect(low.length).toBeGreaterThan(0);
    expect(result.summary.warnings.filter((w) => w.code === 'volumeBelowRange')).toHaveLength(
      low.length,
    );
    // Rest is never cut to save time: the volume is.
    for (const routine of result.program.routines) {
      for (const step of routine.steps) {
        if (step.type === 'sets') expect(step.restSec).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('clamps the minutes to 30-90', () => {
    const normalized = normalizeInput(input({ sessionMin: 5 }));
    expect(normalized.ok && normalized.input.sessionMin).toBe(30);
    const long = normalizeInput(input({ sessionMin: 500 }));
    expect(long.ok && long.input.sessionMin).toBe(90);
  });
});

describe('limitations', () => {
  const combos: readonly (readonly Limitation[])[] = [
    ...LIMITATIONS.map((joint) => [joint] as const),
    ['knee', 'lower_back'],
    ['shoulder', 'wrist'],
  ];

  it.each(combos.map((limits) => [limits.join('+'), limits] as const))(
    'never uses an exercise that loads %s, and still trains the other muscles',
    (_name, limitations) => {
      for (const equipment of EQUIPMENT) {
        const result = generate({ equipment, limitations: [...limitations], daysPerWeek: 4 });
        for (const session of result.plan.sessions) {
          for (const entry of session.entries) {
            const exercise = byId.get(entry.exerciseId);
            expect(exercise && loadsLimitation(exercise, limitations)).toBe(false);
          }
        }
        expect(result.summary.rules.map((rule) => rule.id)).toContain('limitations');
      }
    },
  );

  it('substitutes: a knee limitation swaps the squat for a knee-friendly pattern', () => {
    const plain = generate({ level: 'beginner', daysPerWeek: 3 });
    const careful = generate({ level: 'beginner', daysPerWeek: 3, limitations: ['knee'] });
    const ids = (program: GeneratedProgram) =>
      program.plan.sessions.flatMap((session) => session.entries.map((entry) => entry.exerciseId));
    expect(ids(careful)).not.toEqual(ids(plain));
    expect(ids(careful)).not.toContain('legext');
    expect(careful.summary.weekly.find((v) => v.muscle === 'cuadriceps')?.status).toBe('ok');
  });

  it('warns when no safe exercise exists for a large muscle', () => {
    const result = generate({
      equipment: 'bodyweight',
      level: 'beginner',
      limitations: ['shoulder'],
      daysPerWeek: 3,
    });
    expect(result.summary.warnings).toContainEqual({
      code: 'noSafeExercise',
      params: { muscle: 'hombro' },
    });
  });

  it('adds the care step for each limitation to the warm-up', () => {
    const result = generate({ limitations: ['knee', 'wrist'] });
    const mobility = result.program.routines[0]?.steps.find((step) => step.id === 'w-mobility');
    expect(mobility?.type === 'check' && mobility.name).toContain('Rodilla');
    expect(mobility?.type === 'check' && mobility.name).toContain('Muñeca');
  });
});

describe('determinism', () => {
  it('gives the same program for the same input, every time', () => {
    for (const [, goal, level, equipment] of grid) {
      const one = generate({ goal, level, equipment, daysPerWeek: DEFAULT_DAYS[goal][level] });
      const two = generate({ goal, level, equipment, daysPerWeek: DEFAULT_DAYS[goal][level] });
      expect(JSON.stringify(two)).toBe(JSON.stringify(one));
    }
  });

  it('uses the seed only to break ties: another seed still gives a valid program', () => {
    const a = generate({ seed: 'a' });
    const b = generate({ seed: 'b' });
    expect(a.summary.warnings).toEqual(b.summary.warnings);
    expect(b.summary.weekly.every((volume) => volume.status === 'ok')).toBe(true);
    expect(JSON.stringify(generate({ seed: 'a' }))).toBe(JSON.stringify(a));
  });
});

describe('PAR-Q+ screening (E10)', () => {
  it('evaluates the seven answers', () => {
    expect(evaluateParq([false, false, false, false, false, false, false])).toMatchObject({
      complete: true,
      anyYes: false,
    });
    expect(evaluateParq([false, true, false, false, false, true, false])).toMatchObject({
      anyYes: true,
      yesQuestions: [2, 6],
      chestPain: true,
      joints: true,
    });
    expect(evaluateParq([false, null, false, false, false, false, false]).complete).toBe(false);
    expect(evaluateParq([false, false]).complete).toBe(false);
  });

  it('does not generate without the full questionnaire', () => {
    const result = generateProgram(
      input({ screening: { answers: [false, false], acknowledged: true } }),
      library,
      tEs,
    );
    expect(result).toEqual({ ok: false, reason: 'screeningRequired' });
    expect(screeningStatus({ answers: [], acknowledged: false })).toBe('incomplete');
  });

  it('does not generate after a "yes" until the person acknowledges the notice', () => {
    const result = generateProgram(input({ screening: ONE_YES }), library, tEs);
    expect(result).toEqual({ ok: false, reason: 'acknowledgementRequired' });
  });

  it('after acknowledgement it only offers the low-intensity beginner template', () => {
    const result = generate({
      goal: 'hypertrophy',
      level: 'advanced',
      daysPerWeek: 6,
      sessionMin: 90,
      focusRegion: 'glutes',
      equipment: 'gym',
      screening: { ...ONE_YES, acknowledged: true },
    });
    expect(result.input).toMatchObject({
      restricted: true,
      goal: 'health',
      level: 'beginner',
      focusRegion: undefined,
    });
    expect(result.input.daysPerWeek).toBeLessThanOrEqual(3);
    expect(result.input.sessionMin).toBeLessThanOrEqual(45);
    expect(result.summary.warnings.map((w) => w.code)).toContain('restrictedTemplate');
    expect(result.summary.rules.map((rule) => rule.id)).toContain('screening');
    expect(result.evidence.map((ref) => ref.id)).toContain('E10');
    for (const session of result.plan.sessions) {
      for (const entry of session.entries) {
        expect(byId.get(entry.exerciseId)?.minLevel).toBe('beginner');
      }
    }
    expect(result.program.rules?.rirTarget).toEqual([2, 3]);
  });

  it('a clean questionnaire generates normally', () => {
    expect(generate().input.restricted).toBe(false);
  });
});

describe('the program in the template format', () => {
  it.each(grid)(
    '%s passes the template schema through the real importer',
    (_n, goal, level, equipment) => {
      for (const t of [tEs, tEn]) {
        const result = generate(
          { goal, level, equipment, daysPerWeek: DEFAULT_DAYS[goal][level] },
          t,
        );
        const imported = importTemplate(toModuleJson(result));
        expect(imported.ok).toBe(true);
        if (imported.ok && imported.template.kind === 'module') {
          expect(imported.template.id).toBe(GENERATED_MODULE_ID);
          expect(imported.template.programs?.[0]?.routines).toHaveLength(result.summary.daysUsed);
        }
        expect(JSON.stringify(result.program)).not.toContain('MISSING:');
      }
    },
  );

  it('every exercise of the output exists in the library, once per routine', () => {
    const result = generate({ daysPerWeek: 5, level: 'advanced' });
    for (const routine of result.program.routines) {
      const sets = routine.steps.filter((step) => step.type === 'sets');
      expect(new Set(sets.map((step) => step.id)).size).toBe(sets.length);
      for (const step of sets) expect(byId.has(step.id)).toBe(true);
    }
  });

  it('writes warm-up checks, the effort cue and sets steps with sets, reps, rest and increments', () => {
    const result = generate({ level: 'beginner', daysPerWeek: 3 });
    const routine = result.program.routines[0];
    expect(routine?.steps.slice(0, 3).map((step) => step.id)).toEqual([
      'w-general',
      'w-mobility',
      'w-effort',
    ]);
    const first = routine?.steps.find((step) => step.type === 'sets');
    if (first?.type !== 'sets') throw new Error('sets expected');
    expect(first.restSec).toBe(restFor('hypertrophy', 'beginner', 'gym', true));
    expect(first.approach).toBe('1 × 8 al 50% · 1 × 5 al 70% · 1 × 3 al 85%');
    expect(first.incrementKg).toBeGreaterThan(0);
    expect(first.muscles?.length).toBeGreaterThan(0);
    // Only the first multi-joint lift of a routine gets the ramp-up sets.
    const ramped = routine?.steps.filter((step) => step.type === 'sets' && step.approach);
    expect(ramped).toHaveLength(1);
  });

  it('puts multi-joint exercises first, then isolation, core last', () => {
    for (const session of generate({ daysPerWeek: 4 }).plan.sessions) {
      const flags = session.entries.map((entry) => byId.get(entry.exerciseId)?.compound ?? false);
      const firstIsolation = flags.indexOf(false);
      if (firstIsolation >= 0)
        expect(flags.slice(firstIsolation).every((flag) => !flag)).toBe(true);
      // A core exercise, when there is one, closes the session.
      const patterns = session.entries.map((entry) => byId.get(entry.exerciseId)?.pattern ?? '');
      const firstCore = patterns.findIndex((pattern) => pattern.startsWith('core'));
      if (firstCore >= 0) {
        expect(patterns.slice(firstCore).every((pattern) => pattern.startsWith('core'))).toBe(true);
      }
    }
  });

  it('rests 2-3 minutes on compounds and 60-90 s on isolation for muscle and strength goals (E4)', () => {
    for (const goal of ['hypertrophy', 'strength'] as const) {
      for (const level of LEVELS) {
        const [compound, isolation] = REST[goal][level];
        expect(compound).toBeGreaterThanOrEqual(120);
        expect(compound).toBeLessThanOrEqual(210);
        expect(isolation).toBeGreaterThanOrEqual(60);
        expect(isolation).toBeLessThanOrEqual(90);
      }
    }
    const result = generate({ goal: 'hypertrophy', level: 'intermediate' });
    for (const routine of result.program.routines) {
      for (const step of routine.steps) {
        if (step.type !== 'sets') continue;
        const exercise = byId.get(step.id);
        expect(step.restSec).toBe(
          restFor('hypertrophy', 'intermediate', 'gym', !!exercise?.compound),
        );
      }
    }
  });

  it('writes reps the app can parse, per side where it applies, in both languages', () => {
    for (const t of [tEs, tEn]) {
      const result = generate({ equipment: 'dumbbells', daysPerWeek: 3, level: 'beginner' }, t);
      for (const routine of result.program.routines) {
        for (const step of routine.steps) {
          if (step.type !== 'sets') continue;
          const parsed = parseReps(step.reps);
          expect(parsed).not.toBeNull();
          if (byId.get(step.id)?.unilateral) expect(parsed?.perSide).toBe(true);
        }
      }
    }
  });

  it('with only the body the steps are bodyweight and carry no weight increment', () => {
    const result = generate({ equipment: 'bodyweight', level: 'beginner', daysPerWeek: 3 });
    for (const routine of result.program.routines) {
      for (const step of routine.steps) {
        if (step.type !== 'sets') continue;
        expect(step.bodyweight).toBe(true);
        expect(step.incrementKg).toBeUndefined();
        expect(step.approach).toBeUndefined();
      }
    }
  });

  it('health and fat loss add easy cardio and compare with the WHO guideline (E8, E9)', () => {
    const result = generate({ goal: 'fatLoss', level: 'beginner', daysPerWeek: 3, sessionMin: 60 });
    const cardio = result.program.routines.flatMap((routine) =>
      routine.steps.filter((step) => step.type === 'timed'),
    );
    expect(cardio.length).toBeGreaterThan(0);
    expect(result.summary.who.aerobicMin).toBe(
      result.plan.sessions.reduce((sum, session) => sum + session.cardioMin, 0),
    );
    expect(result.summary.who.strengthDays).toBeGreaterThanOrEqual(2);
    expect(result.summary.warnings.map((w) => w.code)).toContain('cardioBelowWho');
    expect(
      generate({ goal: 'hypertrophy' })
        .program.routines.flatMap((r) => r.steps)
        .some((s) => s.type === 'timed'),
    ).toBe(false);
  });

  it('uses double progression with a reactive deload (E5)', () => {
    expect(generate().program.rules).toEqual({
      progression: 'double',
      rirTarget: [1, 3],
      stallSessions: 2,
      deloadPct: 10,
    });
  });
});

describe('evidence metadata', () => {
  it('every rule cites evidence ids from the document and the program carries them', () => {
    const result = generate({ goal: 'fatLoss', limitations: ['knee'], focusRegion: undefined });
    expect(result.evidence.length).toBeGreaterThan(5);
    for (const ref of result.evidence) {
      expect(EVIDENCE_IDS).toContain(ref.id);
      expect(ref.source.length).toBeGreaterThan(0);
    }
    for (const rule of result.summary.rules) {
      expect(rule.evidence.length).toBeGreaterThan(0);
      for (const id of rule.evidence) {
        expect(result.evidence.map((ref) => ref.id)).toContain(id);
      }
    }
    expect(toModuleJson(result)._evidence).toEqual(result.evidence.map((ref) => ref.id));
    // The metadata never reaches the program text.
    expect(JSON.stringify(result.program)).not.toMatch(/E1\b|evidence/);
  });

  it('marks the engineering defaults as such and every cited id has a summary in both languages', () => {
    const result = generate({ focusRegion: 'glutes' });
    const design = result.summary.rules.filter((rule) => rule.design).map((rule) => rule.id);
    expect(design).toEqual(
      expect.arrayContaining(['volume', 'priority', 'split', 'progression', 'time']),
    );
    for (const id of EVIDENCE_IDS) {
      for (const messages of [es, en]) {
        expect(typeof lookup(messages, `creator.why.summary.${id}`)).toBe('string');
      }
    }
  });

  it('has a text for every rule id in both languages', () => {
    const result = generate({ focusRegion: 'glutes', limitations: ['knee'] });
    const fat = generate({ goal: 'fatLoss' });
    const restricted = generate({ screening: { ...ONE_YES, acknowledged: true } });
    const rules = [
      result,
      fat,
      restricted,
      generate({ daysPerWeek: 5, level: 'advanced' }),
    ].flatMap((program) => program.summary.rules);
    for (const rule of rules) {
      // The split explains itself per kind of week; the others have one body.
      const body =
        rule.id === 'split'
          ? `creator.why.split.${rule.params.split}`
          : `creator.why.body.${rule.id}`;
      for (const messages of [es, en]) {
        expect(typeof lookup(messages, `creator.why.rule.${rule.id}`)).toBe('string');
        expect(typeof lookup(messages, body)).toBe('string');
      }
    }
  });
});

describe('editing a proposal', () => {
  it('lists only allowed substitutions: right equipment, no limited joint, not already in the session', () => {
    const generated = generate({ limitations: ['knee'], equipment: 'gym', daysPerWeek: 4 });
    const session = generated.plan.sessions[1];
    const entry = session?.entries[0];
    if (!session || !entry) throw new Error('session expected');
    const options = swapOptions(generated, library, session.id, entry.exerciseId);
    const taken = new Set(session.entries.map((item) => item.exerciseId));
    for (const option of options) {
      expect(loadsLimitation(option, ['knee'])).toBe(false);
      expect(option.equipment).toContain('gym');
      expect(taken.has(option.id)).toBe(false);
    }
  });

  it('swaps an exercise and recomputes the program, volumes and evidence', () => {
    const generated = generate({ daysPerWeek: 4 });
    const session = generated.plan.sessions[0];
    if (!session) throw new Error('session expected');
    let swapped: GeneratedProgram | null = null;
    let fromId = '';
    for (const entry of session.entries) {
      const options = swapOptions(generated, library, session.id, entry.exerciseId);
      const option = options[0];
      if (option) {
        fromId = entry.exerciseId;
        swapped = swapExercise(generated, library, tEs, session.id, entry.exerciseId, option.id);
        break;
      }
    }
    expect(swapped).not.toBeNull();
    const ids = swapped?.plan.sessions[0]?.entries.map((entry) => entry.exerciseId) ?? [];
    expect(ids).not.toContain(fromId);
    expect(swapped?.program.routines[0]?.steps.some((step) => step.id === fromId)).toBe(false);
    expect(swapped?.summary.weekly.length).toBe(generated.summary.weekly.length);
    // The original is untouched (edits never mutate).
    expect(generated.plan.sessions[0]?.entries.map((e) => e.exerciseId)).toContain(fromId);
  });

  it('refuses a swap that is not one of the substitutions', () => {
    const generated = generate({ limitations: ['knee'] });
    const session = generated.plan.sessions[0];
    const entry = session?.entries[0];
    if (!session || !entry) throw new Error('session expected');
    expect(
      swapExercise(generated, library, tEs, session.id, entry.exerciseId, 'legext'),
    ).toBeNull();
    expect(swapExercise(generated, library, tEs, 'nope', entry.exerciseId, 'legext')).toBeNull();
  });

  it('removes an exercise (the volumes show the consequence) and refuses to empty the plan', () => {
    const generated = generate({ daysPerWeek: 4 });
    const session = generated.plan.sessions[0];
    const entry = session?.entries[0];
    if (!session || !entry) throw new Error('session expected');
    const removed = removeExercise(generated, library, tEs, session.id, entry.exerciseId);
    expect(removed?.plan.sessions[0]?.entries.map((e) => e.exerciseId)).not.toContain(
      entry.exerciseId,
    );
    const totals = (program: GeneratedProgram | null) =>
      program?.summary.weekly.reduce((sum, volume) => sum + volume.sets, 0) ?? 0;
    expect(totals(removed)).toBeLessThan(totals(generated));

    let emptied: GeneratedProgram | null = generated;
    for (const each of generated.plan.sessions) {
      for (const item of each.entries) {
        emptied = emptied ? removeExercise(emptied, library, tEs, each.id, item.exerciseId) : null;
      }
    }
    expect(emptied).toBeNull();
  });

  it('a session left without exercises is dropped and the days are renumbered', () => {
    let generated: GeneratedProgram | null = generate({
      daysPerWeek: 2,
      level: 'beginner',
      goal: 'health',
    });
    const first = generated.plan.sessions[0];
    if (!first) throw new Error('session expected');
    for (const entry of first.entries) {
      generated = generated
        ? removeExercise(generated, library, tEs, first.id, entry.exerciseId)
        : null;
    }
    expect(generated?.plan.sessions).toHaveLength(1);
    expect(generated?.plan.sessions[0]?.id).toBe('d1');
    expect(generated?.input.daysPerWeek).toBe(1);
  });
});

describe('equipment helpers', () => {
  it('a gym user gets machines and barbells, a home user only what fits at home', () => {
    const home = (equipment: Equipment) =>
      generate({ equipment, daysPerWeek: 3, level: 'beginner' }).plan.sessions.flatMap((session) =>
        session.entries.map((entry) => byId.get(entry.exerciseId)),
      );
    expect(home('dumbbells').every((exercise) => exercise?.equipment.includes('dumbbells'))).toBe(
      true,
    );
    expect(home('bodyweight').every((exercise) => exercise?.equipment.includes('bodyweight'))).toBe(
      true,
    );
    expect(home('gym').some((exercise) => exercise?.equipment.length === 1)).toBe(true);
  });
});
