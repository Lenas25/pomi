// JSON renderer (PLAN §14): a versioned, language independent document for tools and scripts.
// `{ schemaVersion, app, period, note, sections }`; keys never depend on the app language and a
// change that breaks readers bumps `REPORT_JSON_SCHEMA_VERSION`. Photos never travel: only their
// count. Pure.
import { dayKeyFor } from '../domain/time';

import type { ReportModel, ReportRenderer, ReportSection } from './types';

export const REPORT_JSON_SCHEMA_VERSION = 1;

function sectionJson(section: ReportSection): Record<string, unknown> {
  switch (section.kind) {
    case 'gym':
      return {
        id: 'gym',
        empty: section.empty,
        sessionsDone: section.sessionsDone,
        sessionsPlanned: section.sessionsPlanned,
        exercises: section.exercises.map((exercise) => ({
          id: exercise.stepId,
          name: exercise.name,
          sessions: exercise.sessions,
          sets: exercise.sets,
          firstDate: exercise.firstDate,
          lastDate: exercise.lastDate,
          e1rmFromKg: exercise.e1rmFrom,
          e1rmToKg: exercise.e1rmTo,
          topWeightKg: exercise.topWeightKg,
          bestReps: exercise.bestReps,
        })),
      };
    case 'habits':
      return {
        id: 'habits',
        empty: section.empty,
        water: section.water
          ? {
              daysLogged: section.water.daysLogged,
              daysMet: section.water.daysMet,
              averageGlasses: section.water.averageGlasses,
              glassMl: section.water.glassMl ?? null,
            }
          : null,
        steps: section.steps
          ? {
              daysLogged: section.steps.daysLogged,
              average: section.steps.average,
              goal: section.steps.goal,
              daysMet: section.steps.daysMet,
            }
          : null,
        checks: section.checks.map((check) => ({ name: check.name, days: check.days })),
        foodNotes: section.foodNotes
          ? section.foodNotes.map((note) => ({ date: note.date, text: note.text }))
          : null,
      };
    case 'sleep':
      return {
        id: 'sleep',
        empty: section.empty,
        nights: section.nights,
        averageMin: section.averageMin,
        targetMin: section.targetMin,
        wakeRangeMin: section.wakeRangeMin,
      };
    case 'measures':
      return {
        id: 'measures',
        empty: section.empty,
        metrics: section.metrics.map((metric) => ({
          name: metric.name,
          unit: metric.unit,
          change: metric.change,
          entries: metric.entries.map((entry) => ({ date: entry.date, value: entry.value })),
        })),
      };
    case 'photos':
      return { id: 'photos', empty: section.empty, count: section.total };
    case 'findings':
      return {
        id: 'findings',
        empty: section.empty,
        items: section.items.map((item) => ({
          date: dayKeyFor(new Date(item.createdAt)),
          kind: item.kind,
          textKey: item.textKey,
          params: item.params,
          days: item.days,
          value: item.value,
        })),
      };
  }
}

export const renderJson: ReportRenderer<void> = (model: ReportModel) =>
  JSON.stringify(
    {
      schemaVersion: REPORT_JSON_SCHEMA_VERSION,
      app: 'pomi',
      period: { kind: model.period.kind, from: model.period.from, to: model.period.to },
      note: model.note,
      sections: model.sections.map(sectionJson),
    },
    null,
    2,
  );
