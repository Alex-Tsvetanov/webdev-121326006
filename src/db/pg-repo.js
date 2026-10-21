import pg from 'pg';
import { OverlapError } from '../errors.js';

// 23P01 is PostgreSQL's exclusion_violation: the reservations_no_overlap constraint (migration 004) fired.
const noOverlap = (promise) =>
  promise.catch((err) => {
    if (err.code === '23P01') throw new OverlapError();
    throw err;
  });

// All SQL lives here. Services receive this object and never see SQL.
export function createPool(url, { ssl = false } = {}) {
  const pool = new pg.Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: true } : undefined });
  // An idle connection that the server drops (a restart, a sleeping free database) emits 'error'.
  // Without a listener Node exits. Log it instead: the next request reconnects, and /health says 503 meanwhile.
  pool.on('error', (err) => console.error('Database connection lost:', err.message));
  return pool;
}

export function createPgRepo(pool) {
  const q = (text, params) => pool.query(text, params).then((r) => r.rows);
  const one = async (text, params) => (await q(text, params))[0] ?? null;

  return {
    findUserByEmail: (email) => one('select id, email, name, password_hash from users where email = $1', [email]),
    findUserById: (id) => one('select id, email, name, password_hash from users where id = $1', [id]),
    createUser: ({ email, passwordHash, name = null }) =>
      one(
        'insert into users (email, password_hash, name) values ($1, $2, $3) returning id, email, name, password_hash',
        [email, passwordHash, name],
      ),
    findIdentity: (provider, providerUserId) =>
      one('select user_id from identities where provider = $1 and provider_user_id = $2', [provider, providerUserId]),
    insertIdentity: ({ userId, provider, providerUserId }) =>
      q('insert into identities (user_id, provider, provider_user_id) values ($1, $2, $3)', [userId, provider, providerUserId]),

    insertSession: ({ tokenHash, userId, expiresAt }) =>
      q('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [tokenHash, userId, expiresAt]),
    findSession: (tokenHash) => one('select user_id, expires_at from sessions where token_hash = $1', [tokenHash]),
    deleteSession: (tokenHash) => q('delete from sessions where token_hash = $1', [tokenHash]),

    ping: () => q('select 1', []),

    listLabs: () =>
      q(`select l.id, l.name, l.location, l.capacity,
                coalesce(array_agg(e.name order by e.name) filter (where e.name is not null), '{}') as equipment
         from labs l
         left join lab_equipment le on le.lab_id = l.id
         left join equipment e on e.id = le.equipment_id
         group by l.id
         order by l.name`),
    findLab: (id) => one('select id, name, location, capacity from labs where id = $1', [id]),

    listReservationsForUser: (userId) =>
      q(`select r.id, r.lab_id, r.user_id, r.starts_at, r.ends_at, r.purpose, l.name as lab_name
         from reservations r join labs l on l.id = r.lab_id
         where r.user_id = $1
         order by r.starts_at`, [userId]),
    findReservation: (id) =>
      one('select id, lab_id, user_id, starts_at, ends_at, purpose from reservations where id = $1', [id]),
    findOverlapping: ({ labId, startsAt, endsAt, excludeId }) =>
      one(
        `select id from reservations
         where lab_id = $1 and starts_at < $3 and ends_at > $2
           and ($4::int is null or id <> $4::int)
         limit 1`,
        [labId, startsAt, endsAt, excludeId ?? null],
      ),
    insertReservation: ({ labId, userId, startsAt, endsAt, purpose }) =>
      noOverlap(
        one(
          `insert into reservations (lab_id, user_id, starts_at, ends_at, purpose)
           values ($1, $2, $3, $4, $5)
           returning id, lab_id, user_id, starts_at, ends_at, purpose`,
          [labId, userId, startsAt, endsAt, purpose],
        ),
      ),
    updateReservation: (id, { startsAt, endsAt, purpose }) =>
      noOverlap(
        one(
          `update reservations set starts_at = $2, ends_at = $3, purpose = $4 where id = $1
           returning id, lab_id, user_id, starts_at, ends_at, purpose`,
          [id, startsAt, endsAt, purpose],
        ),
      ),
    deleteReservation: (id) => q('delete from reservations where id = $1', [id]),
  };
}
