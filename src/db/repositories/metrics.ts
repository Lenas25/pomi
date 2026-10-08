import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { metricEntries } from '../schema';
import type { Db } from '../types';

export type MetricEntryRow = typeof metricEntries.$inferSelect;

export function createMetricsRepository(db: Db) {
  return {
    /** One value per (metric, day): a second save for the same day overwrites the first. */
    async upsert(metricId: string, date: string, value: number): Promise<void> {
      await db
        .insert(metricEntries)
        .values({ metricId, date, value })
        .onConflictDoUpdate({
          target: [metricEntries.metricId, metricEntries.date],
          set: { value },
        });
    },

    async inRange(metricId: string, from: string, to: string): Promise<MetricEntryRow[]> {
      return db
        .select()
        .from(metricEntries)
        .where(
          and(
            eq(metricEntries.metricId, metricId),
            gte(metricEntries.date, from),
            lte(metricEntries.date, to),
          ),
        )
        .orderBy(asc(metricEntries.date));
    },
  };
}

export type MetricsRepository = ReturnType<typeof createMetricsRepository>;
