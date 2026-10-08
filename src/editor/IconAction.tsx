import { Pressable } from 'react-native';
import type { Icon } from 'phosphor-react-native';

import { useTheme } from '../ui/theme';

type IconActionProps = {
  icon: Icon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
};

/** An icon-only button with the 48 dp gym touch target and a spoken label. */
export function IconAction({
  icon: IconComponent,
  label,
  onPress,
  disabled,
  danger,
}: IconActionProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.touch.gym,
        height: theme.touch.gym,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? theme.opacity.disabled : pressed ? theme.opacity.pressed : 1,
      })}
    >
      <IconComponent color={danger ? theme.color.error : theme.color.text} />
    </Pressable>
  );
}
