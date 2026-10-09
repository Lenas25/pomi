import * as SecureStore from 'expo-secure-store';

import { MAX_KEY_LENGTH_CHARS } from '../domain/ai/limits';
import { AI_PROVIDERS, type AiProviderId, type KeyTarget } from '../domain/ai/providers';

// The API key lives ONLY in the platform secure store (Android Keystore-backed `expo-secure-store`):
// never in SQLite, settings, the JSON backup or logs. `expo-secure-store` excludes its data from
// Android Auto Backup (and `android.allowBackup` is false anyway).
//
// A key is BOUND to its destination: one entry per provider, storing the key together with the
// normalized origin (`scheme://host:port`) it was saved for. `read` returns it only for that same
// provider and origin, so a changed base URL (or a restored / edited setting) can never send a key
// to another host, and a preset's key is never reused for "URL propia".

/** The slice of `expo-secure-store` we use; tests pass an in-memory fake. */
export type SecretStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/** Unbound entry written by the first v3 build: never read, deleted on save / clear. */
export const LEGACY_AI_KEY_ENTRY = 'pomi.ai.apiKey';

/** Secure-store entry name (allowed characters: alphanumeric, `.`, `-`, `_`). */
export function aiKeyEntry(provider: AiProviderId): string {
  return `pomi.ai.apiKey.${provider}`;
}

export const MAX_KEY_LENGTH = MAX_KEY_LENGTH_CHARS;

export type AiKeyStore = {
  /** The key saved for exactly this provider and origin, else `null`. */
  read: (target: KeyTarget | null) => Promise<string | null>;
  save: (target: KeyTarget, key: string) => Promise<void>;
  /** Deletes every stored key (all providers). */
  clear: () => Promise<void>;
};

type StoredKey = { origin: string; key: string };

function parseStored(value: string | null): StoredKey | null {
  if (value === null) return null;
  try {
    const raw: unknown = JSON.parse(value);
    if (typeof raw !== 'object' || raw === null) return null;
    const { origin, key } = raw as Record<string, unknown>;
    if (typeof origin !== 'string' || typeof key !== 'string' || key.trim() === '') return null;
    return { origin, key };
  } catch {
    return null;
  }
}

export function createAiKeyStore(store: SecretStore): AiKeyStore {
  return {
    async read(target) {
      if (target === null) return null;
      try {
        const stored = parseStored(await store.getItemAsync(aiKeyEntry(target.provider)));
        return stored !== null && stored.origin === target.origin ? stored.key : null;
      } catch {
        return null;
      }
    },
    async save(target, key) {
      const value = key.trim();
      await store.deleteItemAsync(LEGACY_AI_KEY_ENTRY);
      if (value === '') {
        await store.deleteItemAsync(aiKeyEntry(target.provider));
        return;
      }
      if (value.length > MAX_KEY_LENGTH) throw new Error('key too long');
      const stored: StoredKey = { origin: target.origin, key: value };
      await store.setItemAsync(aiKeyEntry(target.provider), JSON.stringify(stored));
    },
    async clear() {
      await store.deleteItemAsync(LEGACY_AI_KEY_ENTRY);
      for (const provider of AI_PROVIDERS) await store.deleteItemAsync(aiKeyEntry(provider));
    },
  };
}

let instance: AiKeyStore | null = null;

/** The app's key store over `expo-secure-store`. */
export function getAiKeyStore(): AiKeyStore {
  if (!instance) {
    instance = createAiKeyStore({
      getItemAsync: (key) => SecureStore.getItemAsync(key),
      setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
      deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
    });
  }
  return instance;
}
