import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Moon, Sun } from 'phosphor-react-native';

import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Consistency } from '../ui/Consistency';
import { EmptyState } from '../ui/EmptyState';
import { HabitCounter } from '../ui/HabitCounter';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';
import { ActivityCard } from './ActivityCard';
import { nextWaterValue, type HabitsView } from './habitsView';
import { useHabits, type StepsFeed } from './useHabits';
import type { SleepSummary } from '../domain/formulas/sleep';
import type { Consistency as ConsistencyData } from '../domain/habits/consistency';

const MAX_MANUAL_STEPS = 100_000;

function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {children}
    </Text>
  );
}

function Muted({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{children}</Text>;
}

function ConsistencyLine({ name, data }: { name: string; data: ConsistencyData | null }) {
  const t = useT();
  if (!data) return null;
  return (
    <Consistency
      done={data.done}
      total={data.total}
      days={data.days.map((day) => day.done)}
      label={t('habits.consistencyLabel', { name, done: data.done, total: data.total })}
    />
  );
}

function WaterCard({
  water,
  onChange,
}: {
  water: NonNullable<HabitsView['water']>;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { target, value } = water;
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <SectionTitle>{water.name}</SectionTitle>
        {target ? (
          <>
            <HabitCounter
              variant="water"
              value={value}
              target={target.glasses}
              onChange={(next) => onChange(nextWaterValue(value, next))}
            />
            <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
              {t('habits.water.progress', { count: value, total: target.glasses })}
            </Text>
            <Muted>{t('habits.water.goalMl', { ml: target.ml })}</Muted>
            {target.gymDay ? <Muted>{t('habits.water.gymDay')}</Muted> : null}
            <Muted>{t('habits.water.guide')}</Muted>
          </>
        ) : (
          <>
            <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
              {t('habits.water.progressNoGoal', { count: value })}
            </Text>
            <HabitCounter
              variant="generic"
              label={water.name}
              value={value}
              onIncrement={() => onChange(value + 1)}
              onDecrement={() => onChange(Math.max(0, value - 1))}
            />
            <Muted>{t('habits.water.noGoal')}</Muted>
          </>
        )}
        <ConsistencyLine name={water.name} data={water.consistency} />
      </View>
    </Card>
  );
}

function stepsNotice(
  feed: StepsFeed,
):
  | 'habits.steps.connectNotice'
  | 'habits.steps.denied'
  | 'habits.steps.unavailable'
  | 'habits.steps.updateRequired'
  | 'habits.steps.syncError'
  | null {
  switch (feed) {
    case 'denied':
      return 'habits.steps.connectNotice';
    case 'unavailable':
      return 'habits.steps.unavailable';
    case 'update_required':
      return 'habits.steps.updateRequired';
    case 'error':
      return 'habits.steps.syncError';
    default:
      return null;
  }
}

function StepsCard({
  steps,
  feed,
  connecting,
  onConnect,
  onOpenSettings,
  onSave,
}: {
  steps: NonNullable<HabitsView['steps']>;
  feed: StepsFeed;
  connecting: boolean;
  onConnect: () => void;
  onOpenSettings: () => void;
  onSave: (value: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const { plan } = steps;
  // The manual input is always there: a typed number is kept when it beats the automatic count.
  const connected = feed === 'connected';
  const notice = stepsNotice(feed);

  const save = () => {
    const normalized = text.trim().replace(/[.,\s]/g, '');
    const value = /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
    if (!Number.isInteger(value) || value > MAX_MANUAL_STEPS) {
      setInvalid(true);
      setSaved(false);
      return;
    }
    setInvalid(false);
    setSaved(true);
    setText('');
    onSave(value);
  };

  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <SectionTitle>{steps.name}</SectionTitle>
        <HabitCounter variant="steps" value={steps.steps} target={plan.goal} locale={language} />
        {plan.phase === 'baseline' ? (
          <Muted>
            {plan.baselineDaysLeft === 1
              ? t('habits.steps.measuringOne')
              : t('habits.steps.measuring', { days: plan.baselineDaysLeft })}
          </Muted>
        ) : null}
        {plan.goal === null ? <Muted>{t('habits.steps.noGoal')}</Muted> : null}
        {steps.source === 'health_connect' ? <Muted>{t('habits.steps.fromHealth')}</Muted> : null}

        {notice ? <Muted>{t(notice)}</Muted> : null}
        {feed === 'denied' || feed === 'unknown' || feed === 'error' ? (
          <Button
            label={t('habits.steps.connect')}
            onPress={onConnect}
            variant="secondary"
            loading={connecting}
          />
        ) : null}
        {feed === 'denied' ? (
          <Button label={t('habits.steps.deniedOpen')} onPress={onOpenSettings} variant="ghost" />
        ) : null}

        <View style={{ gap: theme.space[2] }}>
          <TextField
            label={t('habits.steps.manualLabel')}
            placeholder={t('habits.steps.manualHint')}
            value={text}
            onChangeText={(value) => {
              setText(value);
              setSaved(false);
            }}
            inputMode="numeric"
            maxLength={6}
            onSubmitEditing={save}
            error={invalid ? t('habits.steps.invalid', { max: MAX_MANUAL_STEPS }) : undefined}
          />
          {connected ? <Muted>{t('habits.steps.manualKeepsMax')}</Muted> : null}
          <Button label={t('habits.steps.save')} onPress={save} variant="secondary" />
          {saved ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[theme.text('caption'), { color: theme.color.success }]}
            >
              {t('habits.steps.saved')}
            </Text>
          ) : null}
        </View>
        <ConsistencyLine name={steps.name} data={steps.consistency} />
      </View>
    </Card>
  );
}

