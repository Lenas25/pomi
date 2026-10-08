import { formatKg } from '../gym/sessionViewModel';
import type { Language } from '../i18n';

/** A change with its sign and the locale's decimal separator: "+2,5", "-1", "0" (no judgment). */
export function formatSigned(change: number, language: Language): string {
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return '0';
  const text = formatKg(Math.abs(rounded), language);
  return rounded > 0 ? `+${text}` : `-${text}`;
}
