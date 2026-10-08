import { Text, View } from 'react-native';

import { ACTIVITY_KINDS, activityReplyKey, type ActivityKind } from '../domain/habits/activity';
import { useT, type TranslationKey } from '../i18n';
import type { MascotPose } from '../ui/assets';
import { Card } from '../ui/Card';
import { MascotBubble } from '../ui/MascotBubble';
import { OptionRow } from '../ui/OptionRow';
import { useTheme } from '../ui/theme';

const LABELS = {
  gym: 'activity.gym',
  walk: 'activity.walk',
  none: 'activity.none',
} as const satisfies Record<ActivityKind, TranslationKey>;

const POSES = {
  gym: 'celebra',
  walk: 'camina',
  none: 'tranqui',
} as const satisfies Record<ActivityKind, MascotPose>;

type ActivityCardProps = {
  answer: ActivityKind | undefined;
  onAnswer: (kind: ActivityKind) => void;
};

/**
 * In-app "¿Te moviste hoy?" (PLAN §14b). One answer per day, changeable. "Hoy no" gets a kind
 * reply and is never a miss. (The notification-action version comes with the scheduler, M6.)
 */
export function ActivityCard({ answer, onAnswer }: ActivityCardProps) {
  const theme = useTheme();
  const t = useT();
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {t('activity.title')}
        </Text>
        <View accessibilityRole="radiogroup" style={{ gap: theme.space[2] }}>
          {ACTIVITY_KINDS.map((kind) => (
            <OptionRow
              key={kind}
              label={t(LABELS[kind])}
              selected={answer === kind}
              onPress={() => onAnswer(kind)}
            />
          ))}
        </View>
        {answer ? (
          <MascotBubble pose={POSES[answer]} message={t(activityReplyKey(answer))} size="sm" />
        ) : null}
      </View>
    </Card>
  );
}
