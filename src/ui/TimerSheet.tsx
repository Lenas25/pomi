import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Pause, Play, Plus, SkipForward, X } from 'phosphor-react-native';

import { useT } from '../i18n';
import type { ActiveTimer } from '../timers/timerStore';

import { Button } from './Button';
import { bezierFromToken } from './easing';
import { TimerRing } from './TimerRing';
import { useTheme } from './theme';

type TimerSheetProps = {
  timer: ActiveTimer;
  now: number;
  onPause: () => void;
  onResume: () => void;
  onAddTime: () => void;
  onSkip: () => void;
  onClose: () => void;
  onLayoutHeight?: (height: number) => void;
};

/**
 * Bottom sheet fixed while a timer runs (HANDOFF §4): ring + "Siguiente: …" + Pausar / +30 s /
 * Saltar, every control 48 dp. Slides up in 240 ms (a 120 ms fade with reduce-motion).
 */
export function TimerSheet({
  timer,
  now,
  onPause,
  onResume,
  onAddTime,
  onSkip,
  onClose,
  onLayoutHeight,
}: TimerSheetProps) {
  const theme = useTheme();
  const t = useT();
  const reduceMotion = useReducedMotion();
  const entered = useSharedValue(0);

  useEffect(() => {
    entered.value = withTiming(1, {
      duration: reduceMotion ? theme.motion.reducedFade : theme.motion.base,
      easing: bezierFromToken(theme.motion.easing.out),
    });
  }, [entered, reduceMotion, theme.motion]);

  const animated = useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - entered.value) * theme.ring.size }],
  }));

  const { state } = timer;
  const finished = state.status === 'finished';
  const paused = state.status === 'paused';

  return (
    <Animated.View
      onLayout={(event) => onLayoutHeight?.(event.nativeEvent.layout.height)}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          alignSelf: 'center',
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          backgroundColor: theme.color.surfaceRaised,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          padding: theme.space[4],
          ...theme.shadow.raised,
          ...(theme.mode === 'dark'
            ? { borderTopWidth: theme.stroke.hairline, borderColor: theme.color.border }
            : null),
        },
        animated,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[4] }}>
        <TimerRing kind={timer.kind} state={state} now={now} segments={timer.segments} />
        <View style={{ flex: 1, gap: theme.space[2] }}>
          {timer.nextLabel ? (
            <Text
              numberOfLines={2}
              style={[theme.text('body-strong'), { color: theme.color.text }]}
            >
              {t('timers.next', { label: timer.nextLabel })}
            </Text>
          ) : null}
          {finished ? (
            <Button label={t('timers.close')} icon={X} variant="secondary" onPress={onClose} />
          ) : (
            <>
              <Button
                label={paused ? t('timers.resume') : t('timers.pause')}
                icon={paused ? Play : Pause}
                onPress={paused ? onResume : onPause}
              />
              <Button label={t('timers.add')} icon={Plus} variant="secondary" onPress={onAddTime} />
              <Button
                label={t('timers.skip')}
                icon={SkipForward}
                variant="ghost"
                onPress={onSkip}
              />
            </>
          )}
        </View>
      </View>
    </Animated.View>
  );
}
