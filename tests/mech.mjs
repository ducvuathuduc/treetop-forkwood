// V2-MECH: checks for every new system. Node only: node tests/mech.mjs
//  1. the 7 worlds' trap sets (ids, sizes, owner examples)
//  2. trap audit for the 15 new mechanics (warn >= 0.8 s before the hit, a real consequence, a clean way past)
//  3. rides, pickups, critter skills, Growth Rings + Knots, curses
//  4. set pieces (schedule, storms, chests) and boss attacks (telegraph contract)
//  5. fairness: pure runs keep the course content and ignore skills / rings / curses / upgrades / boosts
import { createSim, step, summary, heightM, W, FORK_SPREAD, spawnChunkAt, PICKUPS, PICKUP_IDS2 } from '../src/sim.js';
import { WORLD_MECH, WORLD_IDS, worldForSeed } from '../src/world-mech.js';
import { MECH2_IDS, WARN_MIN, botPenalty2 } from '../src/traps2.js';
import { RIDES, RIDE_IDS, ridePick } from '../src/rides.js';
import { SKILLS, SKILL_IDS, sv } from '../src/skills.js';
import { RINGS, KNOTS, RING_AT } from '../src/rings.js';
import { spSlot, BOSSES, BOSS_WARN } from '../src/setpieces.js';
import { createBot, botInput } from '../src/bot.js';
import { rulesFor } from '../src/modes.js';
import { mulberry32 } from '../src/rng.js';

let fails = 0;
const T0 = Date.now(); const lap = (n) => console.log(`  [${n} ${((Date.now() - T0) / 1000).toFixed(1)} s]`);
const ok = (c, msg) => { if (c) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };
const run = (s, sec, inp) => { const ev = []; for (let i = 0; i < sec * 60 && !s.dead; i++) { step(s, 1 / 60, typeof inp === 'function' ? inp(s) : inp); for (const e of s.events) ev.push({ ...e, at: s.t }); } return ev; };
function fresh(opts = {}) {
  const s = createSim({ seed: 9, ...opts });
  s.traps = []; s.brambles = []; s.beetles = []; s.columns = []; s.motes = []; s.frosts = []; s.winds = []; s.hollows = [];
  s.nextBeatY = -1e9; s.speed = 180; s.invuln = 0; s.sap = 100;
  return s;
}
const beetleAt = (s, dy = 30) => s.beetles.push({ x: s.cx, y: s.cy - dy, vx: 0, ph: 0, passed: false, r: 14 });

// ---------------------------------------------------------------- 1. worlds
{
  ok(WORLD_IDS.join() === 'meadow,starry,fresco,ukiyo,lilies,gilded,lacquer', 'the 7 worlds in contract order');
  const all = new Set(); let dup = 0;
  for (const w of WORLD_IDS) {
    const M = WORLD_MECH[w];
    ok(M.traps.length >= 8 && M.trapSet.every((id) => new RegExp(`^${w}\\.trap\\.[a-z]+$`).test(id)), `${w}: ${M.traps.length} traps, ids <world>.trap.<name> (${M.trapSet.join(', ')})`);
    ok(new Set(M.traps.map((t) => t.mech)).size === M.traps.length, `${w}: one skin per mechanic`);
    ok(M.setPieces.calm && M.setPieces.chase && M.setPieces.boss && BOSSES[M.setPieces.boss.boss], `${w}: calm, chase and boss set pieces (${M.setPieces.boss.name})`);
    ok(RIDES[M.rides.sig] && M.rides.native.every((r) => RIDES[r]), `${w}: signature ride ${M.rides.sig}`);
    for (const id of M.trapSet) { if (all.has(id)) dup++; all.add(id); }
  }
  ok(!dup, `${all.size} trap skins across the worlds, all distinct`);
  const used = new Set(WORLD_IDS.flatMap((w) => WORLD_MECH[w].traps.map((t) => t.mech)));
  ok(MECH2_IDS.every((m) => used.has(m)), 'every one of the 15 new mechanics is used by at least one world');
  const want = { starry: ['CROW FLOCK', 'SWIRL CURRENT'], fresco: ['FALLING PLASTER', 'CANDLE DRIPS'], ukiyo: ['WAVE CREST', 'WIND KITE'], lilies: ['DRAGONFLY SWARM', 'SINKING PADS'], gilded: ['MOSAIC SHARDS', 'GOLD GLARE'], lacquer: ['LANTERN FIRE', 'KOI LEAP', 'MOSQUITO NET'] };
  for (const [w, names] of Object.entries(want)) ok(names.every((n) => WORLD_MECH[w].traps.some((t) => t.label === n)), `${w}: has the owner's examples (${names.join(', ').toLowerCase()})`);
  ok(WORLD_MECH.starry.setPieces.boss.boss === 'crowking' && WORLD_MECH.ukiyo.setPieces.boss.boss === 'kitsune', 'Crow King rules the Starry River, Kitsune the Great Wave Cliffs');
  ok(WORLD_IDS.includes(worldForSeed(12345)), 'fair modes can pick one world from the seed');
}

