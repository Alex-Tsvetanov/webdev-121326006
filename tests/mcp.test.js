import { describe, it, expect } from 'vitest';
import { createTools, requireMcpUser } from '../src/mcp/tools.js';
import { createAuthService } from '../src/services/auth.js';
import { createReservationService } from '../src/services/reservations.js';
import { createAiService } from '../src/services/ai.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');

function setup() {
  const repo = createMemoryRepo();
  const auth = createAuthService({ repo, now: () => NOW, sessionSecret: 'test-secret' });
  const reservations = createReservationService({ repo, now: () => NOW });
  const ai = createAiService({ client: null, repo, now: () => NOW });
  const tools = createTools({ reservations, ai });
  const byName = (name) => tools.find((t) => t.name === name);
  return { repo, auth, tools, byName };
}

describe('MCP server', () => {
  it('AC-24: the server exposes the two Exercise 1 tools plus at least three more, each described in at least 20 characters', async () => {
    const { tools, byName } = setup();
    expect(tools.length).toBeGreaterThanOrEqual(5);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['list_labs', 'list_my_reservations']));
    for (const tool of tools) expect(tool.description.length).toBeGreaterThanOrEqual(20);

    const ana = { id: 1 };
    expect(await byName('list_labs').run(ana)).toHaveLength(2);
    expect(await byName('list_my_reservations').run(ana)).toEqual([]);
  });

  it('AC-25: MCP tools call the same service as the HTTP routes, so ownership is enforced for the acting user', async () => {
    const { repo, byName } = setup();
    const ana = { id: 1 };
    const created = await byName('create_reservation').run(ana, {
      labId: 1,
      startsAt: '2030-06-03T10:00:00Z',
      endsAt: '2030-06-03T11:00:00Z',
      purpose: 'MCP booking',
    });
    expect(repo.reservations).toHaveLength(1);
    await expect(byName('cancel_reservation').run({ id: 2 }, { id: created.id })).rejects.toMatchObject({ status: 403 });
    await expect(byName('update_reservation').run({ id: 2 }, { id: created.id, purpose: 'x' })).rejects.toMatchObject({ status: 403 });
    await byName('update_reservation').run(ana, { id: created.id, purpose: 'Renamed' });
    expect(repo.reservations[0].purpose).toBe('Renamed');
    expect(await byName('cancel_reservation').run(ana, { id: created.id })).toEqual({ cancelled: true, id: created.id });
    expect(repo.reservations).toHaveLength(0);
    expect(await byName('suggest_reservation').run(ana, { text: 'a lab please' })).toMatchObject({ status: 'unavailable' });
  });

  it('AC-26: the MCP server refuses to run without a valid session token of an ordinary user', async () => {
    const { auth } = setup();
    await expect(requireMcpUser(auth, undefined)).rejects.toMatchObject({ status: 401 });
    await expect(requireMcpUser(auth, 'bogus')).rejects.toMatchObject({ status: 401 });
    const { token } = await auth.register({ email: 'mcp@uni.bg', password: 'long-password' });
    expect(await requireMcpUser(auth, token)).toMatchObject({ email: 'mcp@uni.bg' });
  });
});
