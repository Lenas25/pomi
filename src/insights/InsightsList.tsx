// A list of stored insights (Progreso, the weekly letter, "Tú hace 30 días vs. hoy"): the finding
// in prudent words and the days it is based on. Renders nothing for an empty list.
import { Text, View } from 'react-native';

import { useLocaleStore, useT } from '../i18n';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

import type { StoredInsight } from './payload';
import { insightTexts } from './text';

export function InsightsList({ insights }: { insights: readonly StoredInsight[] }) {
  const theme = useTheme();
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  if (insights.length === 0) return null;
  return (
    <View style={{ gap: theme.space[3] }}>
      {insights.map((insight) => {
        const { text, evidence } = insightTexts(insight, t, language);
        return (
          <Card key={insight.id} variant="celebrate">
            <View style={{ gap: theme.space[1] }}>
              <Text style={[theme.text('body'), { color: theme.color.text }]}>{text}</Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {evidence}
              </Text>
            </View>
          </Card>
        );
      })}
    </View>
  );
}
