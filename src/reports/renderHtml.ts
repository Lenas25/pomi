// HTML renderer for the PDF (expo-print turns this string into a file). Printable and accessible:
// one <h1>, a <section> with an <h2> per block, real tables (<caption>, <th scope>), image alt
// text, no color-only meaning, and colors from the design tokens (`palette.ts`), never literals.
import type { Language, Translate } from '../i18n';
import { insightTexts } from '../insights/text';

import { formatMinutes, formatNumber, formatSigned } from './format';
import { REPORT_PALETTE, REPORT_RADIUS, REPORT_SPACE, REPORT_TYPE } from './palette';
import type {
  FindingsReport,
  GymReport,
  HabitsReport,
  MeasuresReport,
  PhotosReport,
  ReportModel,
  ReportRenderer,
  ReportSection,
  SleepReport,
} from './types';

export type HtmlContext = {
  t: Translate;
  language: Language;
  /** Photo file name -> `data:image/jpeg;base64,...`. A photo without an entry is listed, not drawn. */
  photoSources?: Readonly<Record<string, string>>;
  /** Photos left out of the PDF to keep it light; a note says so. */
  photosDropped?: number;
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Everything the person typed (note, food notes, names) goes through this. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

const e = escapeHtml;

function table(caption: string, headers: readonly string[], rows: readonly (readonly string[])[]) {
  const head = headers.map((header) => `<th scope="col">${e(header)}</th>`).join('');
  const body = rows
    .map(
      ([first, ...rest]) =>
        `<tr><th scope="row">${e(first ?? '')}</th>${rest.map((cell) => `<td>${e(cell)}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table><caption>${e(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const paragraph = (text: string) => `<p>${e(text)}</p>`;

function gymHtml(section: GymReport, { t, language }: HtmlContext): string {
  const summary = paragraph(
    section.sessionsPlanned > 0
      ? t('reports.gym.sessions', { done: section.sessionsDone, planned: section.sessionsPlanned })
      : t('reports.gym.sessionsUnplanned', { done: section.sessionsDone }),
  );
  if (section.empty) return summary + paragraph(t('reports.empty'));
  const num = (value: number | null) => (value === null ? '–' : formatNumber(value, language));
  return (
    summary +
    table(
      t('reports.gym.exercisesCaption'),
      [
        t('reports.gym.col.exercise'),
        t('reports.gym.col.sessions'),
        t('reports.gym.col.sets'),
        t('reports.gym.col.top'),
        t('reports.gym.col.e1rmFrom'),
        t('reports.gym.col.e1rmTo'),
      ],
      section.exercises.map((exercise) => [
        exercise.name,
        String(exercise.sessions),
        String(exercise.sets),
        num(exercise.topWeightKg),
        num(exercise.e1rmFrom),
        num(exercise.e1rmTo),
      ]),
    )
  );
}

function habitsHtml(section: HabitsReport, { t, language }: HtmlContext): string {
  if (section.empty) return paragraph(t('reports.empty'));
  const rows: string[][] = [];
  if (section.water) {
    const met =
      section.water.daysMet > 0
        ? `; ${t('reports.habits.waterMet', { met: section.water.daysMet })}`
        : '';
    rows.push([
      t('reports.habits.water', {
        days: section.water.daysLogged,
        average: formatNumber(section.water.averageGlasses, language),
      }) + met,
    ]);
  }
  if (section.steps) {
    const met =
      section.steps.goal !== null && section.steps.daysMet !== null
        ? `; ${t('reports.habits.stepsMet', { goal: formatNumber(section.steps.goal, language), met: section.steps.daysMet })}`
        : '';
    rows.push([
      t('reports.habits.steps', {
        days: section.steps.daysLogged,
        average: formatNumber(section.steps.average, language),
      }) + met,
    ]);
  }
  for (const check of section.checks) {
    rows.push([t('reports.habits.check', { name: check.name, days: check.days })]);
  }
  let html = '';
  if (rows.length > 0) {
    // A one-column table would only be decoration: a list is the honest structure.
    html += `<ul>${rows.map(([text]) => `<li>${e(text ?? '')}</li>`).join('')}</ul>`;
  }
  if (section.foodNotes && section.foodNotes.length > 0) {
    html += table(
      t('reports.habits.foodNotes'),
      [t('reports.measures.col.date'), t('reports.habits.foodNotes')],
      section.foodNotes.map((note) => [note.date, note.text]),
    );
  }
  return html;
}

function sleepHtml(section: SleepReport, { t }: HtmlContext): string {
  if (section.empty) return paragraph(t('reports.empty'));
  // The same sentences as the text format, as a list.
  const average = formatMinutes(section.averageMin);
  const lines = [
    t('reports.sleep.nights', { nights: section.nights }),
    t('reports.sleep.average', { average }) +
      (section.targetMin !== null
        ? ` (${t('reports.sleep.target', { target: formatMinutes(section.targetMin) })})`
        : ''),
    ...(section.wakeRangeMin !== null
      ? [t('reports.sleep.wakeRange', { range: formatMinutes(section.wakeRangeMin) })]
      : []),
  ];
  return `<ul>${lines.map((line) => `<li>${e(line)}</li>`).join('')}</ul>`;
}

function measuresHtml(section: MeasuresReport, { t, language }: HtmlContext): string {
  if (section.empty) return paragraph(t('reports.empty'));
  return section.metrics
    .map((metric) => {
      const change =
        metric.change !== null
          ? paragraph(
              t('reports.measures.change', {
                change: formatSigned(metric.change, language),
                unit: metric.unit,
              }),
            )
          : '';
      return (
        table(
          t('reports.measures.caption', { name: metric.name, unit: metric.unit }),
          [t('reports.measures.col.date'), t('reports.measures.col.value')],
          metric.entries.map((entry) => [entry.date, formatNumber(entry.value, language)]),
        ) + change
      );
    })
    .join('');
}

function photosHtml(
  section: PhotosReport,
  { t, photoSources = {}, photosDropped = 0 }: HtmlContext,
): string {
  if (section.empty) return paragraph(t('reports.empty'));
  const figures = section.items
    .map((item) => {
      const caption = t('reports.photos.item', { date: item.date, pose: item.pose });
      const source = photoSources[item.name];
      const image = source
        ? `<img src="${e(source)}" alt="${e(t('reports.photos.alt', { pose: item.pose, date: item.date }))}">`
        : '';
      return `<figure>${image}<figcaption>${e(caption)}</figcaption></figure>`;
    })
    .join('');
  const shown =
    section.total > section.items.length
      ? paragraph(t('reports.photos.shown', { shown: section.items.length }))
      : '';
  const dropped =
    photosDropped > 0 ? paragraph(t('reports.photos.dropped', { count: photosDropped })) : '';
  return (
    paragraph(t('reports.photos.total', { total: section.total })) +
    shown +
    dropped +
    `<div class="photos">${figures}</div>`
  );
}

function findingsHtml(section: FindingsReport, { t, language }: HtmlContext): string {
  if (section.empty) return paragraph(t('reports.empty'));
  const items = section.items.map((item) => {
    const { text, evidence } = insightTexts(item, t, language);
    return `<li>${e(`${text} (${evidence})`)}</li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

function sectionBody(section: ReportSection, context: HtmlContext): string {
  switch (section.kind) {
    case 'gym':
      return gymHtml(section, context);
    case 'habits':
      return habitsHtml(section, context);
    case 'sleep':
      return sleepHtml(section, context);
    case 'measures':
      return measuresHtml(section, context);
    case 'photos':
      return photosHtml(section, context);
    case 'findings':
      return findingsHtml(section, context);
  }
}

function styles(): string {
  const p = REPORT_PALETTE;
  return `
@page { margin: ${REPORT_SPACE.large}px; }
* { box-sizing: border-box; }
body { margin: 0; background: ${p.page}; color: ${p.text}; font-family: Helvetica, Arial, sans-serif; font-size: ${REPORT_TYPE.body}px; line-height: ${REPORT_TYPE.bodyLine}px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
header { background: ${p.headerBackground}; border-radius: ${REPORT_RADIUS}px; padding: ${REPORT_SPACE.medium}px; margin-bottom: ${REPORT_SPACE.large}px; }
h1 { margin: 0 0 ${REPORT_SPACE.small}px; font-size: ${REPORT_TYPE.title}px; line-height: 1.2; }
h2 { margin: ${REPORT_SPACE.large}px 0 ${REPORT_SPACE.small}px; font-size: ${REPORT_TYPE.section}px; border-bottom: 2px solid ${p.accent}; padding-bottom: 4px; break-after: avoid; }
p { margin: 0 0 ${REPORT_SPACE.small}px; }
ul { margin: 0 0 ${REPORT_SPACE.small}px; padding-left: ${REPORT_SPACE.medium}px; }
.muted { color: ${p.muted}; }
.note { border-left: 4px solid ${p.accent}; padding-left: ${REPORT_SPACE.small}px; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; margin: ${REPORT_SPACE.small}px 0; break-inside: avoid; }
caption { text-align: left; font-weight: 700; padding-bottom: 4px; }
th, td { border: 1px solid ${p.border}; padding: 4px ${REPORT_SPACE.small}px; text-align: left; font-size: ${REPORT_TYPE.caption + 1}px; }
thead th { background: ${p.accent}; color: ${p.onAccent}; }
tbody th { font-weight: 700; }
.photos { display: flex; flex-wrap: wrap; gap: ${REPORT_SPACE.small}px; }
figure { margin: 0; width: 45%; break-inside: avoid; }
img { width: 100%; height: auto; border-radius: ${REPORT_RADIUS}px; }
figcaption { font-size: ${REPORT_TYPE.caption}px; }
footer { margin-top: ${REPORT_SPACE.large}px; font-size: ${REPORT_TYPE.caption}px; color: ${p.muted}; }
`;
}

export const renderHtml: ReportRenderer<HtmlContext> = (model: ReportModel, context) => {
  const { t, language } = context;
  const forWhom =
    model.template !== 'custom'
      ? `<p class="muted">${e(t('reports.forWhom', { who: t(`reports.template.${model.template}`) }))}</p>`
      : '';
  const note =
    model.note !== ''
      ? `<h2>${e(t('reports.noteTitle'))}</h2><p class="note">${e(model.note)}</p>`
      : '';
  const instruction = model.instruction
    ? `<p><strong>${e(t('reports.instruction'))}</strong></p>`
    : '';
  const sections = model.sections
    .map((section, index) => {
      const id = `section-${index}`;
      return `<section aria-labelledby="${id}"><h2 id="${id}">${e(t(`reports.section.${section.kind}`))}</h2>${sectionBody(section, context)}</section>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(t('reports.title'))}</title>
<style>${styles()}</style>
</head>
<body>
<main>
<header>
<h1>${e(t('reports.title'))}</h1>
<p>${e(t('reports.period', { from: model.period.from, to: model.period.to }))}</p>
${forWhom}
</header>
${note}
${instruction}
${sections}
</main>
<footer>${e(t('reports.footer'))}</footer>
</body>
</html>`;
};