function CheckCard({
  check,
  onChange,
}: {
  check: HabitsView['checks'][number];
  onChange: (done: boolean) => void;
}) {
  const theme = useTheme();
  const t = useT();
  return (
    <Card>
      <View style={{ gap: theme.space[2] }}>
        <SectionTitle>{check.name}</SectionTitle>
        {check.how ? (
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>{check.how}</Text>
        ) : null}
        <View style={{ flexDirection: 'row' }}>
          <Chip
            label={t(check.done ? 'habits.done' : 'habits.markDone')}
            accessibilityLabel={t('habits.checkLabel', {
              name: check.name,
              state: t(check.done ? 'habits.stateDone' : 'habits.statePending'),
            })}
            selected={check.done}
            onPress={() => onChange(!check.done)}
          />
        </View>
        <ConsistencyLine name={check.name} data={check.consistency} />
      </View>
    </Card>
  );
}

function FoodCard({
  food,
  onSave,
}: {
  food: NonNullable<HabitsView['food']>;
  onSave: (text: string) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const [text, setText] = useState<string | undefined>(undefined);
  const value = text ?? food.note;
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <SectionTitle>{t('habits.food.title')}</SectionTitle>
        <TextField label={food.prompt} value={value} onChangeText={setText} />
        <Button
          label={t('habits.food.save')}
          onPress={() => {
            onSave(value);
            setText(undefined);
          }}
          variant="secondary"
          disabled={text === undefined}
        />
        <ConsistencyLine name={t('habits.food.title')} data={food.consistency} />
      </View>
    </Card>
  );
}

function CheckinsCard({ checkins }: { checkins: HabitsView['checkins'] }) {
  const theme = useTheme();
  const t = useT();
  const rows = [
    { kind: 'morning', icon: Sun, label: t('habits.checkins.morning'), ...checkins.morning },
    { kind: 'night', icon: Moon, label: t('habits.checkins.night'), ...checkins.night },
  ] as const;
  const enabled = rows.filter((row) => row.enabled);
  if (enabled.length === 0) return null;
  return (
    <View style={{ gap: theme.space[3] }}>
      <SectionTitle>{t('habits.checkins.title')}</SectionTitle>
      {enabled.map((row) => (
        <Card
          key={row.kind}
          onPress={() => router.push({ pathname: '/checkin/[tipo]', params: { tipo: row.kind } })}
          accessibilityLabel={`${t('habits.checkins.open', { name: row.label })}${
            row.done ? `. ${t('habits.checkins.doneToday')}` : ''
          }`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <row.icon color={theme.color.text} />
            <Text style={[theme.text('body-strong'), { color: theme.color.text, flex: 1 }]}>
              {row.label}
            </Text>
            {row.done ? (
              <Text style={[theme.text('caption'), { color: theme.color.success }]}>
                {t('habits.checkins.doneToday')}
              </Text>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

function SleepLine({ sleep }: { sleep: SleepSummary }) {
  const theme = useTheme();
  const t = useT();
  return (
    <Card>
      <View style={{ gap: theme.space[1] }}>
        <SectionTitle>{t('habits.sleep.title')}</SectionTitle>
        <Text style={[theme.text('body'), { color: theme.color.text }]}>
          {t('habits.sleep.summary', {
            days: sleep.days,
            hours: Math.floor(sleep.avgDurationMin / 60),
            minutes: sleep.avgDurationMin % 60,
          })}
        </Text>
        {sleep.wakeRegularityMin !== null ? (
          <Muted>{t('habits.sleep.regularity', { minutes: sleep.wakeRegularityMin })}</Muted>
        ) : null}
      </View>
    </Card>
  );
}

/** Habits tab (PLAN §13): water, steps, active break, walk after eating, food notes, check-ins. */
export function HabitsScreen() {
  const theme = useTheme();
  const t = useT();
  const habits = useHabits();
  const { state, refresh } = habits;

  // Coming back to the tab (or from a check-in) refreshes the numbers and the steps feed.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (state.status === 'loading') return <Screen>{null}</Screen>;
  if (state.status === 'error') {
    return (
      <Screen>
        <EmptyState
          title={t('habits.loadError')}
          body={t('database.errorBody')}
          action={{ label: t('habits.retry'), onPress: () => void refresh() }}
        />
      </Screen>
    );
  }

  const { view, sleep } = state;
  return (
    <Screen scroll>
      <View style={{ gap: theme.space[5], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('habits.title')}
        </Text>

        <ActivityCard
          answer={view.activityToday}
          onAnswer={(kind) => void habits.answerActivity(kind)}
        />

        {view.water ? (
          <WaterCard
            water={view.water}
            onChange={(next) => void habits.setWater(view.water?.habitId ?? '', next)}
          />
        ) : null}
        {view.steps ? (
          <StepsCard
            steps={view.steps}
            feed={habits.feed}
            connecting={habits.connecting}
            onConnect={() => void habits.connect()}
            onOpenSettings={habits.openHealthSettings}
            onSave={(value) => void habits.saveSteps(value)}
          />
        ) : null}
        {view.checks.map((check) => (
          <CheckCard
            key={check.habitId}
            check={check}
            onChange={(done) => void habits.setCheck(check.habitId, done)}
          />
        ))}
        {view.food ? (
          <FoodCard food={view.food} onSave={(text) => void habits.saveFood(text)} />
        ) : null}
        <CheckinsCard checkins={view.checkins} />
        {sleep ? <SleepLine sleep={sleep} /> : null}
      </View>
    </Screen>
  );
}
