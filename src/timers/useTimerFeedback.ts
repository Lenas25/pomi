// Foreground feedback for the active timer: re-derives the state from the clock (also when the app
// returns to the foreground), plays the 3-2-1 beeps, the end alarm and haptics, announces to
// screen readers and signals segment changes of cardio blocks. Mount it once in the gym session.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useStore } from 'zustand';

import { useT } from '../i18n';

import { setInAppTimerFeedback } from './notifications';
import { getTimerStore } from './store';
import { countdownCue, currentSegment, elapsedSec, segmentChanged } from './timerModel';

const beepSource = require('../../assets/sounds/beep.wav') as number;
const alarmSource = require('../../assets/sounds/alarm.wav') as number;

const TICK_MS = 250;
/** A timer that ran out longer ago than this did so in the background: no alarm on return. */
const ALARM_GRACE_MS = 3000;

function safe(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

export function useTimerFeedback(): void {
  const t = useT();
  const store = getTimerStore();
  const beep = useAudioPlayer(beepSource);
  const alarm = useAudioPlayer(alarmSource);
  const running = useStore(store, (state) => state.active?.state.status === 'running');
  const lastCue = useRef<{ key: string; cue: number | null }>({ key: '', cue: null });
  const lastElapsed = useRef<{ key: string; sec: number }>({ key: '', sec: 0 });

  useEffect(() => {
    setInAppTimerFeedback(true);
    safe(setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }));
    return () => setInAppTimerFeedback(false);
  }, []);

  useEffect(() => {
    const play = (player: typeof beep) => {
      safe(player.seekTo(0));
      player.play();
    };

    const tick = () => {
      store.getState().sync();
      const active = store.getState().active;
      if (!active || active.state.status !== 'running') return;
      const now = Date.now();
      // A new revision (e.g. +30 s) re-arms the countdown cues.
      const key = `${active.owner}:${active.revision}`;

      const cue = countdownCue(active.state, now);
      if (lastCue.current.key !== key) lastCue.current = { key, cue: null };
      if (cue !== null && cue !== lastCue.current.cue) {
        lastCue.current.cue = cue;
        play(beep);
        safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      }

      if (active.segments.length > 0) {
        const elapsed = elapsedSec(active.state, now);
        const segmentKey = active.owner;
        const previous = lastElapsed.current.key === segmentKey ? lastElapsed.current.sec : 0;
        lastElapsed.current = { key: segmentKey, sec: elapsed };
        if (previous > 0 && segmentChanged(active.segments, previous, elapsed)) {
          play(beep);
          const label = currentSegment(active.segments, elapsed)?.label;
          if (label) AccessibilityInfo.announceForAccessibility(label);
        }
      }
    };

    // Re-derive immediately when coming back to the foreground, then keep ticking while running.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    const interval = running ? setInterval(tick, TICK_MS) : undefined;
    return () => {
      subscription.remove();
      if (interval !== undefined) clearInterval(interval);
    };
  }, [store, running, beep]);

  useEffect(() => {
    // The end: alarm + success haptic + announcement, but only when it just happened in the
    // foreground (a timer that ended in the background already rang as a notification).
    return store.subscribe((state, previous) => {
      const active = state.active;
      if (!active || active.state.status !== 'finished') return;
      if (previous.active?.owner === active.owner && previous.active.state.status === 'finished') {
        return;
      }
      const message = active.nextLabel
        ? t('timers.finishedNext', { next: active.nextLabel })
        : t('timers.finished');
      if (active.finishedBy === 'elapsed') {
        const recent = Date.now() - (active.finishedAt ?? 0) < ALARM_GRACE_MS;
        if (recent) {
          alarm.seekTo(0).catch(() => undefined);
          alarm.play();
          safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
          AccessibilityInfo.announceForAccessibility(message);
        }
      }
    });
  }, [store, alarm, t]);
}
