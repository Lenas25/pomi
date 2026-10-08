import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';
import { setLanguage } from '../i18n';
import { es } from '../i18n/es';
import { loadDefaultTemplates } from '../templates/defaults';
import { ThemeProvider } from '../ui/theme';

import { MyNotificationsScreen } from './MyNotificationsScreen';

const mockEnv: { repos: Repositories | null; syncs: string[] } = { repos: null, syncs: [] };
jest.mock('../db', () => ({ getRepositories: () => mockEnv.repos }));
jest.mock('./sync', () => ({
  requestNotificationSync: (reason: string) => {
    mockEnv.syncs.push(reason);
    return Promise.resolve();
  },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

let close: () => void;
let repos: Repositories;
const m = es.settings.myNotifications;

beforeEach(async () => {
  setLanguage('es');
  mockEnv.syncs = [];
  const test = await createTestDb();
  close = test.close;
  repos = createRepositories(test.db);
  mockEnv.repos = repos;
  const defaults = loadDefaultTemplates();
  await repos.templates.saveModules(defaults.modules, 'add');
  await repos.settings.set('anchors', defaults.settings.anchors ?? {});
  await repos.settings.set('gymDays', defaults.settings.gymDays ?? []);
  await repos.settings.set('onboardingComplete', true);
});
afterEach(() => close());

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider>
        <MyNotificationsScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('MyNotificationsScreen', () => {
  it('shows every category and tomorrow preview, and a switch saves + resyncs', async () => {
    await renderScreen();
    await screen.findByText(m.title);
    for (const title of [m.water, m.gym, m.checkins, m.sleep, m.pause, m.quiet]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    // The preview lists real times (the morning check-in at wake 05:10 + 10).
    expect(await screen.findByText('05:20')).toBeTruthy();
    // The header carries the count; only the summary line is a live region.
    const header = screen.getByText(/Vista previa de mañana \(\d+\)/);
    const count = Number(/\((\d+)\)/.exec(String(header.props.children))?.[1]);
    expect(count).toBeGreaterThan(1);
    const summaryText = m.previewCountOther.replace('{{count}}', String(count));
    expect(screen.getByText(summaryText).props.accessibilityLiveRegion).toBe('polite');
    // No live region wraps the rows: a change is not read out as the whole list.
    for (let node = screen.getByText('05:20').parent; node; node = node.parent) {
      expect(node.props.accessibilityLiveRegion).toBeUndefined();
    }

    fireEvent(screen.getByLabelText(m.gymOn), 'valueChange', false);
    await waitFor(async () =>
      expect(await repos.settings.get('notificationPrefs')).toEqual({ gym: { enabled: false } }),
    );
    expect(mockEnv.syncs).toContain('settingsChanged');
  });

  it('adds and removes a quiet window', async () => {
    await renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: m.quietAdd }));
    await waitFor(async () =>
      expect((await repos.settings.get('notificationPrefs'))?.quietHours).toHaveLength(1),
    );
    fireEvent.press(
      await screen.findByRole('button', { name: m.quietRemove.replace('{{index}}', '1') }),
    );
    await waitFor(async () =>
      expect((await repos.settings.get('notificationPrefs'))?.quietHours).toBeUndefined(),
    );
  });

  it('a load failure says so and retries instead of showing the defaults', async () => {
    const real = repos;
    let failing = true;
    mockEnv.repos = {
      ...real,
      settings: {
        ...real.settings,
        get: ((key: Parameters<Repositories['settings']['get']>[0]) =>
          failing
            ? Promise.reject(new Error('db'))
            : real.settings.get(key)) as Repositories['settings']['get'],
      },
    };
    await renderScreen();
    expect(await screen.findByText(m.loadFailed)).toBeTruthy();
    expect(screen.queryByText(m.water)).toBeNull();
    failing = false;
    fireEvent.press(screen.getByRole('button', { name: m.retry }));
    expect(await screen.findByText(m.water)).toBeTruthy();
  });
});
