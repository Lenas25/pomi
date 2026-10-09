import { useT } from '../src/i18n';
import { ScheduleSettings } from '../src/settings/ScheduleSettings';
import { SettingsPage } from '../src/settings/SettingsPage';

/** Ajustes > Metas: the daily water and steps goals. */
export default function Metas() {
  const t = useT();
  return (
    <SettingsPage
      title={t('settings.schedule.goalsTitle')}
      intro={t('settings.schedule.goalsHint')}
    >
      <ScheduleSettings part="goals" />
    </SettingsPage>
  );
}
