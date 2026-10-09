// Reads a notification response from EITHER source and runs the action end to end (pure over
// injected effects, so it is testable without the native module).
//
// Two shapes reach us (expo-notifications 57, Android):
// - The listener (`addNotificationResponseReceivedListener`) gets the response AFTER the JS mapper
//   (`mapNotificationContent`) turned `content.dataString` into `content.data`.
// - The background task (`registerTaskAsync`) gets the RAW native bundle
//   (`NotificationSerializer.toBundle(NotificationResponse)`): for a local scheduled notification
//   the payload is ONLY in `notification.request.content.dataString` (a JSON string) and
//   `content.data` is absent. Reading `content.data` alone made every action tapped with the app
//   in the background or closed parse as "not ours" and do nothing.
import { ACTIONS } from './constants';
import {
  applyResponse,
  type ResponseDeps,
  type ResponseInput,
  type ResponseOutcome,
} from './responses';

export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function contentData(content: Obj): unknown {
  if (isObj(content.data)) return content.data;
  const raw = str(content.dataString);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Normalizes a mapped (listener) or raw (task) response. `null` = not a response. */
export function parseResponsePayload(raw: unknown): ResponseInput | null {
  if (!isObj(raw)) return null;
  // Defensive: some versions wrap the response once more (`{ notification: response }`).
  const response =
    str(raw.actionIdentifier) === null &&
    isObj(raw.notification) &&
    'actionIdentifier' in raw.notification
      ? raw.notification
      : raw;
  const actionIdentifier = str(response.actionIdentifier);
  const notification = response.notification;
  if (actionIdentifier === null || !isObj(notification) || !isObj(notification.request))
    return null;
  const request = notification.request;
  const identifier = str(request.identifier);
  if (identifier === null) return null;
  const content = isObj(request.content) ? request.content : {};
  const date = notification.date;
  return {
    actionIdentifier,
    notificationId: identifier,
    deliveredAt: typeof date === 'number' ? date : Number(date ?? 0) || 0,
    title: str(content.title) ?? '',
    body: str(content.body) ?? '',
    categoryIdentifier: str(content.categoryIdentifier),
    data: contentData(content),
  };
}

export type ResponseEnv = {
  /** Opens + migrates the database (the headless run has no app bootstrap). */
  bootstrap: () => Promise<void>;
  deps: () => ResponseDeps;
  /** Removes the notification from the shade (Android does not do it for action buttons). */
  dismiss: (notificationId: string) => Promise<void>;
  /** Refills the window after a new answer. Must not throw. */
  sync: () => Promise<unknown>;
  log: (message: string, extra?: unknown) => void;
};

/**
 * Applies one notification response (deduped) and dismisses the notification once the action is
 * done or was already done by the other runtime. A plain tap is left to navigation; a failure
 * keeps the notification so the person can tap again (the claim was released).
 */
export async function processNotificationResponse(
  raw: unknown,
  env: ResponseEnv,
): Promise<ResponseOutcome> {
  const input = parseResponsePayload(raw);
  env.log('notification response', {
    action: input?.actionIdentifier,
    id: input?.notificationId,
    hasData: input?.data !== undefined,
  });
  if (!input || input.actionIdentifier === DEFAULT_ACTION) return 'ignored';
  await env.bootstrap();
  const outcome = await applyResponse(input, env.deps());
  env.log('notification response outcome', outcome);
  if (outcome !== 'ignored') {
    await env.dismiss(input.notificationId).catch((error: unknown) => {
      env.log('could not dismiss the notification', error);
    });
  }
  if (outcome === 'handled' && input.actionIdentifier !== ACTIONS.snooze) {
    // A new answer can change what is left to remind about (water goal, today's survey).
    await env.sync();
  }
  return outcome;
}