// ---------------------------------------------------------------- 2. trap audit (15 new mechanics)
const rows = [];
const worldWith = (m) => WORLD_IDS.find((w) => WORLD_MECH[w].mechs.has(m));
function mk(m, seed = 9) { const s = fresh({ world: worldWith(m), seed }); s.trapSeen[m] = true; spawnChunkAt(s, m, s.cy - 200, 0.6); s.motes = []; return s; }
const xs = [40, 120, 200, 280, 360, 440, 520];
// the smart dodger: pick the x with the least penalty from the bot's model of the traps (perfect skill)
const dodger = (mode) => () => { let aim = W / 2, t = -1; return (s) => { if (s.t - t > 0.05) { t = s.t; let best = 1e9; for (let x = 20; x <= W - 20; x += 6) { const c = botPenalty2(s, x, 1, 700) + Math.abs(x - s.cx) * (mode === 'move' ? -0.05 : 0.3); if (c < best) { best = c; aim = x; } } } return { targetX: aim }; }; };
const weaver = () => (s) => ({ targetX: W / 2 + Math.sin(s.t * 3.2) * 200 });
function audit(m, extraVictims = []) {
  let hitRun = null;
  const victims = [...extraVictims, ...(m === 'pecker' ? [W / 2] : xs).map((x) => () => () => ({ targetX: x }))];
  for (const v of victims) { for (const seed of m === 'pecker' ? [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] : [9, 10]) { const s = mk(m, seed); const ev = run(s, 7, v(s)); if (ev.some((e) => e.type === 'trapHit' && e.trap === m)) { hitRun = ev; break; } } if (hitRun) break; }
  const hitE = hitRun && hitRun.find((e) => e.type === 'trapHit' && e.trap === m);
  const warn = hitRun && hitRun.find((e) => e.type === 'trapWarn' && e.trap === m);
  const lead = hitE && warn ? hitE.at - warn.at : -1;
  let dodged = false;
  const ramp = () => (s) => ({ targetX: 40 + ((s.t * 80) % 480) }); // keep moving across the field
  for (const d of [dodger('stay'), dodger('move'), weaver, ramp]) { const s = mk(m); const ev = run(s, 7, d(s)); if (!ev.some((e) => e.type === 'trapHit' && e.trap === m) && !s.dead) { dodged = true; break; } }
  ok(!!hitE, `${m}: driving into it fires trapHit (${hitE ? hitE.effect + (hitE.dmg ? ', ' + hitE.dmg + ' sap' : '') : 'none'}) with skin ${hitE && hitE.skin}`);
  ok(lead >= WARN_MIN - 1e-6, `${m}: trapWarn ${lead >= 0 ? lead.toFixed(2) : '?'} s before the hit (>= ${WARN_MIN})`);
  ok(dodged, `${m}: there is a clean way past`);
  rows.push({ m, lead: +lead.toFixed(2), effect: hitE ? hitE.effect : '-', dodged });
}
const stand = () => () => ({}); // hold still (bats, cones)
for (const m of MECH2_IDS) audit(m, m === 'bats' || m === 'cone' ? [stand] : []);
{
  // fork / merge counterplay
  const forkThrough = (m, pick) => { const s = mk(m); let f = false; return run(s, 6, (q) => { const o = { targetX: pick(q) }; if (!f) { o.toggle = true; f = true; } return o; }); };
  const w = forkThrough('web', (q) => { const t = q.traps.find((t) => t.kind === 'web'); return t ? t.x : W / 2; });
  ok(w.some((e) => e.type === 'trapFoil' && e.trap === 'web' && e.how === 'torn') && !w.some((e) => e.type === 'trapHit' && e.trap === 'web'), 'web: a forked pair tears it (+points, acorns)');
  const v = forkThrough('vortex', (q) => { const t = q.traps.find((t) => t.kind === 'vortex'); return t ? t.x : W / 2; });
  ok(v.some((e) => e.type === 'straddle' && e.trap === 'vortex'), 'vortex: forking round the eye pays a straddle');
  const st = mk('strangle'); const tr = st.traps.find((t) => t.kind === 'strangle'); let f2 = false;
  for (const sd of [-1, 1]) st.motes.push({ x: tr.c + sd * FORK_SPREAD, y: st.cy - 240, kind: 'sun', r: 11, ph: 0, taken: false });
  const ev2 = run(st, 6, (q) => { const o = { targetX: tr.c }; if (!f2 && q.t > 0.05) { o.toggle = true; f2 = true; } if (q.forked && q.forkTime > 1.0 && tr.y > q.cy - 170) o.toggle = true; return o; });
  ok(ev2.some((e) => e.type === 'merge' && e.jit) && !ev2.some((e) => e.type === 'trapHit' && e.trap === 'strangle'), 'strangle: merging at the pinch is a just-in-time merge and slips through');
}

