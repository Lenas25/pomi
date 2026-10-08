import { describe, expect, it } from '@jest/globals';

import { activeDeloadPct } from './deload';

describe('activeDeloadPct', () => {
  const week = { startsOn: '2026-01-31', endsOn: '2026-02-06', pct: 10 };
  it('applies from the first to the last day of the deload week only', () => {
    expect(activeDeloadPct(week, '2026-01-30')).toBeUndefined();
    expect(activeDeloadPct(week, '2026-01-31')).toBe(10);
    expect(activeDeloadPct(week, '2026-02-06')).toBe(10);
    expect(activeDeloadPct(week, '2026-02-07')).toBeUndefined();
    expect(activeDeloadPct(undefined, '2026-02-01')).toBeUndefined();
  });
});
