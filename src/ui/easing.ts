import { Easing, type EasingFunction, type EasingFunctionFactory } from 'react-native-reanimated';

/** Builds a reanimated easing from a `motion.easing.*` token (`[x1, y1, x2, y2]`). */
export function bezierFromToken(values: readonly number[]): EasingFunction | EasingFunctionFactory {
  const [x1, y1, x2, y2] = values;
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return Easing.out(Easing.ease);
  }
  return Easing.bezier(x1, y1, x2, y2);
}
