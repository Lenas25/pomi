import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import { habitEvents, habitLogs } from '../schema';
import type { Db } from '../types';

export type HabitLogRow = typeof habitLogs.$inferSelect;
export type HabitEventRow = typeof habitEvents.$inferSelect;

export function createHabitLogsRepository(db: Db, now: () => number = Date.now) {
  /** Remembers the value a write left behind (see `habit_events`). */
  async function record(habitId: string, date: string, value: number): Promise<void> {
    await db.insert(habitEvents).values({ habitId, date, at: now(), value });
  }

  return {
    async get(habitId: string, date: string): Promise<number> {
      const rows = await db
        .select()
        .from(habitLogs)
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)));
      return rows[0]?.value ?? 0;
    },

    async set(habitId: string, date: string, value: number): Promise<void> {
      await db
        .insert(habitLogs)
        .values({ habitId, date, value })
        .onConflictDoUpdate({ target: [habitLogs.habitId, habitLogs.date], set: { value } });
      await record(habitId, date, value);
    },

    async increment(habitId: string, date: string, by = 1): Promise<void> {
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
    },

    /** Subtracts `by`, never going below zero. */
    async decrement(habitId: string, date: string, by = 1): Promise<void> {
      const rows = await db
        .update(habitLogs)
        .set({ value: sql`max(${habitLogs.value} - ${by}, 0)` })
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
        .returning({ value: habitLogs.value });
      const value = rows[0]?.value;
      if (value !== undefined) await record(habitId, date, value);
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
