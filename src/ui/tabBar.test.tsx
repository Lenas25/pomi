import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { setLanguage } from '../i18n';
import { SectionHeader } from './SectionHeader';
import { TabBar, type TabBarTab } from './TabBar';
import { makeTheme, ThemeProvider } from './theme';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(effect, [effect]);
  },
}));

const TABS: readonly TabBarTab[] = [
  { name: 'hoy', section: 'hoy', label: 'Hoy' },
  { name: 'gym', section: 'gym', label: 'Gym' },
  { name: 'habitos', section: 'habitos', label: 'Hábitos' },
  { name: 'progreso', section: 'progreso', label: 'Progreso' },
];

beforeEach(() => {
  setLanguage('es');
  mockPush.mockClear();
});

describe('TabBar', () => {
  function renderBar(activeName: string | undefined) {
    const onSelect = jest.fn();
    const onAction = jest.fn();
    const ui = (
      <ThemeProvider mode="dark">
        <TabBar
          tabs={TABS}
          activeName={activeName}
          onSelect={onSelect}
          actionLabel="Registrar"
          onAction={onAction}
          insetBottom={24}
        />
      </ThemeProvider>
    );
    return { onSelect, onAction, ui };
  }

  it('has 4 tabs + the center "Registrar" action, with Ajustes out of the bar', async () => {
    const { ui, onAction } = renderBar('hoy');
    await render(ui);
    expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Hoy',
      'Gym',
      'Hábitos',
      'Progreso',
    ]);
    expect(screen.queryByRole('tab', { name: 'Ajustes' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Registrar' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('marks the active tab: selected state + a pill in the section soft tint', async () => {
    const { ui, onSelect } = renderBar('gym');
    await render(ui);
    expect(screen.getByRole('tab', { name: 'Gym' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Hoy' })).not.toBeSelected();
    const pill = StyleSheet.flatten(screen.getByTestId('tab-pill-gym').props.style);
    expect(pill.backgroundColor).toBe(makeTheme('dark').section.gym.soft);
    await fireEvent.press(screen.getByRole('tab', { name: 'Progreso' }));
    expect(onSelect).toHaveBeenCalledWith('progreso');
  });

  it('keeps labels on one line, shrinking instead of clipping at large font scales', async () => {
    const { ui } = renderBar('hoy');
    await render(ui);
    const label = screen.getByText('Progreso');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.adjustsFontSizeToFit).toBe(true);
  });

  it('highlights nothing on a route that is not a tab (Ajustes)', async () => {
    const { ui } = renderBar('ajustes');
    await render(ui);
    for (const tab of screen.getAllByRole('tab')) expect(tab).not.toBeSelected();
  });
});

describe('SectionHeader', () => {
  it('renders the title in the section color block and opens Ajustes from the gear', async () => {
    await render(
      <ThemeProvider mode="light">
        <SectionHeader section="habitos" title="Hábitos" subtitle="Una línea" />
      </ThemeProvider>,
    );
    expect(screen.getByRole('header', { name: 'Hábitos' })).toBeTruthy();
    expect(screen.getByText('Una línea')).toBeTruthy();
    const block = StyleSheet.flatten(screen.getByTestId('section-header-habitos').props.style);
    expect(block.backgroundColor).toBe(makeTheme('light').section.habitos.fill);
    await fireEvent.press(screen.getByRole('button', { name: 'Ajustes' }));
    expect(mockPush).toHaveBeenCalledWith('/ajustes');
  });
});
