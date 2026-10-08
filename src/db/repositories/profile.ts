import { eq } from 'drizzle-orm';

import { profile } from '../schema';
import type { Db } from '../types';

export type ProfileRow = typeof profile.$inferSelect;
export type ProfileInput = Partial<Omit<ProfileRow, 'id' | 'updatedAt'>>;

const PROFILE_ID = 1;

export function createProfileRepository(db: Db, now: () => number = Date.now) {
  return {
    async get(): Promise<ProfileRow | undefined> {
      const rows = await db.select().from(profile).where(eq(profile.id, PROFILE_ID));
      return rows[0];
    },

    /** Merges the given fields into the single profile row, creating it if needed. */
    async save(input: ProfileInput): Promise<void> {
      const updatedAt = now();
      await db
        .insert(profile)
        .values({ ...input, id: PROFILE_ID, updatedAt })
        .onConflictDoUpdate({ target: profile.id, set: { ...input, updatedAt } });
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
