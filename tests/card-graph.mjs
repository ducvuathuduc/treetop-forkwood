// V3.2-CARD: node checks for the commit graph history + offline poet (no browser).
import { createSim, step, summary } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
import { buildHistory } from '../src/commit-graph.js';
import { poemFacts, offlinePoem, aiPoem } from '../src/commit-poet.js';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.error('FAIL', m); } };
let deathsSeen = 0, drifts = 0;
for (let i = 0; i < 24; i++) {
  const s = createSim({ seed: 1000 + i * 7 });
  const bot = createBot([0.3, 0.6, 0.9][i % 3], i + 1);
  let reverts = 0;
  while (!s.dead && s.t < 400) { s.events.length = 0; step(s, 1 / 60, botInput(bot, s)); for (const e of s.events) if (e.type === 'revert') reverts++; }
  const sum = summary(s), H = buildHistory(s);
  ok(H.forks === sum.forks, `forks ${H.forks} vs ${sum.forks}`);
  ok(H.merges === sum.merges, `merges ${H.merges} vs ${sum.merges}`);
  ok(H.deaths.length === reverts, `deaths ${H.deaths.length} vs reverts ${reverts}`);
  ok(Math.abs(H.top - sum.height) <= 2, `top ${H.top} vs ${sum.height}`);
  for (const d of H.deaths) ok(d.m <= H.top + 1 && d.m >= 0, 'death height in range');
  for (const b of H.branches) if (b.merged) ok(b.into != null, `merged branch ${b.id} has a target`);
  deathsSeen += H.deaths.length; drifts += H.branches.filter((b) => b.drift != null).length;
  for (const lang of ['en', 'vi']) {
    const p = offlinePoem(poemFacts(H, sum, ['meadow', 'starry', 'lacquer'][i % 3]), sum.hash, lang);
    ok(p.text.length < 90 && /^[0-9a-f]{6} [a-z]+\(.+\): .+/.test(p.text), 'poem shape ' + p.text);
    ok(offlinePoem(poemFacts(H, sum, ['meadow', 'starry', 'lacquer'][i % 3]), sum.hash, lang).text === p.text, 'poem deterministic');
    if (i < 3) console.log(`${sum.height} m d${H.deaths.length} |`, p.text);
  }
}
ok(deathsSeen > 0, 'some runs had reverts'); ok(drifts > 0, 'some survivors drifted lanes');
// AI path: no endpoint -> null; bad / slow responses -> null; good -> poem
const F = { world: 'meadow', height: 100 }, base = { sha: 'abc123', scope: 'oak', name: 'X', text: '', type: 'feat', line: 'x' };
ok(await aiPoem(F, base, 'en', { endpoint: null }) === null, 'no endpoint -> offline');
ok(await aiPoem(F, base, 'en', { endpoint: 'https://x', fetchFn: async () => ({ ok: true, json: async () => ({ type: 'feat', line: 'climbed 100 m through the tall grass' }) }) }).then((p) => p && p.src === 'ai'), 'good AI line used');
ok(await aiPoem(F, base, 'en', { endpoint: 'https://x', fetchFn: async () => ({ ok: true, json: async () => ({ type: 'hack', line: 'x' }) }) }) === null, 'bad AI shape rejected');
const t0 = Date.now();
ok(await aiPoem(F, base, 'en', { endpoint: 'https://x', timeout: 300, fetchFn: (u, o) => new Promise((r, j) => { o.signal && o.signal.addEventListener('abort', () => j(new Error('abort'))); }) }) === null && Date.now() - t0 < 900, 'slow AI times out');
console.log(`card-graph: ${fail ? fail + ' FAILED' : 'OK'} (deaths ${deathsSeen}, drifts ${drifts})`);
process.exit(fail ? 1 : 0);
