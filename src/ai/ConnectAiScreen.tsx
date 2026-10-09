import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { getRepositories } from '../db';
import { draftFor, validateDraft, type AiDraft, type AiFormError } from '../domain/ai/form';
import {
  AI_PRESETS,
  AI_PROVIDERS,
  MAX_OUTPUT_TOKEN_CHOICES,
  sameDestination,
  type AiProviderId,
} from '../domain/ai/providers';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import type { AiErrorCode } from './adapters';
import { disconnect, saveConnection, testConnection } from './connection';
import { getAiKeyStore } from './keyStore';
import { useAiStatus, type AiStatus } from './useAiStatus';

type Notice =
  | { kind: 'ok'; text: 'saved' | 'testOk' | 'disconnected' }
  | { kind: 'error'; code: AiErrorCode | 'saveFailed' };

type FieldErrors = Partial<Record<'url' | 'model' | 'key', AiFormError>>;

/** Ajustes > "Conectar mi IA" (PLAN §14d): explicit opt-in, provider, model, key (secure store). */
export function ConnectAiScreen() {
  const { status, reload } = useAiStatus();
  const [first, setFirst] = useState<Extract<AiStatus, { loaded: true }> | null>(null);
  // The form starts from the FIRST read; later reloads (after saving) must not reset what is typed.
  if (status.loaded && first === null) setFirst(status);
  if (first === null || !status.loaded) return <Screen>{null}</Screen>;
  return <ConnectAiForm initial={first} status={status} reload={reload} />;
}

type FormProps = {
  initial: Extract<AiStatus, { loaded: true }>;
  status: Extract<AiStatus, { loaded: true }>;
  reload: () => Promise<void>;
};

