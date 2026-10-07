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
};

export function EmptyState({ title, body, pose = 'vacio', action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space[4],
        paddingVertical: theme.space[8],
      }}
    >
      <Mascot pose={pose} size="md" />
      <Text
        accessibilityRole="header"
        style={[theme.text('title-md'), { color: theme.color.text, textAlign: 'center' }]}
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
