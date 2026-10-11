// Pass 6 traps + director: unit checks, static fairness over many seeds, bot
// survival targets, and a phone-size (360x640) browser pass with screenshots.
// Run: node tests/traps.mjs   (N=seeds, BOTN=bot seeds, NOBROWSER=1 to skip the browser part)
import { createSim, step, heightM, W, TIP_R, FORK_SPREAD, PX_PER_M, spawnChunkAt, CHUNKS } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
import { TRAPS, TRAP_CHUNKS, WARN_MIN, PULSE, DOOR, GUST, CROW_WARN, TIDE_K, TWIG_SNAP, rowSolids, twinsXs } from '../src/traps.js';
import * as Dir from '../src/director.js';
import { rulesFor } from '../src/modes.js'; // P8-ECON

let fails = 0;
const ok = (c, msg) => { if (c) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };
const SEEDS = Number(process.env.N || 220);
const BOTN = Number(process.env.BOTN || 200);
const R = TIP_R;
const speedAt = (m) => 170 + 90 * Math.min(1, m / 650) + Math.min(40, Math.max(0, m - 650) * 0.05);
const VIEW_AHEAD = 600; // world units visible above the tip on a 360x640 phone (conservative)

// ---------------------------------------------------------------- shape
ok(Object.keys(TRAPS).length === 9 && !TRAPS.fog, `9 traps shipped, mist dropped (${Object.keys(TRAPS).join(', ')})`);
ok(TRAP_CHUNKS.every((c) => CHUNKS.some((k) => k.id === c.id)), 'every trap chunk is in the course director');
ok(TRAP_CHUNKS.filter((c) => c.tier === 3).every((c) => c.minM >= 250), 'trap combos only after ~45 s (>= 250 m)');
ok(PULSE.warn * PULSE.minPeriod >= WARN_MIN && DOOR.warn * DOOR.period >= WARN_MIN && GUST.warn >= WARN_MIN && CROW_WARN >= WARN_MIN, 'timed traps warn >= 0.8 s before they can hurt');
ok(TIDE_K <= 0.8, 'rising thorns are slower than a tip growing straight up');

