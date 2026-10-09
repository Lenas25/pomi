import { useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  Barbell,
  CalendarCheck,
  Camera,
  ChartBar,
  ChatCircleDots,
  Lightbulb,
  MoonStars,
  Ruler,
  ShareNetwork,
} from 'phosphor-react-native';

import { useAiStatus } from '../ai/useAiStatus';
import { useLocaleStore, useT, type Translate } from '../i18n';
import { formatKg } from '../gym/sessionViewModel';
import { insightTexts } from '../insights/text';
import { StoredPhoto } from '../photos/StoredPhoto';
import { BentoGrid, type BentoItem } from '../ui/BentoGrid';
import { BentoTile } from '../ui/BentoTile';
import { EmptyState } from '../ui/EmptyState';
import { MiniBars } from '../ui/MiniMeter';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { Skeleton } from '../ui/Skeleton';
import { useDelayedFlag } from '../ui/useDelayedFlag';
import { useTheme, type Theme } from '../ui/theme';

import type { ProgressData } from './loadProgress';
import { buildProgressView, type ProgressView } from './progressView';
import { useProgress } from './useProgress';
import { hiddenScrollIndicators } from '../ui/scroll';

type TileContext = {
  t: Translate;
  theme: Theme;
  language: 'es' | 'en';
  /** "Pregúntale a Pomi" only when an AI is connected and ready. */
  aiReady: boolean;
};

/** The measurement the tile shows: the weight when it has entries, else the first with one. */
function shownMeasurement(view: ProgressView) {
  const withEntry = view.measurements.filter((metric) => metric.latest !== undefined);
  return withEntry.find((metric) => metric.unit === 'kg') ?? withEntry[0];
}

function rhythmSummary(data: ProgressData, t: Translate): { value: string; caption: string } {
  const companion = data.companion;
  if (!companion) {
    return { value: t('progress.hub.strengthNone'), caption: t('progress.hub.rhythmDebtCaption') };
  }
  const debt = companion.sleepDebt;
  if (debt) {
    return {
      value:
        debt.debtMin > 0
          ? t('progress.hub.rhythmDebt', {
              hours: Math.floor(debt.debtMin / 60),
              minutes: debt.debtMin % 60,
            })
          : t('progress.hub.rhythmNoDebt'),
      caption: t('progress.hub.rhythmDebtCaption'),
    };
  }
  const { rhythm } = companion;
  return {
    value: t('progress.hub.rhythmLearning', {
      days: Math.min(rhythm.daysWithData, rhythm.needed),
      needed: rhythm.needed,
    }),
    caption: t('progress.hub.rhythmLearningCaption'),
  };
}

