import { format, parseISO, subDays } from 'date-fns';

import { dayKeyFor } from '../domain/time';

import type { ReportPeriod, ReportPeriodKind } from './types';

const DAYS: Record<Exclude<ReportPeriodKind, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
/** How far back report data is loaded; "all" is clamped to it so a report never claims more than it read. */
export const REPORT_LOOKBACK_DAYS = 400;

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
    const oldest = format(subDays(today, REPORT_LOOKBACK_DAYS), 'yyyy-MM-dd');
    const start = startedOn !== undefined && startedOn <= to ? startedOn : oldest;
    return { kind, from: start < oldest ? oldest : start, to };
  }
  return { kind, from: format(subDays(today, DAYS[kind] - 1), 'yyyy-MM-dd'), to };
}

export const inPeriod = (date: string, period: ReportPeriod) =>
  date >= period.from && date <= period.to;
