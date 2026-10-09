// The sections of Progreso, shared by its detail pages (`/progreso/*`): consistency, strength,
// measurements and findings.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';

import { useLocaleStore, useT } from '../i18n';
import { formatKg } from '../gym/sessionViewModel';
import { InsightsList } from '../insights/InsightsList';
import type { StoredInsight } from '../insights/payload';
import { BarChart } from '../ui/BarChart';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { EmptyState } from '../ui/EmptyState';
import { LineChart } from '../ui/LineChart';
import { useTheme } from '../ui/theme';

import { MeasurementCard } from './MeasurementCard';
import { dayLabel, dayNumber, type ProgressView, type StrengthView } from './progressView';

export const weekLabel = (weekStart: string) => format(parseISO(weekStart), 'd/M');

export function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {children}
    </Text>
  );
}

/** A group of cards: one column on a phone, two on a tablet (HANDOFF §2). */
export function Grid({ twoColumns, children }: { twoColumns: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[3] }}>
      {Array.isArray(children) ? (
        children.map((child: ReactNode, index) => (
          <View key={index} style={{ flexGrow: 1, flexBasis: twoColumns ? '45%' : '100%' }}>
            {child}
          </View>
        ))
      ) : (
        <View style={{ flexGrow: 1, flexBasis: '100%' }}>{children}</View>
      )}
    </View>
  );
}

export function ConsistencySection({
  weekly,
  twoColumns,
}: {
  weekly: ProgressView['weekly'];
  twoColumns: boolean;
}) {
  const t = useT();
  const theme = useTheme();
  const { buckets, planned } = weekly;
  const current = buckets.find((bucket) => bucket.isCurrent);

  const sessionList = buckets
    .map((bucket) =>
      planned > 0
        ? t('progress.consistency.bucketPlanned', {
            date: weekLabel(bucket.weekStart),
            done: bucket.sessionsDone,
            planned,
          })
        : t('progress.consistency.bucket', {
            date: weekLabel(bucket.weekStart),
            done: bucket.sessionsDone,
          }),
    )
    .join('; ');
  const habitList = buckets
    .map((bucket) =>
      t('progress.consistency.habitBucket', {
        date: weekLabel(bucket.weekStart),
        days: bucket.habitDays,
      }),
    )
    .join('; ');

  return (
    <View style={{ gap: theme.space[3] }}>
      <SectionTitle>{t('progress.consistency.title')}</SectionTitle>
      {weekly.hasData ? (
        <Grid twoColumns={twoColumns}>
          {[
            <Card key="sessions">
              <View style={{ gap: theme.space[2] }}>
                <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                  {t('progress.consistency.sessionsTitle')}
                </Text>
                {current ? (
                  <Text style={[theme.text('body'), { color: theme.color.text }]}>
                    {planned > 0
                      ? t('progress.consistency.thisWeek', {
                          done: current.sessionsDone,
                          planned,
                        })
                      : t('progress.consistency.thisWeekNoPlan', { done: current.sessionsDone })}
                  </Text>
                ) : null}
                <BarChart
                  bars={buckets.map((bucket) => ({
                    key: bucket.weekStart,
                    label: weekLabel(bucket.weekStart),
                    value: bucket.sessionsDone,
                    ...(planned > 0 ? { target: planned } : {}),
                    current: bucket.isCurrent,
                  }))}
                  formatY={String}
                  summary={t('progress.consistency.summarySessions', { list: sessionList })}
                />
                {planned > 0 ? (
                  <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                    {t('progress.consistency.note')}
                  </Text>
                ) : null}
              </View>
            </Card>,
            <Card key="habits">
              <View style={{ gap: theme.space[2] }}>
                <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                  {t('progress.consistency.habitsTitle')}
                </Text>
                <BarChart
                  bars={buckets.map((bucket) => ({
                    key: bucket.weekStart,
                    label: weekLabel(bucket.weekStart),
                    value: bucket.habitDays,
                    current: bucket.isCurrent,
                  }))}
                  formatY={String}
                  summary={t('progress.consistency.summaryHabits', { list: habitList })}
                />
              </View>
            </Card>,
          ]}
        </Grid>
      ) : (
        <Card>
          <EmptyState
            compact
            title={t('progress.consistency.emptyTitle')}
            body={t('progress.consistency.emptyBody')}
          />
        </Card>
      )}
    </View>
  );
}

