import { describe, expect, it } from '@jest/globals';

import type { CheckinQuestion } from '../templates/schema';
import { checkinSteps, checkinSummary, faceKey } from './checkinSteps';

const morning: CheckinQuestion[] = [
  { id: 'bed', type: 'time', label: 'Dormir', prefill: 'bed' },
  { id: 'wake', type: 'time', label: 'Despertar', prefill: 'wake' },
  { id: 'quality', type: 'scale', label: 'Calidad', scale: [1, 5] },
];
const night: CheckinQuestion[] = [
  { id: 'energy', type: 'scale', label: 'Energía', scale: [1, 5] },
  { id: 'note', type: 'text', label: 'Nota', optional: true },
];

describe('checkinSteps', () => {
  it('times, then scales and notes, then done', () => {
    expect(checkinSteps(morning).map((step) => [step.id, step.questions.length])).toEqual([
      ['times', 2],
      ['rate', 1],
      ['done', 0],
    ]);
  });

  it('skips a step without questions', () => {
    expect(checkinSteps(night).map((step) => step.id)).toEqual(['rate', 'done']);
  });
});

describe('checkinSummary', () => {
  it('sleep length across midnight, then the quality face', () => {
    expect(checkinSummary('morning', morning, { bed: '23:50', wake: '07:00', quality: 4 })).toEqual(
      [
        { key: 'checkin.summary.slept', params: { h: 7, m: '10' } },
        { key: 'checkin.summary.quality', params: {}, faceKey: 'checkin.scaleFaces.f4' },
      ],
    );
  });

  it('night: the first face as "tu día"; nothing without answers', () => {
    expect(checkinSummary('night', night, { energy: 1 })).toEqual([
      { key: 'checkin.summary.day', params: {}, faceKey: 'checkin.scaleFaces.f1' },
    ]);
    expect(checkinSummary('morning', morning, {})).toEqual([]);
  });

  it('faces only for five-point scales', () => {
    expect(faceKey({ id: 'x', type: 'scale', label: 'x', scale: [0, 10] }, 3)).toBeNull();
    expect(faceKey(morning[2]!, 5)).toBe('checkin.scaleFaces.f5');
  });
});
