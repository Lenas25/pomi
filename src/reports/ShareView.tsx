import { useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { useLocaleStore, useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';
import { StoredPhoto } from '../photos/StoredPhoto';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { OptionRow } from '../ui/OptionRow';
import { Screen } from '../ui/Screen';
import { TextField } from '../ui/TextField';
import { useTheme } from '../ui/theme';

import { buildReport } from './buildReport';
import { previewText } from './prepare';
import { applyTemplate, defaultSelection, toggleSection } from './templates';
import {
  AVAILABLE_SECTIONS,
  MAX_NOTE_LENGTH,
  REPORT_FORMATS,
  REPORT_PERIODS,
  REPORT_SECTIONS,
  REPORT_TEMPLATES,
  type ReportData,
  type ReportFormat,
  type ReportModel,
  type ReportSelection,
} from './types';

export type ShareFailure = 'failed' | 'unavailable';

type ShareViewProps = {
  data: ReportData;
  now: Date;
  /** Prepares and shares the report. Rejects on failure; resolves `unavailable` when it cannot share. */
  onShare: (
    model: ReportModel,
    format: ReportFormat,
  ) => Promise<'shared' | 'dismissed' | 'unavailable'>;
};

/**
 * "Compartir progreso": choose what / period / for whom / format and an optional note, see EXACTLY
 * what will be sent, then share. Nothing is built for a section that is not ticked.
 */
export function ShareView({ data, now, onShare }: ShareViewProps) {
  const t = useT();
  const theme = useTheme();
  const language = useLocaleStore((state) => state.language);
  const [selection, setSelection] = useState<ReportSelection>(() => defaultSelection('custom'));
  const [format, setFormat] = useState<ReportFormat>('text');
  const [step, setStep] = useState<'choose' | 'preview'>('choose');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ShareFailure | null>(null);

  const model = useMemo(() => buildReport(data, selection, now), [data, selection, now]);
  const preview = useMemo(
    () => previewText(model, format, { t, language }),
    [model, format, t, language],
  );
  const photos = model.sections.find((section) => section.kind === 'photos');
  const canShare = selection.sections.length > 0;

  const share = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const outcome = await onShare(model, format);
      if (outcome === 'unavailable') setFailure('unavailable');
    } catch (error) {
      if (__DEV__) console.error('Could not share the report', error);
      setFailure('failed');
    } finally {
      setBusy(false);
    }
  };

  const muted = [theme.text('caption'), { color: theme.color.textMuted }];
  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[theme.text('title-sm'), { color: theme.color.text }]}>
      {text}
    </Text>
  );

  if (step === 'preview') {
    return (
      <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ gap: theme.space[3], paddingVertical: theme.space[4] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {t('share.previewTitle')}
          </Text>
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
            {t('share.previewHint')}
          </Text>
          <Card>
            <Text
              accessibilityLabel={preview}
              selectable
              style={[theme.text('body'), { color: theme.color.text }]}
            >
              {preview}
            </Text>
          </Card>
          {format === 'pdf' && photos?.kind === 'photos' && photos.items.length > 0 ? (
            <View style={{ gap: theme.space[2] }}>
              {heading(t('share.previewPhotos', { count: photos.items.length }))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {photos.items.map((item) => (
                  <View key={item.name} style={{ width: '31%' }}>
                    <StoredPhoto
                      name={item.name}
                      label={t('reports.photos.alt', { pose: item.pose, date: item.date })}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {failure ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[theme.text('body'), { color: theme.color.error }]}
            >
              {failure === 'unavailable' ? t('share.unavailable') : t('share.failed')}
            </Text>
          ) : null}
          <Button
            label={busy ? t('share.preparing') : t('share.send')}
            loading={busy}
            onPress={() => void share()}
          />
          <Button
            label={t('share.edit')}
            variant="secondary"
            disabled={busy}
            onPress={() => setStep('choose')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ gap: theme.space[4], paddingVertical: theme.space[4] }}>
        <View style={{ gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text }]}
          >
            {t('share.title')}
          </Text>
          <Text style={[theme.text('body'), { color: theme.color.textMuted }]}>
            {t('share.intro')}
          </Text>
        </View>

        <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
          {heading(t('share.forWhom'))}
          {REPORT_TEMPLATES.map((template) => (
            <OptionRow
              key={template}
              label={t(`reports.template.${template}`)}
              selected={selection.template === template}
              onPress={() => setSelection((current) => applyTemplate(current, template))}
            />
          ))}
          <Text style={muted}>{t(`share.templateHint.${selection.template}`)}</Text>
        </View>

        <View style={{ gap: theme.space[2] }}>
          {heading(t('share.what'))}
          {REPORT_SECTIONS.map((id) => {
            const available = AVAILABLE_SECTIONS.includes(id);
            const label = t(`reports.section.${id}`);
            return (
              <View key={id} style={{ gap: theme.space[1] }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space[3],
                    minHeight: theme.touch.min,
                  }}
                >
                  <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>
                    {label}
                  </Text>
                  <Switch
                    accessibilityLabel={label}
                    disabled={!available}
                    value={selection.sections.includes(id)}
                    onValueChange={() => setSelection((current) => toggleSection(current, id))}
                    trackColor={{ true: theme.color.brand, false: theme.color.border }}
                    thumbColor={theme.color.surface}
                  />
                </View>
                <Text style={muted}>{t(`share.sectionHint.${id}`)}</Text>
                {id === 'habits' && selection.sections.includes('habits') ? (
                  <View style={{ gap: theme.space[1] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.space[3],
                        minHeight: theme.touch.min,
                      }}
                    >
                      <Text style={[theme.text('body'), { flex: 1, color: theme.color.text }]}>
                        {t('share.foodNotes')}
                      </Text>
                      <Switch
                        accessibilityLabel={t('share.foodNotes')}
                        value={selection.foodNotes}
                        onValueChange={(value) =>
                          setSelection((current) => ({ ...current, foodNotes: value }))
                        }
                        trackColor={{ true: theme.color.brand, false: theme.color.border }}
                        thumbColor={theme.color.surface}
                      />
                    </View>
                    <Text style={muted}>{t('share.foodNotesHint')}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
          {heading(t('share.period'))}
          {REPORT_PERIODS.map((period) => (
            <OptionRow
              key={period}
              label={t(`share.periodOption.${period}` as TranslationKey)}
              selected={selection.period === period}
              onPress={() => setSelection((current) => ({ ...current, period }))}
            />
          ))}
        </View>

        <View style={{ gap: theme.space[2] }} accessibilityRole="radiogroup">
          {heading(t('share.format'))}
          {REPORT_FORMATS.map((option) => (
            <OptionRow
              key={option}
              label={t(`share.formatOption.${option}`)}
              selected={format === option}
              onPress={() => setFormat(option)}
            />
          ))}
          <Text style={muted}>{t(`share.formatHint.${format}`)}</Text>
        </View>

        <TextField
          label={t('share.note')}
          placeholder={t('share.notePlaceholder')}
          value={selection.note}
          maxLength={MAX_NOTE_LENGTH}
          multiline
          onChangeText={(note) => setSelection((current) => ({ ...current, note }))}
        />

        {!canShare ? (
          <Text accessibilityLiveRegion="polite" style={muted}>
            {t('share.nothingSelected')}
          </Text>
        ) : null}
        <Button
          label={t('share.preview')}
          disabled={!canShare}
          onPress={() => {
            setFailure(null);
            setStep('preview');
          }}
        />
      </View>
    </Screen>
  );
}
