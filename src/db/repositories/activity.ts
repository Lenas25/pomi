import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { activityLogs } from '../schema';
import type { Db } from '../types';

export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type ActivityKind = ActivityLogRow['kind'];
export type ActivitySource = ActivityLogRow['source'];

export function createActivityRepository(db: Db, now: () => number = Date.now) {
  return {
    /** One answer per day: answering again replaces the earlier answer ("Hoy no" is never a miss). */
    async upsert(date: string, kind: ActivityKind, source: ActivitySource): Promise<void> {
      const loggedAt = now();
      await db
        .insert(activityLogs)
        .values({ date, kind, source, loggedAt })
        .onConflictDoUpdate({ target: activityLogs.date, set: { kind, source, loggedAt } });
    },

    async get(date: string): Promise<ActivityLogRow | undefined> {
      const rows = await db.select().from(activityLogs).where(eq(activityLogs.date, date));
      return rows[0];
    },

    async inRange(from: string, to: string): Promise<ActivityLogRow[]> {
      return db
        .select()
        .from(activityLogs)
        .where(and(gte(activityLogs.date, from), lte(activityLogs.date, to)))
        .orderBy(asc(activityLogs.date));
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
