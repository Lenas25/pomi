import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from './theme';
import { TimelineItem, type TimelineItemStatus } from './TimelineItem';

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

function setup(status: TimelineItemStatus) {
  const handlers = {
    onPress: jest.fn(),
    onCheck: jest.fn(),
    onLongPress: jest.fn(),
    onPostpone: jest.fn(),
    onSkip: jest.fn(),
  };
  const ui = (
    <TimelineItem
      status={status}
      time="06:00"
      title="Gym"
      subtitle="Día 1"
      accessibilityLabel="06:00, Gym, Pendiente"
      checkLabel={status === 'done' ? '«Gym», hecho' : 'Marcar «Gym» como hecho'}
      actionLabels={{ done: 'Hecho', postpone: 'Posponer', skip: 'Omitir' }}
      {...handlers}
    />
  );
  return { handlers, ui };
}

describe('TimelineItem', () => {
  it('shows time, title and subtitle', async () => {
    await renderThemed(setup('upcoming').ui);
    expect(screen.getByText('06:00')).toBeTruthy();
    expect(screen.getByText('Gym')).toBeTruthy();
    expect(screen.getByText('Día 1')).toBeTruthy();
  });

  it('the check button is the alternative to the swipe', async () => {
    const { ui, handlers } = setup('upcoming');
    await renderThemed(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar «Gym» como hecho' }));
    expect(handlers.onCheck).toHaveBeenCalledTimes(1);
  });

  it('long press opens the options and a tap opens the item', async () => {
    const { ui, handlers } = setup('now');
    await renderThemed(ui);
    const row = screen.getByRole('button', { name: '06:00, Gym, Pendiente' });
    await fireEvent(row, 'longPress');
    expect(handlers.onLongPress).toHaveBeenCalledTimes(1);
    await fireEvent.press(row);
    expect(handlers.onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes done / postpone / skip as labeled accessibility actions', async () => {
    const { ui, handlers } = setup('upcoming');
    await renderThemed(ui);
    const row = screen.getByRole('button', { name: '06:00, Gym, Pendiente' });
    expect(row.props.accessibilityActions).toEqual([
      { name: 'done', label: 'Hecho' },
      { name: 'postpone', label: 'Posponer' },
      { name: 'skip', label: 'Omitir' },
    ]);
    for (const actionName of ['done', 'postpone', 'skip']) {
      await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName } });
    }
    expect(handlers.onCheck).toHaveBeenCalledTimes(1);
    expect(handlers.onPostpone).toHaveBeenCalledTimes(1);
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
  });

  it('a done row is dimmed and struck through, and its check button says it is done', async () => {
    await renderThemed(setup('done').ui);
    expect(screen.getByText('Gym')).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(screen.getByRole('button', { name: '«Gym», hecho' })).toBeTruthy();
  });

  it('calls the latest onCheck after a re-render (the gesture reads it from a ref)', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const base = setup('upcoming').ui;
    const withHandler = (onCheck: () => void) => ({ ...base, props: { ...base.props, onCheck } });
    const view = await renderThemed(withHandler(first));
    await view.rerender(<ThemeProvider mode="light">{withHandler(second)}</ThemeProvider>);
    await fireEvent.press(screen.getByRole('button', { name: 'Marcar «Gym» como hecho' }));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
