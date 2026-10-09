import { useCallback, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import type { TimelineEntry } from '../domain/today/timeline';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { MascotBubble } from '../ui/MascotBubble';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { TimelineItem } from '../ui/TimelineItem';
import { useTheme } from '../ui/theme';

import {
  entryAccessibilityLabel,
  entryHighlight,
  entrySubtitle,
  entryTime,
  entryTitle,
  isBedtimeEntry,
} from './labels';
import { useToday } from './useToday';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/hoy');
}

/** `/hoy/agenda`: the full timeline of the day (swipe to mark / postpone / skip, long press menu). */
export function AgendaScreen() {
  const theme = useTheme();
  const t = useT();
  const today = useToday();
  const language = useLocaleStore((state) => state.language);
  const [menuFor, setMenuFor] = useState<TimelineEntry | null>(null);
  const { reload } = today;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const header = (
    <SectionHeader
      section="hoy"
      title={t('today.timelineTitle')}
      showSettings={false}
      back={{ label: t('today.hub.back'), onPress: goBack }}
    />
  );

  if (today.load.status === 'error') {
    return (
      <Screen header={header} edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          title={t('today.loadError')}
          body={t('empty.hoy.body')}
          action={{ label: t('today.retry'), onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  const view = today.view;
  if (!view) return <Screen header={header}>{null}</Screen>;

  const { data, entries } = view;
  const context = { routineName: data.routineName, facts: data.facts, gymGoal: data.gymGoal };

  return (
    <Screen scroll header={header} edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[2], paddingVertical: theme.space[4] }}>
        {entries.length === 0 ? (
          <EmptyState title={t('empty.hoy.title')} body={t('empty.hoy.body')} />
        ) : (
          entries.map((entry) => {
            const subtitle = entrySubtitle(entry, context, t);
            const highlight = entryHighlight(entry, context, t, language);
            return (
              <TimelineItem
                key={entry.id}
                status={entry.status}
                time={entryTime(entry)}
                title={entryTitle(entry, t)}
                {...(subtitle ? { subtitle } : {})}
                {...(highlight ? { highlight } : {})}
                accessibilityLabel={entryAccessibilityLabel(entry, t)}
                checkLabel={t(entry.status === 'done' ? 'today.doneState' : 'today.markDone', {
                  title: entryTitle(entry, t),
                })}
                actionLabels={{
                  done: t('today.actions.done'),
                  postpone: t('today.menu.snooze'),
                  skip: t('today.menu.skip'),
                }}
                onPostpone={() => void today.postpone(entry)}
                onSkip={() => void today.skip(entry)}
                onPress={() => today.open(entry)}
                onCheck={() => void today.done(entry)}
                onLongPress={() => setMenuFor(entry)}
              />
            );
          })
        )}
        {view.allDone ? <MascotBubble pose="descansa" message={t('today.doneBubble')} /> : null}
      </View>

      <Modal
        transparent
        visible={menuFor !== null}
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}
      >
        <Pressable
          accessibilityLabel={t('today.menu.cancel')}
          onPress={() => setMenuFor(null)}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: theme.color.scrim,
            padding: theme.space[4],
          }}
        >
          {menuFor ? (
            <Card>
              <View style={{ gap: theme.space[2] }}>
                <Text
                  accessibilityRole="header"
                  style={[theme.text('title-sm'), { color: theme.color.text }]}
                >
                  {t('today.menu.title', { title: entryTitle(menuFor, t) })}
                </Text>
                <Button
                  label={t('today.menu.snooze')}
                  onPress={() => {
                    void today.postpone(menuFor);
                    setMenuFor(null);
                  }}
                />
                <Button
                  label={t('today.menu.skip')}
                  variant="secondary"
                  onPress={() => {
                    void today.skip(menuFor);
                    setMenuFor(null);
                  }}
                />
                {isBedtimeEntry(menuFor) ? (
                  <Button
                    label={t('today.menu.sleepCycles')}
                    variant="secondary"
                    onPress={() => {
                      setMenuFor(null);
                      router.push('/ciclos-sueno');
                    }}
                  />
                ) : null}
                <Button
                  label={t('today.menu.cancel')}
                  variant="ghost"
                  onPress={() => setMenuFor(null)}
                />
              </View>
            </Card>
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}
