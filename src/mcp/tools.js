import { z } from 'zod';
import { AppError } from '../errors.js';

// Tool metadata. Importing this file builds no services, so the MCP server can list its tools without a database.
// `inputSchema` is what a client reads in tools/list; `schema` checks the arguments on each call.
// Each `run` calls the same service function as the matching HTTP route, so the same rules apply.
export const TOOL_SPECS = [
  {
    name: 'list_labs',
    description: 'List all lab rooms with their location, capacity, and equipment so you can pick one.',
    inputSchema: { type: 'object', properties: {} },
    schema: z.object({}),
    run: (s) => s.reservations.listLabs(),
  },
  {
    name: 'list_my_reservations',
    description: "List the signed-in user's lab reservations, sorted by start time, with lab names.",
    inputSchema: { type: 'object', properties: {} },
    schema: z.object({}),
    run: (s, user) => s.reservations.listMine(user),
  },
  {
    name: 'create_reservation',
    description: 'Book a free lab for the signed-in user. Times are ISO 8601 date-times and a booking can last at most 8 hours.',
    inputSchema: {
      type: 'object',
      properties: {
        labId: { type: 'integer', description: 'Lab id from list_labs' },
        startsAt: { type: 'string', description: 'Start, ISO 8601 with offset' },
        endsAt: { type: 'string', description: 'End, ISO 8601 with offset' },
        purpose: { type: 'string', description: 'Short purpose, up to 200 characters' },
      },
      required: ['labId', 'startsAt', 'endsAt'],
    },
    schema: z.object({
      labId: z.number().int(),
      startsAt: z.string(),
      endsAt: z.string(),
      purpose: z.string().max(200).optional(),
    }),
    run: (s, user, args) => s.reservations.create(user, args),
  },
  {
    name: 'update_reservation',
    description: "Change the start, end, or purpose of one of the signed-in user's own reservations. Other users' reservations are refused.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Reservation id from list_my_reservations' },
        startsAt: { type: 'string', description: 'New start, ISO 8601 with offset' },
        endsAt: { type: 'string', description: 'New end, ISO 8601 with offset' },
        purpose: { type: 'string', description: 'New purpose, up to 200 characters' },
      },
      required: ['id'],
    },
    schema: z.object({
      id: z.number().int(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
      purpose: z.string().max(200).optional(),
    }),
    run: (s, user, { id, ...changes }) => s.reservations.update(user, id, changes),
  },
  {
    name: 'cancel_reservation',
    description: "Cancel one of the signed-in user's own reservations by its id. Other users' reservations are refused.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'Reservation id from list_my_reservations' } },
      required: ['id'],
    },
    schema: z.object({ id: z.number().int() }),
    run: async (s, user, { id }) => {
      await s.reservations.cancel(user, id);
      return { cancelled: true, id };
    },
  },
  {
    name: 'suggest_reservation',
    description: 'Turn a short natural-language request into a proposed reservation. Nothing is booked; call create_reservation to confirm.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'The request in plain words, up to 500 characters' } },
      required: ['text'],
    },
    schema: z.object({ text: z.string().min(1).max(500) }),
    run: (s, user, { text }) => s.ai.suggestReservation(user, text),
  },
];

// Binds the metadata to live services. Only call this when a tool actually runs.
export function createTools(services) {
  return TOOL_SPECS.map((spec) => ({ ...spec, run: (user, args) => spec.run(services, user, args) }));
}

// The MCP server acts as one ordinary user. It never runs as an administrator.
export async function requireMcpUser(auth, token) {
  const user = await auth.userForToken(token);
  if (!user) throw new AppError(401, 'MCP_TOKEN is missing or expired. Get a session token from POST /api/auth/token.');
  return user;
}
