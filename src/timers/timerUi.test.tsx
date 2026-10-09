import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import type { ReactElement } from 'react';

import { setLanguage } from '../i18n';
import { TimerRing } from '../ui/TimerRing';
import { TimerBar } from '../ui/TimerBar';
import { ThemeProvider } from '../ui/theme';

import { createTimerStore, type ActiveTimer, type TimerEffects } from './timerStore';
import { pauseTimer, skipTimer, startTimer } from './timerModel';
import { useTimerFeedback } from './useTimerFeedback';

const T0 = 1_000_000;

const mockPlay = jest.fn();
const mockSeekTo = jest.fn(() => Promise.resolve());
const mockImpact = jest.fn((_style: string) => Promise.resolve());
const mockNotify = jest.fn((_type: string) => Promise.resolve());
const mockStoreRef: { current: ReturnType<typeof createTimerStore> | undefined } = {
  current: undefined,
};

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: mockPlay, seekTo: mockSeekTo }),
  setAudioModeAsync: () => Promise.resolve(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: (style: string) => mockImpact(style),
  notificationAsync: (type: string) => mockNotify(type),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('./store', () => ({ getTimerStore: () => mockStoreRef.current }));
jest.mock('./notifications', () => ({ setInAppTimerFeedback: () => undefined }));

beforeEach(() => {
  setLanguage('es');
});

function renderThemed(ui: ReactElement) {
  return render(<ThemeProvider mode="light">{ui}</ThemeProvider>);
}

function activeTimer(overrides: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    owner: 'rest:ht:0',
    kind: 'rest',
    state: startTimer(T0, 80),
    nextLabel: 'Serie 2 · Hip thrust',
    notification: { title: 't', body: 'b' },
    segments: [],
    notificationId: null,
    finishedBy: null,
    finishedAt: null,
    revision: 1,
    startedAt: T0,
    ...overrides,
  };
}

describe('TimerRing', () => {
  it('reads the remaining time in words for screen readers', async () => {
    await renderThemed(<TimerRing kind="rest" state={startTimer(T0, 80)} now={T0} />);
    expect(
      screen.getByRole('timer', { name: 'Descanso, quedan 1 minuto 20 segundos' }),
    ).toBeTruthy();
    expect(screen.getByText('1:20')).toBeTruthy();
  });

  it('announces a pause and shows "¡Listo!" when finished', async () => {
    const paused = pauseTimer(startTimer(T0, 80), T0 + 20_000);
    const { rerender } = await renderThemed(<TimerRing kind="wait" state={paused} now={T0} />);
    expect(screen.getByRole('timer', { name: 'Espera, en pausa, quedan 1 minuto' })).toBeTruthy();
    await rerender(
      <ThemeProvider mode="light">
        <TimerRing kind="wait" state={skipTimer(paused)} now={T0} />
      </ThemeProvider>,
    );
    expect(screen.getByText('¡Listo!')).toBeTruthy();
    expect(screen.getByRole('timer', { name: 'Espera terminado' })).toBeTruthy();
  });

  it('shows the current cardio segment label under the number', async () => {
    const segments = [
      { atSec: 0, label: 'Inclinación 5%' },
      { atSec: 300, label: 'Inclinación 12%' },
    ];
    await renderThemed(
      <TimerRing
        kind="cardio"
        state={startTimer(T0, 600)}
        now={T0 + 310_000}
        segments={segments}
      />,
    );
    expect(screen.getByText('Inclinación 12%')).toBeTruthy();
  });
});

