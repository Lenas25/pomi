import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Play } from 'phosphor-react-native';

import { useGymTab } from '../../src/gym/useGym';
import { useT } from '../../src/i18n';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Screen } from '../../src/ui/Screen';
import { useTheme } from '../../src/ui/theme';

function openSession(routineId: string): void {
  router.push({ pathname: '/gym/session', params: { routineId } });
}

export default function Gym() {
  const theme = useTheme();
  const t = useT();
  const tab = useGymTab();
  const { reload } = tab;

  // Coming back from a session (finished or not) refreshes today's routine.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (tab.status === 'loading') return <Screen>{null}</Screen>;
  if (tab.status === 'error') {
    return (
      <Screen>
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
      <Screen>
        <EmptyState
          title={t('creator.empty.title')}
          body={t('creator.empty.body')}
          action={{ label: t('creator.cta'), onPress: () => router.push('/crear-rutina') }}
        />
      </Screen>
    );
  }

  const { program, todayRoutineId, resumableRoutineId } = tab;
  const today = program.routines.find((routine) => routine.id === todayRoutineId);
  const resuming = today !== undefined && resumableRoutineId === today.id;
  const countSets = (routineId: string) =>
    program.routines
      .find((routine) => routine.id === routineId)
      ?.steps.filter((step) => step.type === 'sets').length ?? 0;

  return (
    <Screen scroll>
      <View style={{ gap: theme.space[8], paddingVertical: theme.space[4] }}>
        <View style={{ gap: theme.space[3] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {program.name}
          </Text>
          {today ? (
            <Card variant="highlight">
              <View style={{ gap: theme.space[3] }}>
                <Text style={[theme.text('caption'), { color: theme.color.energyText }]}>
                  {resuming ? t('gym.tab.inProgress') : t('gym.tab.todayTitle')}
                </Text>
                <Text style={[theme.text('title-md'), { color: theme.color.text }]}>
                  {today.name}
                </Text>
                <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
                  {t('gym.tab.exercises', { count: countSets(today.id) })}
                </Text>
                <Button
                  label={t(resuming ? 'gym.tab.resume' : 'gym.tab.start')}
                  size="lg"
                  icon={Play}
                  onPress={() => openSession(today.id)}
                />
              </View>
            </Card>
          ) : null}
        </View>

        <View style={{ gap: theme.space[3] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-md'), { color: theme.color.text }]}
          >
            {t('gym.tab.routinesTitle')}
          </Text>
          {program.routines.map((routine) => {
            const isToday = routine.id === todayRoutineId;
            const open = routine.id === resumableRoutineId;
            return (
              <Card
                key={routine.id}
                onPress={() => openSession(routine.id)}
                accessibilityLabel={t(
                  open ? 'gym.tab.resumeRoutineLabel' : 'gym.tab.startRoutineLabel',
                  { name: routine.name },
                )}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                  <View style={{ flex: 1, gap: theme.space[1] }}>
                    <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                      {routine.name}
                    </Text>
                    <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                      {t('gym.tab.exercises', { count: countSets(routine.id) })}
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
        </View>

        <Button
          label={t('creator.cta')}
          variant="secondary"
          onPress={() => router.push('/crear-rutina')}
        />
      </View>
    </Screen>
  );
}
