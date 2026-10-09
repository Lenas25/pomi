// Chat history kept on the device (settings key `aiChat`; in the JSON backup only when the person
// switches it on, see `createBackup`; never the key).
// PURE helpers.

export const MAX_HISTORY_MESSAGES = 60;
export const MAX_STORED_TEXT = 4000;

export type AiChatEntry = {
  role: 'user' | 'assistant';
  text: string;
  /** Epoch ms. */
  at: number;
};

/** Appends entries and keeps the newest `MAX_HISTORY_MESSAGES`, texts capped. */
export function appendHistory(
  history: readonly AiChatEntry[] | undefined,
  entries: readonly AiChatEntry[],
): AiChatEntry[] {
  const next = [
    ...(history ?? []),
    ...entries.map((entry) => ({ ...entry, text: entry.text.slice(0, MAX_STORED_TEXT) })),
  ];
  return next.slice(-MAX_HISTORY_MESSAGES);
}
