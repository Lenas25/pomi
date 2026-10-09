import { router } from 'expo-router';

import { leaveCheckin } from './CheckinScreen';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
}));

jest.mock('../notifications/sync', () => ({ requestNotificationSync: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('leaveCheckin', () => {
  it('goes back when there is a screen underneath', () => {
    jest.mocked(router.canGoBack).mockReturnValue(true);
    leaveCheckin();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces with the app when opened cold, so the stack never empties', () => {
    jest.mocked(router.canGoBack).mockReturnValue(false);
    leaveCheckin();
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/habitos');
  });
});
