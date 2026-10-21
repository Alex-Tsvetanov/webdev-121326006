import { describe, it, expect } from 'vitest';
import { createReservationService } from '../src/services/reservations.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');
const ana = { id: 1 };
const ben = { id: 2 };
const at = (hour) => `2030-06-03T${String(hour).padStart(2, '0')}:00:00Z`;

function setup() {
  const repo = createMemoryRepo();
  return { repo, svc: createReservationService({ repo, now: () => NOW }) };
}

describe('lab reservations', () => {
  it('AC-9: the end time must come after the start time', async () => {
    const { svc } = setup();
    await expect(svc.create(ana, { labId: 1, startsAt: at(12), endsAt: at(10) })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/after the start/),
    });
  });

  it('AC-10: overlapping bookings of the same lab are refused, while back-to-back and other-lab bookings are allowed', async () => {
    const { svc } = setup();
    await svc.create(ana, { labId: 1, startsAt: at(10), endsAt: at(12) });
    await expect(svc.create(ben, { labId: 1, startsAt: at(11), endsAt: at(13) })).rejects.toMatchObject({ status: 409 });
    await expect(svc.create(ben, { labId: 1, startsAt: at(12), endsAt: at(13) })).resolves.toMatchObject({ user_id: 2 });
    await expect(svc.create(ben, { labId: 2, startsAt: at(11), endsAt: at(13) })).resolves.toBeTruthy();
  });

  it("AC-11: a user cannot cancel or change someone else's reservation", async () => {
    const { svc, repo } = setup();
    const r = await svc.create(ana, { labId: 1, startsAt: at(10), endsAt: at(12) });
    await expect(svc.cancel(ben, r.id)).rejects.toMatchObject({ status: 403 });
    await expect(svc.update(ben, r.id, { purpose: 'mine now' })).rejects.toMatchObject({ status: 403 });
    expect(repo.reservations).toHaveLength(1);
    expect(repo.reservations[0].purpose).toBe('');
  });

  it('AC-12: a user can move and re-describe their own reservation without clashing with itself', async () => {
    const { svc } = setup();
    const r = await svc.create(ana, { labId: 1, startsAt: at(10), endsAt: at(12), purpose: 'Lab A' });
    const moved = await svc.update(ana, r.id, { startsAt: at(11), endsAt: at(13), purpose: 'Lab B' });
    expect(moved.purpose).toBe('Lab B');
    expect(moved.starts_at.getTime()).toBe(new Date(at(11)).getTime());
    const relabelled = await svc.update(ana, r.id, { purpose: '  Lab C  ' });
    expect(relabelled.purpose).toBe('Lab C');
  });

  it('AC-13: bookings in the past, longer than 8 hours, or with unreadable dates are refused', async () => {
    const { svc } = setup();
    await expect(
      svc.create(ana, { labId: 1, startsAt: '2030-05-30T10:00:00Z', endsAt: '2030-05-30T11:00:00Z' }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/past/) });
    await expect(svc.create(ana, { labId: 1, startsAt: at(8), endsAt: at(17) })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/8 hours/),
    });
    await expect(svc.create(ana, { labId: 1, startsAt: 'soon', endsAt: at(9) })).rejects.toMatchObject({ status: 400 });
    await expect(svc.update(ana, 999, { purpose: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('AC-14: a user can cancel their own reservation, and unknown labs or ids return 404', async () => {
    const { svc } = setup();
    await expect(svc.create(ana, { labId: 42, startsAt: at(10), endsAt: at(12) })).rejects.toMatchObject({ status: 404 });
    const r = await svc.create(ana, { labId: 1, startsAt: at(10), endsAt: at(12) });
    expect(await svc.listMine(ana)).toHaveLength(1);
    await svc.cancel(ana, r.id);
    expect(await svc.listMine(ana)).toHaveLength(0);
    await expect(svc.cancel(ana, 999)).rejects.toMatchObject({ status: 404 });
    expect(await svc.listLabs()).toHaveLength(2);
  });
});
