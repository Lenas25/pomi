import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Pause, Play, SkipForward, X, type Icon } from 'phosphor-react-native';

import { useT } from '../i18n';
import { formatClock, remainingSec } from '../timers/timerModel';
import type { ActiveTimer } from '../timers/timerStore';
import { useNow } from '../timers/useNow';

import { bezierFromToken } from './easing';
import { TimerRing, useSpokenDuration } from './TimerRing';
import { useTheme } from './theme';

type TimerBarProps = {
  timer: ActiveTimer;
  onPause: () => void;
  onResume: () => void;
  onAddTime: () => void;
  onSkip: () => void;
  onClose: () => void;
};

/**
 * Compact full-width bar pinned under the session content while a timer runs (it takes layout
 * space, so it never covers the set rows): remaining time (tabular), the next set, and 48 dp
 * Pausar / +30 s / Saltar. Tapping the time expands the ring view. Fades / slides in (120 ms fade
 * only with reduce motion).
 */
export function TimerBar({ timer, onPause, onResume, onAddTime, onSkip, onClose }: TimerBarProps) {
  const theme = useTheme();
  const t = useT();
  const spoken = useSpokenDuration();
  const reduceMotion = useReducedMotion();
  const entered = useSharedValue(0);
  const [expanded, setExpanded] = useState(false);
  // The 250 ms clock lives HERE, so only the bar re-renders on a tick (not the whole session).
  const now = useNow(timer.state.status === 'running');

  useEffect(() => {
    entered.value = withTiming(1, {
      duration: reduceMotion ? theme.motion.reducedFade : theme.motion.base,
      easing: bezierFromToken(theme.motion.easing.out),
    });
  }, [entered, reduceMotion, theme.motion]);

  const animated = useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - entered.value) * theme.space[6] }],
  }));

  const { state } = timer;
  const finished = state.status === 'finished';
  const paused = state.status === 'paused';
  const left = remainingSec(state, now);
  const kindName = t(`timers.kind.${timer.kind}`);
  const status = finished
    ? t('timers.finishedLabel', { kind: kindName })
    : t(paused ? 'timers.pausedLabel' : 'timers.remainingLabel', {
        kind: kindName,
        time: spoken(left),
      });
  const next = timer.nextLabel ? t('timers.next', { label: timer.nextLabel }) : null;

  const control = (
    key: string,
    label: string,
    onPress: () => void,
    ControlIcon: Icon | null,
    text?: string,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: theme.touch.gym,
        height: theme.touch.gym,
        paddingHorizontal: ControlIcon ? 0 : theme.space[2],
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surface,
        borderWidth: theme.stroke.hairline,
        borderColor: theme.color.border,
        opacity: pressed ? theme.opacity.pressed : 1,
      })}
    >
      {ControlIcon ? <ControlIcon weight="bold" color={theme.color.text} /> : null}
      {text ? (
        <Text numberOfLines={1} style={[theme.text('body-strong'), { color: theme.color.text }]}>
          {text}
        </Text>
      ) : null}
    </Pressable>
  );

  return (
    <Animated.View
      testID="timer-bar"
      style={[
        {
          width: '100%',
          backgroundColor: theme.color.surfaceRaised,
          borderTopWidth: theme.stroke.hairline,
          borderTopColor: theme.color.border,
          paddingHorizontal: theme.space[4],
          paddingVertical: theme.space[2],
          gap: theme.space[2],
        },
        animated,
      ]}
    >
      {expanded ? (
        <View style={{ alignItems: 'center' }}>
          <TimerRing kind={timer.kind} state={state} now={now} segments={timer.segments} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={next ? `${status}. ${next}` : status}
          accessibilityHint={t('timers.ringToggle')}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={{ flex: 1, minHeight: theme.touch.gym, justifyContent: 'center' }}
        >
          <Text
            numberOfLines={1}
            style={[
              theme.text('metric-sm'),
              { color: finished ? theme.color.success : theme.color.text },
            ]}
          >
            {finished ? t('timers.done') : formatClock(left)}
          </Text>
          {timer.nextLabel ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[theme.text('caption'), { color: theme.color.textMuted }]}
            >
              {timer.nextLabel}
            </Text>
          ) : null}
        </Pressable>
        {finished
          ? control('close', t('timers.close'), onClose, X)
          : [
              paused
                ? control('resume', t('timers.resume'), onResume, Play)
                : control('pause', t('timers.pause'), onPause, Pause),
              control('add', t('timers.addLabel'), onAddTime, null, t('timers.add')),
              control('skip', t('timers.skip'), onSkip, SkipForward),
            ]}
      </View>
    </Animated.View>
  );
}
