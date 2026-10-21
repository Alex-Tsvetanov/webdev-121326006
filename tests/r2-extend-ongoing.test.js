import { describe, it, expect } from 'vitest';
import { createReservationService } from '../src/services/reservations.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

describe('review finding R2: changing a booking that has started', () => {
  it('AC-12 R2: the owner can extend a booking that has already started, but cannot move its start into the past', async () => {
    let clock = new Date('2030-06-03T09:00:00Z');
    const reservations = createReservationService({ repo: createMemoryRepo(), now: () => clock });
    const ana = { id: 1 };
    const booking = await reservations.create(ana, {
      labId: 1,
      startsAt: '2030-06-03T10:00:00Z',
      endsAt: '2030-06-03T12:00:00Z',
      purpose: 'lab work',
    });

    clock = new Date('2030-06-03T10:30:00Z');
    const extended = await reservations.update(ana, booking.id, { endsAt: '2030-06-03T13:00:00Z' });
    expect(extended.ends_at).toEqual(new Date('2030-06-03T13:00:00Z'));

    await expect(reservations.update(ana, booking.id, { startsAt: '2030-06-03T10:15:00Z' })).rejects.toMatchObject({ status: 400 });
  });
});
