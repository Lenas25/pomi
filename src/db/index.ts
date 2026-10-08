import { db } from './client';
import { createRepositories } from './repositories';

export { migrations } from './migrations.generated';
export { db };

/** App-wide repositories bound to the Expo SQLite connection. */
export const repositories = createRepositories(db);
