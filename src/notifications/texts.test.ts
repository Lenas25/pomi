import { describe, expect, it } from '@jest/globals';

import { BODY_MAX, TITLE_MAX } from '../domain/notifications/buildUpcoming';
import { loadDefaultTemplates } from '../templates/defaults';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

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

  it('the bundled template notifications already fit the limits', () => {
    for (const module of loadDefaultTemplates().modules) {
      for (const habit of module.habits ?? []) {
        if (!habit.notification) continue;
        expect([...habit.notification.title].length).toBeLessThanOrEqual(TITLE_MAX);
        expect([...habit.notification.body].length).toBeLessThanOrEqual(BODY_MAX);
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
