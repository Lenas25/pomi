import { and, asc, eq, gte, lte } from 'drizzle-orm';

import { foodNotes } from '../schema';
import type { Db } from '../types';
import { withTransaction, type Tx } from '../transaction';

export type FoodNoteRow = typeof foodNotes.$inferSelect;

export function createFoodNotesRepository(db: Db) {
  return {
    /** The note of the day, if any (the app keeps ONE note per day). */
    async forDate(date: string): Promise<FoodNoteRow | undefined> {
      const rows = await db
        .select()
        .from(foodNotes)
        .where(eq(foodNotes.date, date))
        .orderBy(asc(foodNotes.id));
      return rows[0];
    },

    /**
     * Replaces the day's note; blank text removes it. Pass the `tx` of an enclosing transaction
     * to join it (a plain `db` would queue behind it and never finish).
     */
    async save(date: string, text: string, scope: Db | Tx = db): Promise<void> {
      const trimmed = text.trim();
      await withTransaction(scope, async () => {
        await db.delete(foodNotes).where(eq(foodNotes.date, date));
        if (trimmed !== '') await db.insert(foodNotes).values({ date, text: trimmed });
      });
    },

    async inRange(from: string, to: string): Promise<FoodNoteRow[]> {
      return db
        .select()
        .from(foodNotes)
        .where(and(gte(foodNotes.date, from), lte(foodNotes.date, to)))
        .orderBy(asc(foodNotes.date), asc(foodNotes.id));
    },
  };
}

export type FoodNotesRepository = ReturnType<typeof createFoodNotesRepository>;
