import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { setLanguage } from '../i18n';
import { Consistency } from './Consistency';
import { HabitCounter } from './HabitCounter';
import { ThemeProvider } from './theme';

const mockImpact = jest.fn();

jest.mock('expo-haptics', () => ({
  impactAsync: (...args: unknown[]) => mockImpact(...args),
  ImpactFeedbackStyle: { Light: 'light' },
}));

beforeEach(() => {
  setLanguage('es');
  mockImpact.mockClear();
});

function Water({ initial, target }: { initial: number; target: number }) {
  const [value, setValue] = useState(initial);
  return (
    <ThemeProvider mode="light">
      <HabitCounter variant="water" value={value} target={target} onChange={setValue} />
    </ThemeProvider>
  );
}

describe('HabitCounter water', () => {
  it('renders one 40 dp drop per glass of the goal, named "Vaso n de total"', async () => {
    await render(<Water initial={0} target={8} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByRole('checkbox', { name: 'Vaso 3 de 8' })).toHaveStyle({
      width: 40,
      height: 40,
    });
  });

  it('fills up to the tapped drop with a light haptic, and the last filled drop unfills', async () => {
    await render(<Water initial={0} target={8} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Vaso 3 de 8' }));
    expect(screen.getByRole('checkbox', { name: 'Vaso 3 de 8' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Vaso 1 de 8' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Vaso 4 de 8' })).not.toBeChecked();
    expect(mockImpact).toHaveBeenCalledWith('light');

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Vaso 3 de 8' }));
    expect(screen.getByRole('checkbox', { name: 'Vaso 3 de 8' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Vaso 2 de 8' })).toBeChecked();
  });

  it('keeps showing extra drops when more glasses than the goal were drunk', async () => {
    await render(<Water initial={11} target={10} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(11);
  });
});

describe('HabitCounter steps and Consistency', () => {
  it('formats steps with the locale separator and names the goal', async () => {
    await render(
      <ThemeProvider mode="light">
        <HabitCounter variant="steps" value={7500} target={9000} locale="en" />
      </ThemeProvider>,
    );
    expect(screen.getByText('7,500')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Meta: 9,000 pasos' })).toBeTruthy();
  });

  it('describes the consistency in words, not as a streak', async () => {
    await render(
      <ThemeProvider mode="light">
        <Consistency done={8} total={10} label="8 de los últimos 10 días" />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('8 de los últimos 10 días')).toBeTruthy();
  });
});
