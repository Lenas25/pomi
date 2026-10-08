// The deload week the person accepted from a suggestion (settings `deloadWeek`).
import type { SettingsValue } from '../db/repositories/settings';

/** The percentage to lower weights by on `today`, or `undefined` outside the deload week. */
export function activeDeloadPct(
  week: SettingsValue<'deloadWeek'> | undefined,
  today: string,
): number | undefined {
  return week && today >= week.startsOn && today <= week.endsOn ? week.pct : undefined;
}
