// Weekly review (PLAN §10 "Revisión semanal") and the "Carta de Pomi" (PLAN §14b). Pure: the data
// comes in, i18n KEYS and numbers go out; nothing here writes text, and nothing blames. A missing
// value is "no data", never a zero, and the wording never mentions streaks.
import { addDays, format, getDay, parseISO, subDays } from 'date-fns';

import type { Anchors, GymDays } from '../../templates/schema';
import { sleepDurationMin, type MorningCheckin } from '../formulas/sleep';

export type ReviewKey = `review.${string}`;
export type ReviewLine = { key: ReviewKey; params: Record<string, string | number> };

const SUNDAY = 0;
/** Fewest days with any record for the letter to quote numbers. */
export const MIN_DAYS_FOR_NUMBERS = 3;
/** Fewest values for an average (sleep, energy...) to be shown. */
export const MIN_VALUES_FOR_AVERAGE = 3;
/** Average sleep this far under the target earns the sleep invitation. */
export const SLEEP_SHORT_BY_MIN = 30;
/** A letter is at most this many lines. */
export const LETTER_MAX_LINES = 5;

/**
 * Monday of the week the review covers. On Sunday it is the week that ends today; any other day
 * looks back to the Sunday that closed the last full week (a late tap on Sunday's notification
 * still shows the right week).
 */
export function reviewWeekStart(today: string): string {
  const date = parseISO(today);
  const sinceSunday = getDay(date) === SUNDAY ? 0 : getDay(date);
  const lastSunday = subDays(date, sinceSunday);
  return format(subDays(lastSunday, 6), 'yyyy-MM-dd');
}

export type DayRating = { date: string; value: number };

export type WeeklyReviewData = {
  gymDays: GymDays;
  anchors: Anchors;
  /** Days (`yyyy-MM-dd`) the person trained: a finished session or a "Fui al gym" answer. */
  gymDates: readonly string[];
  /** Days with a water log: glasses against that day's goal (`null` when there is no goal). */
  water: readonly { date: string; glasses: number; targetGlasses: number | null }[];
  steps: readonly { date: string; steps: number }[];
  /** Current steps goal; `null` while the baseline week is still measuring. */
  stepsGoal: number | null;
  /** Morning check-ins with bed and wake times. */
  sleep: readonly MorningCheckin[];
  /** 1-5 scales from the check-ins. */
  ratings: {
    quality: readonly DayRating[];
    energy: readonly DayRating[];
    mood: readonly DayRating[];
  };
};

export type WeeklyReview = {
  weekStart: string;
  weekEnd: string;
  /** Days of the week with at least one record. */
  activeDays: number;
  training: { done: number; planned: number } | null;
  water: { met: number; days: number } | null;
  steps: { kind: 'goal'; met: number; days: number } | { kind: 'average'; average: number } | null;
  sleep: { avgMin: number; targetMin: number | null; nights: number } | null;
  /** Averages on the 1-5 scales, one decimal; `null` without enough values. */
  scales: { quality: number | null; energy: number | null; mood: number | null };
  /** The summary in identity language, in reading order. */
  summary: ReviewLine[];
  /** The "Carta de Pomi": at most `LETTER_MAX_LINES` lines. */
  letter: { tone: 'full' | 'brief'; lines: ReviewLine[] };
};

const line = (key: ReviewKey, params: ReviewLine['params'] = {}): ReviewLine => ({ key, params });

const round1 = (value: number) => Math.round(value * 10) / 10;