describe('TimerBar', () => {
  function setup(timer: ActiveTimer) {
    const handlers = {
      onPause: jest.fn(),
      onResume: jest.fn(),
      onAddTime: jest.fn(),
      onSkip: jest.fn(),
      onClose: jest.fn(),
    };
    return { handlers, ui: <TimerBar timer={timer} {...handlers} /> };
  }

  it('compact: time, the short next set and Pausar / +30 s / Saltar', async () => {
    const { ui, handlers } = setup(activeTimer());
    await renderThemed(ui);
    expect(screen.getByText('Serie 2 · Hip thrust')).toBeTruthy();
    // Full width, no ring until expanded.
    expect(screen.getByTestId('timer-bar')).toHaveStyle({ width: '100%' });
    expect(screen.queryByRole('timer')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Pausar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Sumar 30 segundos' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Saltar' }));
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
    expect(handlers.onAddTime).toHaveBeenCalledTimes(1);
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
  });

  it('tapping the time expands the ring view and speaks the status with what is next', async () => {
    // Paused at 80 s: the clock does not move during the test.
    const { ui } = setup(activeTimer({ state: pauseTimer(startTimer(T0, 80), T0) }));
    await renderThemed(ui);
    expect(screen.getByText('1:20')).toBeTruthy();
    const name = 'Descanso, en pausa, quedan 1 minuto 20 segundos. Siguiente: Serie 2 · Hip thrust';
    expect(screen.getByRole('button', { name }).props.accessibilityState).toEqual({
      expanded: false,
    });
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByRole('button', { name }).props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it('offers Seguir while paused and Cerrar once finished', async () => {
    const paused = setup(activeTimer({ state: pauseTimer(startTimer(T0, 80), T0 + 10_000) }));
    const { unmount } = await renderThemed(paused.ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir' }));
    expect(paused.handlers.onResume).toHaveBeenCalledTimes(1);
    await unmount();

    const finished = setup(
      activeTimer({ state: skipTimer(startTimer(T0, 80)), finishedBy: 'skipped' }),
    );
    await renderThemed(finished.ui);
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(finished.handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('useTimerFeedback (foreground)', () => {
  const announce = jest.fn();
  let appStateHandler: ((state: AppStateStatus) => void) | undefined;
  let clock = T0;
  let store: ReturnType<typeof createTimerStore>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    clock = T0;
    appStateHandler = undefined;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      appStateHandler = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(announce);
    const effects: TimerEffects = {
      schedule: jest.fn(async () => 'n1'),
      cancel: jest.fn(async () => undefined),
    };
    store = createTimerStore(effects, () => clock);
    mockStoreRef.current = store;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function startRest(durationSec: number) {
    store.getState().start({
      owner: 'rest:ht:0',
      kind: 'rest',
      durationSec,
      nextLabel: 'serie 2',
      notification: { title: 't', body: 'b' },
    });
  }

  async function tickTo(elapsedMs: number) {
    clock = T0 + elapsedMs;
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
  }

  it('beeps with a light haptic at 3-2-1 and rings the alarm when it runs out', async () => {
    await renderHook(() => useTimerFeedback());
    await act(async () => startRest(5));

    for (const elapsed of [2100, 3100, 4100]) await tickTo(elapsed);
    expect(mockPlay).toHaveBeenCalledTimes(3);
    expect(mockImpact).toHaveBeenCalledTimes(3);
    expect(mockImpact).toHaveBeenCalledWith('light');

    await tickTo(5100);
    expect(store.getState().active?.finishedBy).toBe('elapsed');
    expect(mockPlay).toHaveBeenCalledTimes(4); // the alarm
    expect(mockNotify).toHaveBeenCalledWith('success');
    expect(announce).toHaveBeenCalledWith('Descanso terminado. Siguiente: serie 2');
  });

  it('re-derives from the clock on foreground and does not ring for a timer that ended in the background', async () => {
    await renderHook(() => useTimerFeedback());
    await act(async () => startRest(60));
    clock = T0 + 10 * 60_000;
    await act(async () => {
      appStateHandler?.('active');
    });
    expect(store.getState().active?.state.status).toBe('finished');
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('stays silent when the timer is skipped', async () => {
    await renderHook(() => useTimerFeedback());
    await act(async () => startRest(60));
    await act(async () => store.getState().skip());
    expect(mockPlay).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  const segments = [
    { atSec: 0, label: 'Easy' },
    { atSec: 60, label: 'Hard' },
  ];

  function startCardio() {
    store.getState().start({
      owner: 'timed:run',
      kind: 'cardio',
      durationSec: 120,
      segments,
      notification: { title: 't', body: 'b' },
    });
  }

  it('cues the segment at 0 s once at the start, then only on changes', async () => {
    await renderHook(() => useTimerFeedback());
    await act(async () => startCardio());
    await tickTo(250);
    expect(announce).toHaveBeenCalledWith('Easy');
    expect(mockPlay).toHaveBeenCalledTimes(1);
    await tickTo(1000);
    expect(mockPlay).toHaveBeenCalledTimes(1);
    await tickTo(60_500);
    expect(announce).toHaveBeenCalledWith('Hard');
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });

  it('does not repeat cues when +30 s bumps the revision of the same run', async () => {
    await renderHook(() => useTimerFeedback());
    await act(async () => startCardio());
    await tickTo(250);
    mockPlay.mockClear();
    await act(async () => store.getState().addTime(30));
    await tickTo(1000);
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('re-arms the 3-2-1 countdown after +30 s at 3 s left', async () => {
    await renderHook(() => useTimerFeedback());
    await act(async () =>
      store.getState().start({
        owner: 'rest:ht:0',
        kind: 'rest',
        durationSec: 5,
        notification: { title: 't', body: 'b' },
      }),
    );
    await tickTo(2100); // 3 s left -> first beep
    expect(mockPlay).toHaveBeenCalledTimes(1);
    await act(async () => store.getState().addTime(30));
    await tickTo(2400);
    await tickTo(32_100); // 3 s left again -> beeps again
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });
});
