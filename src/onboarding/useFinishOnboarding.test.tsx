import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { requestNotificationSync } from '../notifications/sync';
import { completeOnboarding } from './complete';
import { useOnboardingDraft } from './draftStore';
import { useOnboardingStatusStore } from './statusStore';
import { HOME_HREF, useFinishOnboarding } from './useFinishOnboarding';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
}));
jest.mock('../db', () => ({ getDatabase: () => ({}), getRepositories: () => ({}) }));
jest.mock('../notifications/sync', () => ({ requestNotificationSync: jest.fn() }));
jest.mock('./complete', () => ({ completeOnboarding: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(completeOnboarding).mockResolvedValue(undefined);
  jest.mocked(requestNotificationSync).mockResolvedValue(undefined);
  useOnboardingStatusStore.setState({ status: 'incomplete' });
});

afterEach(() => jest.useRealTimers());

async function finish(hook: { current: ReturnType<typeof useFinishOnboarding> }) {
  await act(async () => {
    await hook.current.finish();
  });
}

describe('useFinishOnboarding', () => {
  it('flips the status and navigates to Hoy when the screen is still mounted', async () => {
    const { result } = await renderHook(() => useFinishOnboarding());
    await finish(result);
    expect(useOnboardingStatusStore.getState().status).toBe('complete');
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(router.replace).toHaveBeenCalledWith(HOME_HREF);
    expect(HOME_HREF).toBe('/(tabs)/hoy');
  });

  it('does not navigate again once the guard has unmounted the onboarding', async () => {
    const { result, unmount } = await renderHook(() => useFinishOnboarding());
    await finish(result);
    await unmount();
    jest.runOnlyPendingTimers();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps going when a post-completion side effect throws or rejects', async () => {
    jest.mocked(requestNotificationSync).mockImplementation(() => {
      throw new Error('native failure');
    });
    const reset = jest
      .spyOn(useOnboardingDraft.getState(), 'reset')
      .mockImplementation(() => {
        throw new Error('reset failure');
      });
    jest.mocked(router.replace).mockImplementation(() => {
      throw new Error('navigation failure');
    });
    const { result } = await renderHook(() => useFinishOnboarding());
    await finish(result);
    await act(async () => {
      expect(() => jest.runOnlyPendingTimers()).not.toThrow();
    });
    expect(useOnboardingStatusStore.getState().status).toBe('complete');
    expect(result.current.failed).toBe(false);
    reset.mockRestore();
  });

  it('reports a failure and stays on the onboarding when saving fails', async () => {
    jest.mocked(completeOnboarding).mockRejectedValue(new Error('db'));
    const { result } = await renderHook(() => useFinishOnboarding());
    await finish(result);
    expect(result.current.failed).toBe(true);
    expect(useOnboardingStatusStore.getState().status).toBe('incomplete');
    jest.runOnlyPendingTimers();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
