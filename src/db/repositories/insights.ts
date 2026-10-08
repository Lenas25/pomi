import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';

import { insights } from '../schema';
import type { Db } from '../types';

export type InsightRow = typeof insights.$inferSelect;

export type NewInsight = {
  kind: string;
  /** i18n key of the finding's sentence. */
  text: string;
  /** The numbers behind it (JSON object). */
  evidence: unknown;
  createdAt: number;
};

export function createInsightsRepository(db: Db) {
  return {
    async create(input: NewInsight): Promise<number> {
      const rows = await db.insert(insights).values(input).returning({ id: insights.id });
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('Could not store the insight');
      return id;
    },

    /** Every insight, newest first. */
    async all(): Promise<InsightRow[]> {
      return db.select().from(insights).orderBy(desc(insights.createdAt), desc(insights.id));
    },

    /** The newest insight nobody has seen yet (Hoy shows at most one). */
    async latestUnseen(): Promise<InsightRow | undefined> {
      const rows = await db
        .select()
        .from(insights)
        .where(isNull(insights.seenAt))
        .orderBy(desc(insights.createdAt), desc(insights.id))
        .limit(1);
      return rows[0];
    },

    /** Insights created in `[from, to]` (epoch ms), newest first. */
    async createdBetween(from: number, to: number): Promise<InsightRow[]> {
      return db
        .select()
        .from(insights)
        .where(and(gte(insights.createdAt, from), lte(insights.createdAt, to)))
        .orderBy(desc(insights.createdAt), desc(insights.id));
    },

    /** Marks an UNSEEN insight as seen; `false` when it was already seen or does not exist. */
    async markSeen(id: number, at: number): Promise<boolean> {
      const rows = await db
        .update(insights)
        .set({ seenAt: at })
        .where(and(eq(insights.id, id), isNull(insights.seenAt)))
        .returning({ id: insights.id });
      return rows.length > 0;
    },
  };
}

export type InsightsRepository = ReturnType<typeof createInsightsRepository>;
