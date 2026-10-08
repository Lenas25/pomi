import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import type { TimelineEntry } from '../domain/today/timeline';
import { ActivityCard } from '../habits/ActivityCard';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { MascotBubble } from '../ui/MascotBubble';
import { Screen } from '../ui/Screen';
import { SuggestionCard } from '../ui/SuggestionCard';
import { Toast } from '../ui/Toast';
import { TimelineItem } from '../ui/TimelineItem';
import { useTheme } from '../ui/theme';

import {
  entryAccessibilityLabel,
  entryHighlight,
  entrySubtitle,
  entryTime,
  entryTitle,
} from './labels';
import { InsightSlot } from './slots';
import { useToday } from './useToday';

/** Hoy (PLAN §13, HANDOFF §5): greeting, identity phrase, the day's timeline and the closing message. */
export function TodayScreen() {
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

  if (today.load.status === 'error') {
    return (
      <Screen>
        <EmptyState
          title={t('today.loadError')}
          body={t('empty.hoy.body')}
          action={{ label: t('today.retry'), onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  const view = today.view;
  if (!view) return <Screen>{null}</Screen>;

  const { data, entries } = view;
  const firstDay = data.identity.firstDay;
  const context = { routineName: data.routineName, facts: data.facts, gymGoal: data.gymGoal };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.space[4], paddingVertical: theme.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: theme.space[1] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {view.greeting}
          </Text>
          <Text style={[theme.text('title-md'), { color: theme.color.textMuted }]}>
            {view.identity}
          </Text>
        </View>

        {firstDay ? <MascotBubble pose="hola" message={t('today.firstBubble')} /> : null}

        {view.suggestion ? (
          <SuggestionCard
            key={view.suggestion.id}
            text={view.suggestion.text}
            reason={view.suggestion.reason}
            evidence={view.suggestion.evidence}
            whyLabel={t('suggestions.card.why')}
            acceptLabel={t('suggestions.card.accept')}
            declineLabel={t('suggestions.card.decline')}
            busy={today.suggestionBusy}
            onAccept={() => {
              if (view.suggestion) void today.acceptSuggestion(view.suggestion.id);
            }}
            onDecline={() => {
              if (view.suggestion) void today.declineSuggestion(view.suggestion.id);
            }}
          />
        ) : null}
        <InsightSlot />

        {data.activityToday === undefined ? (
          <ActivityCard answer={undefined} onAnswer={(kind) => void today.answerActivity(kind)} />
        ) : null}

        {entries.length === 0 ? (
          <EmptyState title={t('empty.hoy.title')} body={t('empty.hoy.body')} />
        ) : (
          <View style={{ gap: theme.space[2] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { color: theme.color.text }]}
            >
              {t('today.timelineTitle')}
            </Text>
            {entries.map((entry) => (
              <TimelineItem
                key={entry.id}
                status={entry.status}
                time={entryTime(entry)}
                title={entryTitle(entry, t)}
                {...(() => {
                  const subtitle = entrySubtitle(entry, context, t);
                  return subtitle ? { subtitle } : {};
                })()}
                {...(() => {
                  const highlight = entryHighlight(entry, context, t, language);
                  return highlight ? { highlight } : {};
                })()}
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
            ))}
          </View>
        )}

        {view.allDone ? <MascotBubble pose="descansa" message={t('today.doneBubble')} /> : null}
      </ScrollView>

      {today.notice ? (
        <View style={{ position: 'absolute', top: theme.space[2], left: 0, right: 0 }}>
          <Toast
            key={today.notice.id}
            variant={today.notice.variant}
            title={today.notice.title}
            subtitle={today.notice.subtitle}
            onHide={today.clearNotice}
          />
        </View>
      ) : null}

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
