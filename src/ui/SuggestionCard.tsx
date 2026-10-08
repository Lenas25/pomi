import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';

import { Button } from './Button';
import { Card } from './Card';
import { Mascot } from './Mascot';
import { useTheme } from './theme';

type SuggestionCardProps = {
  /** The proposal, phrased as a question ("¿Movemos tu hora de dormir 15 minutos antes?"). */
  text: string;
  /** The "por qué": the data that backs it, in plain language. */
  reason: string;
  /** Small print under the reason, e.g. "Basado en 7 días". */
  evidence?: string;
  /** Accessible name of the whole card ("Sugerencia de Pomi", `suggestions.card.label`). */
  cardLabel: string;
  whyLabel: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  /** Called after the card has faded out. */
  onDecline: () => void;
  /** The change is being applied: both buttons wait. */
  busy?: boolean;
};

/**
 * HANDOFF §4 SuggestionCard: mascot `curioso` (sm), the proposal with its reason, "Aceptar"
 * (primary) and "Ahora no" (ghost). "Ahora no" fades the card out (120 ms with reduce motion)
 * before telling the caller. Suggests, never imposes: nothing happens until a button is pressed.
 */
export function SuggestionCard({
  text,
  reason,
  evidence,
  cardLabel,
  whyLabel,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
  busy = false,
}: SuggestionCardProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const duration = reduceMotion ? theme.motion.reducedFade : theme.motion.base;
  const fade = useAnimatedStyle(() => ({ opacity: withTiming(leaving ? 0 : 1, { duration }) }));

  const decline = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(onDecline, duration);
  };

  return (
    <Animated.View style={fade} role="group" accessibilityLabel={cardLabel}>
      <Card variant="highlight">
        <View style={{ gap: theme.space[3] }}>
          <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center' }}>
            <Mascot pose="curioso" size="sm" />
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { flex: 1, color: theme.color.text }]}
            >
              {text}
            </Text>
          </View>
          <View style={{ gap: theme.space[1] }}>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>
              <Text style={theme.text('body-strong')}>{whyLabel}: </Text>
              {reason}
            </Text>
            {evidence ? (
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {evidence}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: theme.space[2], justifyContent: 'flex-end' }}>
            <Button
              label={declineLabel}
              variant="ghost"
              disabled={busy || leaving}
              onPress={decline}
            />
            <Button label={acceptLabel} loading={busy} disabled={leaving} onPress={onAccept} />
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
