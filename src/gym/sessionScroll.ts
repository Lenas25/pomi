// The session page that holds a set row: it scrolls a focused row into view above the keyboard.
import { createContext, useContext } from 'react';
import type { View } from 'react-native';

export type ScrollIntoView = (node: View | null) => void;

export const SessionScrollContext = createContext<ScrollIntoView>(() => undefined);

export function useScrollIntoView(): ScrollIntoView {
  return useContext(SessionScrollContext);
}
