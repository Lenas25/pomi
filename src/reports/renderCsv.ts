// CSV renderer (PLAN §14): ONE file, one row per value, with a `section` column, so a spreadsheet
// can filter by section without zipping several files. Locale independent on purpose: numbers use
// a dot, dates are ISO, headers and metric names are fixed English identifiers (no i18n). Photos
// never travel: only their count. Pure.
import { dayKeyFor } from '../domain/time';

import type { ReportModel, ReportRenderer, ReportSection } from './types';

export const CSV_HEADER = ['section', 'date', 'item', 'metric', 'value', 'unit'] as const;
/** Excel reads UTF-8 only when the file starts with a BOM. */
export const CSV_BOM = '﻿';

type Cell = string | number | boolean | null | undefined;
type Row = {
  section: string;
  date?: string;
  item?: string;
  metric: string;
  value: Cell;
  unit?: string;
};

/** First characters spreadsheets treat as the start of a formula (OWASP "CSV injection"). */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell. TEXT is neutralised against formula injection (`=`, `+`, `-`, `@`, tab, CR at the start
 * get a leading `'`) and then quoted per RFC 4180 when it holds a comma, a quote or a line break.
 * NUMBERS are written as they are (dot decimal, no thousands separator): they come from typed
 * values, and prefixing a negative change with `'` would turn it into text.
 */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(round(value)) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Three decimals are more than any value here needs; also hides float noise (0.1 + 0.2). */
const round = (value: number) => Math.round(value * 1000) / 1000;

function present(rows: Row[], row: Row): void {
  if (row.value !== null && row.value !== undefined) rows.push(row);
}

function sectionRows(section: ReportSection): Row[] {
  const rows: Row[] = [];
  const add = (metric: string, value: Cell, unit?: string, item?: string, date?: string) =>
    present(rows, {
      section: section.kind,
      metric,
      value,
      ...(unit !== undefined ? { unit } : {}),
      ...(item !== undefined ? { item } : {}),
      ...(date !== undefined ? { date } : {}),
    });
  switch (section.kind) {
    case 'gym':
      add('sessions_done', section.sessionsDone);
      add('sessions_planned', section.sessionsPlanned);
      for (const exercise of section.exercises) {
        add('sessions', exercise.sessions, 'days', exercise.name);
        add('sets', exercise.sets, 'sets', exercise.name);
        add('first_date', exercise.firstDate, undefined, exercise.name);
        add('last_date', exercise.lastDate, undefined, exercise.name);
        add('e1rm_from', exercise.e1rmFrom, 'kg', exercise.name);
        add('e1rm_to', exercise.e1rmTo, 'kg', exercise.name);
        add('top_weight', exercise.topWeightKg, 'kg', exercise.name);
        add('best_reps', exercise.bestReps, 'reps', exercise.name);
      }
      break;
    case 'habits': {
      const { water, steps } = section;
      if (water) {
        add('water_days_logged', water.daysLogged, 'days');
        add('water_days_met', water.daysMet, 'days');
        add('water_average', water.averageGlasses, 'glasses');
        add('water_glass_size', water.glassMl, 'ml');
      }
      if (steps) {
        add('steps_days_logged', steps.daysLogged, 'days');
        add('steps_average', steps.average, 'steps');
        add('steps_goal', steps.goal, 'steps');
        add('steps_days_met', steps.daysMet, 'days');
      }
      for (const check of section.checks) add('check_days', check.days, 'days', check.name);
      for (const note of section.foodNotes ?? []) {
        add('food_note', note.text, undefined, undefined, note.date);
      }
      break;
    }
    case 'sleep':
      add('nights', section.nights, 'nights');
      add('average', section.averageMin, 'min');
      add('target', section.targetMin, 'min');
      add('wake_range', section.wakeRangeMin, 'min');
      break;
    case 'measures':
      for (const metric of section.metrics) {
        for (const entry of metric.entries) {
          add('value', entry.value, metric.unit, metric.name, entry.date);
        }
        add('change', metric.change, metric.unit, metric.name);
      }
      break;
    case 'photos':
      // Only the count: image files and their names never go into a CSV.
      add('count', section.total, 'photos');
      break;
    case 'findings':
      for (const item of section.items) {
        const date = dayKeyFor(new Date(item.createdAt));
        add('value', item.value, undefined, item.textKey, date);
        add('days', item.days, 'days', item.textKey, date);
      }
      break;
  }
  if (section.empty) add('empty', true);
  return rows;
}

/** Period (and the optional note) first, then the selected sections in their fixed order. */
export const renderCsv: ReportRenderer<void> = (model: ReportModel) => {
  const rows: Row[] = [
    { section: 'report', metric: 'period_from', value: model.period.from },
    { section: 'report', metric: 'period_to', value: model.period.to },
  ];
  if (model.note !== '') rows.push({ section: 'report', metric: 'note', value: model.note });
  for (const section of model.sections) rows.push(...sectionRows(section));
  const lines = [
    CSV_HEADER.join(','),
    ...rows.map((row) =>
      [row.section, row.date, row.item, row.metric, row.value, row.unit].map(csvCell).join(','),
    ),
  ];
  // RFC 4180: CRLF between records (and after the last one).
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
};