lap('---------- 3a. rides');
// ---------------------------------------------------------------- 3a. rides
{
  for (const id of RIDE_IDS) {
    const s = fresh({ world: 'meadow' }); s.motes.push({ x: s.cx, y: s.cy - 40, kind: 'ride', ride: id, r: 20, ph: 0, taken: false });
    let slow = false; const ev = run(s, 0.4, (q) => { if (q.timeScale < 1) slow = true; return { targetX: q.cx }; });
    const mnt = ev.find((e) => e.type === 'vehicle.mount');
    ok(mnt && mnt.ride === id && s.ride && s.ride.id === id && mnt.label && slow, `${RIDES[id].name}: mounts from a Ride Knot with slow-mo (${mnt && mnt.label}, ${mnt && mnt.dur} s)`);
    s.mult = 4; const sap0 = s.sap; s.slowmo = 0;
    const need = s.ride.hits;
    for (let k = 0; k < need + 1 && s.ride; k++) { s.invuln = 0; s.columns.push({ x: s.cx, y0: s.cy - 20, y1: s.cy - 120, hw: 24, kind: 'thorn', live: true, passed: false, seed: 1 }); run(s, 0.4, { targetX: s.cx }); s.columns = []; }
    if (id !== 'rail' && id !== 'mushroom') ok(!s.ride && s.mult === 4 && s.sap > sap0 - 6, `${RIDES[id].name}: ${need === 2 ? 'two hits' : 'one hit'} ejects you, no sap or combo lost`);
  }
  const s = fresh(); s.motes.push({ x: s.cx, y: s.cy - 40, kind: 'ride', ride: 'hummingbird', r: 20, ph: 0, taken: false }); run(s, 0.4, { targetX: s.cx });
  for (let i = 0; i < 6; i++) s.brambles.push({ y: s.cy - 120 - i * 60, solids: [[0, W]], gaps: [], kind: 'gate', passed: false, seed: 0 });
  s.ride.t = 0.01; const evD = run(s, 0.1, { targetX: s.cx });
  const d = evD.find((e) => e.type === 'vehicle.dismount');
  ok(d && s.brambles.filter((b) => b.y > d.clearTo && b.y < s.cy).length === 0 && s.invuln > 0, 'dismount: a hazard-free stretch (2 s of travel) and a moment of grace');
  const t = fresh(); t.motes.push({ x: t.cx, y: t.cy - 40, kind: 'ride', ride: 'dandelion', r: 20, ph: 0, taken: false }); run(t, 0.5, { targetX: t.cx });
  const evT = run(t, 0.2, { targetX: t.cx, toggle: true });
  ok(t.tips.length === 1 && evT.some((e) => e.type === 'vehicle.action' && e.act === 'fold'), 'riding: the tap is the ride action (dandelion folds), you cannot fork');
  const r = mulberry32(3); let low = 0, high = 0; for (let i = 0; i < 4000; i++) { if (ridePick('lacquer', 300, r) === 'goose') low++; if (ridePick('lacquer', 900, r) === 'goose') high++; }
  ok(low === 0 && high > 0, `Golden Goose only past 850 m (${high}/4000 rolls at 900 m on its home world)`);
  let sig = 0; for (let i = 0; i < 2000; i++) if (ridePick('ukiyo', 400, r) === 'rocket') sig++;
  ok(sig > 300, `a world's signature ride is its most common (${sig}/2000 rockets on the Great Wave Cliffs)`);
  const p = createSim({ seed: 21, pure: true, demo: true, world: 'ukiyo' }); while (heightM(p) < 900) { p.invuln = 10; step(p, 1 / 30, { targetX: W / 2 }); }
  ok(p.rideKnots >= 2, `ride knots are seeded on the course, fair modes included (${p.rideKnots} by 900 m)`);
}

