import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { createAuthService } from '../src/services/auth.js';
import { createMemoryRepo } from './helpers/memory-repo.js';

const NOW = new Date('2030-06-01T08:00:00Z');

// A bcrypt comparison at cost 12 takes a few hundred milliseconds. If a login skips it for unknown emails,
// the response time tells an attacker which addresses have accounts.
describe('review finding R9: sign-in takes the same work whether or not the email exists', () => {
  it('AC-39 R9: an unknown email and a Google-only account each run one bcrypt comparison, like a wrong password', async () => {
    const repo = createMemoryRepo();
    const auth = createAuthService({ repo, now: () => NOW, sessionSecret: 'test-secret' });
    await auth.register({ email: 'ana@uni.bg', password: 'long-password' });
    await repo.createUser({ email: 'google-only@uni.bg', passwordHash: null });

    const compare = vi.spyOn(bcrypt, 'compare');
    try {
      for (const email of ['ana@uni.bg', 'nobody@uni.bg', 'google-only@uni.bg']) {
        compare.mockClear();
        await expect(auth.login({ email, password: 'wrong-password' })).rejects.toMatchObject({ status: 401, message: 'Invalid email or password.' });
        expect([email, compare.mock.calls.length]).toEqual([email, 1]);
      }
    } finally {
      compare.mockRestore();
    }
  }, 20000);
});
