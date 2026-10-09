// Pure layout / focus logic of the set rows (tested without rendering).

export type SetField = 'weight' | 'reps';
export type FocusTarget = { index: number; field: SetField };

/**
 * Where the keyboard's "next" goes from a set input: kg -> reps of the same set; reps -> the
 * first input of the next set that is not done yet (reps only for bodyweight). `null` at the end
 * (the keyboard closes).
 */
export function nextFocusTarget(
  from: FocusTarget,
  sets: number,
  isDone: (index: number) => boolean,
  bodyweight: boolean,
): FocusTarget | null {
  if (from.field === 'weight' && !bodyweight) return { index: from.index, field: 'reps' };
  for (let index = from.index + 1; index < sets; index += 1) {
    if (!isDone(index)) return { index, field: bodyweight ? 'reps' : 'weight' };
  }
  return null;
}

/** The "anterior" column: the previous value or a short muted dash when there is none. */
export const NO_PREVIOUS = '–';

export type RirRowMetrics = {
  /** Font size (dp at scale 1) of the "RIR" label. */
  labelSize: number;
  labelChars: number;
  /** Width of the (i) icon inside the label button. */
  iconSize: number;
  /** Inner gap and horizontal padding of the label button. */
  innerGap: number;
  /** Diameter of each option circle (44 dp). */
  circle: number;
  options: number;
  /** Gap between the label button and the circles, and between circles. */
  gap: number;
};

/** Average glyph width as a share of the font size (Nunito Sans, a generous estimate). */
const GLYPH_WIDTH = 0.65;

/** Width (dp) of the RIR row on one line: label button with (i), then the option circles. */
export function rirRowWidth(metrics: RirRowMetrics, fontScale: number): number {
  const scale = Math.max(1, fontScale);
  const label = metrics.labelChars * metrics.labelSize * GLYPH_WIDTH * scale;
  const button = metrics.innerGap * 2 + label + metrics.innerGap + metrics.iconSize;
  return Math.ceil(button + metrics.options * metrics.circle + metrics.options * metrics.gap);
}

/** True when the row fits on one line in `available` dp (the row still wraps if it does not). */
export function rirRowFits(available: number, metrics: RirRowMetrics, fontScale: number): boolean {
  return rirRowWidth(metrics, fontScale) <= available;
}
