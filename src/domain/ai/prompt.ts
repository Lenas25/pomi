// Prompt builder for "Conectar mi IA" (PLAN §14d). PURE: the words come from i18n (passed in as
// `AiPromptStrings`), the numbers come only from the `AiContext` the engines computed.
import type { AiContext } from './context';

export const MAX_QUESTION_LENGTH = 500;

export type AiMessage = { role: 'user' | 'assistant'; content: string };

/** One request, provider-agnostic. Exactly this is serialized by the adapters. */
export type AiRequest = {
  system: string;
  messages: AiMessage[];
};

export type AiPromptStrings = {
  /** System prompt lines: scope, language, no medical advice, prudent wording, brevity, data-only numbers. */
  rules: readonly string[];
  questionLabel: string;
  dataLabel: string;
};

export function buildSystemPrompt(strings: AiPromptStrings): string {
  return strings.rules.join('\n');
}

/** The single user message: the question, then the data as JSON (what the preview shows). */
export function buildUserMessage(
  question: string,
  context: AiContext,
  strings: AiPromptStrings,
): string {
  const asked = question.trim().slice(0, MAX_QUESTION_LENGTH);
  return `${strings.questionLabel}\n${asked}\n\n${strings.dataLabel}\n${JSON.stringify(context, null, 2)}`;
}

export function buildAiRequest(
  question: string,
  context: AiContext,
  strings: AiPromptStrings,
): AiRequest {
  return {
    system: buildSystemPrompt(strings),
    messages: [{ role: 'user', content: buildUserMessage(question, context, strings) }],
  };
}

/** A tiny request for "Probar conexión": no personal data at all. */
export function buildPingRequest(strings: AiPromptStrings, ping: string): AiRequest {
  return { system: buildSystemPrompt(strings), messages: [{ role: 'user', content: ping }] };
}
