import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import Constants from 'expo-constants';
import {
  BatteryCharging,
  Bell,
  Barbell,
  CalendarBlank,
  FloppyDisk,
  Globe,
  Images,
  Info,
  MoonStars,
  Palette,
  PersonSimpleWalk,
  ShieldCheck,
  Target,
} from 'phosphor-react-native';

import { getRepositories } from '../../src/db';
import { useLocaleStore, useT } from '../../src/i18n';
import { LANGUAGE_LABELS, THEME_LABELS } from '../../src/settings/appearance';
import {
  buildSettingsSummary,
  loadSettingsSummary,
  type SettingsSummaryInput,
} from '../../src/settings/summary';
import { Screen } from '../../src/ui/Screen';
import { SettingsGroup, SettingsRow } from '../../src/ui/SettingsRow';
import { StepHeader } from '../../src/ui/StepHeader';
import { useTheme } from '../../src/ui/theme';
import { useThemeModeStore } from '../../src/ui/themeModeStore';
import { hiddenScrollIndicators } from '../../src/ui/scroll';

/** Settings: a few groups of entries, each with a one-line summary; the detail lives in its page. */
export default function Ajustes() {
  const t = useT();
  const theme = useTheme();
  const themeMode = useThemeModeStore((state) => state.mode);
  const language = useLocaleStore((state) => state.preference);
  const [values, setValues] = useState<SettingsSummaryInput | null>(null);

  // Coming back from a detail page refreshes the summaries.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadSettingsSummary(getRepositories())
        .then((loaded) => {
          if (alive) setValues(loaded);
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );

  const summary = values ? buildSettingsSummary(values, t) : null;
  const go = (href: Href) => () => router.push(href);

  return (
    <Screen>
      <ScrollView
        {...hiddenScrollIndicators}
        contentContainerStyle={{ gap: theme.space[5], paddingVertical: theme.space[4] }}
      >
        {/* Ajustes is not a tab any more (opened from the section headers): it needs a way back. */}
        <StepHeader
          backLabel={t('onboarding.back')}
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/hoy'))}
        >
          <Text
            accessibilityRole="header"
            style={[theme.text('title-lg'), { color: theme.color.text, flex: 1 }]}
          >
            {t('settings.title')}
          </Text>
        </StepHeader>

        <SettingsGroup title={t('settings.groups.profile')}>
          <SettingsRow
            icon={CalendarBlank}
            title={t('settings.schedule.title')}
            value={summary?.schedule}
            onPress={go('/horarios')}
          />
          <SettingsRow
            icon={Target}
            title={t('settings.schedule.goalsTitle')}
            value={summary?.goals}
            onPress={go('/metas')}
          />
          <SettingsRow
            icon={MoonStars}
            title={t('sleepCalc.entry.title')}
            value={t('sleepCalc.entry.body')}
            onPress={go('/ciclos-sueno')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.groups.notices')}>
          <SettingsRow
            icon={Bell}
            title={t('settings.myNotifications.entryTitle')}
            value={summary?.notifications}
            onPress={go('/mis-avisos')}
          />
          <SettingsRow
            icon={PersonSimpleWalk}
            title={t('sedentary.title')}
            value={summary?.sedentary}
            onPress={go('/inactividad')}
          />
          <SettingsRow
            icon={ShieldCheck}
            title={t('settings.permissions.title')}
            value={t('settings.permissions.body')}
            onPress={go('/permisos')}
          />
          <SettingsRow
            icon={BatteryCharging}
            title={t('settings.battery.title')}
            value={t('settings.battery.body')}
            onPress={go('/bateria')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.groups.data')}>
          <SettingsRow
            icon={FloppyDisk}
            title={t('settings.backup.title')}
            value={t('settings.backup.body')}
            onPress={go('/respaldo')}
          />
          <SettingsRow
            icon={Barbell}
            title={t('settings.programImport.title')}
            value={t('settings.programImport.body')}
            onPress={go('/importar-programa')}
          />
          <SettingsRow
            icon={Images}
            title={t('settings.photos.title')}
            value={t('settings.photos.body')}
            onPress={go('/fotos')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.groups.appearance')}>
          <SettingsRow
            icon={Palette}
            title={t('settings.appearance.theme')}
            value={t(THEME_LABELS[themeMode])}
            onPress={go('/apariencia')}
          />
          <SettingsRow
            icon={Globe}
            title={t('settings.appearance.language')}
            value={t(LANGUAGE_LABELS[language])}
            onPress={go('/apariencia')}
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.groups.about')}>
          <SettingsRow
            icon={Info}
            title={t('settings.about.title')}
            value={t('settings.about.body', {
              version: Constants.expoConfig?.version ?? '0.0.0',
            })}
            onPress={go('/acerca')}
          />
        </SettingsGroup>
      </ScrollView>
    </Screen>
  );
}
