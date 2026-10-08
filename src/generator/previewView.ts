// View model of the proposal preview: pure functions over a `GeneratedProgram`, so the screen only
// lays things out. Texts are i18n keys + params.
import { exerciseIdOfStep } from '../domain/generator/program';
import type {
  GeneratedProgram,
  MuscleVolume,
  RuleRef,
  SessionKind,
} from '../domain/generator/types';
import { localizedText } from '../templates/localized';

export type ExerciseLine = {
  sessionId: string;
  /** The LIBRARY exercise (the step id may carry an equipment / rep family suffix). */
  exerciseId: string;
  sets: number;
  reps: string;
};

export type RoutineView = {
  id: string;
  kind: SessionKind;
  name: string;
  minutes: number;
  lines: ExerciseLine[];
  cardioMin: number;
};

/** `language` picks the text of the bilingual program (`{ es, en }`, see `renderBilingual`). */
export function routinesOf(generated: GeneratedProgram, language = 'es'): RoutineView[] {
  return generated.program.routines.map((routine) => {
    const session = generated.plan.sessions.find((candidate) => candidate.id === routine.id);
    const summary = generated.summary.sessions.find((candidate) => candidate.id === routine.id);
    return {
      id: routine.id,
      kind: session?.kind ?? 'full',
      name: localizedText(routine.name, language),
      minutes: summary?.minutes ?? 0,
      cardioMin: session?.cardioMin ?? 0,
      lines: routine.steps.flatMap((step) =>
        step.type === 'sets'
          ? [
              {
                sessionId: routine.id,
                exerciseId: exerciseIdOfStep(step.id),
                sets: step.sets,
                reps: localizedText(step.reps, language),
              },
            ]
          : [],
      ),
    };
  });
}

/** Rows of the weekly volume table, largest muscles first (the order of the evidence table). */
export function volumeRows(generated: GeneratedProgram): MuscleVolume[] {
  return generated.summary.weekly;
}

/** The rules to explain, with the split rule carrying the kind of week in its params. */
export function rulesToExplain(generated: GeneratedProgram): RuleRef[] {
  return generated.summary.rules;
}
