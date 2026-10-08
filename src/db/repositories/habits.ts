import { and, asc, eq, gte, lt, lte, sql } from 'drizzle-orm';

import { habitEvents, habitLogs } from '../schema';
import { withTransaction } from '../transaction';
import type { Db } from '../types';

export type HabitLogRow = typeof habitLogs.$inferSelect;
export type HabitEventRow = typeof habitEvents.$inferSelect;

/** Events older than this are pruned: the water rule only reads the last week or two. */
export const EVENT_RETENTION_DAYS = 30;

export function createHabitLogsRepository(db: Db, now: () => number = Date.now) {
  /**
   * Remembers the value a write left behind (see `habit_events`) and prunes events older than
   * `EVENT_RETENTION_DAYS`. Always called inside the transaction of the write it belongs to.
   */
  async function record(habitId: string, date: string, value: number): Promise<void> {
    const at = now();
    await db.insert(habitEvents).values({ habitId, date, at, value });
    await db.delete(habitEvents).where(lt(habitEvents.at, at - EVENT_RETENTION_DAYS * 86_400_000));
  }

  return {
    async get(habitId: string, date: string): Promise<number> {
      const rows = await db
        .select()
        .from(habitLogs)
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)));
      return rows[0]?.value ?? 0;
    },

    // Each write and its event are ONE transaction: a log without its event (or the reverse) would
    // make the water-by-18:00 curve disagree with the daily total. These methods open a top-level
    // transaction, so never call them from inside another `withTransaction` callback.
    async set(habitId: string, date: string, value: number): Promise<void> {
      await withTransaction(db, async () => {
        await db
          .insert(habitLogs)
          .values({ habitId, date, value })
          .onConflictDoUpdate({ target: [habitLogs.habitId, habitLogs.date], set: { value } });
        await record(habitId, date, value);
      });
    },

    async increment(habitId: string, date: string, by = 1): Promise<void> {
      await withTransaction(db, async () => {
        const rows = await db
          .insert(habitLogs)
          .values({ habitId, date, value: by })
          .onConflictDoUpdate({
            target: [habitLogs.habitId, habitLogs.date],
            set: { value: sql`${habitLogs.value} + ${by}` },
          })
          .returning({ value: habitLogs.value });
        const value = rows[0]?.value;
        if (value !== undefined) await record(habitId, date, value);
      });
    },

    /** Subtracts `by`, never going below zero. */
    async decrement(habitId: string, date: string, by = 1): Promise<void> {
      await withTransaction(db, async () => {
        const rows = await db
          .update(habitLogs)
          .set({ value: sql`max(${habitLogs.value} - ${by}, 0)` })
          .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
          .returning({ value: habitLogs.value });
        const value = rows[0]?.value;
        if (value !== undefined) await record(habitId, date, value);
      });
    },

    /** Write events of the logical days `from..to`, oldest first. */
    async eventsInRange(from: string, to: string, habitId?: string): Promise<HabitEventRow[]> {
      const range = and(gte(habitEvents.date, from), lte(habitEvents.date, to));
      return db
        .select()
        .from(habitEvents)
        .where(habitId === undefined ? range : and(range, eq(habitEvents.habitId, habitId)))
        .orderBy(asc(habitEvents.at), asc(habitEvents.id));
    },

    async forDate(date: string): Promise<HabitLogRow[]> {
      return db.select().from(habitLogs).where(eq(habitLogs.date, date));
    },

    async inRange(from: string, to: string, habitId?: string): Promise<HabitLogRow[]> {
      const range = and(gte(habitLogs.date, from), lte(habitLogs.date, to));
      return db
        .select()
        .from(habitLogs)
        .where(habitId === undefined ? range : and(range, eq(habitLogs.habitId, habitId)))
        .orderBy(asc(habitLogs.date));
    },
  };
}

export type HabitLogsRepository = ReturnType<typeof createHabitLogsRepository>;
