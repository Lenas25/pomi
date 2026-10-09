import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { evaluateParq, PARQ_QUESTION_COUNT } from '../domain/generator/parq';
import type { Screening } from '../domain/generator/types';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

type ParqFlowProps = {
  /** The seven answers are in and, after a "yes", the notice was acknowledged. */
  onDone: (screening: Screening) => void;
};

const questionKey = (index: number) => `creator.parq.q.q${index + 1}` as TranslationKey;

/**
 * The seven PAR-Q+ general health questions on ONE compact screen, yes/no each (E10). Any "yes" shows a
 * warm notice that conviene consultar first; going on needs an explicit acknowledgement and only
 * unlocks the gentle beginner template. Pomi never presents this as medical clearance.
 */
export function ParqFlow({ onDone }: ParqFlowProps) {
  const t = useT();
  const theme = useTheme();
  const [answers, setAnswers] = useState<(boolean | null)[]>(
    Array.from({ length: PARQ_QUESTION_COUNT }, () => null),
  );
  const [acknowledged, setAcknowledged] = useState(false);

  const outcome = evaluateParq(answers);
  const finished = answers.every((value) => value !== null);
  const muted = [theme.text('body'), { color: theme.color.textMuted }];

  const answer = (index: number, value: boolean) => {
    setAnswers((current) => current.map((item, at) => (at === index ? value : item)));
    setAcknowledged(false);
  };

  const choice = (index: number, value: boolean) => {
    const selected = answers[index] === value;
    return (
      <Pressable
        key={String(value)}
        accessibilityRole="radio"
        accessibilityLabel={t(value ? 'creator.parq.yes' : 'creator.parq.no')}
        accessibilityState={{ checked: selected }}
        onPress={() => answer(index, value)}
        style={({ pressed }) => ({
          minHeight: theme.touch.gym,
          minWidth: theme.touch.gym * 1.5,
          paddingHorizontal: theme.space[3],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.pill,
          borderWidth: theme.stroke.bold,
          borderColor: selected ? theme.color.brand : theme.color.border,
          backgroundColor: selected ? theme.color.brandSoft : theme.color.surface,
          opacity: pressed ? theme.opacity.pressed : 1,
        })}
      >
        <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
          {t(value ? 'creator.parq.yes' : 'creator.parq.no')}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: theme.space[4] }}>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
        {t('creator.stepOf', { n: 1, total: 3 })}
      </Text>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-lg'), { color: theme.color.text }]}
      >
        {t('creator.parq.title')}
      </Text>
      <Text style={muted}>{t('creator.parq.intro')}</Text>
      {answers.map((_, index) => (
        <View
          key={index}
          testID={`parq-${index + 1}`}
          style={{
            gap: theme.space[2],
            paddingBottom: theme.space[3],
            borderBottomWidth: theme.stroke.hairline,
            borderBottomColor: theme.color.border,
          }}
        >
          <Text style={[theme.text('body'), { color: theme.color.text }]}>
            {t(questionKey(index))}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t(questionKey(index))}
            style={{ flexDirection: 'row', gap: theme.space[2] }}
          >
            {choice(index, true)}
            {choice(index, false)}
          </View>
        </View>
      ))}

      {/* A "yes" to question 2 (chest pain) or 7 (only medically supervised activity): no routine
          is generated. Nothing here is medical advice. */}
      {finished && outcome.referral ? (
        <Card variant="highlight">
          <View accessibilityLiveRegion="polite" style={{ gap: theme.space[2] }}>
            <Text
              accessibilityRole="header"
              style={[theme.text('title-sm'), { color: theme.color.text }]}
            >
              {t('creator.parq.referral.title')}
            </Text>
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
      ) : null}

      {finished && !outcome.referral && outcome.anyYes ? (
        <>
          <Card variant="highlight">
            <View accessibilityLiveRegion="polite" style={{ gap: theme.space[2] }}>
              <Text
                accessibilityRole="header"
                style={[theme.text('title-sm'), { color: theme.color.text }]}
              >
                {t('creator.parq.notice.title')}
              </Text>
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
              minHeight: theme.touch.gym,
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
      ) : null}

      {outcome.referral ? null : (
        <Button
          label={t('creator.parq.continue')}
          disabled={!finished || (outcome.anyYes && !acknowledged)}
          onPress={() => onDone({ answers: answers.map((value) => value === true), acknowledged })}
        />
      )}
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
        {t('creator.parq.disclaimer')}
      </Text>
    </View>
  );
}
