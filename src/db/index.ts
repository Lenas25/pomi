import { getDatabase } from './client';
import { gateRepositories } from './maintenance';
import { createRepositories, type Repositories } from './repositories';

export { migrations } from './migrations.generated';
export { getDatabase };

let cached: Repositories | undefined;

/**
 * App-wide repositories bound to the Expo SQLite connection (opened on first call). Every call
 * waits while a restore is running (see `maintenance.ts`).
 */
export function getRepositories(): Repositories {
  cached ??= gateRepositories(createRepositories(getDatabase()));
  return cached;
}
