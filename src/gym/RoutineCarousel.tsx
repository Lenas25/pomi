import { useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Barbell, Play } from 'phosphor-react-native';

import { useLocaleStore, useT } from '../i18n';
import { useTemplateText } from '../i18n/templateText';
import { Button } from '../ui/Button';
import { hiddenScrollIndicators } from '../ui/scroll';
import { useTheme } from '../ui/theme';
import { carouselOrder, type GymProgram } from './program';
import { localizeTargetParams } from './sessionViewModel';
import type { GymGoal } from '../today/gymGoal';

type Routine = GymProgram['routines'][number];

type RoutineCarouselProps = {
  routines: readonly Routine[];
  /** Next routine by rotation: shown first with the "Sugerida" badge. */
  suggestedId: string | null;
  /** Routine of today's unfinished session ("Continuar"). */
  resumableId: string | null;
  goals: Readonly<Record<string, GymGoal>>;
  onStart: (routineId: string) => void;
};

/** Number of `sets` exercises of a routine. */
function exerciseCount(routine: Routine): number {
  return routine.steps.filter((step) => step.type === 'sets').length;
}

/**
 * Swipeable cards of every routine of the program (suggested first). Each card: name, exercise
 * count, the "meta de hoy" of its first main exercise and Empezar / Continuar. Only the current
 * card is exposed to the screen reader, with previous / next actions; a change is announced.
 */
export function RoutineCarousel({
  routines,
  suggestedId,
  resumableId,
  goals,
  onStart,
}: RoutineCarouselProps) {
  const theme = useTheme();
  const t = useT();
  const text = useTemplateText();
  const language = useLocaleStore((state) => state.language);
  const reduceMotion = useReducedMotion();
  const window = useWindowDimensions();
  const colors = theme.section.gym;
  const gap = theme.space[3];
  const [width, setWidth] = useState(
    Math.min(window.width, theme.layout.maxContentWidth) - theme.space[5] * 2,
  );
  const [current, setCurrent] = useState(0);
  const listRef = useRef<FlatList<Routine>>(null);

  const byId = new Map(routines.map((routine) => [routine.id, routine]));
  const ordered = carouselOrder(
    routines.map((routine) => routine.id),
    suggestedId,
  ).flatMap((id) => {
    const routine = byId.get(id);
    return routine ? [routine] : [];
  });
  const total = ordered.length;
  const interval = width + gap;

  const select = (index: number, scroll: boolean) => {
    const next = Math.max(0, Math.min(total - 1, index));
    if (scroll)
      listRef.current?.scrollToOffset({ offset: next * interval, animated: !reduceMotion });
    if (next === current) return;
    setCurrent(next);
    const routine = ordered[next];
    if (routine) {
      AccessibilityInfo.announceForAccessibility(
        t('gym.hub.carouselPosition', { name: text(routine.name), index: next + 1, total }),
      );
    }
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval <= 0) return;
    select(Math.round(event.nativeEvent.contentOffset.x / interval), false);
  };

  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'next') select(current + 1, true);
    if (event.nativeEvent.actionName === 'previous') select(current - 1, true);
  };

  const renderItem = ({ item, index }: { item: Routine; index: number }) => {
    const suggested = item.id === suggestedId;
    const resuming = item.id === resumableId;
    const goal = goals[item.id];
    const count = t('gym.tab.exercises', { count: exerciseCount(item) });
    const goalText = goal
      ? t(goal.message.key, localizeTargetParams(goal.message.params, language))
      : null;
    const name = text(item.name);
    const detail = goalText ? `${count}. ${goalText}` : count;
    const isCurrent = index === current;
    return (
      <View
        testID={`routine-card-${item.id}`}
        accessibilityElementsHidden={!isCurrent}
        importantForAccessibility={isCurrent ? 'auto' : 'no-hide-descendants'}
        style={{
          width,
          borderRadius: theme.radius.lg,
          padding: theme.space[4],
          gap: theme.space[3],
          backgroundColor: colors.fill,
        }}
      >
        <View
          accessible
          accessibilityLabel={t(suggested ? 'gym.hub.cardLabelSuggested' : 'gym.hub.cardLabel', {
            name,
            index: index + 1,
            total,
            detail,
          })}
          accessibilityActions={[
            ...(index > 0 ? [{ name: 'previous', label: t('gym.hub.carouselPrevious') }] : []),
            ...(index < total - 1 ? [{ name: 'next', label: t('gym.hub.carouselNext') }] : []),
          ]}
          onAccessibilityAction={onAction}
          style={{ flexGrow: 1, gap: theme.space[1] }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
            <Barbell weight="fill" color={colors.onFill} />
            <Text
              numberOfLines={1}
              style={[theme.text('body-strong'), { color: colors.onFill, flex: 1 }]}
            >
              {resuming ? t('gym.tab.inProgress') : count}
            </Text>
            {suggested ? (
              <View
                style={{
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: theme.space[2],
                  backgroundColor: colors.onFill,
                }}
              >
                <Text numberOfLines={1} style={[theme.text('caption'), { color: colors.fill }]}>
                  {t('gym.hub.suggested')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={2} style={[theme.text('title-lg'), { color: colors.onFill }]}>
            {name}
          </Text>
          {goal ? (
            <Text numberOfLines={1} style={[theme.text('caption'), { color: colors.onFill }]}>
              {t('gym.hub.goalTitle', { exercise: goal.exercise })}
            </Text>
          ) : null}
          {goalText ? (
            <Text numberOfLines={3} style={[theme.text('body'), { color: colors.onFill }]}>
              {goalText}
            </Text>
          ) : null}
        </View>
        <Button
          label={t(resuming ? 'gym.tab.resume' : 'gym.tab.start')}
          size="lg"
          variant="energy"
          icon={Play}
          onPress={() => onStart(item.id)}
        />
      </View>
    );
  };

  return (
    <View
      testID="routine-carousel"
      accessibilityLabel={t('gym.hub.carouselLabel')}
      style={{ gap: theme.space[3] }}
      onLayout={(event) => {
        const measured = event.nativeEvent.layout.width;
        if (measured > 0 && measured !== width) setWidth(measured);
      }}
    >
      <FlatList
        {...hiddenScrollIndicators}
        ref={listRef}
        data={ordered}
        keyExtractor={(routine) => routine.id}
        renderItem={renderItem}
        extraData={[current, width, goals, resumableId, language]}
        horizontal
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate={reduceMotion ? 'normal' : 'fast'}
        disableIntervalMomentum
        contentContainerStyle={{ gap }}
        onMomentumScrollEnd={onScrollEnd}
      />
      {total > 1 ? (
        <View
          testID="routine-dots"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.space[2] }}
        >
          {ordered.map((routine, index) => (
            <View
              key={routine.id}
              style={{
                width: index === current ? theme.space[5] : theme.space[2],
                height: theme.space[2],
                borderRadius: theme.radius.pill,
                backgroundColor: index === current ? colors.text : theme.color.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
