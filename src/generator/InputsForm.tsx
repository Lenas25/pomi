import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  EQUIPMENT,
  GOALS,
  LEVELS,
  LIMITATIONS,
  REGIONS,
  type Equipment,
  type Goal,
  type Level,
  type Limitation,
  type Region,
} from '../domain/generator/types';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { OptionRow } from '../ui/OptionRow';
import { NumberStepper } from '../ui/Stepper';
import { useTheme } from '../ui/theme';

import type { WizardDefaults } from './defaults';

export type WizardAnswers = {
  goal: Goal;
  region: Region | undefined;
  level: Level;
  daysPerWeek: number;
  sessionMin: number;
  equipment: Equipment;
  limitations: Limitation[];
};

type InputsFormProps = {
  defaults: WizardDefaults;
  /** A PAR-Q+ "yes" was acknowledged: goal and level are fixed by the gentle template. */
  restricted: boolean;
  /** PAR-Q+ question 6 was "yes": point at the joints. */
  joints: boolean;
  onSubmit: (answers: WizardAnswers) => void;
};

/** Goal, priority region, level, days, minutes, equipment and joints that bother (PLAN §14c). */
export function InputsForm({ defaults, restricted, joints, onSubmit }: InputsFormProps) {
  const t = useT();
  const theme = useTheme();
  const [answers, setAnswers] = useState<WizardAnswers>({
    goal: defaults.goal,
    region: undefined,
    level: defaults.level,
    daysPerWeek: defaults.daysPerWeek,
    sessionMin: defaults.sessionMin,
    equipment: 'gym',
    limitations: [],
  });
  const patch = (next: Partial<WizardAnswers>) =>
    setAnswers((current) => ({ ...current, ...next }));
  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {text}
    </Text>
  );
  const muted = [theme.text('caption'), { color: theme.color.textMuted }];

  return (
    <View style={{ gap: theme.space[5] }}>
      <View style={{ gap: theme.space[2] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('creator.inputs.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('creator.inputs.intro')}
        </Text>
        {restricted ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('body-strong'), { color: theme.color.text }]}
          >
            {t('creator.inputs.restricted')}
          </Text>
        ) : null}
      </View>

      {restricted ? null : (
        <>
          <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
            {heading(t('creator.inputs.goal.label'))}
            {GOALS.map((goal) => (
              <OptionRow
                key={goal}
                label={t(`creator.inputs.goal.${goal}`)}
                selected={answers.goal === goal}
                onPress={() =>
                  patch({ goal, region: goal === 'hypertrophy' ? answers.region : undefined })
                }
              />
            ))}
          </View>

          {answers.goal === 'hypertrophy' ? (
            <View style={{ gap: theme.space[2] }}>
              {heading(t('creator.inputs.region.label'))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                <Chip
                  label={t('creator.inputs.region.none')}
                  selected={answers.region === undefined}
                  onPress={() => patch({ region: undefined })}
                />
                {REGIONS.map((region) => (
                  <Chip
                    key={region}
                    label={t(`creator.inputs.region.${region}`)}
                    selected={answers.region === region}
                    onPress={() => patch({ region })}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
            {heading(t('creator.inputs.level.label'))}
            {LEVELS.map((level) => (
              <OptionRow
                key={level}
                label={t(`creator.inputs.level.${level}`)}
                selected={answers.level === level}
                onPress={() => patch({ level })}
              />
            ))}
          </View>
        </>
      )}

      <View style={{ gap: theme.space[3] }}>
        <NumberStepper
          label={t('creator.inputs.days')}
          value={answers.daysPerWeek}
          min={2}
          max={6}
          step={1}
          onChange={(daysPerWeek) => patch({ daysPerWeek })}
        />
        <NumberStepper
          label={t('creator.inputs.minutes')}
          value={answers.sessionMin}
          min={30}
          max={90}
          step={5}
          format={(value) => t('creator.inputs.minutesValue', { min: value })}
          onChange={(sessionMin) => patch({ sessionMin })}
        />
      </View>

      <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
        {heading(t('creator.inputs.equipment.label'))}
        {EQUIPMENT.map((equipment) => (
          <OptionRow
            key={equipment}
            label={t(`creator.inputs.equipment.${equipment}`)}
            selected={answers.equipment === equipment}
            onPress={() => patch({ equipment })}
          />
        ))}
      </View>

      <View style={{ gap: theme.space[2] }}>
        {heading(t('creator.inputs.limitations.label'))}
        {joints ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('body-strong'), { color: theme.color.text }]}
          >
            {t('creator.inputs.joints')}
          </Text>
        ) : null}
        <Text style={muted}>{t('creator.inputs.limitations.hint')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {LIMITATIONS.map((limitation) => (
            <Chip
              key={limitation}
              label={t(`creator.inputs.limitations.${limitation}`)}
              selected={answers.limitations.includes(limitation)}
              onPress={() =>
                patch({
                  limitations: answers.limitations.includes(limitation)
                    ? answers.limitations.filter((item) => item !== limitation)
                    : [...answers.limitations, limitation],
                })
              }
            />
          ))}
        </View>
      </View>

      <Button label={t('creator.inputs.generate')} onPress={() => onSubmit(answers)} />
    </View>
  );
}
