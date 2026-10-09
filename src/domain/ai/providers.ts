// "Conectar mi IA" (PLAN §14d): the providers the person can pick. PURE data + helpers.
// Endpoints were checked against each provider's official docs (2026-10-08). There is NO default
// model id: ids change often and a wrong one only fails later with a 404, so the person types the
// exact id from their provider's model list (`modelsDocs`, shown as a hint).
import { originOf } from './url';

export const AI_PROVIDERS = [
  'openai',
  'gemini',
  'moonshot',
  'minimax',
  'openrouter',
  'anthropic',
  'custom',
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

/** Wire protocol of a provider: OpenAI Chat Completions or Anthropic Messages. */
export type AiAdapterKind = 'openai' | 'anthropic';

/** Name of the output-limit field an OpenAI-compatible endpoint documents. */
export type MaxTokensField = 'max_tokens' | 'max_completion_tokens';

export type AiProviderPreset = {
  id: AiProviderId;
  adapter: AiAdapterKind;
  /** Fixed base URL; `null` = the person types it ("URL propia"). */
  baseUrl: string | null;
  /** Where the provider lists its model ids (host/path shown in the model hint); '' = none. */
  modelsDocs: string;
  /** Self-hosted servers usually run without a key. */
  keyRequired: boolean;
  maxTokensField: MaxTokensField;
};

export const AI_PRESETS: Readonly<Record<AiProviderId, AiProviderPreset>> = {
  openai: {
    id: 'openai',
    adapter: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    modelsDocs: 'platform.openai.com/docs/models',
    keyRequired: true,
    // OpenAI deprecated `max_tokens` for chat completions.
    maxTokensField: 'max_completion_tokens',
  },
  gemini: {
    id: 'gemini',
    adapter: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelsDocs: 'ai.google.dev/gemini-api/docs/models',
    keyRequired: true,
    maxTokensField: 'max_tokens',
  },
  moonshot: {
    id: 'moonshot',
    adapter: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    modelsDocs: 'platform.moonshot.ai/docs',
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
  },
  minimax: {
    id: 'minimax',
    adapter: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    modelsDocs: 'platform.minimax.io/docs',
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
  },
  openrouter: {
    id: 'openrouter',
    adapter: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsDocs: 'openrouter.ai/models',
    keyRequired: true,
    maxTokensField: 'max_tokens',
  },
  anthropic: {
    id: 'anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    modelsDocs: 'docs.anthropic.com/en/docs/about-claude/models',
    keyRequired: true,
    maxTokensField: 'max_tokens',
  },
  custom: {
    id: 'custom',
    adapter: 'openai',
    baseUrl: null,
    modelsDocs: '',
    // Ollama, LM Studio and vLLM accept requests without a key by default.
    keyRequired: false,
    maxTokensField: 'max_tokens',
  },
};

/** Output-token caps the person can choose (short answers are the point). */
export const MAX_OUTPUT_TOKEN_CHOICES = [256, 512, 1024] as const;
export const DEFAULT_MAX_OUTPUT_TOKENS = 512;
/** Every request gives up after this long. */
export const AI_TIMEOUT_MS = 30_000;

/** What the person configured (stored in settings; NEVER the key). */
export type AiConnection = {
  enabled: boolean;
  provider: AiProviderId;
  /** Only used by `custom`; presets always use their own URL. */
  customBaseUrl?: string | undefined;
  model: string;
  maxOutputTokens: number;
};

/** Everything an adapter needs for one call. */
export type AiEndpoint = {
  adapter: AiAdapterKind;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  maxOutputTokens: number;
  maxTokensField: MaxTokensField;
};

/** The base URL a connection talks to (trailing slashes removed). */
export function baseUrlOf(connection: Pick<AiConnection, 'provider' | 'customBaseUrl'>): string {
  const preset = AI_PRESETS[connection.provider];
  return (preset.baseUrl ?? connection.customBaseUrl ?? '').trim().replace(/\/+$/, '');
}

export function endpointOf(connection: AiConnection, apiKey: string | null): AiEndpoint {
  const preset = AI_PRESETS[connection.provider];
  const key = apiKey?.trim() ?? '';
  return {
    adapter: preset.adapter,
    baseUrl: baseUrlOf(connection),
    model: connection.model.trim(),
    apiKey: key === '' ? null : key,
    maxOutputTokens: connection.maxOutputTokens,
    maxTokensField: preset.maxTokensField,
  };
}

/** Where a stored API key may be sent: one secure-store entry per provider, bound to an origin. */
export type KeyTarget = { provider: AiProviderId; origin: string };

/** The key target of a connection, or `null` when its base URL is not valid. */
export function keyTargetOf(
  connection: Pick<AiConnection, 'provider' | 'customBaseUrl'>,
): KeyTarget | null {
  const origin = originOf(baseUrlOf(connection));
  return origin === null ? null : { provider: connection.provider, origin };
}

/** Same provider AND same origin: only then may a stored key be reused. */
export function sameDestination(
  a: Pick<AiConnection, 'provider' | 'customBaseUrl'> | undefined,
  b: Pick<AiConnection, 'provider' | 'customBaseUrl'> | undefined,
): boolean {
  const first = a ? keyTargetOf(a) : null;
  const second = b ? keyTargetOf(b) : null;
  return (
    first !== null &&
    second !== null &&
    first.provider === second.provider &&
    first.origin === second.origin
  );
}
