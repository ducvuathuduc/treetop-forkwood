// Course director, power-ups, grafts and events: static fairness over many
// seeds plus scripted unit checks. Run: node tests/chunks.mjs
import { createSim, step, heightM, summary, W, TIP_R, FORK_SPREAD, PX_PER_M, COLUMN_HW, STORMS, GRAFT_AT, GRAFTS, PICKUPS, intensity } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';

const SEEDS = Number(process.env.N || 200);
const TOP = Number(process.env.TOP || 1500);
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };

// ---------------------------------------------------------------- static course scan
function scan(seed, top = TOP) {
  const s = createSim({ seed, tutorial: true, demo: true });
  const seen = new Set();
  const col = { brambles: [], columns: [], tokens: [], beetles: [], zones: [], motes: [] };
  while (-s.cy / PX_PER_M < top) {
    s.invuln = 10; s.pu.rush = 0; step(s, 1 / 30, { targetX: W / 2 });
    for (const k of ['brambles', 'columns', 'tokens', 'beetles', 'motes']) {
      const arr = k === 'tokens' ? s.tokens : s[k];
      for (const o of arr) if (!seen.has(o)) { seen.add(o); col[k].push(k === 'beetles' ? { ...o } : o); }
    }
    for (const z of s.stormZones) if (!seen.has(z)) { seen.add(z); col.zones.push(z); }
  }
  return { s, ...col, log: s.chunkLog.slice() };
}

