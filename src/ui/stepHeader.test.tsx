import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { StepHeader } from './StepHeader';
import { ThemeProvider, makeTheme } from './theme';

const theme = makeTheme('light');

describe('StepHeader', () => {
  it('keeps a fixed 48×48 back slot on the first step, so the content never shifts', async () => {
    await render(
      <ThemeProvider mode="light">
        <StepHeader backLabel="Back">
          <Text>progress</Text>
        </StepHeader>
      </ThemeProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    const slot = StyleSheet.flatten(screen.getByTestId('step-header-back-slot').props.style);
    expect(slot.width).toBe(theme.touch.gym);
    expect(slot.height).toBe(theme.touch.gym);
  });

  it('renders the back button in the same 48×48 slot when there is a previous step', async () => {
    const onBack = jest.fn();
    await render(
      <ThemeProvider mode="light">
        <StepHeader backLabel="Back" onBack={onBack}>
          <Text>progress</Text>
        </StepHeader>
      </ThemeProvider>,
    );
    const back = screen.getByRole('button', { name: 'Back' });
    const style = StyleSheet.flatten(back.props.style);
    expect(style.width).toBe(theme.touch.gym);
    expect(style.height).toBe(theme.touch.gym);
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
