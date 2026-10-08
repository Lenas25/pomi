// Greeting and identity phrase of the Hoy screen (PLAN §13, BRAND §9). Pure: returns i18n KEYS and
// params, never text, and never a streak ("racha"): constancy is how many recent weeks had training,
// gaps allowed, so a missed week removes nothing that was earned.
import { format, parseISO, subDays } from 'date-fns';

export type GreetingKey =
  | 'today.greeting.morning'
  | 'today.greeting.morningNamed'
  | 'today.greeting.afternoon'
  | 'today.greeting.afternoonNamed'
  | 'today.greeting.evening'
  | 'today.greeting.eveningNamed';

/** Morning until 11:59, afternoon until 18:59, evening afterwards. */
export function greetingKey(hour: number, hasName: boolean): GreetingKey {
  const part = hour < 12 ? 'morning' : hour < 19 ? 'afternoon' : 'evening';
  return `today.greeting.${part}${hasName ? 'Named' : ''}` as GreetingKey;
}

export type IdentityKey =
  | 'today.identity.first'
  | 'today.identity.weeks'
  | 'today.identity.moving'
  | 'today.identity.water'
  | 'today.identity.fallback';

export type IdentityPhrase = { key: IdentityKey; params: Record<string, number> };

export type IdentityInput = {
  /** `yyyy-MM-dd`. */
  today: string;
  /** Dates (`yyyy-MM-dd`) of finished gym sessions that have logged sets. */
  gymDates: readonly string[];
  /** Gym days per week in the person's plan (0 when unknown). */
  plannedGymDays: number;
  /** Days of the last 10 on which the water goal was met; `null` when there is no goal. */
  waterDays: number | null;
  /** The day the onboarding was completed. */
  firstDay: boolean;
};

/** Weeks that count as "training weeks" among the last `WEEKS_LOOKED_AT`. */
export const WEEKS_LOOKED_AT = 8;
const MIN_WEEKS_FOR_PHRASE = 2;
const WATER_DAYS_FOR_PHRASE = 5;
const RECENT_DAYS = 14;

/** A week with at least min(2, planned days) sessions (at least 1) counts as a training week. */
export function trainingWeeks(input: Pick<IdentityInput, 'today' | 'gymDates' | 'plannedGymDays'>) {
  const needed = Math.min(2, Math.max(1, input.plannedGymDays));
  const today = parseISO(input.today);
  let weeks = 0;
  for (let week = 0; week < WEEKS_LOOKED_AT; week += 1) {
    const to = format(subDays(today, week * 7), 'yyyy-MM-dd');
    const from = format(subDays(today, week * 7 + 6), 'yyyy-MM-dd');
    const sessions = new Set(input.gymDates.filter((date) => date >= from && date <= to));
    if (sessions.size >= needed) weeks += 1;
  }
  return weeks;
}

export function identityPhrase(input: IdentityInput): IdentityPhrase {
  if (input.firstDay) return { key: 'today.identity.first', params: {} };

  const weeks = trainingWeeks(input);
  if (weeks >= MIN_WEEKS_FOR_PHRASE) return { key: 'today.identity.weeks', params: { n: weeks } };

  const recentFrom = format(subDays(parseISO(input.today), RECENT_DAYS - 1), 'yyyy-MM-dd');
  if (input.gymDates.some((date) => date >= recentFrom && date <= input.today)) {
    return { key: 'today.identity.moving', params: {} };
  }

  if (input.waterDays !== null && input.waterDays >= WATER_DAYS_FOR_PHRASE) {
    return { key: 'today.identity.water', params: { done: input.waterDays } };
  }
  return { key: 'today.identity.fallback', params: {} };
}
