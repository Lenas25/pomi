import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { setLanguage } from '../i18n';
import { NumberStepper, TimeStepper } from './Stepper';
import { ThemeProvider } from './theme';

beforeEach(() => {
  setLanguage('en');
});

function Time({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <TimeStepper label="Wake" value={value} onChange={setValue} />;
}

function Hours({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return (
    <NumberStepper label="Sleep" value={value} onChange={setValue} step={0.25} min={7} max={7.5} />
  );
}

describe('TimeStepper', () => {
  it('wraps the hour around midnight and steps minutes by 5', async () => {
    await render(
      <ThemeProvider mode="light">
        <Time initial="23:00" />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Wake, hour' }));
    expect(screen.getByLabelText('Wake 00:00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Wake, minutes' }));
    expect(screen.getByLabelText('Wake 00:05')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Wake, hour' }));
    expect(screen.getByLabelText('Wake 23:05')).toBeTruthy();
  });
});

describe('TimeStepper carry', () => {
  it('carries minutes into the hour across midnight in both directions', async () => {
    await render(
      <ThemeProvider mode="light">
        <Time initial="23:55" />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Wake, minutes' }));
    expect(screen.getByLabelText('Wake 00:00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Wake, minutes' }));
    expect(screen.getByLabelText('Wake 23:55')).toBeTruthy();
  });

  it('gives each value a label with its context for screen readers', async () => {
    await render(
      <ThemeProvider mode="light">
        <Time initial="07:30" />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Wake, hour: 07')).toBeTruthy();
    expect(screen.getByLabelText('Wake, minutes: 30')).toBeTruthy();
  });
});

describe('NumberStepper', () => {
  it('stops at its limits and disables the matching button', async () => {
    await render(
      <ThemeProvider mode="light">
        <Hours initial={7.25} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Sleep' }));
    expect(screen.getByText('7.5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Increase Sleep' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Sleep' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Sleep' }));
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decrease Sleep' })).toBeDisabled();
  });
});