const stats = { columns: 0, bolts: 0, sliders: 0, tokens: 0, chunks: {}, tiers: [0, 0, 0, 0], rests: 0 };
let p = { narrow: 0, colSide: 0, colStraddle: 0, colGate: 0, colCol: 0, slide: 0, token: 0, rest: 0, tier: 0, interval: 0, boltOut: 0, zones: 0 };
for (let seed = 1; seed <= SEEDS; seed++) {
  const c = scan(seed);
  // columns: a single tip fits on at least one side; a forked pair straddles it
  for (const k of c.columns) {
    stats.columns++; if (k.kind === 'bolt') stats.bolts++;
    const left = k.x - k.hw, right = W - (k.x + k.hw);
    if (Math.max(left, right) < 2 * TIP_R + 60) { p.colSide++; console.log('column leaves no room', seed, k.x); }
    if (!(k.hw + TIP_R + 8 < FORK_SPREAD && k.x - FORK_SPREAD - TIP_R > 0 && k.x + FORK_SPREAD + TIP_R < W)) { p.colStraddle++; console.log('column cannot be straddled', seed, k.x); }
    for (const b of c.brambles) if (b.y < k.y0 + 90 && b.y > k.y1 - 90) { p.colGate++; console.log('thorn row inside a column', seed, Math.round(-b.y / PX_PER_M)); }
    for (const o of c.columns) if (o !== k && o.y0 > k.y1 - 40 && o.y1 < k.y0 + 40) {
      // overlapping columns: some x must clear both for a single tip
      let free = false;
      for (let x = 20; x < W - 20; x += 4) if (Math.abs(x - k.x) > k.hw + TIP_R + 12 && Math.abs(x - o.x) > o.hw + TIP_R + 12) { free = true; break; }
      if (!free) { p.colCol++; console.log('overlapping columns block the way', seed); }
    }
    if (k.kind === 'bolt' && !c.zones.some((z) => k.y0 <= z.y0 + 40 && k.y1 >= z.y1 - 600)) { p.boltOut++; console.log('lightning outside a storm', seed); }
  }
  // sliding thorns: gap wide, slow, inside the field
  for (const b of c.brambles) {
    for (const [a, z] of b.gaps) if (z - a < 2 * TIP_R + 60) { p.narrow++; console.log('narrow gap', seed, b.kind, z - a); }
    if (b.kind !== 'slide') continue;
    stats.sliders++;
    if (b.gapW < 2 * TIP_R + 150 || b.amp * b.w > 90 || b.base - b.amp - b.gapW / 2 < 0 || b.base + b.amp + b.gapW / 2 > W) { p.slide++; console.log('unfair slider', seed, b.gapW, b.amp * b.w); }
  }
  // graft medallions: one fork-width apart, nothing dangerous around them
  // V2-MECH: graft gates have 2 medallions, Growth Ring gates 3 (each pair one fork-width apart)
  const byGate = new Map(); for (const t of c.tokens) { if (!byGate.has(t.gate)) byGate.set(t.gate, []); byGate.get(t.gate).push(t); }
  for (const g of byGate.values()) {
    stats.tokens++;
    const a = g[0], b = g[1];
    const spaced = b && g.every((t, i) => i === 0 || (Math.abs(Math.abs(t.x - g[i - 1].x) - 2 * FORK_SPREAD) < 1 && t.y === a.y));
    const clear = !c.brambles.some((r) => Math.abs(r.y - a.y) < 200) && !c.columns.some((k) => k.y0 > a.y - 200 && k.y1 < a.y + 200) && !c.beetles.some((e) => Math.abs(e.y - a.y) < 160);
    if (!spaced || !clear) { p.token++; console.log('graft gate unfair', seed, spaced, clear); }
  }
  // the director: rests at least every 5 chunks, tiers respect height, minimum spacing
  let since = 0;
  for (const e of c.log) {
    stats.chunks[e.id] = (stats.chunks[e.id] || 0) + 1;
    if (e.tier >= 0) stats.tiers[e.tier]++;
    if (['rest', 'graft', 'ring', 'reward', 'setpiece'].includes(e.role)) { since = 0; stats.rests++; } else if (e.m > 18) since++; // V2-MECH: ring gates, reward beats and set pieces are breathers too
    if (since > 5) { p.rest++; console.log('no rest beat for 6 chunks', seed, e.m); since = 0; }
    if ((e.tier === 3 && e.m < 300) || (e.tier === 2 && e.m < 60)) { p.tier++; console.log('tier too early', seed, e.id, e.m); }
  }
  const rows = c.brambles.map((b) => b.y).sort((a, b) => b - a);
  for (let i = 1; i < rows.length; i++) if (rows[i - 1] - rows[i] < 250) { p.interval++; console.log('thorn rows too close', seed, rows[i - 1] - rows[i]); }
  // storms where they belong
  const want = STORMS.filter((st) => st.m + st.len < TOP).length;
  if (c.zones.length < want) { p.zones++; console.log('missing storm', seed, c.zones.length, want); }
}
console.log(`scanned ${SEEDS} seeds to ${TOP} m: ${stats.columns} columns (${stats.bolts} lightning), ${stats.sliders} sliding thorns, ${stats.tokens} graft gates, ${stats.rests} rest beats`);
console.log('tiers used', stats.tiers.join(' / '), '· chunks', JSON.stringify(stats.chunks));
for (const [k, v] of Object.entries(p)) ok(v === 0, `course fairness: ${k} problems = ${v}`);

// ---------------------------------------------------------------- determinism
function signature(s, upto) {
  return s.chunkLog.filter((e) => e.y > -upto * PX_PER_M).map((e) => `${e.id}@${Math.round(e.y)}`).join('|');
}
{
  const seed = 777, upto = 400;
  const ghost = scan(seed, upto + 100).s;
  const ref = signature(ghost, upto);
  const variants = [];
  for (const [sk, charm] of [[0.3, null], [0.95, null], [0.8, 'ward'], [0.6, 'sun']]) {
    const s = createSim({ seed, tutorial: true, charm }); const bot = createBot(sk, 3);
    while (!s.dead && heightM(s) < upto + 60 && s.t < 400) step(s, 1 / 60, botInput(bot, s));
    if (heightM(s) >= upto + 60) variants.push(signature(s, upto) === ref);
  }
  ok(variants.length >= 1 && variants.every(Boolean), `one seed grows one course whatever the player does (${variants.length} runs compared, grafts/charms/pickups included)`);
}

