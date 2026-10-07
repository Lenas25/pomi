import tokens from '../../design/tokens.json';
import { fonts, makeTheme, resolveMode, textStyle } from './theme';

describe('textStyle', () => {
  it('maps headings to Fredoka with the token weight', () => {
    expect(textStyle('display')).toMatchObject({
      fontFamily: fonts.heading['700'],
      fontSize: 34,
      lineHeight: 40,
    });
    expect(textStyle('title-md').fontFamily).toBe(fonts.heading['600']);
  });

  it('maps body to Nunito Sans', () => {
    expect(textStyle('body').fontFamily).toBe(fonts.body['400']);
    expect(textStyle('body-strong').fontFamily).toBe(fonts.body['700']);
    expect(textStyle('caption').fontFamily).toBe(fonts.body['600']);
  });

  it('uses Nunito 900 with tabular digits for timer and metric', () => {
    for (const variant of ['timer', 'metric'] as const) {
      expect(textStyle(variant)).toMatchObject({
        fontFamily: fonts.numeric['900'],
        fontVariant: ['tabular-nums'],
      });
    }
    expect(textStyle('body').fontVariant).toBeUndefined();
  });
});

describe('resolveMode', () => {
  it('follows the system when the preference is "system"', () => {
    expect(resolveMode('system', 'dark')).toBe('dark');
    expect(resolveMode('system', 'light')).toBe('light');
    expect(resolveMode('system', null)).toBe('light');
  });

  it('lets an explicit preference win over the system', () => {
    expect(resolveMode('dark', 'light')).toBe('dark');
    expect(resolveMode('light', 'dark')).toBe('light');
  });
});

describe('makeTheme', () => {
  it('exposes the tokens for the chosen mode', () => {
    expect(makeTheme('dark').color.bg).toBe(tokens.color.dark.bg);
    expect(makeTheme('light').color.bg).toBe(tokens.color.light.bg);
  });

  it('has no shadow in dark mode', () => {
    expect(makeTheme('dark').shadow.soft).toEqual({});
    expect(makeTheme('light').shadow.soft).toMatchObject({ shadowOpacity: 0.08 });
  });
});
