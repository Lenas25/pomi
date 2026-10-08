import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { getRepositories } from '../db';
import { routeIntent, selectContext } from '../domain/ai/context';
import type { AiChatEntry } from '../domain/ai/history';
import { buildAiRequest, MAX_QUESTION_LENGTH, type AiRequest } from '../domain/ai/prompt';
import { useLocaleStore, useT } from '../i18n';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import type { AiErrorCode } from './adapters';
import { askAndRecord, promptStringsFor } from './connection';
import { getAiKeyStore } from './keyStore';
import { loadAiSnapshot } from './loadAiData';
import { useAiStatus } from './useAiStatus';

/** The reviewed request: exactly this object is sent when the person taps "Enviar". */
type Pending = { question: string; request: AiRequest };

type Problem = AiErrorCode | 'loadFailed' | 'questionEmpty';

/** "Pregúntale a Pomi": question -> preview of the exact outgoing text -> "Enviar". */
export function AskAiScreen() {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const { status } = useAiStatus();
  const [history, setHistory] = useState<AiChatEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [includeFoodNotes, setIncludeFoodNotes] = useState(false);
  const [includeDayNotes, setIncludeDayNotes] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<'review' | 'send' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [cleared, setCleared] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await getRepositories().settings.get('aiChat')) ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.get('aiChat')
      .then((stored) => {
        if (!cancelled) setHistory(stored ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Any change after the review invalidates it: the preview must always be what is sent.
  const edit = (apply: () => void) => {
    apply();
    setPending(null);
    setProblem(null);
    setCleared(false);
  };

  const review = async () => {
    if (question.trim() === '') {
      setProblem('questionEmpty');
      return;
    }
    setBusy('review');
    setProblem(null);
    try {
      const snapshot = await loadAiSnapshot(getRepositories(), new Date(), language);
      const context = selectContext(snapshot, routeIntent(question), {
        includeFoodNotes,
        includeDayNotes,
      });
      setPending({
        question,
        request: buildAiRequest(question, context, promptStringsFor(language)),
      });
    } catch {
      setProblem('loadFailed');
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!pending || !status.loaded || !status.connection) return;
    setBusy('send');
    setProblem(null);
    try {
      const result = await askAndRecord(
        getRepositories(),
        status.connection,
        pending.question,
        pending.request,
        { keyStore: getAiKeyStore() },
      );
      if (result.ok) {
        setQuestion('');
        setPending(null);
        await loadHistory();
      } else {
        setProblem(result.error);
      }
    } catch {
      setProblem('loadFailed');
    } finally {
      setBusy(null);
    }
  };

  const clearHistory = async () => {
    try {
      await getRepositories().settings.remove('aiChat');
      setHistory([]);
      setCleared(true);
    } catch {
      setProblem('loadFailed');
    }
  };

  const header = (
    <Text accessibilityRole="header" style={[theme.text('title-lg'), { color: theme.color.text }]}>
      {t('ai.ask.title')}
    </Text>
  );

  if (!status.loaded) return <Screen>{null}</Screen>;
  if (!status.ready || !status.connection) {
    return (
      <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
          {header}
          <Text style={[theme.text('body'), { color: theme.color.text }]}>
            {t('ai.ask.notConnected')}
          </Text>
          <Button
            label={t('ai.connect.entryTitle')}
            onPress={() => router.replace('/conectar-ia')}
          />
          <Button label={t('settings.back')} variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const provider = t(`ai.connect.providers.${status.connection.provider}`);
  const toggle = (label: string, value: boolean, onChange: (next: boolean) => void) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space[3],
        minHeight: theme.touch.min,
      }}
    >
      <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={(next) => edit(() => onChange(next))}
        trackColor={{ true: theme.color.brand, false: theme.color.border }}
        thumbColor={theme.color.surface}
      />
    </View>
  );

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
        {header}
        <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
          {t('ai.ask.intro')}
        </Text>

        {history.length === 0 ? (
          <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
            {t('ai.ask.empty')}
          </Text>
        ) : (
          history.map((entry, index) => (
            <Card
              key={`${entry.at}-${index}`}
              variant={entry.role === 'user' ? 'default' : 'highlight'}
            >
              <View style={{ gap: theme.space[1] }}>
                <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                  {entry.role === 'user' ? t('ai.ask.you') : t('ai.ask.pomi')}
                </Text>
                <Text selectable style={[theme.text('body'), { color: theme.color.text }]}>
                  {entry.text}
                </Text>
              </View>
            </Card>
          ))
        )}

        <TextField
          label={t('ai.ask.question')}
          value={question}
          onChangeText={(text) => edit(() => setQuestion(text))}
          placeholder={t('ai.ask.placeholder')}
          maxLength={MAX_QUESTION_LENGTH}
          multiline
        />
        {toggle(t('ai.ask.includeFood'), includeFoodNotes, setIncludeFoodNotes)}
        {toggle(t('ai.ask.includeNotes'), includeDayNotes, setIncludeDayNotes)}

        {pending ? (
          <Card variant="highlight">
            <View style={{ gap: theme.space[2] }}>
              <Text
                accessibilityRole="header"
                style={[theme.text('title-sm'), { color: theme.color.text }]}
              >
                {t('ai.ask.previewTitle')}
              </Text>
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('ai.ask.previewHint', { provider })}
              </Text>
              {pending.request.messages.map((message, index) => (
                <Text
                  key={index}
                  selectable
                  testID="ai-preview-message"
                  style={[theme.text('caption'), { color: theme.color.text }]}
                >
                  {message.content}
                </Text>
              ))}
              <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {t('ai.ask.instructions')}
              </Text>
              <Text selectable style={[theme.text('caption'), { color: theme.color.textMuted }]}>
                {pending.request.system}
              </Text>
              <Button
                label={t('ai.ask.send')}
                onPress={() => void send()}
                loading={busy === 'send'}
                disabled={busy !== null}
              />
              <Button
                label={t('ai.ask.edit')}
                variant="ghost"
                onPress={() => edit(() => undefined)}
                disabled={busy !== null}
              />
            </View>
          </Card>
        ) : (
          <Button
            label={t('ai.ask.review')}
            onPress={() => void review()}
            loading={busy === 'review'}
            disabled={busy !== null}
          />
        )}

        {problem ? (
          <Text
            accessibilityRole="alert"
            style={[theme.text('body'), { color: theme.color.error }]}
          >
            {problem === 'loadFailed' || problem === 'questionEmpty'
              ? t(`ai.ask.${problem}`)
              : t(`ai.errors.${problem}`)}
          </Text>
        ) : null}
        {cleared ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[theme.text('caption'), { color: theme.color.textMuted }]}
          >
            {t('ai.ask.cleared')}
          </Text>
        ) : null}

        <Text style={[theme.text('caption'), { color: theme.color.textMuted }]}>
          {t('ai.ask.changesNote')} {t('ai.ask.disclaimer')}
        </Text>
        {history.length > 0 ? (
          <Button label={t('ai.ask.clear')} variant="ghost" onPress={() => void clearHistory()} />
        ) : null}
        <Button label={t('settings.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