lap('-------- 3b. pickups');
// ---------------------------------------------------------------- 3b. pickups
{
  ok(PICKUP_IDS2.length === 9 && PICKUP_IDS2.every((k) => PICKUPS[k] && PICKUPS[k].dur > 0), '9 new pickups');
  const give = (k, opts) => { const s = fresh(opts); s.motes.push({ x: s.cx, y: s.cy - 30, kind: k, r: 15, ph: 0, taken: false, pickup: true }); const ev = run(s, 0.3, { targetX: s.cx }); return { s, ev }; };
  for (const k of PICKUP_IDS2) { const { ev } = give(k); ok(ev.some((e) => e.type === 'pickup.' + k) && ev.some((e) => e.type === 'pickup' && e.kind === k), `${PICKUPS[k].name}: pickup.${k} event`); }
  { const { s } = give('bubble'); s.invuln = 0; beetleAt(s); const sap = s.sap; const ev = run(s, 0.5, { targetX: s.cx }); ok(ev.some((e) => e.type === 'pickup.bubble.pop') && s.sap > sap - 5, 'Dew Bubble absorbs a hit'); }
  { const { s } = give('shears'); let cuts = 0; for (let i = 0; i < 3; i++) { s.invuln = 0; s.brambles.push({ y: s.cy - 40, solids: [[0, W]], gaps: [], kind: 'gate', passed: false, seed: 0 }); const ev = run(s, 0.5, { targetX: s.cx }); cuts += ev.filter((e) => e.type === 'pickup.shears.cut').length; } ok(cuts === 3 && s.hits === 0, 'Pruning Shears cut the next 3 thorns'); }
  { const { s } = give('prism'); s.motes.push({ x: s.cx, y: s.cy - 30, kind: 'sun', r: 11, ph: 0, taken: false }); const sc = s.score; run(s, 0.25, { targetX: s.cx }); ok(s.score - sc >= 2 * 10 - 1, `Sun Prism doubles sunlight (+${s.score - sc})`); }
  { const { s } = give('twin'); ok(s.tips.length === 2, 'Twin Seed forks you at once'); run(s, 0.5, {}); ok(s.spread > FORK_SPREAD + 10, `Twin Seed widens the spread (${Math.round(s.spread)})`); }
  { const { s } = give('acornrain'); run(s, 3, { targetX: s.cx }); ok(s.acorns >= 10, `Acorn Rain: ${s.acorns} acorns home in`); }
  { const { s } = give('goldleaf'); s.mult = 5; s.invuln = 0; beetleAt(s); run(s, 0.5, { targetX: s.cx }); ok(s.hits === 1 && s.mult === 5, 'Golden Leaf: the combo survives a hit'); }
  { const { s } = give('amber'); const b = { x: 100, y: s.cy - 500, vx: 100, ph: 0, passed: false, r: 14 }; s.beetles.push(b); run(s, 1, { targetX: 400 }); ok(b.x < 100 + 100 * 0.85, 'Amber Hourglass slows the world'); }
  { const { s } = give('lantern'); ok(s.warnBonus >= 0.5, 'Firefly Lantern: warnings come 0.5 s earlier'); }
}

