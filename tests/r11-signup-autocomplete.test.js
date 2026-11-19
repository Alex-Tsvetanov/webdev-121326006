import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const form = (id) => html.match(new RegExp(`<form id="${id}"[\\s\\S]*?</form>`))?.[0] ?? '';
const passwordAutocomplete = (markup) => markup.match(/<input name="password"[^>]*autocomplete="([^"]+)"/)?.[1];

// Password managers decide from `autocomplete` whether to fill a saved password or offer a new one.
// One field serving both sign-in and sign-up can only be right for one of them.
describe('review finding R11: sign-in and sign-up ask for different passwords', () => {
  it('AC-41 R11: the sign-up form asks for a new password, and the sign-in form for the current one', () => {
    expect(passwordAutocomplete(form('auth-form'))).toBe('current-password');
    expect(passwordAutocomplete(form('register-form'))).toBe('new-password');
    expect(form('register-form')).toMatch(/minlength="8"/);
  });
});
