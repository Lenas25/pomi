// Turns a model into what a format actually sends. Pure. The preview uses `previewText`, which is
// the very same content the person is about to share.
import type { Language, Translate } from '../i18n';

import { renderHtml } from './renderHtml';
import { renderText } from './renderText';
import type { ReportFormat, ReportModel } from './types';

export type PrepareContext = {
  t: Translate;
  language: Language;
  /** Data URIs of the photos for the PDF, by file name. */
  photoSources?: Readonly<Record<string, string>>;
  /** Photos asked for but left out of the PDF (unreadable or over the size cap). */
  photosDropped?: number;
};

export type PreparedReport = { format: 'text'; message: string } | { format: 'pdf'; html: string };

/*
 * v3 adds `csv` and `json` here: each is one more `ReportRenderer` over the same `ReportModel`
 * (no change to the model, the selection or the preview). They are NOT built yet.
 */

export function prepareReport(
  model: ReportModel,
  format: ReportFormat,
  context: PrepareContext,
): PreparedReport {
  if (format === 'pdf') {
    return {
      format,
      html: renderHtml(model, {
        t: context.t,
        language: context.language,
        ...(context.photoSources ? { photoSources: context.photoSources } : {}),
        ...(context.photosDropped ? { photosDropped: context.photosDropped } : {}),
      }),
    };
  }
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
  return renderText(model, { ...context, includesPhotos: format === 'pdf' });
}
