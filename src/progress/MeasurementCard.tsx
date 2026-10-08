import { useState } from 'react';
import { Text, View } from 'react-native';
import { format, parseISO } from 'date-fns';

import { parseMetricInput } from '../domain/progress/metrics';
import { useLocaleStore, useT } from '../i18n';
import { formatKg } from '../gym/sessionViewModel';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LineChart } from '../ui/LineChart';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import { dayLabel, dayNumber, type MeasurementView } from './progressView';

type MeasurementCardProps = {
  metric: MeasurementView;
  onSave: (metricId: string, value: number) => Promise<void>;
};

/** One measurement: latest value, a chart from two entries on, and the entry form. */
export function MeasurementCard({ metric, onSave }: MeasurementCardProps) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<'saved' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);

  const number = (value: number) => formatKg(value, language);
  const muted = [theme.text('caption'), { color: theme.color.textMuted }];

  const submit = async () => {
    setNotice(null);
    const parsed = parseMetricInput(text, metric.unit);
    if (!parsed.ok) {
      setError(
        parsed.reason === 'outOfRange'
          ? t('progress.measurements.outOfRange')
          : t('progress.measurements.invalid'),
      );
      return;
    }
    setError(undefined);
    setSaving(true);
    try {
      await onSave(metric.id, parsed.value);
      setText('');
      setNotice('saved');
    } catch (failure) {
      if (__DEV__) console.error('Could not save the measurement', failure);
      setNotice('failed');
    } finally {
      setSaving(false);
    }
  };

  const dueKey = {
    daily: 'progress.measurements.dueDaily',
    weekly: 'progress.measurements.dueWeekly',
    monthly: 'progress.measurements.dueMonthly',
  } as const;

  const summary = metric.summary
    ? t('progress.measurements.summary', {
        name: metric.name,
        from: number(metric.summary.from),
        to: number(metric.summary.to),
        unit: metric.unit,
      })
    : metric.latest
      ? t('progress.measurements.summaryOne', {
          name: metric.name,
          value: number(metric.latest.value),
          unit: metric.unit,
        })
      : '';

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {metric.name}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.text }]}>
          {metric.latest
            ? t('progress.measurements.latest', {
                value: number(metric.latest.value),
                unit: metric.unit,
                date: format(parseISO(metric.latest.date), 'd/M'),
              })
            : t('progress.measurements.none')}
        </Text>
        {metric.points.length >= 1 ? (
          <LineChart
            points={metric.points.map((point) => ({ x: dayNumber(point.date), y: point.value }))}
            formatX={dayLabel}
            formatY={number}
            summary={summary}
          />
        ) : null}
        <Text style={muted}>
          {metric.due ? t(dueKey[metric.frequency]) : t('progress.measurements.upToDate')}
        </Text>
        <TextField
          label={t('progress.measurements.input', { unit: metric.unit })}
          value={text}
          onChangeText={setText}
          inputMode="decimal"
          maxLength={7}
          error={error}
          onSubmitEditing={() => void submit()}
        />
        <Button
          label={t('progress.measurements.save')}
          variant="secondary"
          onPress={() => void submit()}
          loading={saving}
        />
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              theme.text('caption'),
              { color: notice === 'saved' ? theme.color.success : theme.color.error },
            ]}
          >
            {notice === 'saved'
              ? t('progress.measurements.saved')
              : t('progress.measurements.saveFailed')}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
