// Report model builder. PURE: data + selection in, `ReportModel` out. Only the selected sections
// are built and only rows inside the period are read, so nothing else can leak into a report.
import { eachDayOfInterval, getDay, parseISO } from 'date-fns';

import { circularRange, sleepDurationMin } from '../domain/formulas/sleep';
import { strengthSeries, type SessionSets } from '../domain/progress/strength';
import { clockToMinutes } from '../domain/time';

import { inPeriod, periodFor } from './period';
import {
  MAX_NOTE_LENGTH,
  MAX_REPORT_PHOTOS,
  type GymExerciseReport,
  type GymReport,
  type HabitsReport,
  type MeasuresReport,
  type PhotosReport,
  type ReportData,
  type ReportModel,
  type ReportPeriod,
  type ReportSection,
  type ReportSelection,
  type SleepReport,
} from './types';

const round1 = (value: number) => Math.round(value * 10) / 10;

// --- Gym ----------------------------------------------------------------------------------------

function plannedInPeriod(data: ReportData, period: ReportPeriod): number {
  const weekdays = new Set(data.gymDays.flatMap((entry) => entry.days));
  if (weekdays.size === 0) return 0;
  // Days before the start of use were never "planned".
  const from =
    data.startedOn !== undefined && data.startedOn > period.from ? data.startedOn : period.from;
  if (from > period.to) return 0;
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(period.to) }).filter((date) =>
    weekdays.has(getDay(date)),
  ).length;
}

function exerciseReport(
  data: ReportData,
  sessions: readonly SessionSets[],
  stepId: string,
): GymExerciseReport | null {
  const dates = new Set<string>();
  let sets = 0;
  let topWeightKg: number | null = null;
  let bestReps: number | null = null;
  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.stepId !== stepId) continue;
      sets += 1;
      dates.add(session.date);
      if (set.weightKg !== null && set.weightKg > 0) {
        topWeightKg = Math.max(topWeightKg ?? 0, set.weightKg);
      }
      if (set.reps !== null) bestReps = Math.max(bestReps ?? 0, set.reps);
    }
  }
  if (sets === 0) return null;
  const ordered = [...dates].sort();
  const series = strengthSeries(sessions, stepId);
  return {
    stepId,
    name: data.exerciseNames[stepId] ?? stepId,
    sessions: dates.size,
    sets,
    firstDate: ordered[0] ?? '',
    lastDate: ordered.at(-1) ?? '',
    e1rmFrom: series[0]?.e1rm ?? null,
    e1rmTo: series.at(-1)?.e1rm ?? null,
    topWeightKg,
    bestReps,
  };
}

function gymSection(data: ReportData, period: ReportPeriod): GymReport {
  const sessions = data.sessions.filter((session) => inPeriod(session.date, period));
  const stepIds = [
    ...new Set(sessions.flatMap((session) => session.sets.map((set) => set.stepId))),
  ];
  const exercises = stepIds
    .flatMap((stepId) => exerciseReport(data, sessions, stepId) ?? [])
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  return {
    kind: 'gym',
    empty: sessions.length === 0,
    sessionsDone: sessions.length,
    sessionsPlanned: plannedInPeriod(data, period),
    exercises,
  };
}

// --- Habits -------------------------------------------------------------------------------------

