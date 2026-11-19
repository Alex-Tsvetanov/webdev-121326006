// Local stand-in for Gemini, loaded with `node --import`, so the browser check (scripts/ui-check.mjs) can show a suggestion and a failure
// without a real key. Only requests to generativelanguage.googleapis.com are answered here.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
  const prompt = JSON.parse(init.body).contents[0].parts[0].text;
  await new Promise((r) => setTimeout(r, 1500));
  if (/busy/i.test(prompt.split('<request>').pop())) {
    return Response.json({ error: { message: 'Resource exhausted (fake)' } }, { status: 429 });
  }
  const start = new Date(Date.now() + 24 * 3600e3); start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600e3);
  const answer = { labId: 2, startsAt: start.toISOString(), endsAt: end.toISOString(), purpose: 'Solder a sensor board' };
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
};
