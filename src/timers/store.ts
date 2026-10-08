// App-wide timer singleton. Created lazily so importing this module never touches native code.
import { t } from '../i18n';

import { createNotificationEffects } from './notifications';
import { createTimerStore, type TimerStore } from './timerStore';

let store: TimerStore | undefined;

export function getTimerStore(): TimerStore {
  store ??= createTimerStore(createNotificationEffects(() => t('timers.channelName')));
  return store;
}
