import { dayKeyFor } from '../time';

import { musclesWithVolume, referenceRange, weeklyVolume, type StepMuscles } from './weeklyVolume';

const at = (iso: string) => new Date(iso).getTime();
const stepMuscles: StepMuscles = {
  'hip-thrust': ['gluteo', 'isquios'],
  'rdl@db~s': ['isquios', 'gluteo', 'espalda'],
  curl: ['biceps'],
};
// Wednesday 2026-10-07; its ISO week starts Monday 2026-10-05.
const today = '2026-10-07';

describe('weeklyVolume', () => {
  it('counts 1 direct set for the first muscle and 0.5 for the others', () => {
    const [week] = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles,
      sets: [
        { stepId: 'hip-thrust', doneAt: at('2026-10-06T10:00:00') },
        { stepId: 'hip-thrust', doneAt: at('2026-10-06T10:05:00') },
        { stepId: 'curl', doneAt: at('2026-10-07T10:00:00') },
      ],
    });
    expect(week?.sets).toEqual({ gluteo: 2, isquios: 1, biceps: 1 });
    expect(week?.isCurrent).toBe(true);
  });

  it('counts every primary muscle of an explicit spec as direct and the secondary as 0.5', () => {
    const [week] = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles: { press: { direct: ['pecho', 'triceps'], indirect: ['hombro', 'pecho'] } },
      sets: [{ stepId: 'press', doneAt: at('2026-10-06T10:00:00') }],
    });
    expect(week?.sets).toEqual({ pecho: 1, triceps: 1, hombro: 0.5 });
  });

  it('resolves generated step ids stored with @db/~s suffixes', () => {
    const [week] = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles,
      sets: [{ stepId: 'rdl@db~s', doneAt: at('2026-10-05T09:00:00') }],
    });
    expect(week?.sets).toEqual({ isquios: 1, gluteo: 0.5, espalda: 0.5 });
  });

  it('ignores unknown step ids and unknown muscle names', () => {
    const [week] = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles: { odd: ['pecho', 'not-a-muscle', 'triceps'] },
      sets: [
        { stepId: 'ghost', doneAt: at('2026-10-06T10:00:00') },
        { stepId: 'odd', doneAt: at('2026-10-06T10:00:00') },
      ],
    });
    expect(week?.sets).toEqual({ pecho: 1, triceps: 0.5 });
  });

  it('skips a step whose FIRST muscle is unknown instead of promoting the next one', () => {
    const [week] = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles: { odd: ['not-a-muscle', 'pecho'], empty: [] },
      sets: [
        { stepId: 'odd', doneAt: at('2026-10-06T10:00:00') },
        { stepId: 'empty', doneAt: at('2026-10-06T10:00:00') },
      ],
    });
    expect(week?.sets).toEqual({});
  });

  it('does not double count a muscle listed twice in a step', () => {
    const [week] = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles: { dup: ['pecho', 'pecho', 'triceps'] },
      sets: [{ stepId: 'dup', doneAt: at('2026-10-06T10:00:00') }],
    });
    expect(week?.sets).toEqual({ pecho: 1, triceps: 0.5 });
  });

  it('buckets by ISO week, oldest first, and drops sets outside the window', () => {
    const weeks = weeklyVolume({
      today,
      weeks: 2,
      stepMuscles,
      sets: [
        { stepId: 'curl', doneAt: at('2026-09-30T10:00:00') },
        { stepId: 'curl', doneAt: at('2026-10-06T10:00:00') },
        { stepId: 'curl', doneAt: at('2026-09-20T10:00:00') },
      ],
    });
    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-09-28', '2026-10-05']);
    expect(weeks.map((week) => week.sets.biceps)).toEqual([1, 1]);
  });

  it('applies the day rollover: 01:30 on Monday still belongs to Sunday of the previous week', () => {
    const doneAt = new Date(2026, 9, 5, 1, 30).getTime();
    expect(dayKeyFor(new Date(doneAt))).toBe('2026-10-04');
    const weeks = weeklyVolume({
      today,
      weeks: 2,
      stepMuscles,
      sets: [{ stepId: 'curl', doneAt }],
    });
    expect(weeks[0]?.sets.biceps).toBe(1);
    expect(weeks[1]?.sets.biceps).toBeUndefined();
  });

  it('lists the muscles that have volume in vocabulary order', () => {
    const weeks = weeklyVolume({
      today,
      weeks: 1,
      stepMuscles,
      sets: [
        { stepId: 'curl', doneAt: at('2026-10-06T10:00:00') },
        { stepId: 'hip-thrust', doneAt: at('2026-10-06T10:00:00') },
      ],
    });
    expect(musclesWithVolume(weeks)).toEqual(['gluteo', 'isquios', 'biceps']);
  });
});

describe('referenceRange', () => {
  it('follows the level and goal table for the large muscles', () => {
    expect(referenceRange('gluteo', 'beginner', 'hypertrophy')).toEqual({ min: 8, max: 10 });
    expect(referenceRange('pecho', 'advanced', 'hypertrophy')).toEqual({ min: 12, max: 18 });
    expect(referenceRange('pecho', 'intermediate', 'strength')).toEqual({ min: 8, max: 10 });
  });

  it('uses the minor band for small muscles and none where there is no table', () => {
    expect(referenceRange('biceps', 'intermediate', 'health')).toEqual({ min: 4, max: 10 });
    expect(referenceRange('core', 'beginner', 'health')).toBeNull();
    expect(referenceRange('espalda_alta', 'beginner', 'health')).toBeNull();
  });
});
