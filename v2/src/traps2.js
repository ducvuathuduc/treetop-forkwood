// Forkwood 2.0 MECH: 15 more trap mechanics (13 from v12-research/MECHANICS.md
// §2.3 plus Swirl vortex and Glare beam). Pure and deterministic like traps.js:
// no DOM, no Math.random, never imports sim.js (sim hands every call an api).
//
// Contract (same as pass 6/8): every trap is telegraphed >= WARN_MIN (0.8 s)
// before it can hurt, emits {type:'trapWarn'} first and {type:'trapHit'} when it
// lands, has a gentle intro version the first time it appears in a run, and has
// a counterplay (several reward forking or merging). Trap objects carry `kind`
// (the mechanic) and `skin` (the world's registry id, see src/world-mech.js).
import { clamp } from './rng.js';
import { trapSkin, trapLabel } from './world-mech.js';

const W = 560, TIP_R = 9, FORK_SPREAD = 78;
export const WARN_MIN = 0.8;

export const MECH2 = {
  web: { name: 'SPIDER WEB', hint: 'go round · or fork through it to tear it' },
  pecker: { name: 'WOODPECKER DRILL', hint: 'a dotted row flashes before it drills · pass above or below' },
  cone: { name: 'SQUIRREL BOMBARDIER', hint: 'leave the target circle after it locks' },
  hornets: { name: 'HORNET PATROL', hint: 'thread the gap beside the swarm' },
  jaws: { name: 'FLYTRAP JAWS', hint: 'the jaws quiver before they close · pass while open or fork outside' },
  spores: { name: 'SLEEP SPORES', hint: 'the haze swaps left and right · avoid it' },
  icicle: { name: 'ICICLE DROP', hint: 'a shaking icicle falls down its shaded column · sidestep' },
  seesaw: { name: 'SEESAW BOUGH', hint: 'read the chevrons · enter the open end (fork both when level)' },
  embers: { name: 'EMBER DRIFT', hint: 'embers swell before they flare · keep your distance' },
  bats: { name: 'BAT SWOOP', hint: 'they dive where you were · keep moving' },
  candy: { name: 'CANDY CRUSHER', hint: 'grab the triple sunlight and get out the far side before it closes' },
  strangle: { name: 'STRANGLER FIG', hint: 'roots grow in from both edges · merge to slip through the middle' },
  pendulum: { name: 'BAMBOO PENDULUM', hint: 'the ghost arc shows each swing · time the gap' },
  vortex: { name: 'SWIRL VORTEX', hint: 'the swirl drags you to its eye · ride the rim or fork round the eye' },
  beam: { name: 'GLARE BEAM', hint: 'the beam warms up, then sweeps · straddle it or stay ahead' },
};
export const MECH2_IDS = Object.keys(MECH2);

// timings (seconds) and sizes (world units); tests read these
export const WEB = { r: 46, slow: 1.5, slowK: 0.4, drain: 6 };
export const PECKER = { idle: 2.0, warn: 1.0, active: 0.35, dmg: 22, span: 0.66 };
export const CONE = { track: 0.4, lock: 1.0, r: 34, dmg: 20 };
export const HORNET = { n: 5, gap: 40, r: 10, amp: 150, w: 0.9, dmg: 18 };
export const JAWS = { open: 1.4, quiver: 0.8, shut: 0.4, half: 62, mouth: 34, dmg: 26 };
export const SPORE = { r: 52, invert: 1.5 };
export const ICICLE = { shake: 1.0, fall: 700, hw: 18, dmg: 20, lead: 1.25 };
export const SEESAW = { per: 3.6, half: 52, dmg: 22, open: 1.5, level: 0.3, chev: 0.9 };
export const EMBER = { r: 12, flareR: 30, per: 2.6, pulse: 0.8, flare: 0.8, burn: 2, burnRate: 5, rise: 25 };
export const BAT = { glow: 1.0, fly: 0.35, back: 0.9, r: 22, gap: 0.6, dmg: 16 };
export const CANDY = { half: 70, h: 240, close: 1.5, dmg: 26, wall: 10 };
export const STRANGLE = { grow: 1.2, gap: 35, lead: 1.7, dmg: 22 };
export const PEND = { amp: 100, per: 2.2, hw: 14, dmg: 22 };
export const VORTEX = { R: 120, eye: 24, force: 150, dmg: 20 };
export const BEAM = { hw: 22, v: 80, warm: 1.0, lead: 1.4, dmg: 20 };

const rnd = (s) => s.rng();
const sp = (s) => Math.max(150, s.speed || 0);
const crossed = (s, y) => y >= s.cy && y < s.prevCy;

/** First appearance this run? Marks it seen and drops a hint label (world-named). */
function intro(s, id, y) {
  if (s.trapSeen[id]) return false;
  s.trapSeen[id] = true;
  const L = trapLabel(s.world, id) || MECH2[id];
  s.traps.push({ kind: 'label', id, y, shown: false, name: L.label || L.name, hint: L.hint, skin: trapSkin(s.world, id) });
  return true;
}
function add(s, o) { o.skin = trapSkin(s.world, o.kind); o.t2 = true; s.traps.push(o); return o; }

