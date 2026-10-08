// Tiny async helpers for the gym session (pure, no React / Expo).

/**
 * Runs tasks that share a key strictly one after another (tasks with different keys run
 * concurrently). A failing task never blocks the next one. Used so ✓ followed by an un-✓ on the
 * same set cannot interleave (no ghost set left in the database).
 */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(task, task);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
    /** Resolves once every task queued so far has settled. */
    async idle(): Promise<void> {
      await Promise.all([...tails.values()]);
    },
  };
}

/**
 * Shares ONE run of `task` between concurrent callers and caches its success. A failure is NOT
 * cached: the next call tries again (a rejected promise must not poison the session forever).
 */
export function memoizeUntilFailure<T>(task: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    cached ??= task().catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
    return cached;
  };
}
