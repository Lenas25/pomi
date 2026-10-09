import { beforeEach, describe, expect, it } from '@jest/globals';

import { setLanguage, t } from '../i18n';

import { countRule, daysLabel, scheduleLine } from './howItCounts';

beforeEach(() => {
  setLanguage('es');
});

describe('daysLabel', () => {
  it('names every day, a Monday-first run, or a list', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6], t)).toBe('todos los días');
    expect(daysLabel([5, 1, 2, 3, 4], t)).toBe('Lun–Vie');
    expect(daysLabel([6, 0, 5], t)).toBe('Vie–Dom');
    expect(daysLabel([1, 3, 5], t)).toBe('Lun, Mié, Vie');
    expect(daysLabel([1, 2], t)).toBe('Lun, Mar');
  });
});

describe('scheduleLine and countRule', () => {
  it('describes one time, a range, or no time', () => {
    expect(scheduleLine({ days: [1, 3], occurrences: [810] }, t)).toBe('aviso 13:30 · Lun, Mié');
    expect(scheduleLine({ days: [1, 2, 3, 4, 5], occurrences: [540, 600, 1080] }, t)).toBe(
      'avisos 09:00–18:00 · Lun–Vie',
    );
    expect(scheduleLine({ days: [0, 1, 2, 3, 4, 5, 6], occurrences: [] }, t)).toBe(
      'todos los días',
    );
  });

  it('says how each kind of task counts', () => {
    expect(countRule({ kind: 'habit', habitType: 'check' }, t)).toBe('Márcala tú');
    expect(countRule({ kind: 'water', target: { glasses: 8 } }, t)).toBe('8 vasos según tu peso');
    expect(countRule({ kind: 'water' }, t)).toBe('Suma vasos hasta tu meta');
    expect(countRule({ kind: 'gym' }, t)).toBe('Al terminar la sesión');
  });
});
