import { Text } from 'react-native';
import { router } from 'expo-router';

import { useT } from '../src/i18n';
import { PermissionsPanel } from '../src/notifications/PermissionsPanel';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { useTheme } from '../src/ui/theme';

/** Ajustes > Permisos y avisos: notifications, exact alarms and battery, each explained. */
export default function Permisos() {
  const t = useT();
  const theme = useTheme();
  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-lg'), { color: theme.color.text, paddingTop: theme.space[4] }]}
      >
        {t('permissions.title')}
      </Text>
      <Text
        style={[
          theme.text('body'),
          { color: theme.color.textMuted, paddingVertical: theme.space[3] },
        ]}
      >
        {t('permissions.intro')}
      </Text>
      <PermissionsPanel />
      <Button label={t('permissions.done')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
