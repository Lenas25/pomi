// The "new insight" card of Hoy (PLAN §12, HANDOFF §8): the finding in prudent words, the days it
// is based on, and a way to the full list. It is marked as seen once it has really been in front
// of the person: its screen focused and the card mounted for `SEEN_AFTER_MS` (not on mount).
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Mascot } from '../ui/Mascot';
import { useTheme } from '../ui/theme';

/** How long the card must stay on a focused screen before it counts as seen. */
export const SEEN_AFTER_MS = 1000;

type InsightCardProps = {
  text: string;
  evidence: string;
  title: string;
  cardLabel: string;
  openLabel: string;
  onOpen: () => void;
  /** Called once, after the card was visible on a focused screen for `SEEN_AFTER_MS`. */
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
  const onSeenRef = useRef(onSeen);
  const reported = useRef(false);
  useEffect(() => {
    onSeenRef.current = onSeen;
  });
  // The timer restarts each time the screen regains focus and is cancelled when it loses it or
  // the card unmounts; once reported it never fires again (the screen keys the card by id).
  useFocusEffect(
    useCallback(() => {
      if (reported.current) return undefined;
      const timer = setTimeout(() => {
        reported.current = true;
        onSeenRef.current();
      }, SEEN_AFTER_MS);
      return () => clearTimeout(timer);
    }, []),
  );
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
