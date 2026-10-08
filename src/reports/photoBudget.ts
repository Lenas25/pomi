// The PDF embeds photos as base64 data URIs, so their total size bounds the size of the file (and
// the memory expo-print needs). Pure.

/**
 * Upper bound of the embedded photo data (characters of the data URIs, about the bytes they add to
 * the HTML). Photos are downscaled to ~1000 px JPEGs before this cap decides how many fit.
 */
export const REPORT_PHOTO_BYTES_CAP = 4_000_000;

export type PhotoSelection = {
  /** Photo file name -> data URI of the ones that fit, in the order given. */
  sources: Record<string, string>;
  /** Photos that were asked for but left out (unreadable, or over the byte cap). */
  dropped: number;
};

/** Keeps photos in order while the running total stays within `cap`; a photo that does not fit is dropped. */
export function fitPhotoBudget(
  candidates: readonly { name: string; uri: string | null }[],
  cap: number = REPORT_PHOTO_BYTES_CAP,
): PhotoSelection {
  const sources: Record<string, string> = {};
  let total = 0;
  let dropped = 0;
  for (const { name, uri } of candidates) {
    if (uri === null || total + uri.length > cap) {
      dropped += 1;
      continue;
    }
    total += uri.length;
    sources[name] = uri;
  }
  return { sources, dropped };
}
