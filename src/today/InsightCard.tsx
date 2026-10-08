// The "new insight" card of Hoy (PLAN §12, HANDOFF §8): the finding in prudent words, the days it
// is based on, and a way to the full list. It is marked as seen when it is shown.
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Mascot } from '../ui/Mascot';
import { useTheme } from '../ui/theme';

type InsightCardProps = {
  text: string;
  evidence: string;
  title: string;
  cardLabel: string;
  openLabel: string;
  onOpen: () => void;
  /** Called once when the card is shown. */
  onSeen: () => void;
};

export function InsightCard({
  text,
  evidence,
  title,
  cardLabel,
  openLabel,
  onOpen,
  onSeen,
}: InsightCardProps) {
  const theme = useTheme();
  useEffect(() => {
    onSeen();
    // Once per mounted card (the screen keys it by insight id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card variant="celebrate" accessibilityLabel={cardLabel}>
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }}>
          <Mascot pose="curioso" size="sm" />
          <View style={{ flex: 1, gap: theme.space[1] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { color: theme.color.text }]}
            >
              {title}
            </Text>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>{text}</Text>
            <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
              {evidence}
            </Text>
          </View>
        </View>
        <Button label={openLabel} variant="secondary" onPress={onOpen} />
      </View>
    </Card>
  );
}