// ---------------------------------------------------------------- spawners
export function addWeb(s, x, y, r = WEB.r) { return add(s, { kind: 'web', x: clamp(x, r + 20, W - r - 20), y, r, done: false }); }
export function addPecker(s, y, side) { const per = PECKER.idle + PECKER.warn + PECKER.active; return add(s, { kind: 'pecker', y, side, per, clock: rnd(s) * per, x0: side < 0 ? 0 : W * (1 - PECKER.span), x1: side < 0 ? W * PECKER.span : W, passed: false }); }
export function addCone(s, y, side) { return add(s, { kind: 'cone', y, side, st: 'perch', t: 0, x: W / 2 }); }
export function addHornets(s, y, ph) { return add(s, { kind: 'hornets', y, ph, clock: 0, passed: false, scattered: false }); }
export function addJaws(s, y, c) { return add(s, { kind: 'jaws', y, c: clamp(c, JAWS.half + 60, W - JAWS.half - 60), clock: rnd(s) * 2.6, passed: false }); }
export function addSpores(s, x, y, r = SPORE.r) { return add(s, { kind: 'spores', x: clamp(x, r + 10, W - r - 10), y, r, done: false }); }
export function addIcicles(s, y, xs) { return add(s, { kind: 'icicle', y, xs: xs.map((x) => ({ x: clamp(x, 40, W - 40), fy: null, done: false })), st: 'hang', t: 0 }); }
export function addSeesaw(s, y) { return add(s, { kind: 'seesaw', y, clock: rnd(s) * SEESAW.per, passed: false }); }
export function addEmbers(s, y, n, cx, spread) {
  const es = [];
  for (let i = 0; i < n; i++) es.push({ x: clamp(cx + (rnd(s) - 0.5) * spread, 40, W - 40), y: y - i * 110 - rnd(s) * 40, off: rnd(s) * EMBER.per, done: false, out: false });
  return add(s, { kind: 'embers', y: y - (n - 1) * 55, embers: es, clock: 0 });
}
export function addBats(s, y, xs) { return add(s, { kind: 'bats', y, bats: xs.map((x) => ({ x, st: 'hang', t: 0 })), on: false, t: 0 }); }
export function addCandy(s, cx, yb) {
  cx = clamp(cx, CANDY.half + 40, W - CANDY.half - 40);
  const o = add(s, { kind: 'candy', cx, y0: yb, y1: yb - CANDY.h, y: yb, st: 'open', t: 0 });
  for (let i = 0; i < 4; i++) s.motes.push({ x: cx + (i % 2 ? 18 : -18), y: yb - 40 - i * 50, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false, candy: true });
  return o;
}
export function addStrangle(s, y, c) { return add(s, { kind: 'strangle', y, c: clamp(c, 90, W - 90), g: 0, st: 'wait', t: 0, passed: false }); }
export function addPendulum(s, y, n = 2) {
  const ph = rnd(s) * 6.28, pv = n === 2 ? [W / 2 - 150, W / 2 + 150] : [W / 2];
  return add(s, { kind: 'pendulum', y, pv, ph, clock: 0, passed: false });
}
export function addVortex(s, x, y, dir) { return add(s, { kind: 'vortex', x: clamp(x, 150, W - 150), y, dir, near: 1e9, passed: false }); }
export function addBeam(s, yb, h, x0, dir) { return add(s, { kind: 'beam', y0: yb, y1: yb - h, y: yb, x: clamp(x0, 60, W - 60), dir, st: 'idle', t: 0, passed: false }); }

// ---------------------------------------------------------------- state helpers (tests, render, bot)
export function peckerState(tr, c = tr.clock) { const u = ((c % tr.per) + tr.per) % tr.per; return u < PECKER.idle ? 'idle' : u < PECKER.idle + PECKER.warn ? 'warn' : 'active'; }
export function jawsState(tr, c = tr.clock) { const u = ((c % 2.6) + 2.6) % 2.6; return u < JAWS.open ? 'open' : u < JAWS.open + JAWS.quiver ? 'quiver' : 'shut'; }
/** Seesaw phase: 'L' (left end open), 'R', 'level' (both open); `next` = seconds to the next closing. */
export function seesawState(tr, c = tr.clock) {
  const u = ((c % SEESAW.per) + SEESAW.per) % SEESAW.per, o = SEESAW.open, l = SEESAW.level, h = o + l;
  if (u < o) return { st: 'L', chev: u >= h - SEESAW.chev, left: h - u };
  if (u < h) return { st: 'level', chev: true, left: h - u };
  if (u < h + o) return { st: 'R', chev: u >= 2 * h - SEESAW.chev, left: 2 * h - u };
  return { st: 'level', chev: true, left: 2 * h - u };
}
const SEE_L = W / 2 - FORK_SPREAD, SEE_R = W / 2 + FORK_SPREAD;
export const hornetXs = (tr, c = tr.clock) => { const cx = clamp(W / 2 + HORNET.amp * Math.sin(tr.ph + c * HORNET.w), 120, W - 120); return Array.from({ length: HORNET.n }, (_, i) => cx + (i - (HORNET.n - 1) / 2) * HORNET.gap); };
export const hornetY = (tr, i, c = tr.clock) => tr.y + 14 * Math.sin(c * 6 + i);
export const pendXs = (tr, c = tr.clock) => tr.pv.map((p) => p + PEND.amp * Math.sin(tr.ph + c * (Math.PI * 2) / PEND.per));
export function emberR(e, c) { const u = (((c + e.off) % EMBER.per) + EMBER.per) % EMBER.per; return u >= EMBER.per - EMBER.flare ? EMBER.flareR : EMBER.r; }
export function emberPulse(e, c) { const u = (((c + e.off) % EMBER.per) + EMBER.per) % EMBER.per; return u >= EMBER.per - EMBER.flare - EMBER.pulse && u < EMBER.per - EMBER.flare; }

/** Solid spans of a row trap at clock c (pecker, jaws, seesaw, strangle, pendulum). */
export function rowSolids2(tr, c) {
  if (tr.kind === 'pecker') return peckerState(tr, c) === 'active' ? [[tr.x0, tr.x1]] : [];
  if (tr.kind === 'jaws') { const a = tr.c - JAWS.half, b = tr.c + JAWS.half; return jawsState(tr, c) === 'shut' ? [[a, b]] : [[a, tr.c - JAWS.mouth], [tr.c + JAWS.mouth, b]]; }
  if (tr.kind === 'seesaw') {
    const st = seesawState(tr, c).st, h = SEESAW.half;
    const out = [[0, SEE_L - h], [SEE_L + h, SEE_R - h], [SEE_R + h, W]];
    if (st === 'R') out.push([SEE_L - h, SEE_L + h]);
    if (st === 'L') out.push([SEE_R - h, SEE_R + h]);
    return out.sort((p, q) => p[0] - q[0]);
  }
  if (tr.kind === 'strangle') { const g = tr.g; return g <= 0 ? [] : [[0, (tr.c - STRANGLE.gap) * g], [W - (W - tr.c - STRANGLE.gap) * g, W]]; }
  if (tr.kind === 'pendulum') return pendXs(tr, c).map((x) => [x - PEND.hw, x + PEND.hw]);
  return [];
}
const ROWS = new Set(['pecker', 'jaws', 'seesaw', 'strangle', 'pendulum']);
/** Is a row trap right ahead (for just-in-time merges)? */
export function rowAhead2(s, dist) { for (const tr of s.traps) if (ROWS.has(tr.kind) && !tr.passed && tr.y < s.cy && tr.y > s.cy - dist) return true; return false; }

