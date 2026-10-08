// Turning the nudge on needs Health Connect: availability, the steps permission and the background
// read permission. Pure over the adapter, so the order and the outcomes are tested.
import type { HealthAdapter } from '../health/types';

/**
 * `denied`: the steps permission was refused. `bgDenied`: steps are fine but the background read
 * was refused. `featureUnavailable`: asking for the background read failed in a way that says the
 * installed Health Connect lacks the feature (react-native-health-connect 4.1 exposes no
 * `getFeatureStatus`, so this is inferred from the error text, not queried). `cancelled`: the
 * person dismissed the dialog (no notice). `transient`: anything else (the request itself failed,
 * worth retrying).
 */
export type EnableOutcome =
  | 'granted'
  | 'unavailable'
  | 'denied'
  | 'bgDenied'
  | 'featureUnavailable'
  | 'cancelled'
  | 'transient';

type RequestFailure = 'cancelled' | 'denied' | 'featureUnavailable' | 'transient';

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name} ${error.message}` : String(error);
}

/** Tells apart what a failed permission request means. Unknown errors count as transient. */
export function classifyRequestError(error: unknown): RequestFailure {
  const text = errorText(error);
  if (/cancel|dismiss|abort/i.test(text)) return 'cancelled';
  if (/denied|refus|reject/i.test(text)) return 'denied';
  if (/unsupported|not supported|not available|not implemented|feature/i.test(text)) {
    return 'featureUnavailable';
  }
  return 'transient';
}

/** Result of re-checking both permissions: only a clean answer can say `missing`. */
export type PermissionState = 'ok' | 'missing' | 'unknown';

/** Both permission calls must resolve and one must be false to report `missing`; errors keep state. */
export async function nudgePermissionState(
  adapter: Pick<HealthAdapter, 'hasPermission' | 'hasBackgroundPermission'>,
): Promise<PermissionState> {
  try {
    const [steps, background] = await Promise.all([
      adapter.hasPermission(),
      adapter.hasBackgroundPermission(),
    ]);
    return steps && background ? 'ok' : 'missing';
  } catch {
    return 'unknown';
  }
}

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
  } catch {
    return 'transient';
  }
  try {
    if (!(await adapter.hasPermission())) {
      let granted: boolean;
      try {
        granted = await adapter.requestPermission();
      } catch (error) {
        const failure = classifyRequestError(error);
        // A missing feature on the plain steps request is not a Health Connect version issue.
        return failure === 'featureUnavailable' ? 'transient' : failure;
      }
      if (!granted) return 'denied';
    }
    if (await adapter.hasBackgroundPermission()) return 'granted';
  } catch {
    return 'transient';
  }
  try {
    return (await adapter.requestBackgroundPermission()) ? 'granted' : 'bgDenied';
  } catch (error) {
    const failure = classifyRequestError(error);
    return failure === 'denied' ? 'bgDenied' : failure;
  }
}
