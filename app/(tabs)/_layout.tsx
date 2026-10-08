import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Barbell,
  CheckCircle,
  ChartLineUp,
  GearSix,
  House,
  type Icon,
} from 'phosphor-react-native';

import { useT, type TranslationKey } from '../../src/i18n';
import { useTheme } from '../../src/ui/theme';

type TabRoute = { name: string; titleKey: TranslationKey; icon: Icon };

const TAB_ROUTES: readonly TabRoute[] = [
  { name: 'hoy', titleKey: 'tabs.hoy', icon: House },
  { name: 'gym', titleKey: 'tabs.gym', icon: Barbell },
  { name: 'habitos', titleKey: 'tabs.habitos', icon: CheckCircle },
  { name: 'progreso', titleKey: 'tabs.progreso', icon: ChartLineUp },
  { name: 'ajustes', titleKey: 'tabs.ajustes', icon: GearSix },
];

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const t = useT();
  // HANDOFF §2: `layout.tabBarHeight` plus the bottom safe area. It grows with the system font
  // scale so large text does not clip the labels.
  const barHeight = Math.round(theme.layout.tabBarHeight * Math.max(1, fontScale));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarLabelStyle: theme.text('caption'),
        tabBarStyle: {
          height: barHeight + insets.bottom,
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
      }}
    >
      {TAB_ROUTES.map(({ name, titleKey, icon: TabIcon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: t(titleKey),
            tabBarIcon: ({ color }) => (
              <TabIcon color={typeof color === 'string' ? color : theme.color.text} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