function habitsSection(
  data: ReportData,
  period: ReportPeriod,
  includeFoodNotes: boolean,
): HabitsReport {
  const waterDays = (data.water?.days ?? []).filter(
    (day) => inPeriod(day.date, period) && day.glasses > 0,
  );
  const water =
    data.water && waterDays.length > 0
      ? {
          daysLogged: waterDays.length,
          daysMet: waterDays.filter(
            (day) => day.targetGlasses !== null && day.glasses >= day.targetGlasses,
          ).length,
          averageGlasses: round1(
            waterDays.reduce((sum, day) => sum + day.glasses, 0) / waterDays.length,
          ),
          ...(data.water.glassMl !== undefined ? { glassMl: data.water.glassMl } : {}),
        }
      : null;

  const stepDays = data.steps.filter((row) => inPeriod(row.date, period) && row.steps > 0);
  const steps =
    stepDays.length > 0
      ? {
          daysLogged: stepDays.length,
          average: Math.round(stepDays.reduce((sum, row) => sum + row.steps, 0) / stepDays.length),
          goal: data.stepsGoal,
          daysMet:
            data.stepsGoal === null
              ? null
              : stepDays.filter((row) => row.steps >= (data.stepsGoal ?? Infinity)).length,
        }
      : null;

  const checks = data.checks
    .map((check) => ({
      name: check.name,
      days: new Set(check.dates.filter((date) => inPeriod(date, period))).size,
    }))
    .filter((check) => check.days > 0);

  const foodNotes = includeFoodNotes
    ? data.foodNotes
        .filter((note) => inPeriod(note.date, period) && note.text.trim() !== '')
        .map((note) => ({ date: note.date, text: note.text.trim() }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : null;

  return {
    kind: 'habits',
    empty: water === null && steps === null && checks.length === 0 && !foodNotes?.length,
    water,
    steps,
    checks,
    foodNotes,
  };
}

// --- Sleep --------------------------------------------------------------------------------------

function sleepSection(data: ReportData, period: ReportPeriod): SleepReport {
  const nights = data.sleep.filter((night) => inPeriod(night.date, period));
  const targetMin = data.sleepTargetH !== undefined ? Math.round(data.sleepTargetH * 60) : null;
  if (nights.length === 0) {
    return { kind: 'sleep', empty: true, nights: 0, averageMin: 0, targetMin, wakeRangeMin: null };
  }
  const total = nights.reduce((sum, night) => sum + sleepDurationMin(night.bed, night.wake), 0);
  return {
    kind: 'sleep',
    empty: false,
    nights: nights.length,
    averageMin: Math.round(total / nights.length),
    targetMin,
    wakeRangeMin:
      nights.length < 2 ? null : circularRange(nights.map((night) => clockToMinutes(night.wake))),
  };
}

// --- Measures -----------------------------------------------------------------------------------

function measuresSection(data: ReportData, period: ReportPeriod): MeasuresReport {
  const metrics = data.metrics.flatMap((metric) => {
    const entries = metric.entries
      .filter((entry) => inPeriod(entry.date, period))
      .map((entry) => ({ date: entry.date, value: entry.value }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (entries.length === 0) return [];
    const first = entries[0];
    const last = entries.at(-1);
    return [
      {
        name: metric.name,
        unit: metric.unit,
        entries,
        change: entries.length > 1 && first && last ? round1(last.value - first.value) : null,
      },
    ];
  });
  return { kind: 'measures', empty: metrics.length === 0, metrics };
}

// --- Photos -------------------------------------------------------------------------------------

function photosSection(data: ReportData, period: ReportPeriod): PhotosReport {
  const inRange = data.photos
    .filter((photo) => inPeriod(photo.date, period))
    .sort((a, b) => b.date.localeCompare(a.date) || a.pose.localeCompare(b.pose));
  return {
    kind: 'photos',
    empty: inRange.length === 0,
    items: inRange.slice(0, MAX_REPORT_PHOTOS),
    total: inRange.length,
  };
}

// --- The report ---------------------------------------------------------------------------------

/**
 * Builds the model for `selection`. `now` fixes the period through `dayKeyFor` (logical days).
 * Sections that are not selected are never built; `findings` has no engine yet and is skipped.
 */
export function buildReport(data: ReportData, selection: ReportSelection, now: Date): ReportModel {
  const period = periodFor(selection.period, now, data.startedOn);
  const chosen = new Set(selection.sections);
  const sections: ReportSection[] = [];
  if (chosen.has('gym')) sections.push(gymSection(data, period));
  if (chosen.has('habits')) sections.push(habitsSection(data, period, selection.foodNotes));
  if (chosen.has('sleep')) sections.push(sleepSection(data, period));
  if (chosen.has('measures')) sections.push(measuresSection(data, period));
  if (chosen.has('photos')) sections.push(photosSection(data, period));
  return {
    template: selection.template,
    period,
    note: selection.note.trim().slice(0, MAX_NOTE_LENGTH),
    instruction: selection.template === 'ai',
    sections,
  };
}
