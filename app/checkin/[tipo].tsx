import { useLocalSearchParams } from 'expo-router';

import { CheckinScreen } from '../../src/checkin/CheckinScreen';
import { SectionPlaceholder } from '../../src/ui/SectionPlaceholder';

/** `/checkin/morning` or `/checkin/night`. Anything else falls back to the placeholder. */
export default function Checkin() {
  const { tipo } = useLocalSearchParams<{ tipo: string }>();
  if (tipo === 'morning' || tipo === 'night') return <CheckinScreen kind={tipo} />;
  return <SectionPlaceholder section="checkin" />;
}
