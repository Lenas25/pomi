// Pure view helpers for the Gym bento hub and its detail pages (week count, session history).
import { format, parseISO, startOfISOWeek } from 'date-fns';

import type { LocalizedText } from '../templates/localized';
import type { GymProgram } from './program';

type SessionRow = {
  session: { id: number; routineId: string; date: string; finishedAt: number | null };
  sets: readonly {
    stepId: string;
    setIndex: number;
    weightKg: number | null;
    reps: number | null;
  }[];
};

export type HistorySet = { weightKg: number | null; reps: number };

export type HistoryExercise = {
  stepId: string;
  /** Step name from the current program; `null` when the program no longer has that step. */
  name: LocalizedText | null;
  sets: HistorySet[];
};

export type HistoryEntry = {
  id: number;
  date: string;
  /** Routine name from the current program; `null` for a routine it no longer has. */
  routineName: LocalizedText | null;
  setCount: number;
  /** Σ kg × reps (bodyweight sets add nothing). */
  volumeKg: number;
  exercises: HistoryExercise[];
};

const weekOf = (day: string) => format(startOfISOWeek(parseISO(day)), 'yyyy-MM-dd');

const loggedSets = (row: SessionRow) => row.sets.filter((set) => (set.reps ?? 0) > 0);

/** Sessions with at least one logged set in the ISO week of `today` (open ones included). */
export function sessionsThisWeek(rows: readonly SessionRow[], today: string): number {
  const week = weekOf(today);
  return rows.filter((row) => weekOf(row.session.date) === week && loggedSets(row).length > 0)
    .length;
}

/** Sessions with logged sets, newest first, with sets grouped by exercise in logging order. */
export function historyEntries(
  rows: readonly SessionRow[],
  program: Pick<GymProgram, 'routines'> | null,
): HistoryEntry[] {
  const routines = program?.routines ?? [];
  const stepNames = new Map<string, LocalizedText>();
  for (const routine of routines)
    for (const step of routine.steps)
      if (!stepNames.has(step.id)) stepNames.set(step.id, step.name);

  return rows.flatMap((row) => {
    const sets = loggedSets(row);
    if (sets.length === 0) return [];
    const byStep = new Map<string, HistoryExercise>();
    for (const set of [...sets].sort((a, b) => a.setIndex - b.setIndex)) {
      const exercise = byStep.get(set.stepId) ?? {
        stepId: set.stepId,
        name: stepNames.get(set.stepId) ?? null,
        sets: [],
      };
      exercise.sets.push({ weightKg: set.weightKg, reps: set.reps ?? 0 });
      byStep.set(set.stepId, exercise);
    }
    return [
      {
        id: row.session.id,
        date: row.session.date,
        routineName: routines.find((routine) => routine.id === row.session.routineId)?.name ?? null,
        setCount: sets.length,
        volumeKg: sets.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
        exercises: [...byStep.values()],
      },
    ];
  });
}
