// Notifications, exact alarms and battery, each with its explanation. Shared by the onboarding
// (Q12) and Ajustes > Permisos y avisos.
import { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Alarm, BatteryCharging, Bell } from 'phosphor-react-native';

import { getRepositories } from '../db';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { InfoButton } from '../ui/InfoButton';
import { useTheme } from '../ui/theme';

import {
  exactAlarmsApply,
  getNotificationPermission,
  openBatterySettings,
  openExactAlarmSettings,
  openNotificationSettings,
  requestNotificationPermission,
  type NotificationPermissionState,
} from './permissions';
import { requestNotificationSync } from './sync';

type PermissionsPanelProps = {
  /** The brand-by-brand battery guide is a route of the app, not available during the onboarding. */
  showBatteryGuide?: boolean;
};

export function PermissionsPanel({ showBatteryGuide = true }: PermissionsPanelProps) {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const [permission, setPermission] = useState<NotificationPermissionState | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [openFailed, setOpenFailed] = useState(false);

  const apply = useCallback(
    (current: { state: NotificationPermissionState; canAskAgain: boolean }) => {
      setPermission(current.state);
      setCanAskAgain(current.canAskAgain);
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      apply(await getNotificationPermission());
    } catch {
      setPermission(null);
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      getNotificationPermission()
        .then((current) => {
          if (alive) apply(current);
        })
        .catch(() => undefined);
    };
    read();
    // Coming back from the system settings: read the state again.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [apply]);

  const remember = (key: 'alarms' | 'battery') => {
    void (async () => {
      try {
        const repos = getRepositories();
        const hints = (await repos.settings.get('permissionHints')) ?? {};
        await repos.settings.set('permissionHints', { ...hints, [key]: true });
      } catch {
        // A hint only; nothing depends on it.
      }
    })();
  };

  const open = async (action: () => Promise<boolean>, hint?: 'alarms' | 'battery') => {
    setOpenFailed(!(await action()));
    if (hint) remember(hint);
  };

  const allow = async () => {
    if (permission === 'undetermined' && canAskAgain) {
      const granted = await requestNotificationPermission(t);
      await refresh();
      if (granted) void requestNotificationSync('settingsChanged');
    } else {
      await open(openNotificationSettings);
    }
  };

  const statusKey =
    permission === 'granted'
      ? 'permissions.notifications.granted'
      : permission === 'denied'
        ? 'permissions.notifications.denied'
        : 'permissions.notifications.undetermined';

  const title = (text: string, info?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-sm'), { color: theme.color.text, flex: 1 }]}
      >
        {text}
      </Text>
      {info ? <InfoButton title={text} body={info} /> : null}
    </View>
  );
  const body = (text: string, muted = false) => (
    <Text style={[theme.text('body'), { color: muted ? theme.color.textMuted : theme.color.text }]}>
      {text}
    </Text>
  );

  return (
    <View style={{ gap: theme.space[3] }}>
      <Card>
        <View style={{ gap: theme.space[2] }}>
          {title(t('permissions.notifications.title'))}
          {body(t('permissions.notifications.body'))}
          {permission === null ? null : body(t(statusKey), true)}
          {permission === 'granted' ? null : (
            <Button
              label={
                permission === 'undetermined' && canAskAgain
                  ? t('permissions.notifications.allow')
                  : t('permissions.notifications.openSettings')
              }
              icon={Bell}
              onPress={() => void allow()}
            />
          )}
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.space[2] }}>
          {title(t('permissions.alarms.title'), t('permissions.alarms.info'))}
          {body(t('permissions.alarms.body'))}
          {exactAlarmsApply() ? (
            <>
              <Button
                label={t('permissions.alarms.open')}
                icon={Alarm}
                variant="secondary"
                onPress={() => void open(openExactAlarmSettings, 'alarms')}
              />
            </>
          ) : (
            body(t('permissions.alarms.unsupported'), true)
          )}
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.space[2] }}>
          {title(t('permissions.battery.title'), t('permissions.battery.info'))}
          {body(t('permissions.battery.body'))}
          <Button
            label={t('permissions.battery.open')}
            icon={BatteryCharging}
            variant="secondary"
            onPress={() => void open(openBatterySettings, 'battery')}
          />
          {showBatteryGuide ? (
            <Button
              label={t('permissions.battery.guide')}
              variant="ghost"
              onPress={() => router.push('/bateria')}
            />
          ) : null}
        </View>
      </Card>

      {openFailed ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('caption'), { color: theme.color.error }]}
        >
          {t('permissions.openFailed')}
        </Text>
      ) : null}
    </View>
  );
}
