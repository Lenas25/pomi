import { and, asc, desc, eq } from 'drizzle-orm';

import { suggestions } from '../schema';
import type { Db } from '../types';

export type SuggestionRow = typeof suggestions.$inferSelect;
export type SuggestionStatus = SuggestionRow['status'];

export type NewSuggestion = {
  kind: string;
  payload: unknown;
  /** i18n key of the "why" text. */
  reason: string;
  createdAt: number;
};

export function createSuggestionsRepository(db: Db) {
  return {
    async create(input: NewSuggestion): Promise<number> {
      const rows = await db
        .insert(suggestions)
        .values({ ...input, status: 'pending' })
        .returning({ id: suggestions.id });
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('Could not store the suggestion');
      return id;
    },

    async get(id: number): Promise<SuggestionRow | undefined> {
      const rows = await db.select().from(suggestions).where(eq(suggestions.id, id));
      return rows[0];
    },

    /** Pending suggestions, oldest first (Hoy shows the first one). */
    async pending(): Promise<SuggestionRow[]> {
      return db
        .select()
        .from(suggestions)
        .where(eq(suggestions.status, 'pending'))
        .orderBy(asc(suggestions.createdAt), asc(suggestions.id));
    },

    /** Every suggestion (the engine reads the whole history to apply its limits). */
    async all(): Promise<SuggestionRow[]> {
      return db.select().from(suggestions).orderBy(desc(suggestions.createdAt));
    },

    /** Marks a PENDING suggestion as decided; `false` when it was not pending (already decided). */
    async decide(id: number, status: 'accepted' | 'rejected', at: number): Promise<boolean> {
      const rows = await db
        .update(suggestions)
        .set({ status, decidedAt: at })
        .where(and(eq(suggestions.id, id), eq(suggestions.status, 'pending')))
        .returning({ id: suggestions.id });
      return rows.length > 0;
    },
  };
}

export type SuggestionsRepository = ReturnType<typeof createSuggestionsRepository>;
