import { createKeyedQueue, memoizeUntilFailure } from './asyncControl';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createKeyedQueue', () => {
  it('runs tasks of the same key in order, even when the first is slow', async () => {
    const queue = createKeyedQueue();
    const events: string[] = [];
    const slow = deferred();
    const first = queue.run('a', async () => {
      events.push('first:start');
      await slow.promise;
      events.push('first:end');
    });
    const second = queue.run('a', async () => {
      events.push('second');
    });
    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    slow.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('runs different keys concurrently', async () => {
    const queue = createKeyedQueue();
    const gate = deferred();
    const events: string[] = [];
    const a = queue.run('a', async () => {
      await gate.promise;
      events.push('a');
    });
    const b = queue.run('b', async () => {
      events.push('b');
    });
    await b;
    expect(events).toEqual(['b']);
    gate.resolve();
    await a;
  });

  it('keeps going after a failed task and surfaces its error to its caller', async () => {
    const queue = createKeyedQueue();
    const failing = queue.run('a', () => Promise.reject(new Error('boom')));
    const next = queue.run('a', async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});

describe('createKeyedQueue.idle', () => {
  it('waits for the queued work of every key', async () => {
    const queue = createKeyedQueue();
    const gate = deferred();
    let finished = false;
    void queue.run('a', async () => {
      await gate.promise;
      finished = true;
    });
    const idle = queue.idle();
    gate.resolve();
    await idle;
    expect(finished).toBe(true);
  });
});

describe('memoizeUntilFailure', () => {
  it('shares one run between concurrent callers', async () => {
    const task = jest.fn(async () => 7);
    const get = memoizeUntilFailure(task);
    expect(await Promise.all([get(), get()])).toEqual([7, 7]);
    await get();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure instead of caching the rejection', async () => {
    const task = jest
      .fn<Promise<number>, []>()
      .mockRejectedValueOnce(new Error('db locked'))
      .mockResolvedValueOnce(9);
    const get = memoizeUntilFailure(task);
    await expect(get()).rejects.toThrow('db locked');
    await expect(get()).resolves.toBe(9);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
