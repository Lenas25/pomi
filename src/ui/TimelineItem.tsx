import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Check } from 'phosphor-react-native';

import { isSwipeDone } from '../domain/today/timeline';

import { useTheme } from './theme';

export type TimelineItemStatus = 'upcoming' | 'now' | 'done' | 'skipped';

type TimelineItemProps = {
  status: TimelineItemStatus;
  /** Already formatted, `null` for all-day items. */
  time: string | null;
  title: string;
  subtitle?: string;
  /** Highlighted line (energy color), e.g. today's goal on the gym row. */
  highlight?: string;
  /** Spoken description of the whole row (time, title and status). */
  accessibilityLabel: string;
  /** Spoken name of the check button; it states the state ("Marcar «Gym» como hecho" / "«Gym», hecho"). */
  checkLabel: string;
  /** Names of the screen-reader actions on the row. */
  actionLabels: { done: string; postpone: string; skip: string };
  onPress: () => void;
  /** The 48 dp check button and the swipe right. */
  onCheck: () => void;
  /** Long press: the options (postpone, skip). */
  onLongPress: () => void;
  /** Direct screen-reader actions (no long press needed). */
  onPostpone: () => void;
  onSkip: () => void;
};

/**
 * One row of the Hoy timeline (HANDOFF §4, §6). `now`: brand border and the time in the energy
 * color; `done`: 50% opacity and struck through; `skipped`: muted. Swipe right = done (the check
 * button is the alternative), long press = options.
 */
export function TimelineItem({
  status,
  time,
  title,
  subtitle,
  highlight,
  accessibilityLabel,
  checkLabel,
  actionLabels,
  onPress,
  onCheck,
  onLongPress,
  onPostpone,
  onSkip,
}: TimelineItemProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // The drag follows the finger on the JS thread (a short, local gesture): core Animated is enough.
  const [offset] = useState(() => new Animated.Value(0));
  // The gesture reads the latest `onCheck` from a ref, so a new handler does not rebuild the
  // PanResponder (the ref is only read inside the gesture callbacks, never during render).
  const onCheckRef = useRef(onCheck);
  useEffect(() => {
    onCheckRef.current = onCheck;
  }, [onCheck]);
  const finished = status === 'done';
  const muted = status === 'skipped';

  const settle = useMemo(
    () => () =>
      Animated.timing(offset, {
        toValue: 0,
        duration: theme.motion.fast,
        useNativeDriver: true,
      }).start(),
    [offset, theme.motion.fast],
  );

  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- the ref is read only inside the gesture callbacks
      PanResponder.create({
        // Only a mostly horizontal drag takes over, so the list keeps scrolling vertically.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
        onPanResponderMove: (_event, gesture) => {
          if (!reduceMotion) offset.setValue(Math.max(0, gesture.dx));
        },
        onPanResponderRelease: (_event, gesture) => {
          settle();
          if (isSwipeDone(gesture.dx, gesture.dy)) onCheckRef.current();
        },
        onPanResponderTerminate: settle,
      }),
    [offset, reduceMotion, settle],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          minHeight: theme.touch.gym,
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.md,
          borderWidth: status === 'now' ? theme.stroke.bold : theme.stroke.hairline,
          borderColor: status === 'now' ? theme.color.brand : theme.color.border,
          paddingLeft: theme.space[3],
          opacity: finished ? theme.opacity.done : 1,
        },
        { transform: [{ translateX: offset }] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[
          { name: 'done', label: actionLabels.done },
          { name: 'postpone', label: actionLabels.postpone },
          { name: 'skip', label: actionLabels.skip },
        ]}
        onAccessibilityAction={(event) => {
          switch (event.nativeEvent.actionName) {
            case 'done':
              onCheck();
              break;
            case 'postpone':
              onPostpone();
              break;
            case 'skip':
              onSkip();
              break;
          }
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}
      >
        <Text
          numberOfLines={1}
          testID="timeline-time"
          style={[
            theme.text('caption'),
            {
              // Never a fixed width: "07:40" must fit at any system font scale.
              minWidth: theme.timeline.timeColumn * Math.max(1, fontScale),
              fontVariant: ['tabular-nums'],
              color: status === 'now' ? theme.color.energyText : theme.color.textMuted,
            },
          ]}
        >
          {time ?? ''}
        </Text>
        <View style={{ flex: 1, paddingVertical: theme.space[2] }}>
          <Text
            numberOfLines={2}
            style={[
              theme.text('body-strong'),
              {
                color: muted ? theme.color.textMuted : theme.color.text,
                textDecorationLine: finished ? 'line-through' : 'none',
              },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
          {highlight ? (
            <Text
              numberOfLines={3}
              style={[theme.text('caption'), { color: theme.color.energyText }]}
            >
              {highlight}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={checkLabel}
        onPress={onCheck}
        style={{
          width: theme.touch.gym,
          height: theme.touch.gym,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: theme.space[8],
            height: theme.space[8],
            borderRadius: theme.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: theme.stroke.bold,
            borderColor: finished ? theme.color.success : theme.color.border,
            backgroundColor: finished ? theme.color.success : theme.color.surface,
          }}
        >
          <Check weight="bold" color={finished ? theme.color.onPrimary : theme.color.textMuted} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