export function StrengthSection({
  strength,
  selectedId,
  onSelect,
}: {
  strength: StrengthView;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const kg = (value: number) => formatKg(value, language);
  const selected = strength.exercises.find((exercise) => exercise.id === strength.selectedId);

  let summary = '';
  const last = strength.points.at(-1);
  if (selected && strength.summary) {
    const { from, to, spanDays } = strength.summary;
    const params = { name: selected.name, from: kg(from), to: kg(to) };
    summary =
      spanDays >= 14
        ? t('progress.strength.summaryWeeks', { ...params, weeks: Math.round(spanDays / 7) })
        : spanDays === 1
          ? t('progress.strength.summaryDay', params)
          : t('progress.strength.summaryDays', { ...params, days: spanDays });
  } else if (selected && last) {
    summary = t('progress.strength.summaryOne', { name: selected.name, value: kg(last.e1rm) });
  }

  return (
    <View style={{ gap: theme.space[3] }}>
      <SectionTitle>{t('progress.strength.title')}</SectionTitle>
      {selected ? (
        <Card>
          <View style={{ gap: theme.space[3] }}>
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {t('progress.strength.choose')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
              {strength.exercises.map((exercise) => (
                <Chip
                  key={exercise.id}
                  label={exercise.name}
                  selected={
                    exercise.id === selectedId ||
                    (selectedId === undefined && exercise.id === selected.id)
                  }
                  onPress={() => onSelect(exercise.id)}
                />
              ))}
            </View>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>{summary}</Text>
            <LineChart
              points={strength.points.map((point) => ({
                x: dayNumber(point.date),
                y: point.e1rm,
              }))}
              formatX={dayLabel}
              formatY={kg}
              summary={summary}
            />
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {strength.points.length < 2
                ? `${t('progress.strength.oneMore')} ${t('progress.strength.note')}`
                : `${t('progress.strength.axis')}. ${t('progress.strength.note')}`}
            </Text>
          </View>
        </Card>
      ) : (
        <Card>
          <EmptyState
            compact
            title={t('progress.strength.emptyTitle')}
            body={t('progress.strength.emptyBody')}
          />
        </Card>
      )}
    </View>
  );
}

/** "Lo que descubrimos de ti" (PLAN §12): every finding so far, newest first. */
export function InsightsSection({ insights }: { insights: readonly StoredInsight[] | undefined }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={{ gap: theme.space[3] }}>
      <SectionTitle>{t('progress.insights.title')}</SectionTitle>
      {insights && insights.length > 0 ? (
        <InsightsList insights={insights} />
      ) : (
        <Card>
          <EmptyState
            compact
            pose="curioso"
            title={t('progress.insights.emptyTitle')}
            body={t('progress.insights.emptyBody')}
          />
        </Card>
      )}
    </View>
  );
}

/** Measurements with their charts and today's entry form. */
export function MeasurementsSection({
  measurements,
  twoColumns,
  onSave,
}: {
  measurements: ProgressView['measurements'];
  twoColumns: boolean;
  onSave: (metricId: string, value: number) => Promise<void>;
}) {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[3] }}>
      <SectionTitle>{t('progress.measurements.title')}</SectionTitle>
      {measurements.length > 0 ? (
        <Grid twoColumns={twoColumns}>
          {measurements.map((metric) => (
            <MeasurementCard key={metric.id} metric={metric} onSave={onSave} />
          ))}
        </Grid>
      ) : (
        <Card>
          <EmptyState
            compact
            title={t('progress.measurements.emptyTitle')}
            body={t('progress.measurements.emptyBody')}
          />
        </Card>
      )}
    </View>
  );
}
