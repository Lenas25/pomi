import { fitPhotoBudget } from './photoBudget';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { en } from '../i18n/en';
import { es } from '../i18n/es';
import type { Language, Translate } from '../i18n';
import tokens from '../../design/tokens.json';

import { buildReport } from './buildReport';
import { periodFor } from './period';
import { REPORT_PALETTE } from './palette';
import { prepareReport, previewText } from './prepare';
import { escapeHtml, renderHtml } from './renderHtml';
import { renderText } from './renderText';
import { applyTemplate, defaultSelection, toggleSection } from './templates';
import {
  AVAILABLE_SECTIONS,
  MAX_REPORT_PHOTOS,
  REPORT_TEMPLATES,
  type ReportData,
  type ReportSelection,
} from './types';

const translator =
  (messages: object): Translate =>
  (key, options) => {
    const text = key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        messages,
      );
    return String(text ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(options?.[name] ?? `{{${name}}}`),
    );
  };
const LANGUAGES: readonly (readonly [Language, Translate])[] = [
  ['es', translator(es)],
  ['en', translator(en)],
];
const [, tEs] = LANGUAGES[0]!;

// Tests run in America/New_York. 02:00 on 2026-10-07 is before the 04:00 rollover: the logical
// day is still 2026-10-06.
const NOW = new Date(2026, 9, 7, 2, 0);
const TODAY = '2026-10-06';

const data: ReportData = {
  today: TODAY,
  startedOn: '2026-08-01',
  gymDays: [{ days: [1, 3, 5], anchor: 'gymMorning' }],
  sessions: [
    // Day before the 7 day period (2026-09-30 .. 2026-10-06): left out.
    { date: '2026-09-29', sets: [{ stepId: 'squat', weightKg: 90, reps: 5 }] },
    { date: '2026-09-30', sets: [{ stepId: 'squat', weightKg: 60, reps: 8 }] },
    {
      date: '2026-10-02',
      sets: [
        { stepId: 'squat', weightKg: 62.5, reps: 8 },
        { stepId: 'squat', weightKg: 62.5, reps: 7 },
        { stepId: 'plank', weightKg: null, reps: 1 },
      ],
    },
    { date: '2026-10-06', sets: [{ stepId: 'squat', weightKg: 65, reps: 8 }] },
    // After the logical today: left out.
    { date: '2026-10-07', sets: [{ stepId: 'squat', weightKg: 100, reps: 3 }] },
  ],
  exerciseNames: { squat: 'Sentadilla', plank: 'Plancha' },
  water: {
    glassMl: 250,
    days: [
      { date: '2026-10-01', glasses: 8, targetGlasses: 8 },
      { date: '2026-10-02', glasses: 4, targetGlasses: 8 },
      { date: '2026-09-20', glasses: 8, targetGlasses: 8 },
    ],
  },
  steps: [
    { date: '2026-10-01', steps: 9000 },
    { date: '2026-10-02', steps: 6000 },
    { date: '2026-09-01', steps: 12345 },
  ],
  stepsGoal: 8000,
  checks: [
    { id: 'pausa', name: 'Pausa activa', dates: ['2026-10-01', '2026-10-02', '2026-08-01'] },
  ],
  foodNotes: [
    { date: '2026-10-01', text: 'Comí lentejas y me sentí con energía' },
    { date: '2026-08-01', text: 'nota antigua' },
  ],
  sleep: [
    { date: '2026-10-01', bed: '23:00', wake: '06:30' },
    { date: '2026-10-02', bed: '23:30', wake: '07:00' },
    { date: '2026-09-10', bed: '01:00', wake: '09:00' },
  ],
  sleepTargetH: 8,
  metrics: [
    {
      id: 'peso',
      name: 'Peso',
      unit: 'kg',
      entries: [
        { date: '2026-09-28', value: 62 },
        { date: '2026-10-01', value: 61.5 },
        { date: '2026-10-05', value: 61 },
      ],
    },
  ],
  photos: Array.from({ length: 8 }, (_, index) => ({
    date: `2026-10-0${index + 1}`,
    pose: index % 2 === 0 ? 'frente' : 'perfil',
    name: `2026-10-0${index + 1}-pose-${index}.jpg`,
  })),
};

const selection = (overrides: Partial<ReportSelection> = {}): ReportSelection => ({
  ...defaultSelection('custom'),
  period: '7d',
  ...overrides,
});

