import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { en } from '../i18n/en';
import { setLanguage } from '../i18n';
import { es } from '../i18n/es';
import { ThemeProvider } from '../ui/theme';
import { useOnboardingDraft } from './draftStore';
import { BodyQuestion, NameQuestion, WorkQuestion } from './questions';

jest.mock('../notifications/PermissionsPanel', () => ({ PermissionsPanel: () => null }));

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const insets = {
  frame: { x: 0, y: 0, width: 360, height: 720 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(ui: ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={insets}>
      <ThemeProvider mode="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  setLanguage('es');
  mockPush.mockClear();
  mockBack.mockClear();
  useOnboardingDraft.getState().reset();
});

describe('WorkQuestion', () => {
  it('shows progress, saves the choice and moves on with "Siguiente"', async () => {
    await renderScreen(<WorkQuestion />);
    expect(screen.getByRole('progressbar', { name: 'Pregunta 4 de 12' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: es.onboarding.work.sentada }));
    expect(screen.getByRole('radio', { name: es.onboarding.work.sentada })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: es.onboarding.next }));

    expect(useOnboardingDraft.getState().draft.workType).toBe('sentada');
    expect(mockPush).toHaveBeenCalledWith('/onboarding/sleepClock');
  });

  it('clears the answer and moves on with "Saltar"', async () => {
    useOnboardingDraft.getState().update({ workType: 'activa' });
    await renderScreen(<WorkQuestion />);

    await fireEvent.press(screen.getByRole('button', { name: es.onboarding.skip }));

    expect(useOnboardingDraft.getState().draft.workType).toBeUndefined();
    expect(mockPush).toHaveBeenCalledWith('/onboarding/sleepClock');
  });

  it('goes back through the router and exposes 48 dp targets', async () => {
    await renderScreen(<WorkQuestion />);
    const backButton = screen.getByRole('button', { name: es.onboarding.back });
    expect(backButton).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(backButton);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('BodyQuestion', () => {
  it('blocks "Siguiente" on an out-of-range weight and explains why', async () => {
    await renderScreen(<BodyQuestion />);
    await fireEvent.changeText(screen.getByLabelText(es.onboarding.body.weightLabel), '5');
    await fireEvent.press(screen.getByRole('button', { name: es.onboarding.next }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe un peso entre 20 y 300 kg.')).toBeTruthy();
  });

  it('accepts a decimal comma and stores both values', async () => {
    await renderScreen(<BodyQuestion />);
    await fireEvent.changeText(screen.getByLabelText(es.onboarding.body.weightLabel), '60,5');
    await fireEvent.changeText(screen.getByLabelText(es.onboarding.body.heightLabel), '154');
    await fireEvent.press(screen.getByRole('button', { name: es.onboarding.next }));

    expect(useOnboardingDraft.getState().draft).toMatchObject({ weightKg: 60.5, heightCm: 154 });
    expect(mockPush).toHaveBeenCalledWith('/onboarding/age');
  });
});

describe('NameQuestion', () => {
  it('greets with Pomi, shows the medical notice and has no back button', async () => {
    await renderScreen(<NameQuestion />);
    expect(screen.getByText(es.onboarding.welcome.bubble)).toBeTruthy();
    expect(screen.getByText(es.onboarding.medical.body)).toBeTruthy();
    expect(screen.queryByRole('button', { name: es.onboarding.back })).toBeNull();
  });

  it('keeps the bubble within the 40-character mascot limit in both languages', () => {
    expect(es.onboarding.welcome.bubble.length).toBeLessThanOrEqual(40);
    expect(en.onboarding.welcome.bubble.length).toBeLessThanOrEqual(40);
  });
});

describe('navigation and keyboard behaviour', () => {
  it('ignores a second tap while the next question is opening', async () => {
    await renderScreen(<WorkQuestion />);
    const next = screen.getByRole('button', { name: es.onboarding.next });
    await fireEvent.press(next);
    await fireEvent.press(next);
    await fireEvent.press(screen.getByRole('button', { name: es.onboarding.skip }));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('announces a validation error', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen(<BodyQuestion />);
    await fireEvent.changeText(screen.getByLabelText(es.onboarding.body.weightLabel), '5');
    await fireEvent.press(screen.getByRole('button', { name: es.onboarding.next }));
    expect(announce).toHaveBeenCalledWith('Escribe un peso entre 20 y 300 kg.');
    announce.mockRestore();
  });

  it('moves from weight to height and submits from the last field', async () => {
    await renderScreen(<BodyQuestion />);
    await fireEvent.changeText(screen.getByLabelText(es.onboarding.body.weightLabel), '60');
    await fireEvent.changeText(screen.getByLabelText(es.onboarding.body.heightLabel), '160');
    await fireEvent(screen.getByLabelText(es.onboarding.body.heightLabel), 'submitEditing');
    expect(useOnboardingDraft.getState().draft.heightCm).toBe(160);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
