// The "Conectar mi IA" form: draft -> connection, with field errors. PURE.
import { MAX_KEY_LENGTH_CHARS } from './limits';
import {
  AI_PRESETS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  type AiConnection,
  type AiProviderId,
} from './providers';
import { checkBaseUrl } from './url';

export type AiDraft = {
  provider: AiProviderId;
  customBaseUrl: string;
  model: string;
  /** What the person typed in the key field ('' = keep the stored key). */
  keyInput: string;
  /** A key bound to THIS draft's provider and origin sits in the secure store (see `sameDestination`). */
  hasStoredKey: boolean;
  maxOutputTokens: number;
};

export type AiFormError =
  | 'urlEmpty'
  | 'urlInvalid'
  | 'httpsRequired'
  | 'keyNeedsHttps'
  | 'modelEmpty'
  | 'keyEmpty'
  | 'keyTooLong';

export type AiFormResult =
  | { ok: true; connection: AiConnection; key: string | null }
  | { ok: false; errors: Partial<Record<'url' | 'model' | 'key', AiFormError>> };

export function draftFor(
  provider: AiProviderId,
  current?: AiConnection,
): Omit<AiDraft, 'hasStoredKey'> {
  const same = current?.provider === provider;
  return {
    provider,
    customBaseUrl: same ? (current?.customBaseUrl ?? '') : '',
    // No default model id (see `AI_PRESETS`): the person types the exact id.
    model: same ? (current?.model ?? '') : '',
    keyInput: '',
    maxOutputTokens: current?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

/** Validates the draft. `key` is the new key to store, or `null` to keep the stored one. */
export function validateDraft(draft: AiDraft): AiFormResult {
  const preset = AI_PRESETS[draft.provider];
  const errors: Partial<Record<'url' | 'model' | 'key', AiFormError>> = {};
  const key = draft.keyInput.trim();
  let customBaseUrl: string | undefined;
  if (preset.baseUrl === null) {
    const check = checkBaseUrl(draft.customBaseUrl, { withKey: key !== '' || draft.hasStoredKey });
    if (check.ok) customBaseUrl = check.url;
    else if (check.reason === 'keyNeedsHttps') errors.key = 'keyNeedsHttps';
    else {
      errors.url =
        check.reason === 'empty'
          ? 'urlEmpty'
          : check.reason === 'httpsRequired'
            ? 'httpsRequired'
            : 'urlInvalid';
    }
  }
  const model = draft.model.trim();
  if (model === '') errors.model = 'modelEmpty';
  if (key.length > MAX_KEY_LENGTH_CHARS) errors.key = 'keyTooLong';
  else if (preset.keyRequired && key === '' && !draft.hasStoredKey) errors.key = 'keyEmpty';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    connection: {
      enabled: true,
      provider: draft.provider,
      ...(customBaseUrl !== undefined ? { customBaseUrl } : {}),
      model,
      maxOutputTokens: draft.maxOutputTokens,
    },
    key: key === '' ? null : key,
  };
}

/** Ready to chat: switched on, a model, and a key when the provider needs one. */
export function isReady(connection: AiConnection | undefined, hasKey: boolean): boolean {
  if (!connection?.enabled || connection.model.trim() === '') return false;
  return hasKey || !AI_PRESETS[connection.provider].keyRequired;
}
