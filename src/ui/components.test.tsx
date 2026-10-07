import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ThemeProvider } from './theme';

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

describe('EmptyState', () => {
  it('renders title and body', async () => {
    await renderThemed(<EmptyState title="Title" body="Body" />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });
});
