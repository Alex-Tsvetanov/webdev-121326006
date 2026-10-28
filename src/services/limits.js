import { AppError } from '../errors.js';

// Allows at most `max` attempts per key in any window of `windowMs`. Kept in memory, so it starts empty after a restart.
export function createLimiter({ max, windowMs, message, now }) {
  const attempts = new Map();
  return {
    take(key) {
      const t = now().getTime();
      const recent = (attempts.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= max) {
        attempts.set(key, recent);
        throw new AppError(429, message);
      }
      recent.push(t);
      attempts.set(key, recent);
    },
  };
}
