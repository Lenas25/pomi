// `generateProgram(input)`: a few answers in, a program in the template JSON format out. Pure and
// deterministic (same input, same program). Every rule cites an evidence id `E<n>` = section `<n>`
// of docs/evidence/training.md; items the document marks [DESIGN] are labelled as defaults.
import type { Exercise, ExerciseLibrary } from './library';
import { screeningStatus } from './parq';
import { buildPlan, clampSessionMin, orderEntries, resolveDays } from './plan';
import { renderProgram } from './program';
import { assignCardio, evidenceOf, summarize } from './summary';
import {
  LIMITATIONS,
  type EffectiveInput,
  type GeneratedProgram,
  type GenerationFailure,
  type GeneratorInput,
  type GenerationResult,
  type Plan,
  type TextResolver,
} from './types';

export const DEFAULT_SEED = 'pomi';
/** E10: the low-intensity beginner template that a PAR-Q+ "yes" is limited to. */
const RESTRICTED = { days: 3, sessionMin: 45 } as const;

type Normalized =
  | { ok: true; input: EffectiveInput; requestedDays: number }
  | { ok: false; reason: GenerationFailure };

/** Applies the limits (days, minutes, goal and level) and the PAR-Q+ gate (E10, E12). */
export function normalizeInput(input: GeneratorInput): Normalized {
  const status = screeningStatus(input.screening);
  if (status === 'incomplete') return { ok: false, reason: 'screeningRequired' };
  if (status === 'acknowledgementRequired') {
    return { ok: false, reason: 'acknowledgementRequired' };
  }
  const restricted = status === 'restricted';

  const goal = restricted ? 'health' : input.goal;
  const level = restricted ? 'beginner' : input.level;
  const resolved = resolveDays(goal, level, input.daysPerWeek);
  const days = restricted ? Math.min(resolved.used, RESTRICTED.days) : resolved.used;
  const sessionMin = clampSessionMin(
    restricted ? Math.min(input.sessionMin, RESTRICTED.sessionMin) : input.sessionMin,
  );
  return {
    ok: true,
    requestedDays: resolved.requested,
    input: {
      goal,
      focusRegion: restricted || goal !== 'hypertrophy' ? undefined : input.focusRegion,
      level,
      daysPerWeek: days,
      sessionMin,
      equipment: input.equipment,
      limitations: LIMITATIONS.filter((joint) => input.limitations.includes(joint)),
      seed: input.seed ?? DEFAULT_SEED,
      restricted,
    },
  };
}

/** Renumbers the sessions (ids `d1`.., letters per kind) after some were dropped or edited. */
function renumber(plan: Plan): Plan {
  const letters = new Map<string, number>();
  return {
    sessions: plan.sessions.map((session, index) => {
      const count = letters.get(session.kind) ?? 0;
      letters.set(session.kind, count + 1);
      return { ...session, id: `d${index + 1}`, letter: String.fromCharCode(65 + count) };
    }),
  };
}

/** Everything derived from a plan: cardio, the program, the summary and the evidence refs. */
export function finalize(
  input: EffectiveInput,
  plan: Plan,
  library: ExerciseLibrary,
  t: TextResolver,
  requestedDays: number,
): GeneratedProgram {
  const byId: ReadonlyMap<string, Exercise> = new Map(
    library.map((exercise) => [exercise.id, exercise]),
  );
  const ready = renumber({
    sessions: plan.sessions.filter((session) => session.entries.length > 0),
  });
  const effective: EffectiveInput = { ...input, daysPerWeek: ready.sessions.length };
  for (const session of ready.sessions) orderEntries(session, byId);
  assignCardio(ready, byId, effective);
  const summary = summarize(effective, ready, library, requestedDays);
  return {
    input: effective,
    plan: ready,
    program: renderProgram(ready.sessions, byId, effective, t),
    evidence: evidenceOf(summary.rules),
    summary,
  };
}

export function generateProgram(
  input: GeneratorInput,
  library: ExerciseLibrary,
  t: TextResolver,
): GenerationResult {
  const normalized = normalizeInput(input);
  if (!normalized.ok) return normalized;
  const plan = buildPlan(normalized.input, library);
  if (plan.sessions.every((session) => session.entries.length === 0)) {
    return { ok: false, reason: 'noExercises' };
  }
  return {
    ok: true,
    value: finalize(normalized.input, plan, library, t, normalized.requestedDays),
  };
}
