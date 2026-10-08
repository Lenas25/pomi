// Global "maintenance" gate. A restore replaces EVERY table, so nothing else may read or write
// while it runs: repository calls, the notification scheduler, suggestion runs and the background
// tasks all wait on this gate until the restore has finished (committed or rolled back).
import { create } from 'zustand';

import { withTransaction, type Tx } from './transaction';
import type { Db } from './types';

type MaintenanceState = { active: boolean };

/** Drives the full-screen busy state. `active` turns on as soon as a maintenance run is requested. */
export const useMaintenanceStore = create<MaintenanceState>(() => ({ active: false }));

let gate: Promise<void> | undefined;
let release: (() => void) | undefined;
let holders = 0;

function raiseGate(): () => void {
  holders += 1;
  if (holders === 1) {
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders -= 1;
    if (holders === 0) {
      const open = release;
      gate = undefined;
      release = undefined;
      open?.();
    }
  };
}

/** Resolves immediately unless a maintenance run is in progress. */
export async function waitForMaintenance(): Promise<void> {
  while (gate) await gate;
}

/** Whether a maintenance run currently holds the gate (tests and diagnostics). */
export function isMaintenanceActive(): boolean {
  return gate !== undefined;
}

/**
 * Runs `work` as the ONLY thing touching the database. The gate goes up from INSIDE the top-level
 * transaction slot, i.e. after every transaction that was already running has finished: lifting it
 * earlier would deadlock a running transaction that awaits a gated repository call. It comes down
 * after the commit or rollback. `work` must use the `tx` it receives (or the raw `Db`), never the
 * gated repositories.
 */
export async function runMaintenance<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  useMaintenanceStore.setState({ active: true });
  let lower: (() => void) | undefined;
  try {
    return await withTransaction(db, (tx) => {
      lower = raiseGate();
      return work(tx);
    });
  } finally {
    lower?.();
    useMaintenanceStore.setState({ active: holders > 0 });
  }
}

type AnyFunction = (...args: never[]) => unknown;

function gateRepository<Repository extends object>(repository: Repository): Repository {
  const gated: Record<string, unknown> = {};
  for (const [name, member] of Object.entries(repository)) {
    if (typeof member === 'function') {
      const method = member as AnyFunction;
      gated[name] = async (...args: never[]) => {
        await waitForMaintenance();
        return method(...args);
      };
    } else {
      gated[name] = member;
    }
  }
  return gated as Repository;
}

/**
 * Wraps every repository method so it waits for the gate first. Only the app singleton is gated
 * (`getRepositories()`); tests and the restore itself use the plain repositories.
 */
export function gateRepositories<Repositories extends Record<string, object>>(
  repositories: Repositories,
): Repositories {
  const gated: Record<string, object> = {};
  for (const [name, repository] of Object.entries(repositories)) {
    gated[name] = gateRepository(repository);
  }
  return gated as Repositories;
}
