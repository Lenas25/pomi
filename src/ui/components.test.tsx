import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { Button } from './Button';
import { Card } from './Card';
import { MascotBubble } from './MascotBubble';
import { EmptyState } from './EmptyState';
import { ThemeProvider, makeTheme } from './theme';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SuggestionCard } from './SuggestionCard';
import { Toast } from './Toast';
import { Screen } from './Screen';

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Go" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Go" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Button states', () => {
  it('is not pressable while loading and exposes the busy state', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Go" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Card', () => {
  it('is a labelled button with a minimum touch height when pressable', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <Card onPress={onPress} accessibilityLabel="Open details">
        <Text>Body</Text>
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Open details' });
    expect(card).toHaveStyle({ minHeight: makeTheme('light').touch.min });
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('MascotBubble', () => {
  it('warns in development when the message exceeds 40 characters', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderThemed(<MascotBubble pose="hola" message={'x'.repeat(41)} />);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('stays quiet for short messages', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderThemed(<MascotBubble pose="hola" message="Hola" />);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('EmptyState', () => {
  it('renders title and body', async () => {
    await renderThemed(<EmptyState title="Title" body="Body" />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });
});

describe('Toast', () => {
  it('announces itself exactly once (no live region on top of the explicit announcement)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderThemed(<Toast variant="error" title="Oops" subtitle="Try again" />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Oops. Try again');
    expect(screen.getByText('Oops').parent?.parent?.props.accessibilityLiveRegion).toBeUndefined();
    announce.mockRestore();
  });
});

describe('SuggestionCard', () => {
  const props = {
    text: 'Move bedtime?',
    reason: 'You slept less.',
    cardLabel: 'Pomi suggestion',
    whyLabel: 'Why',
    acceptLabel: 'Accept',
    declineLabel: 'Not now',
    onDecline: jest.fn(),
  };

  it('names the whole card with the label it is given', async () => {
    await renderThemed(<SuggestionCard {...props} onAccept={jest.fn()} />);
    expect(screen.getByLabelText('Pomi suggestion')).toBeTruthy();
  });

  it('ignores presses on both buttons while the change is being applied', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await renderThemed(
      <SuggestionCard {...props} onAccept={onAccept} onDecline={onDecline} busy />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });
});

describe('Palette variants', () => {
  it('Button "energy" uses the energy fill and its label color', async () => {
    await render(
      <ThemeProvider mode="dark">
        <Button label="Empezar" variant="energy" onPress={() => undefined} />
      </ThemeProvider>,
    );
    const theme = makeTheme('dark');
    const button = screen.getByRole('button', { name: 'Empezar' });
    expect(StyleSheet.flatten(button.props.style).backgroundColor).toBe(theme.color.energyFill);
    expect(StyleSheet.flatten(screen.getByText('Empezar').props.style).color).toBe(
      theme.color.onEnergy,
    );
  });

  it('Card "hero" takes the section fill and "tint" its soft tint', async () => {
    const theme = makeTheme('light');
    await render(
      <ThemeProvider mode="light">
        <Card variant="hero" section="gym" onPress={() => undefined} accessibilityLabel="hero">
          <Text>a</Text>
        </Card>
        <Card variant="tint" section="agua" onPress={() => undefined} accessibilityLabel="tint">
          <Text>b</Text>
        </Card>
      </ThemeProvider>,
    );
    const style = (name: string) =>
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style);
    expect(style('hero').backgroundColor).toBe(theme.section.gym.fill);
    expect(style('tint').backgroundColor).toBe(theme.section.agua.soft);
  });

  it('Screen pins the footer outside the scroll view', async () => {
    await render(
      <ThemeProvider mode="light">
        <Screen scroll footer={<Button label="Guardar" onPress={() => undefined} />}>
          <Text>content</Text>
        </Screen>
      </ThemeProvider>,
    );
    const footer = screen.getByTestId('screen-footer');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
    // The footer is a sibling of the scroll view, not inside it.
    expect(footer.parent?.type).not.toBe('RCTScrollView');
  });
});
