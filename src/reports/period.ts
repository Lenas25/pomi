import { format, parseISO, subDays } from 'date-fns';

import { dayKeyFor } from '../domain/time';

import type { ReportPeriod, ReportPeriodKind } from './types';

const DAYS: Record<Exclude<ReportPeriodKind, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
/** "All" never reaches further back than this when the start of use is unknown. */
const ALL_FALLBACK_DAYS = 365;

/**
 * Inclusive range of LOGICAL days ending today (`dayKeyFor`: the day rolls over at 04:00, so a
 * report made at 01:00 ends on the day that is still going). `all` starts on the first day of use.
 */
export function periodFor(
  kind: ReportPeriodKind,
  now: Date,
  startedOn?: string | undefined,
): ReportPeriod {
  const to = dayKeyFor(now);
  const today = parseISO(to);
  if (kind === 'all') {
    const fallback = format(subDays(today, ALL_FALLBACK_DAYS), 'yyyy-MM-dd');
    return { kind, from: startedOn !== undefined && startedOn <= to ? startedOn : fallback, to };
  }
  return { kind, from: format(subDays(today, DAYS[kind] - 1), 'yyyy-MM-dd'), to };
}

export const inPeriod = (date: string, period: ReportPeriod) =>
  date >= period.from && date <= period.to;