// ---------------------------------------------------------------- chunks (tier 1-2 singles; combos are composed in sim.js)
const R2 = (s, A, y, x) => A.reachableX(s, y, x);
export const TRAP2_CHUNKS = [
  { id: 'web', trap: 'web', tier: 1, minM: 50, w: 1.1, gen(s, y, d, A) {
    const first = intro(s, 'web', y + 40);
    const x = 140 + rnd(s) * (W - 280);
    addWeb(s, x, y - 200, first ? 34 : WEB.r + d * 8);
    A.addTwinTrail(s, y - 120, x, 3);
    if (!first && d > 0.5) addWeb(s, x < W / 2 ? x + 210 : x - 210, y - 440, WEB.r);
    s.lastGate = null; return first ? 460 : 560;
  } },
  { id: 'cone', trap: 'cone', tier: 1, minM: 70, w: 1.0, gen(s, y, d, A) {
    intro(s, 'cone', y + 40);
    A.addTrail(s, y - 20, { n: 5, amp: 120 });
    addCone(s, y - 160, rnd(s) < 0.5 ? -1 : 1);
    if (d > 0.6) addCone(s, y - 420, rnd(s) < 0.5 ? -1 : 1);
    s.lastGate = null; return d > 0.6 ? 620 : 480;
  } },
  { id: 'icicle', trap: 'icicle', tier: 1, minM: 90, w: 1.0, gen(s, y, d, A) {
    const first = intro(s, 'icicle', y + 40);
    const a = 100 + rnd(s) * (W - 200);
    addIcicles(s, y - 260, first ? [a] : [a, clamp(a + (a < W / 2 ? 160 : -160), 60, W - 60)]);
    A.addTrail(s, y - 40, { n: 5, cx: a, amp: 40 });
    s.lastGate = null; return 520;
  } },
  { id: 'bats', trap: 'bats', tier: 1, minM: 110, w: 1.0, gen(s, y, d, A) {
    const first = intro(s, 'bats', y + 40);
    const n = first ? 1 : 2 + (d > 0.6 ? 1 : 0), xs = [];
    for (let i = 0; i < n; i++) xs.push(110 + ((i / Math.max(1, n - 1)) * (W - 220)));
    addBats(s, y - 260, xs);
    A.addTrail(s, y - 40, { n: 6, amp: 180 });
    s.lastGate = null; return 600;
  } },
  { id: 'pecker', trap: 'pecker', tier: 2, minM: 130, w: 1.0, gen(s, y, d, A) {
    const first = intro(s, 'pecker', y + 40);
    const side = rnd(s) < 0.5 ? -1 : 1;
    addPecker(s, y - 220, side);
    A.addTrail(s, y - 40, { n: 4, cx: side < 0 ? W - 120 : 120, amp: 30 });
    if (!first && d > 0.5) addPecker(s, y - 480, -side);
    s.lastGate = null; return first || d <= 0.5 ? 440 : 640;
  } },
  { id: 'hornets', trap: 'hornets', tier: 2, minM: 160, w: 1.0, gen(s, y, d, A) {
    intro(s, 'hornets', y + 40);
    addHornets(s, y - 240, rnd(s) * 6.28);
    A.addTrail(s, y - 40, { n: 5, amp: 140 });
    s.lastGate = null; return 500;
  } },
  { id: 'jaws', trap: 'jaws', tier: 2, minM: 180, w: 1.0, gen(s, y, d, A) {
    intro(s, 'jaws', y + 40);
    const c = R2(s, A, y - 260, 170 + rnd(s) * (W - 340));
    addJaws(s, y - 260, c);
    for (let i = 0; i < 3; i++) s.motes.push({ x: c, y: y - 120 - i * 60 + 40, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false });
    s.lastGate = null; return 480;
  } },
  { id: 'spores', trap: 'spores', tier: 2, minM: 200, w: 0.9, gen(s, y, d, A) {
    // the generator rule: nothing that can hurt in the 1.5 s (~420 u) above a spore cloud
    intro(s, 'spores', y + 40);
    const x = 120 + rnd(s) * (W - 240);
    addSpores(s, x, y - 160);
    A.addTrail(s, y - 40, { n: 6, cx: x < W / 2 ? x + 170 : x - 170, amp: 40 });
    s.lastGate = null; return 720;
  } },
  { id: 'seesaw', trap: 'seesaw', tier: 2, minM: 220, w: 1.0, gen(s, y, d, A) {
    intro(s, 'seesaw', y + 40);
    addSeesaw(s, y - 240);
    A.addTrail(s, y - 40, { n: 3, cx: W / 2, amp: 60 });
    s.lastGate = { y: y - 240, x: W / 2 }; return 460;
  } },
  { id: 'embers', trap: 'embers', tier: 2, minM: 240, w: 0.9, gen(s, y, d, A) {
    const first = intro(s, 'embers', y + 40);
    const cx = 140 + rnd(s) * (W - 280);
    addEmbers(s, y - 160, first ? 2 : 3 + (d > 0.7 ? 1 : 0), cx, 160);
    A.addTrail(s, y - 40, { n: 6, cx: cx < W / 2 ? cx + 180 : cx - 180, amp: 40 });
    s.lastGate = null; return 600;
  } },
  { id: 'candy', trap: 'candy', tier: 2, minM: 200, w: 0.9, gen(s, y, d, A) {
    intro(s, 'candy', y + 40);
    const cx = R2(s, A, y - 120, 150 + rnd(s) * (W - 300));
    addCandy(s, cx, y - 120);
    A.addTrail(s, y - 60, { n: 4, cx: cx < W / 2 ? cx + 200 : cx - 200, amp: 30 });
    s.lastGate = null; return 520;
  } },
  { id: 'strangle', trap: 'strangle', tier: 2, minM: 200, w: 1.0, gen(s, y, d, A) {
    intro(s, 'strangle', y + 40);
    const c = R2(s, A, y - 300, 150 + rnd(s) * (W - 300));
    A.addTwinTrail(s, y - 40, c, 3);
    addStrangle(s, y - 300, c);
    s.motes.push({ x: c, y: y - 340, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false });
    s.lastGate = { y: y - 300, x: c }; return 500;
  } },
  { id: 'pendulum', trap: 'pendulum', tier: 2, minM: 180, w: 1.0, gen(s, y, d, A) {
    const first = intro(s, 'pendulum', y + 40);
    addPendulum(s, y - 240, first ? 1 : 2);
    A.addTrail(s, y - 40, { n: 4, cx: W / 2, amp: 120 });
    if (!first && d > 0.55) addPendulum(s, y - 500, 2);
    s.lastGate = null; return !first && d > 0.55 ? 660 : 440;
  } },
  { id: 'vortex', trap: 'vortex', tier: 2, minM: 160, w: 1.0, gen(s, y, d, A) {
    intro(s, 'vortex', y + 40);
    const x = 170 + rnd(s) * (W - 340);
    addVortex(s, x, y - 260, rnd(s) < 0.5 ? -1 : 1);
    A.addTwinTrail(s, y - 140, x, 4);
    s.lastGate = null; return 560;
  } },
  { id: 'beam', trap: 'beam', tier: 2, minM: 180, w: 1.0, gen(s, y, d, A) {
    intro(s, 'beam', y + 40);
    const x0 = rnd(s) < 0.5 ? 80 : W - 80;
    addBeam(s, y - 80, 300, x0, x0 < W / 2 ? 1 : -1);
    A.addTwinTrail(s, y - 100, W / 2, 4);
    s.lastGate = null; return 480;
  } },
];

