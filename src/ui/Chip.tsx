import { Pressable, Text } from 'react-native';

import { useTheme } from './theme';

type ChipProps = {
  label: string;
  /** Spoken name when the visible label is an abbreviation (e.g. "Lun" -> "lunes"). */
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
};

/** A toggle chip (checkbox semantics) with a 48 dp minimum touch target. */
export function Chip({ label, accessibilityLabel, selected, onPress }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.touch.gym,
        minWidth: theme.touch.gym,
        paddingHorizontal: theme.space[3],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: theme.stroke.bold,
        borderColor: selected ? theme.color.brand : theme.color.border,
        backgroundColor: selected ? theme.color.brandSoft : theme.color.surface,
        opacity: pressed ? theme.opacity.pressed : 1,
      })}
    >
      <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>{label}</Text>
    </Pressable>
  );
}