// ---------------------------------------------------------------- scripted unit checks
function fresh(seed = 9) { const s = createSim({ seed, demo: false }); s.traps = []; s.brambles = []; s.beetles = []; s.columns = []; s.motes = []; s.nextBeatY = -1e9; return s; }
const run = (s, sec, inp = {}) => { const ev = []; for (let i = 0; i < sec * 60; i++) { step(s, 1 / 60, typeof inp === 'function' ? inp(s) : inp); ev.push(...s.events); } return ev; };
{
  // twig: lingering snaps it, a quick pass does not
  const s = fresh(); s.trapSeen.twig = true; spawnChunkAt(s, 'twig', s.cy - 100);
  const tw = s.traps.find((t) => t.kind === 'twig');
  const ev = run(s, 4, { targetX: (tw.x0 + tw.x1) / 2 });
  ok(ev.some((e) => e.type === 'snap') && ev.some((e) => e.type === 'hit' && e.src === 'twig'), 'cracked twig snaps when you linger on it');
  const s2 = fresh(); s2.trapSeen.twig = true; spawnChunkAt(s2, 'twig', s2.cy - 100);
  const t2 = s2.traps.filter((t) => t.kind === 'twig');
  const free = [20, 60, W - 60, W - 20].find((x) => t2.every((t) => x < t.x0 - 20 || x > t.x1 + 20));
  ok(free != null && !run(s2, 4, { targetX: free }).some((e) => e.type === 'snap'), 'steering round the twig never snaps it');
}
{
  // pulse thorns: always an open lane; standing in an out lane hurts
  const s = fresh(); spawnChunkAt(s, 'pulse', s.cy - 100);
  const p = s.traps.find((t) => t.kind === 'pulse');
  let minFree = 1e9;
  for (let c = 0; c < p.period * 2; c += 0.02) {
    const sol = rowSolids(p, c); let x = 0, best = 0;
    for (const [a, b] of sol.slice().sort((q, w) => q[0] - w[0])) { best = Math.max(best, a - x); x = Math.max(x, b); }
    best = Math.max(best, W - x); minFree = Math.min(minFree, best);
  }
  ok(minFree >= 2 * R + 60, `pulse thorns always leave an open lane (min ${Math.round(minFree)} units)`);
}
{
  // P8-ECON crow: it always dives on a marked lane; a forked pair straddles it, holding your line gets pecked
  const mk = () => { const s = fresh(); s.trapSeen.crow = true; spawnChunkAt(s, 'crow', s.cy - 40); s.motes = []; return s; };
  const a = mk(); let toggled = false;
  const evA = run(a, 3.5, () => { const o = { targetX: W / 2 }; if (!toggled) { o.toggle = true; toggled = true; } return o; });
  ok(evA.some((e) => e.type === 'crow') && evA.some((e) => e.type === 'crowfoil'), 'a forked pair straddles the crow\'s dive lane');
  const b = mk();
  const evB = run(b, 3.5, { targetX: W / 2 });
  ok(evB.some((e) => e.type === 'crowsteal') && evB.some((e) => e.type === 'trapHit' && e.trap === 'crow'), 'holding your line under the crow gets you pecked');
}
{
  // tide: straight up escapes; a zig-zagging tip gets caught
  const s = fresh(); s.trapSeen.tide = true; spawnChunkAt(s, 'tide', s.cy - 10); s.motes = [];
  ok(!run(s, 6, { targetX: W / 2 }).some((e) => e.type === 'hit'), 'rising thorns never catch a tip that keeps climbing');
  const z = fresh(); z.trapSeen.tide = true; spawnChunkAt(z, 'tide', z.cy - 10); z.motes = [];
  z.R.speed = 0.4; // a tip that is too slow (frost, dawdling)
  ok(run(z, 14, { targetX: W / 2 }).some((e) => e.type === 'hit' && e.src === 'tide'), 'rising thorns catch a tip that is too slow');
}
{
  // gust: the hedge is avoidable by leaning into the wind
  const s = fresh(); s.trapSeen.gust = true; spawnChunkAt(s, 'gust', s.cy - 40); s.motes = [];
  const g = s.traps.find((t) => t.kind === 'gust');
  const ev = run(s, 4, { targetX: g.dir > 0 ? 160 : W - 160 });
  ok(!ev.some((e) => e.type === 'hit'), 'leaning into a crosswind keeps you off the hedge');
  const s2 = fresh(); s2.trapSeen.gust = true; spawnChunkAt(s2, 'gust', s2.cy - 40); s2.motes = [];
  const g2 = s2.traps.find((t) => t.kind === 'gust');
  ok(run(s2, 4, { targetX: g2.dir > 0 ? W - 10 : 10 }).some((e) => e.type === 'hit' && e.src === 'hedge'), 'drifting with the gust into the hedge hurts');
}
{
  // sap drain zone drains
  const s = fresh(); s.trapSeen.sap = true; spawnChunkAt(s, 'sapzone', s.cy - 40); s.motes = [];
  const z = s.traps.find((t) => t.kind === 'sap');
  const s0 = s.sap; run(s, 2, { targetX: (z.x0 + z.x1) / 2 }); const inZone = s0 - s.sap;
  const t = fresh(); t.trapSeen.sap = true; spawnChunkAt(t, 'sapzone', t.cy - 40); t.motes = [];
  const z2 = t.traps.find((q) => q.kind === 'sap'); const t0 = t.sap; run(t, 2, { targetX: z2.x0 > W / 2 ? 40 : W - 40 }); const out = t0 - t.sap;
  ok(inZone > out + 10, `sap-drain zone drains sap (${inZone.toFixed(1)} vs ${out.toFixed(1)} outside)`);
}
{
  // golden lure: following it ends in the thorn cap; the honest line is clean
  const s = fresh(); s.trapSeen.lure = true; spawnChunkAt(s, 'lure', s.cy - 10);
  const lure = s.motes.filter((m) => m.lure);
  const evL = run(s, 4, (q) => { const m = lure.find((o) => !o.taken && o.y < q.cy - 10); return { targetX: m ? m.x : q.cx }; });
  ok(evL.some((e) => e.type === 'hit' && (e.src === 'cap' || e.src === 'wall')), 'following the golden lure runs into the thorn pocket');
  const t = fresh(); t.trapSeen.lure = true; spawnChunkAt(t, 'lure', t.cy - 10);
  const cap = t.traps.find((q) => q.kind === 'cap');
  ok(!run(t, 4, { targetX: cap.side < 0 ? W - 150 : 150 }).some((e) => e.type === 'hit'), 'the honest line past the lure is safe');
}
{
  // twin beetles: a forked pair straddles them for a bonus
  const s = fresh(); s.trapSeen.twins = true; spawnChunkAt(s, 'twins', s.cy - 10);
  const tw = s.traps.find((q) => q.kind === 'twins'); let f = false;
  const ev = run(s, 3, (q) => { const o = { targetX: tw.x }; if (!f) { o.toggle = true; f = true; } return o; });
  ok(ev.some((e) => e.type === 'straddle') && !ev.some((e) => e.type === 'hit' || e.type === 'revert'), 'forking around the twin beetles is safe and pays a straddle bonus');
}
{
  // first appearance is an intro with a hint label
  const s = fresh(); spawnChunkAt(s, 'door', s.cy - 10);
  const ev = run(s, 0.5, { targetX: W / 2 });
  ok(s.traps.some((t) => t.kind === 'label' && t.id === 'door') || ev.some((e) => e.type === 'trapintro' && e.id === 'door'), 'a trap\'s first appearance carries its hint label');
}

