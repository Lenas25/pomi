import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router } from 'expo-router';

import { getDatabase, getRepositories } from '../db';
import { evaluateParq } from '../domain/generator/parq';
import { generateProgram } from '../domain/generator/generate';
import { removeExercise, swapExercise } from '../domain/generator/edit';
import type {
  GeneratedProgram,
  GeneratorInput,
  Screening,
  TextResolver,
} from '../domain/generator/types';
import { useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { requestNotificationSync } from '../notifications/sync';
import { loadExerciseLibrary } from '../templates/exercises';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { acceptGenerated, loadAcceptContext, prepareAccept } from './accept';
import { FALLBACK_DEFAULTS, loadWizardDefaults, type WizardDefaults } from './defaults';
import { InputsForm, type WizardAnswers } from './InputsForm';
import { ParqFlow } from './ParqFlow';
import { ProposalView } from './ProposalView';

type Step =
  | { name: 'parq' }
  | { name: 'inputs'; screening: Screening }
  | { name: 'proposal'; screening: Screening; generated: GeneratedProgram };

/** Gym > "Crear mi rutina": PAR-Q+ -> inputs -> editable proposal -> accept (PLAN §14c). */
export function GeneratorScreen() {
  const t = useT();
  const theme = useTheme();
  const library = useMemo(() => loadExerciseLibrary(), []);
  const resolver = useMemo<TextResolver>(
    () => (key, params) => t(key as TranslationKey, params),
    [t],
  );
  const [step, setStep] = useState<Step>({ name: 'parq' });
  const [defaults, setDefaults] = useState<WizardDefaults>(FALLBACK_DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadWizardDefaults(getRepositories())
      .then((loaded) => {
        if (!cancelled) setDefaults(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(
    (screening: Screening, answers: WizardAnswers) => {
      const input: GeneratorInput = {
        goal: answers.goal,
        focusRegion: answers.region,
        level: answers.level,
        daysPerWeek: answers.daysPerWeek,
        sessionMin: answers.sessionMin,
        equipment: answers.equipment,
        limitations: answers.limitations,
        screening,
      };
      const result = generateProgram(input, library, resolver);
      if (!result.ok) {
        setError(
          result.reason === 'noExercises'
            ? t('creator.errors.noExercises')
            : t('creator.errors.screening'),
        );
        return;
      }
      setError(null);
      setStep({ name: 'proposal', screening, generated: result.value });
    },
    [library, resolver, t],
  );

  const edit = useCallback((action: (generated: GeneratedProgram) => GeneratedProgram | null) => {
    setStep((current) => {
      if (current.name !== 'proposal') return current;
      const next = action(current.generated);
      return next ? { ...current, generated: next } : current;
    });
  }, []);

  const accept = useCallback(
    async (generated: GeneratedProgram) => {
      if (busy) return;
      setBusy(true);
      setFailed(false);
      try {
        const repos = getRepositories();
        const prepared = prepareAccept(generated, await loadAcceptContext(repos));
        if (!prepared.ok) {
          setFailed(true);
          return;
        }
        const lines = [
          prepared.impact.kept.length > 0
            ? t('creator.accept.kept', { count: prepared.impact.kept.length })
            : null,
          prepared.impact.lost.length > 0
            ? t('creator.accept.lost', {
                names: prepared.impact.lost.map((item) => item.name).join(', '),
              })
            : null,
          t('creator.accept.note'),
        ].filter((line): line is string => line !== null);
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t('creator.accept.title'),
            lines.join('\n\n'),
            [
              { text: t('creator.accept.cancel'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('creator.accept.confirm'), onPress: () => resolve(true) },
            ],
            { onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
        await acceptGenerated(getDatabase(), repos, prepared.items);
        void requestNotificationSync('dataChanged');
        router.replace('/(tabs)/gym');
      } catch (cause) {
        if (__DEV__) console.error('Could not save the generated routine', cause);
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ paddingVertical: theme.space[4] }}>
        {step.name === 'parq' ? (
          <ParqFlow onDone={(screening) => setStep({ name: 'inputs', screening })} />
        ) : null}
        {step.name === 'inputs' ? (
          <>
            <InputsForm
              defaults={defaults}
              restricted={evaluateParq(step.screening.answers).anyYes}
              joints={evaluateParq(step.screening.answers).joints}
              onSubmit={(answers) => generate(step.screening, answers)}
            />
            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[theme.text('body'), { color: theme.color.error }]}
              >
                {error}
              </Text>
            ) : null}
          </>
        ) : null}
        {step.name === 'proposal' ? (
          <ProposalView
            generated={step.generated}
            library={library}
            busy={busy}
            failed={failed}
            onSwap={(sessionId, exerciseId, replacementId) =>
              edit((generated) =>
                swapExercise(generated, library, resolver, sessionId, exerciseId, replacementId),
              )
            }
            onRemove={(sessionId, exerciseId) =>
              edit((generated) =>
                removeExercise(generated, library, resolver, sessionId, exerciseId),
              )
            }
            onAccept={() => void accept(step.generated)}
            onBack={() => setStep({ name: 'inputs', screening: step.screening })}
          />
        ) : null}
      </View>
    </Screen>
  );
}
