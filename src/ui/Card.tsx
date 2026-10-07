import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from './theme';
import { usePressScale } from './usePressScale';

export type CardVariant = 'default' | 'highlight' | 'celebrate';

type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  accessibilityLabel?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({ children, variant = 'default', onPress, accessibilityLabel }: CardProps) {
  const theme = useTheme();
  const press = usePressScale(theme.motion.pressScale.card);

  const container: ViewStyle = {
    backgroundColor: variant === 'highlight' ? theme.color.brandSoft : theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space[4],
    ...theme.shadow.soft,
    // Dark mode has no shadow: surfaces are separated with a border instead.
    ...(theme.mode === 'dark'
      ? { borderWidth: theme.stroke.hairline, borderColor: theme.color.border }
      : null),
    ...(variant === 'celebrate'
      ? { borderLeftWidth: theme.stroke.accent, borderLeftColor: theme.color.celebrate }
      : null),
  };

  if (!onPress) return <View style={container}>{children}</View>;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[container, press.animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
