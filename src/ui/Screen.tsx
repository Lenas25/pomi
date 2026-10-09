import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from './theme';
import { hiddenScrollIndicators } from './scroll';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** Tab screens leave `bottom` out because the tab bar already handles the inset. */
  edges?: readonly Edge[];
  /** Wider content for screens with two columns on tablets (default: `layout.maxContentWidth`). */
  wide?: boolean;
  /**
   * Full-bleed block above the content (e.g. `SectionHeader`). It owns the top safe area so its
   * color runs under the status bar; the screen then leaves `top` out.
   */
  header?: ReactNode;
  /**
   * Pinned thumb-zone action bar under the content (never scrolls away). It sits above the
   * bottom inset when `edges` includes `bottom` (full screens); tab screens get it above the bar.
   */
  footer?: ReactNode;
  /**
   * Full-bleed bar pinned under the content (e.g. the gym timer bar). It owns its background and
   * padding and takes layout space, so it never covers the content; it sits above `footer`.
   */
  bottomBar?: ReactNode;
};

const DEFAULT_EDGES: readonly Edge[] = ['top', 'left', 'right'];

/** Safe area + 20 dp side margin + content centered at max 560 dp (HANDOFF §2). */
export function Screen({
  children,
  scroll = false,
  edges = DEFAULT_EDGES,
  wide = false,
  header,
  footer,
  bottomBar,
}: ScreenProps) {
  const theme = useTheme();
  const column = {
    width: '100%' as const,
    maxWidth: wide ? theme.layout.wideContentWidth : theme.layout.maxContentWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: theme.space[5],
  };
  const content = { ...column, flexGrow: 1 };
  const safeEdges = header ? edges.filter((edge) => edge !== 'top') : edges;

  return (
    <SafeAreaView edges={safeEdges} style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {header}
      {scroll ? (
        <ScrollView {...hiddenScrollIndicators} style={{ flex: 1 }} contentContainerStyle={content}>
          {children}
        </ScrollView>
      ) : (
        <View style={[content, { flex: 1 }]}>{children}</View>
      )}
      {bottomBar}
      {footer ? (
        <View
          testID="screen-footer"
          style={{
            borderTopWidth: theme.stroke.hairline,
            borderTopColor: theme.color.border,
            backgroundColor: theme.color.bg,
          }}
        >
          <View style={[column, { paddingVertical: theme.space[3], gap: theme.space[2] }]}>
            {footer}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
