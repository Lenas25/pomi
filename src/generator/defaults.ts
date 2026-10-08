// Starting answers for the routine wizard, taken from what the person told Pomi at the onboarding
// (profile goal and level, planned gym weekdays). Pure.
import type { Repositories } from '../db/repositories';
import type { Goal, Level } from '../domain/generator/types';
import type { GymDays } from '../templates/schema';

const GOALS: Record<string, Goal> = {
  musculo: 'hypertrophy',
  fuerza: 'strength',
  grasa: 'fatLoss',
  salud: 'health',
};

const LEVELS: Record<string, Level> = {
  principiante: 'beginner',
  intermedio: 'intermediate',
  avanzado: 'advanced',
};

export type WizardDefaults = {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  sessionMin: number;
};

export const FALLBACK_DEFAULTS: WizardDefaults = {
  goal: 'hypertrophy',
  level: 'beginner',
  daysPerWeek: 3,
  sessionMin: 60,
};

/** Profile values are the onboarding's Spanish keys (`musculo`, `principiante`...). */
export function defaultsFrom(
  profile: { goal?: string | null | undefined; level?: string | null | undefined },
  gymDays: GymDays,
): WizardDefaults {
  const planned = new Set(gymDays.flatMap((entry) => entry.days)).size;
  return {
    goal: GOALS[profile.goal ?? ''] ?? FALLBACK_DEFAULTS.goal,
    level: LEVELS[profile.level ?? ''] ?? FALLBACK_DEFAULTS.level,
    daysPerWeek: planned >= 2 ? Math.min(6, planned) : FALLBACK_DEFAULTS.daysPerWeek,
    sessionMin: FALLBACK_DEFAULTS.sessionMin,
  };
}

export async function loadWizardDefaults(repos: Repositories): Promise<WizardDefaults> {
  const [profile, gymDays] = await Promise.all([
    repos.profile.get(),
    repos.settings.get('gymDays'),
  ]);
  return defaultsFrom({ goal: profile?.goal, level: profile?.level }, gymDays ?? []);
}
