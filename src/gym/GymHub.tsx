import { useCallback } from 'react';
import { ScrollView, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Barbell, ClockCounterClockwise, Lightning, MagicWand } from 'phosphor-react-native';

import { useLocaleStore, useT, type Translate } from '../i18n';
import { useTemplateText } from '../i18n/templateText';
import type { LocalizedText } from '../templates/localized';
import { BentoGrid, type BentoItem } from '../ui/BentoGrid';
import { BentoTile } from '../ui/BentoTile';
import { EmptyState } from '../ui/EmptyState';
import { MiniBars } from '../ui/MiniMeter';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { useTheme, type Theme } from '../ui/theme';
import { formatSets, thisWeekRows } from '../volume/volumeView';
import { RoutineCarousel } from './RoutineCarousel';
import { useGymTab, type GymTabState } from './useGym';
import { hiddenScrollIndicators } from '../ui/scroll';

export type GymReady = Extract<GymTabState, { status: 'ready' }>;

/** Opens a session of `routineId` (start or resume). */
export function openSession(routineId: string): void {
  router.push({ pathname: '/gym/session', params: { routineId } });
}

/** Number of `sets` exercises of a routine. */
export function exerciseCount(routine: { steps: readonly { type: string }[] }): number {
  return routine.steps.filter((step) => step.type === 'sets').length;
}

const VOLUME_BARS = 5;

type TileContext = {
  t: Translate;
  theme: Theme;
  language: 'es' | 'en';
  text: (value: LocalizedText) => string;
};

/** The 2x2 hero: a carousel of every routine, the suggested one (rotation) first. */
function RoutinesTile({ data }: { data: GymReady }) {
  const t = useT();
  const theme = useTheme();
  const routines = data.program?.routines ?? [];
  if (routines.length === 0) {
    return (
      <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
        {t('gym.hub.noRoutine')}
      </Text>
    );
  }
  return (
    <RoutineCarousel
      routines={routines}
      suggestedId={data.todayRoutineId}
      resumableId={data.resumableRoutineId}
      goals={data.goals}
      onStart={openSession}
    />
  );
}

/** Builds the hub tiles in reading order (pure over the data; exported for the tests). */
export function gymTiles(data: GymReady, ctx: TileContext): BentoItem[] {
  const { t, theme, language, text } = ctx;
  const program = data.program;
  if (!program) return [];
  const colors = theme.section.gym;
  const { done, planned } = data.week;
  const rows = data.volume ? thisWeekRows(data.volume) : [];
  const totalSets = formatSets(
    rows.reduce((sum, row) => sum + row.sets, 0),
    language,
  );
  const last = data.history[0];
  const lastDate = last ? format(parseISO(last.date), 'd/M') : null;
  const programName = text(program.name);
  const routines = program.routines.length;

  return [
    { key: 'hoy', span: '2x2', node: <RoutinesTile data={data} /> },
    {
      key: 'semana',
      span: '1x1',
      node: (
        <BentoTile
          section="gym"
          icon={Lightning}
          title={t('gym.hub.weekTitle')}
          value={planned > 0 ? `${done}/${planned}` : String(done)}
          caption={t('gym.hub.weekCaption')}
          accessibilityLabel={
            planned > 0
              ? t('gym.hub.weekLabel', { done, planned })
              : t('gym.hub.weekLabelNoPlan', { done })
          }
          onPress={() => router.push('/gym/historial')}
        />
      ),
    },
    {
      key: 'volumen',
      span: '1x1',
      node: (
        <BentoTile
          section="gym"
          title={t('gym.hub.volumeTitle')}
          value={totalSets}
          caption={t('gym.hub.volumeCaption')}
          visual={
            rows.length > 0 ? (
              <MiniBars
                values={rows.slice(0, VOLUME_BARS).map((row) => row.sets)}
                color={colors.text}
                trackColor={theme.color.border}
              />
            ) : undefined
          }
          accessibilityLabel={t('gym.hub.volumeLabel', { sets: totalSets })}
          onPress={() => router.push('/gym/volumen')}
        />
      ),
    },
    {
      key: 'programa',
      span: '2x1',
      node: (
        <BentoTile
          section="gym"
          icon={Barbell}
          title={t('gym.tab.programTitle')}
          value={programName}
          caption={t('gym.hub.programCaption', { count: routines })}
          accessibilityLabel={t('gym.hub.programLabel', { name: programName, count: routines })}
          onPress={() => router.push('/gym/programa')}
        />
      ),
    },
    {
      key: 'crear',
      span: '1x1',
      node: (
        <BentoTile
          section="gym"
          icon={MagicWand}
          title={t('gym.hub.createTitle')}
          caption={t('gym.hub.createCaption')}
          accessibilityLabel={t('gym.hub.createLabel')}
          onPress={() => router.push('/crear-rutina')}
        />
      ),
    },
    {
      key: 'historial',
      span: '1x1',
      node: (
        <BentoTile
          section="gym"
          icon={ClockCounterClockwise}
          title={t('gym.hub.historyTitle')}
          value={lastDate ?? t('gym.hub.historyNone')}
          {...(lastDate ? { caption: t('gym.hub.historyCaption') } : {})}
          accessibilityLabel={
            lastDate ? t('gym.hub.historyLabel', { date: lastDate }) : t('gym.hub.historyLabelNone')
          }
          onPress={() => router.push('/gym/historial')}
        />
      ),
    },
  ];
}

/** Gym tab (PLAN §13): a bento hub; every tile opens its detail page under `/gym/*`. */
export function GymHubScreen() {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const language = useLocaleStore((state) => state.language);
  const tab = useGymTab();
  const { reload } = tab;

  // Coming back from a session (finished or not) refreshes today's routine.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // Error / loading keep the header so the Ajustes gear stays reachable when the load fails.
  const fallbackHeader = <SectionHeader section="gym" title={t('tabs.gym')} />;
  if (tab.status === 'loading') return <Screen header={fallbackHeader}>{null}</Screen>;
  if (tab.status === 'error') {
    return (
      <Screen header={fallbackHeader}>
        <EmptyState
          title={t('gym.session.loadError')}
          body={t('database.errorBody')}
          action={{ label: t('gym.tab.retry'), onPress: reload }}
        />
      </Screen>
    );
  }
  if (!tab.program) {
    return (
      <Screen header={<SectionHeader section="gym" title={t('tabs.gym')} />}>
        <EmptyState
          title={t('creator.empty.title')}
          body={t('creator.empty.body')}
          action={{ label: t('creator.cta'), onPress: () => router.push('/crear-rutina') }}
        />
      </Screen>
    );
  }

  const tiles = gymTiles(tab, { t, theme, language, text });
  return (
    <Screen
      header={
        <SectionHeader section="gym" title={t('tabs.gym')} subtitle={text(tab.program.name)} />
      }
    >
      <ScrollView
        {...hiddenScrollIndicators}
        contentContainerStyle={{ paddingVertical: theme.space[4] }}
      >
        <BentoGrid items={tiles} />
      </ScrollView>
    </Screen>
  );
}
