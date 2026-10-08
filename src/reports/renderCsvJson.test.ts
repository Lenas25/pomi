import { describe, expect, it } from '@jest/globals';

import { buildReport } from './buildReport';
import { prepareReport, previewText } from './prepare';
import { CSV_BOM, CSV_HEADER, csvCell, renderCsv } from './renderCsv';
import { REPORT_JSON_SCHEMA_VERSION, renderJson } from './renderJson';
import { defaultSelection } from './templates';
import type { ReportData, ReportSelection } from './types';

// 02:00 on 2026-10-07 is before the 04:00 rollover: the logical day is still 2026-10-06.
const NOW = new Date(2026, 9, 7, 2, 0);

const data: ReportData = {
  today: '2026-10-06',
  startedOn: '2026-08-01',
  gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' }],
  sessions: [
    { date: '2026-09-29', sets: [{ stepId: 'squat', weightKg: 90, reps: 5 }] },
    { date: '2026-10-02', sets: [{ stepId: 'squat', weightKg: 62.5, reps: 8 }] },
    { date: '2026-10-06', sets: [{ stepId: 'squat', weightKg: 65, reps: 8 }] },
  ],
  exerciseNames: { squat: '=Sentadilla, "pesada"' },
  water: null,
  steps: [
    { date: '2026-10-01', steps: 9000 },
    { date: '2026-10-02', steps: 6000 },
  ],
  stepsGoal: 8000,
  checks: [],
  foodNotes: [
    { date: '2026-10-01', text: 'Lentejas, arroz\ny ensalada' },
    { date: '2026-10-02', text: '@cmd|calc' },
  ],
  sleep: [{ date: '2026-10-01', bed: '23:00', wake: '06:30' }],
  sleepTargetH: 8,
  metrics: [
    {
      id: 'peso',
      name: '-Peso',
      unit: 'kg',
      entries: [
        { date: '2026-10-01', value: 61.5 },
        { date: '2026-10-05', value: 61 },
      ],
    },
  ],
  findings: [
    {
      id: 1,
      kind: 'sleepGym',
      textKey: 'insights.sleepGym.more',
      params: { minutes: 35 },
      days: 24,
      value: 35,
      createdAt: new Date(2026, 9, 3, 10).getTime(),
      seen: true,
    },
  ],
  photos: [{ date: '2026-10-01', pose: 'frente', name: 'secret-photo-name.jpg' }],
};

const selection = (overrides: Partial<ReportSelection> = {}): ReportSelection => ({
  ...defaultSelection('custom'),
  period: '7d',
  ...overrides,
});
const all = selection({
  sections: ['gym', 'habits', 'sleep', 'measures', 'photos', 'findings'],
  foodNotes: true,
  note: 'Hola, "equipo"',
});
const model = (sel: ReportSelection) => buildReport(data, sel, NOW);