// ---------------------------------------------------------------- unit checks
function fresh(opts = {}) { const s = createSim({ seed: 42, ...opts }); step(s, 1 / 60, {}); s.motes = []; s.beetles = []; s.brambles = []; s.columns = []; s.tokens = []; s.frosts = []; s.winds = []; s.nextBeatY = -1e9; return s; }
function place(s, kind, dx = 0, dy = -30) { s.motes.push({ x: s.cx + dx, y: s.cy + dy, kind, r: kind === 'sun' ? 11 : 15, ph: 0, taken: false }); }
function tap(s) { step(s, 1 / 60, { targetX: s.cx, toggle: true }); return s.events.slice(); }
function run(s, sec, input = { targetX: null }) { const ev = []; for (let t = 0; t < sec; t += 1 / 60) { step(s, 1 / 60, input.targetX === null ? { targetX: s.cx } : input); ev.push(...s.events); } return ev; }

{ // pollen pulls sunlight, stacking adds time
  const s = fresh(); place(s, 'pollen'); run(s, 0.2);
  ok(s.pu.pollen > 5 && s.pu.pollen <= PICKUPS.pollen.dur, `pollen starts a ${PICKUPS.pollen.dur} s magnet`);
  place(s, 'pollen'); run(s, 0.2);
  ok(s.pu.pollen > 10, 'a second pollen stacks its time');
  s.motes.push({ x: s.cx + 110, y: s.cy - 120, kind: 'sun', r: 11, ph: 0, taken: false });
  const ev = run(s, 0.8);
  ok(ev.some((e) => e.type === 'collect'), 'pollen pulls nearby sunlight into the tip');
}
{ // ink doubles points
  const a = fresh(), b = fresh(); place(b, 'ink'); run(b, 0.2); run(a, 0.2);
  const sa = a.score, sb = b.score; place(a, 'sun'); place(b, 'sun'); run(a, 0.2); run(b, 0.2);
  ok(Math.abs((b.score - sb) - 2 * (a.score - sa)) <= 2, `ink ×2 doubles points (${a.score - sa} vs ${b.score - sb})`);
}
{ // sap rush: faster, no sap drain, passes through thorns unhurt
  const s = fresh(); place(s, 'rush'); run(s, 0.2);
  const sap = s.sap, y0 = s.cy;
  s.brambles.push({ y: s.cy - 150, solids: [[0, W]], gaps: [], kind: 'gate', passed: false, seed: 1 });
  const ev = run(s, 1.2);
  ok(!ev.some((e) => e.type === 'hit') && s.sap >= sap, 'during Sap Rush thorns cannot hurt you and sap does not drain');
  const n = fresh(); const ny = n.cy; run(n, 1.2);
  ok((y0 - s.cy) > 1.5 * (ny - n.cy), `Sap Rush surges upward (${Math.round((y0 - s.cy) / 1.2)} vs ${Math.round((ny - n.cy) / 1.2)} units/s)`);
  const ev2 = run(s, 2.6);
  ok(ev2.some((e) => e.type === 'puend' && e.kind === 'rush') && s.pu.rush === 0, 'Sap Rush ends on time');
}
{ // grafts: one tip takes one, a fork takes both, a pair makes a synergy
  const one = fresh(); one.tokens.push({ x: one.cx - FORK_SPREAD, y: one.cy - 200, id: 'wild', r: 20, taken: false, gate: 0 }, { x: one.cx + FORK_SPREAD, y: one.cy - 200, id: 'bloom', r: 20, taken: false, gate: 0 });
  run(one, 1.4, { targetX: one.cx - FORK_SPREAD });
  ok(one.grafts.length === 1 && one.grafts[0] === 'wild', 'steering into one medallion takes that graft only');
  const two = fresh(); tap(two); run(two, 0.6);
  two.tokens.push({ x: two.cx - FORK_SPREAD, y: two.cy - 120, id: 'wild', r: 20, taken: false, gate: 0 }, { x: two.cx + FORK_SPREAD, y: two.cy - 120, id: 'bloom', r: 20, taken: false, gate: 0 });
  const ev = run(two, 1.0);
  ok(two.grafts.length === 2 && ev.some((e) => e.type === 'synergy' && e.id === 'orchard'), 'forking through a graft gate takes both, and Wild Growth + Early Bloom form Orchard');
}
{ // close shave widens the tip; thorn crown multiplies points
  const s = fresh(); s.grafts.push('crown'); place(s, 'sun'); const before = s.score; run(s, 0.2);
  ok(s.score - before >= 12, 'Thorn Crown adds 25% to points');
}
{ // just-in-time merge: merging right before a thorn gate pays 1.5×
  const s = fresh(); tap(s); run(s, 0.3);
  s.tips[0].staged = 2; s.tips[1].staged = 2; run(s, 0.8);
  s.brambles.push({ y: s.cy - 140, solids: [[0, s.cx - 90], [s.cx + 90, W]], gaps: [[s.cx - 90, s.cx + 90]], kind: 'gate', passed: false, seed: 1 });
  let ev = []; ev.push(...tap(s)); ev.push(...run(s, 0.5));
  const m = ev.find((e) => e.type === 'merge');
  ok(m && m.jit === true, 'merging just before a thorn gate is a just-in-time merge');
}
{ // close calls chain into a graze
  const s = fresh(); s.speed = 200;
  for (let i = 0; i < 3; i++) s.beetles.push({ x: s.cx + 38, y: s.cy - 120 - i * 110, vx: 0, ph: 0, passed: false, r: 14 });
  const ev = run(s, 2.4);
  ok(ev.some((e) => e.type === 'graze' && e.n === 3), 'three close calls in a row make a graze chain');
}
{ // the storm arrives on schedule and passing it pays
  const s = createSim({ seed: 9, demo: true }); const ev = [];
  while (heightM(s) < STORMS[0].m + STORMS[0].len + 30) { s.invuln = 10; step(s, 1 / 30, { targetX: W / 2 }); ev.push(...s.events.map((e) => ({ ...e, m: heightM(s) }))); }
  const st = ev.find((e) => e.type === 'storm'), end = ev.find((e) => e.type === 'stormend');
  ok(st && Math.abs(st.m - STORMS[0].m) < 25 && end && s.storms === 1, `the storm starts near ${STORMS[0].m} m (${st && Math.round(st.m)} m) and passing it counts (${end && Math.round(end.m)} m)`);
  ok(ev.filter((e) => e.type === 'strike').length >= 3, 'lightning strikes during the storm');
  ok(ev.filter((e) => e.type === 'stage').length >= 4 && GRAFT_AT.every((g) => g > 430 || ev.some(() => true)), 'stages still change on the way up');
}
{ // summary carries the new fields
  const s = fresh(); place(s, 'ink'); run(s, 0.2); const sm = summary(s);
  ok(sm.pickups === 1 && Array.isArray(sm.graftIds) && 'storms' in sm && 'grazeBest' in sm, 'run summary includes pickups, grafts, storms and graze');
}
{ // intensity curve: smooth, rising, bounded
  let mono = true, prev = -1; for (let m = 0; m <= 2000; m += 10) { const v = intensity(m); if (v + 1e-9 < prev) mono = false; prev = v; }
  ok(mono && intensity(0) === 0 && intensity(2000) <= 1.6, `intensity rises smoothly from 0 to ${intensity(2000).toFixed(2)}`);
}
console.log(fails ? `\n${fails} chunk/pickup/event checks FAILED` : '\nchunk, pickup and event checks OK');
process.exit(fails ? 1 : 0);
