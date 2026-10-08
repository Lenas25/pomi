// The one insight slot of Hoy (HANDOFF §8: never more than one insight card): the companion card
// of "Tu ritmo" (PLAN §14b). It renders nothing when there is no card, so Hoy stays calm.
import { Text, View } from 'react-native';

import type { TodayCard } from '../domain/companion';
import { todayCardTexts } from '../companion/text';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

type InsightSlotProps = {
  card: TodayCard | undefined;
  onOpen: () => void;
  onDismiss: () => void;
};

export function InsightSlot({ card, onOpen, onDismiss }: InsightSlotProps) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  if (!card) return null;
  const { title, body } = todayCardTexts(card, t, language);
  return (
    <Card accessibilityLabel={t('companion.card.label')}>
      <View style={{ gap: theme.space[3] }}>
        <View style={{ gap: theme.space[1] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-sm'), { color: theme.color.text }]}
          >
            {title}
          </Text>
          <Text style={[theme.text('body'), { color: theme.color.text }]}>{body}</Text>
        </View>
        <Button label={t('companion.card.open')} variant="secondary" onPress={onOpen} />
        <Button label={t('companion.card.dismiss')} variant="ghost" onPress={onDismiss} />
      </View>
    </Card>
  );
}
