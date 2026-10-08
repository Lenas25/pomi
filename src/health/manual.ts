import type { HealthAdapter } from './types';

/**
 * The manual "source": there is nothing to read automatically, so the person types the steps in.
 * Used on devices without Health Connect (and on non-Android platforms).
 */
export function createManualAdapter(): HealthAdapter {
  return {
    id: 'manual',
    getAvailability: async () => 'unavailable',
    hasPermission: async () => false,
    requestPermission: async () => false,
    readDailySteps: async () => [],
    hasBackgroundPermission: async () => false,
    requestBackgroundPermission: async () => false,
    readRecentSteps: async () => ({ steps: 0, hasRecentData: false }),
    openSettings: () => undefined,
  };
}
