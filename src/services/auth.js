import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

// Only a keyed hash is stored, so a leaked sessions table cannot be replayed as cookies,
// and the key lives in SESSION_SECRET, not in the database.
export function hashToken(secret, token) {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name ?? null };
}

export function createAuthService({ repo, now = () => new Date(), sessionDays = 14, sessionSecret }) {
  if (!sessionSecret) throw new Error('SESSION_SECRET must be set before the app can sign anyone in.');

  async function issueSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + sessionDays * 24 * 60 * 60 * 1000);
    await repo.insertSession({ tokenHash: hashToken(sessionSecret, token), userId, expiresAt });
    return token;
  }

  return {
    async register({ email, password }) {
      const normalized = normalizeEmail(email);
      if (!EMAIL_RE.test(normalized)) throw new AppError(400, 'Please enter a valid email address.');
      if (typeof password !== 'string' || password.length < 8) {
        throw new AppError(400, 'Password must be at least 8 characters long.');
      }
      if (await repo.findUserByEmail(normalized)) {
        throw new AppError(409, 'An account with this email already exists.');
      }
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = await repo.createUser({ email: normalized, passwordHash });
      return { user: publicUser(user), token: await issueSession(user.id) };
    },

    async login({ email, password }) {
      const user = await repo.findUserByEmail(normalizeEmail(email));
      const ok = Boolean(user?.password_hash) && (await bcrypt.compare(String(password ?? ''), user.password_hash));
      // Same message for unknown email and wrong password, so the form cannot be used to find accounts.
      if (!ok) throw new AppError(401, 'Invalid email or password.');
      return { user: publicUser(user), token: await issueSession(user.id) };
    },

    // profile comes from Google's userinfo endpoint: { sub, email, email_verified, name }
    async signInWithGoogle(profile) {
      if (!profile?.sub) throw new AppError(400, 'Google did not return an account id.');
      const linked = await repo.findIdentity('google', profile.sub);
      let user;
      if (linked) {
        user = await repo.findUserById(linked.user_id);
      } else {
        const email = normalizeEmail(profile.email);
        const existing = await repo.findUserByEmail(email);
        if (existing && profile.email_verified !== true) {
          throw new AppError(403, 'This Google account has an unverified email, so it cannot be linked to an existing account.');
        }
        user = existing ?? (await repo.createUser({ email, passwordHash: null, name: profile.name }));
        await repo.insertIdentity({ userId: user.id, provider: 'google', providerUserId: profile.sub });
      }
      return { user: publicUser(user), token: await issueSession(user.id) };
    },

    async userForToken(token) {
      if (!token) return null;
      const session = await repo.findSession(hashToken(sessionSecret, token));
      if (!session || session.expires_at <= now()) return null;
      const user = await repo.findUserById(session.user_id);
      return user ? publicUser(user) : null;
    },

    async logout(token) {
      if (token) await repo.deleteSession(hashToken(sessionSecret, token));
    },
  };
}