// ---------------------------------------------------------------- per-step
/** Lateral push from swirl vortices at the tip. */
export function vortexWind(s) {
  let w = 0;
  for (const tr of s.traps) {
    if (tr.kind !== 'vortex') continue;
    const dx = s.cx - tr.x, dy = s.cy - tr.y, d = Math.hypot(dx, dy);
    if (d >= VORTEX.R || d < 1) continue;
    const k = 1 - d / VORTEX.R;
    w += VORTEX.force * k * ((-dy / d) * tr.dir * 0.8 - (dx / d) * 0.5);
  }
  return w;
}

function warn(s, A, tr, trap, x, y, t, extra) { A.emit(s, 'trapWarn', { trap, skin: tr.skin, x, y, t: +t.toFixed(2), ...(extra || {}) }); }
/** One approach warning per trap, ~WARN_LEAD s before the tip can reach it. */
function approach(s, A, tr, y, x, lead) {
  if (tr.w8 || s.demo || y > s.cy) return;
  if (y < s.cy - sp(s) * (lead + (s.warnBonus || 0))) return;
  tr.w8 = 1; warn(s, A, tr, tr.kind, x, y, (s.cy - y) / sp(s));
}
const tipHits = (s) => s.invuln > 0 || s.pu.rush > 0;
const decoyX = (s) => (s.decoy > 0 ? s.decoyX : null);

