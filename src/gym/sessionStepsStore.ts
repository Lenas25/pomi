// Warm-up / cardio steps checked off during a session, kept in memory so leaving the session
// screen and resuming it (same day, same routine) keeps them. Only today's open session of a
// routine can be resumed, so `day:routineId` identifies it even before its first set creates the
// database row. Cleared when the session is finished; an app restart starts them over.
const doneByKey = new Map<string, ReadonlySet<string>>();

const EMPTY: ReadonlySet<string> = new Set();

export function sessionStepsKey(day: string, routineId: string): string {
  return `${day}:${routineId}`;
}

export function getDoneSteps(key: string): ReadonlySet<string> {
  return doneByKey.get(key) ?? EMPTY;
}

export function saveDoneSteps(key: string, done: ReadonlySet<string>): void {
  if (done.size === 0) doneByKey.delete(key);
  else doneByKey.set(key, done);
}

export function clearDoneSteps(key: string): void {
  doneByKey.delete(key);
}
