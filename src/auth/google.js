import { AppError } from '../errors.js';

// Google OpenID Connect, authorization-code flow. The client secret stays on the server.
export function createGoogleClient({ clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const failed = () => new AppError(400, 'Google sign-in failed. Please try again.');

  return {
    authUrl(state) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    async fetchProfile(code) {
      if (!code) throw new AppError(400, 'Google sign-in was cancelled. Please try again.');
      const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw failed();
      const { access_token: accessToken } = await tokenRes.json();

      const infoRes = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!infoRes.ok) throw failed();
      return infoRes.json();
    },
  };
}
