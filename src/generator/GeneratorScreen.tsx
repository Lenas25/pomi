import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
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
import { resolverFor } from '../i18n/templateText';
import { mergeLocales } from '../templates/localized';
import { requestNotificationSync } from '../notifications/sync';
import { loadExerciseLibrary } from '../templates/exercises';
import { Screen } from '../ui/Screen';
import { useTheme } from '../ui/theme';

import { useEditorStore } from '../editor/editorStore';

import { acceptGenerated, draftEditorSource, loadAcceptContext, prepareAccept } from './accept';
import { confirmAccept } from './confirmAccept';
import { FALLBACK_DEFAULTS, loadWizardDefaults, type WizardDefaults } from './defaults';
import { InputsForm, type WizardAnswers } from './InputsForm';
import { ParqFlow } from './ParqFlow';
import { ProposalView } from './ProposalView';

/**
 * Renders the program in Spanish and in English and merges the texts into `{ es, en }`, so a
 * generated routine follows the language switch like the bundled templates (names come from i18n).
 */
function bilingual(
  render: (resolver: TextResolver) => GeneratedProgram | null,
): GeneratedProgram | null {
  const es = render(resolverFor('es'));
  const en = render(resolverFor('en'));
  return es && en ? { ...es, program: mergeLocales(es.program, en.program) } : es;
}

type Step =
  | { name: 'parq' }
  | { name: 'inputs'; screening: Screening }
  | { name: 'proposal'; screening: Screening; generated: GeneratedProgram };

/** Gym > "Crear mi rutina": PAR-Q+ -> inputs -> editable proposal -> accept (PLAN §14c). */
export function GeneratorScreen() {
  const t = useT();
  const theme = useTheme();
  const library = useMemo(() => loadExerciseLibrary(), []);
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
      const result = generateProgram(input, library, resolverFor('es'));
      if (!result.ok) {
        setError(
          result.reason === 'noExercises'
            ? t('creator.errors.noExercises')
            : result.reason === 'referralRequired'
              ? t('creator.errors.referral')
              : t('creator.errors.screening'),
        );
        return;
      }
      setError(null);
      const generated =
        bilingual((resolver) => {
          const rendered = generateProgram(input, library, resolver);
          return rendered.ok ? rendered.value : null;
        }) ?? result.value;
      setStep({ name: 'proposal', screening, generated });
    },
    [library, t],
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
        const prepared = prepareAccept(
          generated,
          await loadAcceptContext(repos),
          resolverFor('es'),
          resolverFor('en'),
        );
        if (!prepared.ok) {
          setFailed(true);
          return;
        }
        const confirmed = await confirmAccept(t, prepared.impact);
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

  /** "Ajustar": the full editor on the proposal, as a draft (nothing stored until "Usar"). */
  const adjust = useCallback(async (generated: GeneratedProgram) => {
    setFailed(false);
    try {
      const context = await loadAcceptContext(getRepositories());
      const prepared = prepareAccept(generated, context, resolverFor('es'), resolverFor('en'));
      const source = prepared.ok ? draftEditorSource(prepared, context) : null;
      if (!source) {
        setFailed(true);
        return;
      }
      useEditorStore.getState().open(source);
      router.push('/editar-programa');
    } catch {
      setFailed(true);
    }
  }, []);

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
                bilingual((resolver) =>
                  swapExercise(generated, library, resolver, sessionId, exerciseId, replacementId),
                ),
              )
            }
            onRemove={(sessionId, exerciseId) =>
              edit((generated) =>
                bilingual((resolver) =>
                  removeExercise(generated, library, resolver, sessionId, exerciseId),
                ),
              )
            }
            onAccept={() => void accept(step.generated)}
            onAdjust={() => void adjust(step.generated)}
            onBack={() => setStep({ name: 'inputs', screening: step.screening })}
          />
        ) : null}
      </View>
    </Screen>
  );
}
