// Drives headless Chrome over the DevTools protocol against the local app, checks the keyboard flow,
// layout shift and the four states for docs/UI.md, and saves the screenshots. No dependencies: Node 22+ and Chrome.
// 1. Start a local database and the app with the Gemini stand-in, never with real keys:
//    PORT=3100 PUBLIC_BASE_URL=http://localhost:3100 DATABASE_URL=postgres://… SESSION_SECRET=local-only \
//    GEMINI_API_KEY=stub node --import ./scripts/fake-gemini.mjs src/main.js
// 2. node scripts/ui-check.mjs docs/ui
// It registers a throwaway account (keyboard-<time>@example.test) in that local database.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OUT = process.argv[2] ?? 'docs/ui';
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ui-check-'))}`,
  '--lang=en-US', '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i += 1) {
  await sleep(200);
  target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const waitFor = async (expression, timeout = 8000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  throw new Error(`timed out waiting for: ${expression}`);
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
  console.log('saved', name);
};
const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
const goto = async (url) => {
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"');
};

// Keyboard only: every action below is a key event or typed text. No clicks.
const KEYS = { Tab: 9, Enter: 13, ArrowDown: 40, Space: 32 };
const press = async (key, { shift = false } = {}) => {
  const base = { key, code: key, windowsVirtualKeyCode: KEYS[key], modifiers: shift ? 8 : 0 };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  if (key === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(60);
};
const typeChars = async (text) => {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await sleep(30);
  }
};
const focused = () => evaluate(`(() => { const a = document.activeElement; return a.id || a.name || a.textContent.trim().slice(0, 30) || a.tagName; })()`);
const tabTo = async (expected, max = 25) => {
  const path = [];
  for (let i = 0; i < max; i += 1) {
    await press('Tab');
    const now = await focused();
    path.push(now);
    if (now === expected) return path;
  }
  throw new Error(`Tab never reached ${expected}; went through ${path.join(' > ')}`);
};