// ---------------------------------------------------------------- 3c. critter skills
{
  ok(SKILL_IDS.join() === 'sparrow,squirrel,owl,fox,snail,moth,frog,beetle', '8 critter skills');
  ok(sv(SKILLS.owl.cd, 1) === 20 && sv(SKILLS.owl.cd, 6) === 14, 'values interpolate from level 1 to level 6');
  for (const id of SKILL_IDS) {
    const s = fresh({ skill: { id, lv: 3 }, charm: 'ward' }); s.skill.cd = 0;
    if (id === 'frog') s.motes.push({ x: s.cx + 100, y: s.cy - 150, kind: 'ink', r: 15, ph: 0, taken: false, pickup: true });
    const ev = run(s, 0.1, { charm: true });
    ok(ev.some((e) => e.type === 'skill.fire' && e.id === id) && s.skill.cd > 0 && s.charm === null, `${SKILLS[id].critter} → ${SKILLS[id].name}: fires on the charm button (replacing the charm), then cools down`);
  }
  const s = fresh({ skill: { id: 'owl', lv: 1 } }); s.skill.cd = 10;
  s.motes.push({ x: s.cx - FORK_SPREAD, y: s.cy - 120, kind: 'sun', r: 11, ph: 0, taken: false }, { x: s.cx + FORK_SPREAD, y: s.cy - 120, kind: 'sun', r: 11, ph: 0, taken: false });
  let n = 0; run(s, 3, () => { n++; return { targetX: W / 2, toggle: n === 2 || n === 110 }; });
  ok(s.merges === 1 && s.skill.cd < 10 - 3 - 0.9, `a scoring merge cuts the cooldown by 1 s (${s.skill.cd.toFixed(1)} s left)`);
  const p = createSim({ seed: 3, pure: true, skill: { id: 'owl', lv: 6 }, curses: ['thirst'] });
  ok(p.skill === null && p.knots.length === 0, 'skills and curses are off on pure runs');
  const sh = fresh({ skill: { id: 'snail', lv: 1 } }); sh.skill.cd = 0; run(sh, 0.1, { charm: true }); beetleAt(sh); run(sh, 0.5, { targetX: sh.cx });
  ok(sh.hits === 0, 'Shell Up: untouchable while the shell is closed');
}

