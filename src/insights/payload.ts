// What an `insights` row stores: `text` = the i18n key of the sentence, `evidence` = the numbers
// behind it plus the sentence params. Validated on read (the table is also restored from backups).
import { z } from 'zod';

import { dayKeyFor } from '../domain/time';
import { INSIGHT_KINDS, type Insight, type InsightKind } from '../domain/insights';
import type { InsightRow } from '../db/repositories/insights';

const valueSchema = z.union([z.string(), z.number()]);
const TEXT_KEYS = [
  'insights.sleepGym.more',
  'insights.sleepGym.less',
  'insights.energySleep.higher',
  'insights.energySleep.lower',
  'insights.gymSleepQuality.better',
  'insights.gymSleepQuality.worse',
  'insights.stepsWeek.more',
  'insights.stepsWeek.less',
  'insights.bestWeekday.top',
] as const;

const evidenceSchema = z
  .record(z.string(), z.union([valueSchema, z.record(z.string(), valueSchema)]))
  .and(
    z.object({ days: z.number(), value: z.number(), params: z.record(z.string(), valueSchema) }),
  );

export type StoredInsight = {
  id: number;
  kind: InsightKind;
  textKey: (typeof TEXT_KEYS)[number];
  params: Record<string, string | number>;
  days: number;
  value: number;
  createdAt: number;
  seen: boolean;
};

export function toStoredEvidence(insight: Insight): Record<string, unknown> {
  return { ...insight.evidence, params: insight.params };
}

const isKind = (value: string): value is InsightKind =>
  (INSIGHT_KINDS as readonly string[]).includes(value);
const isTextKey = (value: string): value is (typeof TEXT_KEYS)[number] =>
  (TEXT_KEYS as readonly string[]).includes(value);

/** `null` for a row that does not match (never shown). */
export function parseInsightRow(row: InsightRow): StoredInsight | null {
  const evidence = evidenceSchema.safeParse(row.evidence);
  if (!evidence.success || !isKind(row.kind) || !isTextKey(row.text)) return null;
  return {
    id: row.id,
    kind: row.kind,
    textKey: row.text,
    params: evidence.data.params,
    days: evidence.data.days,
    value: evidence.data.value,
    createdAt: row.createdAt,
    seen: row.seenAt !== null,
  };
}

/** The insights created on logical days `[from, to]` (`yyyy-MM-dd`), in the order given. */
export function insightsBetweenDays(
  insights: readonly StoredInsight[],
  from: string,
  to: string,
): StoredInsight[] {
  return insights.filter((insight) => {
    const day = dayKeyFor(new Date(insight.createdAt));
    return day >= from && day <= to;
  });
}