// ---------------------------------------------------------------- director
{
  ok(['daily', 'weekly', 'race', 'duel', 'challenge', 'quest', 'seeded'].every((m) => !Dir.enabled(m)) && Dir.enabled('classic'), 'director is OFF for daily, weekly, race, duel, challenge, quest and seeded runs');
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  for (let i = 0; i < 7; i++) Dir.record({ height: 1400, nearMisses: 30, hits: 0, time: 150 }, 'classic', st);
  const runs = Dir.load(st);
  ok(runs.length === 5, 'director keeps only the last 5 runs');
  ok(Math.abs(Dir.offset('classic', runs) - Dir.MAX_K) < 1e-9 && Dir.offset('daily', runs) === 0 && Dir.offset('race', runs) === 0, `a strong player gets at most +15% (k=${Dir.offset('classic', runs)}), daily/race get 0`);
  const weak = [1, 2, 3, 4, 5].map(() => ({ h: 30, near: 0, hits: 9, t: 20 }));
  ok(Dir.offset('classic', weak) >= -Dir.MAX_K && Dir.offset('classic', weak) < 0, 'a struggling player gets a gentler course, never more than -15%');
  Dir.record({ height: 5, nearMisses: 0, hits: 0, time: 10 }, 'daily', st);
  ok(Dir.load(st).length === 5 && Dir.load(st).every((r) => r.h === 1400), 'daily runs are never recorded');
  // pure runs ignore the director: identical course
  const course = (opts) => { const s = createSim({ seed: 777, demo: true, ...opts }); while (heightM(s) < 600) { s.invuln = 10; step(s, 1 / 30, { targetX: W / 2 }); } return JSON.stringify(s.chunkLog.map((c) => c.id)); };
  ok(course({ pure: true, director: { k: 0.15 } }) === course({ pure: true }), 'a pure (daily/weekly/challenge) run is identical whatever the director says');
  ok(course({ director: { k: 0.15 } }) !== course({}), 'a personal run does change with the director');
  const k = createSim({ seed: 1, director: { k: 9 } }).dk;
  ok(k === 0.15, 'director offset is clamped to ±15%');
}

