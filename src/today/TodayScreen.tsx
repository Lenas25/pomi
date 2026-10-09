import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowRight,
  Barbell,
  Check,
  CheckCircle,
  CircleDashed,
  Clock,
  Drop,
  Footprints,
  Info,
  PersonSimpleWalk,
  Plus,
  SunHorizon,
} from 'phosphor-react-native';

import type { WeeklyItem } from '../domain/agenda/weekly';
import { doneActionFor, type TimelineEntry } from '../domain/today/timeline';
import { ActivityCard } from '../habits/ActivityCard';
import { useLocaleStore, useT, type Translate } from '../i18n';
import { templateText } from '../i18n/templateText';
import { checkinKindForHour } from '../quickadd/quickAdd';
import { BentoGrid, type BentoItem } from '../ui/BentoGrid';
import { BentoTile } from '../ui/BentoTile';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { MascotBubble } from '../ui/MascotBubble';
import { MiniBar, MiniDots } from '../ui/MiniMeter';
import { ProgressRing } from '../ui/ProgressRing';
import { Screen } from '../ui/Screen';
import { SectionHeader } from '../ui/SectionHeader';
import { useReloadOnDataChange } from '../db/dataVersion';
import { SuggestionCard } from '../ui/SuggestionCard';
import { Toast } from '../ui/Toast';
import { useTheme } from '../ui/theme';

import { countRule, howItCountsLine } from './howItCounts';
import { entryHighlight, entryTime, entryTitle } from './labels';
import { InsightCard } from './InsightCard';
import { InsightSlot } from './slots';
import { dayProgressCount, pickNowEntry } from './todayView';
import { useToday } from './useToday';
import { hiddenScrollIndicators } from '../ui/scroll';

type View_ = NonNullable<ReturnType<typeof useToday>['view']>;
type Today = ReturnType<typeof useToday>;

const RING_SIZE = 48;
const RING_STROKE = 6;

/** One row of the "Tareas de hoy" sheet: status icon, title and how it counts. */
function TaskRow({ entry, week }: { entry: TimelineEntry; week: WeeklyItem | undefined }) {
  const theme = useTheme();
  const t = useT();
  const settled = entry.status === 'done' || entry.status === 'skipped';
  const status = t(
    entry.status === 'done'
      ? 'today.tasks.done'
      : entry.status === 'skipped'
        ? 'today.tasks.skipped'
        : 'today.tasks.pending',
  );
  const title = entryTitle(entry, t);
  const how = week ? howItCountsLine(week, t) : countRule(entry.item, t);
  const Icon = settled ? CheckCircle : CircleDashed;
  return (
    <View
      accessible
      accessibilityLabel={t('today.tasks.itemLabel', { title, status, how })}
      style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }}
    >
      <Icon
        color={settled ? theme.color.success : theme.color.textMuted}
        weight={settled ? 'fill' : 'regular'}
      />
      <View style={{ flex: 1, gap: theme.space[1] }}>
        <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>{title}</Text>
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{how}</Text>
      </View>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{status}</Text>
    </View>
  );
}

/**
 * Header summary: the day's progress ring and "x de y tareas de hoy". Tapping it lists the tasks
 * (done / pending) with how each one counts.
 */
