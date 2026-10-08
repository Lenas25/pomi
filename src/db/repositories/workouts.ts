import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm';

import { setLogs, workoutSessions } from '../schema';
import type { Db } from '../types';

export type WorkoutSessionRow = typeof workoutSessions.$inferSelect;
export type SetLogRow = typeof setLogs.$inferSelect;

export type NewSession = {
  programId: string;
  routineId: string;
  /** Day key `yyyy-MM-dd`. */
  date: string;
  startedAt: number;
};

export type SetLogInput = {
  sessionId: number;
  stepId: string;
  setIndex: number;
  weightKg?: number | null;
  reps?: number | null;
  rir?: number | null;
  durationSec?: number | null;
  doneAt: number;
};

export type SessionWithSets = { session: WorkoutSessionRow; sets: SetLogRow[] };

export function createWorkoutsRepository(db: Db) {
  async function setsFor(sessionIds: number[]): Promise<SetLogRow[]> {
    if (sessionIds.length === 0) return [];
    return db
      .select()
      .from(setLogs)
      .where(inArray(setLogs.sessionId, sessionIds))
      .orderBy(asc(setLogs.stepId), asc(setLogs.setIndex));
  }

  return {
    async createSession(input: NewSession): Promise<number> {
      const rows = await db
        .insert(workoutSessions)
        .values(input)
        .returning({ id: workoutSessions.id });
      const row = rows[0];
      if (!row) throw new Error('Failed to create workout session');
      return row.id;
    },

    async finishSession(sessionId: number, finishedAt: number): Promise<void> {
      await db.update(workoutSessions).set({ finishedAt }).where(eq(workoutSessions.id, sessionId));
    },

    async getSession(sessionId: number): Promise<SessionWithSets | undefined> {
      const rows = await db.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId));
      const session = rows[0];
      if (!session) return undefined;
      return { session, sets: await setsFor([session.id]) };
    },

    /** Inserts or overwrites the log for (session, step, setIndex). */
    async logSet(input: SetLogInput): Promise<void> {
      const values = {
        sessionId: input.sessionId,
        stepId: input.stepId,
        setIndex: input.setIndex,
        weightKg: input.weightKg ?? null,
        reps: input.reps ?? null,
        rir: input.rir ?? null,
        durationSec: input.durationSec ?? null,
        doneAt: input.doneAt,
      };
      await db
        .insert(setLogs)
        .values(values)
        .onConflictDoUpdate({
          target: [setLogs.sessionId, setLogs.stepId, setLogs.setIndex],
          set: {
            weightKg: values.weightKg,
            reps: values.reps,
            rir: values.rir,
            durationSec: values.durationSec,
            doneAt: values.doneAt,
          },
        });
    },

    async unlogSet(sessionId: number, stepId: string, setIndex: number): Promise<void> {
      await db
        .delete(setLogs)
        .where(
          and(
            eq(setLogs.sessionId, sessionId),
            eq(setLogs.stepId, stepId),
            eq(setLogs.setIndex, setIndex),
          ),
        );
    },

    /**
     * Most recent FINISHED session (by start time, then id) that has at least one set logged for
     * `stepId`. Abandoned sessions (no `finishedAt`) never count as history. `excludeSessionId`
     * skips the session in progress. `sets` holds only that step's sets.
     */
    async lastSessionForStep(
      stepId: string,
      excludeSessionId?: number,
    ): Promise<SessionWithSets | undefined> {
      const conditions = [eq(setLogs.stepId, stepId), isNotNull(workoutSessions.finishedAt)];
      if (excludeSessionId !== undefined) conditions.push(ne(workoutSessions.id, excludeSessionId));

      const rows = await db
        .select({ session: workoutSessions })
        .from(setLogs)
        .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
        .where(and(...conditions))
        .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
        .limit(1);

      const match = rows[0];
      if (!match) return undefined;
      const sets = (await setsFor([match.session.id])).filter((set) => set.stepId === stepId);
      return { session: match.session, sets };
    },

    /**
     * Same as `lastSessionForStep` but returns up to `limit` FINISHED sessions, most recent first
     * (the history `todayTarget` needs: stall detection looks at several sessions).
     */
    async recentSessionsForStep(
      stepId: string,
      limit: number,
      excludeSessionId?: number,
    ): Promise<SessionWithSets[]> {
      const conditions = [eq(setLogs.stepId, stepId), isNotNull(workoutSessions.finishedAt)];
      if (excludeSessionId !== undefined) conditions.push(ne(workoutSessions.id, excludeSessionId));

      const rows = await db
        .selectDistinct({ session: workoutSessions })
        .from(setLogs)
        .innerJoin(workoutSessions, eq(setLogs.sessionId, workoutSessions.id))
        .where(and(...conditions))
        .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
        .limit(limit);

      const sessions = rows.map((row) => row.session);
      const sets = (await setsFor(sessions.map((session) => session.id))).filter(
        (set) => set.stepId === stepId,
      );
      return sessions.map((session) => ({
        session,
        sets: sets.filter((set) => set.sessionId === session.id),
      }));
    },

    /**
     * The latest UNFINISHED session started on `date` (to resume it), if any; `routineId` limits it
     * to that routine.
     */
    async unfinishedSessionOn(
      date: string,
      routineId?: string,
    ): Promise<WorkoutSessionRow | undefined> {
      const conditions = [eq(workoutSessions.date, date), isNull(workoutSessions.finishedAt)];
      if (routineId !== undefined) conditions.push(eq(workoutSessions.routineId, routineId));
      const rows = await db
        .select()
        .from(workoutSessions)
        .where(and(...conditions))
        .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
        .limit(1);
      return rows[0];
    },

    /** The most recent sessions (any state), newest first, with their sets: rotation input. */
    async recentSessions(limit: number): Promise<SessionWithSets[]> {
      const sessions = await db
        .select()
        .from(workoutSessions)
        .orderBy(desc(workoutSessions.startedAt), desc(workoutSessions.id))
        .limit(limit);
      const sets = await setsFor(sessions.map((session) => session.id));
      return sessions.map((session) => ({
        session,
        sets: sets.filter((set) => set.sessionId === session.id),
      }));
    },

    /** Discards a session (and, by cascade, its sets), e.g. one abandoned without any set. */
    async deleteSession(sessionId: number): Promise<void> {
      await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
    },

    /** Sessions with `from <= date <= to` (day keys), oldest first, with all their sets. */
    async sessionsInRange(from: string, to: string): Promise<SessionWithSets[]> {
      const sessions = await db
        .select()
        .from(workoutSessions)
        .where(and(gte(workoutSessions.date, from), lte(workoutSessions.date, to)))
        .orderBy(asc(workoutSessions.date), asc(workoutSessions.startedAt));
      const sets = await setsFor(sessions.map((session) => session.id));
      return sessions.map((session) => ({
        session,
        sets: sets.filter((set) => set.sessionId === session.id),
      }));
    },
  };
}

export type WorkoutsRepository = ReturnType<typeof createWorkoutsRepository>;
