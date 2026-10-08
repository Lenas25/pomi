// Diffing the notifications Pomi wants against what the OS already holds. Pure.

/** Ids Pomi plans start with their kind; anything else (timers, snoozes) is never touched. */
const MANAGED = /^(gym|water|habit|checkin|reminder|review|survey):/;

export function isManagedId(id: string): boolean {
  return MANAGED.test(id);
}

export type ResolvedNotification = {
  id: string;
  at: number;
  channel: string;
  category: string | null;
  title: string;
  body: string;
};

/** Everything that, when changed, requires scheduling the notification again. */
export function signatureOf(notification: ResolvedNotification): string {
  return [
    notification.at,
    notification.channel,
    notification.category ?? '',
    notification.title,
    notification.body,
  ].join('|');
}

export type ScheduledEntry = { id: string; signature: string | undefined };

export type ScheduleDiff = {
  /** Wanted notifications that are missing or changed (scheduling again replaces by id). */
  toSchedule: string[];
  /** Managed notifications the OS holds but that are no longer wanted. */
  toCancel: string[];
};

export function diffSchedule(
  desired: readonly ResolvedNotification[],
  scheduled: readonly ScheduledEntry[],
): ScheduleDiff {
  const existing = new Map(scheduled.map((entry) => [entry.id, entry.signature]));
  const wanted = new Set(desired.map((notification) => notification.id));
  return {
    toSchedule: desired
      .filter((notification) => existing.get(notification.id) !== signatureOf(notification))
      .map((notification) => notification.id),
    toCancel: scheduled
      .filter((entry) => isManagedId(entry.id) && !wanted.has(entry.id))
      .map((entry) => entry.id),
  };
}
