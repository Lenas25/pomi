// Template notification texts must fit a notification as written (the app clamps, but a clamped
// shipped or community text reads badly): checked by `npm run validate:templates`.
import { BODY_MAX, TITLE_MAX } from '../domain/notifications/buildUpcoming';
import type { Translate } from './describeError';

import { allTexts, localizedTextSchema } from './localized';

export const NOTIFICATION_EMOJI_MAX = 1;

export type NotificationTextProblem = {
  code: 'notificationTitleTooLong' | 'notificationBodyTooLong' | 'notificationTooManyEmoji';
  path: string;
  /** Characters (code points) for a length problem, emoji for `notificationTooManyEmoji`. */
  found: number;
  max: number;
};

const EMOJI = /\p{Extended_Pictographic}/gu;
const textSchema = localizedTextSchema(0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Language versions of a text value: `[locale-or-'text', text]`. */
function versions(value: unknown): [string, string][] {
  const parsed = textSchema.safeParse(value);
  if (!parsed.success) return [];
  if (typeof parsed.data === 'string') return [['text', parsed.data]];
  const [es, en] = allTexts(parsed.data);
  return en === undefined ? [['es', es ?? '']] : [['es', es ?? ''], ['en', en]];
}

const lengthOf = (text: string): number => [...text].length;

/** The problem as a readable line (`importErrors.*` texts). */
export function describeNotificationProblem(
  problem: NotificationTextProblem,
  translate: Translate,
): string {
  const params = { path: problem.path, max: problem.max, length: problem.found, count: problem.found };
  return translate(`importErrors.${problem.code}`, params);
}

/**
 * Every `notification` block under `json`: title <= TITLE_MAX, body <= BODY_MAX characters and at
 * most one emoji per notification, in EVERY language.
 */
export function notificationTextProblems(
  json: unknown,
  path = '',
): NotificationTextProblem[] {
  if (Array.isArray(json)) {
    return json.flatMap((item, index) => notificationTextProblems(item, `${path}[${index}]`));
  }
  if (!isRecord(json)) return [];
  return Object.entries(json).flatMap(([key, child]) => {
    if (key.startsWith('_')) return [];
    const childPath = path === '' ? key : `${path}.${key}`;
    if (key !== 'notification' || !isRecord(child)) return notificationTextProblems(child, childPath);
    return checkNotification(child, childPath);
  });
}

function checkNotification(
  notification: Record<string, unknown>,
  path: string,
): NotificationTextProblem[] {
  const problems: NotificationTextProblem[] = [];
  const title = versions(notification.title);
  const body = versions(notification.body);
  for (const [locale, text] of title) {
    if (lengthOf(text) > TITLE_MAX) {
      problems.push({
        code: 'notificationTitleTooLong',
        path: `${path}.title.${locale}`,
        found: lengthOf(text),
        max: TITLE_MAX,
      });
    }
  }
  for (const [locale, text] of body) {
    if (lengthOf(text) > BODY_MAX) {
      problems.push({
        code: 'notificationBodyTooLong',
        path: `${path}.body.${locale}`,
        found: lengthOf(text),
        max: BODY_MAX,
      });
    }
  }
  // Emoji are counted over the whole notification (title + body) of each language.
  const locales = new Set([...title, ...body].map(([locale]) => locale));
  for (const locale of locales) {
    const text = [...title, ...body]
      .filter(([candidate]) => candidate === locale || candidate === 'text')
      .map(([, value]) => value)
      .join(' ');
    const found = (text.match(EMOJI) ?? []).length;
    if (found > NOTIFICATION_EMOJI_MAX) {
      problems.push({
        code: 'notificationTooManyEmoji',
        path: `${path}.${locale}`,
        found,
        max: NOTIFICATION_EMOJI_MAX,
      });
    }
  }
  return problems;
}