function ConnectAiForm({ initial, status, reload }: FormProps) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [optedIn, setOptedIn] = useState(initial.connection?.enabled === true);
  const [draft, setDraft] = useState<AiDraft>(() => ({
    ...draftFor(initial.connection?.provider ?? 'openai', initial.connection),
    hasStoredKey: initial.hasKey,
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | 'disconnect' | null>(null);

  const change = (patch: Partial<AiDraft>) => {
    const next = { ...draft, ...patch };
    // A stored key only counts for the SAME provider and origin it was saved for.
    setDraft({ ...next, hasStoredKey: status.hasKey && sameDestination(status.connection, next) });
    setErrors({});
    setNotice(null);
  };
  const pickProvider = (provider: AiProviderId) => change(draftFor(provider, status.connection));

  const save = async () => {
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy('save');
    try {
      await saveConnection(
        getRepositories(),
        getAiKeyStore(),
        status.connection,
        result.connection,
        result.key,
      );
      setDraft({ ...draft, keyInput: '', hasStoredKey: draft.hasStoredKey || result.key !== null });
      setNotice({ kind: 'ok', text: 'saved' });
      await reload();
    } catch {
      setNotice({ kind: 'error', code: 'saveFailed' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setBusy('test');
    setNotice(null);
    // Tests what is on screen: a typed key is used for this call only (saved with "Guardar").
    const stored = getAiKeyStore();
    const keyStore = result.key !== null ? { ...stored, read: async () => result.key } : stored;
    const outcome = await testConnection(result.connection, language, { keyStore });
    setNotice(outcome.ok ? { kind: 'ok', text: 'testOk' } : { kind: 'error', code: outcome.error });
    setBusy(null);
  };

  const turnOff = async () => {
    setBusy('disconnect');
    try {
      await disconnect(getRepositories(), getAiKeyStore());
      setDraft({ ...draft, keyInput: '', hasStoredKey: false });
      setOptedIn(false);
      setNotice({ kind: 'ok', text: 'disconnected' });
      await reload();
    } catch {
      setNotice({ kind: 'error', code: 'saveFailed' });
    } finally {
      setBusy(null);
    }
  };

  const preset = AI_PRESETS[draft.provider];
  const paragraph = (title: string, body: string) => (
    <View style={{ gap: theme.space[1] }}>
      <Text
        accessibilityRole="header"
        style={[theme.text('title-sm'), { color: theme.color.text }]}
      >
        {title}
      </Text>
      <Text style={[theme.text('body'), { color: theme.color.text }]}>{body}</Text>
    </View>
  );
  const canDisconnect = status.connection?.enabled === true || status.hasKey;

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        <Text
          accessibilityRole="header"
          style={[theme.text('title-lg'), { color: theme.color.text }]}
        >
          {t('ai.connect.title')}
        </Text>
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('ai.connect.intro')}
        </Text>
        <Card variant="highlight">
          <View style={{ gap: theme.space[3] }}>
            {paragraph(t('ai.connect.privacyTitle'), t('ai.connect.privacyBody'))}
            {paragraph(t('ai.connect.costTitle'), t('ai.connect.costBody'))}
          </View>
        </Card>

        {!optedIn ? (
          <Button label={t('ai.connect.enable')} onPress={() => setOptedIn(true)} />
        ) : (
          <Card>
            <View style={{ gap: theme.space[3] }}>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('ai.connect.provider')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {AI_PROVIDERS.map((id) => (
                  <Chip
                    key={id}
                    label={t(`ai.connect.providers.${id}`)}
                    selected={draft.provider === id}
                    onPress={() => pickProvider(id)}
                  />
                ))}
              </View>

              {preset.baseUrl === null ? (
                <>
                  <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                    {t('ai.connect.customHint')}
                  </Text>
                  <TextField
                    label={t('ai.connect.baseUrl')}
                    value={draft.customBaseUrl}
                    onChangeText={(customBaseUrl) => change({ customBaseUrl })}
                    placeholder={t('ai.connect.baseUrlPlaceholder')}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={300}
                    error={errors.url ? t(`ai.connect.${errors.url}`) : undefined}
                  />
                </>
              ) : null}

              <TextField
                label={t('ai.connect.model')}
                value={draft.model}
                onChangeText={(model) => change({ model })}
                placeholder={t('ai.connect.modelPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={200}
                error={errors.model ? t(`ai.connect.${errors.model}`) : undefined}
              />
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {preset.modelsDocs !== ''
                  ? t('ai.connect.modelHintDocs', { docs: preset.modelsDocs })
                  : t('ai.connect.modelHint')}
              </Text>

              <TextField
                label={preset.keyRequired ? t('ai.connect.apiKey') : t('ai.connect.apiKeyOptional')}
                value={draft.keyInput}
                onChangeText={(keyInput) => change({ keyInput })}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={600}
                error={errors.key ? t(`ai.connect.${errors.key}`) : undefined}
              />
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {draft.hasStoredKey ? t('ai.connect.apiKeyStored') : t('ai.connect.apiKeyNote')}
              </Text>

              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('ai.connect.maxTokens')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {MAX_OUTPUT_TOKEN_CHOICES.map((count) => (
                  <Chip
                    key={count}
                    label={t('ai.connect.tokens', { count })}
                    selected={draft.maxOutputTokens === count}
                    onPress={() => change({ maxOutputTokens: count })}
                  />
                ))}
              </View>

              <Button
                label={t('ai.connect.save')}
                onPress={() => void save()}
                loading={busy === 'save'}
                disabled={busy !== null}
              />
              <Button
                label={t('ai.connect.test')}
                variant="secondary"
                onPress={() => void test()}
                loading={busy === 'test'}
                disabled={busy !== null}
              />
            </View>
          </Card>
        )}

        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              theme.text('body'),
              { color: notice.kind === 'ok' ? theme.color.text : theme.color.error },
            ]}
          >
            {notice.kind === 'ok'
              ? t(`ai.connect.${notice.text}`)
              : notice.code === 'saveFailed'
                ? t('ai.connect.saveFailed')
                : t(`ai.errors.${notice.code}`)}
          </Text>
        ) : null}

        {canDisconnect ? (
          <Button
            label={t('ai.connect.disconnect')}
            variant="danger"
            onPress={() => void turnOff()}
            loading={busy === 'disconnect'}
            disabled={busy !== null}
          />
        ) : null}
        <Button label={t('settings.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
