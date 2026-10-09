import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import type { TimelineEntry } from '../domain/today/timeline';
import { ActivityCard } from '../habits/ActivityCard';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { MascotBubble } from '../ui/MascotBubble';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
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
  isBedtimeEntry,
} from './labels';
import { InsightCard } from './InsightCard';
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
    <Screen header={<SectionHeader section="hoy" title={view.greeting} subtitle={view.identity} />}>
      <ScrollView
        contentContainerStyle={{ gap: theme.space[4], paddingVertical: theme.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {firstDay ? <MascotBubble pose="hola" message={t('today.firstBubble')} /> : null}

        {view.suggestion ? (
          <SuggestionCard
            key={view.suggestion.id}
            text={view.suggestion.text}
            reason={view.suggestion.reason}
            evidence={view.suggestion.evidence}
            cardLabel={t('suggestions.card.label')}
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
        {view.insight ? (
          <InsightCard
            key={view.insight.id}
            text={view.insight.text}
            evidence={view.insight.evidence}
            title={t('insights.title')}
            cardLabel={t('insights.card.label')}
            openLabel={t('insights.card.open')}
            onOpen={() => router.push('/progreso')}
            onSeen={() => {
              if (view.insight) void today.markInsightSeen(view.insight.id);
            }}
          />
        ) : null}
        <InsightSlot
          card={data.companionCard}
          onOpen={() => router.push('/progreso')}
          onDismiss={() => void today.dismissCompanionCard()}
        />

        {data.reviewEntry ? (
          <Card variant="highlight">
            <View style={{ gap: theme.space[3] }}>
              <View style={{ gap: theme.space[1] }}>
                <Text
                  accessibilityRole="header"
                  style={[theme.text('title-sm'), { color: theme.color.text }]}
                >
                  {t('review.entry.title')}
                </Text>
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {t('review.entry.body')}
                </Text>
              </View>
              <Button label={t('review.entry.open')} onPress={() => router.push('/revision')} />
            </View>
          </Card>
        ) : null}

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
