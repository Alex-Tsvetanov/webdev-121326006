import express from 'express';
import { randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';

// Reads one cookie value from the raw Cookie header.
function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Browsers send the `sid` cookie. Scripts (MCP, CLI) send `Authorization: Bearer <token>`.
function tokenFrom(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return readCookie(req, 'sid');
}

function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new AppError(404, 'Reservation not found.');
  return id;
}

export function createApp({ auth, reservations, ai, google, health, config, staticDir }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));

  const secure = config.publicBaseUrl.startsWith('https://');
  const cookieBase = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
  const sessionCookie = { ...cookieBase, maxAge: config.sessionDays * 24 * 60 * 60 * 1000 };

  const requireUser = async (req, res, next) => {
    const user = await auth.userForToken(tokenFrom(req));
    if (!user) throw new AppError(401, 'Please sign in to continue.');
    req.user = user;
    next();
  };

  const requireGoogle = (req, res, next) => {
    if (!google) throw new AppError(503, 'Google sign-in is not configured on this server.');
    next();
  };

  // Auth
  app.post('/api/auth/register', async (req, res) => {
    const { user, token } = await auth.register(req.body ?? {});
    res.cookie('sid', token, sessionCookie).status(201).json({ user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { user, token } = await auth.login(req.body ?? {});
    res.cookie('sid', token, sessionCookie).json({ user });
  });

  // For non-browser clients: returns the token in the body instead of a cookie.
  app.post('/api/auth/token', async (req, res) => {
    const { user, token } = await auth.login(req.body ?? {});
    res.json({ user, token });
  });

  app.post('/api/auth/logout', async (req, res) => {
    await auth.logout(tokenFrom(req));
    res.clearCookie('sid', cookieBase).status(204).end();
  });

  app.get('/api/auth/me', requireUser, (req, res) => {
    res.json({ user: req.user });
  });

  app.get('/auth/google', requireGoogle, (req, res) => {
    const state = randomBytes(16).toString('base64url');
    res.cookie('oauth_state', state, { ...cookieBase, maxAge: 10 * 60 * 1000 }).redirect(google.authUrl(state));
  });

  app.get('/auth/google/callback', requireGoogle, async (req, res) => {
    const state = String(req.query.state ?? '');
    if (!state || state !== readCookie(req, 'oauth_state')) {
      throw new AppError(400, 'Sign-in expired. Please try again.');
    }
    const profile = await google.fetchProfile(String(req.query.code ?? ''));
    const { token } = await auth.signInWithGoogle(profile);
    res.clearCookie('oauth_state', cookieBase).cookie('sid', token, sessionCookie).redirect('/');
  });

  // Labs and reservations
  app.get('/api/labs', requireUser, async (req, res) => {
    res.json({ labs: await reservations.listLabs() });
  });

  app.get('/api/reservations', requireUser, async (req, res) => {
    res.json({ reservations: await reservations.listMine(req.user) });
  });

  app.post('/api/reservations', requireUser, async (req, res) => {
    const reservation = await reservations.create(req.user, req.body ?? {});
    res.status(201).json({ reservation });
  });

  app.patch('/api/reservations/:id', requireUser, async (req, res) => {
    const reservation = await reservations.update(req.user, idParam(req), req.body ?? {});
    res.json({ reservation });
  });

  app.delete('/api/reservations/:id', requireUser, async (req, res) => {
    await reservations.cancel(req.user, idParam(req));
    res.status(204).end();
  });

  // AI
  app.post('/api/ai/suggest-reservation', requireUser, async (req, res) => {
    res.json(await ai.suggestReservation(req.body?.text));
  });

  // For the platform's health probe: 200 while the database answers, 503 when it does not.
  app.get('/health', async (req, res) => {
    const { ok } = await health.check();
    if (ok) return res.json({ status: 'ok' });
    res.status(503).json({ status: 'unavailable', error: 'The database is not answering. Try again shortly.' });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use(express.static(staticDir));

  app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found.');
  });

  // Every error reaches the user as a sentence in { error }.
  app.use((err, req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    if (err.expose) return res.status(err.status).json({ error: 'The request could not be read. Check it and try again.' });
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return app;
}
