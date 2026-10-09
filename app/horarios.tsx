import { useT } from '../src/i18n';
import { FreeDaysSettings } from '../src/settings/FreeDaysSettings';
import { ScheduleSettings } from '../src/settings/ScheduleSettings';
import { SettingsPage } from '../src/settings/SettingsPage';

/** Ajustes > Horarios y gym: wake time, sleep target, gym days and the free days. */
export default function Horarios() {
  const t = useT();
  return (
    <SettingsPage title={t('settings.schedule.title')} intro={t('settings.schedule.hint')}>
      <ScheduleSettings part="schedule" />
      <FreeDaysSettings />
    </SettingsPage>
  );
}
