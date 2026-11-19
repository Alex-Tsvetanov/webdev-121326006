import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/http/app.js';
import { createTools } from '../src/mcp/tools.js';
import { createAuthService } from '../src/services/auth.js';
import { createReservationService } from '../src/services/reservations.js';
import { createAiService } from '../src/services/ai.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');
const slot = { labId: 1, startsAt: '2030-06-03T10:00:00Z', endsAt: '2030-06-03T12:00:00Z', purpose: 'Lab work' };

// PostgreSQL refuses an `int` parameter that is not an integer in range (22P02 for NaN, 22003 out of range),
// and the app turns that into a 500. This repo fails the same way, so the tests show which layer stops a bad id.
function postgresLikeRepo() {
  const repo = createMemoryRepo();
  const int4 = (fn) => async (id, ...rest) => {
    if (!Number.isInteger(id) || id < -2147483648 || id > 2147483647) {
      throw Object.assign(new Error(`invalid input for type integer: "${id}"`), { code: '22P02' });
    }
    return fn(id, ...rest);
  };
  for (const name of ['findLab', 'findReservation', 'updateReservation', 'deleteReservation']) repo[name] = int4(repo[name]);
  return repo;
}

function setup() {
  const repo = postgresLikeRepo();
  const auth = createAuthService({ repo, now: () => NOW, sessionSecret: 'test-secret' });
  const reservations = createReservationService({ repo, now: () => NOW });
  const ai = createAiService({ client: null, repo, now: () => NOW });
  const app = createApp({
    auth,
    reservations,
    ai,
    google: null,
    config: { publicBaseUrl: 'http://localhost:3000', sessionDays: 14 },
    staticDir: fileURLToPath(new URL('../public', import.meta.url)),
  });
  const tools = createTools({ reservations, ai });
  const tool = (name) => tools.find((t) => t.name === name);
  return { repo, auth, reservations, app, tool };
}

describe('review finding R7: the id check lives in the service, so HTTP and MCP get the same answer', () => {
  it('AC-38 R7: an MCP cancel or update with an id beyond the database integer range is "Reservation not found.", not a database error', async () => {
    const { tool } = setup();
    const ana = { id: 1 };
    for (const id of [2 ** 31, Number.MAX_SAFE_INTEGER, 0, -1]) {
      await expect(tool('cancel_reservation').run(ana, { id })).rejects.toMatchObject({ status: 404, message: 'Reservation not found.' });
      await expect(tool('update_reservation').run(ana, { id, purpose: 'x' })).rejects.toMatchObject({ status: 404, message: 'Reservation not found.' });
    }
  });

  it('AC-38 R7: the HTTP routes answer 404 for ids that are not integers or are out of range', async () => {
    const { app, auth } = setup();
    const { token } = await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    const bearer = `Bearer ${token}`;
    for (const id of ['abc', '1.5', '99999999999', '0']) {
      const del = await request(app).delete(`/api/reservations/${id}`).set('Authorization', bearer);
      expect([id, del.status, del.body.error]).toEqual([id, 404, 'Reservation not found.']);
      const patch = await request(app).patch(`/api/reservations/${id}`).set('Authorization', bearer).send({ purpose: 'x' });
      expect([id, patch.status]).toEqual([id, 404]);
    }
    // A real id given as a path string still works.
    const created = await request(app).post('/api/reservations').set('Authorization', bearer).send(slot);
    expect((await request(app).delete(`/api/reservations/${created.body.reservation.id}`).set('Authorization', bearer)).status).toBe(204);
  });

  it('AC-38 R7: a booking whose lab id is missing, not a whole number, or out of range is "Lab not found.", not a database error', async () => {
    const { reservations, repo } = setup();
    const ana = { id: 1 };
    for (const labId of [undefined, null, true, 'abc', 1.5, 0, 2 ** 31]) {
      await expect(reservations.create(ana, { ...slot, labId })).rejects.toMatchObject({ status: 404, message: 'Lab not found.' });
    }
    // A lab id sent as a numeric string, as an HTML form would, is still accepted.
    await expect(reservations.create(ana, { ...slot, labId: '2' })).resolves.toMatchObject({ lab_id: 2 });
    expect(repo.reservations).toHaveLength(1);
  });
});
