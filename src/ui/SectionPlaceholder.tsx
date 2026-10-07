import { t } from '../i18n';
import type { MascotPose } from './assets';
import { EmptyState } from './EmptyState';
import { Screen } from './Screen';

export type PlaceholderSection =
  | 'hoy'
  | 'gym'
  | 'habitos'
  | 'progreso'
  | 'ajustes'
  | 'onboarding'
  | 'session'
  | 'checkin'
  | 'compartir';

const TAB_SECTIONS: readonly PlaceholderSection[] = [
  'hoy',
  'gym',
  'habitos',
  'progreso',
  'ajustes',
];

type SectionPlaceholderProps = {
  section: PlaceholderSection;
  pose?: MascotPose;
};

/** Minimal route shell used until each screen is built in its own milestone. */
export function SectionPlaceholder({ section, pose }: SectionPlaceholderProps) {
  // Tab screens skip the bottom inset (the tab bar handles it); other routes keep it.
  const edges = TAB_SECTIONS.includes(section)
    ? undefined
    : (['top', 'bottom', 'left', 'right'] as const);
  return (
    <Screen edges={edges}>
      <EmptyState
        pose={pose}
        title={t(`empty.${section}.title`)}
        body={t(`empty.${section}.body`)}
      />
    </Screen>
  );
}
