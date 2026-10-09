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

/**
 * "Tu objetivo" on ONE screen, as chips: goal, priority region, level, days, minutes, equipment
 * and joints that bother (PLAN §14c).
 */
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

  const chips = <T extends string>(
    label: string,
    values: readonly T[],
    selected: (value: T) => boolean,
    name: (value: T) => string,
    onPress: (value: T) => void,
    role: 'radio' | 'checkbox' = 'radio',
  ) => (
    <View style={{ gap: theme.space[2] }}>
      {heading(label)}
      <View
        accessibilityRole={role === 'radio' ? 'radiogroup' : undefined}
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
      >
        {values.map((value) => (
          <Chip
            key={value}
            role={role}
            label={name(value)}
            selected={selected(value)}
            onPress={() => onPress(value)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ gap: theme.space[5] }}>
      <View style={{ gap: theme.space[2] }}>
        <Text style={muted}>{t('creator.stepOf', { n: 2, total: 3 })}</Text>
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
          {chips(
            t('creator.inputs.goal.label'),
            GOALS,
            (goal) => answers.goal === goal,
            (goal) => t(`creator.inputs.goal.${goal}`),
            (goal) => patch({ goal, region: goal === 'hypertrophy' ? answers.region : undefined }),
          )}
          {answers.goal === 'hypertrophy'
            ? chips(
                t('creator.inputs.region.label'),
                ['none', ...REGIONS] as const,
                (region) => (answers.region ?? 'none') === region,
                (region) => t(`creator.inputs.region.${region}`),
                (region) => patch({ region: region === 'none' ? undefined : region }),
              )
            : null}
          {chips(
            t('creator.inputs.level.label'),
            LEVELS,
            (level) => answers.level === level,
            (level) => t(`creator.inputs.level.${level}`),
            (level) => patch({ level }),
          )}
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

      {chips(
        t('creator.inputs.equipment.label'),
        EQUIPMENT,
        (equipment) => answers.equipment === equipment,
        (equipment) => t(`creator.inputs.equipment.${equipment}`),
        (equipment) => patch({ equipment }),
      )}

      <View style={{ gap: theme.space[2] }}>
        {joints ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('body-strong'), { color: theme.color.text }]}
          >
            {t('creator.inputs.joints')}
          </Text>
        ) : null}
        {chips(
          t('creator.inputs.limitations.label'),
          LIMITATIONS,
          (limitation) => answers.limitations.includes(limitation),
          (limitation) => t(`creator.inputs.limitations.${limitation}`),
          (limitation) =>
            patch({
              limitations: answers.limitations.includes(limitation)
                ? answers.limitations.filter((item) => item !== limitation)
                : [...answers.limitations, limitation],
            }),
          'checkbox',
        )}
        <Text style={muted}>{t('creator.inputs.limitations.hint')}</Text>
      </View>

      <Button label={t('creator.inputs.generate')} size="lg" onPress={() => onSubmit(answers)} />
    </View>
  );
}
