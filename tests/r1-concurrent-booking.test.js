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

  it('AC-12 R1: a move that lands on another booking is refused with 409 even when the pre-check misses it', async () => {
    const repo = createMemoryRepo();
    const reservations = createReservationService({ repo, now: () => NOW });
    const ana = { id: 1 };
    await reservations.create(ana, { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T11:00:00Z', purpose: 'a' });
    const mine = await reservations.create(ana, { labId: 1, startsAt: '2030-06-03T12:00:00Z', endsAt: '2030-06-03T13:00:00Z', purpose: 'b' });
    // Simulate the race: the pre-check runs before the other booking is visible to it.
    repo.findOverlapping = async () => null;

    await expect(reservations.update(ana, mine.id, { startsAt: '2030-06-03T10:30:00Z' })).rejects.toMatchObject({ status: 409 });
    expect(repo.reservations.find((r) => r.id === mine.id).starts_at).toEqual(new Date('2030-06-03T12:00:00Z'));
  });

  it('a database failure that is not an overlap is passed on unchanged, not turned into a 409', async () => {
    const repo = createMemoryRepo();
    repo.insertReservation = async () => {
      throw new Error('connection lost');
    };
    const reservations = createReservationService({ repo, now: () => NOW });
    const slot = { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T11:00:00Z', purpose: 'x' };
    await expect(reservations.create({ id: 1 }, slot)).rejects.toThrow('connection lost');
  });
});
