import { describe, expect, it } from '@jest/globals';

import { diffSchedule, isManagedId, signatureOf, type ResolvedNotification } from './diff';

function resolved(id: string, overrides: Partial<ResolvedNotification> = {}): ResolvedNotification {
  return { id, at: 1000, channel: 'habits', category: null, title: 't', body: 'b', ...overrides };
}

describe('diffSchedule', () => {
  it('schedules what is missing and cancels managed notifications no longer wanted', () => {
    const wanted = [resolved('water:agua:agua:2026-10-05:10:00')];
    const diff = diffSchedule(wanted, [{ id: 'water:agua:agua:2026-10-05:09:00', signature: 'x' }]);
    expect(diff.toSchedule).toEqual(['water:agua:agua:2026-10-05:10:00']);
    expect(diff.toCancel).toEqual(['water:agua:agua:2026-10-05:09:00']);
  });

  it('leaves identical notifications alone and reschedules changed ones', () => {
    const same = resolved('gym:core:gym:2026-10-05:06:00');
    const changed = resolved('survey:core:activity:2026-10-05:20:00', { title: 'new' });
    const diff = diffSchedule(
      [same, changed],
      [
        { id: same.id, signature: signatureOf(same) },
        { id: changed.id, signature: signatureOf({ ...changed, title: 'old' }) },
      ],
    );
    expect(diff.toSchedule).toEqual([changed.id]);
    expect(diff.toCancel).toEqual([]);
  });

  it('never touches notifications it does not own (timers, snoozes)', () => {
    const diff = diffSchedule(
      [],
      [
        { id: '7b1e4c0a-uuid-like', signature: undefined },
        { id: 'snooze:water:agua:agua:2026-10-05:10:00:1', signature: undefined },
      ],
    );
    expect(diff.toCancel).toEqual([]);
    expect(isManagedId('habit:movimiento:pausa-activa:2026-10-05:09:00')).toBe(true);
    expect(isManagedId('snooze:x')).toBe(false);
  });

  it('reschedules when the time changes', () => {
    const moved = resolved('checkin:core:morning:2026-10-05:05:20', { at: 2000 });
    const diff = diffSchedule(
      [moved],
      [{ id: moved.id, signature: signatureOf({ ...moved, at: 1000 }) }],
    );
    expect(diff.toSchedule).toEqual([moved.id]);
  });
});
