import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme, type SectionKey } from './theme';
import { usePressScale } from './usePressScale';

/**
 * `hero`: the section color owns the block (text inside uses `section.onFill`).
 * `tint`: the section's soft tint as the surface (text inside uses `section.text` or `color.text`).
 */
export type CardVariant = 'default' | 'highlight' | 'celebrate' | 'hero' | 'tint';

type CardBaseProps = {
  children: ReactNode;
  variant?: CardVariant;
  /** Color of `hero` / `tint` cards (default `hoy`). */
  section?: SectionKey;
};

/** A pressable card is a button: it must say what it does, since its content may be arbitrary. */
type CardProps =
  | (CardBaseProps & { onPress?: undefined; accessibilityLabel?: string })
  | (CardBaseProps & { onPress: () => void; accessibilityLabel: string });

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  children,
  variant = 'default',
  section = 'hoy',
  onPress,
  accessibilityLabel,
}: CardProps) {
  const theme = useTheme();
  const press = usePressScale(theme.motion.pressScale.card);

  const colors = theme.section[section];
  const background =
    variant === 'highlight'
      ? theme.color.brandSoft
      : variant === 'hero'
        ? colors.fill
        : variant === 'tint'
          ? colors.soft
          : theme.color.surface;
  const container: ViewStyle = {
    backgroundColor: background,
    borderRadius: theme.radius.md,
    padding: theme.space[4],
    ...theme.shadow.soft,
    // Dark mode has no shadow: surfaces are separated with a border instead.
    ...(theme.mode === 'dark' && variant !== 'hero'
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
      style={[container, { minHeight: theme.touch.min }, press.animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
