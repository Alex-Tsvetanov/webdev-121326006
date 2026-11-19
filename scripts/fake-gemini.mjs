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
  // Like the real model: tomorrow, 10:00 to 12:00 on the local clock the prompt shows, with no time zone.
  const [, y, m, d] = prompt.match(/Current local date and time: (\d{4})-(\d{2})-(\d{2})/);
  const tomorrow = new Date(Date.UTC(+y, m - 1, +d + 1)).toISOString().slice(0, 10);
  const answer = { labId: 2, startsAt: `${tomorrow}T10:00`, endsAt: `${tomorrow}T12:00`, purpose: 'Solder a sensor board' };
  return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
};
