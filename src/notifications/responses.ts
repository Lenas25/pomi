// What a tap on a notification ACTION does (PLAN §7.1, §14b). Pure over injected dependencies, so
// the same code serves the background task (app closed) and the foreground listener.
import { z } from 'zod';

import type { ActivityKind } from '../db/repositories/activity';
import type { PlannedChannel } from '../domain/notifications/buildUpcoming';

import { ACTIONS, SNOOZE_MINUTES, SOURCE } from './constants';

export type ResponseInput = {
  actionIdentifier: string;
  notificationId: string;
  /** Epoch ms the notification was delivered (part of the dedupe key). */
  deliveredAt: number;
  title: string;
  body: string;
  categoryIdentifier: string | null;
  data: unknown;
};

const payloadSchema = z.looseObject({
  source: z.literal(SOURCE),
  kind: z.string(),
  channel: z.enum(['gym', 'habits', 'checkins', 'reminders']),
  habitId: z.string().optional(),
});

export type ResponseDeps = {
  /** `yyyy-MM-dd` of today. */
  today: () => string;
  now: () => number;
  /** First caller wins: `false` when this response was already applied (other runtime / listener). */
  claim: (key: string) => Promise<boolean>;
  logActivity: (date: string, kind: ActivityKind) => Promise<void>;
  incrementHabit: (habitId: string, date: string) => Promise<void>;
  setHabitDone: (habitId: string, date: string) => Promise<void>;
  scheduleSnooze: (request: {
    id: string;
    at: number;
    title: string;
    body: string;
    channel: PlannedChannel;
    category: string | null;
    data: Record<string, unknown>;
  }) => Promise<void>;
};

export type ResponseOutcome = 'handled' | 'ignored' | 'duplicate';

const ACTIVITY_BY_ACTION: Record<string, ActivityKind> = {
  [ACTIONS.gym]: 'gym',
  [ACTIONS.walk]: 'walk',
  [ACTIONS.none]: 'none',
};

export async function applyResponse(
  input: ResponseInput,
  deps: ResponseDeps,
): Promise<ResponseOutcome> {
  const parsed = payloadSchema.safeParse(input.data);
  // Not ours (a timer) or a plain tap on the notification body (navigation is done elsewhere).
  if (!parsed.success) return 'ignored';
  const payload = parsed.data;
  const action = input.actionIdentifier;
  const isKnownAction =
    action === ACTIONS.snooze ||
    action === ACTIONS.done ||
    action === ACTIONS.addWater ||
    action in ACTIVITY_BY_ACTION;
  if (!isKnownAction) return 'ignored';

  if (!(await deps.claim(`${input.notificationId}|${action}|${input.deliveredAt}`))) {
    return 'duplicate';
  }
  const today = deps.today();

  const activity = ACTIVITY_BY_ACTION[action];
  if (activity !== undefined) {
    // "Hoy no" is an answer, never a miss.
    await deps.logActivity(today, activity);
    return 'handled';
  }
  if (action === ACTIONS.addWater && payload.habitId) {
    await deps.incrementHabit(payload.habitId, today);
    return 'handled';
  }
  if (action === ACTIONS.done) {
    if (!payload.habitId) return 'ignored';
    await deps.setHabitDone(payload.habitId, today);
    return 'handled';
  }
  if (action === ACTIONS.snooze) {
    const at = deps.now() + SNOOZE_MINUTES * 60_000;
    await deps.scheduleSnooze({
      id: `snooze:${input.notificationId}:${at}`,
      at,
      title: input.title,
      body: input.body,
      channel: payload.channel,
      category: input.categoryIdentifier,
      data: payload,
    });
    return 'handled';
  }
  return 'ignored';
}

/** Keeps a bounded list of handled keys; returns the new list and whether `key` was new. */
export function claimKey(
  handled: readonly string[],
  key: string,
  limit = 40,
): { handled: string[]; isNew: boolean } {
  if (handled.includes(key)) return { handled: [...handled], isNew: false };
  return { handled: [...handled, key].slice(-limit), isNew: true };
}

export type NotificationRoute =
  { pathname: '/checkin/[tipo]'; params: { tipo: 'morning' | 'night' } } | { pathname: '/hoy' };

/** Where a plain tap on a notification goes (Hoy is the default landing). */
export function routeForNotification(data: unknown): NotificationRoute | null {
  const parsed = payloadSchema.safeParse(data);
  if (!parsed.success) return null;
  const { kind, checkin } = parsed.data as { kind: string; checkin?: unknown };
  if (kind === 'checkin' && (checkin === 'morning' || checkin === 'night')) {
    return { pathname: '/checkin/[tipo]', params: { tipo: checkin } };
  }
  return { pathname: '/hoy' };
}
