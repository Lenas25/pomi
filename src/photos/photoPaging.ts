// Pure helpers for the /fotos list: keyset cursor and local list updates (no refetch after delete).
import type { PhotoCursor, PhotoRow } from '../db/repositories/photos';

/** Cursor to ask for the page after `rows`; undefined for an empty list (first page). */
export function cursorOf(rows: readonly PhotoRow[]): PhotoCursor | undefined {
  const last = rows[rows.length - 1];
  return last ? { date: last.date, id: last.id } : undefined;
}

/** Appends a page, ignoring rows already in the list. */
export function appendPage(rows: readonly PhotoRow[], page: readonly PhotoRow[]): PhotoRow[] {
  const seen = new Set(rows.map((row) => row.id));
  return [...rows, ...page.filter((row) => !seen.has(row.id))];
}

/** The list without the removed rows. */
export function withoutRows(rows: readonly PhotoRow[], ids: readonly number[]): PhotoRow[] {
  const removed = new Set(ids);
  return rows.filter((row) => !removed.has(row.id));
}