function DayProgress({
  entries,
  weekly,
}: {
  entries: readonly TimelineEntry[];
  weekly: Readonly<Record<string, WeeklyItem>>;
}) {
  const theme = useTheme();
  const t = useT();
  const colors = theme.section.hoy;
  const [open, setOpen] = useState(false);
  const { settled, total } = dayProgressCount(entries);
  if (total === 0) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('today.hub.progressLabel', { done: settled, total })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: theme.space[3],
          marginTop: theme.space[2],
          minHeight: theme.touch.gym,
          opacity: pressed ? theme.opacity.pressed : 1,
        })}
      >
        <ProgressRing
          progress={settled / total}
          size={RING_SIZE}
          stroke={RING_STROKE}
          color={colors.onFill}
          trackColor={colors.soft}
        />
        <Text style={[theme.text('body-strong'), { color: colors.onFill }]}>
          {t('today.hub.progress', { done: settled, total })}
        </Text>
        <Info color={colors.onFill} />
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('today.tasks.title')}
        closeLabel={t('today.tasks.close')}
      >
        <View style={{ gap: theme.space[4] }}>
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
            {t('today.tasks.hint')}
          </Text>
          {entries.map((entry) => (
            <TaskRow key={entry.id} entry={entry} week={weekly[entry.id]} />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function nowTile(view: View_, today: Today, t: Translate): BentoItem {
  const entry = pickNowEntry(view.entries, view.nowMinutes);
  const openAgenda = () => router.push('/hoy/agenda');
  if (!entry) {
    const empty = view.entries.length === 0;
    return {
      key: 'ahora',
      span: '2x1',
      node: (
        <BentoTile
          section="hoy"
          variant="hero"
          icon={Clock}
          title={t('today.hub.now.title')}
          value={empty ? t('empty.hoy.title') : t('today.hub.now.none')}
          caption={t('today.hub.now.open')}
          accessibilityLabel={t('today.hub.now.noneLabel')}
          onPress={openAgenda}
        />
      ),
    };
  }
  const title = entryTitle(entry, t);
  const time = entryTime(entry) ?? t('today.hub.now.allDay');
  const kind = entry.status === 'now' ? t('today.hub.now.title') : t('today.hub.now.next');
  const opens = doneActionFor(entry).type === 'open';
  return {
    key: 'ahora',
    span: '2x1',
    node: (
      <BentoTile
        section="hoy"
        variant="hero"
        icon={Clock}
        title={`${kind} · ${time}`}
        value={title}
        caption={t('today.hub.now.open')}
        accessibilityLabel={t('today.hub.now.label', { kind, time, title })}
        onPress={openAgenda}
        action={{
          icon: opens ? ArrowRight : Check,
          accessibilityLabel: opens
            ? t('today.openItem', { title })
            : t('today.markDone', { title }),
          onPress: () => (opens ? today.open(entry) : void today.done(entry)),
        }}
      />
    ),
  };
}

function habitTiles(view: View_, today: Today, t: Translate, locale: string): BentoItem[] {
  const tiles: BentoItem[] = [];
  const habits = view.data.facts.view;
  const { water, steps } = habits;
  if (water) {
    const total = water.target?.glasses;
    tiles.push({
      key: 'agua',
      span: '1x1',
      node: (
        <BentoTile
          section="agua"
          icon={Drop}
          title={t('today.hub.water.title')}
          value={total === undefined ? String(water.value) : `${water.value}/${total}`}
          {...(total === undefined ? { caption: t('today.hub.water.caption') } : {})}
          visual={total === undefined ? undefined : <WaterDots value={water.value} total={total} />}
          accessibilityLabel={
            total === undefined
              ? t('today.hub.water.labelNoGoal', { count: water.value })
              : t('today.hub.water.label', { done: water.value, total })
          }
          onPress={() => router.push('/habitos/agua')}
          action={{
            icon: Plus,
            accessibilityLabel: t('today.hub.water.add'),
            onPress: () => void today.addWater(),
          }}
        />
      ),
    });
  }
  if (steps) {
    const goal = steps.plan.goal;
    const count = steps.steps.toLocaleString(locale);
    tiles.push({
      key: 'pasos',
      span: '1x1',
      node: (
        <BentoTile
          section="movimiento"
          icon={Footprints}
          title={t('today.hub.steps.title')}
          value={count}
          caption={
            goal === null
              ? t('today.hub.steps.measuring')
              : t('today.hub.steps.goal', { goal: goal.toLocaleString(locale) })
          }
          visual={goal === null ? undefined : <StepsBar value={steps.steps} total={goal} />}
          accessibilityLabel={
            goal === null
              ? t('today.hub.steps.labelNoGoal', { steps: count })
              : t('today.hub.steps.label', { steps: count, goal: goal.toLocaleString(locale) })
          }
          onPress={() => router.push('/habitos/pasos')}
        />
      ),
    });
  }
  return tiles;
}

function WaterDots({ value, total }: { value: number; total: number }) {
  const theme = useTheme();
  return (
    <MiniDots
      value={value}
      total={total}
      color={theme.section.agua.text}
      trackColor={theme.color.border}
    />
  );
}

function StepsBar({ value, total }: { value: number; total: number }) {
  const theme = useTheme();
  return (
    <MiniBar
      value={value}
      total={total}
      color={theme.section.movimiento.text}
      trackColor={theme.color.border}
    />
  );
}

function gymTile(view: View_, t: Translate, language: 'es' | 'en'): BentoItem {
  const { data, entries } = view;
  const entry = entries.find((candidate) => candidate.kind === 'gym');
  const done = data.facts.gymDone || entry?.status === 'done';
  const value = done
    ? t('today.hub.gym.done')
    : entry
      ? (templateText(data.routineName) ?? t('today.hub.gym.todayIs'))
      : t('today.hub.gym.rest');
  const pending = entry !== undefined && !done;
  // The full "meta de hoy" is spoken; the 1x1 tile shows only the exercise (one short line).
  const goal = pending ? (entryHighlight(entry, { gymGoal: data.gymGoal }, t, language) ?? '') : '';
  const caption = pending ? (data.gymGoal?.exercise ?? t('today.hub.gym.todayIs')) : '';
  return {
    key: 'gym',
    span: '1x1',
    node: (
      <BentoTile
        section="gym"
        icon={Barbell}
        title={t('today.hub.gym.title')}
        value={value}
        {...(caption ? { caption } : {})}
        accessibilityLabel={t('today.hub.gym.label', {
          value,
          caption: (goal || caption).replace(/[.]$/, ''),
        })}
        onPress={() => router.push('/gym')}
      />
    ),
  };
}

function checkinsTile(view: View_, t: Translate): BentoItem | null {
  const { morning, night } = view.data.facts.view.checkins;
  const rows = [
    { kind: 'morning' as const, ...morning },
    { kind: 'night' as const, ...night },
  ].filter((row) => row.enabled);
  if (rows.length === 0) return null;
  const done = rows.filter((row) => row.done).length;
  // One short line (fits a 1x1 tile): the first pending check-in, else the last one done.
  const shown = rows.find((row) => !row.done) ?? rows[rows.length - 1];
  const caption = shown
    ? t(
        shown.kind === 'morning'
          ? shown.done
            ? 'today.hub.checkins.morningDone'
            : 'today.hub.checkins.morningPending'
          : shown.done
            ? 'today.hub.checkins.nightDone'
            : 'today.hub.checkins.nightPending',
      )
    : '';
  const preferred = checkinKindForHour(new Date().getHours());
  const target =
    rows.find((row) => row.kind === preferred && !row.done) ??
    rows.find((row) => !row.done) ??
    rows.find((row) => row.kind === preferred) ??
    rows[0];
  return {
    key: 'checkins',
    span: '1x1',
    node: (
      <BentoTile
        section="sueno"
        icon={SunHorizon}
        title={t('today.hub.checkins.title')}
        value={`${done}/${rows.length}`}
        caption={caption}
        accessibilityLabel={t('today.hub.checkins.label', { done, total: rows.length, caption })}
        onPress={() =>
          router.push({ pathname: '/checkin/[tipo]', params: { tipo: target?.kind ?? preferred } })
        }
      />
    ),
  };
}

/** Hoy (PLAN §13, HANDOFF §5): a bento hub. Every tile is a summary that opens its detail page. */
export function TodayScreen() {
  const theme = useTheme();
  const t = useT();
  const today = useToday();
  const language = useLocaleStore((state) => state.language);
  const [askActivity, setAskActivity] = useState(false);
  const { reload } = today;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  // A quick-add write (the sheet over this tab) does not blur it: reload on the shared signal.
  useReloadOnDataChange(reload);

  // Error / loading keep the header so the Ajustes gear stays reachable when the load fails.
  const fallbackHeader = <SectionHeader section="hoy" title={t('tabs.hoy')} />;
  if (today.load.status === 'error') {
    return (
      <Screen header={fallbackHeader}>
        <EmptyState
          title={t('today.loadError')}
          body={t('empty.hoy.body')}
          action={{ label: t('today.retry'), onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  const view = today.view;
  if (!view) return <Screen header={fallbackHeader}>{null}</Screen>;

  const { data } = view;
  const firstDay = data.identity.firstDay;
  const checkins = checkinsTile(view, t);

  const tiles: BentoItem[] = [
    nowTile(view, today, t),
    ...habitTiles(view, today, t, language),
    gymTile(view, t, language),
    ...(checkins ? [checkins] : []),
  ];
  if (data.activityToday === undefined) {
    tiles.push({
      key: 'actividad',
      span: tiles.length % 2 === 0 ? '2x1' : '1x1',
      node: (
        <BentoTile
          section="movimiento"
          icon={PersonSimpleWalk}
          title={t('activity.title')}
          caption={t('today.hub.activity.caption')}
          accessibilityLabel={t('today.hub.activity.label')}
          onPress={() => setAskActivity(true)}
        />
      ),
    });
  }

  return (
    <Screen
      header={
        <SectionHeader section="hoy" title={view.greeting} subtitle={view.identity}>
          <DayProgress entries={view.entries} weekly={data.weekly} />
        </SectionHeader>
      }
    >
      <ScrollView
        {...hiddenScrollIndicators}
        contentContainerStyle={{ gap: theme.space[4], paddingVertical: theme.space[4] }}
        keyboardShouldPersistTaps="handled"
      >
        {firstDay ? <MascotBubble pose="hola" message={t('today.firstBubble')} /> : null}
        {view.allDone ? <MascotBubble pose="descansa" message={t('today.doneBubble')} /> : null}

        <BentoGrid items={tiles} />

        {/* The single card slot (HANDOFF §8): full width, it carries its own actions. */}
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

      <BottomSheet
        visible={askActivity}
        onClose={() => setAskActivity(false)}
        title={t('activity.title')}
        closeLabel={t('quickAdd.close')}
      >
        <ActivityCard
          answer={data.activityToday}
          onAnswer={(kind) => {
            setAskActivity(false);
            void today.answerActivity(kind);
          }}
        />
      </BottomSheet>
    </Screen>
  );
}
