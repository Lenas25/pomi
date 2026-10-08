import { describe, expect, it } from '@jest/globals';

import gymJson from '../../../templates/gym.json';

import { parseReps } from './reps';

describe('parseReps', () => {
  it('knows "per side" in English too (generated programs follow the app language)', () => {
    expect(parseReps('8–10 per side')).toEqual({ kind: 'reps', min: 8, max: 10, perSide: true });
    expect(parseReps('12 each leg')).toMatchObject({ perSide: true });
    expect(parseReps('20–40 s per side')).toEqual({
      kind: 'time',
      minSec: 20,
      maxSec: 40,
      perSide: true,
    });
  });

  it('parses ranges with an en dash or a hyphen', () => {
    expect(parseReps('8–10')).toEqual({ kind: 'reps', min: 8, max: 10, perSide: false });
    expect(parseReps('8-10')).toEqual({ kind: 'reps', min: 8, max: 10, perSide: false });
    expect(parseReps('8 – 10')).toEqual({ kind: 'reps', min: 8, max: 10, perSide: false });
    expect(parseReps('12—15')).toMatchObject({ min: 12, max: 15 });
  });

  it('parses a single number as min = max', () => {
    expect(parseReps('8')).toEqual({ kind: 'reps', min: 8, max: 8, perSide: false });
    expect(parseReps('8 por lado')).toEqual({ kind: 'reps', min: 8, max: 8, perSide: true });
  });

  it('flags "por pierna" / "por lado" ranges as per side', () => {
    expect(parseReps('10–12 por pierna')).toEqual({
      kind: 'reps',
      min: 10,
      max: 12,
      perSide: true,
    });
    expect(parseReps('12–15 POR LADO')).toMatchObject({ perSide: true });
    expect(parseReps('10 c/u')).toMatchObject({ perSide: true });
  });

  it('treats seconds as time, not reps', () => {
    expect(parseReps('30–45 s')).toEqual({ kind: 'time', minSec: 30, maxSec: 45, perSide: false });
    expect(parseReps('30 s')).toEqual({ kind: 'time', minSec: 30, maxSec: 30, perSide: false });
    expect(parseReps('45 segundos')).toEqual({
      kind: 'time',
      minSec: 45,
      maxSec: 45,
      perSide: false,
    });
  });

  it('uses the first range of a compound description', () => {
    expect(parseReps('12–15 + 10 pulsos + 10 s arriba')).toEqual({
      kind: 'reps',
      min: 12,
      max: 15,
      perSide: false,
    });
  });

  it('returns null for unparseable text', () => {
    expect(parseReps('')).toBeNull();
    expect(parseReps('hasta el fallo')).toBeNull();
    expect(parseReps('0')).toBeNull();
    expect(parseReps('10–8')).toBeNull();
  });

  it('parses every `reps` string of the bundled gym template', () => {
    const texts = gymJson.programs.flatMap((program) =>
      program.routines.flatMap((routine) =>
        routine.steps.flatMap((step) =>
          'reps' in step ? Object.values(step.reps as Record<string, string>) : [],
        ),
      ),
    );
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) expect(parseReps(text)).not.toBeNull();
  });
});

describe('parseReps extras', () => {
  it('converts minutes to seconds', () => {
    expect(parseReps('1 min')).toEqual({ kind: 'time', minSec: 60, maxSec: 60, perSide: false });
    expect(parseReps('1–2 min')).toEqual({ kind: 'time', minSec: 60, maxSec: 120, perSide: false });
    expect(parseReps('2 minutos')).toMatchObject({ kind: 'time', minSec: 120 });
  });

  it('keeps perSide on time targets', () => {
    expect(parseReps('30 s por lado')).toEqual({
      kind: 'time',
      minSec: 30,
      maxSec: 30,
      perSide: true,
    });
  });

  it('ignores a leading set count ("3x8–10" -> reps 8..10)', () => {
    expect(parseReps('3x8–10')).toEqual({ kind: 'reps', min: 8, max: 10, perSide: false });
    expect(parseReps('3 × 12')).toEqual({ kind: 'reps', min: 12, max: 12, perSide: false });
    expect(parseReps('4x30 s')).toMatchObject({ kind: 'time', minSec: 30 });
  });
});
