import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { createRepositories, type Repositories } from '../db/repositories';
import { createTestDb } from '../db/testing/createTestDb';

import { useSedentarySettings } from './useSedentarySettings';

const mockEnv: { repos: Repositories | null; adapter: Record<string, jest.Mock> } = {
  repos: null,
  adapter: {},
};
const mockRefresh = jest.fn(async () => undefined);

jest.mock('../db', () => ({ getRepositories: () => mockEnv.repos }));
jest.mock('../health', () => ({ getHealthAdapter: () => mockEnv.adapter }));
jest.mock('../notifications/backgroundTasks', () => ({
  refreshBackgroundSchedule: () => mockRefresh(),
}));

let close: () => void;
let onAppState: (state: string) => void = () => undefined;

beforeEach(async () => {
  const test = await createTestDb();
  close = test.close;
  mockEnv.repos = createRepositories(test.db);
  mockEnv.adapter = {
    hasPermission: jest.fn(async () => true),
    hasBackgroundPermission: jest.fn(async () => true),
    openSettings: jest.fn(),
  };
  mockRefresh.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onAppState = listener as (state: string) => void;
    return { remove: jest.fn() };
  });
});
afterEach(() => {
  close();
  jest.restoreAllMocks();
});

describe('useSedentarySettings', () => {
  it('fast consecutive changes do not lose each other', async () => {
    const { result } = await renderHook(() => useSedentarySettings());
    await waitFor(() => expect(result.current.config).not.toBeNull());
    await act(async () => {
      await Promise.all([
        result.current.update({ windowMin: 120 }),
        result.current.update({ maxPerDay: 4 }),
        result.current.update({ threshold: 200 }),
      ]);
    });
    expect(await mockEnv.repos!.settings.get('sedentaryNudge')).toEqual({
      windowMin: 120,
      maxPerDay: 4,
      threshold: 200,
    });
  });

  it('turns the nudge off on every return to the app when a permission is gone', async () => {
    await mockEnv.repos!.settings.set('sedentaryNudge', { enabled: true });
    const { result } = await renderHook(() => useSedentarySettings());
    await waitFor(() => expect(result.current.config?.enabled).toBe(true));
    // No openSettings round trip is needed: ANY return to the foreground re-checks.
    mockEnv.adapter.hasBackgroundPermission!.mockResolvedValue(false);
    await act(async () => onAppState('active'));
    await waitFor(() => expect(result.current.notice).toBe('missingPermission'));
    expect((await mockEnv.repos!.settings.get('sedentaryNudge'))?.enabled).toBe(false);
  });

  it('keeps the nudge on when a permission call fails', async () => {
    await mockEnv.repos!.settings.set('sedentaryNudge', { enabled: true });
    const { result } = await renderHook(() => useSedentarySettings());
    await waitFor(() => expect(result.current.config?.enabled).toBe(true));
    mockEnv.adapter.hasPermission!.mockResolvedValue(false);
    mockEnv.adapter.hasBackgroundPermission!.mockRejectedValue(new Error('boom'));
    await act(async () => onAppState('active'));
    await act(async () => undefined);
    expect(result.current.notice).toBeNull();
    expect((await mockEnv.repos!.settings.get('sedentaryNudge'))?.enabled).toBe(true);
  });

  it('shows once the notice left by the background job', async () => {
    await mockEnv.repos!.settings.set('sedentaryNudge', { enabled: false });
    await mockEnv.repos!.settings.set('sedentaryPermissionLost', true);
    const { result } = await renderHook(() => useSedentarySettings());
    await waitFor(() => expect(result.current.notice).toBe('missingPermission'));
    expect(await mockEnv.repos!.settings.get('sedentaryPermissionLost')).toBeUndefined();
  });

  it('an unmounted screen does not consume the permission-lost flag', async () => {
    const settings = mockEnv.repos!.settings;
    await settings.set('sedentaryNudge', { enabled: false });
    await settings.set('sedentaryPermissionLost', true);
    // The read of the flag is still in flight when the screen unmounts.
    const realGet = settings.get.bind(settings);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(settings, 'get').mockImplementation(async (key) => {
      const value = await realGet(key);
      if (key === 'sedentaryPermissionLost') await gate;
      return value;
    });
    const { unmount } = await renderHook(() => useSedentarySettings());
    await unmount();
    await act(async () => {
      release();
    });
    expect(await realGet('sedentaryPermissionLost')).toBe(true);
  });
});
