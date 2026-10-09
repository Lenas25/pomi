import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  CheckCircle,
  Drop,
  Footprints,
  ForkKnife,
  MoonStars,
  PersonSimpleWalk,
  Plus,
} from 'phosphor-react-native';

import { useLocaleStore, useT, type Translate } from '../i18n';
import { BentoGrid, type BentoItem } from '../ui/BentoGrid';
import { BentoTile } from '../ui/BentoTile';
import { BottomSheet } from '../ui/BottomSheet';
import { EmptyState } from '../ui/EmptyState';
import { MiniBar, MiniDots } from '../ui/MiniMeter';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { useTheme, type Theme } from '../ui/theme';
import { ActivityCard } from './ActivityCard';
import type { HabitsView } from './habitsView';
import type { SleepDetail } from './sleepStats';
import { useHabits } from './useHabits';

const ACTIVITY_KEYS = {
  gym: 'activity.gym',
  walk: 'activity.walk',
  none: 'activity.none',
} as const;

type TileContext = {
  t: Translate;
  theme: Theme;
  locale: string;
  addGlass: () => void;
  askActivity: () => void;
};

function waterTile(water: NonNullable<HabitsView['water']>, ctx: TileContext): BentoItem {
  const { t, theme } = ctx;
  const total = water.target?.glasses;
  return {
    key: 'agua',
    span: '2x1',
    node: (
      <BentoTile
        section="agua"
        icon={Drop}
        title={water.name}
        value={total === undefined ? String(water.value) : `${water.value}/${total}`}
        {...(total === undefined ? { caption: t('habits.hub.waterCaption') } : {})}
        visual={
          total === undefined ? undefined : (
            <MiniDots
              value={water.value}
              total={total}
              color={theme.section.agua.text}
              trackColor={theme.color.border}
            />
          )
        }
        accessibilityLabel={
          total === undefined
            ? t('habits.hub.waterLabelNoGoal', { count: water.value })
            : t('habits.hub.waterLabel', { done: water.value, total })
        }
        onPress={() => router.push('/habitos/agua')}
        action={{
          icon: Plus,
          accessibilityLabel: t('habits.water.add'),
          onPress: ctx.addGlass,
        }}
      />
    ),
  };
}

function stepsTile(steps: NonNullable<HabitsView['steps']>, ctx: TileContext): BentoItem {
  const { t, theme, locale } = ctx;
  const goal = steps.plan.goal;
  const count = steps.steps.toLocaleString(locale);
  return {
    key: 'pasos',
    span: '1x1',
    node: (
      <BentoTile
        section="movimiento"
        icon={Footprints}
        title={steps.name}
        value={count}
        caption={
          goal === null
            ? t('habits.hub.stepsMeasuring')
            : t('habits.hub.stepsGoal', { goal: goal.toLocaleString(locale) })
        }
        visual={
          goal === null ? undefined : (
            <MiniBar
              value={steps.steps}
              total={goal}
              color={theme.section.movimiento.text}
              trackColor={theme.color.border}
            />
          )
        }
        accessibilityLabel={
          goal === null
            ? t('habits.hub.stepsLabelNoGoal', { steps: count })
            : t('habits.hub.stepsLabel', { steps: count, goal: goal.toLocaleString(locale) })
        }
        onPress={() => router.push('/habitos/pasos')}
      />
    ),
  };
}

function sleepTile(sleep: SleepDetail, ctx: TileContext): BentoItem {
  const { t } = ctx;
  const last = sleep.nights[0];
  const value = last
    ? t('habits.hub.sleepValue', {
        hours: Math.floor(last.durationMin / 60),
        minutes: last.durationMin % 60,
      })
    : t('habits.hub.sleepNone');
  const caption = last
    ? last.quality !== null
      ? t('habits.hub.sleepQuality', { quality: last.quality })
      : t('habits.hub.sleepLastNight')
    : t('habits.hub.sleepNoneCaption');
  return {
    key: 'sueno',
    span: '1x1',
    node: (
      <BentoTile
        section="sueno"
        icon={MoonStars}
        title={t('habits.sleep.title')}
        value={value}
        caption={caption}
        accessibilityLabel={t('habits.hub.sleepLabel', {
          value,
          caption:
            last && last.quality !== null
              ? `${t('habits.hub.sleepLastNight')}, ${caption}`
              : caption,
        })}
        onPress={() => router.push('/habitos/sueno')}
      />
    ),
  };
}

