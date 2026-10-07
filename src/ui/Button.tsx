import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Icon } from 'phosphor-react-native';

import { useTheme } from './theme';
import { usePressScale } from './usePressScale';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
  const press = usePressScale(theme.motion.pressScale.button, theme.opacity.pressed);
  const inactive = disabled || loading;

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
    ghost: { background: 'transparent', foreground: theme.color.text },
    danger: { background: theme.color.error, foreground: theme.color.onPrimary },
  };
  const { background, foreground, border } = palette[variant];

  const container: ViewStyle = {
    minHeight: theme.control[size],
    minWidth: theme.touch.min,
    borderRadius: theme.radius.pill,
    backgroundColor: background,
    borderColor: border ?? 'transparent',
    borderWidth: theme.stroke.hairline,
    paddingHorizontal: theme.space[6],
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? theme.opacity.disabled : 1,
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      <View style={container}>
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
      </View>
    </AnimatedPressable>
  );
}
