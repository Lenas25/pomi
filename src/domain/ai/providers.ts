// "Conectar mi IA" (PLAN §14d): the providers the person can pick. PURE data + helpers.
// Endpoints and model ids were checked against each provider's official docs (2026-10-08); the
// model is only a starting value, the person can type any model id their account offers.

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
  /** Starting model id (editable); empty = the person types it. */
  defaultModel: string;
  /** Self-hosted servers usually run without a key. */
  keyRequired: boolean;
  maxTokensField: MaxTokensField;
};

export const AI_PRESETS: Readonly<Record<AiProviderId, AiProviderPreset>> = {
  openai: {
    id: 'openai',
    adapter: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-luna',
    keyRequired: true,
    // OpenAI deprecated `max_tokens` for chat completions.
    maxTokensField: 'max_completion_tokens',
  },
  gemini: {
    id: 'gemini',
    adapter: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    keyRequired: true,
    maxTokensField: 'max_tokens',
  },
  moonshot: {
    id: 'moonshot',
    adapter: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3',
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
  },
  minimax: {
    id: 'minimax',
    adapter: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: '',
    keyRequired: true,
    maxTokensField: 'max_completion_tokens',
  },
  openrouter: {
    id: 'openrouter',
    adapter: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    keyRequired: true,
    maxTokensField: 'max_tokens',
  },
  anthropic: {
    id: 'anthropic',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-5-5',
    keyRequired: true,
    maxTokensField: 'max_tokens',
  },
  custom: {
    id: 'custom',
    adapter: 'openai',
    baseUrl: null,
    defaultModel: '',
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
