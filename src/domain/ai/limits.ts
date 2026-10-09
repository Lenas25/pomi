/** Real API keys are far shorter; a cap keeps a pasted blob out of the secure store. */
export const MAX_KEY_LENGTH_CHARS = 512;
/** A provider answer larger than this is refused before parsing (a short chat reply is a few KB). */
export const MAX_RESPONSE_CHARS = 256 * 1024;
