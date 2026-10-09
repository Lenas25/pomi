import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { setLanguage, t } from '../i18n';
import { InfoButton } from '../ui/InfoButton';
import { ThemeProvider } from '../ui/theme';

import { buildSettingsSummary, loadSettingsSummary } from './summary';

let close: () => void;
let repos: Repositories;

beforeEach(async () => {
  setLanguage('es');
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => 1_000);
});
afterEach(() => close());

describe('settings summary', () => {
  it('summarizes the stored values in one line each', async () => {
    await repos.settings.set('anchors', { wake: '06:30' });
    await repos.settings.set('gymPlan', [
      { weekday: 1, time: '18:00' },
      { weekday: 3, time: '18:00' },
    ]);
    await repos.settings.set('goals', { waterGlassesRest: 9, stepsGoal: 8000 });
    await repos.settings.set('notificationPrefs', { enabled: false });
    await repos.settings.set('sedentaryNudge', { enabled: true });
    const summary = buildSettingsSummary(await loadSettingsSummary(repos), t);
    expect(summary).toEqual({
      schedule: 'Despiertas 06:30 · gym 2 días',
      goals: '9 vasos · 8000 pasos',
      notifications: 'Apagados',
      sedentary: 'Activada',
    });
  });

  it('says when there is no gym and the nudge is off without a phone', () => {
    const summary = buildSettingsSummary(
      {
        wake: '07:00',
        gymDays: 0,
        waterGlassesRest: 8,
        stepsGoal: 7000,
        notificationsOn: true,
        sedentaryOn: false,
      },
      t,
    );
    expect(summary.schedule).toBe('Despiertas 07:00 · sin gym');
    expect(summary.notifications).toBe('Activados');
    expect(summary.sedentary).toBe('Apagada');
  });
});

describe('InfoButton', () => {
  it('opens the detail in a sheet', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider mode="light">
          <InfoButton title="Batería" body={['Primero.', 'Segundo.']} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('Segundo.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Más información: Batería' }));
    expect(screen.getByText('Primero.')).toBeTruthy();
    expect(screen.getByText('Segundo.')).toBeTruthy();
  });
});