lap('rings, knots, curses');
// ---------------------------------------------------------------- 3d. rings, knots, curses
{
  ok(Object.keys(RINGS).length === 12 && Object.keys(KNOTS).length === 4, '12 rings, 4 knots');
  const s = createSim({ seed: 8, demo: true, world: 'meadow' });
  const offers = [], picks = [];
  while (heightM(s) < 300) { s.invuln = 10; step(s, 1 / 30, { targetX: W / 2 }); for (const e of s.events) { if (e.type === 'ring.offer') offers.push({ ...e, slow: s.slowmo }); if (e.type === 'ring.pick') picks.push(e); } }
  ok(offers.length >= 3 && offers.every((o) => o.ids.length === 3), `ring gates at ${RING_AT.slice(0, 3).join(' / ')} m offer 3 rings (${offers.length} gates by 260 m)`);
  ok(offers.every((o) => o.slow > 0), 'medallions coming on screen start 0.5× slow-mo');
  ok(picks.length >= 3, `steering through the centre takes one each gate (${picks.map((p) => p.id).join(', ')})`);
  const f = createSim({ seed: 8, demo: true, world: 'meadow' }); let forked = false, knot = null;
  while (heightM(f) < 130) { f.invuln = 10; const tok = f.tokens.find((t) => t.ring && !t.taken && t.y < f.cy && t.y > f.cy - 500); const o = { targetX: tok ? W / 2 - FORK_SPREAD : W / 2 }; if (tok && !f.forked && !forked) { o.toggle = true; forked = true; } if (!tok && f.forked) o.toggle = true; step(f, 1 / 30, o); for (const e of f.events) if (e.type === 'ring.knot') knot = e; }
  ok(knot && f.knots.length >= 1, `forking through two medallions takes both and a Knot (${knot && knot.name})`);
  const p = createSim({ seed: 8, demo: true, pure: true }); while (heightM(p) < 260) { p.invuln = 10; step(p, 1 / 30, { targetX: W / 2 }); }
  ok(p.rings.length === 0 && p.chunkLog.some((c) => c.role === 'graft') && !p.chunkLog.some((c) => c.role === 'ring'), 'pure runs keep the graft gates (no rings)');
  const base = createSim({ seed: 4 }), cur = createSim({ seed: 4, curses: ['brittle', 'thirst', 'crow', 'thornfall'] });
  ok(cur.knots.length === 4 && cur.R.hazard > base.R.hazard, 'opt-in curses: all four can be taken before a run');
  const hit = (k) => { const s = fresh({ curses: k ? [k] : [] }); beetleAt(s); const a = s.sap; run(s, 0.5, { targetX: s.cx }); return a - s.sap; };
  ok(hit('brittle') > hit(null) * 1.2, `Brittle Bark: hits cost +30% sap (${hit(null).toFixed(1)} -> ${hit('brittle').toFixed(1)})`);
  const dr = (k) => { const s = fresh({ curses: k ? [k] : [] }); const a = s.sap; run(s, 2, { targetX: s.cx }); return a - s.sap; };
  ok(dr('thirst') > dr(null) * 1.08, 'Thirst: sap drains 12% faster');
  const pay = fresh({ curses: ['thirst', 'brittle'] }); pay.motes.push({ x: pay.cx, y: pay.cy - 30, kind: 'sun', r: 11, ph: 0, taken: false }); const sc = pay.score; run(pay, 0.25, { targetX: pay.cx });
  ok(pay.score - sc >= 12, 'each knot pays +15% points (and +20% acorns)');
  const rc = createSim({ seed: 6, demo: true, curses: ['crow'] }); let crows = 0; while (heightM(rc) < 262) { /* V3.1: the 3rd stage crow lands at ~251 m now that a forced early squirrel chunk replaced a crow chunk */ rc.invuln = 10; step(rc, 1 / 30, { targetX: W / 2 }); for (const e of rc.events) if (e.type === 'crow') crows++; }
  ok(crows >= 3, `Restless Crow: a crow every stage (${crows} by 262 m)`);
}

