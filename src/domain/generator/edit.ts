// Edits of a generated plan before it is accepted: swap an exercise for one of its substitutions,
// or remove it. The result is always a full `GeneratedProgram` again (program, volumes, warnings
// and evidence recomputed), so the preview shows the real consequence of the edit.
import { finalize } from './generate';
import { eligibleExercises, type Exercise, type ExerciseLibrary } from './library';
import { FOCUS } from './plan';
import type { GeneratedProgram, Plan, TextResolver } from './types';

/** The substitutions of an exercise that are allowed here and fit the session (no duplicates). */
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
  return current.substitutions.flatMap((id) => {
    const option = allowed.get(id);
    return option && !taken.has(id) && option.muscles.primary.every((muscle) => focus.has(muscle))
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

/**
 * The generated program as a module in the template file format, ready for the importer. The
 * evidence refs ride in `_evidence` (a comment key the importer strips): metadata, never UI.
 */
export function toModuleJson(generated: GeneratedProgram): Record<string, unknown> {
  return {
    schemaVersion: 2,
    kind: 'module',
    id: GENERATED_MODULE_ID,
    name: 'Gym',
    icon: 'Barbell',
    programs: [generated.program],
    _evidence: generated.evidence.map((ref) => ref.id),
  };
}
