import { useCallback, useEffect, useState } from 'react';

import { getRepositories } from '../db';

import { loadEditorSource } from './editorSource';
import { useEditorStore } from './editorStore';

export type EditorLoad = 'loading' | 'ready' | 'empty' | 'error';

/** Opens the trained program in the editor store unless an edit is already in progress. */
export function useEditorSource(): { status: EditorLoad; reload: () => void } {
  const open = useEditorStore((store) => store.open);
  const hasState = useEditorStore((store) => store.state !== null);
  const [status, setStatus] = useState<EditorLoad>(hasState ? 'ready' : 'loading');

  const fetchSource = useCallback(() => {
    loadEditorSource(getRepositories())
      .then((source) => {
        if (source) open(source);
        setStatus(source ? 'ready' : 'empty');
      })
      .catch(() => setStatus('error'));
  }, [open]);

  const reload = useCallback(() => {
    setStatus('loading');
    fetchSource();
  }, [fetchSource]);

  useEffect(() => {
    if (!hasState) fetchSource();
    // Only on mount: later store changes are edits, not a reason to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, reload };
}