lap('et pieces and bosses');
// ---------------------------------------------------------------- 4. set pieces and bosses
{
  ok(spSlot(0).m === 260 && spSlot(1).m === 640 && spSlot(2).m === 900 && spSlot(3).type === 'calm' && spSlot(3).loop === 1 && spSlot(5).type === 'boss', 'set pieces: calm 260 m, chase 640 m, boss 900 m, then the rotation repeats (+15% each loop)');
  for (const w of WORLD_IDS) {
    const s = createSim({ seed: 31, demo: true, world: w });
    const ev = [];
    while (heightM(s) < 1350) { s.invuln = 10; s.sap = 100; step(s, 1 / 20, { targetX: W / 2 }); for (const e of s.events) ev.push({ ...e, m: heightM(s) }); }
    const starts = ev.filter((e) => e.type === 'setpiece.start'), ends = ev.filter((e) => e.type === 'setpiece.end'), chests = ev.filter((e) => e.type === 'chest');
    ok(starts.length >= 3 && ends.length >= 3 && chests.length >= 3, `${w}: ${starts.map((e) => `${e.name} @${Math.round(e.m)} m`).join(', ')}; each ends with a chest`);
    const storms = ev.filter((e) => e.type === 'storm').map((e) => e.m);
    const clash = starts.some((st) => { const en = ends.find((e) => e.id === st.id && e.m > st.m); return storms.some((m) => en && m > st.m && m < en.m); });
    ok(!clash, `${w}: no storm inside a set piece`);
    ok(ev.some((e) => e.type === 'boss.phase' && e.phase === 2), `${w}: the boss runs all three phases`);
  }
  let worst = 9, n = 0;
  for (const w of ['meadow', 'starry', 'ukiyo', 'lacquer']) for (const seed of [1]) {
    const s = createSim({ seed, world: w }); let lastWarn = null;
    while (heightM(s) < 1150 && !s.dead) { s.sap = 100; s.invuln = 0; if (heightM(s) < 880) s.invuln = 10; step(s, heightM(s) < 880 ? 1 / 20 : 1 / 45, { targetX: W / 2 }); for (const e of s.events) { if (e.type === 'trapWarn' && e.boss) lastWarn = s.t; if (e.type === 'trapHit' && e.src === 'boss' && lastWarn != null) { worst = Math.min(worst, s.t - lastWarn); n++; } } }
  }
  ok(n > 0 && worst >= WARN_MIN - 1e-6, `boss attacks: ${n} hits on a bot that never dodges, each telegraphed >= ${worst.toFixed(2)} s ahead`);
  ok(['dive', 'sweep', 'volley', 'ring', 'grab', 'orbs', 'plates'].every((k) => BOSS_WARN[k] >= 1.2), 'every boss attack primitive telegraphs >= 1.2 s');
  const zen = createSim({ seed: 5, demo: true, rules: { ...rulesFor({ mode: 'zen' }), finishM: 0 } }); const zt = []; while (heightM(zen) < 950 && !zen.dead) { zen.invuln = 10; step(zen, 1 / 30, { targetX: W / 2 }); for (const e of zen.events) if (e.type === 'setpiece.start') zt.push(e.type); }
  ok(zen.spList.every((sp) => sp.type === 'calm'), 'Zen keeps only calm set pieces');
}

lap('-------- 5. fairness');
// ---------------------------------------------------------------- 5. fairness
{
  const course = (opts) => { const s = createSim({ seed: 777, demo: true, world: 'lilies', pure: true, ...opts }); while (heightM(s) < 1000) { s.invuln = 10; step(s, 1 / 30, { targetX: W / 2 }); } return JSON.stringify([s.chunkLog.map((c) => c.id), s.rideKnots, s.setPieces || 0]); };
  const a = course({}), b = course({ skill: { id: 'owl', lv: 6 }, curses: ['thirst', 'crow'], econ: { boosts: ['mega', 'ride'], up: { wild: 6, rides: 6 }, mult: 3 }, charm: 'ward' });
  ok(a === b, 'a pure (daily / weekly / race / duel) course is identical whatever skills, curses, upgrades and boosts are offered');
  ok(course({ world: 'gilded' }) !== a, 'the world changes the course (its own traps), so fair modes fix one world for everyone');
  const det = () => { const s = createSim({ seed: 99, world: 'starry', skill: { id: 'fox', lv: 4 }, econ: { boosts: [], up: {}, mult: 1 } }); const bot = createBot(0.8, 5); while (!s.dead && s.t < 120) step(s, 1 / 60, botInput(bot, s)); return summary(s).hash; };
  ok(det() === det(), 'the sim is deterministic with every new system on (same seed, same inputs, same tree)');
  const pure = createSim({ seed: 5, pure: true, econ: { boosts: ['ride'], up: { rides: 6 }, mult: 2 } });
  ok(pure.econ === null && !pure.rideStart, 'pure runs ignore the Ride Token and upgrades');
}

console.log('\nmechanic   warn lead  consequence  avoidable');
for (const r of rows) console.log(`${r.m.padEnd(10)} ${String(r.lead).padStart(8)} s  ${String(r.effect).padEnd(12)} ${r.dodged ? 'yes' : 'NO'}`);
console.log(fails ? `\n${fails} FAILED` : '\nmech OK');
process.exit(fails ? 1 : 0);