describe('periodFor', () => {
  it('ends on the LOGICAL day (04:00 rollover) and is inclusive', () => {
    expect(periodFor('7d', NOW)).toEqual({ kind: '7d', from: '2026-09-30', to: TODAY });
    expect(periodFor('7d', new Date(2026, 9, 7, 5, 0)).to).toBe('2026-10-07');
    expect(periodFor('30d', NOW).from).toBe('2026-09-07');
    expect(periodFor('90d', NOW).from).toBe('2026-07-09');
  });

  it('"all" starts on the first day of use, clamped to the data that is loaded (400 days)', () => {
    expect(periodFor('all', NOW, '2026-08-01').from).toBe('2026-08-01');
    expect(periodFor('all', NOW).from).toBe('2025-09-01');
    expect(periodFor('all', NOW, '2027-01-01').from).toBe('2025-09-01');
    expect(periodFor('all', NOW, '2020-01-01').from).toBe('2025-09-01');
  });
});

describe('templates', () => {
  const sectionsOf = (template: (typeof REPORT_TEMPLATES)[number]) =>
    applyTemplate(selection(), template).sections;

  it('each template selects the right sections', () => {
    expect(sectionsOf('trainer')).toEqual(['gym', 'measures']);
    expect(sectionsOf('nutritionist')).toEqual(['measures', 'habits']);
    expect(sectionsOf('ai')).toEqual(['gym', 'habits', 'sleep', 'measures']);
    expect(sectionsOf('custom')).toEqual(['gym', 'habits', 'sleep', 'measures']);
  });

  it('photos and findings are never part of a template, and food notes only of the nutritionist', () => {
    for (const template of REPORT_TEMPLATES) {
      const applied = applyTemplate(selection(), template);
      expect(applied.sections).not.toContain('photos');
      expect(applied.sections).not.toContain('findings');
      expect(applied.foodNotes).toBe(template === 'nutritionist');
    }
    expect(AVAILABLE_SECTIONS).not.toContain('findings');
  });

  it('toggling a section keeps the template (the AI instruction stays)', () => {
    const toggled = toggleSection(applyTemplate(selection(), 'ai'), 'sleep');
    expect(toggled.template).toBe('ai');
    expect(toggled.sections).toEqual(['gym', 'habits', 'measures']);
    expect(toggleSection(toggled, 'photos').sections).toContain('photos');
  });
});

describe('buildReport', () => {
  it('builds only the selected sections, in a fixed order', () => {
    const model = buildReport(data, selection({ sections: ['measures', 'gym'] }), NOW);
    expect(model.sections.map((section) => section.kind)).toEqual(['gym', 'measures']);
    expect(model.period).toEqual({ kind: '7d', from: '2026-09-30', to: TODAY });
  });

  it('filters by period with logical days: both edges in, a day before / after out', () => {
    const gym = buildReport(data, selection({ sections: ['gym'] }), NOW).sections[0];
    if (gym?.kind !== 'gym') throw new Error('gym expected');
    expect(gym.sessionsDone).toBe(3); // 09-30, 10-02, 10-06 (not 09-29, not 10-07)
    const squat = gym.exercises.find((exercise) => exercise.stepId === 'squat');
    expect(squat).toMatchObject({
      sessions: 3,
      sets: 4,
      firstDate: '2026-09-30',
      lastDate: '2026-10-06',
      topWeightKg: 65,
    });
    // Planned Mon/Wed/Fri inside 09-30 .. 10-06: Wed 9/30, Fri 10/2, Mon 10/5 = 3.
    expect(gym.sessionsPlanned).toBe(3);
    const plank = gym.exercises.find((exercise) => exercise.stepId === 'plank');
    expect(plank).toMatchObject({ topWeightKg: null, bestReps: 1, e1rmFrom: null });

    const wide = buildReport(data, selection({ sections: ['gym'], period: '30d' }), NOW)
      .sections[0];
    expect(wide?.kind === 'gym' && wide.sessionsDone).toBe(4); // adds 09-29
  });

  it('summarises habits, sleep and measures only inside the period', () => {
    const model = buildReport(data, selection({ sections: ['habits', 'sleep', 'measures'] }), NOW);
    const [habits, sleep, measures] = model.sections;
    expect(habits).toMatchObject({
      kind: 'habits',
      water: { daysLogged: 2, daysMet: 1, averageGlasses: 6 },
      steps: { daysLogged: 2, average: 7500, goal: 8000, daysMet: 1 },
      checks: [{ name: 'Pausa activa', days: 2 }],
      foodNotes: null,
    });
    expect(sleep).toMatchObject({
      kind: 'sleep',
      nights: 2,
      averageMin: 450,
      targetMin: 480,
      wakeRangeMin: 30,
    });
    expect(measures).toMatchObject({
      kind: 'measures',
      metrics: [
        {
          name: 'Peso',
          change: -0.5,
          entries: [
            { date: '2026-10-01', value: 61.5 },
            { date: '2026-10-05', value: 61 },
          ],
        },
      ],
    });
  });

  it('marks a section without records as empty instead of inventing numbers', () => {
    const model = buildReport(
      { ...data, sessions: [], sleep: [], metrics: [] },
      selection({ sections: ['gym', 'sleep', 'measures'] }),
      NOW,
    );
    expect(model.sections.every((section) => section.empty)).toBe(true);
  });

  it('food notes travel only when switched on', () => {
    const off = buildReport(data, selection({ sections: ['habits'] }), NOW);
    const on = buildReport(data, selection({ sections: ['habits'], foodNotes: true }), NOW);
    expect(off.sections[0]).toMatchObject({ foodNotes: null });
    expect(on.sections[0]).toMatchObject({
      foodNotes: [{ date: '2026-10-01', text: 'Comí lentejas y me sentí con energía' }],
    });
  });

  it('photos are excluded unless their section is ticked, and capped when they are', () => {
    for (const template of REPORT_TEMPLATES) {
      const model = buildReport(data, applyTemplate(selection({ period: 'all' }), template), NOW);
      expect(model.sections.map((section) => section.kind)).not.toContain('photos');
    }
    const model = buildReport(data, selection({ sections: ['photos'], period: '30d' }), NOW);
    const photos = model.sections[0];
    if (photos?.kind !== 'photos') throw new Error('photos expected');
    expect(photos.total).toBe(6); // 10-01 .. 10-06 are in the 30 day period only up to today
    expect(photos.items).toHaveLength(Math.min(6, MAX_REPORT_PHOTOS));
    expect(photos.items[0]?.date).toBe('2026-10-06');
  });

  it('the AI template carries the instruction; the note is trimmed and capped', () => {
    expect(buildReport(data, applyTemplate(selection(), 'ai'), NOW).instruction).toBe(true);
    expect(buildReport(data, applyTemplate(selection(), 'trainer'), NOW).instruction).toBe(false);
    const note = buildReport(data, selection({ note: `  hola ${'x'.repeat(600)}  ` }), NOW).note;
    expect(note.startsWith('hola ')).toBe(true);
    expect(note.length).toBe(500);
  });
});

