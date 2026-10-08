import { useEffect, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { bezierFromToken } from './easing';
import { useTheme } from './theme';

/** Fades its children in (240 ms; 120 ms with reduce motion, HANDOFF §7). No movement. */
export function FadeIn({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const visible = useSharedValue(0);
  useEffect(() => {
    visible.value = withTiming(1, {
      duration: reduceMotion ? theme.motion.reducedFade : theme.motion.base,
      easing: bezierFromToken(theme.motion.easing.out),
    });
  }, [visible, reduceMotion, theme.motion]);
  const style = useAnimatedStyle(() => ({ opacity: visible.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
