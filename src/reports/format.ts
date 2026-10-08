import type { Language } from '../i18n';

/** `61.5` -> "61,5" in Spanish, "61.5" in English; at most one decimal. */
export function formatNumber(value: number, language: Language): string {
  return value.toLocaleString(language, { maximumFractionDigits: 1 });
}

/** Signed change: "+0,5", "-1,2", "0". */
export function formatSigned(value: number, language: Language): string {
  const text = formatNumber(Math.abs(value), language);
  if (value === 0) return text;
  return `${value > 0 ? '+' : '-'}${text}`;
}

/** `450` -> "7 h 30 min", `480` -> "8 h". */
export function formatMinutes(totalMin: number): string {
  const rounded = Math.round(totalMin);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
