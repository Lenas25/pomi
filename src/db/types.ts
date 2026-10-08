import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Database handle used by repositories. Works with the Expo (sync) driver in the app and with an
 * async driver in tests. Always `await` queries and avoid driver-specific APIs; use `withTransaction` for transactions.
 */
export type Db = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof schema>;
