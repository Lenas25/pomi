import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import { habitLogs } from '../schema';
import type { Db } from '../types';

export type HabitLogRow = typeof habitLogs.$inferSelect;

export function createHabitLogsRepository(db: Db) {
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
    },

    async increment(habitId: string, date: string, by = 1): Promise<void> {
      await db
        .insert(habitLogs)
        .values({ habitId, date, value: by })
        .onConflictDoUpdate({
          target: [habitLogs.habitId, habitLogs.date],
          set: { value: sql`${habitLogs.value} + ${by}` },
        });
    },

    /** Subtracts `by`, never going below zero. */
    async decrement(habitId: string, date: string, by = 1): Promise<void> {
      await db
        .update(habitLogs)
        .set({ value: sql`max(${habitLogs.value} - ${by}, 0)` })
        .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)));
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
