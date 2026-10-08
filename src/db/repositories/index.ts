import type { Db } from '../types';

import { createCheckinsRepository } from './checkins';
import { createHabitLogsRepository } from './habits';
import { createMetricsRepository } from './metrics';
import { createProfileRepository } from './profile';
import { createSettingsRepository } from './settings';
import { createStepsRepository } from './steps';
import { createTemplatesRepository } from './templates';
import { createWorkoutsRepository } from './workouts';

export function createRepositories(db: Db, now: () => number = Date.now) {
  const settings = createSettingsRepository(db);
  return {
    settings,
    profile: createProfileRepository(db, now),
    templates: createTemplatesRepository(db, settings, now),
    workouts: createWorkoutsRepository(db),
    habitLogs: createHabitLogsRepository(db),
    steps: createStepsRepository(db),
    checkins: createCheckinsRepository(db),
    metrics: createMetricsRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
