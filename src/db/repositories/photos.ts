import { asc, count, desc, eq } from 'drizzle-orm';

import { photos } from '../schema';
import type { Db } from '../types';

export type PhotoRow = typeof photos.$inferSelect;
export type NewPhoto = Omit<PhotoRow, 'id'>;

/** Rows of `photos`. `uri` is the FILE NAME inside the app's private photo folder (see `src/photos`). */
export function createPhotosRepository(db: Db) {
  return {
    async add(input: NewPhoto): Promise<number> {
      const rows = await db.insert(photos).values(input).returning({ id: photos.id });
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('Could not store the photo');
      return id;
    },

    async get(id: number): Promise<PhotoRow | undefined> {
      const rows = await db.select().from(photos).where(eq(photos.id, id));
      return rows[0];
    },

    /** Newest first. */
    async all(): Promise<PhotoRow[]> {
      return db.select().from(photos).orderBy(desc(photos.date), desc(photos.id));
    },

    /** One page of photos, newest first (`offset` rows skipped). */
    async page(limit: number, offset: number): Promise<PhotoRow[]> {
      return db
        .select()
        .from(photos)
        .orderBy(desc(photos.date), desc(photos.id))
        .limit(limit)
        .offset(offset);
    },

    async count(): Promise<number> {
      const rows = await db.select({ total: count() }).from(photos);
      return rows[0]?.total ?? 0;
    },

    /** Photos of one pose, oldest first. */
    async forPose(pose: string): Promise<PhotoRow[]> {
      return db
        .select()
        .from(photos)
        .where(eq(photos.pose, pose))
        .orderBy(asc(photos.date), asc(photos.id));
    },

    async remove(id: number): Promise<void> {
      await db.delete(photos).where(eq(photos.id, id));
    },

    async removeAll(): Promise<void> {
      await db.delete(photos);
    },
  };
}

export type PhotosRepository = ReturnType<typeof createPhotosRepository>;
