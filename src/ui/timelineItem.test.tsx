import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeProvider } from './theme';
import { TimelineItem, type TimelineItemStatus } from './TimelineItem';

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

function setup(status: TimelineItemStatus) {
  const handlers = { onPress: jest.fn(), onCheck: jest.fn(), onLongPress: jest.fn() };
  const ui = (
    <TimelineItem
      status={status}
      time="06:00"
      title="Gym"
      subtitle="Día 1"
      accessibilityLabel="06:00, Gym, Pendiente"
      checkLabel="Marcar «Gym» como hecho"
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
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Marcar «Gym» como hecho' }));
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

  it('a done row is checked, struck through and dimmed; a skipped one is not checked', async () => {
    const { unmount } = await renderThemed(setup('done').ui);
    const done = screen.getByRole('checkbox');
    expect(done.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('Gym')).toHaveStyle({ textDecorationLine: 'line-through' });
    await unmount();
    await renderThemed(setup('skipped').ui);
    expect(screen.getByRole('checkbox').props.accessibilityState).toMatchObject({ checked: false });
  });
});