/** Minimal RFC 4180 reader for the tests: records separated by CRLF, quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else field += ch;
  }
  return rows;
}

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks (RFC 4180) and doubles inner quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('prefixes text that starts like a formula with an apostrophe (CSV injection)', () => {
    for (const start of ['=', '+', '-', '@']) {
      expect(csvCell(`${start}SUM(A1)`)).toBe(`'${start}SUM(A1)`);
    }
    expect(csvCell('\t=1+1')).toBe("'\t=1+1");
    // Quoting still applies after the prefix.
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
    // An apostrophe or a letter inside the text is left alone.
    expect(csvCell('a=b')).toBe('a=b');
  });

  it('writes numbers with a dot and no grouping, negatives untouched, and empty for null', () => {
    expect(csvCell(1234.5)).toBe('1234.5');
    expect(csvCell(-1.5)).toBe('-1.5');
    expect(csvCell(0.1 + 0.2)).toBe('0.3');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('renderCsv', () => {
  const csv = renderCsv(model(all));
  const rows = parseCsv(csv.replace(CSV_BOM, ''));

  it('starts with a UTF-8 BOM and the fixed header, and uses CRLF records', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(rows.every((row) => row.length === CSV_HEADER.length)).toBe(true);
  });

  it('carries the period, the note and one row per value with ISO dates and dot decimals', () => {
    const find = (section: string, metric: string, item = '') =>
      rows.find((r) => r[0] === section && r[3] === metric && r[2] === item);
    expect(find('report', 'period_from')?.[4]).toBe('2026-09-30');
    expect(find('report', 'period_to')?.[4]).toBe('2026-10-06');
    expect(find('report', 'note')?.[4]).toBe('Hola, "equipo"');
    expect(find('gym', 'sessions_done')?.[4]).toBe('2');
    expect(find('measures', 'value', "'-Peso")).toMatchObject({ 1: '2026-10-01', 4: '61.5' });
    expect(find('measures', 'change', "'-Peso")?.[4]).toBe('-0.5');
    expect(find('sleep', 'average')?.[4]).toBe('450');
    expect(find('findings', 'value', 'insights.sleepGym.more')?.[1]).toBe('2026-10-03');
  });

  it('neutralises formulas in names and notes, and keeps multi-line notes in ONE record', () => {
    expect(rows.some((r) => r[2] === `'=Sentadilla, "pesada"`)).toBe(true);
    expect(rows.some((r) => r[3] === 'food_note' && r[4] === "'@cmd|calc")).toBe(true);
    expect(rows.some((r) => r[3] === 'food_note' && r[4] === 'Lentejas, arroz\ny ensalada')).toBe(
      true,
    );
    // No cell of the file starts with an active formula character.
    for (const row of rows.slice(1)) {
      for (const cell of row) expect(/^[=+@\t\r]/.test(cell)).toBe(false);
    }
  });

  it('never includes photo names or poses, only the count', () => {
    expect(csv).not.toContain('secret-photo-name');
    expect(csv).not.toContain('frente');
    expect(rows.find((r) => r[0] === 'photos')).toEqual(['photos', '', '', 'count', '1', 'photos']);
  });

  it('respects the selection and the period', () => {
    const only = parseCsv(
      renderCsv(model(selection({ sections: ['sleep'] }))).replace(CSV_BOM, ''),
    );
    const sections = new Set(only.slice(1).map((r) => r[0]));
    expect([...sections]).toEqual(['report', 'sleep']);
    // The 09-29 session is outside the 7 day period.
    expect(rows.find((r) => r[0] === 'gym' && r[3] === 'sessions_done')?.[4]).toBe('2');
  });

  it('marks an empty section instead of dropping it', () => {
    const empty = parseCsv(
      renderCsv(
        buildReport({ ...data, sleep: [] }, selection({ sections: ['sleep'] }), NOW),
      ).replace(CSV_BOM, ''),
    );
    expect(empty.some((r) => r[0] === 'sleep' && r[3] === 'empty' && r[4] === 'true')).toBe(true);
  });
});

describe('renderJson', () => {
  const json = JSON.parse(renderJson(model(all))) as Record<string, unknown>;

  it('has a stable, versioned top-level schema', () => {
    expect(REPORT_JSON_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(json)).toEqual(['schemaVersion', 'app', 'period', 'note', 'sections']);
    expect(json['schemaVersion']).toBe(1);
    expect(json['app']).toBe('pomi');
    expect(json['period']).toEqual({ kind: '7d', from: '2026-09-30', to: '2026-10-06' });
    expect(json['note']).toBe('Hola, "equipo"');
  });

  it('lists only the selected sections, in the fixed order, with stable keys', () => {
    const ids = (json['sections'] as { id: string }[]).map((section) => section.id);
    expect(ids).toEqual(['gym', 'habits', 'sleep', 'measures', 'photos', 'findings']);
    const sections = Object.fromEntries(
      (json['sections'] as { id: string }[]).map((section) => [section.id, section]),
    );
    expect(Object.keys(sections['gym']!)).toEqual([
      'id',
      'empty',
      'sessionsDone',
      'sessionsPlanned',
      'exercises',
    ]);
    expect(Object.keys(sections['sleep']!)).toEqual([
      'id',
      'empty',
      'nights',
      'averageMin',
      'targetMin',
      'wakeRangeMin',
    ]);
    const only = JSON.parse(renderJson(model(selection({ sections: ['measures'] })))) as {
      sections: { id: string }[];
    };
    expect(only.sections.map((section) => section.id)).toEqual(['measures']);
  });

  it('keeps text as is (no CSV prefix) and never includes photo names, only the count', () => {
    const text = renderJson(model(all));
    expect(text).not.toContain('secret-photo-name');
    expect(text).not.toContain('frente');
    expect(
      (json['sections'] as { id: string; count?: number }[]).find((s) => s.id === 'photos'),
    ).toEqual({ id: 'photos', empty: false, count: 1 });
    expect(text).toContain('=Sentadilla');
  });

  it('does not depend on the language: no i18n is involved', () => {
    expect(renderJson(model(all))).toBe(renderJson(model(all)));
  });
});

describe('prepareReport / previewText with csv and json', () => {
  const t = ((key: string) => key) as never;
  it('prepares the file content and the preview shows the same content', () => {
    const sel = selection({ sections: ['sleep'] });
    const csv = prepareReport(model(sel), 'csv', { t, language: 'es' });
    expect(csv).toMatchObject({ format: 'csv' });
    expect(previewText(model(sel), 'csv', { t, language: 'es' })).toBe(
      renderCsv(model(sel)).replace(CSV_BOM, ''),
    );
    const json = prepareReport(model(sel), 'json', { t, language: 'es' });
    expect(json.format === 'json' && json.content).toBe(renderJson(model(sel)));
  });
});
