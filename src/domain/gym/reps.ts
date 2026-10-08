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
      /** "30 s por lado": the time is per side. */
      perSide: boolean;
    };

// First number or range. Dashes: en dash, em dash, hyphen-minus.
const FIRST_RANGE = /(\d+)(?:\s*[–—-]\s*(\d+))?/;
const SECONDS_UNIT = /^\s*(s|seg|segs|segundos|sec|secs)\b/i;
const MINUTES_UNIT = /^\s*(min|mins|minuto|minutos)\b/i;
// Leading "3x" / "3 × " set count: the sets live in `step.sets`, so it is ignored.
const SETS_PREFIX = /^\s*\d+\s*[x×]\s*(?=\d)/i;
const PER_SIDE =
  /\bpor\s+(pierna|lado|brazo|mano)\b|\bc\/u\b|\bcada\s+(pierna|lado|brazo)\b|\bper\s+(leg|side|arm|hand)\b|\beach\s+(leg|side|arm)\b/i;

/**
 * Where the number or range that `parseReps` reads sits in `text` (after a leading set count).
 * Lets an edit carry a new range into the other language's text ("8–10 per leg" -> "6–8 per leg").
 */
export function repsRangeSpan(text: string): { start: number; end: number } | null {
  const offset = SETS_PREFIX.exec(text)?.[0].length ?? 0;
  const match = FIRST_RANGE.exec(text.slice(offset));
  if (!match) return null;
  return { start: offset + match.index, end: offset + match.index + match[0].length };
}

/**
 * - `"8–10"` / `"8-10"` -> reps 8..10
 * - `"8"` / `"8 por lado"` -> reps 8..8 (perSide when "por pierna/lado/brazo")
 * - `"30–45 s"` -> time 30..45 s; `"1–2 min"` -> time 60..120 s (time keeps `perSide` too)
 * - `"3x8–10"` -> reps 8..10 (the leading set count is ignored, `step.sets` is the source of truth)
 * - compound text (`"12–15 + 10 pulsos + 10 s arriba"`) uses the FIRST range only
 * - anything else (no number, zero, descending range) -> `null`
 */
export function parseReps(text: string): RepTarget | null {
  const body = text.replace(SETS_PREFIX, '');
  const match = FIRST_RANGE.exec(body);
  if (!match) return null;

  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  if (min < 1 || max < min) return null;

  const perSide = PER_SIDE.test(body);
  const rest = body.slice(match.index + match[0].length);
  if (SECONDS_UNIT.test(rest)) return { kind: 'time', minSec: min, maxSec: max, perSide };
  if (MINUTES_UNIT.test(rest)) {
    return { kind: 'time', minSec: min * 60, maxSec: max * 60, perSide };
  }

  return { kind: 'reps', min, max, perSide };
}
