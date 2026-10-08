import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './theme';

/**
 * Press feedback in `motion.fast`: scale down and dim to `pressedOpacity`.
 * With reduce-motion on, only the scale is dropped; the opacity dim stays as feedback.
 * `restingOpacity` is the opacity when idle (e.g. disabled), so the component needs a single
 * opacity source.
 */
export function usePressScale(targetScale: number, pressedOpacity = 1, restingOpacity = 1) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const scaleTo = reduceMotion ? 1 : targetScale;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: restingOpacity * (1 - pressed.value * (1 - pressedOpacity)),
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
  }));
  const animateTo = (value: 0 | 1) => {
    pressed.value = withTiming(value, { duration: theme.motion.fast });
  };
  return {
    animatedStyle,
    onPressIn: () => animateTo(1),
    onPressOut: () => animateTo(0),
  };
}
