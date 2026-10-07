import type { ReactNode } from 'react';
import { IconContext } from 'phosphor-react-native';

import { useTheme } from './theme';

/** Phosphor defaults for the whole app: bold weight, 24 size, theme text color. */
export function IconProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <IconContext.Provider value={{ weight: 'bold', size: 24, color: theme.color.text }}>
      {children}
    </IconContext.Provider>
  );
}
