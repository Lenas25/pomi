// The one "use this routine?" confirmation of the routine creator: from the result screen and from
// the editor in draft mode. It lists which exercise histories are kept, restarted or lost.
import { Alert } from 'react-native';

import type { Translate } from '../i18n';
import { templateText } from '../i18n/templateText';

import type { HistoryImpact } from './accept';

/** Resolves `true` when the person confirms. */
export function confirmAccept(t: Translate, impact: HistoryImpact): Promise<boolean> {
  const lines = [
    impact.kept.length > 0 ? t('creator.accept.kept', { count: impact.kept.length }) : null,
    impact.restarted.length > 0
      ? t('creator.accept.restarted', {
          names: impact.restarted.map((item) => templateText(item.name)).join(', '),
        })
      : null,
    impact.lost.length > 0
      ? t('creator.accept.lost', {
          names: impact.lost.map((item) => templateText(item.name)).join(', '),
        })
      : null,
    t('creator.accept.note'),
  ].filter((line): line is string => line !== null);
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      t('creator.accept.title'),
      lines.join('\n\n'),
      [
        { text: t('creator.accept.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('creator.accept.confirm'), onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}
