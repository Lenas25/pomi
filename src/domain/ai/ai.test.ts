import { describe, expect, it } from '@jest/globals';

import { promptStringsFor } from '../../ai/connection';

import { averageRating, textAnswers } from './checkins';
import { routeIntent, selectContext, MAX_NOTES_SENT, type AiSnapshot } from './context';
import { draftFor, isReady, validateDraft, type AiDraft } from './form';
import { appendHistory, MAX_HISTORY_MESSAGES } from './history';
import { buildAiRequest, buildPingRequest, MAX_QUESTION_LENGTH } from './prompt';
import { AI_PRESETS, baseUrlOf, endpointOf } from './providers';
import { checkBaseUrl, isLocalHost } from './url';

const snapshot: AiSnapshot = {
  today: '2026-10-08',
  periodDays: 30,
  sleep: {
    nights: 20,
    averageMin: 402,
    targetMin: 450,
    wakeRangeMin: 75,
    debtMin: 180,
    socialJetlagMin: 70,
  },
  water: {
    daysLogged: 25,
    daysMet: 12,
    averageGlasses: 6.4,
    glassMl: 250,
    afternoonGap: { fromHour: 13, toHour: 17 },
  },
  movement: {
    stepsDaysLogged: 28,
    stepsAverage: 7420,
    stepsGoal: 8000,
    stepsDaysMet: 10,
    activeWeekdays: [2, 6],
  },
  gym: {
    sessionsDone: 9,
    sessionsPlanned: 12,
    exercises: [
      {
        name: 'Sentadilla',
        sessions: 4,
        sets: 12,
        e1rmFirstKg: 60,
        e1rmLastKg: 66,
        topWeightKg: 55,
        bestReps: 10,
      },
    ],
    setsThisWeek: [{ muscle: 'Cuádriceps', sets: 6, referenceMin: 10, referenceMax: 20 }],
  },
  checkins: { days: 22, energyAverage: 3.4, moodAverage: 3.8, sleepQualityAverage: 3.1 },
  insights: ['Notamos que duermes más los días de gym.'],
  suggestions: [],
  foodNotes: [{ date: '2026-10-07', text: 'SECRET-FOOD pasta' }],
  dayNotes: [{ date: '2026-10-06', text: 'SECRET-NOTE día largo' }],
};

const OFF = { includeFoodNotes: false, includeDayNotes: false };

describe('routeIntent', () => {
  it('routes by keyword in Spanish (accents ignored) and English', () => {
    expect(routeIntent('¿Cómo voy con el sueño?')).toEqual(['sleep']);
    expect(routeIntent('How much water do I drink?')).toEqual(['water']);
    expect(routeIntent('¿Subo el peso en la sentadilla?')).toEqual(['gym']);
    expect(routeIntent('Mis pasos y mi ánimo')).toEqual(['movement', 'mood']);
  });

  it('sends every topic when nothing matches', () => {
    expect(routeIntent('¿Qué tal voy?')).toHaveLength(6);
  });
});

describe('selectContext', () => {
  it('keeps only the routed topics (plus insights) and never notes by default', () => {
    const context = selectContext(snapshot, ['sleep'], OFF);
    expect(Object.keys(context).sort()).toEqual(
      ['checkins', 'insights', 'periodDays', 'sleep', 'today'].sort(),
    );
    expect(JSON.stringify(selectContext(snapshot, routeIntent('comida'), OFF))).not.toMatch(
      /SECRET/,
    );
  });

  it('adds notes only when the person switched them on, newest first and capped', () => {
    const many = {
      ...snapshot,
      foodNotes: Array.from({ length: 20 }, (_, index) => ({
        date: `2026-09-${String(index + 1).padStart(2, '0')}`,
        text: `n${index}`,
      })),
    };
    const withFood = selectContext(many, ['gym'], { ...OFF, includeFoodNotes: true });
    expect(withFood.foodNotes).toHaveLength(MAX_NOTES_SENT);
    expect(withFood.foodNotes?.[0]?.date).toBe('2026-09-20');
    expect(withFood.dayNotes).toBeUndefined();
    const withNotes = selectContext(snapshot, ['gym'], { ...OFF, includeDayNotes: true });
    expect(withNotes.dayNotes).toEqual([{ date: '2026-10-06', text: 'SECRET-NOTE día largo' }]);
    expect(withNotes.foodNotes).toBeUndefined();
  });

  it('skips topics without data', () => {
    const context = selectContext({ ...snapshot, gym: null }, ['gym'], OFF);
    expect(context.gym).toBeUndefined();
  });
});

describe('prompt builder', () => {
  it('has a strict scope, no medical advice, data-only numbers and the right language', () => {
    const es = buildAiRequest(
      '¿Cómo duermo?',
      selectContext(snapshot, ['sleep'], OFF),
      promptStringsFor('es'),
    );
    expect(es.system).toMatch(/sueño, agua, movimiento/);
    expect(es.system).toMatch(/No das consejo médico/);
    expect(es.system).toMatch(/SOLO los números/);
    expect(es.system).toMatch(/Responde siempre en español/);
    expect(es.system).toMatch(/fuera de esos temas/);
    expect(es.system).toMatch(/nunca afirmes causas/);
    const en = buildAiRequest(
      'How do I sleep?',
      selectContext(snapshot, ['sleep'], OFF),
      promptStringsFor('en'),
    );
    expect(en.system).toMatch(/Always answer in English/);
    expect(en.system).toMatch(/never give medical advice/);
    expect(en.system).toMatch(/ONLY the numbers/);
  });

  it('puts the question and the exact context JSON in one user message', () => {
    const context = selectContext(snapshot, ['water'], OFF);
    const request = buildAiRequest('  ¿Agua?  ', context, promptStringsFor('es'));
    expect(request.messages).toHaveLength(1);
    const content = request.messages[0]?.content ?? '';
    const json = content.slice(content.indexOf('{'));
    expect(JSON.parse(json)).toEqual({ QUESTION: '¿Agua?', DATA: context });
    expect(content).not.toMatch(/SECRET/);
  });

  it('caps the question and the ping carries no data', () => {
    const request = buildAiRequest(
      'x'.repeat(900),
      { today: 'd', periodDays: 30 },
      promptStringsFor('es'),
    );
    expect(request.messages[0]?.content).toContain('x'.repeat(MAX_QUESTION_LENGTH) + '"');
    expect(request.messages[0]?.content).not.toContain('x'.repeat(MAX_QUESTION_LENGTH + 1));
    expect(buildPingRequest(promptStringsFor('es'), 'ok').messages).toEqual([
      { role: 'user', content: 'ok' },
    ]);
  });
});

