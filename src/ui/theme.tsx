// Pomi theme. Single implementation; `design/theme.ts` re-exports this module.
// `design/tokens.json` is the single source of truth for every value used here.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, type TextStyle, type ViewStyle } from 'react-native';

import tokens from '../../design/tokens.json';

export type Mode = 'light' | 'dark';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorRole = keyof typeof tokens.color.light;
export type TextVariant = keyof typeof tokens.font.scale;
export type SpaceKey = keyof typeof tokens.space;

export const fonts = {
  heading: { '600': 'Fredoka_600SemiBold', '700': 'Fredoka_700Bold' },
  body: {
    '400': 'NunitoSans_400Regular',
    '600': 'NunitoSans_600SemiBold',
    '700': 'NunitoSans_700Bold',
  },
  // Fredoka has proportional digits; timers and metrics need Nunito's fixed-width digits.
  numeric: { '900': 'Nunito_900Black' },
} as const;

type ScaleEntry = {
  size: number;
  line: number;
  weight: string;
  family: keyof typeof fonts;
  tabular?: boolean;
};

export function textStyle(variant: TextVariant): TextStyle {
  const entry = tokens.font.scale[variant] as ScaleEntry;
  const familyMap: Record<string, string> = fonts[entry.family];
  const fontFamily = familyMap[entry.weight] ?? Object.values(familyMap)[0];
  return {
    fontFamily,
    fontSize: entry.size,
    lineHeight: entry.line,
    ...(entry.tabular ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

function shadowStyle(mode: Mode, key: keyof typeof tokens.shadow): ViewStyle {
  // Dark mode has no shadow; surfaces are separated with `color.border` instead.
  if (mode === 'dark') return {};
  const s = tokens.shadow[key];
  return {
    shadowColor: s.color,
    shadowOpacity: s.opacity,
    shadowOffset: { width: 0, height: s.offsetY },
    shadowRadius: s.blur / 2,
    elevation: s.elevation,
  };
}

export function makeTheme(mode: Mode) {
  return {
    mode,
    color: tokens.color[mode],
    palette: tokens.color.palette,
    space: tokens.space,
    radius: tokens.radius,
    shadow: { soft: shadowStyle(mode, 'soft'), raised: shadowStyle(mode, 'raised') },
    touch: tokens.touch,
    control: tokens.control,
    layout: tokens.layout,
    stroke: tokens.stroke,
    opacity: tokens.opacity,
    motion: tokens.motion,
    mascot: tokens.mascot,
    text: textStyle,
  };
}

export type Theme = ReturnType<typeof makeTheme>;

export function resolveMode(preference: ThemeMode, systemScheme: string | null | undefined): Mode {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

const ThemeContext = createContext<Theme | null>(null);

type ThemeProviderProps = {
  /** User preference from settings. Defaults to following the system. */
  mode?: ThemeMode;
  children: ReactNode;
};

export function ThemeProvider({ mode = 'system', children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const resolved = resolveMode(mode, systemScheme);
  const theme = useMemo(() => makeTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
