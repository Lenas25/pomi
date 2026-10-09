import { useState } from 'react';
import { Text, View } from 'react-native';

import type { ExerciseLibrary } from '../domain/generator/library';
import { swapOptions } from '../domain/generator/edit';
import type { GeneratedProgram, GeneratorWarning, Muscle } from '../domain/generator/types';
import { useLocaleStore, useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useTheme } from '../ui/theme';

import { routinesOf, rulesToExplain, volumeRows } from './previewView';

type ProposalViewProps = {
  generated: GeneratedProgram;
  library: ExerciseLibrary;
  busy: boolean;
  failed: boolean;
  onSwap: (sessionId: string, exerciseId: string, replacementId: string) => void;
  onRemove: (sessionId: string, exerciseId: string) => void;
  onAccept: () => void;
  /** Opens the full program editor on this proposal (draft: nothing is stored yet). */
  onAdjust: () => void;
  onBack: () => void;
};

/**
 * The result: a plain summary first ("4 días · 45 min · glúteos · principiante"), warnings, one card
 * per routine (tap to see its exercises, swap or remove them), and behind "Ver por qué" the sets per
 * muscle against the evidence band, the WHO totals and the "por qué" of every rule. "Ajustar" opens
 * the full editor on the draft. Nothing is saved until "Usar esta rutina".
 */
