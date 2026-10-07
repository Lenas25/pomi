import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from './theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** Tab screens leave `bottom` out because the tab bar already handles the inset. */
  edges?: readonly Edge[];
};

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/** Safe area + 20 dp side margin + content centered at max 560 dp (HANDOFF §2). */
export function Screen({ children, scroll = false, edges = DEFAULT_EDGES }: ScreenProps) {
  const theme = useTheme();
  const content = {
    flexGrow: 1,
    width: '100%' as const,
    maxWidth: theme.layout.maxContentWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: theme.space[5],
  };

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={content}>{children}</ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}
