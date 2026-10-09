import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Icon } from 'phosphor-react-native';

import { useTheme } from './theme';
import { usePressScale } from './usePressScale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'energy';
export type ButtonSize = 'md' | 'lg';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: Icon;
  loading?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon: IconComponent,
  loading = false,
  disabled = false,
  size = 'md',
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  // Disabled and loading both dim the button; press feedback multiplies on top of that.
  const press = usePressScale(
    theme.motion.pressScale.button,
    theme.opacity.pressed,
    inactive ? theme.opacity.disabled : 1,
  );

  const palette: Record<
    ButtonVariant,
    { background: string; foreground: string; border?: string }
  > = {
    primary: { background: theme.color.primary, foreground: theme.color.onPrimary },
    secondary: {
      background: theme.color.surface,
      foreground: theme.color.text,
      border: theme.color.border,
    },
    ghost: { background: theme.color.transparent, foreground: theme.color.text },
    danger: { background: theme.color.error, foreground: theme.color.onPrimary },
    // The one thumb-zone CTA per screen: coral with navy text (5.70:1).
    energy: { background: theme.color.energyFill, foreground: theme.color.onEnergy },
  };
  const { background, foreground, border } = palette[variant];

  // The Pressable itself is the hit area, so it carries the minimum touch size.
  const container: ViewStyle = {
    minHeight: Math.max(theme.control[size], theme.touch.min),
    minWidth: theme.touch.min,
    borderRadius: theme.radius.pill,
    backgroundColor: background,
    borderColor: border ?? theme.color.transparent,
    borderWidth: theme.stroke.hairline,
    paddingHorizontal: theme.space[6],
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[container, press.animatedStyle]}
    >
      {/* Label stays mounted while loading so the button keeps its width. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
          opacity: loading ? 0 : 1,
        }}
      >
        {IconComponent ? <IconComponent color={foreground} /> : null}
        <Text style={[theme.text('body-strong'), { color: foreground }]}>{label}</Text>
      </View>
      {loading ? (
        <View style={{ position: 'absolute' }}>
          <ActivityIndicator color={foreground} />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}
