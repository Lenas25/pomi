import { useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { evaluateParq, PARQ_QUESTION_COUNT } from '../domain/generator/parq';
import type { Screening } from '../domain/generator/types';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { OptionRow } from '../ui/OptionRow';
import { useTheme } from '../ui/theme';

type ParqFlowProps = {
  /** The seven answers are in and, after a "yes", the notice was acknowledged. */
  onDone: (screening: Screening) => void;
};

const questionKey = (index: number) => `creator.parq.q.q${index + 1}` as TranslationKey;

/**
 * The seven PAR-Q+ general health questions, one short yes/no screen each (E10). Any "yes" shows a
 * warm notice that conviene consultar first; going on needs an explicit acknowledgement and only
 * unlocks the gentle beginner template. Pomi never presents this as medical clearance.
 */
export function ParqFlow({ onDone }: ParqFlowProps) {
  const t = useT();
  const theme = useTheme();
  const [answers, setAnswers] = useState<(boolean | null)[]>(
    Array.from({ length: PARQ_QUESTION_COUNT }, () => null),
  );
  const [index, setIndex] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);

  const outcome = evaluateParq(answers);
  const finished = index >= PARQ_QUESTION_COUNT;
  const muted = [theme.text('body'), { color: theme.color.textMuted }];

  const answer = (value: boolean) => {
    setAnswers((current) => current.map((item, at) => (at === index ? value : item)));
    setIndex((current) => current + 1);
    setAcknowledged(false);
  };

  if (!finished) {
    const current = answers[index];
    return (
      <View style={{ gap: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('creator.parq.title')}
        </Text>
        <Text style={muted}>{t('creator.parq.intro')}</Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('caption'), { color: theme.color.textMuted }]}
        >
          {t('creator.parq.progress', { n: index + 1, total: PARQ_QUESTION_COUNT })}
        </Text>
        <Card>
          <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
            {t(questionKey(index))}
          </Text>
        </Card>
        <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
          <OptionRow
            label={t('creator.parq.yes')}
            selected={current === true}
            onPress={() => answer(true)}
          />
          <OptionRow
            label={t('creator.parq.no')}
            selected={current === false}
            onPress={() => answer(false)}
          />
        </View>
        {index > 0 ? (
          <Button
            label={t('creator.parq.previous')}
            variant="ghost"
            onPress={() => setIndex((at) => Math.max(0, at - 1))}
          />
        ) : null}
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('creator.parq.disclaimer')}
        </Text>
      </View>
    );
  }

  // A "yes" to question 2 (chest pain) or 7 (only medically supervised activity): no routine is
  // generated. The person can still review the answers; nothing here is medical advice.
  if (outcome.referral) {
    return (
      <View style={{ gap: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('creator.parq.referral.title')}
        </Text>
        <Card variant="highlight">
          <View style={{ gap: theme.space[2] }}>
            <Text style={[theme.text('body'), { color: theme.color.text }]}>
              {t('creator.parq.referral.body')}
            </Text>
            {outcome.chestPain ? (
              <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                {t('creator.parq.notice.chestPain')}
              </Text>
            ) : null}
          </View>
        </Card>
        <Button
          label={t('creator.parq.previous')}
          variant="ghost"
          onPress={() => setIndex(PARQ_QUESTION_COUNT - 1)}
        />
        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('creator.parq.disclaimer')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.space[4] }}>
      {outcome.anyYes ? (
        <>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {t('creator.parq.notice.title')}
          </Text>
          <Card variant="highlight">
            <View style={{ gap: theme.space[2] }}>
              <Text style={[theme.text('body'), { color: theme.color.text }]}>
                {t('creator.parq.notice.body')}
              </Text>
              {outcome.chestPain ? (
                <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                  {t('creator.parq.notice.chestPain')}
                </Text>
              ) : null}
              <Text style={[theme.text('body'), { color: theme.color.text }]}>
                {t('creator.parq.notice.restricted')}
              </Text>
            </View>
          </Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[3],
              minHeight: theme.touch.min,
            }}
          >
            <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>
              {t('creator.parq.notice.acknowledge')}
            </Text>
            <Switch
              accessibilityLabel={t('creator.parq.notice.acknowledge')}
              value={acknowledged}
              onValueChange={setAcknowledged}
              trackColor={{ true: theme.color.brand, false: theme.color.border }}
              thumbColor={theme.color.surface}
            />
          </View>
        </>
      ) : (
        <>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {t('creator.parq.clear.title')}
          </Text>
          <Text style={muted}>{t('creator.parq.clear.body')}</Text>
        </>
      )}
      <Button
        label={t('creator.parq.continue')}
        disabled={outcome.anyYes && !acknowledged}
        onPress={() => onDone({ answers: answers.map((value) => value === true), acknowledged })}
      />
      <Button
        label={t('creator.parq.previous')}
        variant="ghost"
        onPress={() => setIndex(PARQ_QUESTION_COUNT - 1)}
      />
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
        {t('creator.parq.disclaimer')}
      </Text>
    </View>
  );
}