export function ProposalView({
  generated,
  library,
  busy,
  failed,
  onSwap,
  onRemove,
  onAccept,
  onAdjust,
  onBack,
}: ProposalViewProps) {
  const t = useT();
  const language = useLocaleStore((state) => state.language);
  const theme = useTheme();
  const [swapping, setSwapping] = useState<{ sessionId: string; exerciseId: string } | null>(null);
  const [openRoutine, setOpenRoutine] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const byId = new Map(library.map((exercise) => [exercise.id, exercise]));
  const nameOf = (id: string) => {
    const exercise = byId.get(id);
    return exercise ? t(exercise.nameKey as TranslationKey) : id;
  };
  const muscleName = (muscle: string) => t(`creator.muscle.${muscle as Muscle}`);
  const muted = [theme.text('caption'), { color: theme.color.textMuted }];
  const heading = (text: string, level: 'title-md' | 'title-sm' = 'title-md') => (
    <Text accessibilityRole="header" style={[theme.text(level), { color: theme.color.text }]}>
      {text}
    </Text>
  );

  const warningText = (warning: GeneratorWarning): string => {
    const params = { ...warning.params };
    if (typeof params.muscle === 'string') params.muscle = muscleName(params.muscle);
    return t(`creator.preview.warnings.${warning.code}`, params);
  };

  const { summary } = generated;

  const { input } = generated;
  const plain = [
    t('creator.preview.plainDays', { days: summary.daysUsed }),
    t('creator.inputs.minutesValue', { min: input.sessionMin }),
    input.focusRegion
      ? t(`creator.inputs.region.${input.focusRegion}`)
      : t(`creator.inputs.goal.${input.goal}`),
    t(`creator.inputs.level.${input.level}`),
  ]
    .join(' · ')
    .toLowerCase();

  return (
    <View style={{ gap: theme.space[5] }}>
      <View style={{ gap: theme.space[2] }}>
        <Text style={muted}>{t('creator.stepOf', { n: 3, total: 3 })}</Text>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('creator.preview.title')}
        </Text>
        <Text testID="proposal-plain" style={[theme.text('title-sm'), { color: theme.color.text }]}>
          {plain}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('creator.preview.intro')}
        </Text>
      </View>

      {summary.warnings.length > 0 ? (
        <Card variant="highlight">
          <View style={{ gap: theme.space[2] }}>
            {heading(t('creator.preview.warnings.title'), 'title-sm')}
            {summary.warnings.map((warning, index) => (
              <Text
                key={`${warning.code}-${index}`}
                style={[theme.text('body'), { color: theme.color.text }]}
              >
                {warningText(warning)}
              </Text>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.space[3] }}>
        {heading(t('creator.preview.routines'))}
        {routinesOf(generated, language).map((routine) => {
          const expanded = openRoutine === routine.id;
          const detail = t('creator.preview.cardDetail', {
            count: routine.lines.length,
            minutes: routine.minutes,
          });
          return (
            <Card
              key={routine.id}
              onPress={() => setOpenRoutine(expanded ? null : routine.id)}
              accessibilityLabel={`${routine.name}. ${detail}`}
            >
              <View style={{ gap: theme.space[2] }} accessibilityState={{ expanded }}>
                <Text style={[theme.text('title-sm'), { color: theme.color.text }]}>
                  {routine.name}
                </Text>
                <Text style={muted}>{detail}</Text>
                {expanded
                  ? routine.lines.map((line) => {
                      const open =
                        swapping?.sessionId === line.sessionId &&
                        swapping.exerciseId === line.exerciseId;
                      const name = nameOf(line.exerciseId);
                      return (
                        <View key={line.exerciseId} style={{ gap: theme.space[1] }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: theme.space[2],
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[theme.text('body'), { color: theme.color.text }]}>
                                {name}
                              </Text>
                              <Text style={muted}>
                                {t('creator.preview.line', { sets: line.sets, reps: line.reps })}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
                          >
                            <Button
                              label={t('creator.preview.swap')}
                              variant="secondary"
                              disabled={busy}
                              onPress={() =>
                                setSwapping(
                                  open
                                    ? null
                                    : { sessionId: line.sessionId, exerciseId: line.exerciseId },
                                )
                              }
                            />
                            <Button
                              label={t('creator.preview.remove')}
                              variant="ghost"
                              disabled={busy}
                              onPress={() => {
                                setSwapping(null);
                                onRemove(line.sessionId, line.exerciseId);
                              }}
                            />
                          </View>
                          {open ? (
                            <View style={{ gap: theme.space[2] }}>
                              <Text
                                style={[theme.text('body-strong'), { color: theme.color.text }]}
                              >
                                {t('creator.preview.swapTitle', { name })}
                              </Text>
                              {swapOptions(generated, library, line.sessionId, line.exerciseId).map(
                                (option) => (
                                  <Button
                                    key={option.id}
                                    label={t(option.nameKey as TranslationKey)}
                                    variant="secondary"
                                    onPress={() => {
                                      setSwapping(null);
                                      onSwap(line.sessionId, line.exerciseId, option.id);
                                    }}
                                  />
                                ),
                              )}
                              {swapOptions(generated, library, line.sessionId, line.exerciseId)
                                .length === 0 ? (
                                <Text style={muted}>{t('creator.preview.swapNone')}</Text>
                              ) : null}
                              <Button
                                label={t('creator.preview.swapCancel')}
                                variant="ghost"
                                onPress={() => setSwapping(null)}
                              />
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  : null}
                {expanded && routine.cardioMin > 0 ? (
                  <Text style={muted}>
                    {t('generator.cardio.name', { min: routine.cardioMin })}
                  </Text>
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>

      <Button
        label={t(showWhy ? 'creator.preview.whyHide' : 'creator.preview.whyShow')}
        variant="ghost"
        onPress={() => setShowWhy((value) => !value)}
      />
      {showWhy ? (
        <>
          <View style={{ gap: theme.space[2] }}>
            {heading(t('creator.preview.volume.title'))}
            {volumeRows(generated).map((volume) => (
              <View
                key={volume.muscle}
                style={{ gap: theme.space[1] }}
                accessible
                accessibilityLabel={`${muscleName(volume.muscle)}. ${t('creator.preview.volume.row', { sets: volume.sets, min: volume.min, max: volume.max, times: volume.frequency })}. ${t(`creator.preview.volume.${volume.status}`)}`}
              >
                <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                  {muscleName(volume.muscle)}
                  {volume.priority ? ` · ${t('creator.preview.volume.priority')}` : ''}
                </Text>
                <Text style={muted}>
                  {t('creator.preview.volume.row', {
                    sets: volume.sets,
                    min: volume.min,
                    max: volume.max,
                    times: volume.frequency,
                  })}
                  {' · '}
                  {t(`creator.preview.volume.${volume.status}`)}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ gap: theme.space[2] }}>
            {heading(t('creator.preview.who.title'))}
            <Text style={[theme.text('body'), { color: theme.color.text }]}>
              {t('creator.preview.who.strength', {
                days: summary.who.strengthDays,
                target: summary.who.strengthTargetDays,
              })}
            </Text>
            {generated.input.goal === 'fatLoss' || generated.input.goal === 'health' ? (
              <>
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {t('creator.preview.who.aerobic', {
                    min: summary.who.aerobicMin,
                    target: summary.who.aerobicTargetMin,
                  })}
                </Text>
                <Text style={muted}>{t('creator.preview.who.hint')}</Text>
              </>
            ) : null}
          </View>

          <View style={{ gap: theme.space[3] }}>
            {heading(t('creator.why.title'))}
            {rulesToExplain(generated).map((rule) => (
              <View key={rule.id} style={{ gap: theme.space[1] }}>
                <Text style={[theme.text('body-strong'), { color: theme.color.text }]}>
                  {t(`creator.why.rule.${rule.id}`)}
                </Text>
                <Text style={[theme.text('body'), { color: theme.color.text }]}>
                  {rule.id === 'split'
                    ? t(`creator.why.split.${String(rule.params.split)}` as TranslationKey)
                    : t(`creator.why.body.${rule.id}`, rule.params)}
                </Text>
                <Text style={muted}>
                  {rule.evidence.join(', ')}
                  {rule.design ? ` · ${t('creator.why.design')}` : ''}
                </Text>
              </View>
            ))}
            {heading(t('creator.why.evidence'), 'title-sm')}
            {generated.evidence.map((ref) => (
              <Text key={ref.id} style={muted}>
                {`${ref.id} (${ref.source}): ${t(`creator.why.summary.${ref.id}`)}`}
              </Text>
            ))}
            {generated.input.goal === 'fatLoss' ? (
              <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
                {t('creator.preview.honesty')}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {failed ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[theme.text('body'), { color: theme.color.error }]}
        >
          {t('creator.accept.failed')}
        </Text>
      ) : null}
      <Button
        label={busy ? t('creator.preview.accepting') : t('creator.preview.accept')}
        size="lg"
        loading={busy}
        onPress={onAccept}
      />
      <Button
        label={t('creator.preview.adjust')}
        variant="secondary"
        disabled={busy}
        onPress={onAdjust}
      />
      <Button
        label={t('creator.preview.changeAnswers')}
        variant="ghost"
        disabled={busy}
        onPress={onBack}
      />
    </View>
  );
}
