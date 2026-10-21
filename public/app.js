const $ = (selector) => document.querySelector(selector);

const fmt = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

// Converts an ISO time to the value a datetime-local input expects (local time, no zone).
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function report(text, { error = false } = {}) {
  $('#status').hidden = true;
  $('#error').hidden = true;
  const el = error ? $('#error') : $('#status');
  el.textContent = text;
  el.hidden = !text;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function showAuth() {
  $('#auth').hidden = false;
  $('#app').hidden = true;
  $('#logout').hidden = true;
}

function enterApp() {
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#logout').hidden = false;
  loadLabs();
  loadMine();
}

async function loadLabs() {
  const box = $('#labs');
  box.textContent = 'Loading labs…';
  try {
    const { labs } = await api('/api/labs');
    $('#booking-form select[name=labId]').replaceChildren(...labs.map((l) => new Option(l.name, l.id)));
    if (!labs.length) {
      box.textContent = 'No labs have been added yet.';
      return;
    }
    box.replaceChildren(...labs.map((l) => {
      const p = document.createElement('p');
      p.textContent = `${l.name} · ${l.location} · up to ${l.capacity} people · ${l.equipment.join(', ') || 'no special equipment'}`;
      return p;
    }));
  } catch (err) {
    box.textContent = err.message;
  }
}

function renderReservation(r) {
  const item = document.createElement('article');
  item.className = 'reservation';

  const name = document.createElement('strong');
  name.textContent = r.lab_name;

  const when = document.createElement('p');
  when.textContent = `${fmt(r.starts_at)} – ${fmt(r.ends_at)}`;

  const purpose = document.createElement('p');
  purpose.className = 'muted';
  purpose.textContent = r.purpose || 'No purpose given';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button ghost';
  cancel.textContent = 'Cancel reservation';
  cancel.setAttribute('aria-label', `Cancel reservation for ${r.lab_name} at ${fmt(r.starts_at)}`);
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    try {
      await api(`/api/reservations/${r.id}`, { method: 'DELETE' });
      report('Reservation cancelled.');
      loadMine();
    } catch (err) {
      report(err.message, { error: true });
      cancel.disabled = false;
    }
  });

  item.append(name, when, purpose, cancel);
  return item;
}

async function loadMine() {
  const box = $('#mine');
  box.textContent = 'Loading your reservations…';
  try {
    const { reservations } = await api('/api/reservations');
    if (!reservations.length) {
      box.textContent = 'You have no reservations yet.';
      return;
    }
    box.replaceChildren(...reservations.map(renderReservation));
  } catch (err) {
    box.textContent = err.message;
  }
}

function fillForm(suggestion) {
  const form = $('#booking-form');
  form.labId.value = suggestion.labId;
  form.startsAt.value = toLocalInput(suggestion.startsAt);
  form.endsAt.value = toLocalInput(suggestion.endsAt);
  form.purpose.value = suggestion.purpose;
  form.startsAt.focus();
}

$('#auth-form').addEventListener('submit', (event) => {
  event.preventDefault();
  submitAuth('/api/auth/login');
});

$('#register').addEventListener('click', () => {
  const form = $('#auth-form');
  if (form.reportValidity()) submitAuth('/api/auth/register');
});

async function submitAuth(path) {
  const form = $('#auth-form');
  try {
    await api(path, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    form.reset();
    enterApp();
    report('Signed in.');
  } catch (err) {
    report(err.message, { error: true });
  }
}

$('#logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showAuth();
  report('Signed out.');
});

$('#booking-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await api('/api/reservations', {
      method: 'POST',
      body: {
        labId: Number(data.get('labId')),
        startsAt: new Date(data.get('startsAt')).toISOString(),
        endsAt: new Date(data.get('endsAt')).toISOString(),
        purpose: data.get('purpose'),
      },
    });
    form.reset();
    report('Lab reserved.');
    loadMine();
  } catch (err) {
    report(err.message, { error: true });
  }
});

$('#ai-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const box = $('#suggestion');
  box.className = 'notice';
  box.hidden = false;
  box.textContent = 'The assistant is thinking…';
  try {
    const result = await api('/api/ai/suggest-reservation', {
      method: 'POST',
      body: { text: new FormData(event.currentTarget).get('text') },
    });
    if (result.status !== 'ok') {
      box.classList.add('error');
      box.textContent = result.message;
      return;
    }
    const s = result.suggestion;
    const text = document.createElement('p');
    text.textContent = `Suggested: ${s.labName}, ${fmt(s.startsAt)} – ${fmt(s.endsAt)}${s.purpose ? ` · ${s.purpose}` : ''}. Check it, then reserve.`;
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'button ghost';
    use.textContent = 'Use this suggestion';
    use.addEventListener('click', () => fillForm(s));
    box.replaceChildren(text, use);
  } catch (err) {
    box.classList.add('error');
    box.textContent = err.message;
  }
});

async function boot() {
  try {
    await api('/api/auth/me');
    enterApp();
  } catch {
    showAuth();
  }
}

boot();
