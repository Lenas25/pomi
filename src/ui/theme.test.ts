import tokens from '../../design/tokens.json';
import {
  fonts,
  makeTheme,
  resolveFontFamily,
  resolveMode,
  textStyle,
  type TextVariant,
} from './theme';

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

describe('textStyle over the whole scale', () => {
  const variants = Object.keys(tokens.font.scale) as TextVariant[];

  it.each(variants)('resolves a loaded font for "%s"', (variant) => {
    const entry = tokens.font.scale[variant];
    const expected = resolveFontFamily(entry.family, entry.weight);
    expect(expected).toBeDefined();
    expect(textStyle(variant)).toMatchObject({
      fontFamily: expected,
      fontSize: entry.size,
      lineHeight: entry.line,
    });
  });

  it('does not silently fall back for an unknown weight or family', () => {
    expect(resolveFontFamily('heading', '100')).toBeUndefined();
    expect(resolveFontFamily('serif', '400')).toBeUndefined();
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

/** WCAG 2.x contrast ratio between two `#RRGGBB` colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('Pomi Splash contrast (WCAG AA 4.5:1 for text)', () => {
  const modes = ['light', 'dark'] as const;

  it.each(modes)('%s: navy text on every section header fill', (mode) => {
    for (const section of Object.values(makeTheme(mode).section)) {
      expect(contrast(section.onFill, section.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(modes)('%s: section text color on bg, surface and its soft tint', (mode) => {
    const theme = makeTheme(mode);
    for (const section of Object.values(theme.section)) {
      expect(contrast(section.text, theme.color.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(section.text, theme.color.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(section.text, section.soft)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(modes)('%s: energy CTA label, tab bar labels and body text', (mode) => {
    const { color } = makeTheme(mode);
    expect(contrast(color.onEnergy, color.energyFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.textMuted, color.tabBar)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.text, color.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.text, color.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.onEnergy, color.celebrate)).toBeGreaterThanOrEqual(4.5);
  });
});
