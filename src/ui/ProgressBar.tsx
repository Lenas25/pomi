import { Text, View } from 'react-native';

import { useTheme } from './theme';

type ProgressBarProps = {
  current: number;
  total: number;
  /** Already-translated text such as "Pregunta 3 de 12". */
  label: string;
};

/** Static (no animation, so reduce-motion needs no special case) progress bar with a text label. */
export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const theme = useTheme();
  const ratio = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: current }}
      style={{ gap: theme.space[1] }}
    >
      <View
        style={{
          height: theme.space[2],
          borderRadius: theme.radius.pill,
          backgroundColor: theme.color.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.brand,
          }}
        />
      </View>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>{label}</Text>
    </View>
  );
}
