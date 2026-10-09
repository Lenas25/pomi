import { describe, expect, it } from '@jest/globals';

import { makeTheme } from '../ui/theme';
import { NO_PREVIOUS, nextFocusTarget, rirRowFits, rirRowWidth } from './setRowLayout';

describe('nextFocusTarget (keyboard "next")', () => {
  const none = () => false;

  it('goes kg -> reps of the same set, then to the kg of the next set', () => {
    expect(nextFocusTarget({ index: 0, field: 'weight' }, 3, none, false)).toEqual({
      index: 0,
      field: 'reps',
    });
    expect(nextFocusTarget({ index: 0, field: 'reps' }, 3, none, false)).toEqual({
      index: 1,
      field: 'weight',
    });
  });

  it('skips sets already done and ends after the last set', () => {
    const done = (index: number) => index === 1;
    expect(nextFocusTarget({ index: 0, field: 'reps' }, 3, done, false)).toEqual({
      index: 2,
      field: 'weight',
    });
    expect(nextFocusTarget({ index: 2, field: 'reps' }, 3, none, false)).toBeNull();
    expect(nextFocusTarget({ index: 0, field: 'reps' }, 2, (i) => i === 1, false)).toBeNull();
  });

  it('bodyweight: reps -> reps of the next set', () => {
    expect(nextFocusTarget({ index: 0, field: 'reps' }, 2, none, true)).toEqual({
      index: 1,
      field: 'reps',
    });
  });
});

describe('RIR row layout', () => {
  const theme = makeTheme('light');
  const metrics = {
    labelSize: 13,
    labelChars: 'RIR'.length,
    iconSize: theme.space[5],
    innerGap: theme.space[1],
    circle: theme.touch.min,
    options: 4,
    gap: theme.space[2],
  };
  // Window - screen margins - card padding.
  const available = (width: number) => width - theme.space[5] * 2 - theme.space[4] * 2;

  it.each([
    [360, 1],
    [360, 1.3],
    [412, 1],
    [412, 1.3],
  ])('the short "RIR" label + 4 circles of 44 dp fit at %i dp, font %s', (width, fontScale) => {
    expect(rirRowFits(available(width), metrics, fontScale)).toBe(true);
  });

  it('the old long label would not fit at 360 dp, font 1.3', () => {
    const long = { ...metrics, labelChars: 'Repeticiones en reserva'.length };
    expect(rirRowWidth(long, 1.3)).toBeGreaterThan(available(360));
  });

  it('a missing previous value is a short dash', () => {
    expect(NO_PREVIOUS).toBe('–');
  });
});
