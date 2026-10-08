// Edits of a generated plan before it is accepted: swap an exercise for one of its substitutions,
// or remove it. The result is always a full `GeneratedProgram` again (program, volumes, warnings
// and evidence recomputed), so the preview shows the real consequence of the edit.
import { finalize } from './generate';
import { eligibleExercises, type Exercise, type ExerciseLibrary } from './library';
import { FOCUS, SINGLE_PER_SESSION, sessionMinutes } from './plan';
import { GENERATED_PROGRAM_ID } from './program';
import type { GeneratedProgram, Plan, TextResolver } from './types';

/**
 * The substitutions of an exercise that are allowed here, fit the session (no duplicates, no second
 * calves / glute medius exercise) and keep it inside the time budget: swapping a 2-minute set for a
 * slower exercise must not push the session over the minutes the person asked for.
 */
export function swapOptions(
  generated: GeneratedProgram,
  library: ExerciseLibrary,
  sessionId: string,
  exerciseId: string,
): Exercise[] {
  const session = generated.plan.sessions.find((candidate) => candidate.id === sessionId);
  const current = library.find((exercise) => exercise.id === exerciseId);
  if (!session || !current) return [];
  const allowed = new Map(
    eligibleExercises(library, generated.input).map((exercise) => [exercise.id, exercise]),
  );
  const focus = new Set(FOCUS[session.kind]);
  const taken = new Set(session.entries.map((entry) => entry.exerciseId));
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const others = session.entries.filter((entry) => entry.exerciseId !== exerciseId);
  const otherPatterns = new Set(others.map((entry) => byId.get(entry.exerciseId)?.pattern));
  // Reserved (mandatory) cardio keeps its minutes; optional cardio is recomputed after the edit.
  const reservedCardio = session.cardioOptional ? 0 : session.cardioMin;
  return current.substitutions.flatMap((id) => {
    const option = allowed.get(id);
    if (!option || taken.has(id)) return [];
    if (!option.muscles.primary.every((muscle) => focus.has(muscle))) return [];
    if (SINGLE_PER_SESSION.includes(option.pattern) && otherPatterns.has(option.pattern)) {
      return [];
    }
    const swapped = {
      ...session,
      cardioMin: reservedCardio,
      entries: session.entries.map((entry) =>
        entry.exerciseId === exerciseId ? { ...entry, exerciseId: id } : entry,
      ),
    };
    return sessionMinutes(swapped, byId, generated.input) <= generated.input.sessionMin + 1e-9
      ? [option]
      : [];
  });
}

function withPlan(
  generated: GeneratedProgram,
  library: ExerciseLibrary,
  t: TextResolver,
  plan: Plan,
): GeneratedProgram | null {
  if (plan.sessions.every((session) => session.entries.length === 0)) return null;
  return finalize(generated.input, plan, library, t, generated.summary.daysRequested);
}

const clonePlan = (plan: Plan): Plan => ({
  sessions: plan.sessions.map((session) => ({
    ...session,
    entries: session.entries.map((entry) => ({ ...entry })),
  })),
});

/** `null` when the replacement is not one of the allowed options. */
export function swapExercise(
  generated: GeneratedProgram,
  library: ExerciseLibrary,
  t: TextResolver,
  sessionId: string,
  exerciseId: string,
  replacementId: string,
): GeneratedProgram | null {
  const allowed = swapOptions(generated, library, sessionId, exerciseId);
  if (!allowed.some((option) => option.id === replacementId)) return null;
  const plan = clonePlan(generated.plan);
  const entry = plan.sessions
    .find((session) => session.id === sessionId)
    ?.entries.find((candidate) => candidate.exerciseId === exerciseId);
  if (!entry) return null;
  entry.exerciseId = replacementId;
  return withPlan(generated, library, t, plan);
}

/** `null` when nothing would be left to train. */
export function removeExercise(
  generated: GeneratedProgram,
  library: ExerciseLibrary,
  t: TextResolver,
  sessionId: string,
  exerciseId: string,
): GeneratedProgram | null {
  const plan = clonePlan(generated.plan);
  const session = plan.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return null;
  session.entries = session.entries.filter((entry) => entry.exerciseId !== exerciseId);
  return withPlan(generated, library, t, plan);
}

export const GENERATED_MODULE_ID = 'gym-generated';
export { GENERATED_PROGRAM_ID };

/**
 * The generated program as a module in the template file format, ready for the importer. The
 * evidence refs ride in `_evidence` (a comment key the importer strips): metadata, never UI.
 */
export function toModuleJson(
  generated: GeneratedProgram,
  t: TextResolver,
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    kind: 'module',
    id: GENERATED_MODULE_ID,
    name: t('generator.module.name'),
    icon: 'Barbell',
    programs: [generated.program],
    _evidence: generated.evidence.map((ref) => ref.id),
  };
}