const results = {};
const pad = (n) => String(n).padStart(2, '0');
// A random day 1 to 300 weeks ahead, so a second run against the same database does not hit its own earlier booking.
const day = new Date(Date.now() + (1 + Math.floor(Math.random() * 300)) * 7 * 24 * 3600e3);
// This Chrome shows dd.mm.yyyy and a 24-hour clock. Tab moves from the year to the hour inside the field.
const ddmmyyyy = `${pad(day.getDate())}${pad(day.getMonth() + 1)}${day.getFullYear()}`;
const typeDateTime = async (time) => { await typeChars(ddmmyyyy); await press('Tab'); await typeChars(time); };
const email = `keyboard-${Date.now()}@example.test`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  // Collect layout shifts from the first paint of every page load.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((list) => { for (const e of list.getEntries()) { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(e.value); } } })
        .observe({ type: 'layout-shift', buffered: true });`,
  });

  // 1. Sign-in screen, then keyboard only: switch to sign-up, create an account.
  await viewport(1280);
  await goto(`${BASE}/`);
  await waitFor('!document.querySelector("#auth").hidden');
  await shot('01-sign-in.png');
  results.registerAutocomplete = await evaluate('document.querySelector("#register-form input[name=password]").autocomplete');
  results.signInAutocomplete = await evaluate('document.querySelector("#auth-form input[name=password]").autocomplete');

  const keyboard = [];
  keyboard.push(['to "Create an account"', await tabTo('show-register')]);
  await press('Enter');
  keyboard.push(['after Enter, focus on', await focused()]);
  await typeChars(email);
  await press('Tab');
  await typeChars('keyboard-check-password');
  await shot('02-create-account.png');
  await press('Enter');
  await waitFor('!document.querySelector("#app").hidden && document.querySelector("#mine").textContent.includes("no reservations")');
  // 2. Empty state on a new account.
  await shot('03-empty.png');

  // 3. Keyboard-only booking: Tab to the lab select, pick the second lab, type the dates, Enter.
  keyboard.push(['to the lab select', await tabTo('labId')]);
  await press('Tab');
  keyboard.push(['start field', await focused()]);
  await typeDateTime('1000');
  // Chrome moves through the date parts inside one input; keep Tab-ing until the end field.
  let guard = 0;
  while ((await focused()) !== 'endsAt' && guard++ < 8) await press('Tab');
  await typeDateTime('1200');
  results.typedStart = await evaluate('document.querySelector("#booking-form").startsAt.value');
  results.typedEnd = await evaluate('document.querySelector("#booking-form").endsAt.value');
  guard = 0;
  while ((await focused()) !== 'purpose' && guard++ < 8) await press('Tab');
  await typeChars('Keyboard-only booking');
  await press('Enter');
  await waitFor('document.querySelector("#status").textContent === "Lab reserved."');
  results.afterKeyboardBooking = await evaluate('document.querySelector("#mine").innerText');
  // 4. Success state.
  await shot('04-success.png');

  // 5. Error state: the same slot again, by keyboard.
  keyboard.push(['back to the lab select', await tabTo('labId', 40)]);
  await press('Tab');
  await typeDateTime('1100');
  guard = 0;
  while ((await focused()) !== 'endsAt' && guard++ < 8) await press('Tab');
  await typeDateTime('1200');
  await press('Enter');
  await waitFor('!document.querySelector("#error").hidden');
  results.errorText = await evaluate('document.querySelector("#error").textContent');
  await shot('05-error.png');

  // 6. Assistant: thinking, suggestion, failure (the local stub answers after 1.5 s; "busy" gets a 429).
  await evaluate('document.querySelector("#ai-form").text.value = "Electronics lab tomorrow 10 to 12 to solder"; document.querySelector("#ai-form").requestSubmit(); true');
  await sleep(400);
  results.thinking = await evaluate('document.querySelector("#suggestion").textContent');
  await shot('06-assistant-thinking.png');
  await waitFor('document.querySelector("#suggestion").textContent.startsWith("Suggested:")');
  results.suggestion = await evaluate('document.querySelector("#suggestion").innerText');
  await shot('07-assistant-suggestion.png');
  await evaluate('document.querySelector("#ai-form").text.value = "busy test"; document.querySelector("#ai-form").requestSubmit(); true');
  await waitFor('document.querySelector("#suggestion").classList.contains("error")');
  results.assistantFailure = await evaluate('document.querySelector("#suggestion").textContent');
  await shot('08-assistant-failed.png');

  // 7. Loading state and layout shift: reload signed in, with every request delayed by 2.5 s.
  await send('Network.emulateNetworkConditions', { offline: false, latency: 2500, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.navigate', { url: `${BASE}/` });
  await waitFor('document.querySelector("#mine") && document.querySelector("#mine").textContent.startsWith("Loading")', 20000);
  results.loadingText = await evaluate('document.querySelector("#labs").textContent + " | " + document.querySelector("#mine").textContent');
  await shot('09-loading.png');
  await waitFor('document.querySelector("#mine").querySelector("article")', 30000);
  await sleep(800);
  results.clsSlowLoad = await evaluate('({ total: Number(window.__cls.toFixed(4)), shifts: window.__shifts.map((v) => Number(v.toFixed(4))) })');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  for (const width of [380, 768, 1280]) {
    await viewport(width);
    await goto(`${BASE}/`);
    await waitFor('document.querySelector("#mine").querySelector("article")');
    await sleep(500);
    results[`cls${width}`] = await evaluate('Number(window.__cls.toFixed(4))');
    if (width === 380) await shot('10-main-380px.png');
  }

  // 8. Sign out by keyboard.
  await viewport(1280);
  await goto(`${BASE}/`);
  await waitFor('!document.querySelector("#app").hidden');
  keyboard.push(['to Sign out', await tabTo('logout')]);
  await press('Enter');
  await waitFor('!document.querySelector("#auth").hidden');
  keyboard.push(['after sign-out, focus on', await focused()]);
  results.keyboard = keyboard;
} catch (err) {
  results.error = String(err.stack || err);
  await shot('zz-failure.png').catch(() => {});
} finally {
  console.log(JSON.stringify(results, null, 2));
  ws.close();
  chrome.kill();
}
