import { View } from 'react-native';

import { useTheme } from './theme';

const MAX_DOTS = 12;

/** Decorative tile visual: one dot per unit (glasses), filled up to `value`. Max 12 dots. */
export function MiniDots({
  value,
  total,
  color,
  trackColor,
}: {
  value: number;
  total: number;
  color: string;
  trackColor: string;
}) {
  const theme = useTheme();
  const count = Math.min(MAX_DOTS, Math.max(0, total));
  return (
    <View
      testID="mini-dots"
      accessible={false}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[1] }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            width: theme.space[3],
            height: theme.space[3],
            borderRadius: theme.radius.pill,
            backgroundColor: index < value ? color : trackColor,
          }}
        />
      ))}
    </View>
  );
}

/** Decorative tile visual: a thin bar filled to `value / total`. */
export function MiniBar({
  value,
  total,
  color,
  trackColor,
}: {
  value: number;
  total: number;
  color: string;
  trackColor: string;
}) {
  const theme = useTheme();
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <View
      testID="mini-bar"
      accessible={false}
      style={{
        height: theme.space[2],
        borderRadius: theme.radius.pill,
        backgroundColor: trackColor,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.round(ratio * 100)}%`,
          height: '100%',
          borderRadius: theme.radius.pill,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Decorative tile visual: a few vertical bars scaled to the largest value (weekly bars, volume). */
export function MiniBars({
  values,
  color,
  trackColor,
  highlightLast = false,
}: {
  values: readonly number[];
  color: string;
  trackColor: string;
  /** Draws every bar but the last one in `trackColor` (the current week stands out). */
  highlightLast?: boolean;
}) {
  const theme = useTheme();
  const max = Math.max(0, ...values);
  return (
    <View
      testID="mini-bars"
      accessible={false}
      style={{
        height: theme.space[8],
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: theme.space[1],
      }}
    >
      {values.map((value, index) => {
        const ratio = max > 0 ? Math.max(0, value) / max : 0;
        const last = index === values.length - 1;
        return (
          <View
            key={index}
            style={{
              flex: 1,
              height: `${Math.max(8, Math.round(ratio * 100))}%`,
              borderRadius: theme.radius.sm,
              backgroundColor: highlightLast && !last ? trackColor : ratio > 0 ? color : trackColor,
            }}
          />
        );
      })}
    </View>
  );
}
