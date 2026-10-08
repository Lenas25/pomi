import { Text, View } from 'react-native';

import type { MascotPose } from './assets';
import { Button } from './Button';
import { Mascot } from './Mascot';
import { useTheme } from './theme';

type EmptyStateProps = {
  title: string;
  body: string;
  pose?: MascotPose;
  action?: { label: string; onPress: () => void };
  /** For a section inside a scrolling screen: small mascot, no full-height centering. */
  compact?: boolean;
};

export function EmptyState({
  title,
  body,
  pose = 'vacio',
  action,
  compact = false,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        ...(compact ? null : { flex: 1 }),
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? theme.space[2] : theme.space[4],
        paddingVertical: compact ? theme.space[4] : theme.space[8],
      }}
    >
      <Mascot pose={pose} size={compact ? 'sm' : 'md'} />
      <Text
        accessibilityRole="header"
        style={[
          theme.text(compact ? 'title-sm' : 'title-md'),
          { color: theme.color.text, textAlign: 'center' },
        ]}
      >
        {title}
      </Text>
      <Text style={[theme.text('body'), { color: theme.color.textMuted, textAlign: 'center' }]}>
        {body}
      </Text>
      {action ? <Button label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
