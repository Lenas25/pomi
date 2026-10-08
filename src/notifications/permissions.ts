// Permission helpers for the permissions screen. Docs used:
// - POST_NOTIFICATIONS / channels: https://docs.expo.dev/versions/latest/sdk/notifications/
// - Exact alarms (SCHEDULE_EXACT_ALARM, ACTION_REQUEST_SCHEDULE_EXACT_ALARM):
//   https://developer.android.com/develop/background-work/services/alarms/schedule
// - expo-intent-launcher: https://docs.expo.dev/versions/latest/sdk/intent-launcher/
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';

import type { Translate } from '../i18n';

import { ensureChannels } from './channels';

const PACKAGE = Constants.expoConfig?.android?.package ?? 'pe.nakea.pomi';

/** SCHEDULE_EXACT_ALARM exists from Android 12 (API 31). */
export const EXACT_ALARM_API = 31;

export function exactAlarmsApply(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= EXACT_ALARM_API;
}

export type NotificationPermissionState = 'granted' | 'denied' | 'undetermined';

export async function getNotificationPermission(): Promise<{
  state: NotificationPermissionState;
  canAskAgain: boolean;
}> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return { state: 'granted', canAskAgain: true };
  const state =
    current.canAskAgain && current.status === 'undetermined' ? 'undetermined' : 'denied';
  return { state, canAskAgain: current.canAskAgain };
}

/** Android 13 needs the channel to exist before the dialog is shown. */
export async function requestNotificationPermission(t: Translate): Promise<boolean> {
  await ensureChannels(t);
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Runs `primary`; if it throws (no such screen on this device), runs `fallback`. */
export async function openWithFallback(
  primary: () => Promise<unknown>,
  fallback: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await primary();
    return true;
  } catch {
    try {
      await fallback();
      return true;
    } catch {
      return false;
    }
  }
}

const openAppSettings = () => Linking.openSettings();

/** The "Alarms & reminders" special access screen of this app (Android 12+). */
export function openExactAlarmSettings(): Promise<boolean> {
  return openWithFallback(
    () =>
      IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
        {
          data: `package:${PACKAGE}`,
        },
      ),
    openAppSettings,
  );
}

/**
 * The list of apps with battery optimization. `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (the direct
 * dialog) would need a restricted permission under Play policy, so the settings list is used.
 */
export function openBatterySettings(): Promise<boolean> {
  return openWithFallback(
    () =>
      IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
      ),
    openAppSettings,
  );
}

export function openNotificationSettings(): Promise<boolean> {
  return openWithFallback(
    () =>
      IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS, {
        extra: { 'android.provider.extra.APP_PACKAGE': PACKAGE },
      }),
    openAppSettings,
  );
}

export type BatteryBrand = 'samsung' | 'xiaomi' | 'huawei' | 'oppo' | 'google' | 'other';

/** Maps `Platform.constants.Manufacturer` to the matching help section. */
export function batteryBrandFor(manufacturer: string | undefined): BatteryBrand {
  const name = (manufacturer ?? '').toLowerCase();
  if (name.includes('samsung')) return 'samsung';
  if (/(xiaomi|redmi|poco)/.test(name)) return 'xiaomi';
  if (/(huawei|honor)/.test(name)) return 'huawei';
  if (/(oppo|realme|oneplus|vivo)/.test(name)) return 'oppo';
  if (name.includes('google')) return 'google';
  return 'other';
}
