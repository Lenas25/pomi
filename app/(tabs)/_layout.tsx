import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Barbell,
  CheckCircle,
  ChartLineUp,
  GearSix,
  House,
  type Icon,
} from 'phosphor-react-native';

import { t, type TranslationKey } from '../../src/i18n';
import { useTheme } from '../../src/ui/theme';

type TabRoute = { name: string; titleKey: TranslationKey; icon: Icon };

const TAB_ROUTES: readonly TabRoute[] = [
  { name: 'hoy', titleKey: 'tabs.hoy', icon: House },
  { name: 'gym', titleKey: 'tabs.gym', icon: Barbell },
  { name: 'habitos', titleKey: 'tabs.habitos', icon: CheckCircle },
  { name: 'progreso', titleKey: 'tabs.progreso', icon: ChartLineUp },
  { name: 'ajustes', titleKey: 'tabs.ajustes', icon: GearSix },
];

// HANDOFF §2: tab bar is 64 dp tall plus the bottom safe area.
const TAB_BAR_HEIGHT = 64;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.primary,
        tabBarInactiveTintColor: theme.color.textMuted,
        tabBarLabelStyle: theme.text('caption'),
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
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
