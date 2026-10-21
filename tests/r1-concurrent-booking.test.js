import { describe, it, expect } from 'vitest';
import { createReservationService } from '../src/services/reservations.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');

describe('review finding R1: concurrent bookings', () => {
  it('AC-10 R1: eight simultaneous bookings of one slot leave exactly one reservation', async () => {
    const repo = createMemoryRepo();
    const reservations = createReservationService({ repo, now: () => NOW });
    const slot = { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T12:00:00Z', purpose: 'race' };
    const users = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 }));

    const results = await Promise.allSettled(users.map((user) => reservations.create(user, slot)));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(repo.reservations).toHaveLength(1);
    const refused = results.filter((r) => r.status === 'rejected');
    expect(refused.every((r) => r.reason.status === 409)).toBe(true);
  });
});
