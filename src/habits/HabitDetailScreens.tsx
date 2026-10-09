// The Habits detail pages (`/habitos/*`): the full data behind each hub tile. They reuse the
// cards of the old Habits stack (`HabitCards.tsx`) and the "Tu ritmo" engines.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { getRepositories } from '../db';
import type { Companion } from '../domain/companion';
import { dayKeyFor } from '../domain/time';
import { LIMITS } from '../domain/onboarding/draft';
import { loadCompanion } from '../companion/loadCompanion';
import { jetlagLines, sleepDebtLines, waterLines } from '../companion/text';
import { useLocaleStore, useT } from '../i18n';
import { FALLBACK_GOALS, STEPS_STEP } from '../settings/schedule';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { LineChart } from '../ui/LineChart';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { NumberStepper } from '../ui/Stepper';
import { useTheme, type SectionKey } from '../ui/theme';
import {
  CheckCard,
  CheckinsCard,
  FoodCard,
  Muted,
  SectionTitle,
  StepsCard,
  WaterCard,
} from './HabitCards';
import type { HabitsView } from './habitsView';
import type { SleepDetail } from './sleepStats';
import { useHabits } from './useHabits';

type Habits = ReturnType<typeof useHabits>;
type Ready = { view: HabitsView; sleep: SleepDetail; habits: Habits };
type StoredGoals = { waterGlassesRest?: number; waterGlassesGym?: number; stepsGoal?: number };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/habitos');
}

/** Section header with back + the loading / error states of `useHabits`; `render` gets the data. */
function DetailScreen({
  section,
  title,
  render,
}: {
  section: SectionKey;
  /** A function gets the loaded view (e.g. the habit name), with `habits.title` while loading. */
  title: string | ((view: HabitsView) => string);
  render: (ready: Ready) => ReactNode;
}) {
  const theme = useTheme();
  const t = useT();
  const habits = useHabits();
  const { state, refresh } = habits;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const header = (
    <SectionHeader
      section={section}
      title={
        typeof title === 'string'
          ? title
          : state.status === 'ready'
            ? title(state.view)
            : t('habits.title')
      }
      showSettings={false}
      back={{ label: t('habits.hub.back'), onPress: goBack }}
    />
  );
  const edges = ['top', 'bottom', 'left', 'right'] as const;
  if (state.status === 'loading')
    return (
      <Screen header={header} edges={edges}>
        {null}
      </Screen>
    );
  if (state.status === 'error') {
    return (
      <Screen header={header} edges={edges}>
        <EmptyState
          title={t('habits.loadError')}
          body={t('database.errorBody')}
          action={{ label: t('habits.retry'), onPress: () => void refresh() }}
        />
      </Screen>
    );
  }
  return (
    <Screen scroll header={header} edges={edges}>
      <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>
        {render({ view: state.view, sleep: state.sleep, habits })}
      </View>
    </Screen>
  );
}

function NotFound() {
  const t = useT();
  return <EmptyState title={t('habits.detail.notFound')} body={t('database.errorBody')} />;
}

