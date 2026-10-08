import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { checkins } from '../schema';
import type { Db } from '../types';

export type CheckinRow = typeof checkins.$inferSelect;
export type CheckinKind = CheckinRow['kind'];
export type CheckinAnswers = CheckinRow['answers'];

export function createCheckinsRepository(db: Db) {
  return {
    async upsert(date: string, kind: CheckinKind, answers: CheckinAnswers): Promise<void> {
      await db
        .insert(checkins)
        .values({ date, kind, answers })
        .onConflictDoUpdate({ target: [checkins.date, checkins.kind], set: { answers } });
    },

    async get(date: string, kind: CheckinKind): Promise<CheckinRow | undefined> {
      const rows = await db
        .select()
        .from(checkins)
        .where(and(eq(checkins.date, date), eq(checkins.kind, kind)));
      return rows[0];
    },

    async inRange(from: string, to: string, kind?: CheckinKind): Promise<CheckinRow[]> {
      const range = and(gte(checkins.date, from), lte(checkins.date, to));
      return db
        .select()
        .from(checkins)
        .where(kind === undefined ? range : and(range, eq(checkins.kind, kind)))
        .orderBy(asc(checkins.date));
    },
  };
}

export type CheckinsRepository = ReturnType<typeof createCheckinsRepository>;
