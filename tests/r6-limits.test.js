import { describe, it, expect } from 'vitest';
import { createAuthService } from '../src/services/auth.js';
import { createAiService } from '../src/services/ai.js';
import { createReservationService } from '../src/services/reservations.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');
const MINUTE = 60 * 1000;

describe('review finding R6: limits on sign-in, the assistant, and bookings', () => {
  it('AC-33 R6: the eleventh sign-in attempt for one email within 15 minutes gets 429, even with the right password', async () => {
    let clock = NOW;
    const repo = createMemoryRepo();
    const auth = createAuthService({ repo, now: () => clock, sessionSecret: 'test-secret' });
    await auth.register({ email: 'ana@uni.bg', password: 'long-password' });

    for (let i = 0; i < 10; i += 1) {
      await expect(auth.login({ email: 'ana@uni.bg', password: 'wrong-password' })).rejects.toMatchObject({ status: 401 });
    }
    await expect(auth.login({ email: 'ana@uni.bg', password: 'long-password' })).rejects.toMatchObject({ status: 429 });

    // Another email is not affected, and the first one is allowed again after 15 minutes.
    await register(auth, 'ben@uni.bg');
    await expect(auth.login({ email: 'ben@uni.bg', password: 'long-password' })).resolves.toBeDefined();
    clock = new Date(NOW.getTime() + 15 * MINUTE + 1);
    await expect(auth.login({ email: 'ana@uni.bg', password: 'long-password' })).resolves.toBeDefined();
  });

  it('AC-34 R6: the 21st assistant request by one user within an hour gets 429 and makes no model call', async () => {
    const repo = createMemoryRepo();
    const ai = createAiService({ client: null, repo, now: () => NOW });
    const ana = { id: 1 };

    for (let i = 0; i < 20; i += 1) {
      expect((await ai.suggestReservation(ana, 'lab please')).status).toBe('unavailable');
    }
    await expect(ai.suggestReservation(ana, 'lab please')).rejects.toMatchObject({ status: 429 });
    // Another user still has their own allowance.
    expect((await ai.suggestReservation({ id: 2 }, 'lab please')).status).toBe('unavailable');
  });

  it('AC-35 R6: a user with ten upcoming reservations cannot book an eleventh; a finished one does not count', async () => {
    const repo = createMemoryRepo();
    const reservations = createReservationService({ repo, now: () => NOW });
    const ana = { id: 1 };
    // A reservation that ended before NOW is not upcoming, so it leaves room for the tenth.
    repo.reservations.push({ id: 900, lab_id: 1, user_id: 1, starts_at: new Date('2030-05-30T10:00:00Z'), ends_at: new Date('2030-05-30T11:00:00Z'), purpose: 'old' });
    for (let day = 0; day < 10; day += 1) {
      await reservations.create(ana, {
        labId: 1,
        startsAt: new Date(Date.UTC(2030, 5, 2 + day, 10)).toISOString(),
        endsAt: new Date(Date.UTC(2030, 5, 2 + day, 11)).toISOString(),
        purpose: 'upcoming',
      });
    }

    await expect(
      reservations.create(ana, { labId: 1, startsAt: '2030-07-01T10:00:00Z', endsAt: '2030-07-01T11:00:00Z', purpose: 'eleventh' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

async function register(auth, email) {
  await auth.register({ email, password: 'long-password' });
}
