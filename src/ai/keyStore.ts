import * as SecureStore from 'expo-secure-store';

import { MAX_KEY_LENGTH_CHARS } from '../domain/ai/limits';

// The API key lives ONLY in the platform secure store (Android Keystore-backed `expo-secure-store`):
// never in SQLite, settings, the JSON backup or logs. `expo-secure-store` excludes its data from
// Android Auto Backup (and `android.allowBackup` is false anyway).

/** The slice of `expo-secure-store` we use; tests pass an in-memory fake. */
export type SecretStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/** Secure-store entry name (allowed characters: alphanumeric, `.`, `-`, `_`). */
export const AI_KEY_ENTRY = 'pomi.ai.apiKey';
export const MAX_KEY_LENGTH = MAX_KEY_LENGTH_CHARS;

export type AiKeyStore = {
  read: () => Promise<string | null>;
  save: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

export function createAiKeyStore(store: SecretStore): AiKeyStore {
  return {
    async read() {
      try {
        const value = await store.getItemAsync(AI_KEY_ENTRY);
        return value === null || value.trim() === '' ? null : value;
      } catch {
        return null;
      }
    },
    async save(key) {
      const value = key.trim();
      if (value === '') {
        await store.deleteItemAsync(AI_KEY_ENTRY);
        return;
      }
      if (value.length > MAX_KEY_LENGTH) throw new Error('key too long');
      await store.setItemAsync(AI_KEY_ENTRY, value);
    },
    async clear() {
      await store.deleteItemAsync(AI_KEY_ENTRY);
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
