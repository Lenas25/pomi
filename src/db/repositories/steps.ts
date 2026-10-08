import { asc, eq, gte, lte, and } from 'drizzle-orm';

import { stepsDaily } from '../schema';
import type { Db } from '../types';

export type StepsDailyRow = typeof stepsDaily.$inferSelect;
export type StepsSource = StepsDailyRow['source'];

export function createStepsRepository(db: Db) {
  return {
    async upsert(date: string, steps: number, source: StepsSource): Promise<void> {
      await db
        .insert(stepsDaily)
        .values({ date, steps, source })
        .onConflictDoUpdate({ target: stepsDaily.date, set: { steps, source } });
    },

    async get(date: string): Promise<StepsDailyRow | undefined> {
      const rows = await db.select().from(stepsDaily).where(eq(stepsDaily.date, date));
      return rows[0];
    },

    async inRange(from: string, to: string): Promise<StepsDailyRow[]> {
      return db
        .select()
        .from(stepsDaily)
        .where(and(gte(stepsDaily.date, from), lte(stepsDaily.date, to)))
        .orderBy(asc(stepsDaily.date));
    },
  };
}

export type StepsRepository = ReturnType<typeof createStepsRepository>;
