import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { es } from '../i18n/es';
import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';
import { ActivityCard } from './ActivityCard';

beforeEach(() => {
  setLanguage('es');
});

describe('ActivityCard', () => {
  it('reports the chosen answer', async () => {
    const onAnswer = jest.fn();
    await render(
      <ThemeProvider mode="light">
        <ActivityCard answer={undefined} onAnswer={onAnswer} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('radio', { name: es.activity.walk }));
    expect(onAnswer).toHaveBeenCalledWith('walk');
    expect(screen.queryByText(es.activity.reply.none)).toBeNull();
  });

  it('answers "Hoy no" kindly and marks it as the selected option', async () => {
    await render(
      <ThemeProvider mode="light">
        <ActivityCard answer="none" onAnswer={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Pasa. Mañana seguimos')).toBeTruthy();
    expect(screen.getByRole('radio', { name: es.activity.none })).toBeChecked();
  });
});