// ---------------------------------------------------------------- static fairness over many seeds
const p = { warn: 0, pulseLane: 0, door: 0, gust: 0, lure: 0, twins: 0, overlap: 0, twig: 0, intro: 0, tide: 0 };
const kinds = {};
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = createSim({ seed, tutorial: true, demo: true });
  const seen = new Set(), traps = [], brs = [], cols = [], labels = [];
  while (heightM(s) < 1500) {
    s.invuln = 10; s.pu.rush = 0; step(s, 1 / 30, { targetX: W / 2 });
    for (const t of s.traps) if (!seen.has(t)) { seen.add(t); if (t.kind === 'label') labels.push(t); else traps.push(t); }
    for (const b of s.brambles) if (!seen.has(b)) { seen.add(b); brs.push(b); }
    for (const c of s.columns) if (!seen.has(c)) { seen.add(c); cols.push(c); }
  }
  const firstOf = {};
  for (const t of traps) {
    kinds[t.kind] = (kinds[t.kind] || 0) + 1;
    const m = -(t.y ?? t.y0) / PX_PER_M, sp = speedAt(m);
    const ty = t.y ?? t.y0;
    const id = { twig: 'twig', sap: 'sap', pulse: 'pulse', door: 'door', gust: 'gust', cap: 'lure', twins: 'twins', tide: 'tide', crow: 'crow' }[t.kind];
    if (id && !(id in firstOf)) firstOf[id] = ty;
    if (t.kind === 'pulse' && t.period * PULSE.warn < WARN_MIN) { p.warn++; console.log('pulse warns too briefly', seed); }
    if (t.kind === 'pulse') {
      for (let c = 0; c < t.period; c += 0.05) {
        const sol = rowSolids(t, c); let x = 0, best = 0;
        for (const [a, b] of sol.slice().sort((q, w) => q[0] - w[0])) { best = Math.max(best, a - x); x = Math.max(x, b); }
        if (Math.max(best, W - x) < 2 * R + 60) { p.pulseLane++; console.log('pulse row closed', seed); break; }
      }
    }
    if (t.kind === 'door') {
      const sq = t.sq[1] - t.sq[0];
      if (sq < 2 * R + 60 || t.period * DOOR.warn < WARN_MIN || (t.sq[1] > t.door[0] && t.sq[0] < t.door[1])) { p.door++; console.log('unfair trapdoor', seed, sq); }
    }
    if (t.kind === 'gust') {
      const lateral = Math.sin(1.12) * sp * 0.62; // frosted worst case is not combined with gusts
      if (t.force > Math.sin(1.12) * sp * 0.9 || GUST.warn < WARN_MIN) { p.gust++; console.log('gust too strong', seed, t.force, Math.round(lateral)); }
    }
    if (t.kind === 'cap') {
      const wall = traps.find((q) => q.kind === 'wall' && Math.abs(q.y1 - t.y) < 1);
      const room = t.side < 0 ? W - t.x1 : t.x0;
      const tele = (VIEW_AHEAD - (wall ? wall.y0 - wall.y1 : 0)) / sp;
      if (!wall || room < 2 * R + 120 || tele < WARN_MIN) { p.lure++; console.log('unfair lure pocket', seed, room, tele); }
    }
    if (t.kind === 'twins') {
      const g = brs.find((b) => Math.abs(b.y - t.y) < 1);
      const o = Math.max(...[0, 0.3, 0.7, 1.1, 1.4].map((c) => twinsXs(t, c)[1] - t.x));
      const lane = (g ? (g.gaps[0][1] - t.x) : 0) - (R - 3) - (o + t.r + R - 3);
      const forkOk = FORK_SPREAD - o > t.r + R - 3 && (g ? g.gaps[0][1] - t.x : 0) - FORK_SPREAD > R - 3;
      if (!g || lane < 40 || !forkOk) { p.twins++; console.log('unfair twin beetles', seed, lane); }
    }
    if (t.kind === 'twig' && Math.max(t.x0, W - t.x1) < 2 * R + 60) { p.twig++; console.log('twig blocks the way', seed); }
    if (t.kind === 'tide' && TIDE_K * sp >= sp) p.tide++;
    // rows never stack on other thorn rows or columns
    if (['pulse', 'door', 'cap', 'twins'].includes(t.kind)) {
      for (const b of brs) if (b.kind !== 'gate' || t.kind !== 'twins' || Math.abs(b.y - t.y) > 1) if (Math.abs(b.y - t.y) < 120 && !(t.kind === 'twins' && Math.abs(b.y - t.y) < 1)) { p.overlap++; console.log('trap row on a thorn row', seed, t.kind, Math.round(-t.y / PX_PER_M)); }
      for (const c of cols) if (t.y < c.y0 + 100 && t.y > c.y1 - 100) { p.overlap++; console.log('trap row inside a column', seed, t.kind); }
      for (const q of traps) if (q !== t && ['pulse', 'door', 'cap', 'twins'].includes(q.kind) && Math.abs(q.y - t.y) < 200) { p.overlap++; console.log('two trap rows too close', seed, t.kind, q.kind); }
    }
  }
  // every trap's first appearance comes with its hint label
  for (const [id, y] of Object.entries(firstOf)) {
    const lab = labels.find((l) => l.id === id);
    if (!lab || lab.y < y) { p.intro++; console.log('first appearance without a hint', seed, id); }
  }
}
console.log('trap instances in', SEEDS, 'seeds to 1500 m:', JSON.stringify(kinds));
for (const [k, v] of Object.entries(p)) ok(v === 0, `trap fairness: ${k} problems = ${v}`);
ok(Object.keys(TRAPS).every((id) => kinds[id === 'lure' ? 'cap' : id] > 0), 'all nine traps appear on real courses');

