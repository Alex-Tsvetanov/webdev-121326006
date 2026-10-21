// In-memory stand-in for src/db/pg-repo.js with the same method names and row shapes.
export function createMemoryRepo() {
  let seq = 0;
  const users = [];
  const identities = [];
  const sessions = [];
  const reservations = [];
  const labs = [
    { id: 1, name: 'Biology Lab 1', location: 'Building 2', capacity: 20, equipment: ['Microscope'] },
    { id: 2, name: 'Electronics Lab', location: 'Building 3', capacity: 12, equipment: ['Oscilloscope'] },
  ];

  return {
    users,
    identities,
    sessions,
    reservations,

    async findUserByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async findUserById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async createUser({ email, passwordHash, name = null }) {
      const user = { id: ++seq, email, password_hash: passwordHash, name };
      users.push(user);
      return { ...user };
    },
    async findIdentity(provider, providerUserId) {
      return identities.find((i) => i.provider === provider && i.provider_user_id === providerUserId) ?? null;
    },
    async insertIdentity({ userId, provider, providerUserId }) {
      identities.push({ user_id: userId, provider, provider_user_id: providerUserId });
    },
    async insertSession({ tokenHash, userId, expiresAt }) {
      sessions.push({ token_hash: tokenHash, user_id: userId, expires_at: expiresAt });
    },
    async findSession(tokenHash) {
      return sessions.find((s) => s.token_hash === tokenHash) ?? null;
    },
    async deleteSession(tokenHash) {
      const i = sessions.findIndex((s) => s.token_hash === tokenHash);
      if (i >= 0) sessions.splice(i, 1);
    },
    async ping() {
      return [{ '?column?': 1 }];
    },
    async listLabs() {
      return labs.map((l) => ({ ...l, equipment: [...l.equipment] }));
    },
    async findLab(id) {
      const lab = labs.find((l) => l.id === id);
      return lab ? { id: lab.id, name: lab.name, location: lab.location, capacity: lab.capacity } : null;
    },
    async listReservationsForUser(userId) {
      return reservations
        .filter((r) => r.user_id === userId)
        .map((r) => ({ ...r, lab_name: labs.find((l) => l.id === r.lab_id).name }));
    },
    async findReservation(id) {
      const r = reservations.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    async findOverlapping({ labId, startsAt, endsAt, excludeId }) {
      return reservations.find((r) => r.lab_id === labId && r.starts_at < endsAt && r.ends_at > startsAt && r.id !== excludeId) ?? null;
    },
    async insertReservation({ labId, userId, startsAt, endsAt, purpose }) {
      const r = { id: ++seq, lab_id: labId, user_id: userId, starts_at: startsAt, ends_at: endsAt, purpose };
      reservations.push(r);
      return { ...r };
    },
    async updateReservation(id, { startsAt, endsAt, purpose }) {
      const r = reservations.find((x) => x.id === id);
      Object.assign(r, { starts_at: startsAt, ends_at: endsAt, purpose });
      return { ...r };
    },
    async deleteReservation(id) {
      const i = reservations.findIndex((x) => x.id === id);
      if (i >= 0) reservations.splice(i, 1);
    },
  };
}
