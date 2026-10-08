// Pure geometry for the SVG charts (no React, no tokens): scales, "nice" axis ticks and paths.

export type Point = { x: number; y: number };

const NICE_STEPS = [1, 2, 2.5, 5, 10];

/** A step of 1, 2, 2.5, 5 x 10^k that is at least `rough`. */
function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const factor = NICE_STEPS.find((candidate) => candidate >= fraction - 1e-9) ?? 10;
  return factor * power;
}

export type Axis = { min: number; max: number; ticks: number[] };

/**
 * Axis bounds that contain [min, max] with round tick values. A flat series (min = max) gets a
 * small band around it so the line is drawn in the middle instead of on an edge.
 */
export function niceAxis(min: number, max: number, tickCount: number): Axis {
  let low = min;
  let high = max;
  if (high - low < 1e-9) {
    const pad = Math.max(Math.abs(low) * 0.05, 1);
    low -= pad;
    high += pad;
  }
  const step = niceStep((high - low) / Math.max(1, tickCount - 1));
  const axisMin = Math.floor(low / step + 1e-9) * step;
  const axisMax = Math.ceil(high / step - 1e-9) * step;
  const ticks: number[] = [];
  const count = Math.round((axisMax - axisMin) / step);
  for (let index = 0; index <= count; index += 1) {
    ticks.push(Math.round((axisMin + index * step) * 1000) / 1000);
  }
  return { min: axisMin, max: axisMax, ticks };
}

/** Maps a value of [domainMin, domainMax] linearly to [rangeMin, rangeMax]. */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const span = domainMax - domainMin;
  if (span === 0) return () => (rangeMin + rangeMax) / 2;
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

/** SVG path through the points (`M x y L x y ...`), `''` for fewer than two points. */
export function linePath(points: readonly Point[]): string {
  if (points.length < 2) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');
}

const round = (value: number) => Math.round(value * 100) / 100;
