import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { generateProgram } from '../domain/generator/generate';
import type { GeneratedProgram, TextResolver } from '../domain/generator/types';
import { pickProgram } from '../gym/program';
import { loadExerciseLibrary } from '../templates/exercises';
import { loadDefaultTemplates } from '../templates/defaults';

import { acceptGenerated, historyImpact, loadAcceptContext, prepareAccept } from './accept';
import { defaultsFrom, loadWizardDefaults } from './defaults';
import { routinesOf, volumeRows } from './previewView';

const lookup = (messages: object, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
const text =
  (messages: object): TextResolver =>
  (key, params) =>
    String(lookup(messages, key) ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(params?.[name] ?? ''),
    );

const library = loadExerciseLibrary();
const CLEAR = { answers: [false, false, false, false, false, false, false], acknowledged: false };

let db: Db;
let repos: Repositories;
let close: () => void;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  close = test.close;
  repos = createRepositories(db);
  await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
});

afterEach(() => close());

function generate(
  overrides: Partial<Parameters<typeof generateProgram>[0]> = {},
): GeneratedProgram {
  const result = generateProgram(
    {
      goal: 'hypertrophy',
      level: 'intermediate',
      daysPerWeek: 4,
      sessionMin: 60,
      equipment: 'gym',
      limitations: [],
      screening: CLEAR,
      ...overrides,
    },
    library,
    text(es),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

async function logSet(stepId: string, date: string) {
  const at = new Date(`${date}T08:00:00`).getTime();
  const id = await repos.workouts.createSession({
    programId: 'glute-4d',
    routineId: 'd1',
    date,
    startedAt: at,
  });
  await repos.workouts.logSet({
    sessionId: id,
    stepId,
    setIndex: 0,
    reps: 8,
    weightKg: 40,
    rir: 2,
    doneAt: at + 1,
  });
  await repos.workouts.finishSession(id, at + 3_600_000);
}

describe('wizard defaults', () => {
  it('map the onboarding answers and the planned gym days', () => {
    expect(
      defaultsFrom({ goal: 'grasa', level: 'avanzado' }, [
        { days: [1, 3, 5], anchor: 'gymMorning' },
      ]),
    ).toEqual({ goal: 'fatLoss', level: 'advanced', daysPerWeek: 3, sessionMin: 60 });
    expect(defaultsFrom({ goal: 'musculo', level: 'principiante' }, [])).toMatchObject({
      goal: 'hypertrophy',
      level: 'beginner',
      daysPerWeek: 3,
    });
    expect(
      defaultsFrom({}, [{ days: [0, 1, 2, 3, 4, 5, 6], anchor: 'gymMorning' }]).daysPerWeek,
    ).toBe(6);
    expect(defaultsFrom({ goal: 'x', level: 'y' }, []).goal).toBe('hypertrophy');
  });

  it('are read from the stored profile and settings', async () => {
    await repos.profile.save({ goal: 'fuerza', level: 'intermedio' });
    await repos.settings.set('gymDays', [{ days: [1, 2, 4, 5], anchor: 'gymMorning' }]);
    expect(await loadWizardDefaults(repos)).toMatchObject({
      goal: 'strength',
      level: 'intermediate',
      daysPerWeek: 4,
    });
  });
});

describe('the preview view model', () => {
  it('lists routines with their exercises and the volume rows of the evidence table', () => {
    const generated = generate();
    const routines = routinesOf(generated);
    expect(routines).toHaveLength(4);
    expect(routines[0]?.lines.length).toBeGreaterThan(2);
    expect(routines[0]?.lines[0]).toMatchObject({ sessionId: 'd1' });
    expect(volumeRows(generated).map((row) => row.muscle)).toContain('gluteo');
  });
});

describe('accepting a proposal', () => {
  it('keeps the history of exercises with the same step id and lists the ones that disappear', async () => {
    await logSet('rdl', '2026-10-01'); // the default glute program has an `rdl` step
    await logSet('abd', '2026-10-02');
    await logSet('kick', '2026-10-03');
    const generated = generate({ goal: 'hypertrophy', focusRegion: 'glutes' });
    const ids = new Set(
      generated.program.routines.flatMap((routine) => routine.steps.map((step) => step.id)),
    );
    const prepared = prepareAccept(generated, await loadAcceptContext(repos));
    if (!prepared.ok) throw new Error('should be valid');
    const keptIds = prepared.impact.kept.map((item) => item.id).sort();
    const lostIds = prepared.impact.lost.map((item) => item.id).sort();
    expect([...keptIds, ...lostIds].sort()).toEqual(['abd', 'kick', 'rdl']);
    for (const id of keptIds) expect(ids.has(id)).toBe(true);
    for (const id of lostIds) expect(ids.has(id)).toBe(false);
    expect(prepared.items[0]?.module.id).toBe('gym-generated');
    expect(prepared.items[0]?.routines).toBe(4);
  });

  it('historyImpact only looks at exercises that have logged sets', async () => {
    const context = await loadAcceptContext(repos);
    expect(historyImpact(context, new Set())).toEqual({ kept: [], lost: [] });
  });

  it('stores the proposal as the active program through the program import path', async () => {
    await logSet('rdl', '2026-10-01');
    const generated = generate();
    const prepared = prepareAccept(generated, await loadAcceptContext(repos));
    if (!prepared.ok) throw new Error('should be valid');
    const result = await acceptGenerated(db, repos, prepared.items);
    expect(result.saved).toEqual(['gym-generated']);

    const modules = await repos.templates.listModules();
    expect(modules.find((module) => module.id === 'gym')?.active).toBe(false);
    expect(modules.find((module) => module.id === 'gym-generated')?.active).toBe(true);
    const trained = pickProgram(modules);
    expect(trained?.id).toBe(generated.program.id);
    expect(trained?.routines).toHaveLength(generated.program.routines.length);
    expect(trained?.rules).toEqual({ stallSessions: 2, deloadPct: 10 });
    // The history is keyed by step id, so it is still there for the shared exercises.
    expect(await repos.workouts.loggedStepIds()).toContain('rdl');
  });

  it('a second proposal replaces the first one instead of piling up', async () => {
    for (const days of [3, 4]) {
      const prepared = prepareAccept(
        generate({ daysPerWeek: days }),
        await loadAcceptContext(repos),
      );
      if (!prepared.ok) throw new Error('should be valid');
      await acceptGenerated(db, repos, prepared.items);
    }
    const modules = await repos.templates.listModules();
    expect(modules.filter((module) => module.id === 'gym-generated')).toHaveLength(1);
    expect(pickProgram(modules)?.routines).toHaveLength(4);
  });

  it('writes the same program in English when the language is English', () => {
    const result = generateProgram(
      {
        goal: 'health',
        level: 'beginner',
        daysPerWeek: 2,
        sessionMin: 45,
        equipment: 'dumbbells',
        limitations: [],
        screening: CLEAR,
      },
      library,
      text(en),
    );
    if (!result.ok) throw new Error('should generate');
    expect(result.value.program.name).toBe('My routine: General health, 2 days');
    expect(JSON.stringify(result.value.program)).toContain('Goblet squat');
  });
});
