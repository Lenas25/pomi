import type { Db } from '../types';

import { createActivityRepository } from './activity';
import { createCheckinsRepository } from './checkins';
import { createFoodNotesRepository } from './foodNotes';
import { createHabitLogsRepository } from './habits';
import { createInsightsRepository } from './insights';
import { createMetricsRepository } from './metrics';
import { createPhotosRepository } from './photos';
import { createProfileRepository } from './profile';
import { createSettingsRepository } from './settings';
import { createStepsRepository } from './steps';
import { createSuggestionsRepository } from './suggestions';
import { createTemplatesRepository } from './templates';
import { createWorkoutsRepository } from './workouts';

export function createRepositories(db: Db, now: () => number = Date.now) {
  const settings = createSettingsRepository(db, now);
  return {
    settings,
    profile: createProfileRepository(db, now),
    templates: createTemplatesRepository(db, settings, now),
    workouts: createWorkoutsRepository(db),
    habitLogs: createHabitLogsRepository(db, now),
    steps: createStepsRepository(db),
    checkins: createCheckinsRepository(db),
    activity: createActivityRepository(db, now),
    foodNotes: createFoodNotesRepository(db),
    metrics: createMetricsRepository(db),
    photos: createPhotosRepository(db),
    suggestions: createSuggestionsRepository(db),
    insights: createInsightsRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
