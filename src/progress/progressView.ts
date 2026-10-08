// Pure view model of the Progress tab: `ProgressData` in, charts' numbers out. No clock, no I/O.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

import { plannedGymWeekdays } from '../domain/gym/gymPlan';
import {
  isEntryDue,
  latestEntry,
  type MetricFrequency,
  type MetricPoint,
} from '../domain/progress/metrics';
import {
  exercisesWithStrength,
  strengthSeries,
  summarizeSeries,
  type SeriesSummary,
  type StrengthPoint,
} from '../domain/progress/strength';
import { hasWeeklyData, weeklyBuckets, type WeekBucket } from '../domain/progress/weekly';

import type { ProgressData } from './loadProgress';

/** Chart x values are whole days since this date; `dayLabel` turns them back into "d/M". */
const ORIGIN = new Date(2020, 0, 1);

export function dayNumber(date: string): number {
  return differenceInCalendarDays(parseISO(date), ORIGIN);
}

export function dayLabel(day: number): string {
  return format(addDays(ORIGIN, day), 'd/M');
}

export type StrengthView = {
  exercises: { id: string; name: string }[];
  selectedId: string | null;
  points: StrengthPoint[];
  /** From / to of the e1RM line; `null` below two measurements. */
  summary: SeriesSummary | null;
};

export type MeasurementView = {
  id: string;
  name: string;
  unit: string;
  frequency: MetricFrequency;
  points: MetricPoint[];
  latest: MetricPoint | undefined;
  /** Time for a new entry (a gentle prompt, never a miss). */
  due: boolean;
  summary: SeriesSummary | null;
};

export type ProgressView = {
  weekly: { buckets: WeekBucket[]; hasData: boolean; planned: number };
  strength: StrengthView;
  measurements: MeasurementView[];
};

/** `selectedStepId` is the exercise picked in the chips; an unknown or missing one falls back to the first. */
export function buildProgressView(data: ProgressData, selectedStepId?: string): ProgressView {
  // Each week follows its own plan ("Planifica tu semana" override or the usual plan).
  const planned = plannedGymWeekdays(data, data.today).size;
  const buckets = weeklyBuckets({
    today: data.today,
    startedOn: data.startedOn,
    planned,
    plannedFor: (weekStart) => plannedGymWeekdays(data, weekStart).size,
    sessionDates: data.sessions.map((session) => session.date),
    habitDates: data.habitDates,
  });

  const exerciseIds = exercisesWithStrength(data.sessions);
  const selectedId =
    selectedStepId !== undefined && exerciseIds.includes(selectedStepId)
      ? selectedStepId
      : (exerciseIds[0] ?? null);
  const points = selectedId === null ? [] : strengthSeries(data.sessions, selectedId);

  return {
    weekly: { buckets, hasData: hasWeeklyData(buckets), planned },
    strength: {
      exercises: exerciseIds.map((id) => ({ id, name: data.exerciseNames[id] ?? id })),
      selectedId,
      points,
      summary: summarizeSeries(points.map((point) => ({ date: point.date, value: point.e1rm }))),
    },
    measurements: data.metrics.map((metric) => {
      const sorted = [...metric.entries].sort((a, b) => a.date.localeCompare(b.date));
      const latest = latestEntry(sorted);
      return {
        id: metric.id,
        name: metric.name,
        unit: metric.unit,
        frequency: metric.frequency,
        points: sorted,
        latest,
        due: isEntryDue(metric.frequency, data.today, latest?.date),
        summary: summarizeSeries(sorted),
      };
    }),
  };
}
