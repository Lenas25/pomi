// Turns the lines of the weekly review into strings. The engine (`src/domain/review`) only returns
// keys and numbers; durations, decimals and thousands separators are formatted here.
import { formatDuration } from '../domain/suggestions/rules';
import type { ReviewLine } from '../domain/review/buildWeeklyReview';
import type { Language, Translate, TranslationKey } from '../i18n';

function number(value: number, language: Language): string {
  return value.toLocaleString(language, { maximumFractionDigits: 1 });
}

export function reviewLineText(line: ReviewLine, t: Translate, language: Language): string {
  const params: Record<string, string | number> = { ...line.params };
  const { avgMin, targetMin, value, average } = line.params;
  if (typeof avgMin === 'number') params.avg = formatDuration(avgMin);
  if (typeof targetMin === 'number') params.target = formatDuration(targetMin);
  if (typeof value === 'number') params.value = number(value, language);
  if (typeof average === 'number') params.average = number(average, language);
  return t(line.key as TranslationKey, params);
}

/** "26 ene – 1 feb" in the active language. */
export function weekRangeText(
  weekStart: string,
  weekEnd: string,
  t: Translate,
  language: Language,
): string {
  const format = (day: string) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(language, {
      day: 'numeric',
      month: 'short',
    });
  };
  return t('review.range', { from: format(weekStart), to: format(weekEnd) });
}
