import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { createRepositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { createBackup } from '../backup/backup';
import { selectContext } from '../domain/ai/context';
import { buildAiRequest } from '../domain/ai/prompt';
import { loadDefaultTemplates } from '../templates/defaults';
import { endpointOf, keyTargetOf, type AiConnection, type KeyTarget } from '../domain/ai/providers';

import { sendChat, type FetchLike } from './adapters';
import { ANTHROPIC_VERSION } from './adapters/anthropic';
import { askAndRecord, disconnect, promptStringsFor, testConnection } from './connection';
import { loadAiSnapshot } from './loadAiData';
import { aiKeyEntry, createAiKeyStore, type SecretStore } from './keyStore';

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(status: number, json: unknown) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    });
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(json) };
  };
  return { fetch, calls };
}

function fakeSecretStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
}

const openai: AiConnection = {
  enabled: true,
  provider: 'openai',
  model: 'gpt-x',
  maxOutputTokens: 512,
};
const claude: AiConnection = {
  enabled: true,
  provider: 'anthropic',
  model: 'claude-x',
  maxOutputTokens: 256,
};
const request = buildAiRequest(
  '¿Agua?',
  { today: '2026-10-08', periodDays: 30 },
  promptStringsFor('es'),
);
const OPENAI_OK = { choices: [{ message: { role: 'assistant', content: ' Vas bien. ' } }] };
const ANTHROPIC_OK = {
  content: [
    { type: 'text', text: 'Vas ' },
    { type: 'text', text: 'bien.' },
  ],
};
const opts = { requireKey: true, requireText: true };
const OPENAI_TARGET = keyTargetOf(openai) as KeyTarget;

describe('OpenAI-compatible adapter', () => {
  it('posts to /chat/completions with a bearer key, the system message and the exact preview text', async () => {
    const { fetch, calls } = fakeFetch(200, OPENAI_OK);
    const result = await sendChat(endpointOf(openai, 'sk-1'), request, { ...opts, fetch });
    expect(result).toEqual({ ok: true, text: 'Vas bien.' });
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer sk-1');
    expect(calls[0]?.body).toEqual({
      model: 'gpt-x',
      messages: [{ role: 'system', content: request.system }, request.messages[0]],
      max_completion_tokens: 512,
      stream: false,
    });
  });

  it('uses max_tokens for self-hosted servers and sends no auth header without a key', async () => {
    const { fetch, calls } = fakeFetch(200, OPENAI_OK);
    const custom: AiConnection = {
      ...openai,
      provider: 'custom',
      customBaseUrl: 'http://192.168.1.2:11434/v1',
    };
    await sendChat(endpointOf(custom, null), request, {
      requireKey: false,
      requireText: true,
      fetch,
    });
    expect(calls[0]?.url).toBe('http://192.168.1.2:11434/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body.max_tokens).toBe(512);
  });

  it('maps errors', async () => {
    const cases: [number, string][] = [
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [404, 'modelNotFound'],
      [429, 'rateLimited'],
      [400, 'badRequest'],
      [500, 'server'],
      [529, 'server'],
    ];
    for (const [status, error] of cases) {
      const { fetch } = fakeFetch(status, {});
      expect(await sendChat(endpointOf(openai, 'k'), request, { ...opts, fetch })).toEqual({
        ok: false,
        error,
        status,
      });
    }
    const { fetch: odd } = fakeFetch(200, { nope: true });
    expect(await sendChat(endpointOf(openai, 'k'), request, { ...opts, fetch: odd })).toEqual({
      ok: false,
      error: 'badResponse',
    });
    const offline: FetchLike = async () => {
      throw new TypeError('Network request failed');
    };
    expect(await sendChat(endpointOf(openai, 'k'), request, { ...opts, fetch: offline })).toEqual({
      ok: false,
      error: 'network',
    });
  });

  it('refuses before any request without a key or a model', async () => {
    const { fetch, calls } = fakeFetch(200, OPENAI_OK);
    expect(await sendChat(endpointOf(openai, null), request, { ...opts, fetch })).toEqual({
      ok: false,
      error: 'noKey',
    });
    expect(
      await sendChat(endpointOf({ ...openai, model: ' ' }, 'k'), request, { ...opts, fetch }),
    ).toEqual({
      ok: false,
      error: 'noModel',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('gives up after 30 s', async () => {
    jest.useFakeTimers();
    let aborted = false;
    const hanging: FetchLike = (_url, init) =>
      new Promise(() => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
        });
      });
    const pending = sendChat(endpointOf(openai, 'k'), request, { ...opts, fetch: hanging });
    await jest.advanceTimersByTimeAsync(29_999);
    expect(aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, error: 'timeout' });
    expect(aborted).toBe(true);
  });
});

describe('Anthropic adapter', () => {
  it('posts to /v1/messages with x-api-key and anthropic-version', async () => {
    const { fetch, calls } = fakeFetch(200, ANTHROPIC_OK);
    const result = await sendChat(endpointOf(claude, 'ak-1'), request, { ...opts, fetch });
    expect(result).toEqual({ ok: true, text: 'Vas bien.' });
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers['x-api-key']).toBe('ak-1');
    expect(calls[0]?.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[0]?.body).toEqual({
      model: 'claude-x',
      max_tokens: 256,
      system: request.system,
      messages: request.messages,
    });
  });

  it('maps errors and empty answers', async () => {
    const { fetch } = fakeFetch(404, {});
    expect(await sendChat(endpointOf(claude, 'k'), request, { ...opts, fetch })).toMatchObject({
      error: 'modelNotFound',
    });
    const { fetch: empty } = fakeFetch(200, { content: [] });
    expect(await sendChat(endpointOf(claude, 'k'), request, { ...opts, fetch: empty })).toEqual({
      ok: false,
      error: 'emptyAnswer',
    });
  });
});

