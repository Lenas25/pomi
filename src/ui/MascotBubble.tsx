import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { MascotPose } from './assets';
import { Mascot, type MascotSize } from './Mascot';
import { useTheme } from './theme';

type MascotBubbleProps = {
  pose: MascotPose;
  /** Max 40 characters (BRAND §9). Must come from i18n. */
  message: string;
  size?: MascotSize;
};

/** Mascot plus speech bubble. The mascot is decorative; the message is read by screen readers. */
export function MascotBubble({ pose, message, size = 'md' }: MascotBubbleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: reduceMotion ? theme.motion.reducedFade : theme.motion.base,
    });
  }, [progress, reduceMotion, theme.motion.base, theme.motion.reducedFade]);

  const appear = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Rises by `space-3` on appear; reduce-motion keeps only the fade.
    transform: [{ translateY: reduceMotion ? 0 : (1 - progress.value) * theme.space[3] }],
  }));

  return (
    <Animated.View style={[{ alignItems: 'center', gap: theme.space[2] }, appear]}>
      <Mascot pose={pose} size={size} />
      <View
        style={{
          backgroundColor: theme.color.surfaceRaised,
          borderColor: theme.color.text,
          borderWidth: theme.stroke.bold,
          borderRadius: theme.radius.lg,
          paddingHorizontal: theme.space[4],
          paddingVertical: theme.space[3],
        }}
      >
        <Text style={[theme.text('body'), { color: theme.color.text, textAlign: 'center' }]}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