describe('base URL validation', () => {
  it('requires https on the internet', () => {
    expect(checkBaseUrl('https://api.example.com/v1/')).toEqual({
      ok: true,
      url: 'https://api.example.com/v1',
    });
    expect(checkBaseUrl('http://api.example.com/v1')).toEqual({
      ok: false,
      reason: 'httpsRequired',
    });
    expect(checkBaseUrl('http://8.8.8.8:11434/v1')).toEqual({ ok: false, reason: 'httpsRequired' });
  });

  it('allows http for this phone and the local network', () => {
    for (const url of [
      'http://localhost:11434/v1',
      'http://127.0.0.1:1234/v1',
      'http://192.168.1.20:11434/v1',
      'http://10.0.0.5:8000/v1',
      'http://172.20.1.2:8000/v1',
      'http://[::1]:11434/v1',
    ]) {
      expect(checkBaseUrl(url).ok).toBe(true);
    }
    expect(isLocalHost('172.32.0.1')).toBe(false);
    expect(isLocalHost('192.169.0.1')).toBe(false);
  });

  it('rejects junk', () => {
    expect(checkBaseUrl('').ok).toBe(false);
    expect(checkBaseUrl('ftp://x.com')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseUrl('https://user@x.com')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseUrl('https://x.com:99999')).toEqual({ ok: false, reason: 'invalid' });
    expect(checkBaseUrl('https://exa mple.com')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('providers and form', () => {
  const base: AiDraft = { ...draftFor('openai'), hasStoredKey: false, model: 'm' };

  it('presets carry their own URL; custom uses the typed one', () => {
    expect(baseUrlOf({ provider: 'gemini' })).toBe(AI_PRESETS.gemini.baseUrl);
    expect(baseUrlOf({ provider: 'custom', customBaseUrl: 'http://localhost:11434/v1/' })).toBe(
      'http://localhost:11434/v1',
    );
    const endpoint = endpointOf(
      {
        enabled: true,
        provider: 'custom',
        customBaseUrl: 'http://localhost:1/v1',
        model: ' m ',
        maxOutputTokens: 256,
      },
      '  ',
    );
    expect(endpoint).toMatchObject({ apiKey: null, model: 'm', adapter: 'openai' });
  });

  it('validates the draft', () => {
    expect(validateDraft({ ...base, model: '' })).toEqual({
      ok: false,
      errors: { model: 'modelEmpty', key: 'keyEmpty' },
    });
    const ok = validateDraft({ ...base, keyInput: ' sk-1 ' });
    expect(ok).toMatchObject({
      ok: true,
      key: 'sk-1',
      connection: { provider: 'openai', enabled: true },
    });
    expect(validateDraft({ ...base, hasStoredKey: true })).toMatchObject({ ok: true, key: null });
    expect(validateDraft({ ...base, keyInput: 'k'.repeat(600) })).toMatchObject({
      ok: false,
      errors: { key: 'keyTooLong' },
    });
    const custom = { ...draftFor('custom'), hasStoredKey: false, model: 'llama' };
    expect(validateDraft({ ...custom, customBaseUrl: 'http://example.com' })).toMatchObject({
      ok: false,
      errors: { url: 'httpsRequired' },
    });
    expect(
      validateDraft({ ...custom, customBaseUrl: 'http://192.168.0.2:11434/v1' }),
    ).toMatchObject({
      ok: true,
      key: null,
    });
  });

  it('is ready only when on, with a model and (when needed) a key', () => {
    const connection = {
      enabled: true,
      provider: 'openai' as const,
      model: 'm',
      maxOutputTokens: 512,
    };
    expect(isReady(connection, true)).toBe(true);
    expect(isReady(connection, false)).toBe(false);
    expect(isReady({ ...connection, enabled: false }, true)).toBe(false);
    expect(isReady({ ...connection, provider: 'custom' }, false)).toBe(true);
    expect(isReady(undefined, true)).toBe(false);
  });
});

describe('history and check-ins', () => {
  it('keeps the newest messages', () => {
    const many = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, at) => ({
      role: 'user' as const,
      text: String(at),
      at,
    }));
    const next = appendHistory(undefined, many);
    expect(next).toHaveLength(MAX_HISTORY_MESSAGES);
    expect(next[0]?.at).toBe(5);
  });

  it('averages 1-5 answers and reads free text', () => {
    const rows = [
      { date: 'a', answers: { energia: 3, nota: ' hola ' } },
      { date: 'b', answers: { energia: 4, nota: '' } },
      { date: 'c', answers: { energia: 9 } },
    ];
    expect(averageRating(rows, 'energia')).toBe(3.5);
    expect(averageRating(rows, 'animo')).toBeNull();
    expect(textAnswers(rows, 'nota')).toEqual([{ date: 'a', text: ' hola ' }]);
  });
});