describe('key storage', () => {
  it('stores the key only in the secure store, never in settings or the backup', async () => {
    const secret = fakeSecretStore();
    const keyStore = createAiKeyStore(secret);
    const test = await createTestDb();
    try {
      const repos = createRepositories(test.db, () => 5_000);
      await keyStore.save(OPENAI_TARGET, '  sk-SECRET-123  ');
      expect(JSON.parse(secret.data.get(aiKeyEntry('openai')) ?? '{}')).toEqual({
        origin: 'https://api.openai.com:443',
        key: 'sk-SECRET-123',
      });
      await repos.settings.set('aiConnection', openai);

      const { fetch, calls } = fakeFetch(200, OPENAI_OK);
      const result = await askAndRecord(repos, openai, '¿Agua?', request, {
        keyStore,
        fetch,
        now: () => 7,
      });
      expect(result.ok).toBe(true);
      expect(calls[0]?.headers.authorization).toBe('Bearer sk-SECRET-123');
      expect(await repos.settings.get('aiChat')).toEqual([
        { role: 'user', text: '¿Agua?', at: 7 },
        { role: 'assistant', text: 'Vas bien.', at: 7 },
      ]);

      const backup = JSON.stringify(
        await createBackup(test.db, { appVersion: '1', includeAiChat: true }),
      );
      expect(backup).toContain('aiConnection');
      expect(backup).toContain('aiChat');
      expect(backup).not.toContain('sk-SECRET-123');

      await disconnect(repos, keyStore);
      expect(secret.data.size).toBe(0);
      expect(await repos.settings.get('aiConnection')).toMatchObject({ enabled: false });
      expect(await repos.settings.get('aiChat')).toHaveLength(2);
    } finally {
      test.close();
    }
  });

  it('does not record a failed answer; the ping sends no personal data', async () => {
    const keyStore = createAiKeyStore(fakeSecretStore());
    await keyStore.save(OPENAI_TARGET, 'k');
    const test = await createTestDb();
    try {
      const repos = createRepositories(test.db, () => 5_000);
      const { fetch } = fakeFetch(401, {});
      expect(await askAndRecord(repos, openai, 'q', request, { keyStore, fetch })).toMatchObject({
        error: 'unauthorized',
      });
      expect(await repos.settings.get('aiChat')).toBeUndefined();
    } finally {
      test.close();
    }
    const { fetch, calls } = fakeFetch(200, { choices: [{ message: { content: null } }] });
    expect(await testConnection(openai, 'es', { keyStore, fetch })).toEqual({ ok: true, text: '' });
    expect(JSON.stringify(calls[0]?.body)).not.toContain('periodDays');
  });

  it('treats a blank or unreadable entry as no key and clears on an empty save', async () => {
    const secret = fakeSecretStore();
    const keyStore = createAiKeyStore(secret);
    expect(await keyStore.read(OPENAI_TARGET)).toBeNull();
    await keyStore.save(OPENAI_TARGET, 'k');
    await keyStore.save(OPENAI_TARGET, '   ');
    expect(secret.data.size).toBe(0);
    const broken = createAiKeyStore({
      ...secret,
      getItemAsync: async () => {
        throw new Error('keystore');
      },
    });
    expect(await broken.read(OPENAI_TARGET)).toBeNull();
    await expect(keyStore.save(OPENAI_TARGET, 'x'.repeat(600))).rejects.toThrow();
  });
});

describe('loadAiSnapshot', () => {
  it('reads aggregates from a real database and keeps notes apart', async () => {
    const test = await createTestDb();
    try {
      const repos = createRepositories(test.db, () => 5_000);
      await repos.templates.saveModules(loadDefaultTemplates().modules, 'add');
      await repos.checkins.upsert('2026-10-07', 'night', {
        energia: 4,
        animo: 3,
        nota: 'día largo',
      });
      await repos.checkins.upsert('2026-10-06', 'night', { energia: 2, animo: 5 });
      const snapshot = await loadAiSnapshot(repos, new Date(2026, 9, 8, 12), 'es');
      expect(snapshot.today).toBe('2026-10-08');
      expect(snapshot.checkins).toMatchObject({ days: 2, energyAverage: 3, moodAverage: 4 });
      expect(snapshot.dayNotes).toEqual([{ date: '2026-10-07', text: 'día largo' }]);
      expect(snapshot.gym).toBeNull();
      const context = selectContext(snapshot, ['mood'], {
        includeFoodNotes: false,
        includeDayNotes: false,
      });
      expect(JSON.stringify(context)).not.toContain('día largo');
    } finally {
      test.close();
    }
  });
});
