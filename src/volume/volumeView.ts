// Pure view model of the weekly volume per muscle: what the Gym tab and Progreso show.
import {
  musclesWithVolume,
  referenceRange,
  weeklyVolume,
  type ReferenceRange,
  type VolumeWeek,
} from '../domain/volume/weeklyVolume';
import type { Muscle } from '../domain/generator/types';

import type { VolumeData } from './loadVolume';

export const WEEK_CHOICES = [4, 8] as const;
export type WeekChoice = (typeof WEEK_CHOICES)[number];

export type MuscleRow = { muscle: Muscle; sets: number; reference: ReferenceRange | null };

export type VolumeView = {
  /** Every week of the widest window, oldest first. */
  weeks: VolumeWeek[];
  /** Muscles with volume in the window, vocabulary order. */
  muscles: Muscle[];
};

export function buildVolumeView(data: VolumeData, weeks: number): VolumeView {
  const list = weeklyVolume({
    today: data.today,
    weeks,
    sets: data.sets,
    stepMuscles: data.stepMuscles,
  });
  return { weeks: list, muscles: musclesWithVolume(list) };
}

/** This week's rows, most sets first (ties keep the vocabulary order). */
export function thisWeekRows(data: VolumeData): MuscleRow[] {
  const [week] = weeklyVolume({
    today: data.today,
    weeks: 1,
    sets: data.sets,
    stepMuscles: data.stepMuscles,
  });
  const rows = musclesWithVolume(week ? [week] : []).map((muscle) => ({
    muscle,
    sets: week?.sets[muscle] ?? 0,
    reference: referenceRange(muscle, data.level, data.goal),
  }));
  return rows.sort((a, b) => b.sets - a.sets);
}

export const referenceFor = (data: VolumeData, muscle: Muscle): ReferenceRange | null =>
  referenceRange(muscle, data.level, data.goal);

/** `1`, `0,5` / `0.5`: halves only, decimal mark by language. */
export function formatSets(value: number, language: 'es' | 'en'): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return language === 'es' ? text.replace('.', ',') : text;
}
