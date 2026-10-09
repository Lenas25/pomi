import { useState, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';

import { useT, type TranslationKey } from '../../src/i18n';
import { QuickAddSheet } from '../../src/quickadd/QuickAddSheet';
import { TabBar } from '../../src/ui/TabBar';
import type { SectionKey } from '../../src/ui/theme';

type TabRoute = { name: string; titleKey: TranslationKey; section: SectionKey };

/** Visible tabs. Ajustes is a hidden route opened from the gear in each section header. */
const TAB_ROUTES: readonly TabRoute[] = [
  { name: 'hoy', titleKey: 'tabs.hoy', section: 'hoy' },
  { name: 'gym', titleKey: 'tabs.gym', section: 'gym' },
  { name: 'habitos', titleKey: 'tabs.habitos', section: 'habitos' },
  { name: 'progreso', titleKey: 'tabs.progreso', section: 'progreso' },
];

type TabBarRenderProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export default function TabsLayout() {
  const t = useT();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const renderTabBar = ({ state, navigation, insets }: TabBarRenderProps) => (
    <>
      <TabBar
        tabs={TAB_ROUTES.map(({ name, titleKey, section }) => ({
          name,
          section,
          label: t(titleKey),
        }))}
        activeName={state.routes[state.index]?.name}
        onSelect={(name) => {
          const route = state.routes.find((candidate) => candidate.name === name);
          if (!route) return;
          const focused = state.routes[state.index]?.key === route.key;
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        actionLabel={t('quickAdd.open')}
        onAction={() => setQuickAddOpen(true)}
        insetBottom={insets.bottom}
      />
      <QuickAddSheet visible={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </>
  );

  return (
    <Tabs
      // Android back from Ajustes (opened from a header) returns to the tab it came from.
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      tabBar={renderTabBar}
    >
      {TAB_ROUTES.map(({ name, titleKey }) => (
        <Tabs.Screen key={name} name={name} options={{ title: t(titleKey) }} />
      ))}
      <Tabs.Screen name="ajustes" options={{ title: t('tabs.ajustes'), href: null }} />
    </Tabs>
  );
}
