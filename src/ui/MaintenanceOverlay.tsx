import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

import { useMaintenanceStore } from '../db/maintenance';
import { useT } from '../i18n';

import { Button } from './Button';
import { Mascot } from './Mascot';
import { useTheme } from './theme';

/** After this long the overlay admits the restore is slow (a big backup on a slow phone). */
export const MAINTENANCE_SLOW_MS = 15_000;
/**
 * After this long the person can hide the overlay. The restore keeps running (it cannot be
 * cancelled: it is one transaction); hiding only guarantees they are never trapped behind a
 * full-screen modal if something hangs.
 */
export const MAINTENANCE_HIDEABLE_MS = 60_000;

export type MaintenanceStage = 'busy' | 'slow' | 'hideable';

/** Pure: what the overlay says after `elapsedMs` of maintenance. */
export function maintenanceStage(elapsedMs: number): MaintenanceStage {
  if (elapsedMs >= MAINTENANCE_HIDEABLE_MS) return 'hideable';
  return elapsedMs >= MAINTENANCE_SLOW_MS ? 'slow' : 'busy';
}

/**
 * Full-screen busy state while a restore replaces every table. It is a Modal so it also covers
 * pushed screens and swallows touches; the Android back button is ignored until it is done, with
 * the timeout fallback above.
 *
 * Known gap: the overlay appears the moment the restore is REQUESTED, but the repository gate only
 * goes up once the transactions already running have finished (see `runMaintenance`). In that
 * short window the screen is covered while the old work completes; nothing new is gated yet, but
 * every new top-level transaction queues behind the restore anyway.
 */
export function MaintenanceOverlay() {
  const active = useMaintenanceStore((state) => state.active);
  const since = useMaintenanceStore((state) => state.since);
  const theme = useTheme();
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  // The run (`since`) the person chose to hide the overlay for; a new run shows it again.
  const [hiddenFor, setHiddenFor] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [active]);

  const stage = since === null ? 'busy' : maintenanceStage(Math.max(0, now - since));
  const hidden = since !== null && hiddenFor === since;

  return (
    <Modal
      visible={active && !hidden}
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
          {stage === 'busy' ? t('maintenance.body') : t('maintenance.slow')}
        </Text>
        {stage === 'hideable' ? (
          <Button
            label={t('maintenance.hide')}
            variant="ghost"
            onPress={() => setHiddenFor(since)}
          />
        ) : null}
      </View>
    </Modal>
  );
}
