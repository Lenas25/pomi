// Turns a model into what a format actually sends. Pure. The preview uses `previewText`, which is
// the very same content the person is about to share.
import type { Language, Translate } from '../i18n';

import { CSV_BOM, renderCsv } from './renderCsv';
import { renderHtml } from './renderHtml';
import { renderJson } from './renderJson';
import { renderText } from './renderText';
import { MAX_REPORT_PHOTOS, type ReportFormat, type ReportModel } from './types';

export type PrepareContext = {
  t: Translate;
  language: Language;
  /** Data URIs of the photos for the PDF, by file name. */
  photoSources?: Readonly<Record<string, string>>;
  /** Photos asked for but left out of the PDF (unreadable or over the size cap). */
  photosDropped?: number;
};

export type PreparedReport =
  | { format: 'text'; message: string }
  | { format: 'pdf'; html: string }
  | { format: 'csv' | 'json'; content: string };

/** The PDF embeds photos, so only the newest `MAX_REPORT_PHOTOS` go in; the text model keeps all. */
export function capPhotosForPdf(model: ReportModel): ReportModel {
  return {
    ...model,
    sections: model.sections.map((section) =>
      section.kind === 'photos'
        ? { ...section, items: section.items.slice(0, MAX_REPORT_PHOTOS) }
        : section,
    ),
  };
}

export function prepareReport(
  model: ReportModel,
  format: ReportFormat,
  context: PrepareContext,
): PreparedReport {
  if (format === 'pdf') {
    return {
      format,
      html: renderHtml(capPhotosForPdf(model), {
        t: context.t,
        language: context.language,
        ...(context.photoSources ? { photoSources: context.photoSources } : {}),
        ...(context.photosDropped ? { photosDropped: context.photosDropped } : {}),
      }),
    };
  }
  // CSV and JSON are language independent and never carry photos (only their count).
  if (format === 'csv') return { format, content: renderCsv(model) };
  if (format === 'json') return { format, content: renderJson(model) };
  return {
    format,
    message: renderText(model, { t: context.t, language: context.language, includesPhotos: false }),
  };
}

/** What the preview screen shows: the text of the report as it will be sent. */
export function previewText(
  model: ReportModel,
  format: ReportFormat,
  context: Pick<PrepareContext, 't' | 'language'>,
): string {
  // The file content itself (without the invisible BOM), so the preview is what is sent.
  if (format === 'csv') return renderCsv(model).replace(CSV_BOM, '');
  if (format === 'json') return renderJson(model);
  return renderText(format === 'pdf' ? capPhotosForPdf(model) : model, {
    ...context,
    includesPhotos: format === 'pdf',
  });
}
