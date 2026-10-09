import {
  Barbell,
  ChartLineUp,
  CheckCircle,
  Drop,
  Footprints,
  House,
  MoonStars,
  type Icon,
} from 'phosphor-react-native';

import type { SectionKey } from './theme';

/** One icon per section/category, shared by the section header and the tab bar (`fill` when active). */
export const SECTION_ICONS: Record<SectionKey, Icon> = {
  hoy: House,
  gym: Barbell,
  habitos: CheckCircle,
  progreso: ChartLineUp,
  agua: Drop,
  sueno: MoonStars,
  movimiento: Footprints,
};
