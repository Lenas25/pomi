import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { useLocaleStore, useT } from '../i18n';
import { InsightsList } from '../insights/InsightsList';
import { suggestionTexts } from '../suggestions/text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Mascot } from '../ui/Mascot';
import { Screen } from '../ui/Screen';
import { SuggestionCard } from '../ui/SuggestionCard';
import { Toast } from '../ui/Toast';
import { useTheme } from '../ui/theme';

import { reviewLineText, weekRangeText } from './text';
import { useReview } from './useReview';

function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/hoy');
}

/**
 * Revisión semanal (PLAN §10) with the "Carta de Pomi" (PLAN §14b): the week in identity language,
 * a short warm letter and the suggestions still waiting for an answer. Nothing here counts
 * streaks or points at what was missed.
 */
export function ReviewScreen() {
  const theme = useTheme();
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  const { load, reload, suggestions } = useReview();

  if (load.status === 'error') {
    return (
      <Screen>
        <EmptyState
          title={t('review.loadError')}
          body={t('empty.hoy.body')}
          action={{ label: t('review.retry'), onPress: () => void reload() }}
        />
      </Screen>
    );
  }
  if (load.status === 'loading') return <Screen>{null}</Screen>;

  const { review, suggestions: pending, insight } = load.data;

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>
        <View style={{ gap: theme.space[1] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {t('review.title')}
          </Text>
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {weekRangeText(review.weekStart, review.weekEnd, t, language)}
          </Text>
        </View>

        <Card variant="celebrate">
          <View style={{ gap: theme.space[3] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
              <Mascot pose={review.letter.tone === 'brief' ? 'tranqui' : 'hola'} size="sm" />
              <Text
                accessibilityRole="header"
                style={[theme.text('title-sm'), { flex: 1, color: theme.color.text }]}
              >
                {t('review.letterTitle')}
              </Text>
            </View>
            {review.letter.lines.map((line) => (
              <Text key={line.key} style={[theme.text('body'), { color: theme.color.text }]}>
                {reviewLineText(line, t, language)}
              </Text>
            ))}
          </View>
        </Card>

        {insight ? (
          <View style={{ gap: theme.space[2] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { color: theme.color.text }]}
            >
              {t('review.insightTitle')}
            </Text>
            <InsightsList insights={[insight]} />
          </View>
        ) : null}

        <View style={{ gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-sm'), { color: theme.color.text }]}
          >
            {t('review.summaryTitle')}
          </Text>
          {review.summary.length === 0 ? (
            <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
              {t('review.noSummary')}
            </Text>
          ) : (
            <Card>
              <View style={{ gap: theme.space[2] }}>
                {review.summary.map((line) => (
                  <Text key={line.key} style={[theme.text('body'), { color: theme.color.text }]}>
                    {reviewLineText(line, t, language)}
                  </Text>
                ))}
              </View>
            </Card>
          )}
        </View>

        <View style={{ gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-sm'), { color: theme.color.text }]}
          >
            {t('review.suggestionsTitle')}
          </Text>
          {pending.length === 0 ? (
            <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
              {t('review.noSuggestions')}
            </Text>
          ) : (
            pending.map((item) => {
              const texts = suggestionTexts(item.payload, t, language);
              return (
                <SuggestionCard
                  key={item.id}
                  text={texts.text}
                  reason={texts.reason}
                  evidence={texts.evidence}
                  cardLabel={t('suggestions.card.label')}
                  whyLabel={t('suggestions.card.why')}
                  acceptLabel={t('suggestions.card.accept')}
                  declineLabel={t('suggestions.card.decline')}
                  busy={suggestions.busy}
                  onAccept={() => void suggestions.accept(item.id)}
                  onDecline={() => void suggestions.decline(item.id)}
                />
              );
            })
          )}
        </View>

        <Button label={t('review.close')} variant="ghost" onPress={leave} />
      </View>

      {suggestions.notice ? (
        <View style={{ position: 'absolute', top: theme.space[2], left: 0, right: 0 }}>
          <Toast
            key={suggestions.notice.id}
            variant={suggestions.notice.variant}
            title={suggestions.notice.title}
            subtitle={suggestions.notice.subtitle}
            onHide={suggestions.clearNotice}
          />
        </View>
      ) : null}
    </Screen>
  );
}
