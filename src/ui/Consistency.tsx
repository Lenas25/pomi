import { Text, View } from 'react-native';

import { useTheme } from './theme';

type ConsistencyProps = {
  done: number;
  total: number;
  /** Already translated, e.g. "8 de los últimos 10 días". Also the spoken description. */
  label: string;
  /** Optional per-day flags (oldest first) to place the filled dots where the days were. */
  days?: readonly boolean[];
};

/**
 * "X de los últimos 10 días" (HANDOFF §4): small dots, filled for the days done. It is NOT a
 * streak: a missed day is just an empty dot, nothing resets.
 */
export function Consistency({ done, total, label, days }: ConsistencyProps) {
  const theme = useTheme();
  const filled = (index: number) => (days ? days[index] === true : index < done);
  return (
    <View accessible accessibilityLabel={label} style={{ gap: theme.space[1] }}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', gap: theme.space[1] }}
      >
        {Array.from({ length: total }, (_unused, index) => (
          <View
            key={index}
            style={{
              width: theme.space[2],
              height: theme.space[2],
              borderRadius: theme.radius.pill,
              borderWidth: theme.stroke.hairline,
              borderColor: filled(index) ? theme.color.brand : theme.color.textMuted,
              backgroundColor: filled(index) ? theme.color.brand : theme.color.transparent,
            }}
          />
        ))}
      </View>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
    </View>
  );
}