describe('text and HTML renderers', () => {
  const trainer = buildReport(
    data,
    { ...applyTemplate(selection(), 'trainer'), note: 'Hola, entrené con rodilla sensible.' },
    NOW,
  );

  it('writes the trainer report in Spanish and in English with every placeholder filled', () => {
    const es = renderText(trainer, { t: tEs, language: 'es', includesPhotos: false });
    expect(es).toContain('Reporte de progreso de Pomi');
    expect(es).toContain('Período: 2026-09-30 a 2026-10-06');
    expect(es).toContain('Preparado para: Entrenador');
    expect(es).toContain('Hola, entrené con rodilla sensible.');
    expect(es).toContain('## Gym');
    expect(es).toContain('Sesiones: 3 de 3 planeadas');
    expect(es).toContain('- Sentadilla: 3 sesiones, 4 series; peso máximo 65 kg');
    expect(es).toContain('## Medidas');
    expect(es).toContain('2026-10-01: 61,5');
    expect(es).toContain('Cambio en el período: -0,5 kg');
    for (const [language, t] of LANGUAGES) {
      for (const model of [
        trainer,
        buildReport(
          data,
          selection({
            foodNotes: true,
            sections: ['gym', 'habits', 'sleep', 'measures', 'photos'],
          }),
          NOW,
        ),
      ]) {
        const text = renderText(model, { t, language, includesPhotos: language === 'es' });
        const html = renderHtml(model, { t, language });
        expect(text).not.toMatch(/\{\{|reports\.|share\./);
        expect(html).not.toMatch(/\{\{|reports\.|share\./);
      }
    }
  });

  it('contains only what was selected: no sleep, habits, food notes or photos in the trainer report', () => {
    const text = renderText(trainer, { t: tEs, language: 'es', includesPhotos: false });
    const html = renderHtml(trainer, { t: tEs, language: 'es' });
    for (const output of [text, html]) {
      expect(output).not.toMatch(/Sueño|Hábitos|Fotos|Agua|Pasos|lentejas|frente|perfil|\.jpg/);
      expect(output).not.toContain('Pausa activa');
    }
  });

  it('the AI template adds the instruction line', () => {
    const model = buildReport(data, applyTemplate(selection(), 'ai'), NOW);
    expect(renderText(model, { t: tEs, language: 'es', includesPhotos: false })).toContain(
      'Analiza mi progreso y dime qué ajustar.',
    );
    expect(
      renderText(model, { t: translator(en), language: 'en', includesPhotos: false }),
    ).toContain('Analyze my progress and tell me what to adjust.');
  });

  it('nutritionist: food notes appear (when on) but never photos', () => {
    const model = buildReport(data, applyTemplate(selection(), 'nutritionist'), NOW);
    const text = renderText(model, { t: tEs, language: 'es', includesPhotos: false });
    expect(text).toContain('Comí lentejas');
    expect(text).toContain('Agua: 2 días registrados, promedio 6 vasos; meta cumplida 1 días');
    expect(text).not.toContain('nota antigua');
    expect(text).not.toContain('## Fotos');
  });

  it('photos in plain text are only counted, with the reason; the PDF draws them', () => {
    const model = buildReport(data, selection({ sections: ['photos'], period: '30d' }), NOW);
    const text = renderText(model, { t: tEs, language: 'es', includesPhotos: false });
    expect(text).toContain('Fotos del período: 6');
    expect(text).toContain('elige PDF');
    expect(text).not.toContain('.jpg');
    const first = model.sections[0];
    if (first?.kind !== 'photos') throw new Error('photos expected');
    const name = first.items[0]?.name ?? '';
    const html = renderHtml(model, {
      t: tEs,
      language: 'es',
      photoSources: { [name]: 'data:image/jpeg;base64,AAAA' },
    });
    expect(html).toContain('<img src="data:image/jpeg;base64,AAAA" alt="perfil, 2026-10-06"');
    expect(html.match(/<img /g)).toHaveLength(1); // only the one with a source
    expect(html).not.toContain(name);
  });

  it('keeps photos inside the byte cap and says so in the PDF when some were left out', () => {
    expect(
      fitPhotoBudget(
        [
          { name: 'a', uri: 'x'.repeat(60) },
          { name: 'b', uri: 'x'.repeat(60) },
          { name: 'c', uri: null },
        ],
        100,
      ),
    ).toEqual({ sources: { a: 'x'.repeat(60) }, dropped: 2 });
    expect(MAX_REPORT_PHOTOS).toBe(2);
    const model = buildReport(data, selection({ sections: ['photos'], period: '30d' }), NOW);
    const withNote = renderHtml(model, { t: tEs, language: 'es', photosDropped: 1 });
    expect(withNote).toContain('Se dejaron fuera 1 foto(s)');
    expect(renderHtml(model, { t: tEs, language: 'es' })).not.toContain('Se dejaron fuera');
  });

  it('the HTML is a printable, accessible document with real tables', () => {
    const html = renderHtml(buildReport(data, selection({ sections: ['gym', 'measures'] }), NOW), {
      t: tEs,
      language: 'es',
    });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toContain('<caption>Series por ejercicio</caption>');
    expect(html).toContain('<th scope="col">Ejercicio</th>');
    expect(html).toContain('<th scope="row">Sentadilla</th>');
    expect(html).toContain('<section aria-labelledby="section-0"><h2 id="section-0">Gym</h2>');
    expect(html).toContain('@page');
    expect(html).toContain('print-color-adjust: exact');
  });

  it('escapes everything the person typed', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
    const model = buildReport(
      { ...data, foodNotes: [{ date: '2026-10-01', text: '<b>pan</b>' }] },
      selection({ sections: ['habits'], foodNotes: true, note: '<img src=x onerror=alert(1)>' }),
      NOW,
    );
    const html = renderHtml(model, { t: tEs, language: 'es' });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>pan</b>');
    expect(html).toContain('&lt;b&gt;pan&lt;/b&gt;');
  });

  it('colors come from the design tokens, never from literals in the renderer', () => {
    expect(REPORT_PALETTE.text).toBe(tokens.color.light.text);
    expect(REPORT_PALETTE.page).toBe(tokens.color.light.surface);
    const source = readFileSync(join(__dirname, 'renderHtml.ts'), 'utf8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
    const html = renderHtml(trainer, { t: tEs, language: 'es' });
    expect(html).toContain(tokens.color.light.text);
    expect(html).toContain(tokens.color.light.border);
  });
});

describe('prepareReport', () => {
  const model = buildReport(data, selection({ sections: ['gym'] }), NOW);

  it('text format yields a message and the PDF format yields the HTML', () => {
    const text = prepareReport(model, 'text', { t: tEs, language: 'es' });
    const pdf = prepareReport(model, 'pdf', { t: tEs, language: 'es' });
    expect(text.format === 'text' && text.message).toContain('## Gym');
    expect(pdf.format === 'pdf' && pdf.html).toContain('<h2 id="section-0">Gym</h2>');
  });

  it('the preview is the text that will be sent (the PDF preview also lists the photos)', () => {
    const photos = buildReport(data, selection({ sections: ['photos'], period: '30d' }), NOW);
    expect(previewText(model, 'text', { t: tEs, language: 'es' })).toBe(
      (prepareReport(model, 'text', { t: tEs, language: 'es' }) as { message: string }).message,
    );
    expect(previewText(photos, 'pdf', { t: tEs, language: 'es' })).toContain('frente');
    expect(previewText(photos, 'text', { t: tEs, language: 'es' })).not.toContain('frente');
  });
});
