import { describe, expect, it, jest } from '@jest/globals';

import { createPermissionGate, isSchedulable, MIN_LEAD_MS } from './notifications';

jest.mock('expo-notifications', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

describe('isSchedulable', () => {
  it('rejects an end that is in the past or closer than the margin', () => {
    expect(isSchedulable(1000, 5000)).toBe(false);
    expect(isSchedulable(5000 + MIN_LEAD_MS, 5000)).toBe(false);
    expect(isSchedulable(5000 + MIN_LEAD_MS + 1, 5000)).toBe(true);
  });
});

describe('createPermissionGate', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  it('shares the in-flight request: concurrent callers wait for the same dialog', async () => {
    const dialog = deferred<{ granted: boolean }>();
    const request = jest.fn(() => dialog.promise);
    const gate = createPermissionGate({
      status: async () => ({ granted: false, canAskAgain: true }),
      request,
    });
    const first = gate();
    const second = gate();
    dialog.resolve({ granted: true });
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('asks at most once per process after a denial', async () => {
    const request = jest.fn(async () => ({ granted: false }));
    const gate = createPermissionGate({
      status: async () => ({ granted: false, canAskAgain: true }),
      request,
    });
    expect(await gate()).toBe(false);
    expect(await gate()).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not ask when already granted or when the system will not show the dialog', async () => {
    const request = jest.fn(async () => ({ granted: true }));
    const granted = createPermissionGate({
      status: async () => ({ granted: true, canAskAgain: true }),
      request,
    });
    expect(await granted()).toBe(true);
    const blocked = createPermissionGate({
      status: async () => ({ granted: false, canAskAgain: false }),
      request,
    });
    expect(await blocked()).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
