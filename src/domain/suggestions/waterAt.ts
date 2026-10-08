// "How much water did I have by 18:00?" from the write events of one day (`habit_events`).

export type WaterEvent = { at: number; value: number };

/**
 * Value of the counter at `limitMs`: the value after the last write at or before it, 0 when the
 * first write came later. `events` may be in any order.
 */
export function valueAt(events: readonly WaterEvent[], limitMs: number): number {
  let latest: WaterEvent | undefined;
  for (const event of events) {
    if (event.at <= limitMs && (latest === undefined || event.at >= latest.at)) latest = event;
  }
  return latest?.value ?? 0;
}
