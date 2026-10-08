// Interactive notification categories. Every action has `opensAppToForeground: false`, so on
// Android a tap with the app closed runs the registered background task (see `backgroundTasks.ts`)
// instead of launching the app.
import * as Notifications from 'expo-notifications';

import type { CategoryId } from '../domain/notifications/buildUpcoming';
import type { Translate } from '../i18n';

import { ACTIONS } from './constants';

type ActionDefinition = { identifier: string; buttonTitle: string };

export function categoryDefinitions(t: Translate): Record<CategoryId, ActionDefinition[]> {
  const snooze = { identifier: ACTIONS.snooze, buttonTitle: t('notify.actions.snooze') };
  return {
    pomi_habit: [{ identifier: ACTIONS.done, buttonTitle: t('notify.actions.done') }, snooze],
    pomi_water: [{ identifier: ACTIONS.addWater, buttonTitle: t('notify.actions.water') }, snooze],
    pomi_survey: [
      { identifier: ACTIONS.gym, buttonTitle: t('notify.actions.gym') },
      { identifier: ACTIONS.walk, buttonTitle: t('notify.actions.walk') },
      { identifier: ACTIONS.none, buttonTitle: t('notify.actions.none') },
    ],
    pomi_snooze: [snooze],
    // The sedentary nudge never insists: one action, no snooze.
    pomi_pause: [{ identifier: ACTIONS.done, buttonTitle: t('notify.actions.done') }],
  };
}

/** Registers (or refreshes, e.g. after a language change) every category. */
export async function registerCategories(t: Translate): Promise<void> {
  const definitions = categoryDefinitions(t);
  await Promise.all(
    (Object.keys(definitions) as CategoryId[]).map((id) =>
      Notifications.setNotificationCategoryAsync(
        id,
        (definitions[id] ?? []).map((action) => ({
          ...action,
          options: { opensAppToForeground: false },
        })),
      ),
    ),
  );
}
