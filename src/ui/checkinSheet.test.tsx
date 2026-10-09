import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CheckinQuestion } from '../templates/schema';
import { setLanguage } from '../i18n';
import { CheckinSheet } from './CheckinSheet';
import { ThemeProvider } from './theme';

beforeEach(() => {
  setLanguage('es');
});

const questions: CheckinQuestion[] = [
  { id: 'hora-dormir', type: 'time', label: '¿A qué hora te dormiste?', prefill: 'bed' },
  { id: 'calidad', type: 'scale', label: '¿Cómo dormiste?', scale: [1, 5] },
  { id: 'nota', type: 'text', label: 'Nota', optional: true },
];

function renderSheet(props: Partial<Parameters<typeof CheckinSheet>[0]> = {}) {
  const onAnswer = jest.fn();
  const onSubmit = jest.fn();
  return {
    onAnswer,
    onSubmit,
    ui: render(
      <ThemeProvider mode="light">
        <CheckinSheet
          questions={questions}
          answers={{ 'hora-dormir': '23:50' }}
          onAnswer={onAnswer}
          onSubmit={onSubmit}
          submitting={false}
          {...props}
        />
      </ThemeProvider>,
    ),
  };
}

describe('CheckinSheet', () => {
  it('shows a 1-5 scale as five big face chips with a word', async () => {
    const { onAnswer, ui } = renderSheet();
    await ui;
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(5);
    expect(options[0]).toHaveStyle({ minWidth: 48, minHeight: 84 });
    for (const word of ['Mal', 'Regular', 'Bien', 'Muy bien', 'Genial']) {
      expect(screen.getByText(word)).toBeTruthy();
    }
    await fireEvent.press(screen.getByRole('radio', { name: '4 de 5, Muy bien' }));
    expect(onAnswer).toHaveBeenCalledWith('calidad', 4);
  });

  it('marks the chosen circle as checked', async () => {
    const { ui } = renderSheet({ answers: { calidad: 2 } });
    await ui;
    expect(screen.getByRole('radio', { name: '2 de 5, Regular' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '3 de 5, Bien' })).not.toBeChecked();
  });

  it('adjusts a prefilled time by 15 minutes with one tap, across midnight', async () => {
    const { onAnswer, ui } = renderSheet();
    await ui;
    await fireEvent.press(
      screen.getByRole('button', { name: '¿A qué hora te dormiste?, 15 minutos después' }),
    );
    expect(onAnswer).toHaveBeenCalledWith('hora-dormir', '00:05');
    await fireEvent.press(
      screen.getByRole('button', { name: '¿A qué hora te dormiste?, 15 minutos antes' }),
    );
    expect(onAnswer).toHaveBeenCalledWith('hora-dormir', '23:35');
  });

  it('submits and shows an error message', async () => {
    const { onSubmit, ui } = renderSheet({ error: 'Falta responder: ¿Cómo dormiste?' });
    await ui;
    expect(screen.getByText('Falta responder: ¿Cómo dormiste?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
