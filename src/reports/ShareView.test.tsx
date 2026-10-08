import { fireEvent, render, screen } from '@testing-library/react-native';

import { setLanguage } from '../i18n';
import { ThemeProvider } from '../ui/theme';

import { ShareView } from './ShareView';
import type { ReportData } from './types';

jest.mock('../photos/StoredPhoto', () => ({ StoredPhoto: () => null }));

const NOW = new Date(2026, 9, 7, 12, 0);
const data: ReportData = {
  today: '2026-10-07',
  startedOn: '2026-08-01',
  gymDays: [],
  sessions: [{ date: '2026-10-05', sets: [{ stepId: 'squat', weightKg: 60, reps: 8 }] }],
  exerciseNames: { squat: 'Sentadilla' },
  water: null,
  steps: [],
  stepsGoal: null,
  checks: [],
  foodNotes: [{ date: '2026-10-05', text: 'Comí ensalada' }],
  sleep: [{ date: '2026-10-05', bed: '23:00', wake: '07:00' }],
  sleepTargetH: 8,
  metrics: [],
  photos: [{ date: '2026-10-05', pose: 'frente', name: 'a.jpg' }],
};

async function renderView(onShare = jest.fn(async () => 'shared' as const)) {
  const view = await render(
    <ThemeProvider mode="light">
      <ShareView data={data} now={NOW} onShare={onShare} />
    </ThemeProvider>,
  );
  return { ...view, onShare };
}

beforeEach(() => setLanguage('es'));

describe('ShareView', () => {
  it('starts with the custom template: no photos, no food notes, nothing is sent yet', async () => {
    const { onShare } = await renderView();
    expect(screen.getByRole('switch', { name: 'Fotos' }).props.value).toBe(false);
    expect(screen.getByRole('switch', { name: 'Hallazgos' }).props.disabled).toBe(true);
    expect(onShare).not.toHaveBeenCalled();
  });

  it('shows exactly what will be sent before sharing, and shares that model', async () => {
    const { onShare } = await renderView();
    await fireEvent.press(screen.getByRole('radio', { name: 'Entrenador' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ver qué se enviará' }));
    expect(screen.getByText(/Preparado para: Entrenador/)).toBeTruthy();
    expect(screen.getByText(/Sentadilla: 1 sesiones, 1 series/)).toBeTruthy();
    expect(screen.queryByText(/Comí ensalada/)).toBeNull();
    expect(screen.queryByText(/## Sueño/)).toBeNull();
    expect(onShare).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));
    expect(onShare).toHaveBeenCalledTimes(1);
    const [model, format] = onShare.mock.calls[0] as unknown as [
      { sections: { kind: string }[] },
      string,
    ];
    expect(format).toBe('text');
    expect(model.sections.map((section) => section.kind)).toEqual(['gym', 'measures']);
  });

  it('cannot continue without a section, and a failure keeps the preview with a readable message', async () => {
    const failing = jest.fn(async () => {
      throw new Error('boom');
    });
    await renderView(failing as never);
    // Untick everything the custom template starts with.
    for (const name of ['Gym', 'Hábitos', 'Sueño', 'Medidas']) {
      await fireEvent(screen.getByRole('switch', { name }), 'valueChange', false);
    }
    expect(screen.getByText('Marca al menos una sección para poder compartir.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ver qué se enviará' }).props.accessibilityState.disabled,
    ).toBe(true);

    await fireEvent(screen.getByRole('switch', { name: 'Gym' }), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Ver qué se enviará' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Compartir' }));
    expect(
      await screen.findByText('No pudimos preparar el reporte. Inténtalo de nuevo.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver y editar' })).toBeTruthy();
  });

  it('photos only appear in the PDF preview, and only after they are switched on', async () => {
    await renderView();
    await fireEvent(screen.getByRole('switch', { name: 'Fotos' }), 'valueChange', true);
    await fireEvent.press(screen.getByRole('radio', { name: 'PDF' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ver qué se enviará' }));
    expect(screen.getByText(/Fotos del período: 1/)).toBeTruthy();
    expect(screen.getByText('Fotos que se incluirán: 1')).toBeTruthy();
  });
});
