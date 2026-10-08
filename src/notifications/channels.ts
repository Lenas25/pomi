// Android channels of the planned notifications (the timers channel lives in `src/timers`).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import type { Translate } from '../i18n';

import { CHANNEL_IDS } from './constants';

/**
 * Creates the channels. Android freezes importance / sound / vibration after creation (only the
 * name follows later calls), so changing them needs a NEW id, as for `timers`.
 */
export async function ensureChannels(t: Translate): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { AndroidImportance } = Notifications;
  const definitions: { id: string; name: string; importance: Notifications.AndroidImportance }[] = [
    { id: CHANNEL_IDS.gym, name: t('notify.channels.gym'), importance: AndroidImportance.HIGH },
    {
      id: CHANNEL_IDS.habits,
      name: t('notify.channels.habits'),
      importance: AndroidImportance.DEFAULT,
    },
    {
      id: CHANNEL_IDS.checkins,
      name: t('notify.channels.checkins'),
      importance: AndroidImportance.DEFAULT,
    },
    {
      id: CHANNEL_IDS.reminders,
      name: t('notify.channels.reminders'),
      importance: AndroidImportance.DEFAULT,
    },
    // Own channel from the start: the weekly review can be muted without touching check-ins.
    {
      id: CHANNEL_IDS.review,
      name: t('notify.channels.review'),
      importance: AndroidImportance.DEFAULT,
    },
  ];
  await Promise.all(
    definitions.map((channel) =>
      Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: channel.importance,
        sound: 'default',
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }),
    ),
  );
}
