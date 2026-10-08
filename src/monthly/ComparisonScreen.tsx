import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { getRepositories } from '../db';
import { buildMonthlyComparison, hasComparison } from '../domain/progress/monthly';
import { dayKeyFor } from '../domain/time';
import { formatKg } from '../gym/sessionViewModel';
import { useLocaleStore, useT } from '../i18n';
import { StoredPhoto } from '../photos/StoredPhoto';
import { loadProgressData, type ProgressData } from '../progress/loadProgress';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { formatSigned } from './format';

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ProgressData };

const poseName = (pose: string) => pose.charAt(0).toUpperCase() + pose.slice(1);
const shortDate = (date: string) => format(parseISO(date), 'd/M');

/**
 * "Tú hace 30 días vs. hoy" (PLAN §10): strength, measurements, photos side by side, consistency
 * and the findings of the month. Descriptive only: numbers, dates and photos, no judgments.
 */
export function ComparisonScreen() {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [today] = useState(() => dayKeyFor(new Date()));

  useEffect(() => {
    let cancelled = false;
    loadProgressData(getRepositories(), today).then(
      (data) => {
        if (!cancelled) setLoad({ status: 'ready', data });
      },
      (failure: unknown) => {
        if (__DEV__) console.error('Could not load the comparison', failure);
        if (!cancelled) setLoad({ status: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [today]);

  const comparison = useMemo(() => {
    if (load.status !== 'ready') return null;
    const { data } = load;
    return buildMonthlyComparison({
      today,
      startedOn: data.startedOn,
      sessions: data.sessions,
      habitDates: data.habitDates,
      metrics: data.metrics,
      photos: data.photos,
      poses: data.poses,
    });
  }, [load, today]);

  const kg = (value: number) => formatKg(value, language);
  const edges = ['top', 'bottom', 'left', 'right'] as const;
  const section = (title: string) => (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {title}
    </Text>
  );
  const line = (text: string, key: string) => (
    <Text key={key} style={[theme.text('body'), { color: theme.color.text }]}>
      {text}
    </Text>
  );
  const note = (text: string) => (
    <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{text}</Text>
  );

  if (load.status === 'loading') return <Screen edges={edges}>{null}</Screen>;
  if (load.status === 'error' || !comparison) {
    return (
      <Screen edges={edges}>
        <EmptyState
          title={t('comparison.loadFailed')}
          body=""
          action={{ label: t('comparison.close'), onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const { data } = load;
  const names = data.exerciseNames;
  const { consistency } = comparison;

  if (!hasComparison(comparison)) {
    return (
      <Screen edges={edges}>
        <EmptyState
          pose="mide"
          title={t('comparison.emptyTitle')}
          body={t('comparison.emptyBody')}
          action={{
            label: t('comparison.startReview'),
            onPress: () => router.replace('/revision-mensual'),
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={edges}>
      <View style={{ gap: theme.space[5], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('comparison.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('comparison.intro')}
        </Text>
        {note(
          t('comparison.dates', { from: shortDate(comparison.thenDate), to: shortDate(today) }),
        )}

        {comparison.strength.length > 0 ? (
          <Card>
            <View style={{ gap: theme.space[2] }}>
              {section(t('comparison.strengthTitle'))}
              {comparison.strength.map((pair) =>
                line(
                  t('comparison.strengthLine', {
                    name: names[pair.stepId] ?? pair.stepId,
                    from: kg(pair.from.value),
                    to: kg(pair.to.value),
                    change: formatSigned(pair.change, language),
                  }),
                  pair.stepId,
                ),
              )}
              {note(t('comparison.strengthNote'))}
            </View>
          </Card>
        ) : null}

        {comparison.measurements.length > 0 ? (
          <Card>
            <View style={{ gap: theme.space[2] }}>
              {section(t('comparison.measurementsTitle'))}
              {comparison.measurements.map((pair) =>
                line(
                  t('comparison.measurementLine', {
                    name: pair.name,
                    from: kg(pair.from.value),
                    to: kg(pair.to.value),
                    unit: pair.unit,
                    change: formatSigned(pair.change, language),
                  }),
                  pair.metricId,
                ),
              )}
            </View>
          </Card>
        ) : null}

        {comparison.photos.length > 0 ? (
          <Card>
            <View style={{ gap: theme.space[4] }}>
              {section(t('comparison.photosTitle'))}
              {comparison.photos.map((pair) => (
                <View key={pair.pose} style={{ gap: theme.space[2] }}>
                  {pair.then && pair.now ? (
                    <View style={{ flexDirection: 'row', gap: theme.space[3] }}>
                      {[
                        {
                          photo: pair.then,
                          when: t('comparison.then', { date: shortDate(pair.then.date) }),
                        },
                        {
                          photo: pair.now,
                          when: t('comparison.now', { date: shortDate(pair.now.date) }),
                        },
                      ].map(({ photo, when }) => (
                        <View key={photo.id} style={{ flex: 1, gap: theme.space[1] }}>
                          <StoredPhoto
                            name={photo.uri}
                            label={t('comparison.poseLabel', { pose: poseName(pair.pose), when })}
                          />
                          {note(when)}
                        </View>
                      ))}
                    </View>
                  ) : (
                    line(
                      pair.now
                        ? t('comparison.onlyNow', { pose: poseName(pair.pose) })
                        : t('comparison.onlyThen', { pose: poseName(pair.pose) }),
                      `${pair.pose}-single`,
                    )
                  )}
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={{ gap: theme.space[2] }}>
            {section(t('comparison.consistencyTitle'))}
            {line(
              t('comparison.consistencyNow', {
                sessions: consistency.now.sessions,
                days: consistency.now.habitDays,
              }),
              'now',
            )}
            {consistency.before
              ? line(
                  t('comparison.consistencyBefore', {
                    sessions: consistency.before.sessions,
                    days: consistency.before.habitDays,
                  }),
                  'before',
                )
              : null}
          </View>
        </Card>

        <Card>
          <View style={{ gap: theme.space[2] }}>
            {section(t('comparison.insightsTitle'))}
            {note(t('comparison.insightsEmpty'))}
          </View>
        </Card>

        <Button label={t('comparison.close')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
