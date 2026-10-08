// "¿Te moviste hoy?" (PLAN §14b). Pure mapping only; texts live in i18n.
export const ACTIVITY_KINDS = ['gym', 'walk', 'none'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityReplyKey = 'activity.reply.gym' | 'activity.reply.walk' | 'activity.reply.none';

/** The kind reply for an answer. "Hoy no" is never a miss, so its reply is plain kindness. */
export function activityReplyKey(kind: ActivityKind): ActivityReplyKey {
  return `activity.reply.${kind}`;
}

/** Only "gym" and "walk" count as movement for consistency; "none" is neutral, not a failure. */
export function countsAsMovement(kind: ActivityKind): boolean {
  return kind !== 'none';
}
