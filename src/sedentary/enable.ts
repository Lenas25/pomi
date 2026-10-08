// Turning the nudge on needs Health Connect: availability, the steps permission and the background
// read permission. Pure over the adapter, so the order and the outcomes are tested.
import type { HealthAdapter } from '../health/types';

export type EnableOutcome = 'granted' | 'unavailable' | 'denied';

/** Asks only for what is missing; any refusal leaves the nudge off. */
export async function ensureNudgePermissions(
  adapter: Pick<
    HealthAdapter,
    | 'getAvailability'
    | 'hasPermission'
    | 'requestPermission'
    | 'hasBackgroundPermission'
    | 'requestBackgroundPermission'
  >,
): Promise<EnableOutcome> {
  try {
    if ((await adapter.getAvailability()) !== 'available') return 'unavailable';
    if (!(await adapter.hasPermission()) && !(await adapter.requestPermission())) return 'denied';
    if (
      !(await adapter.hasBackgroundPermission()) &&
      !(await adapter.requestBackgroundPermission())
    ) {
      return 'denied';
    }
    return 'granted';
  } catch {
    return 'denied';
  }
}
