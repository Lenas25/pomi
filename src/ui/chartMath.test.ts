import { describe, expect, it } from '@jest/globals';

import { linePath, linearScale, niceAxis } from './chartMath';

describe('niceAxis', () => {
  it('rounds the bounds out to tick values that contain the data', () => {
    expect(niceAxis(42, 57, 3)).toEqual({ min: 40, max: 60, ticks: [40, 50, 60] });
    const axis = niceAxis(0, 3, 3);
    expect(axis).toEqual({ min: 0, max: 4, ticks: [0, 2, 4] });
  });

  it('widens a flat series so the line sits in the middle', () => {
    const axis = niceAxis(60, 60, 3);
    expect(axis.min).toBeLessThan(60);
    expect(axis.max).toBeGreaterThan(60);
    expect(axis.ticks).toContain(60);
  });

  it('works for a single zero and for decimals', () => {
    const zero = niceAxis(0, 0, 3);
    expect(zero.min).toBeLessThan(zero.max);
    const decimals = niceAxis(60.2, 61.9, 3);
    expect(decimals.min).toBeLessThanOrEqual(60.2);
    expect(decimals.max).toBeGreaterThanOrEqual(61.9);
  });
});

describe('linearScale / linePath', () => {
  it('maps the domain onto the range (inverted ranges for SVG y)', () => {
    const y = linearScale(0, 10, 100, 0);
    expect(y(0)).toBe(100);
    expect(y(10)).toBe(0);
    expect(y(5)).toBe(50);
    expect(linearScale(5, 5, 0, 10)(5)).toBe(5);
  });

  it('draws a path only from two points', () => {
    expect(linePath([])).toBe('');
    expect(linePath([{ x: 1, y: 2 }])).toBe('');
    expect(
      linePath([
        { x: 0, y: 10.126 },
        { x: 5, y: 2 },
      ]),
    ).toBe('M0 10.13 L5 2');
  });
});
