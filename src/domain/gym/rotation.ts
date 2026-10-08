// Which routine is today's? (PLAN §9.4 "Rotación")

export type RotationSession = {
  routineId: string;
  /** Day key `yyyy-MM-dd`. */
  date: string;
  startedAt: number;
  /** `null` while unfinished. */
  finishedAt: number | null;
  /** Sets logged in the session. */
  setCount: number;
};

/**
 * Today's routine is, in order:
 *  1. the routine with sets logged today (if several, the most recently started);
 *  2. the next routine after the last COMPLETED session, wrapping around;
 *  3. the first routine when there is no completed history (or its routine no longer exists).
 * `routineIds` is the program order. Returns `null` for a program without routines.
 */
export function todaysRoutineId(
  routineIds: readonly string[],
  sessions: readonly RotationSession[],
  today: string,
): string | null {
  const first = routineIds[0];
  if (first === undefined) return null;

  const loggedToday = sessions
    .filter((s) => s.date === today && s.setCount > 0 && routineIds.includes(s.routineId))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (loggedToday) return loggedToday.routineId;

  const lastCompleted = sessions
    .filter((s) => s.finishedAt !== null && routineIds.includes(s.routineId))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!lastCompleted) return first;

  const index = routineIds.indexOf(lastCompleted.routineId);
  return routineIds[(index + 1) % routineIds.length] ?? first;
}