function checkTile(check: HabitsView['checks'][number], ctx: TileContext): BentoItem {
  const { t } = ctx;
  const state = t(check.done ? 'habits.stateDone' : 'habits.statePending');
  return {
    key: `check-${check.habitId}`,
    span: '1x1',
    node: (
      <BentoTile
        section="habitos"
        variant={check.done ? 'hero' : 'tint'}
        icon={CheckCircle}
        title={check.name}
        value={t(check.done ? 'habits.done' : 'habits.statePending')}
        caption={t('habits.hub.consistencyShort', {
          done: check.consistency.done,
          total: check.consistency.total,
        })}
        accessibilityLabel={t('habits.hub.checkLabel', {
          name: check.name,
          state,
          done: check.consistency.done,
          total: check.consistency.total,
        })}
        onPress={() => router.push({ pathname: '/habitos/[id]', params: { id: check.habitId } })}
      />
    ),
  };
}

function foodTile(food: NonNullable<HabitsView['food']>, ctx: TileContext): BentoItem {
  const { t } = ctx;
  const state = t(food.note.trim() ? 'habits.hub.foodWritten' : 'habits.hub.foodEmpty');
  return {
    key: 'comida',
    span: '1x1',
    node: (
      <BentoTile
        section="habitos"
        icon={ForkKnife}
        title={t('habits.food.title')}
        value={state}
        caption={t('habits.hub.consistencyShort', {
          done: food.consistency.done,
          total: food.consistency.total,
        })}
        accessibilityLabel={t('habits.hub.foodLabel', { state })}
        onPress={() => router.push('/habitos/comida')}
      />
    ),
  };
}

function activityTile(answer: HabitsView['activityToday'], ctx: TileContext): BentoItem {
  const { t } = ctx;
  const state = answer ? t(ACTIVITY_KEYS[answer]) : t('habits.hub.activityPending');
  return {
    key: 'actividad',
    span: '1x1',
    node: (
      <BentoTile
        section="movimiento"
        icon={PersonSimpleWalk}
        title={t('habits.hub.activityTitle')}
        value={state}
        accessibilityLabel={t('habits.hub.activityLabel', { state })}
        onPress={ctx.askActivity}
      />
    ),
  };
}

/** Builds the hub tiles in reading order (pure over the view; exported for the tests). */
export function habitTiles(view: HabitsView, sleep: SleepDetail, ctx: TileContext): BentoItem[] {
  const tiles: BentoItem[] = [];
  if (view.water) tiles.push(waterTile(view.water, ctx));
  if (view.steps) tiles.push(stepsTile(view.steps, ctx));
  if (view.checkins.morning.enabled || sleep.nights.length > 0) tiles.push(sleepTile(sleep, ctx));
  for (const check of view.checks) tiles.push(checkTile(check, ctx));
  if (view.food) tiles.push(foodTile(view.food, ctx));
  tiles.push(activityTile(view.activityToday, ctx));
  return tiles;
}

/** Habits tab (PLAN §13): a bento hub; every tile opens its detail page under `/habitos/*`. */
export function HabitsScreen() {
  const theme = useTheme();
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  const habits = useHabits();
  const [asking, setAsking] = useState(false);
  const { state, refresh } = habits;

  // Coming back to the tab (or from a detail page) refreshes the numbers and the steps feed.
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
  const water = view.water;
  const tiles = habitTiles(view, sleep, {
    t,
    theme,
    locale: language,
    addGlass: () => {
      if (water) void habits.setWater(water.habitId, water.value + 1);
    },
    askActivity: () => setAsking(true),
  });

  return (
    <Screen
      header={
        <SectionHeader
          section="habitos"
          title={t('habits.title')}
          subtitle={t('habits.consistencyHint')}
        />
      }
    >
      <ScrollView contentContainerStyle={{ paddingVertical: theme.space[4] }}>
        <BentoGrid items={tiles} />
      </ScrollView>
      <BottomSheet
        visible={asking}
        onClose={() => setAsking(false)}
        title={t('activity.title')}
        closeLabel={t('habits.hub.close')}
      >
        <ActivityCard
          answer={view.activityToday}
          onAnswer={(kind) => void habits.answerActivity(kind)}
        />
      </BottomSheet>
    </Screen>
  );
}
