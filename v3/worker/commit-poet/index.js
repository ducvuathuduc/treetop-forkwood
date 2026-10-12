// Forkwood commit poet (Cloudflare Worker). POST { lang, scope, facts } -> { type, line }.
// - The client sends numbers and enums only (validated + clamped here), never free text,
//   so the prompt cannot be steered by a player.
// - The OpenAI key is the Worker secret OPENAI_API_KEY; it never reaches the browser.
// - CORS: only ALLOW_ORIGIN; rate limit per IP (POET_LIMIT binding, else a per-isolate map).
// - Model: gpt-5-mini via the Responses API, ~60 output tokens, minimal reasoning.
const WORLDS = { meadow: 'Golden Hour Meadow (anime painting: tall grass, levee, evening train, fiery sky)', starry: 'Starry River (Van Gogh impasto: swirling night sky, cypress, village lights)',
  fresco: 'Fresco Cathedral (Renaissance fresco: painted vaults, gold dome)', ukiyo: 'Great Wave Cliffs (ukiyo-e woodblock: great wave, foam claws, sacred mountain)',
  lilies: 'Lily Garden (Monet: lily pond, green bridge, wisteria, morning haze)', gilded: 'Gilded Grove (Klimt gold leaf: birch forest, mosaic)',
  lacquer: 'Lantern Village (Vietnamese son mai lacquer: lotus pond, bamboo, village roofs, gilded moon)' };
const STAGES = ['Twig', 'Sapling', 'Bough', 'Canopy', 'Treetop', 'Cloudline', 'Starlight'];
const TYPES = ['feat', 'fix', 'perf', 'refactor', 'style', 'chore', 'release', 'revert'];
const CAUSE = /^[a-z]{2,12}$/;
const SCOPE = /^[\p{L} ]{2,16}$/u;
const hits = new Map(); // per-isolate fallback limiter: ip -> [windowStart, n]

function cors(env, origin) {
  const ok = origin === env.ALLOW_ORIGIN;
  return { 'Access-Control-Allow-Origin': ok ? origin : env.ALLOW_ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'content-type': 'application/json' } });
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

async function limited(env, ip) {
  if (env.POET_LIMIT && env.POET_LIMIT.limit) { const { success } = await env.POET_LIMIT.limit({ key: ip }); return !success; }
  const now = Date.now(), per = int(env.PER_MINUTE || 6, 1, 60), e = hits.get(ip);
  if (!e || now - e[0] > 60000) { hits.set(ip, [now, 1]); if (hits.size > 5000) hits.clear(); return false; }
  e[1]++; return e[1] > per;
}

function clean(body) {
  const f = body && body.facts || {};
  const lang = body && body.lang === 'vi' ? 'vi' : 'en';
  const scope = typeof body.scope === 'string' && SCOPE.test(body.scope) ? body.scope : 'tree';
  return { lang, scope, F: {
    world: WORLDS[f.world] ? f.world : 'meadow', height: int(f.height, 0, 99999), stage: STAGES.includes(f.stage) ? f.stage : 'Twig',
    won: !!f.won, end: ['sap', 'hit', 'time', 'finish'].includes(f.end) ? f.end : '', cause: CAUSE.test(f.cause || '') ? f.cause : '',
    forks: int(f.forks, 0, 999), merges: int(f.merges, 0, 999), deaths: int(f.deaths, 0, 999), sun: int(f.sun, 0, 9999), blooms: int(f.blooms, 0, 999),
    storms: int(f.storms, 0, 9), maxMult: int(f.maxMult, 1, 99), time: int(f.time, 0, 99999), newBest: !!f.newBest,
    deathCauses: Array.isArray(f.deathCauses) ? f.deathCauses.filter((c) => CAUSE.test(c)).slice(0, 3) : [],
  } };
}

function prompt({ lang, scope, F }) {
  const facts = [`world: ${WORLDS[F.world]}`, `tree species: ${scope}`, `height: ${F.height} m (reached ${F.stage})`, F.won ? 'finished the course' : `run ended: ${F.end || 'unknown'}${F.cause ? ` (hit by ${F.cause})` : ''}`,
    `forks ${F.forks}, merges ${F.merges}, branches lost ${F.deaths}${F.deathCauses.length ? ` to ${F.deathCauses.join(', ')}` : ''}`, `sunlight caught ${F.sun}, blooms ${F.blooms}, storms weathered ${F.storms}, best combo x${F.maxMult}`, F.newBest ? 'a new personal best' : ''].filter(Boolean).join('; ');
  return [
    { role: 'developer', content: `You write the commit message for a tree grown in the game Forkwood. Reply with ONE line only, exactly: <type>: <message>. type is one of ${TYPES.join(', ')}. message: ${lang === 'vi' ? 'natural, poetic Vietnamese with full diacritics' : 'English, lowercase start'}, 4 to 10 words, at most 56 characters, no quotes, no emoji, no trailing period. Concrete and quiet, like a haiku fragment; use one real number or image from the facts. Never mention games, players or AI.` },
    { role: 'user', content: facts },
  ];
}

function outputText(r) {
  if (typeof r.output_text === 'string') return r.output_text;
  for (const o of r.output || []) if (o.type === 'message') for (const c of o.content || []) if (c.type === 'output_text' && c.text) return c.text;
  return '';
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const h = cors(env, origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: origin === env.ALLOW_ORIGIN ? 204 : 403, headers: h });
    if (req.method !== 'POST') return json({ error: 'method' }, 405, h);
    if (origin !== env.ALLOW_ORIGIN) return json({ error: 'origin' }, 403, h);
    if (!env.OPENAI_API_KEY) return json({ error: 'not configured' }, 503, h);
    const ip = req.headers.get('CF-Connecting-IP') || 'anon';
    if (await limited(env, ip)) return json({ error: 'slow down' }, 429, { ...h, 'Retry-After': '60' });
    if (+(req.headers.get('content-length') || 0) > 2048) return json({ error: 'too big' }, 413, h);
    let body; try { body = await req.json(); } catch { return json({ error: 'json' }, 400, h); }
    const input = clean(body);
    let r;
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: env.MODEL || 'gpt-5-mini', input: prompt(input), max_output_tokens: int(env.MAX_OUTPUT_TOKENS || 60, 16, 200), reasoning: { effort: 'minimal' }, text: { verbosity: 'low' }, store: false }),
      });
      if (!res.ok) return json({ error: 'upstream', status: res.status }, 502, h);
      r = await res.json();
    } catch { return json({ error: 'upstream' }, 502, h); }
    const raw = outputText(r).split('\n').map((l) => l.trim()).find(Boolean) || '';
    const m = raw.replace(/^[`"']+|[`"']+$/g, '').match(/^([a-z]+)(?:\([^)]*\))?:\s*(.{4,72})$/u);
    if (!m || !TYPES.includes(m[1])) return json({ error: 'shape' }, 502, h);
    const line = m[2].replace(/[.。]+$/, '').trim();
    return json({ type: m[1], line }, 200, { ...h, 'Cache-Control': 'no-store' });
  },
};