/** Advance clocks, warnings and the timed effects. slow: world-time factor (Stillness, Amber, Owl). */
export function traps2Update(s, dt, slow, A) {
  const tdt = dt * slow, R = A.tipR(s);
  for (const tr of s.traps) {
    if (!tr.t2) continue;
    if (tr.clock != null) tr.clock += tdt;
    switch (tr.kind) {
      case 'web': case 'spores': approach(s, A, tr, tr.y + tr.r, tr.x, 1.2); break;
      case 'vortex': approach(s, A, tr, tr.y + VORTEX.R, tr.x, 1.2); break;
      case 'hornets': approach(s, A, tr, tr.y, hornetXs(tr)[2], 1.2); break;
      case 'pendulum': approach(s, A, tr, tr.y, W / 2, 1.2); break;
      case 'embers': approach(s, A, tr, tr.embers[0].y + EMBER.flareR, tr.embers[0].x, 1.2);
        for (const e of tr.embers) e.y -= EMBER.rise * tdt;
        break;
      case 'candy': {
        approach(s, A, tr, tr.y0, tr.cx, 1.2);
        if (tr.st === 'open' && crossed(s, tr.y0) && s.tips.some((t) => Math.abs(t.x - tr.cx) < CANDY.half)) {
          tr.st = 'closing'; tr.t = Math.max(CANDY.close, CANDY.h / sp(s) + 0.35);
          warn(s, A, tr, 'candy', tr.cx, tr.y1, tr.t, { closing: true });
        } else if (tr.st === 'closing') {
          tr.t -= tdt;
          if (tr.t <= 0) {
            tr.st = 'shut';
            const inside = s.cy <= tr.y0 && s.cy >= tr.y1;
            let ti = -1; if (inside) s.tips.forEach((t, i) => { if (Math.abs(t.x - tr.cx) < CANDY.half) ti = i; });
            if (ti >= 0) A.hit(s, ti, CANDY.dmg, 'candy');
          } else if (s.cy < tr.y1 - 4) { tr.st = 'escaped'; const b = A.addScore(s, 60 * s.mult); A.emit(s, 'trapFoil', { trap: 'candy', skin: tr.skin, how: 'escaped', x: tr.cx, y: tr.y1, bonus: b }); }
        }
        break;
      }
      case 'pecker': {
        approach(s, A, tr, tr.y, (tr.x0 + tr.x1) / 2, 1.2);
        const st = peckerState(tr);
        if (st === 'warn' && tr.pst !== 'warn' && !tr.passed && s.cy - tr.y < sp(s) * 2.2 && s.cy > tr.y) warn(s, A, tr, 'pecker', (tr.x0 + tr.x1) / 2, tr.y, PECKER.idle + PECKER.warn - (((tr.clock % tr.per) + tr.per) % tr.per), { row: true });
        tr.pst = st; break;
      }
      case 'jaws': {
        approach(s, A, tr, tr.y, tr.c, 1.2);
        const st = jawsState(tr);
        if (st === 'quiver' && tr.pst !== 'quiver' && !tr.passed && s.cy - tr.y < sp(s) * 2.2 && s.cy > tr.y) warn(s, A, tr, 'jaws', tr.c, tr.y, JAWS.quiver, { quiver: true });
        tr.pst = st; break;
      }
      case 'seesaw': {
        approach(s, A, tr, tr.y, W / 2, 1.2);
        const q = seesawState(tr);
        if (q.chev && !tr.pchev && !tr.passed && s.cy - tr.y < sp(s) * 2.2 && s.cy > tr.y) warn(s, A, tr, 'seesaw', q.st === 'R' || (q.st === 'level' && ((tr.clock % SEESAW.per) + SEESAW.per) % SEESAW.per > SEESAW.per / 2) ? SEE_R : SEE_L, tr.y, q.left, { swing: true });
        tr.pchev = q.chev; break;
      }
      case 'strangle': {
        if (tr.st === 'wait' && s.cy < tr.y + sp(s) * STRANGLE.lead && s.cy > tr.y) { tr.st = 'grow'; tr.t = 0; warn(s, A, tr, 'strangle', tr.c, tr.y, (s.cy - tr.y) / sp(s), { gap: STRANGLE.gap }); }
        if (tr.st === 'grow') { tr.t += tdt; tr.g = Math.min(1, tr.t / STRANGLE.grow); }
        break;
      }
      case 'beam': {
        if (tr.st === 'idle' && s.cy < tr.y0 + sp(s) * BEAM.lead) { tr.st = 'warm'; tr.t = BEAM.warm; warn(s, A, tr, 'beam', tr.x, tr.y0, BEAM.warm, { warm: true }); }
        else if (tr.st === 'warm') { tr.t -= tdt; if (tr.t <= 0) tr.st = 'on'; }
        if (tr.st !== 'idle') { tr.x += tr.dir * BEAM.v * tdt; if (tr.x < 60) { tr.x = 60; tr.dir = 1; } if (tr.x > W - 60) { tr.x = W - 60; tr.dir = -1; } }
        if (s.cy < tr.y1 - 20 && tr.st !== 'done') tr.st = 'done';
        break;
      }
      case 'icicle': {
        if (tr.st === 'hang' && s.cy < tr.y + sp(s) * ICICLE.lead && s.cy > tr.y - 40) { tr.st = 'shake'; tr.t = ICICLE.shake; warn(s, A, tr, 'icicle', tr.xs[0].x, tr.y, ICICLE.shake + 0.05, { cols: tr.xs.map((q) => q.x), hw: ICICLE.hw }); }
        else if (tr.st === 'shake') { tr.t -= tdt; if (tr.t <= 0) { tr.st = 'fall'; for (const q of tr.xs) q.fy = tr.y; } }
        else if (tr.st === 'fall') {
          let live = false;
          for (const q of tr.xs) {
            if (q.done) continue;
            const prev = q.fy; q.fy += ICICLE.fall * tdt; live = true;
            // the falling icicle and the rising tip meet: test the swept interval
            if (prev <= s.cy + 4 && q.fy >= s.prevCy - 4) {
              q.done = true;
              let ti = -1; s.tips.forEach((t, i) => { if (Math.abs(t.x - q.x) < ICICLE.hw + R - 3) ti = i; });
              if (ti >= 0) A.hit(s, ti, ICICLE.dmg, 'icicle');
              else if (s.tips.some((t) => Math.abs(t.x - q.x) < ICICLE.hw + R + 26) && !tipHits(s)) A.nearMiss(s, q.x, s.cy);
            }
            if (q.fy > s.cy + 700) q.done = true;
          }
          if (!live) tr.st = 'done';
        }
        break;
      }
      case 'cone': {
        if (tr.st === 'perch' && s.cy < tr.y) { tr.st = 'track'; tr.t = CONE.track + CONE.lock; tr.x = decoyX(s) ?? s.cx; warn(s, A, tr, 'cone', tr.x, s.cy, tr.t, { r: CONE.r }); }
        else if (tr.st === 'track') {
          tr.t -= tdt; tr.yy = s.cy;
          const tx = decoyX(s) ?? s.cx;
          if (tr.t > CONE.lock) tr.x += clamp(tx - tr.x, -400 * dt, 400 * dt);
          if (tr.t <= 0) {
            tr.st = 'dropped';
            let ti = -1; s.tips.forEach((t, i) => { if (Math.abs(t.x - tr.x) < CONE.r + R - 3) ti = i; });
            if (ti >= 0 && !tipHits(s) && decoyX(s) == null) A.hit(s, ti, CONE.dmg, 'cone');
            else if (!tipHits(s)) { const near = s.tips.some((t) => Math.abs(t.x - tr.x) < CONE.r + R + 34); const b = A.addScore(s, 20 * s.mult); A.acorns(s, near ? 2 : 0, tr.x, s.cy); A.emit(s, 'trapFoil', { trap: 'cone', skin: tr.skin, how: near ? 'split' : 'miss', x: tr.x, y: s.cy, bonus: b }); }
          }
        }
        break;
      }
      case 'bats': {
        if (!tr.on && s.cy < tr.y + 300) { tr.on = true; tr.t = 0; }
        if (!tr.on) break;
        tr.t += tdt;
        tr.bats.forEach((b, i) => {
          const t0 = i * BAT.gap;
          if (b.st === 'hang' && tr.t >= t0) { b.st = 'glow'; b.t = 0; warn(s, A, tr, 'bats', b.x, s.cy, BAT.glow + BAT.fly, { i }); }
          else if (b.st === 'glow') {
            b.t += tdt;
            if (b.tx == null && b.t >= BAT.glow + BAT.fly - BAT.back) b.tx = decoyX(s) ?? s.cx; // where the tip is 0.9 s before impact
            if (b.t >= BAT.glow) { b.st = 'swoop'; b.t = 0; }
          } else if (b.st === 'swoop') {
            b.t += tdt;
            if (b.t >= BAT.fly) {
              b.st = 'gone';
              let ti = -1; s.tips.forEach((t, k) => { if (Math.abs(t.x - b.tx) < BAT.r + R - 3) ti = k; });
              if (ti >= 0 && !tipHits(s) && !s.stunned) { A.hit(s, ti, BAT.dmg, 'bats'); s.heading += 0.5 * (s.tips[0] && s.tips[0].x < b.tx ? -1 : 1); }
              else if (!tipHits(s)) A.nearMiss(s, b.tx, s.cy);
            }
          }
        });
        break;
      }
    }
  }
}

