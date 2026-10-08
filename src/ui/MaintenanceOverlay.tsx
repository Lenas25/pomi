import { ActivityIndicator, Modal, Text, View } from 'react-native';

import { useMaintenanceStore } from '../db/maintenance';
import { useT } from '../i18n';

import { Mascot } from './Mascot';
import { useTheme } from './theme';

/**
 * Full-screen busy state while a restore replaces every table. It is a Modal so it also covers
 * pushed screens and swallows touches; the Android back button is ignored until it is done.
 */
export function MaintenanceOverlay() {
  const active = useMaintenanceStore((state) => state.active);
  const theme = useTheme();
  const t = useT();
  return (
    <Modal
      visible={active}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.color.bg,
          padding: theme.space[6],
          gap: theme.space[4],
        }}
      >
        <Mascot pose="descansa" size="lg" />
        <ActivityIndicator color={theme.color.primary} size="large" />
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[theme.text('title-sm'), { color: theme.color.text, textAlign: 'center' }]}
        >
          {t('maintenance.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted, textAlign: 'center' }]}>
          {t('maintenance.body')}
        </Text>
      </View>
    </Modal>
  );
}
