import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import { ExerciseCard } from './ExerciseCard';
import { SetRow } from './SetRow';
import { buildExerciseView, type SetsStep, type StoredSet } from './sessionViewModel';

beforeEach(() => {
  setLanguage('es');
});

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

const step: SetsStep = {
  type: 'sets',
  id: 'ht',
  name: 'Hip thrust',
  sets: 3,
  reps: '8–10',
  restSec: 120,
  incrementKg: 5,
  weightHint: '40–45 kg',
};

const history = [
  {
    date: '2026-10-01',
    sets: [
      { stepId: 'ht', setIndex: 0, weightKg: 40, reps: 10, rir: 2 },
      { stepId: 'ht', setIndex: 1, weightKg: 40, reps: 10, rir: 2 },
      { stepId: 'ht', setIndex: 2, weightKg: 40, reps: 10, rir: 2 },
    ],
  },
];

describe('SetRow', () => {
  const base = {
    index: 1,
    exerciseName: 'Hip thrust',
    bodyweight: false,
    previous: { weightKg: 40, reps: 9 },
    placeholder: { weightKg: 40, reps: 9 },
    onToggle: jest.fn(),
    onRir: jest.fn(),
  };

  it('✓ passes what was typed; the label names the set and the exercise', async () => {
    const onToggle = jest.fn();
    await renderThemed(<SetRow {...base} status="current" logged={null} onToggle={onToggle} />);
    await fireEvent.changeText(screen.getByLabelText(/Peso de la serie 2/), '42,5');
    await fireEvent.changeText(screen.getByLabelText(/Repeticiones de la serie 2/), '8');
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'Serie 2 de Hip thrust, marcar como hecha' }),
    );
    expect(onToggle).toHaveBeenCalledWith(1, { weightText: '42,5', repsText: '8', rir: null });
  });

  it('sends empty inputs as they are (the default comes from the previous value)', async () => {
    const onToggle = jest.fn();
    await renderThemed(<SetRow {...base} status="current" logged={null} onToggle={onToggle} />);
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(1, { weightText: '', repsText: '', rir: null });
  });

  it('shows a done row as checked with the logged values and locked inputs', async () => {
    await renderThemed(
      <SetRow {...base} status="done" logged={{ weightKg: 42.5, reps: 8, rir: 1 }} />,
    );
    const toggle = screen.getByRole('checkbox', {
      name: 'Serie 2 de Hip thrust, hecha, desmarcar',
    });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText(/Peso de la serie 2/).props.value).toBe('42,5');
    expect(screen.getByLabelText(/Peso de la serie 2/).props.editable).toBe(false);
    expect(
      screen.getByRole('radio', { name: 'Repeticiones en reserva: 1' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('lays RIR out as a label row, then a row of 48 dp circles', async () => {
    await renderThemed(<SetRow {...base} status="current" logged={null} />);
    const circles = screen.getByTestId('rir-circles');
    expect(screen.getByTestId('rir-block').props.style).not.toMatchObject({ flexWrap: 'wrap' });
    expect(circles.props.style).toMatchObject({ flexDirection: 'row' });
    const radio = screen.getByRole('radio', { name: 'Repeticiones en reserva: 0' });
    expect(radio.props.style).toMatchObject({ width: 48, height: 48 });
  });

  it('keeps the RIR choice locally before ✓ and logs it with the press', async () => {
    const onToggle = jest.fn();
    await renderThemed(<SetRow {...base} status="current" logged={null} onToggle={onToggle} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Repeticiones en reserva: 2' }));
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith(1, expect.objectContaining({ rir: 2 }));
  });

  it('edits the RIR of a done set through onRir, and tapping it again clears it', async () => {
    const onRir = jest.fn();
    await renderThemed(
      <SetRow {...base} status="done" logged={{ weightKg: 40, reps: 9, rir: 1 }} onRir={onRir} />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Repeticiones en reserva: 3' }));
    expect(onRir).toHaveBeenLastCalledWith(1, 3);
    await fireEvent.press(screen.getByRole('radio', { name: 'Repeticiones en reserva: 1' }));
    expect(onRir).toHaveBeenLastCalledWith(1, null);
  });

  it('hides the kg input for bodyweight sets', async () => {
    await renderThemed(<SetRow {...base} bodyweight status="current" logged={null} />);
    expect(screen.queryByLabelText(/Peso de la serie/)).toBeNull();
    expect(screen.getByLabelText(/Repeticiones de la serie 2/)).toBeTruthy();
  });

  it('shows a hold button that starts the hold timer', async () => {
    const onStart = jest.fn();
    await renderThemed(
      <SetRow {...base} status="current" logged={null} holdSec={40} onHold={onStart} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Aguantar 40 s' }));
    expect(onStart).toHaveBeenCalledWith(1);
  });

  it('shows an inline error and does NOT log when a field is invalid (no silent fallback)', async () => {
    const onToggle = jest.fn();
    await renderThemed(<SetRow {...base} status="current" logged={null} onToggle={onToggle} />);
    await fireEvent.changeText(screen.getByLabelText(/Peso de la serie 2/), '4x');
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText(/Peso no válido/)).toBeTruthy();

    // Editing the field clears the error and a valid value goes through.
    await fireEvent.changeText(screen.getByLabelText(/Peso de la serie 2/), '42,5');
    expect(screen.queryByText(/Peso no válido/)).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('rejects non-integer reps with its own message', async () => {
    const onToggle = jest.fn();
    await renderThemed(<SetRow {...base} status="current" logged={null} onToggle={onToggle} />);
    await fireEvent.changeText(screen.getByLabelText(/Repeticiones de la serie 2/), '8,5');
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText(/Repeticiones no válidas/)).toBeTruthy();
  });
});

describe('ExerciseCard', () => {
  function setup(logs: StoredSet[] = []) {
    const handlers = { onSetDone: jest.fn(), onSetUndone: jest.fn(), onRir: jest.fn() };
    const view = buildExerciseView(step, history);
    return {
      handlers,
      ui: <ExerciseCard step={step} view={view} logs={logs} {...handlers} />,
    };
  }

  it('shows the target of the day, the last time and the chips', async () => {
    await renderThemed(setup().ui);
    expect(screen.getByText('Meta de hoy')).toBeTruthy();
    // One concise line; the explanation waits behind "¿Por qué?".
    expect(screen.getByText('Hoy: 45 kg × 8')).toBeTruthy();
    expect(screen.queryByText(/Hoy: 45 kg × 8\. La última vez/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '¿Por qué?' }));
    expect(screen.getByText(/Hoy: 45 kg × 8\. La última vez: 40 kg × 10/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ocultar' })).toBeTruthy();
    expect(screen.getByText(/La última vez: 40 kg × 10 · 40 kg × 10 · 40 kg × 10/)).toBeTruthy();
    expect(screen.getByText('3 × 8–10')).toBeTruthy();
    expect(screen.getByText('Descanso 2:00')).toBeTruthy();
    expect(screen.getByText('Peso: 40–45 kg')).toBeTruthy();
  });

  it('column headers over the sets and a short RIR label that opens its explanation', async () => {
    await renderThemed(setup().ui);
    const header = screen.getByTestId('set-header', { includeHiddenElements: true });
    expect(header).toBeTruthy();
    expect(screen.getByText('Serie', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Anterior', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Repeticiones en reserva')).toBeNull();
    expect(screen.getByText('RIR')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '¿Qué es RIR?' }));
    expect(screen.getByText('RIR: repeticiones en reserva')).toBeTruthy();
  });

  it('✓ with empty inputs logs the previous value (default on empty)', async () => {
    const { ui, handlers } = setup();
    await renderThemed(ui);
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'Serie 1 de Hip thrust, marcar como hecha' }),
    );
    expect(handlers.onSetDone).toHaveBeenCalledWith(step, 0, {
      weightKg: 40,
      reps: 10,
      rir: null,
    });
  });

  it('✓ on a done set unmarks it', async () => {
    const { ui, handlers } = setup([
      { stepId: 'ht', setIndex: 0, weightKg: 45, reps: 8, rir: null },
    ]);
    await renderThemed(ui);
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'Serie 1 de Hip thrust, hecha, desmarcar' }),
    );
    expect(handlers.onSetUndone).toHaveBeenCalledWith(step, 0);
    expect(handlers.onSetDone).not.toHaveBeenCalled();
  });

  it('marks the card complete when every set is logged', async () => {
    const { ui } = setup(
      [0, 1, 2].map((i) => ({ stepId: 'ht', setIndex: i, weightKg: 45, reps: 8, rir: null })),
    );
    await renderThemed(ui);
    expect(screen.getByLabelText('Ejercicio completo')).toBeTruthy();
  });
});
