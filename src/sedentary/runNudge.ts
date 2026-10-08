// One run of the sedentary nudge, pure over injected dependencies (the background task passes the
// real ones, tests pass fakes). Order matters: everything that can say "no" without Health Connect
// goes first, so most runs never touch it.
import {
  DEFAULT_SEDENTARY,
  canNudgeNow,
  recordNudge,
  shouldNudge,
  type NudgeDecision,
  type NudgeHistory,
  type NudgeState,
  type SedentaryConfig,
  type StepsReading,
} from '../domain/sedentary';

export type StoredSedentaryConfig = Partial<{
  [K in keyof SedentaryConfig]: SedentaryConfig[K] | undefined;
}>;

/** Stored preferences over the defaults. */
export function resolveSedentaryConfig(stored: StoredSedentaryConfig | undefined): SedentaryConfig {
  return {
    enabled: stored?.enabled ?? DEFAULT_SEDENTARY.enabled,
    windowMin: stored?.windowMin ?? DEFAULT_SEDENTARY.windowMin,
    threshold: stored?.threshold ?? DEFAULT_SEDENTARY.threshold,
    days: stored?.days ?? DEFAULT_SEDENTARY.days,
    maxPerDay: stored?.maxPerDay ?? DEFAULT_SEDENTARY.maxPerDay,
    noPhone: stored?.noPhone ?? DEFAULT_SEDENTARY.noPhone,
  };
}

/** Whether the background worker has to wake up every ~15 minutes for the nudge. */
export function nudgeNeedsFrequentWorker(stored: StoredSedentaryConfig | undefined): boolean {
  const config = resolveSedentaryConfig(stored);
  return config.enabled && !config.noPhone;
}

export type NudgeDeps = {
  now: () => Date;
  config: () => Promise<SedentaryConfig>;
  /** Steps read AND background access granted. */
  hasPermission: () => Promise<boolean>;
  /** Wake and bed (minutes of the logical day) from the plan. */
  anchors: () => Promise<{ wakeMin: number | undefined; bedMin: number | undefined }>;
  history: () => Promise<NudgeHistory | undefined>;
  saveHistory: (history: NudgeHistory) => Promise<void>;
  readSteps: (windowMin: number, nowMs: number) => Promise<StepsReading>;
  /** Shows the "Pausa activa" notification. */
  notify: () => Promise<void>;
};

export async function runSedentaryNudge(deps: NudgeDeps): Promise<NudgeDecision> {
  const now = deps.now();
  const config = await deps.config();
  // No point in asking Health Connect anything while the switch is off.
  if (!config.enabled || config.noPhone) {
    return shouldNudge({ ...baseState(config), reading: null }, now);
  }
  const [permission, anchors, history] = await Promise.all([
    deps.hasPermission().catch(() => false),
    deps.anchors(),
    deps.history(),
  ]);
  const state: NudgeState = {
    ...baseState(config),
    permission,
    ...anchors,
    history,
    reading: null,
  };

  const pre = canNudgeNow(state, now);
  if (!pre.send) return pre;

  // A failed read is "no data", never "inactive".
  const reading = await deps.readSteps(config.windowMin, now.getTime()).catch(() => null);
  const decision = shouldNudge({ ...state, reading }, now);
  if (!decision.send) return decision;

  // Count it first: if the notification fails the count is given back, and if the count cannot be
  // saved nothing is shown (a nudge that cannot be capped must not be sent).
  const next = recordNudge(history, now);
  await deps.saveHistory(next);
  try {
    await deps.notify();
  } catch (error) {
    if (history) await deps.saveHistory(history).catch(() => undefined);
    throw error;
  }
  return decision;
}

function baseState(config: SedentaryConfig): NudgeState {
  return {
    config,
    permission: false,
    wakeMin: undefined,
    bedMin: undefined,
    history: undefined,
    reading: null,
  };
}