/** Collisions with the 15 mechanics (called after the sim's own collide). */
export function traps2Collide(s, dt, A) {
  const y = s.cy, R = A.tipR(s);
  for (const tr of s.traps) {
    if (!tr.t2) continue;
    switch (tr.kind) {
      case 'web': case 'spores': {
        if (tr.done) break;
        // a forked pair straddling the web tears it as it passes
        if (tr.kind === 'web' && s.tips.length === 2 && crossed(s, tr.y) && s.tips[0].x < tr.x && s.tips[1].x > tr.x) { tr.done = true; tr.torn = true; const b = A.addScore(s, 40 * s.mult); A.acorns(s, 3, tr.x, tr.y); A.emit(s, 'trapFoil', { trap: 'web', skin: tr.skin, how: 'torn', x: tr.x, y: tr.y, bonus: b }); break; }
        let inside = false; for (const t of s.tips) if ((t.x - tr.x) ** 2 + (y - tr.y) ** 2 < (tr.r + R - 4) ** 2) inside = true;
        if (!inside) break;
        tr.done = true;
        if (tr.kind === 'web') {
          if (s.tips.length === 2 || s.pu.rush > 0 || s.ride) { const b = A.addScore(s, 40 * s.mult); A.acorns(s, 3, tr.x, tr.y); tr.torn = true; A.emit(s, 'trapFoil', { trap: 'web', skin: tr.skin, how: 'torn', x: tr.x, y: tr.y, bonus: b }); }
          else { s.webT = WEB.slow; A.emit(s, 'trapHit', { trap: 'web', skin: tr.skin, src: 'web', effect: 'slow', dmg: 0, x: s.cx, y, sap: Math.round(s.sap) }); }
        } else if (s.pu.rush > 0 || s.ride) { const b = A.addScore(s, 20 * s.mult); A.emit(s, 'trapFoil', { trap: 'spores', skin: tr.skin, how: 'burnt', x: tr.x, y: tr.y, bonus: b }); }
        else { s.invertT = SPORE.invert; A.emit(s, 'trapHit', { trap: 'spores', skin: tr.skin, src: 'spores', effect: 'invert', dmg: 0, x: s.cx, y, sap: Math.round(s.sap) }); }
        break;
      }
      case 'pecker': case 'jaws': case 'seesaw': case 'strangle': case 'pendulum': {
        if (tr.passed || !crossed(s, tr.y)) break;
        tr.passed = true;
        const solids = rowSolids2(tr, tr.clock ?? 0);
        let hitAny = false;
        for (let ti = s.tips.length - 1; ti >= 0; ti--) {
          if (ti >= s.tips.length) continue;
          const x = s.tips[ti].x;
          for (const [a, b] of solids) if (x > a - R + 3 && x < b + R - 3) {
            const dmg = { pecker: PECKER.dmg, jaws: JAWS.dmg, seesaw: SEESAW.dmg, strangle: STRANGLE.dmg, pendulum: PEND.dmg }[tr.kind];
            A.hit(s, ti, dmg, tr.kind); hitAny = true;
            if (tr.kind === 'pendulum') s.heading += x < (a + b) / 2 ? -0.5 : 0.5;
            break;
          }
        }
        if (hitAny || tipHits(s)) break;
        const two = s.tips.length === 2;
        if (tr.kind === 'jaws' && two && s.tips[0].x < tr.c - JAWS.half && s.tips[1].x > tr.c + JAWS.half) { A.nearMiss(s, tr.c, tr.y); A.nearMiss(s, tr.c, tr.y); A.emit(s, 'straddle', { x: tr.c, y: tr.y, bonus: A.addScore(s, 40 * s.mult), trap: 'jaws' }); s.splits++; }
        else if (tr.kind === 'seesaw' && two && seesawState(tr).st === 'level') { A.emit(s, 'straddle', { x: W / 2, y: tr.y, bonus: A.addScore(s, 50 * s.mult), trap: 'seesaw' }); s.splits++; }
        else if (tr.kind === 'pendulum' && two && pendXs(tr).some((px) => s.tips[0].x < px && s.tips[1].x > px)) { A.emit(s, 'straddle', { x: W / 2, y: tr.y, bonus: A.addScore(s, 40 * s.mult), trap: 'pendulum' }); s.splits++; }
        else if (tr.kind === 'pecker') { const st = peckerState(tr); const u = ((tr.clock % tr.per) + tr.per) % tr.per; if ((st === 'idle' && u < 0.5) || st === 'warn') A.nearMiss(s, s.cx, tr.y); }
        else { let close = false; for (const t of s.tips) for (const [a, b] of solids) if (Math.min(Math.abs(t.x - a), Math.abs(t.x - b)) < R + 22) close = true; if (close) A.nearMiss(s, s.cx, tr.y); }
        break;
      }
      case 'hornets': {
        if (tr.scattered) break;
        const xs = hornetXs(tr);
        for (let ti = s.tips.length - 1; ti >= 0 && !tr.stung; ti--) {
          const x = s.tips[ti].x;
          for (let i = 0; i < xs.length; i++) { const dx = xs[i] - x, dy = hornetY(tr, i) - y; if (dx * dx + dy * dy < (HORNET.r + R - 2) ** 2) { if (!tipHits(s)) { tr.stung = true; A.hit(s, ti, HORNET.dmg, 'hornets'); s.heading += dx > 0 ? -0.6 : 0.6; } break; } }
        }
        if (!tr.passed && crossed(s, tr.y - 16)) { tr.passed = true; if (!tr.stung && !tipHits(s) && s.tips.some((t) => xs.some((hx) => Math.abs(hx - t.x) < 44))) A.nearMiss(s, s.cx, tr.y); }
        break;
      }
      case 'embers': {
        for (const e of tr.embers) {
          if (e.done || e.out) continue;
          const r = emberR(e, tr.clock);
          for (let ti = s.tips.length - 1; ti >= 0; ti--) {
            const t = s.tips[ti];
            if ((t.x - e.x) ** 2 + (y - e.y) ** 2 < (r + R - 3) ** 2) {
              e.done = true;
              if (s.bubble) { e.out = true; const b = A.addScore(s, 20 * s.mult); A.emit(s, 'trapFoil', { trap: 'embers', skin: tr.skin, how: 'doused', x: e.x, y: e.y, bonus: b }); }
              else if (!tipHits(s)) { s.burnT = EMBER.burn; A.emit(s, 'trapHit', { trap: 'embers', skin: tr.skin, src: 'embers', effect: 'burn', dmg: EMBER.burn * EMBER.burnRate, x: t.x, y, sap: Math.round(s.sap) }); s.hits++; s.burns = (s.burns || 0) + 1; }
              break;
            }
          }
        }
        break;
      }
      case 'candy': {
        if (y > tr.y0 || y < tr.y1) break;
        for (let ti = s.tips.length - 1; ti >= 0; ti--) {
          if (ti >= s.tips.length) continue;
          const x = s.tips[ti].x;
          if (Math.abs(Math.abs(x - tr.cx) - CANDY.half) < CANDY.wall + R - 3) { A.hit(s, ti, 22, 'candy'); break; }
        }
        break;
      }
      case 'vortex': {
        const two = s.tips.length === 2;
        for (let ti = s.tips.length - 1; ti >= 0; ti--) {
          const t = s.tips[ti];
          const d = Math.hypot(t.x - tr.x, y - tr.y);
          if (d < VORTEX.eye + R - 3) { A.hit(s, ti, VORTEX.dmg, 'vortex'); break; }
          tr.near = Math.min(tr.near, d);
        }
        if (!tr.passed && crossed(s, tr.y - VORTEX.R)) {
          tr.passed = true;
          if (tipHits(s)) break;
          if (two && s.tips[0].x < tr.x && s.tips[1].x > tr.x && Math.abs(s.cx - tr.x) < 60) { const b = A.addScore(s, 50 * s.mult); s.splits++; A.emit(s, 'straddle', { x: tr.x, y: tr.y, bonus: b, trap: 'vortex' }); }
          else if (tr.near < 75 && tr.near > VORTEX.eye + R) A.nearMiss(s, tr.x, tr.y);
        }
        break;
      }
      case 'beam': {
        if (tr.st !== 'on') break;
        if (y > tr.y0 + 2 || y < tr.y1 - 2) break;
        for (let ti = s.tips.length - 1; ti >= 0; ti--) {
          if (Math.abs(s.tips[ti].x - tr.x) < BEAM.hw + R - 3) { A.hit(s, ti, BEAM.dmg, 'beam'); break; }
        }
        if (!tr.passed && crossed(s, tr.y1)) {
          tr.passed = true;
          if (!tipHits(s) && s.tips.length === 2 && s.tips[0].x < tr.x && s.tips[1].x > tr.x) { const b = A.addScore(s, 40 * s.mult); s.splits++; A.emit(s, 'straddle', { x: tr.x, y: tr.y1, bonus: b, trap: 'beam' }); }
        }
        break;
      }
    }
  }
}

