import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import {
  buildStartingPoint,
  type Explanation,
  type GoalValue,
} from '../domain/onboarding/startingPoint';
import { useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { MascotBubble } from '../ui/MascotBubble';
import { NumberStepper } from '../ui/Stepper';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';
import { useOnboardingDraft } from './draftStore';
import { GymDayChips } from './questions';
import { LIMITS } from '../domain/onboarding/draft';

type StartingPointScreenProps = {
  onFinish: () => void;
  saving: boolean;
  failed: boolean;
};

function GoalCard({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-sm'), { color: theme.color.text }]}
        >
          {title}
        </Text>
        {children}
      </View>
    </Card>
  );
}

function Why({ explanation }: { explanation: Explanation }) {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
        {t('onboarding.summary.why')}
      </Text>
      <Text style={[theme.text('body'), { color: theme.color.text }]}>
        {t(explanation.key, explanation.params)}
      </Text>
    </View>
  );
}

function EditedBadge({ goal }: { goal: GoalValue }) {
  const t = useT();
  const theme = useTheme();
  if (!goal.edited) return null;
  return (
    <Text style={[theme.text('caption'), { color: theme.color.energyText }]}>
      {t('onboarding.summary.edited')}
    </Text>
  );
}

/**
 * "Tu punto de partida" (PLAN §8): water, steps, sleep and gym days computed by `src/domain`,
 * each with where the number comes from and an inline editor. Edits go back to the draft.
 */
export function StartingPointScreen({ onFinish, saving, failed }: StartingPointScreenProps) {
  const t = useT();
  const theme = useTheme();
  const draft = useOnboardingDraft((state) => state.draft);
  const update = useOnboardingDraft((state) => state.update);
  const point = buildStartingPoint(draft);
  const glasses = (count: number) => t('onboarding.summary.glasses', { count });
  const setOverride = (patch: Partial<typeof draft.goalOverrides>) =>
    update({ goalOverrides: { ...draft.goalOverrides, ...patch } });

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[5], paddingVertical: theme.space[4] }}>
        <MascotBubble pose="celebra" message={t('onboarding.summary.title')} />
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('onboarding.summary.hint')}
        </Text>

        <GoalCard title={t('onboarding.summary.waterTitle')}>
          {point.water ? (
            <>
              <NumberStepper
                label={t('onboarding.summary.waterRest')}
                value={point.water.restGlasses.value}
                onChange={(value) => setOverride({ waterRestGlasses: value })}
                step={1}
                min={1}
                max={30}
                format={glasses}
              />
              <EditedBadge goal={point.water.restGlasses} />
              <NumberStepper
                label={t('onboarding.summary.waterGym')}
                value={point.water.gymGlasses.value}
                onChange={(value) => setOverride({ waterGymGlasses: value })}
                step={1}
                min={1}
                max={30}
                format={glasses}
              />
              <EditedBadge goal={point.water.gymGlasses} />
            </>
          ) : null}
          <Why explanation={point.waterExplanation} />
        </GoalCard>

        <GoalCard title={t('onboarding.summary.stepsTitle')}>
          {point.steps.goal ? (
            <>
              <NumberStepper
                label={t('onboarding.summary.stepsTitle')}
                value={point.steps.goal.value}
                onChange={(value) => setOverride({ stepsGoal: value })}
                step={500}
                min={500}
                max={LIMITS.steps.max}
                format={(steps) => t('onboarding.summary.stepsValue', { steps })}
              />
              <EditedBadge goal={point.steps.goal} />
            </>
          ) : null}
          <Why explanation={point.steps.explanation} />
        </GoalCard>

        <GoalCard title={t('onboarding.summary.sleepTitle')}>
          <NumberStepper
            label={t('onboarding.summary.sleepTarget')}
            value={point.sleep.targetH}
            onChange={(value) => update({ sleepTargetH: value })}
            step={0.25}
            min={LIMITS.sleepTargetH.min}
            max={LIMITS.sleepTargetH.max}
            format={(value) => t('onboarding.hours', { value })}
          />
          {point.sleep.bedtime ? (
            <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
              {t('onboarding.summary.sleepBedtime', { bedtime: point.sleep.bedtime })}
            </Text>
          ) : null}
          {point.sleep.cycles.length > 0 ? (
            <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
              {t('onboarding.summary.sleepCycles', {
                options: point.sleep.cycles.map((option) => option.bedtime).join(', '),
              })}
            </Text>
          ) : null}
          <Why explanation={point.sleep.explanation} />
        </GoalCard>

        <GoalCard title={t('onboarding.summary.gymTitle')}>
          <GymDayChips />
          <Why explanation={point.gym.explanation} />
        </GoalCard>

        {failed ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('body'), { color: theme.color.error }]}
          >
            {t('onboarding.summary.error')}
          </Text>
        ) : null}
        <Button
          label={t('onboarding.summary.done')}
          onPress={onFinish}
          loading={saving}
          size="lg"
        />
      </View>
    </Screen>
  );
}
