// Plain-text renderer (the "Texto" format and the preview). Every sentence comes from i18n.
import type { Language, Translate } from '../i18n';

import { insightTexts } from '../insights/text';

import { formatMinutes, formatNumber, formatSigned } from './format';
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

export type TextContext = {
  t: Translate;
  language: Language;
  /** Photos travel with this output (PDF). In plain text they cannot, and the report says so. */
  includesPhotos: boolean;
};

function gymLines(section: GymReport, { t, language }: TextContext): string[] {
  const lines = [
    section.sessionsPlanned > 0
      ? t('reports.gym.sessions', { done: section.sessionsDone, planned: section.sessionsPlanned })
      : t('reports.gym.sessionsUnplanned', { done: section.sessionsDone }),
  ];
  if (section.empty) return [...lines, t('reports.empty')];
  lines.push(t('reports.gym.exercises'));
  for (const exercise of section.exercises) {
    const parts = [
      t('reports.gym.exercise', {
        name: exercise.name,
        sessions: exercise.sessions,
        sets: exercise.sets,
      }),
    ];
    if (exercise.topWeightKg !== null) {
      parts.push(t('reports.gym.topWeight', { kg: formatNumber(exercise.topWeightKg, language) }));
    } else if (exercise.bestReps !== null) {
      parts.push(t('reports.gym.bestReps', { reps: exercise.bestReps }));
    }
    if (exercise.e1rmFrom !== null && exercise.e1rmTo !== null) {
      parts.push(
        t('reports.gym.e1rm', {
          from: formatNumber(exercise.e1rmFrom, language),
          to: formatNumber(exercise.e1rmTo, language),
        }),
      );
    }
    lines.push(`- ${parts.join('; ')}`);
  }
  return lines;
}

function habitsLines(section: HabitsReport, { t, language }: TextContext): string[] {
  if (section.empty) return [t('reports.empty')];
  const lines: string[] = [];
  if (section.water) {
    const parts = [
      t('reports.habits.water', {
        days: section.water.daysLogged,
        average: formatNumber(section.water.averageGlasses, language),
      }),
    ];
    if (section.water.daysMet > 0) {
      parts.push(t('reports.habits.waterMet', { met: section.water.daysMet }));
    }
    lines.push(parts.join('; '));
  }
  if (section.steps) {
    const parts = [
      t('reports.habits.steps', {
        days: section.steps.daysLogged,
        average: formatNumber(section.steps.average, language),
      }),
    ];
    if (section.steps.goal !== null && section.steps.daysMet !== null) {
      parts.push(
        t('reports.habits.stepsMet', {
          goal: formatNumber(section.steps.goal, language),
          met: section.steps.daysMet,
        }),
      );
    }
    lines.push(parts.join('; '));
  }
  for (const check of section.checks) {
    lines.push(t('reports.habits.check', { name: check.name, days: check.days }));
  }
  if (section.foodNotes && section.foodNotes.length > 0) {
    lines.push(`${t('reports.habits.foodNotes')}:`);
    for (const note of section.foodNotes) lines.push(`- ${note.date}: ${note.text}`);
  }
  return lines;
}

function sleepLines(section: SleepReport, { t }: TextContext): string[] {
  if (section.empty) return [t('reports.empty')];
  const average = formatMinutes(section.averageMin);
  const lines = [
    t('reports.sleep.nights', { nights: section.nights }),
    t('reports.sleep.average', { average }) +
      (section.targetMin !== null
        ? ` (${t('reports.sleep.target', { target: formatMinutes(section.targetMin) })})`
        : ''),
  ];
  if (section.wakeRangeMin !== null) {
    lines.push(t('reports.sleep.wakeRange', { range: formatMinutes(section.wakeRangeMin) }));
  }
  return lines;
}

function measuresLines(section: MeasuresReport, { t, language }: TextContext): string[] {
  if (section.empty) return [t('reports.empty')];
  const lines: string[] = [];
  for (const metric of section.metrics) {
    lines.push(`- ${metric.name} (${metric.unit})`);
    lines.push(
      `  ${metric.entries.map((entry) => `${entry.date}: ${formatNumber(entry.value, language)}`).join(' · ')}`,
    );
    if (metric.change !== null) {
      lines.push(
        `  ${t('reports.measures.change', { change: formatSigned(metric.change, language), unit: metric.unit })}`,
      );
    }
  }
  return lines;
}

function photosLines(section: PhotosReport, { t, includesPhotos }: TextContext): string[] {
  if (section.empty) return [t('reports.empty')];
  const lines = [t('reports.photos.total', { total: section.total })];
  if (!includesPhotos) return [...lines, t('reports.photos.textOnly')];
  if (section.total > section.items.length) {
    lines.push(t('reports.photos.shown', { shown: section.items.length }));
  }
  for (const item of section.items) {
    lines.push(`- ${t('reports.photos.item', { date: item.date, pose: item.pose })}`);
  }
  return lines;
}

function findingsLines(section: FindingsReport, { t, language }: TextContext): string[] {
  if (section.empty) return [t('reports.empty')];
  return section.items.map((item) => {
    const { text, evidence } = insightTexts(item, t, language);
    return `- ${text} (${evidence})`;
  });
}

function linesOf(section: ReportSection, context: TextContext): string[] {
  switch (section.kind) {
    case 'gym':
      return gymLines(section, context);
    case 'habits':
      return habitsLines(section, context);
    case 'sleep':
      return sleepLines(section, context);
    case 'measures':
      return measuresLines(section, context);
    case 'photos':
      return photosLines(section, context);
    case 'findings':
      return findingsLines(section, context);
  }
}

export const renderText: ReportRenderer<TextContext> = (model: ReportModel, context) => {
  const { t } = context;
  const lines = [
    t('reports.title'),
    t('reports.period', { from: model.period.from, to: model.period.to }),
  ];
  if (model.template !== 'custom') {
    lines.push(t('reports.forWhom', { who: t(`reports.template.${model.template}`) }));
  }
  if (model.note !== '') lines.push('', `${t('reports.noteTitle')}:`, model.note);
  if (model.instruction) lines.push('', t('reports.instruction'));
  for (const section of model.sections) {
    lines.push('', `## ${t(`reports.section.${section.kind}`)}`, ...linesOf(section, context));
  }
  lines.push('', t('reports.footer'));
  return lines.join('\n');
};
