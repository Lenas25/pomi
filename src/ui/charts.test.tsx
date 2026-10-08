import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { ThemeProvider } from './theme';
import { useDelayedFlag } from './useDelayedFlag';

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const layout = (width: number) => ({ nativeEvent: { layout: { width, height: 180, x: 0, y: 0 } } });

describe('LineChart', () => {
  it('is one image described by its summary, before and after it is measured', async () => {
    await renderThemed(
      <LineChart
        points={[
          { x: 0, y: 40 },
          { x: 56, y: 50 },
        ]}
        formatX={(x) => `d${x}`}
        formatY={String}
        summary="Hip thrust: de 40 a 50 kg en 8 semanas."
      />,
    );
    const chart = screen.getByRole('image', { name: 'Hip thrust: de 40 a 50 kg en 8 semanas.' });
    await fireEvent(chart, 'layout', layout(320));
    expect(screen.getByRole('image', { name: /de 40 a 50 kg/ })).toBeTruthy();
  });

  it('draws a single measurement and an empty series without crashing', async () => {
    await renderThemed(
      <LineChart
        points={[{ x: 10, y: 61.5 }]}
        formatX={String}
        formatY={String}
        summary="Peso: 61,5 kg."
      />,
    );
    await fireEvent(screen.getByRole('image'), 'layout', layout(320));
    await renderThemed(
      <LineChart points={[]} formatX={String} formatY={String} summary="Sin datos." />,
    );
    await fireEvent(screen.getByRole('image', { name: 'Sin datos.' }), 'layout', layout(320));
  });
});

describe('BarChart', () => {
  it('describes the bars and tolerates zeros, targets and a narrow width', async () => {
    await renderThemed(
      <BarChart
        bars={[
          { key: 'a', label: '28/9', value: 0, target: 3 },
          { key: 'b', label: '5/10', value: 2, target: 3, current: true },
        ]}
        formatY={String}
        summary="Sesiones por semana."
      />,
    );
    const chart = screen.getByRole('image', { name: 'Sesiones por semana.' });
    await fireEvent(chart, 'layout', layout(120));
    expect(screen.getByRole('image', { name: 'Sesiones por semana.' })).toBeTruthy();
  });
});

describe('useDelayedFlag', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('turns on only after the delay and resets when the work ends', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useDelayedFlag(active, 300),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(result.current).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
    await rerender({ active: false });
    expect(result.current).toBe(false);
    await rerender({ active: true });
    expect(result.current).toBe(false);
  });

  it('never shows for a load that finishes quickly', async () => {
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useDelayedFlag(active, 300),
      { initialProps: { active: true } },
    );
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await rerender({ active: false });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });
});
