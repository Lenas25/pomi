import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './theme';

/**
 * Press feedback in `motion.fast`: scale down and, optionally, dim to `pressedOpacity`.
 * Skipped when reduce-motion is on.
 */
export function usePressScale(targetScale: number, pressedOpacity = 1) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - pressedOpacity),
    transform: [{ scale: 1 - pressed.value * (1 - targetScale) }],
  }));
  const animateTo = (value: 0 | 1) => {
    if (!reduceMotion) pressed.value = withTiming(value, { duration: theme.motion.fast });
  };
  return {
    animatedStyle,
    onPressIn: () => animateTo(1),
    onPressOut: () => animateTo(0),
  };
}