/** Stun / scatter everything a sonar ping (Cave Swiftlet) reaches. Returns how many it stunned. */
export function pingTraps(s, A, r) {
  let n = 0;
  for (const tr of s.traps) {
    if (tr.kind === 'hornets' && !tr.scattered && Math.abs(tr.y - s.cy) < r) { tr.scattered = true; n += HORNET.n; }
    if (tr.kind === 'bats' && Math.abs(tr.y - s.cy) < r + 200) for (const b of tr.bats) if (b.st !== 'gone') { b.st = 'gone'; n++; }
    if (tr.kind === 'cone' && tr.st === 'track') { tr.st = 'dropped'; n++; }
  }
  return n;
}
/** Destroy the next breakable trap within `reach` ahead (Stag snap, Horn Charge). Returns it or null. */
export function breakTrapAhead(s, reach) {
  let best = null;
  for (const tr of s.traps) {
    if (!tr.t2 || tr.broken) continue;
    const y = tr.y ?? tr.y0;
    if (y > s.cy + 20 || y < s.cy - reach) continue;
    if (!['web', 'pendulum', 'jaws', 'seesaw', 'strangle', 'pecker', 'candy', 'hornets', 'icicle'].includes(tr.kind)) continue;
    if (!best || y > (best.y ?? best.y0)) best = tr;
  }
  if (best) { best.broken = true; best.passed = true; best.done = true; best.scattered = true; best.st = 'done'; if (best.xs) for (const q of best.xs) q.done = true; }
  return best;
}

