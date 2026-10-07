import { en } from './en';
import { es } from './es';
import { resolveLanguage } from './index';

function flatten(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n', () => {
  it('has the same keys in es and en', () => {
    expect(flatten(en).sort()).toEqual(flatten(es).sort());
  });

  it('defaults to Spanish unless the device language is English', () => {
    expect(resolveLanguage('system', 'en')).toBe('en');
    expect(resolveLanguage('system', 'fr')).toBe('es');
    expect(resolveLanguage('system', undefined)).toBe('es');
    expect(resolveLanguage('es', 'en')).toBe('es');
  });
});
