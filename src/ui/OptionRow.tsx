import { Pressable, Text } from 'react-native';
import { CheckCircle, RadioButton } from 'phosphor-react-native';

import { useTheme } from './theme';

type OptionRowProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** A single-choice row (radio). At least 48 dp tall, with the state exposed to screen readers. */
export function OptionRow({ label, selected, onPress }: OptionRowProps) {
  const theme = useTheme();
  const IconComponent = selected ? CheckCircle : RadioButton;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: Math.max(theme.control.md, theme.touch.gym),
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[3],
        borderRadius: theme.radius.md,
        borderWidth: theme.stroke.bold,
        borderColor: selected ? theme.color.brand : theme.color.border,
        backgroundColor: selected ? theme.color.brandSoft : theme.color.surface,
        opacity: pressed ? theme.opacity.pressed : 1,
      })}
    >
      <IconComponent
        color={selected ? theme.color.brand : theme.color.textMuted}
        weight={selected ? 'fill' : 'bold'}
      />
      <Text style={[theme.text('body'), { color: theme.color.text, flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}
