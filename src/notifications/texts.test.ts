import { describe, expect, it } from '@jest/globals';

import { BODY_MAX, TITLE_MAX } from '../domain/notifications/buildUpcoming';
import { loadDefaultTemplates } from '../templates/defaults';
import { en } from '../i18n/en';
import { es } from '../i18n/es';
import { localizedText } from '../templates/localized';

const LOCALES = { es: es.notify, en: en.notify } as const;
// Parameters at their worst case: titles/bodies built from templates are clamped to the limits.
const WORST_CASE = /\{\{\w+\}\}/g;
const emojis = (text: string) => text.match(/\p{Extended_Pictographic}/gu) ?? [];

describe('notification texts (BRAND §9: title <= 30, body <= 80, one emoji at most)', () => {
  for (const [language, notify] of Object.entries(LOCALES)) {
    const texts = [
      notify.gym,
      notify.checkinMorning,
      notify.checkinNight,
      notify.review,
      notify.monthly,
      notify.survey,
      notify.habit,
      notify.reminder,
    ];

    it(`${language}: every built-in title and body fits`, () => {
      for (const { title, body } of texts) {
        expect([...title.replace(WORST_CASE, '')].length).toBeLessThanOrEqual(TITLE_MAX);
        expect([...body.replace(WORST_CASE, '')].length).toBeLessThanOrEqual(BODY_MAX);
        expect(emojis(title).length + emojis(body).length).toBeLessThanOrEqual(1);
      }
    });

    it(`${language}: action buttons are short and have no emoji`, () => {
      for (const label of Object.values(notify.actions)) {
        expect([...label].length).toBeLessThanOrEqual(20);
        expect(emojis(label)).toEqual([]);
      }
    });
  }

  it.each(['es', 'en'])('the bundled template notifications fit the limits in %s', (language) => {
    for (const module of loadDefaultTemplates().modules) {
      for (const habit of module.habits ?? []) {
        if (!habit.notification) continue;
        const title = localizedText(habit.notification.title, language);
        const body = localizedText(habit.notification.body, language);
        expect([...title].length).toBeLessThanOrEqual(TITLE_MAX);
        expect([...body].length).toBeLessThanOrEqual(BODY_MAX);
        expect(emojis(title).length + emojis(body).length).toBeLessThanOrEqual(1);
        const action = localizedText(habit.notification.action, language);
        if (action !== undefined) expect([...action].length).toBeLessThanOrEqual(20);
      }
      for (const reminder of module.reminders ?? []) {
        const text = localizedText(reminder.text, language);
        expect([...text].length).toBeLessThanOrEqual(BODY_MAX);
      }
    }
  });

  it('es and en define the same keys', () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, child]) =>
        typeof child === 'object' && child !== null
          ? keys(child as object).map((sub) => `${key}.${sub}`)
          : [key],
      );
    expect(keys(en.notify).sort()).toEqual(keys(es.notify).sort());
  });
});
