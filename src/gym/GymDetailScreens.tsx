// The Gym detail pages (`/gym/programa`, `/gym/volumen`, `/gym/historial`): the full data behind
// each hub tile. They share `useGymTab` with the hub.
import { useCallback, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { useLocaleStore, useT } from '../i18n';
import { useTemplateText } from '../i18n/templateText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { useTheme } from '../ui/theme';
import { VolumeProgressSection, WeekVolumeCard } from '../volume/VolumeSection';
import { exerciseCount, openSession, type GymReady } from './GymHub';
import type { HistoryEntry } from './gymHistory';
import { formatKg } from './sessionViewModel';
import { useGymTab } from './useGym';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/gym');
}

const EDGES = ['top', 'bottom', 'left', 'right'] as const;

/** Section header with back + the loading / error states of `useGymTab`; `render` gets the data. */
function DetailScreen({
  title,
  render,
  footer,
}: {
  title: string;
  render: (data: GymReady) => ReactNode;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const t = useT();
  const tab = useGymTab();
  const { reload } = tab;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const header = (
    <SectionHeader
      section="gym"
      title={title}
      showSettings={false}
      back={{ label: t('gym.hub.back'), onPress: goBack }}
    />
  );
  if (tab.status === 'loading')
    return (
      <Screen header={header} edges={EDGES}>
        {null}
      </Screen>
    );
  if (tab.status === 'error') {
    return (
      <Screen header={header} edges={EDGES}>
        <EmptyState
          title={t('gym.session.loadError')}
          body={t('database.errorBody')}
          action={{ label: t('gym.tab.retry'), onPress: reload }}
        />
      </Screen>
    );
  }
  return (
    <Screen scroll header={header} edges={EDGES} footer={footer}>
      <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>{render(tab)}</View>
    </Screen>
  );
}

/** `/gym/programa`: the routines of the program (start any), edit and import. */
export function ProgramDetailScreen() {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  return (
    <DetailScreen
      title={t('gym.tab.programTitle')}
      footer={
        <>
          <Button
            label={t('gym.tab.edit')}
            variant="secondary"
            onPress={() => router.push('/editar-programa')}
          />
          <Button
            label={t('gym.hub.import')}
            variant="secondary"
            onPress={() => router.push('/importar-programa')}
          />
        </>
      }
      render={(data) => {
        const program = data.program;
        if (!program) {
          return (
            <EmptyState
              title={t('creator.empty.title')}
              body={t('creator.empty.body')}
              action={{ label: t('creator.cta'), onPress: () => router.push('/crear-rutina') }}
            />
          );
        }
        return (
          <>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-md'), { color: theme.color.text }]}
            >
              {text(program.name)}
            </Text>
            {program.routines.map((routine) => {
              const isToday = routine.id === data.todayRoutineId;
              const open = data.resumableRoutineIds.includes(routine.id);
              return (
                <Card
                  key={routine.id}
                  onPress={() => openSession(routine.id)}
                  accessibilityLabel={t(
                    open ? 'gym.tab.resumeRoutineLabel' : 'gym.tab.startRoutineLabel',
                    { name: text(routine.name) },
                  )}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                    <View style={{ flex: 1, gap: theme.space[1] }}>
                      <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                        {text(routine.name)}
                      </Text>
                      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                        {t('gym.tab.exercises', { count: exerciseCount(routine) })}
                      </Text>
                    </View>
                    {isToday ? (
                      <Text style={[theme.text('caption'), { color: theme.color.energyText }]}>
                        {t('gym.tab.todayBadge')}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </>
        );
      }}
    />
  );
}

/** `/gym/volumen`: sets per muscle this week + the weekly history per muscle. */
export function VolumeDetailScreen() {
  const t = useT();
  return (
    <DetailScreen
      title={t('gym.hub.volumeTitle')}
      render={(data) =>
        data.volume ? (
          <>
            <WeekVolumeCard data={data.volume} />
            <VolumeProgressSection data={data.volume} />
          </>
        ) : (
          <EmptyState compact title={t('volume.emptyTitle')} body={t('volume.emptyBody')} />
        )
      }
    />
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const language = useLocaleStore((state) => state.language);
  return (
    <Card>
      <View style={{ gap: theme.space[2] }}>
        <Text style={[theme.text('caption'), { color: theme.section.gym.text }]}>
          {format(parseISO(entry.date), 'd/M/yyyy')}
        </Text>
        <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
          {entry.routineName ? text(entry.routineName) : t('gym.hub.historyUnknownRoutine')}
        </Text>
        <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
          {t('gym.hub.historySummary', {
            sets: entry.setCount,
            kg: formatKg(Math.round(entry.volumeKg), language),
          })}
        </Text>
        {entry.exercises.map((exercise) => (
          <Text
            key={exercise.stepId}
            style={[theme.text('body'), { color: theme.color.textMuted }]}
          >
            {`${exercise.name ? text(exercise.name) : t('gym.hub.historyUnknownExercise')}: ${exercise.sets
              .map((set) =>
                set.weightKg === null
                  ? t('gym.session.lastTimeBodyweight', { reps: set.reps })
                  : t('gym.session.lastTimeSet', {
                      kg: formatKg(set.weightKg, language),
                      reps: set.reps,
                    }),
              )
              .join(', ')}`}
          </Text>
        ))}
      </View>
    </Card>
  );
}

/** `/gym/historial`: recent sessions with their sets and volume. */
export function HistoryDetailScreen() {
  const t = useT();
  return (
    <DetailScreen
      title={t('gym.hub.historyTitle')}
      render={(data) =>
        data.history.length > 0 ? (
          data.history.map((entry) => <HistoryCard key={entry.id} entry={entry} />)
        ) : (
          <EmptyState
            compact
            title={t('gym.hub.historyEmptyTitle')}
            body={t('gym.hub.historyEmptyBody')}
          />
        )
      }
    />
  );
}
