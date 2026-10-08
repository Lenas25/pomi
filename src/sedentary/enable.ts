// Turning the nudge on needs Health Connect: availability, the steps permission and the background
// read permission. Pure over the adapter, so the order and the outcomes are tested.
import type { HealthAdapter } from '../health/types';

/**
 * `denied`: the steps permission was refused. `bgDenied`: steps are fine but the background read
 * was refused. `featureUnavailable`: asking for the background read failed outright, which is how
 * a Health Connect without that feature behaves (react-native-health-connect 4.1 exposes no
 * `getFeatureStatus`, so this is inferred from the failure, not queried).
 */
export type EnableOutcome =
  'granted' | 'unavailable' | 'denied' | 'bgDenied' | 'featureUnavailable';

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
    if (await adapter.hasBackgroundPermission()) return 'granted';
    try {
      return (await adapter.requestBackgroundPermission()) ? 'granted' : 'bgDenied';
    } catch {
      return 'featureUnavailable';
    }
  } catch {
    return 'denied';
  }
}
