import { View } from 'react-native';

import { useTheme } from './theme';

/** A static placeholder block (no shimmer, so there is nothing to reduce). */
export function Skeleton({ height }: { height: number }) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        height,
        width: '100%',
        borderRadius: theme.radius.md,
        backgroundColor: theme.color.border,
        opacity: theme.opacity.done,
      }}
    />
  );
}
