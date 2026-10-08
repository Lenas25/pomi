import { useState } from 'react';
import { Text, View } from 'react-native';

import { useT } from '../i18n';
import { planForDays } from '../settings/schedule';
import type { GymPlan } from '../templates/schema';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TimeStepper } from '../ui/Stepper';
import { useTheme } from '../ui/theme';
import { WEEK_ORDER, WeekdayChips } from '../ui/WeekdayChips';

import type { WeekPlanStep } from './weekPlan';

const LONG_DAY = [
  'weekdays.long.d0',
  'weekdays.long.d1',
  'weekdays.long.d2',
  'weekdays.long.d3',
  'weekdays.long.d4',
  'weekdays.long.d5',
  'weekdays.long.d6',
] as const;

type Status = 'editing' | 'saving' | 'saved' | 'savedEmpty' | 'usual' | 'skipped' | 'failed';

type WeekPlanCardProps = {
  step: WeekPlanStep;
  /** `null` = "Igual que siempre" (no override for the week). */
  onSave: (plan: GymPlan | null) => Promise<void>;
};

/**
 * "Planifica tu semana": weekday chips and an approximate time per session, prefilled from the
 * week's override or the usual plan. Skippable; "Igual que siempre" keeps the usual plan.
 */
export function WeekPlanCard({ step, onSave }: WeekPlanCardProps) {
  const t = useT();
  const theme = useTheme();
  const [plan, setPlan] = useState<GymPlan>(step.override ?? step.usual);
  const [status, setStatus] = useState<Status>('editing');

  if (status === 'skipped') return null;

  const save = async (next: GymPlan | null) => {
    setStatus('saving');
    try {
      await onSave(next);
      setStatus(next === null ? 'usual' : next.length === 0 ? 'savedEmpty' : 'saved');
    } catch {
      setStatus('failed');
    }
  };

  const title = (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {t('review.weekPlan.title')}
    </Text>
  );

  if (status === 'saved' || status === 'savedEmpty' || status === 'usual') {
    const doneKey =
      status === 'saved'
        ? 'review.weekPlan.saved'
        : status === 'savedEmpty'
          ? 'review.weekPlan.savedEmpty'
          : 'review.weekPlan.usual';
    return (
      <Card>
        <View style={{ gap: theme.space[3] }}>
          {title}
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('body'), { color: theme.color.text }]}
          >
            {t(doneKey)}
          </Text>
          <Button
            label={t('review.weekPlan.edit')}
            variant="ghost"
            onPress={() => setStatus('editing')}
          />
        </View>
      </Card>
    );
  }

  const weekPosition = (weekday: number) =>
    WEEK_ORDER.indexOf(weekday as (typeof WEEK_ORDER)[number]);
  const ordered = plan
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => weekPosition(a.weekday) - weekPosition(b.weekday));
  const busy = status === 'saving';

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        {title}
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('review.weekPlan.hint')}
        </Text>
        <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
          {t('review.weekPlan.days')}
        </Text>
        <WeekdayChips
          selected={[...new Set(plan.map((entry) => entry.weekday))]}
          onChange={(days) => setPlan(planForDays(plan, days, step.anchors))}
          accessibilityLabel={t('review.weekPlan.days')}
        />
        {plan.length === 0 ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('caption'), { color: theme.color.textMuted }]}
          >
            {t('review.weekPlan.emptyHint')}
          </Text>
        ) : null}
        {ordered.map((entry) => (
          <TimeStepper
            key={`${entry.weekday}-${entry.index}`}
            label={t('review.weekPlan.time', { day: t(LONG_DAY[entry.weekday] ?? LONG_DAY[0]) })}
            value={entry.time}
            onChange={(time) =>
              setPlan(plan.map((item, index) => (index === entry.index ? { ...item, time } : item)))
            }
          />
        ))}
        {status === 'failed' ? (
          <Text
            accessibilityRole="alert"
            style={[theme.text('caption'), { color: theme.color.error }]}
          >
            {t('review.weekPlan.saveFailed')}
          </Text>
        ) : null}
        <Button label={t('review.weekPlan.save')} disabled={busy} onPress={() => void save(plan)} />
        <Button
          label={t('review.weekPlan.same')}
          variant="secondary"
          disabled={busy}
          onPress={() => {
            setPlan(step.usual);
            void save(null);
          }}
        />
        <Button
          label={t('review.weekPlan.skip')}
          variant="ghost"
          disabled={busy}
          onPress={() => setStatus('skipped')}
        />
      </View>
    </Card>
  );
}
