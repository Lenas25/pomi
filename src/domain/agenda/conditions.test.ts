import { describe, expect, it } from '@jest/globals';

import { evaluateOnlyIf, evaluateWhen } from './conditions';

describe('evaluateWhen', () => {
  it('holds when there is no condition', () => {
    expect(evaluateWhen(undefined, { weekday: 3 })).toBe(true);
    expect(evaluateWhen({}, { weekday: 3 })).toBe(true);
  });

  it('matches days', () => {
    expect(evaluateWhen({ days: [1, 3] }, { weekday: 3 })).toBe(true);
    expect(evaluateWhen({ days: [1, 3] }, { weekday: 2 })).toBe(false);
  });

  it('matches flags, defaulting a missing flag to false and flagValue to true', () => {
    expect(evaluateWhen({ flag: 'deload' }, { weekday: 1, flags: { deload: true } })).toBe(true);
    expect(evaluateWhen({ flag: 'deload' }, { weekday: 1 })).toBe(false);
    expect(evaluateWhen({ flag: 'deload', flagValue: false }, { weekday: 1 })).toBe(true);
    expect(
      evaluateWhen({ flag: 'deload', flagValue: false }, { weekday: 1, flags: { deload: true } }),
    ).toBe(false);
  });

  it('requires every field of one condition (days AND flag)', () => {
    const when = { days: [1], flag: 'deload' };
    expect(evaluateWhen(when, { weekday: 1, flags: { deload: true } })).toBe(true);
    expect(evaluateWhen(when, { weekday: 2, flags: { deload: true } })).toBe(false);
    expect(evaluateWhen(when, { weekday: 1 })).toBe(false);
  });

  it('holds when ANY condition of a list matches', () => {
    const when = [{ days: [1] }, { flag: 'deload' }];
    expect(evaluateWhen(when, { weekday: 1 })).toBe(true);
    expect(evaluateWhen(when, { weekday: 2, flags: { deload: true } })).toBe(true);
    expect(evaluateWhen(when, { weekday: 2 })).toBe(false);
  });
});

describe('evaluateOnlyIf', () => {
  it('holds without conditions', () => {
    expect(evaluateOnlyIf(undefined, {})).toBe(true);
  });

  it('compares profile fields', () => {
    expect(evaluateOnlyIf({ 'profile.workType': 'sentada' }, { workType: 'sentada' })).toBe(true);
    expect(evaluateOnlyIf({ 'profile.workType': 'sentada' }, { workType: 'de pie' })).toBe(false);
    expect(evaluateOnlyIf({ 'profile.workType': 'sentada' }, {})).toBe(false);
  });

  it('requires every entry and rejects unknown namespaces', () => {
    const profile = { workType: 'sentada', level: 'intermedio' };
    expect(
      evaluateOnlyIf({ 'profile.workType': 'sentada', 'profile.level': 'intermedio' }, profile),
    ).toBe(true);
    expect(
      evaluateOnlyIf({ 'profile.workType': 'sentada', 'profile.level': 'avanzado' }, profile),
    ).toBe(false);
    expect(evaluateOnlyIf({ 'settings.x': true }, profile)).toBe(false);
    expect(evaluateOnlyIf({ workType: 'sentada' }, profile)).toBe(false);
  });
});

describe('empty conditions', () => {
  it('treats an empty list like an empty condition: no constraint (the schema rejects both)', () => {
    expect(evaluateWhen([], { weekday: 3 })).toBe(true);
    expect(evaluateWhen({}, { weekday: 3 })).toBe(true);
  });
});
