import { getDatabase } from './client';
import { createRepositories, type Repositories } from './repositories';

export { migrations } from './migrations.generated';
export { getDatabase };

let cached: Repositories | undefined;

/** App-wide repositories bound to the Expo SQLite connection (opened on first call). */
export function getRepositories(): Repositories {
  cached ??= createRepositories(getDatabase());
  return cached;
}
