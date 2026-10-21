import { describe, it, expect } from 'vitest';
import { loadConfig, missingSettings } from '../src/config.js';

describe('startup settings', () => {
  it('AC-29: the web app names every required setting that is missing and starts when all are set', () => {
    expect(missingSettings(loadConfig({}))).toEqual(['DATABASE_URL', 'SESSION_SECRET']);
    expect(missingSettings(loadConfig({ DATABASE_URL: 'postgres://x' }))).toEqual(['SESSION_SECRET']);
    expect(missingSettings(loadConfig({ DATABASE_URL: 'postgres://x', SESSION_SECRET: 'secret' }))).toEqual([]);
  });
});