function average(values: readonly number[]): number | null {
  return values.length >= MIN_VALUES_FOR_AVERAGE
    ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

export function buildWeeklyReview(data: WeeklyReviewData, weekStart: string): WeeklyReview {
  const start = parseISO(weekStart);
  const dates = Array.from({ length: 7 }, (_, index) =>
    format(addDays(start, index), 'yyyy-MM-dd'),
  );
  const weekEnd = dates[6] ?? weekStart;
  const inWeek = (date: string) => date >= weekStart && date <= weekEnd;

  // Training: sessions done against the weekdays of the plan.
  const plannedWeekdays = new Set(data.gymDays.flatMap((entry) => entry.days));
  const planned = dates.filter((date) => plannedWeekdays.has(getDay(parseISO(date)))).length;
  const trained = [...new Set(data.gymDates.filter(inWeek))];
  const training = planned > 0 || trained.length > 0 ? { done: trained.length, planned } : null;

  // Water: only days with a log AND a goal can be compared.
  const waterDays = data.water.filter(
    (day) => inWeek(day.date) && day.targetGlasses !== null && day.glasses > 0,
  );
  const water =
    waterDays.length > 0
      ? {
          met: waterDays.filter((day) => day.glasses >= (day.targetGlasses ?? Infinity)).length,
          days: waterDays.length,
        }
      : null;

  // Steps: a day without steps is a day without data.
  const stepDays = data.steps.filter((day) => inWeek(day.date) && day.steps > 0);
  const steps: WeeklyReview['steps'] =
    stepDays.length === 0
      ? null
      : data.stepsGoal !== null
        ? {
            kind: 'goal',
            met: stepDays.filter((day) => day.steps >= (data.stepsGoal ?? Infinity)).length,
            days: stepDays.length,
          }
        : {
            kind: 'average',
            average: Math.round(
              stepDays.reduce((sum, day) => sum + day.steps, 0) / stepDays.length,
            ),
          };

  // Sleep.
  const nights = data.sleep.filter((night) => inWeek(night.date));
  const targetMin =
    data.anchors.sleepTargetH !== undefined ? Math.round(data.anchors.sleepTargetH * 60) : null;
  const sleep =
    nights.length >= MIN_VALUES_FOR_AVERAGE
      ? {
          avgMin: Math.round(
            nights.reduce((sum, night) => sum + sleepDurationMin(night.bed, night.wake), 0) /
              nights.length,
          ),
          targetMin,
          nights: nights.length,
        }
      : null;

  const valuesOf = (ratings: readonly DayRating[]) =>
    ratings.filter((rating) => inWeek(rating.date)).map((rating) => rating.value);
  const scales = {
    quality: average(valuesOf(data.ratings.quality)),
    energy: average(valuesOf(data.ratings.energy)),
    mood: average(valuesOf(data.ratings.mood)),
  };

  const active = new Set<string>([
    ...trained,
    ...waterDays.map((day) => day.date),
    ...stepDays.map((day) => day.date),
    ...nights.map((night) => night.date),
    ...[data.ratings.quality, data.ratings.energy, data.ratings.mood].flatMap((ratings) =>
      ratings.filter((rating) => inWeek(rating.date)).map((rating) => rating.date),
    ),
  ]);

  const partial = { training, water, steps, sleep, scales };
  return {
    weekStart,
    weekEnd,
    activeDays: active.size,
    ...partial,
    summary: summaryLines(partial),
    letter: buildLetter({ ...partial, activeDays: active.size, weekStart }),
  };
}

type Parts = Pick<WeeklyReview, 'training' | 'water' | 'steps' | 'sleep' | 'scales'>;

/** The week in identity language: what was done, never what was missed. */
function summaryLines({ training, water, steps, sleep, scales }: Parts): ReviewLine[] {
  const lines: ReviewLine[] = [];

  if (training) {
    const { done, planned } = training;
    if (done === 0) lines.push(line('review.summary.trainingNone'));
    else if (planned === 0) lines.push(line('review.summary.trainingUnplanned', { done }));
    else if (done > planned) lines.push(line('review.summary.trainingMore', { done, planned }));
    else lines.push(line('review.summary.training', { done, planned }));
  }
  if (water) {
    lines.push(
      water.met === 0
        ? line('review.summary.waterNone')
        : line('review.summary.water', { met: water.met }),
    );
  }
  if (steps?.kind === 'goal') {
    lines.push(
      steps.met === 0
        ? line('review.summary.stepsNone')
        : line('review.summary.steps', { met: steps.met }),
    );
  } else if (steps?.kind === 'average') {
    lines.push(line('review.summary.stepsAverage', { average: steps.average }));
  }
  if (sleep) {
    lines.push(
      sleep.targetMin === null
        ? line('review.summary.sleepNoTarget', { avgMin: sleep.avgMin })
        : line('review.summary.sleep', { avgMin: sleep.avgMin, targetMin: sleep.targetMin }),
    );
  }
  if (scales.quality !== null)
    lines.push(line('review.summary.quality', { value: scales.quality }));
  if (scales.energy !== null) lines.push(line('review.summary.energy', { value: scales.energy }));
  if (scales.mood !== null) lines.push(line('review.summary.mood', { value: scales.mood }));
  return lines;
}

const INVITATIONS = [
  'review.letter.invite.one',
  'review.letter.invite.two',
  'review.letter.invite.three',
] as const;

/** Week number used to rotate the invitation: varied from week to week, the same for a given week. */
function weekNumber(weekStart: string): number {
  return Math.floor(parseISO(weekStart).getTime() / (7 * 24 * 60 * 60 * 1000));
}

type LetterInput = Parts & { activeDays: number; weekStart: string };

/**
 * "Carta de Pomi": hello, one achievement, one sleep or water fact, a kind invitation and a
 * goodbye. With little data it is a short warm letter WITHOUT figures.
 */
function buildLetter(input: LetterInput): WeeklyReview['letter'] {
  const { training, water, steps, sleep, activeDays, weekStart } = input;
  const invitation = line(
    INVITATIONS[weekNumber(weekStart) % INVITATIONS.length] ?? INVITATIONS[0],
  );
  const hello = line('review.letter.hello');
  const bye = line('review.letter.bye');

  if (activeDays < MIN_DAYS_FOR_NUMBERS) {
    return { tone: 'brief', lines: [hello, line('review.letter.brief'), invitation, bye] };
  }

  const achievement = ((): ReviewLine => {
    if (
      training &&
      training.done > 0 &&
      training.planned > 0 &&
      training.done >= training.planned
    ) {
      return line('review.letter.achievement.trainingAll', { done: training.done });
    }
    if (training && training.done > 0) {
      return line('review.letter.achievement.training', { done: training.done });
    }
    if (water && water.met >= MIN_DAYS_FOR_NUMBERS) {
      return line('review.letter.achievement.water', { met: water.met });
    }
    if (steps?.kind === 'goal' && steps.met >= MIN_DAYS_FOR_NUMBERS) {
      return line('review.letter.achievement.steps', { met: steps.met });
    }
    return line('review.letter.achievement.present', { days: activeDays });
  })();

  const fact = ((): ReviewLine | null => {
    if (sleep) return line('review.letter.fact.sleep', { avgMin: sleep.avgMin });
    if (water) return line('review.letter.fact.water', { days: water.days });
    return null;
  })();

  const shortSleep =
    sleep !== null &&
    sleep.targetMin !== null &&
    sleep.avgMin < sleep.targetMin - SLEEP_SHORT_BY_MIN;
  const closing = shortSleep ? line('review.letter.invite.sleep') : invitation;

  return {
    tone: 'full',
    lines: [hello, achievement, ...(fact ? [fact] : []), closing, bye].slice(0, LETTER_MAX_LINES),
  };
}
