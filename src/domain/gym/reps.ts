// Parses the free-text `reps` of a `sets` step (see CLAUDE.md "reps parser").

export type RepTarget =
  | {
      kind: 'reps';
      min: number;
      max: number;
      /** "por pierna", "por lado"...: the numbers are per side. */
      perSide: boolean;
    }
  | {
      /** Seconds ("30–45 s"), so it is a hold/time target and not a rep count. */
      kind: 'time';
      minSec: number;
      maxSec: number;
    };

// First number or range. Dashes: en dash, em dash, hyphen-minus.
const FIRST_RANGE = /(\d+)(?:\s*[–—-]\s*(\d+))?/;
const SECONDS_UNIT = /^\s*(s|seg|segs|segundos|sec|secs)\b/i;
const PER_SIDE = /\bpor\s+(pierna|lado|brazo|mano)\b|\bc\/u\b|\bcada\s+(pierna|lado|brazo)\b/i;

/**
 * - `"8–10"` / `"8-10"` -> reps 8..10
 * - `"8"` / `"8 por lado"` -> reps 8..8 (perSide when "por pierna/lado/brazo")
 * - `"30–45 s"` -> time 30..45 s
 * - compound text (`"12–15 + 10 pulsos + 10 s arriba"`) uses the FIRST range only
 * - anything else (no number, zero, descending range) -> `null`
 */
export function parseReps(text: string): RepTarget | null {
  const match = FIRST_RANGE.exec(text);
  if (!match) return null;

  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (min < 1 || max < min) return null;

  const rest = text.slice(match.index + match[0].length);
  if (SECONDS_UNIT.test(rest)) return { kind: 'time', minSec: min, maxSec: max };

  return { kind: 'reps', min, max, perSide: PER_SIDE.test(text) };
}