// ---------------------------------------------------------------- shapes (debug draw / placeholders)
/** Simple primitives describing what can hurt right now: rows, circles, columns. */
export function trapShapes2(s) {
  const out = [];
  for (const tr of s.traps) {
    if (!tr.t2 || tr.broken) continue;
    const k = tr.kind;
    if (k === 'web' || k === 'spores') { if (!tr.done) out.push({ t: 'circle', kind: k, x: tr.x, y: tr.y, r: tr.r, skin: tr.skin }); }
    else if (ROWS.has(k)) out.push({ t: 'row', kind: k, y: tr.y, solids: rowSolids2(tr, tr.clock ?? 0), skin: tr.skin, state: k === 'pecker' ? peckerState(tr) : k === 'jaws' ? jawsState(tr) : k === 'seesaw' ? seesawState(tr).st : '' });
    else if (k === 'hornets' && !tr.scattered) hornetXs(tr).forEach((x, i) => out.push({ t: 'circle', kind: k, x, y: hornetY(tr, i), r: HORNET.r, skin: tr.skin }));
    else if (k === 'embers') for (const e of tr.embers) { if (!e.done) out.push({ t: 'circle', kind: k, x: e.x, y: e.y, r: emberR(e, tr.clock), skin: tr.skin, pulse: emberPulse(e, tr.clock) }); }
    else if (k === 'icicle') for (const q of tr.xs) { if (!q.done) out.push({ t: 'col', kind: k, x: q.x, y0: q.fy ?? tr.y, y1: (q.fy ?? tr.y) - 40, hw: ICICLE.hw, skin: tr.skin, state: tr.st }); }
    else if (k === 'candy') out.push({ t: 'box', kind: k, x0: tr.cx - CANDY.half, x1: tr.cx + CANDY.half, y0: tr.y0, y1: tr.y1, skin: tr.skin, state: tr.st, left: tr.t });
    else if (k === 'vortex') out.push({ t: 'circle', kind: k, x: tr.x, y: tr.y, r: VORTEX.eye, ring: VORTEX.R, skin: tr.skin });
    else if (k === 'beam') out.push({ t: 'col', kind: k, x: tr.x, y0: tr.y0, y1: tr.y1, hw: BEAM.hw, skin: tr.skin, state: tr.st });
    else if (k === 'cone' && tr.st === 'track') out.push({ t: 'circle', kind: k, x: tr.x, y: s.cy, r: CONE.r, skin: tr.skin, state: tr.t > CONE.lock ? 'track' : 'lock' });
    else if (k === 'bats') for (const b of tr.bats) if (b.st === 'glow' || b.st === 'swoop') out.push({ t: 'circle', kind: k, x: b.tx ?? b.x, y: s.cy, r: BAT.r, skin: tr.skin, state: b.st });
  }
  return out;
}

// ---------------------------------------------------------------- bot
/**
 * Penalty for having a tip at lateral x when the tip reaches each trap ahead.
 * sk: skill (weak bots predict timed traps late and look less far ahead).
 */
export function botPenalty2(s, x, sk, look) {
  let pen = 0;
  const y = s.cy, spd = Math.max(80, s.speed), R = TIP_R + 8 + (1 - sk) * 4;
  for (const tr of s.traps) {
    if (!tr.t2 || tr.broken) continue;
    const ty = tr.y ?? tr.y0;
    switch (tr.kind) {
      case 'web': case 'spores': if (!tr.done && ty < y + tr.r && ty > y - look) { if (Math.abs(x - tr.x) < tr.r + R) pen += tr.kind === 'spores' ? 900 : 500; } break;
      case 'vortex': if (ty < y + VORTEX.R && ty > y - look) { const d = Math.abs(x - tr.x); if (d < VORTEX.eye + R + 30) pen += 1400; else if (d < VORTEX.R * 0.6) pen += 150; } break;
      case 'pecker': case 'jaws': case 'seesaw': case 'strangle': case 'pendulum': {
        if (tr.passed || ty > y || ty < y - look) break;
        const ta = (y - ty) / spd, c = (tr.clock ?? 0) + (sk > 0.4 ? ta : ta * 0.3);
        let solids;
        if (tr.kind === 'strangle') solids = [[0, tr.c - STRANGLE.gap], [tr.c + STRANGLE.gap, W]];
        else solids = rowSolids2(tr, c);
        for (const [a, b] of solids) if (x > a - R && x < b + R) { pen += 1200 * (1 + Math.max(0, 1 - ta)); break; }
        break;
      }
      case 'hornets': {
        if (tr.scattered || tr.passed || ty > y + 20 || ty < y - look) break;
        const ta = (y - ty) / spd, xs = hornetXs(tr, tr.clock + (sk > 0.5 ? ta : 0));
        for (const hx of xs) if (Math.abs(hx - x) < HORNET.r + R + 6 + sk * 16) { pen += 900; break; }
        break;
      }
      case 'embers': for (const e of tr.embers) { if (e.done || e.y > y + 40 || e.y < y - look) continue; if (Math.abs(e.x - x) < EMBER.flareR + R + 4) pen += 600; } break;
      case 'icicle': if (tr.st !== 'done' && ty < y + 60 && ty > y - look) for (const q of tr.xs) if (!q.done && Math.abs(q.x - x) < ICICLE.hw + R + 6) pen += 800; break;
      case 'candy': if (ty < y + 10 && tr.y1 > y - look && tr.st !== 'escaped') { const d = Math.abs(Math.abs(x - tr.cx) - CANDY.half); if (d < CANDY.wall + R + 4) pen += 1500; if (sk < 0.5 && Math.abs(x - tr.cx) < CANDY.half) pen -= 60; } break;
      case 'beam': if (tr.st !== 'done' && tr.y1 < y && tr.y0 > y - look) { const ta = Math.max(0, (y - tr.y0) / spd); let bx = tr.x + tr.dir * BEAM.v * (sk > 0.5 ? ta : 0); if (Math.abs(bx - x) < BEAM.hw + R + 10) pen += 1100; } break;
      case 'cone': if (tr.st === 'track' && tr.t < CONE.lock + (sk - 0.5) * 0.4 && Math.abs(x - tr.x) < CONE.r + R + 8) pen += 1300; break;
      case 'bats': for (const b of tr.bats) if (b.st === 'glow' && b.t > BAT.glow * (1 - sk) * 0.8 && Math.abs(x - (b.tx ?? s.cx)) < BAT.r + R + 6) pen += 700; break;
    }
  }
  return pen;
}
/** Any row trap that a forked pair cannot pass close ahead (the bot merges first). */
export function botMerge2(s, dist) {
  for (const tr of s.traps) if ((tr.kind === 'strangle' || tr.kind === 'seesaw' || tr.kind === 'candy' || tr.kind === 'pecker') && !tr.passed && (tr.y ?? tr.y0) < s.cy && (tr.y ?? tr.y0) > s.cy - dist) return true;
  return false;
}
/** Any trap of the 15 within `dist` ahead (bots look harder when one is near). */
export const anyTrap2Ahead = (s, dist) => s.traps.some((tr) => tr.t2 && !tr.broken && (((tr.y ?? tr.y0) < s.cy + 60 && (tr.y ?? tr.y0) > s.cy - dist) || (tr.kind === 'cone' && tr.st === 'track') || (tr.kind === 'bats' && tr.on && tr.bats.some((b) => b.st === 'glow'))));