// ---------------------------------------------------------------- bot survival targets (200+ seeds)
const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(f * b.length))]; };
const target = { weak: [0.3, 30, 40], average: [0.6, 49, 61], expert: [0.95, 77, 93] }; // P8-ECON: measured on the Oak stake (targets ~35 / ~55 / ~85 s)
const kindHit = {}, kindPass = {};
const report = {};
for (const [name, [sk, lo, hi]] of Object.entries(target)) {
  const T = [];
  for (let i = 0; i < BOTN; i++) {
    const s = createSim({ seed: 1000 + i, tutorial: true, rules: rulesFor({ mode: 'classic', stake: 'oak' }) }); const bot = createBot(sk, i + 1); // P8-ECON: Oak
    while (!s.dead && s.t < 400) {
      step(s, 1 / 60, botInput(bot, s));
      if (sk === 0.95) for (const e of s.events) if ((e.type === 'hit' || e.type === 'revert') && ['twig', 'pulse', 'door', 'cap', 'wall', 'hedge', 'tide'].includes(e.src)) kindHit[e.src] = (kindHit[e.src] || 0) + 1;
    }
    if (sk === 0.95) for (const id of Object.keys(s.trapSeen)) kindPass[id] = (kindPass[id] || 0) + 1;
    T.push(s.t);
  }
  const med = q(T, 0.5);
  report[name] = { skill: sk, median: +med.toFixed(1), p10: +q(T, 0.1).toFixed(1), p90: +q(T, 0.9).toFixed(1) };
  ok(med >= lo && med <= hi, `${name} bot median survival ${med.toFixed(1)} s (target ${lo}-${hi} s; p10 ${q(T, 0.1).toFixed(1)}, p90 ${q(T, 0.9).toFixed(1)})`);
}
console.log('bot survival', JSON.stringify(report));
console.log('expert trap hits over', BOTN, 'runs', JSON.stringify(kindHit));
ok(report.expert.p90 < 400, 'top end is not capped: there is headroom above the expert bot');

// ---------------------------------------------------------------- browser: phone viewport, screenshots, console errors
if (!process.env.NOBROWSER) {
  const { createRequire } = await import('module');
  const { spawn } = await import('child_process');
  const { mkdirSync } = await import('fs');
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
  const PORT = 8300 + Math.floor(Math.random() * 600), OUT = new URL('./out/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const errors = [];
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/?bot=1&seed=4242`);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.forkwood.start(false));
    await page.evaluate(() => window.forkwood.advance(3, 'bot'));
    let worst = 0;
    await page.evaluate(() => window.forkwood.advance(0.5, 'bot')); await page.waitForTimeout(300);
    const baseMs = await page.evaluate(() => window.forkwood.frameMs);
    for (const id of ['twig', 'pulse', 'door', 'gust', 'sapzone', 'lure', 'twins', 'tide', 'crow', 'pulsegust']) {
      const info = await page.evaluate(async (cid) => {
        const sm = await import('/src/sim.js');
        const s = window.forkwood.sim; s.sap = 100; s.dead = false;
        // clear what is ahead, then grow the trap a little above the tip
        const y = s.cy - 260;
        for (const k of ['brambles', 'columns', 'beetles', 'frosts', 'winds']) s[k] = s[k].filter((o) => (o.y ?? o.y0) > s.cy + 50);
        s.traps = []; s.motes = s.motes.filter((o) => o.y > s.cy);
        s.nextBeatY = y - spawnLen(sm, s, cid, y) - 200;
        function spawnLen(m, sim, c, yy) { return m.spawnChunkAt(sim, c, yy); }
        return { n: s.traps.length };
      }, id);
      await page.evaluate((sec) => window.forkwood.advance(sec, 'bot'), id === 'tide' ? 1.6 : 0.9);
      await page.waitForTimeout(120);
      const ms = await page.evaluate(() => window.forkwood.frameMs);
      worst = Math.max(worst, ms);
      await page.screenshot({ path: `${OUT}trap-${id}-360.png` });
      if (!info.n) errors.push('no trap spawned for ' + id);
    }
    ok(worst < Math.max(16.7, baseMs * 1.35 + 3), `trap frames stay in the frame budget on a phone viewport (worst ${worst.toFixed(2)} ms, no-trap baseline ${baseMs.toFixed(2)} ms)`);
    await ctx.close();
  } catch (e) { errors.push('browser failure: ' + e.message); }
  await browser.close(); server.kill();
  ok(errors.length === 0, `0 console errors in the browser pass${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
}

console.log(fails ? `\n${fails} FAILED` : '\ntrap checks OK');
process.exit(fails ? 1 : 0);
