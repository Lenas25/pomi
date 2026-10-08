import { useEffect } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Star, WarningCircle, Info } from 'phosphor-react-native';

import type { MascotPose } from './assets';
import { Mascot } from './Mascot';
import { useTheme } from './theme';

export type ToastVariant = 'routineComplete' | 'info' | 'error';

type ToastProps = {
  variant: ToastVariant;
  title: string;
  subtitle?: string;
  pose?: MascotPose;
  /** Called after the exit animation (the toast leaves 3 s after entering). */
  onHide?: () => void;
};

const VISIBLE_MS = 3000;
const EXIT_MS = 200;
const ENTER_MS = 280;

/** Top toast (HANDOFF §4, §7): enters from above with a slight bounce, leaves after 3 s. */
export function Toast({ variant, title, subtitle, pose, onHide }: ToastProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const visible = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(subtitle ? `${title}. ${subtitle}` : title);
    visible.value = reduceMotion
      ? withTiming(1, { duration: theme.motion.reducedFade })
      : withSpring(1, {
          damping: theme.motion.spring.damping,
          stiffness: theme.motion.spring.stiffness,
        });
    const timeout = setTimeout(() => {
      visible.value = withSequence(
        withTiming(0, {
          duration: reduceMotion ? theme.motion.reducedFade : EXIT_MS,
          easing: Easing.in(Easing.ease),
        }),
      );
      if (onHide) setTimeout(onHide, reduceMotion ? theme.motion.reducedFade : EXIT_MS);
    }, VISIBLE_MS + ENTER_MS);
    return () => clearTimeout(timeout);
    // The toast animates once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, visible.value),
    transform: [{ translateY: reduceMotion ? 0 : (visible.value - 1) * theme.space[12] }],
  }));

  const Glyph = variant === 'routineComplete' ? Star : variant === 'error' ? WarningCircle : Info;
  const glyphColor =
    variant === 'routineComplete'
      ? theme.color.celebrate
      : variant === 'error'
        ? theme.color.error
        : theme.color.info;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          backgroundColor: theme.color.surfaceRaised,
          borderRadius: theme.radius.lg,
          padding: theme.space[4],
          ...theme.shadow.raised,
          ...(theme.mode === 'dark'
            ? { borderWidth: theme.stroke.hairline, borderColor: theme.color.border }
            : null),
        },
        animated,
      ]}
    >
      <Glyph weight="fill" color={glyphColor} size={theme.icon.size + theme.space[2]} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {pose ? <Mascot pose={pose} size="sm" /> : null}
    </Animated.View>
  );
}
