// Turns a planned notification (i18n keys / template text) into the final text.
import {
  BODY_MAX,
  TITLE_MAX,
  clampText,
  type PlannedNotification,
} from '../domain/notifications/buildUpcoming';
import type { ResolvedNotification } from '../domain/notifications/diff';
import type { Translate } from '../i18n';
import { CHANNEL_IDS } from './constants';

export type ResolvedPlanned = ResolvedNotification & { planned: PlannedNotification };

export function resolveText(
  text: PlannedNotification['text'],
  t: Translate,
): { title: string; body: string } {
  const raw =
    text.type === 'text'
      ? { title: text.title, body: text.body }
      : {
          title: t(`${text.key}.title`, text.params),
          body: t(`${text.key}.body`, text.params),
        };
  return { title: clampText(raw.title, TITLE_MAX), body: clampText(raw.body, BODY_MAX) };
}

export function resolvePlanned(planned: PlannedNotification, t: Translate): ResolvedPlanned {
  const { title, body } = resolveText(planned.text, t);
  return {
    id: planned.id,
    at: planned.at,
    channel: CHANNEL_IDS[planned.channel],
    category: planned.category,
    title,
    body,
    planned,
  };
}
