import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { Button } from './Button';
import { Card } from './Card';
import { MascotBubble } from './MascotBubble';
import { EmptyState } from './EmptyState';
import { ThemeProvider, makeTheme } from './theme';
import { Text } from 'react-native';

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