/** Builds the hub tiles in reading order (pure over the data; exported for the tests). */
export function progressTiles(data: ProgressData, ctx: TileContext): BentoItem[] {
  const { t, theme, language } = ctx;
  const colors = theme.section.progreso;
  const view = buildProgressView(data);
  const kg = (value: number) => formatKg(value, language);

  // Constancia: this week's sessions + the weekly bars.
  const { buckets, planned } = view.weekly;
  const thisWeek = buckets.find((bucket) => bucket.isCurrent)?.sessionsDone ?? 0;

  // Fuerza: the first exercise with history, its latest e1RM and the change since the first point.
  const strength = view.strength;
  const lift = strength.exercises.find((exercise) => exercise.id === strength.selectedId);
  const lastPoint = strength.points.at(-1);
  const delta = strength.summary ? strength.summary.to - strength.summary.from : null;
  const deltaText = delta === null ? null : `${delta >= 0 ? '+' : '−'}${kg(Math.abs(delta))}`;

  const metric = shownMeasurement(view);
  const metricValue = metric?.latest
    ? t('progress.hub.measurementsValue', { value: kg(metric.latest.value), unit: metric.unit })
    : null;

  const photo = data.photos[0];
  const rhythm = rhythmSummary(data, t);
  const insight = data.insights?.[0];
  const insightText = insight ? insightTexts(insight, t, language).text : null;
  const monthlyState = t(
    data.monthlyDone ? 'progress.hub.monthlyDone' : 'progress.hub.monthlyPending',
  );

  const tiles: BentoItem[] = [
    {
      key: 'constancia',
      span: '2x1',
      node: (
        <BentoTile
          section="progreso"
          variant="hero"
          icon={ChartBar}
          title={t('progress.hub.consistencyTitle')}
          value={planned > 0 ? `${thisWeek}/${planned}` : String(thisWeek)}
          caption={t('progress.hub.consistencyCaption')}
          visual={
            buckets.length > 0 ? (
              <MiniBars
                values={buckets.map((bucket) => bucket.sessionsDone)}
                color={colors.onFill}
                trackColor={colors.soft}
              />
            ) : undefined
          }
          accessibilityLabel={
            planned > 0
              ? t('progress.hub.consistencyLabel', { done: thisWeek, planned })
              : t('progress.hub.consistencyLabelNoPlan', { done: thisWeek })
          }
          onPress={() => router.push('/progreso/constancia')}
        />
      ),
    },
    {
      key: 'fuerza',
      span: '1x1',
      node: (
        <BentoTile
          section="progreso"
          icon={Barbell}
          title={t('progress.hub.strengthTitle')}
          value={
            lastPoint
              ? t('progress.hub.strengthValue', { kg: kg(lastPoint.e1rm) })
              : t('progress.hub.strengthNone')
          }
          {...(lift
            ? {
                caption: deltaText
                  ? t('progress.hub.strengthCaption', { name: lift.name, delta: deltaText })
                  : t('progress.hub.strengthCaptionOne', { name: lift.name }),
              }
            : {})}
          accessibilityLabel={
            lift && lastPoint
              ? t('progress.hub.strengthLabel', { name: lift.name, kg: kg(lastPoint.e1rm) })
              : t('progress.hub.strengthLabelNone')
          }
          onPress={() => router.push('/progreso/fuerza')}
        />
      ),
    },
    {
      key: 'medidas',
      span: '1x1',
      node: (
        <BentoTile
          section="progreso"
          icon={Ruler}
          title={t('progress.hub.measurementsTitle')}
          value={metricValue ?? t('progress.hub.measurementsNone')}
          {...(metric ? { caption: metric.name } : {})}
          accessibilityLabel={
            metric && metricValue
              ? t('progress.hub.measurementsLabel', { name: metric.name, value: metricValue })
              : t('progress.hub.measurementsLabelNone')
          }
          onPress={() => router.push('/progreso/medidas')}
        />
      ),
    },
    {
      key: 'fotos',
      span: '1x1',
      node: (
        <BentoTile
          section="progreso"
          icon={Camera}
          title={t('progress.hub.photosTitle')}
          value={t('progress.hub.photosCount', { count: data.photos.length })}
          caption={t('progress.hub.photosCaption')}
          visual={
            photo ? (
              <View
                style={{
                  width: theme.space[10],
                  borderRadius: theme.radius.sm,
                  overflow: 'hidden',
                }}
              >
                <StoredPhoto name={photo.uri} label={t('progress.hub.photosTitle')} thumbnail />
              </View>
            ) : undefined
          }
          accessibilityLabel={t('progress.hub.photosLabel', {
            count: data.photos.length,
            caption: t('progress.hub.photosCaption'),
          })}
          onPress={() => router.push('/fotos')}
        />
      ),
    },
    {
      key: 'ritmo',
      span: '1x1',
      node: (
        <BentoTile
          section="sueno"
          icon={MoonStars}
          title={t('progress.hub.rhythmTitle')}
          value={rhythm.value}
          caption={rhythm.caption}
          accessibilityLabel={t('progress.hub.rhythmLabel', rhythm)}
          onPress={() => router.push('/progreso/ritmo')}
        />
      ),
    },
    {
      key: 'hallazgos',
      span: '2x1',
      node: (
        <BentoTile
          section="progreso"
          icon={Lightbulb}
          title={t('progress.hub.insightsTitle')}
          caption={insightText ?? t('progress.hub.insightsNone')}
          accessibilityLabel={t('progress.hub.insightsLabel', {
            text: insightText ?? t('progress.hub.insightsNone'),
          })}
          onPress={() => router.push('/progreso/hallazgos')}
        />
      ),
    },
    {
      key: 'compartir',
      span: '1x1',
      node: (
        <BentoTile
          section="progreso"
          icon={ShareNetwork}
          title={t('progress.hub.shareTitle')}
          caption={t('progress.hub.shareCaption')}
          accessibilityLabel={t('progress.hub.shareLabel')}
          onPress={() => router.push('/compartir')}
        />
      ),
    },
  ];
  if (ctx.aiReady) {
    tiles.push({
      key: 'pomi',
      span: '1x1',
      node: (
        <BentoTile
          section="progreso"
          icon={ChatCircleDots}
          title={t('ai.ask.entryTitle')}
          caption={t('ai.ask.entryBody')}
          accessibilityLabel={t('progress.hub.askLabel')}
          onPress={() => router.push('/preguntale-a-pomi')}
        />
      ),
    });
  }
  tiles.push({
    key: 'mensual',
    span: '1x1',
    node: (
      <BentoTile
        section="progreso"
        icon={CalendarCheck}
        title={t('progress.hub.monthlyTitle')}
        caption={monthlyState}
        accessibilityLabel={t('progress.hub.monthlyLabel', { state: monthlyState })}
        onPress={() => router.push('/comparacion')}
        action={{
          icon: Camera,
          accessibilityLabel: t('progress.hub.monthlyStart'),
          onPress: () => router.push('/revision-mensual'),
        }}
      />
    ),
  });
  return tiles;
}

/** Progreso tab (PLAN §13): a bento hub; every tile opens its detail page under `/progreso/*`. */
export function ProgressScreen() {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const { state, load } = useProgress();
  const { status: ai } = useAiStatus();

  // Coming back to the tab (or from a workout / check-in) refreshes the numbers.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const tiles = useMemo(
    () =>
      state.status === 'ready'
        ? progressTiles(state.data, { t, theme, language, aiReady: ai.loaded && ai.ready })
        : null,
    [state, t, theme, language, ai],
  );
  const showSkeleton = useDelayedFlag(state.status === 'loading');

  return (
    <Screen header={<SectionHeader section="progreso" title={t('progress.title')} />}>
      <ScrollView
        {...hiddenScrollIndicators}
        contentContainerStyle={{ paddingVertical: theme.space[4], gap: theme.space[3] }}
      >
        {state.status === 'loading' && showSkeleton ? (
          <>
            <Skeleton height={theme.chart.height} />
            <Skeleton height={theme.chart.height} />
          </>
        ) : null}
        {state.status === 'error' ? (
          <EmptyState
            compact
            title={t('progress.loadFailed')}
            body=""
            action={{ label: t('progress.retry'), onPress: () => void load() }}
          />
        ) : null}
        {tiles ? <BentoGrid items={tiles} /> : null}
      </ScrollView>
    </Screen>
  );
}
