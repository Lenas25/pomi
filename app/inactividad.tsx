import { useT } from '../src/i18n';
import { SedentarySettings } from '../src/sedentary/SedentarySettings';
import { SettingsPage } from '../src/settings/SettingsPage';

/** Ajustes > Pausa por inactividad: the sedentary nudge, its detail behind the (i) sheet. */
export default function Inactividad() {
  const t = useT();
  return (
    <SettingsPage
      title={t('sedentary.title')}
      intro={t('sedentary.intro')}
      info={[t('sedentary.how'), t('sedentary.honest')]}
    >
      <SedentarySettings />
    </SettingsPage>
  );
}