/** The "Tu ritmo" engines for today (water curve, sleep debt, jetlag); `null` while loading. */
function useCompanion(): Companion | null {
  const [companion, setCompanion] = useState<Companion | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadCompanion(getRepositories(), dayKeyFor(new Date()))
      .then((loaded) => {
        if (!cancelled) setCompanion(loaded);
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn('Could not compute the companion', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return companion;
}

/** Stored goals (settings `goals`), editable from the detail pages. */
function useGoals(save: (patch: StoredGoals) => Promise<void>) {
  const [goals, setGoals] = useState<StoredGoals | null>(null);
  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.get('goals')
      .then((stored) => {
        if (!cancelled) setGoals(stored ?? {});
      })
      .catch(() => {
        if (!cancelled) setGoals({});
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const update = (patch: StoredGoals) => {
    setGoals((current) => ({ ...current, ...patch }));
    void save(patch);
  };
  return [goals, update] as const;
}

function WaterCurveCard({ companion }: { companion: Companion | null }) {
  const theme = useTheme();
  const t = useT();
  if (!companion) return null;
  const lines = waterLines(companion.water, t);
  return (
    <Card>
      <View style={{ gap: theme.space[2] }}>
        <SectionTitle>{t('habits.detail.curveTitle')}</SectionTitle>
        {'missing' in lines || !companion.water ? (
          <Muted>{'missing' in lines ? lines.missing : ''}</Muted>
        ) : (
          <>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>{lines.headline}</Text>
            <LineChart
              points={companion.water.byHour.map((entry) => ({ x: entry.hour, y: entry.glasses }))}
              formatX={(hour) => t('companion.water.hourLabel', { hour })}
              formatY={(value) => String(value)}
              summary={lines.summary}
            />
            <Muted>{lines.basis}</Muted>
          </>
        )}
      </View>
    </Card>
  );
}

function WaterGoals({ habits }: { habits: Habits }) {
  const theme = useTheme();
  const t = useT();
  const [goals, update] = useGoals(habits.saveGoals);
  if (!goals) return null;
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <SectionTitle>{t('habits.detail.goalTitle')}</SectionTitle>
        <NumberStepper
          label={t('habits.detail.waterRest')}
          value={goals.waterGlassesRest ?? FALLBACK_GOALS.waterGlassesRest}
          step={1}
          min={1}
          max={30}
          format={(count) => t('habits.detail.glassesValue', { count })}
          onChange={(waterGlassesRest) => update({ waterGlassesRest })}
        />
        <NumberStepper
          label={t('habits.detail.waterGym')}
          value={goals.waterGlassesGym ?? FALLBACK_GOALS.waterGlassesGym}
          step={1}
          min={1}
          max={30}
          format={(count) => t('habits.detail.glassesValue', { count })}
          onChange={(waterGlassesGym) => update({ waterGlassesGym })}
        />
      </View>
    </Card>
  );
}

/** `/habitos/agua`: drops counter, the 10-day consistency, the water curve by hour, the goal. */
export function WaterDetailScreen() {
  const t = useT();
  const companion = useCompanion();
  return (
    <DetailScreen
      section="agua"
      title={t('habits.water.title')}
      render={({ view, habits }) =>
        view.water ? (
          <>
            <WaterCard
              water={view.water}
              onChange={(next) => void habits.setWater(view.water?.habitId ?? '', next)}
            />
            <WaterCurveCard companion={companion} />
            <WaterGoals habits={habits} />
          </>
        ) : (
          <NotFound />
        )
      }
    />
  );
}

function StepsGoal({ habits }: { habits: Habits }) {
  const theme = useTheme();
  const t = useT();
  const [goals, update] = useGoals(habits.saveGoals);
  if (!goals) return null;
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <SectionTitle>{t('habits.detail.goalTitle')}</SectionTitle>
        <NumberStepper
          label={t('habits.detail.stepsGoal')}
          value={goals.stepsGoal ?? FALLBACK_GOALS.stepsGoal}
          step={STEPS_STEP}
          min={STEPS_STEP}
          max={LIMITS.steps.max}
          format={(count) => t('habits.detail.stepsValue', { count })}
          onChange={(stepsGoal) => update({ stepsGoal })}
        />
      </View>
    </Card>
  );
}

/** `/habitos/pasos`: count, Health Connect status / manual input, baseline and goal, 10 days. */
export function StepsDetailScreen() {
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  return (
    <DetailScreen
      section="movimiento"
      title={t('habits.steps.title')}
      render={({ view, habits }) =>
        view.steps ? (
          <>
            <StepsCard
              steps={view.steps}
              feed={habits.feed}
              connecting={habits.connecting}
              onConnect={() => void habits.connect()}
              onOpenSettings={habits.openHealthSettings}
              onSave={(value) => void habits.saveSteps(value)}
            />
            {view.steps.plan.baseline !== null ? (
              <Muted>
                {t('habits.detail.baseline', {
                  steps: view.steps.plan.baseline.toLocaleString(language),
                })}
              </Muted>
            ) : null}
            <StepsGoal habits={habits} />
          </>
        ) : (
          <NotFound />
        )
      }
    />
  );
}

function SleepHistory({ sleep }: { sleep: SleepDetail }) {
  const theme = useTheme();
  const t = useT();
  return (
    <Card>
      <View style={{ gap: theme.space[2] }}>
        <SectionTitle>{t('habits.detail.historyTitle')}</SectionTitle>
        {sleep.nights.length === 0 ? <Muted>{t('habits.detail.historyEmpty')}</Muted> : null}
        {sleep.nights.map((night) => {
          const line = t('habits.detail.night', {
            bed: night.bed,
            wake: night.wake,
            hours: Math.floor(night.durationMin / 60),
            minutes: night.durationMin % 60,
          });
          const quality =
            night.quality !== null
              ? t('habits.detail.nightQuality', { quality: night.quality })
              : null;
          return (
            <View
              key={night.date}
              accessible
              accessibilityLabel={[night.date, line, quality].filter(Boolean).join(', ')}
              style={{ gap: theme.space[1], minHeight: theme.touch.gym, justifyContent: 'center' }}
            >
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                {night.date}
              </Text>
              <Muted>{quality ? `${line} · ${quality}` : line}</Muted>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function SleepRhythm({ companion }: { companion: Companion | null }) {
  const theme = useTheme();
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  if (!companion) return null;
  const debt = sleepDebtLines(companion.sleepDebt, t, language);
  const jetlag = jetlagLines(companion.jetlag, t);
  return (
    <>
      {[
        { key: 'debt', title: t('companion.sleepDebt.title'), lines: debt },
        { key: 'jetlag', title: t('companion.jetlag.title'), lines: jetlag },
      ].map(({ key, title, lines }) => (
        <Card key={key}>
          <View style={{ gap: theme.space[2] }}>
            <SectionTitle>{title}</SectionTitle>
            {'missing' in lines ? (
              <Muted>{lines.missing}</Muted>
            ) : (
              <>
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {lines.headline}
                </Text>
                <Muted>{lines.basis}</Muted>
              </>
            )}
          </View>
        </Card>
      ))}
    </>
  );
}

/** `/habitos/sueno`: average, check-in history, sleep debt, social jetlag, the cycles calculator. */
export function SleepDetailScreen() {
  const theme = useTheme();
  const t = useT();
  const companion = useCompanion();
  return (
    <DetailScreen
      section="sueno"
      title={t('habits.sleep.title')}
      render={({ view, sleep }) => (
        <>
          {sleep.summary ? (
            <Card>
              <View style={{ gap: theme.space[1] }}>
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {t('habits.sleep.summary', {
                    days: sleep.summary.days,
                    hours: Math.floor(sleep.summary.avgDurationMin / 60),
                    minutes: sleep.summary.avgDurationMin % 60,
                  })}
                </Text>
                {sleep.summary.wakeRegularityMin !== null ? (
                  <Muted>
                    {t('habits.sleep.regularity', { minutes: sleep.summary.wakeRegularityMin })}
                  </Muted>
                ) : null}
              </View>
            </Card>
          ) : null}
          <SleepHistory sleep={sleep} />
          <SleepRhythm companion={companion} />
          <CheckinsCard checkins={view.checkins} />
          <Button
            label={t('habits.detail.cycles')}
            variant="secondary"
            onPress={() => router.push('/ciclos-sueno')}
          />
        </>
      )}
    />
  );
}

/** `/habitos/[id]`: a check habit (mark done, how to, 10-day consistency). */
export function CheckDetailScreen({ habitId }: { habitId: string }) {
  const t = useT();
  return (
    <DetailScreen
      section="habitos"
      title={(view) =>
        view.checks.find((candidate) => candidate.habitId === habitId)?.name ?? t('habits.title')
      }
      render={({ view, habits }) => {
        const check = view.checks.find((candidate) => candidate.habitId === habitId);
        return check ? (
          <CheckCard check={check} onChange={(done) => void habits.setCheck(check.habitId, done)} />
        ) : (
          <NotFound />
        );
      }}
    />
  );
}

/** `/habitos/comida`: today's note and the recent ones. */
export function FoodDetailScreen() {
  const theme = useTheme();
  const t = useT();
  return (
    <DetailScreen
      section="habitos"
      title={t('habits.food.title')}
      render={({ view, habits }) =>
        view.food ? (
          <>
            <FoodCard food={view.food} onSave={(text) => void habits.saveFood(text)} />
            <Card>
              <View style={{ gap: theme.space[2] }}>
                <SectionTitle>{t('habits.detail.recentTitle')}</SectionTitle>
                {view.food.recent.length === 0 ? (
                  <Muted>{t('habits.detail.recentEmpty')}</Muted>
                ) : null}
                {view.food.recent.map((note) => (
                  <View key={note.date} accessible style={{ gap: theme.space[1] }}>
                    <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                      {note.date}
                    </Text>
                    <Text style={[theme.text('body'), { color: theme.color.text }]}>
                      {note.text}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </>
        ) : (
          <NotFound />
        )
      }
    />
  );
}
