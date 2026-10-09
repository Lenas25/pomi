import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getRepositories } from '../db';
import { isReady } from '../domain/ai/form';
import { keyTargetOf, type AiConnection } from '../domain/ai/providers';

import { getAiKeyStore } from './keyStore';

export type AiStatus =
  | { loaded: false }
  | { loaded: true; connection: AiConnection | undefined; hasKey: boolean; ready: boolean };

/** The stored connection and whether a key bound to it exists, re-read every time the screen gets focus. */
export function useAiStatus(): { status: AiStatus; reload: () => Promise<void> } {
  const [status, setStatus] = useState<AiStatus>({ loaded: false });

  const reload = useCallback(async () => {
    try {
      const connection = await getRepositories().settings.get('aiConnection');
      // Only a key bound to this connection's provider and origin counts.
      const key = await getAiKeyStore().read(connection ? keyTargetOf(connection) : null);
      setStatus({
        loaded: true,
        connection,
        hasKey: key !== null,
        ready: isReady(connection, key !== null),
      });
    } catch {
      setStatus({ loaded: true, connection: undefined, hasKey: false, ready: false });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { status, reload };
}
