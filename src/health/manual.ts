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
    openSettings: () => undefined,
  };
}
