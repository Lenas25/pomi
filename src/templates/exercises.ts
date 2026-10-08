// Loads and validates the exercise library (`templates/exercises.json`), the data behind the
// routine generator. Like the bundled templates, a shipped file that does not validate throws.
import exercisesJson from '../../templates/exercises.json';
import {
  exerciseLibrarySchema,
  type ExerciseLibrary,
} from '../domain/generator/library';

/** Top-level keys that start with `_` are author comments (same convention as the templates). */
function withoutComments(json: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(json).filter(([key]) => !key.startsWith('_')));
}

export type LibraryResult =
  | { ok: true; library: ExerciseLibrary }
  | { ok: false; problems: string[] };

export function parseExerciseLibrary(json: unknown): LibraryResult {
  const parsed = exerciseLibrarySchema.safeParse(
    typeof json === 'object' && json !== null ? withoutComments(json) : json,
  );
  if (parsed.success) return { ok: true, library: parsed.data.exercises };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`),
  };
}

let cached: ExerciseLibrary | undefined;

export function loadExerciseLibrary(): ExerciseLibrary {
  if (cached) return cached;
  const result = parseExerciseLibrary(exercisesJson);
  if (!result.ok) {
    throw new Error(`Bundled exercise library is invalid: ${result.problems.join('; ')}`);
  }
  cached = result.library;
  return cached;
}
