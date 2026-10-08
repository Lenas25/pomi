import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadCompanionData } from '../companion/loadCompanion';
import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { DEFAULT_FREE_WEEKDAYS, resolveFreeWeekdays } from '../domain/companion';
import { setLanguage } from '../i18n';
import { es } from '../i18n/es';
import { ThemeProvider } from '../ui/theme';

import { FreeDaysSettings } from './FreeDaysSettings';

const mockEnv: { repos: Repositories | null } = { repos: null };
jest.mock('../db', () => ({ getRepositories: () => mockEnv.repos }));

let close: () => void;
let repos: Repositories;

beforeEach(async () => {
  setLanguage('es');
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db, () => 1_000);
  mockEnv.repos = repos;
});
afterEach(() => close());

describe('resolveFreeWeekdays', () => {
  it('defaults to Saturday and Sunday and normalises a stored list', () => {
    expect(resolveFreeWeekdays(undefined)).toEqual(DEFAULT_FREE_WEEKDAYS);
    expect(resolveFreeWeekdays([6, 5, 6])).toEqual([5, 6]);
  });
});

describe('free days feed the companion', () => {
  it('passes the stored free days to the engines', async () => {
    expect((await loadCompanionData(repos, '2026-01-31')).freeWeekdays).toEqual([6, 0]);
    await repos.settings.set('freeDays', [5, 6]);
    expect((await loadCompanionData(repos, '2026-01-31')).freeWeekdays).toEqual([5, 6]);
  });
});

describe('FreeDaysSettings', () => {
  it('shows the default and stores the selection', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>
          <FreeDaysSettings />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    await screen.findByText(es.settings.freeDays.title);
    expect(screen.getByRole('checkbox', { name: 'sábado' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'viernes' }));
    await waitFor(async () => expect(await repos.settings.get('freeDays')).toEqual([0, 5, 6]));
  });
});
