import { describe, expect, it } from '@jest/globals';

import { stepsWindow } from './window';

describe('stepsWindow', () => {
  it('runs from 04:00 of the first day to 04:00 after the last, one date per logical day', () => {
    const window = stepsWindow('2026-10-05', '2026-10-07');
    expect(window?.start).toEqual(new Date(2026, 9, 5, 4, 0));
    expect(window?.end).toEqual(new Date(2026, 9, 8, 4, 0));
    expect(window?.dates).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('covers a single day', () => {
    const window = stepsWindow('2026-10-05', '2026-10-05');
    expect(window?.start).toEqual(new Date(2026, 9, 5, 4, 0));
    expect(window?.end).toEqual(new Date(2026, 9, 6, 4, 0));
    expect(window?.dates).toEqual(['2026-10-05']);
  });

  it('is null for a reversed range', () => {
    expect(stepsWindow('2026-10-06', '2026-10-05')).toBeNull();
  });

  it('keeps 04:00 wall-clock time across a month end', () => {
    const window = stepsWindow('2026-10-31', '2026-11-01');
    expect(window?.dates).toEqual(['2026-10-31', '2026-11-01']);
    expect(window?.end).toEqual(new Date(2026, 10, 2, 4, 0));
  });

  it('honours another rollover hour', () => {
    expect(stepsWindow('2026-10-05', '2026-10-05', 5)?.start).toEqual(new Date(2026, 9, 5, 5, 0));
  });
});
