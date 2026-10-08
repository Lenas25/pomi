// Colors and sizes of the printed report, derived from `design/tokens.json` (the single source of
// truth). A PDF is read on paper or a white viewer, so it always uses the LIGHT palette; the page
// itself is white (`surface`) instead of the cream background, to spare ink.
import tokens from '../../design/tokens.json';

const light = tokens.color.light;
const scale = tokens.font.scale;

export const REPORT_PALETTE = {
  page: light.surface,
  text: light.text,
  muted: light.textMuted,
  border: light.border,
  headerBackground: light.brandSoft,
  accent: light.primary,
  onAccent: light.onPrimary,
} as const;

/** Sizes in CSS px, from the type scale of the design tokens. */
export const REPORT_TYPE = {
  body: scale.body.size,
  bodyLine: scale.body.line,
  caption: scale.caption.size,
  title: scale['title-lg'].size,
  section: scale['title-sm'].size,
} as const;

export const REPORT_SPACE = {
  small: tokens.space[2],
  medium: tokens.space[4],
  large: tokens.space[6],
} as const;

export const REPORT_RADIUS = tokens.radius.md;
