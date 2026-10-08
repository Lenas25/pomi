import { create } from 'zustand';

import {
  createEditorState,
  editorReducer,
  isDirty,
  type EditorAction,
  type EditorState,
} from '../domain/editor';

import type { EditorSource } from './editorSource';

type Store = {
  source: EditorSource | null;
  state: EditorState | null;
  open: (source: EditorSource) => void;
  dispatch: (action: EditorAction) => void;
  /** After a successful save: the saved program becomes the new baseline. */
  markSaved: () => void;
  close: () => void;
};

/** The program being edited. In memory only: nothing is stored until "Guardar". */
export const useEditorStore = create<Store>((set) => ({
  source: null,
  state: null,
  open: (source) => set({ source, state: createEditorState(source.program) }),
  dispatch: (action) =>
    set((store) => (store.state ? { state: editorReducer(store.state, action) } : store)),
  markSaved: () =>
    set((store) => (store.state ? { state: createEditorState(store.state.program) } : store)),
  close: () => set({ source: null, state: null }),
}));

export const selectDirty = (store: Store): boolean => (store.state ? isDirty(store.state) : false);
