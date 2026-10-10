// Forkwood pass 6: ten traps. Pure and deterministic like sim.js (no DOM, no
// Math.random). sim.js hands every gen() an api object with its spawning
// primitives, so this module never imports sim.js (no import cycle).
//
// Every trap is telegraphed at least WARN_MIN seconds before it can hurt:
// static traps (twig, sap, lure, hedge) are drawn the whole time they are on
// screen; timed traps (pulse thorns, trapdoor, gust, crow) have an explicit
// warning phase of >= 0.8 s. The first time a trap appears in a run it comes
// in a gentle "intro" version on its own, with a hint label.
// Shipped: twig, pulse, door, gust, sap, lure, twins, tide, crow (mist dropped).
import { clamp } from './rng.js';

const W = 560, TIP_R = 9, FORK_SPREAD = 78;
export const WARN_MIN = 0.8;

export const TRAPS = {
  twig:  { name: 'CRACKED TWIG',  hint: 'keep moving · it snaps if you linger' },
  pulse: { name: 'PULSE THORNS',  hint: 'thorns breathe in and out · take the open lane' },
  door:  { name: 'TRAPDOOR GATE', hint: 'the door swings on the beat · the side gap never shuts' },
  gust:  { name: 'CROSSWIND',     hint: 'leaf streaks warn of a gust · lean into it' },
  sap:   { name: 'SAP DRAIN',     hint: 'withered bark drinks your sap · go round' },
  lure:  { name: 'GOLDEN LURE',   hint: 'too-easy sunlight leads into a thorn pocket' },
  twins: { name: 'TWIN BEETLES',  hint: 'fork around them · or squeeze past one side' },
  tide:  { name: 'RISING THORNS', hint: 'keep climbing · they rise from below' },
  crow:  { name: 'CROW',          hint: 'merge before it swoops or it steals your staged sunlight' },
};

// Timings (seconds). Fairness tests read these.
export const TWIG_SNAP = 0.6;
export const PULSE = { out: 0.4, warn: 0.2, minPeriod: 4.0 };   // fractions of the period
export const DOOR = { open: 0.45, warn: 0.25, period: 3.4 };      // warn 0.85 s
export const GUST = { calm: 1.2, warn: 1.0, gust: 1.6 };
export const CROW_WARN = 1.2;
export const TIDE_K = 0.78;       // the tide rises at this fraction of your speed
// Mist (trap 8) was dropped: at 360x640 a clear radius that still gives 0.8 s of
// sight at top speed (~240 world units) clears almost the whole 560-wide field,
// so the mist either does nothing or hides hazards unfairly.

const rnd = (s) => s.rng();

/** First appearance of a trap kind this run? Marks it seen and drops a hint label. */
function intro(s, id, y) {
  if (s.trapSeen[id]) return false;
  s.trapSeen[id] = true;
  s.traps.push({ kind: 'label', id, y, shown: false });
  return true;
}
const seen = (s, id) => !!s.trapSeen[id];

// ---------------------------------------------------------------- spawners
function addTwig(s, x, yb, w = 120, h = 300) {
  x = clamp(x, w / 2 + 6, W - w / 2 - 6);
  s.traps.push({ kind: 'twig', x0: x - w / 2, x1: x + w / 2, y0: yb, y1: yb - h, t: 0, peak: 0, snapped: false, was: false });
  return x;
}
function addSap(s, x, yb, w = 150, h = 300) {
  x = clamp(x, w / 2 + 6, W - w / 2 - 6);
  s.traps.push({ kind: 'sap', x0: x - w / 2, x1: x + w / 2, y0: yb, y1: yb - h, on: false });
  return x;
}
function addPulse(s, y, period, nSeg = 4) {
  const sw = W / nSeg, segs = [];
  const flip = rnd(s) < 0.5 ? 1 : 0;
  for (let i = 0; i < nSeg; i++) segs.push([i * sw, (i + 1) * sw, (i + flip) % 2]);
  s.traps.push({ kind: 'pulse', y, segs, period: Math.max(PULSE.minPeriod, period), clock: rnd(s) * 4, passed: false });
}
/** Pulse segment state at clock c: 'out' (hurts) | 'warn' (passable, growing) | 'in'. */
export function pulseState(tr, group, c) {
  const u = (((c / tr.period) + group * 0.5) % 1 + 1) % 1;
  if (u < PULSE.out) return 'out';
  if (u >= 1 - PULSE.warn) return 'warn';
  return 'in';
}
function addDoor(s, y, doorCx, doorW, sqCx, sqW) {
  s.traps.push({ kind: 'door', y, door: [doorCx - doorW / 2, doorCx + doorW / 2], sq: [sqCx - sqW / 2, sqCx + sqW / 2], period: DOOR.period, clock: rnd(s) * DOOR.period, passed: false });
}
export function doorState(tr, c) {
  const u = ((c / tr.period) % 1 + 1) % 1;
  return u < DOOR.open ? 'open' : u < DOOR.open + DOOR.warn ? 'warn' : 'shut';
}
/** Solid spans of a timed row at clock c. */
export function rowSolids(tr, c) {
  if (tr.kind === 'pulse') return tr.segs.filter((g) => pulseState(tr, g[2], c) === 'out').map((g) => [g[0], g[1]]);
  if (tr.kind === 'door') {
    const gaps = [tr.sq]; if (doorState(tr, c) !== 'shut') gaps.push(tr.door);
    gaps.sort((a, b) => a[0] - b[0]);
    const out = []; let x = 0;
    for (const [a, b] of gaps) { if (a > x) out.push([x, a]); x = Math.max(x, b); }
    if (x < W) out.push([x, W]);
    return out;
  }
  if (tr.kind === 'cap') return [[tr.x0, tr.x1]];
  return [];
}
function addGust(s, yb, h, dir, force) {
  const per = GUST.calm + GUST.warn + GUST.gust;
  s.traps.push({ kind: 'gust', y0: yb, y1: yb - h, dir, force, clock: rnd(s) * per, per });
  // a thorn hedge along the downwind edge
  const hw = 46;
  s.traps.push({ kind: 'hedge', x0: dir > 0 ? W - hw : 0, x1: dir > 0 ? W : hw, y0: yb - 20, y1: yb - h + 20, side: dir });
}
export function gustState(tr, c = tr.clock) {
  const u = ((c % tr.per) + tr.per) % tr.per;
  if (u < GUST.calm) return { st: 'calm', k: 0 };
  if (u < GUST.calm + GUST.warn) return { st: 'warn', k: 0, left: GUST.calm + GUST.warn - u };
  return { st: 'gust', k: Math.sin(Math.PI * (u - GUST.calm - GUST.warn) / GUST.gust) };
}
function addLure(s, A, yb, side, d) {
  // a pocket along one edge: a thorn wall and a thorn cap. Golden sunlight leads in.
  const px = 170, hw = 16, wallBot = yb - 200, capY = yb - 470;
  const wx = side < 0 ? px : W - px;
  s.traps.push({ kind: 'wall', x0: wx - hw, x1: wx + hw, y0: wallBot, y1: capY, lure: true });
  s.traps.push({ kind: 'cap', y: capY, x0: side < 0 ? 0 : wx - hw, x1: side < 0 ? wx + hw : W, side, wx, passed: false });
  const trail = A.newTrail(s, 7);
  const offs = [60, 20, -30, -70, -85, -90, -90];
  for (let i = 0; i < 7; i++) {
    const x = wx - side * offs[i];
    s.motes.push({ x: clamp(x, 30, W - 30), y: yb - 40 - i * 64, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false, trail, lure: true });
  }
  // the honest way: a thinner trail out in the open
  A.addTrail(s, yb - 120, { n: 4, cx: side < 0 ? W - 150 : 150, amp: 40 });
  return wx;
}
function addTwins(s, A, y, c) {
  c = clamp(A.reachableX(s, y, clamp(c, 150, W - 150)), 150, W - 150); // reachable from the last thorn row
  A.addGate(s, y, c, 240, false);
  s.traps.push({ kind: 'twins', x: c, y, r: 14, clock: rnd(s) * 6, w: 2.2, passed: false });
  return c;
}
export function twinsXs(tr, c = tr.clock) {
  const o = 16 + 12 * (0.5 + 0.5 * Math.sin(c * tr.w));
  return [tr.x - o, tr.x + o];
}
function addTide(s, yb, h) { s.traps.push({ kind: 'tide', y0: yb, y1: yb - h, top: null, v: 0, done: false }); }
function addCrow(s, y, side) { s.traps.push({ kind: 'crow', y, side, st: 'perch', t: 0 }); }

// ---------------------------------------------------------------- chunks
// gen(s, y, d, api) -> length. Tiers match sim.js: 1-2 singles, 3 combos.
const reach = (A, s, y, x) => A.reachableX(s, y, x);
export const TRAP_CHUNKS = [
  { id: 'twig', trap: 'twig', tier: 1, minM: 25, w: 1.2, gen(s, y, d, A) {
    if (intro(s, 'twig', y + 40)) {
      const x = addTwig(s, W / 2 + (rnd(s) - 0.5) * 120, y - 140);
      A.addTrail(s, y - 60, { n: 5, cx: x < W / 2 ? x + 170 : x - 170, amp: 30 });
      s.lastGate = null; return 520;
    }
    const a = 110 + rnd(s) * 120, b = W - 110 - rnd(s) * 120;
    addTwig(s, a, y - 100, 120 + d * 20); addTwig(s, b, y - 300, 120 + d * 20);
    A.addTrail(s, y - 40, { n: 6, cx: W / 2, amp: 50 });
    s.lastGate = null; return 640;
  } },
  { id: 'sapzone', trap: 'sap', tier: 1, minM: 40, w: 1, gen(s, y, d, A) {
    const first = intro(s, 'sap', y + 40);
    const x = addSap(s, 120 + rnd(s) * (W - 240), y - 120, first ? 130 : 150 + d * 40, first ? 260 : 320);
    for (let i = 0; i < 3; i++) s.motes.push({ x, y: y - 170 - i * 90, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false });
    A.addTrail(s, y - 80, { n: 4, cx: x < W / 2 ? x + 200 : x - 200, amp: 30 });
    s.lastGate = null; return 520;
  } },
  { id: 'pulse', trap: 'pulse', tier: 1, minM: 60, w: 1.1, gen(s, y, d, A) {
    if (intro(s, 'pulse', y + 40)) { addPulse(s, y - 240, 4.8); A.addTrail(s, y - 40, { n: 3, cx: W / 2, amp: 20 }); s.lastGate = null; return 500; }
    addPulse(s, y - 200, 4.6 - d * 0.5);
    A.addTrail(s, y - 40, { n: 3 });
    if (d > 0.55) { addPulse(s, y - 540, 4.4 - d * 0.3); s.lastGate = null; return 800; }
    s.lastGate = null; return 480;
  } },
  { id: 'twins', trap: 'twins', tier: 1, minM: 70, w: 1, gen(s, y, d, A) {
    const first = intro(s, 'twins', y + 40);
    const c = addTwins(s, A, y - 240, reach(A, s, y - 240, 150 + rnd(s) * (W - 300)));
    A.addTwinTrail(s, y - 60, c, first ? 3 : 4);
    return 520;
  } },
  { id: 'crow', trap: 'crow', tier: 1, minM: 90, w: 0.9, gen(s, y, d, A) {
    intro(s, 'crow', y + 40);
    const c = 150 + rnd(s) * (W - 300);
    A.addTwinTrail(s, y - 20, c, 4);
    addCrow(s, y - 230, rnd(s) < 0.5 ? -1 : 1);
    A.addTrail(s, y - 330, { n: 3, cx: c, amp: 20 });
    s.lastGate = null; return 500;
  } },
  { id: 'lure', trap: 'lure', tier: 1, minM: 80, w: 1, gen(s, y, d, A) {
    intro(s, 'lure', y + 40);
    addLure(s, A, y, rnd(s) < 0.5 ? -1 : 1, d);
    s.lastGate = null; return 620;
  } },
  { id: 'gust', trap: 'gust', tier: 2, minM: 100, sig: 'Canopy', w: 1.1, gen(s, y, d, A) {
    const first = intro(s, 'gust', y + 40);
    const dir = rnd(s) < 0.5 ? -1 : 1;
    addGust(s, y - 60, 420, dir, first ? 95 : 110 + 30 * Math.min(1, d));
    A.addTrail(s, y - 80, { n: 5, cx: dir > 0 ? W * 0.4 : W * 0.6, amp: 50 });
    s.lastGate = null; return 540;
  } },
  { id: 'door', trap: 'door', tier: 2, minM: 120, w: 1.1, gen(s, y, d, A) {
    intro(s, 'door', y + 40);
    const dc = reach(A, s, y - 220, 170 + rnd(s) * (W - 340));
    const sqc = dc < W / 2 ? W - 70 : 70;
    addDoor(s, y - 220, dc, 170, sqc, 2 * TIP_R + 68);
    for (let i = 0; i < 3; i++) s.motes.push({ x: dc, y: y - 100 - i * 70 + 70, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false });
    s.lastGate = null; return 500;
  } },
  { id: 'tide', trap: 'tide', tier: 2, minM: 150, w: 0.9, gen(s, y, d, A) {
    intro(s, 'tide', y + 40);
    addTide(s, y - 40, 820);
    A.addTrail(s, y - 80, { n: 6, amp: 160 + rnd(s) * 120 });
    A.addTrail(s, y - 480, { n: 6, amp: 160 + rnd(s) * 120 });
    s.lastGate = null; return 880;
  } },
  // ---- combos (after ~45 s): two trap ideas at once
  { id: 'pulsegust', trap: 'pulse+gust', needs: ['pulse', 'gust'], tier: 3, minM: 260, w: 1, gen(s, y, d, A) {
    const dir = rnd(s) < 0.5 ? -1 : 1;
    addGust(s, y - 40, 520, dir, 105 + 20 * Math.min(1, d));
    addPulse(s, y - 300, 4.6);
    A.addTrail(s, y - 60, { n: 3, cx: W / 2, amp: 30 });
    s.lastGate = null; return 640;
  } },
  { id: 'lurecrow', trap: 'lure+crow', needs: ['lure', 'crow'], tier: 3, minM: 260, w: 1, gen(s, y, d, A) {
    const side = rnd(s) < 0.5 ? -1 : 1, c = side < 0 ? W - 200 : 200;
    A.addTwinTrail(s, y - 20, c, 3);
    addCrow(s, y - 200, -side);
    addLure(s, A, y - 300, side, d);
    s.lastGate = null; return 920;
  } },
  { id: 'tidetwig', trap: 'tide+twig', needs: ['tide', 'twig'], tier: 3, minM: 280, w: 1, gen(s, y, d, A) {
    addTide(s, y - 40, 760);
    const a = 120 + rnd(s) * 100;
    addTwig(s, a, y - 160); addTwig(s, W - a, y - 470);
    A.addTrail(s, y - 80, { n: 5, cx: W / 2, amp: 140 });
    s.lastGate = null; return 820;
  } },
  { id: 'doorbeetle', trap: 'door+beetle', needs: ['door'], tier: 3, minM: 300, w: 1, gen(s, y, d, A) {
    A.addBeetle(s, W / 2, y - 80, 55 + d * 30);
    const dc = 170 + rnd(s) * (W - 340), sqc = dc < W / 2 ? W - 70 : 70;
    addDoor(s, y - 320, dc, 170, sqc, 2 * TIP_R + 68);
    for (let i = 0; i < 2; i++) s.motes.push({ x: dc, y: y - 240 - i * 60, kind: 'sun', r: 11, ph: rnd(s) * 6.28, taken: false });
    s.lastGate = null; return 600;
  } },
  { id: 'twinsap', trap: 'twins+sap', needs: ['twins', 'sap'], tier: 3, minM: 300, w: 1, gen(s, y, d, A) {
    const c = 170 + rnd(s) * (W - 340);
    const tx = addTwins(s, A, y - 330, c);
    addSap(s, tx < W / 2 ? tx + 190 : tx - 190, y - 20, 140, 240);
    A.addTwinTrail(s, y - 40, tx, 3);
    return 760;
  } },
];
/** Combos fall back to the intro of a trap the player has not met yet. */
export function trapChunkFor(s, c) {
  if (!c.needs) return c;
  const miss = c.needs.find((id) => !seen(s, id));
  return miss ? TRAP_CHUNKS.find((k) => k.trap === miss) : c;
}

// ---------------------------------------------------------------- per-step
/** Wind added by gust bands at the tip's height. */
export function trapWind(s) {
  let w = 0;
  for (const tr of s.traps) {
    if (tr.kind !== 'gust' || !(s.cy < tr.y0 && s.cy > tr.y1)) continue;
    const g = gustState(tr);
    const edge = Math.min(1, (tr.y0 - s.cy) / 60, (s.cy - tr.y1) / 60);
    w += tr.dir * tr.force * g.k * edge;
  }
  return w;
}

/** Advance trap clocks and the effects that are not collisions. slow: Stillness factor. */
export function trapsUpdate(s, dt, slow, A) {
  const tdt = dt * slow;
  for (const tr of s.traps) {
    if (tr.clock != null) tr.clock += tdt;
    if (tr.kind === 'label' && !tr.shown && s.cy < tr.y + 760) {
      tr.shown = true; A.emit(s, 'trapintro', { id: tr.id, name: TRAPS[tr.id].name, hint: TRAPS[tr.id].hint, y: tr.y });
    } else if (tr.kind === 'tide') {
      if (!tr.done && tr.top == null && s.cy < tr.y0 - 30) { tr.top = s.cy + 320; tr.v = TIDE_K * Math.max(150, s.speed); A.emit(s, 'tide', {}); }
      if (tr.top != null) {
        if (s.cy < tr.y1) tr.done = true;
        tr.top += tr.done ? 420 * dt : -tr.v * tdt;
        if (!tr.done && tr.top - s.cy < 3) { A.hit(s, 0, 20, 'tide'); tr.top = s.cy + 220; }
        if (!tr.done) { const gap = tr.top - s.cy; if (gap < 70 && !tr.close) tr.close = true; if (gap > 140 && tr.close) { tr.close = false; A.nearMiss(s, s.cx, s.cy + 40); } }
      }
    } else if (tr.kind === 'crow') {
      if (tr.st === 'perch' && s.cy < tr.y) {
        const staged = s.tips.reduce((a, t) => a + (t.staged || 0), 0);
        if (s.tips.length === 2 && staged > 0) { tr.st = 'warn'; tr.t = CROW_WARN; tr.x = s.cx; A.emit(s, 'crow', { x: s.cx, y: s.cy }); }
        else { tr.st = 'gone'; tr.t = 0; }
      } else if (tr.st === 'warn') {
        tr.t -= tdt; tr.x = s.cx; tr.yy = s.cy;
        if (s.tips.length === 1) {
          tr.st = 'foiled'; const bonus = A.addScore(s, 30 * s.mult); A.emit(s, 'crowfoil', { x: s.cx, y: s.cy, bonus });
        } else if (tr.t <= 0) {
          let lost = 0; for (const t of s.tips) { lost += t.staged; t.staged = 0; }
          s.commits -= lost; s.crowSteals = (s.crowSteals || 0) + 1;
          tr.st = 'stole'; A.emit(s, 'crowsteal', { x: s.cx, y: s.cy, lost });
        }
      } else if (tr.st !== 'perch') tr.t += dt;
    } else if (tr.kind === 'sap') {
      tr.on = false;
      for (const t of s.tips) if (t.x > tr.x0 && t.x < tr.x1 && s.cy < tr.y0 && s.cy > tr.y1) tr.on = true;
      if (tr.on && !s.demo && !(s.pu.rush > 0)) s.sap -= 22 * dt * (s.R.drain || 1);
    }
  }
}

/** Collisions with traps (called after the sim's own collide). */
export function trapsCollide(s, dt, A) {
  const y = s.cy, py = s.prevCy, R = A.tipR(s);
  for (const tr of s.traps) {
    if (tr.kind === 'pulse' || tr.kind === 'door' || tr.kind === 'cap') {
      if (tr.passed || !(tr.y >= y && tr.y < py)) continue;
      tr.passed = true;
      const solids = rowSolids(tr, tr.clock ?? 0);
      let hitAny = false;
      for (let ti = s.tips.length - 1; ti >= 0; ti--) {
        if (ti >= s.tips.length) continue;
        const x = s.tips[ti].x;
        for (const [a, b] of solids) if (x > a - R + 3 && x < b + R - 3) { A.hit(s, ti, tr.kind === 'cap' ? 22 : 26, tr.kind); hitAny = true; break; }
      }
      if (!hitAny && s.invuln <= 0 && tr.kind !== 'cap') {
        let close = false;
        for (const t of s.tips) for (const [a, b] of solids) if (Math.min(Math.abs(t.x - a), Math.abs(t.x - b)) < R + 22) close = true;
        if (close) A.nearMiss(s, s.cx, tr.y);
      }
    } else if (tr.kind === 'wall' || tr.kind === 'hedge') {
      if (y > tr.y0 || y < tr.y1) continue;
      for (let ti = s.tips.length - 1; ti >= 0; ti--) {
        if (ti >= s.tips.length) continue;
        const x = s.tips[ti].x;
        if (x > tr.x0 - R + 3 && x < tr.x1 + R - 3) { A.hit(s, ti, 22, tr.kind); break; }
      }
    } else if (tr.kind === 'twins') {
      const xs = twinsXs(tr);
      if (Math.abs(tr.y - y) < 30) {
        for (let ti = s.tips.length - 1; ti >= 0; ti--) {
          if (ti >= s.tips.length) continue;
          const x = s.tips[ti].x;
          for (const bx of xs) { const dx = bx - x, dy = tr.y - y, rr = tr.r + R - 3; if (dx * dx + dy * dy < rr * rr) { A.hit(s, ti, 24, 'beetle'); break; } }
        }
      }
      if (!tr.passed && tr.y >= y && tr.y < py) {
        tr.passed = true;
        if (s.tips.length === 2 && s.tips[0].x < xs[0] && s.tips[1].x > xs[1] && s.invuln <= 0) {
          const bonus = A.addScore(s, 40 * s.mult); s.splits++; A.emit(s, 'straddle', { x: tr.x, y: tr.y, bonus });
        }
      }
    } else if (tr.kind === 'twig') {
      if (tr.snapped) continue;
      let inside = -1;
      for (let ti = 0; ti < s.tips.length; ti++) { const x = s.tips[ti].x; if (x > tr.x0 && x < tr.x1 && y < tr.y0 && y > tr.y1) inside = ti; }
      if (inside >= 0) {
        tr.t += dt; tr.peak = Math.max(tr.peak, tr.t); tr.was = true;
        if (tr.t > TWIG_SNAP) { tr.snapped = true; tr.snapT = s.t; A.emit(s, 'snap', { x: s.tips[inside].x, y }); A.hit(s, inside, 18, 'twig'); }
      } else {
        if (tr.was && tr.peak > 0.3 && s.invuln <= 0) A.nearMiss(s, s.cx, y);
        tr.was = false; tr.peak = 0; tr.t = Math.max(0, tr.t - dt * 2);
      }
    }
  }
}

/** Cull traps far below the camera. */
export function trapsCull(s, cull) {
  s.traps = s.traps.filter((tr) => {
    const top = tr.y1 ?? tr.y;
    if (tr.kind === 'tide') return !(tr.done && tr.top != null && tr.top > s.cy + 1200) && (tr.y1 < cull);
    return top < cull;
  });
}

// ---------------------------------------------------------------- bot helper
/** Steering for traps (used by src/bot.js). Returns { aim, toggle, merge }. */
export function trapBot(bot, s, aim, sk, r) {
  const y = s.cy, forked = s.tips.length === 2, sp = forked ? Math.max(s.spread, FORK_SPREAD * 0.8) : 0;
  const look = 260 + sk * 240;
  const out = { aim, merge: false };
  const spd = Math.max(80, s.speed);
  // timed rows: pick the lane that will be open when we get there
  let row = null;
  for (const tr of s.traps) if ((tr.kind === 'pulse' || tr.kind === 'door') && !tr.passed && tr.y < y && tr.y > y - look && (!row || tr.y > row.y)) row = tr;
  if (row) {
    out.merge = true;
    const ta = (y - row.y) / spd;
    const c = sk > 0.4 ? row.clock + ta : row.clock + ta * (sk / 0.4) * 0.5; // weak bots read the beat late
    const solids = rowSolids(row, c);
    // free intervals
    const free = []; let x = 0;
    for (const [a, b] of solids.slice().sort((p, q) => p[0] - q[0])) { if (a > x) free.push([x, a]); x = Math.max(x, b); }
    if (x < W) free.push([x, W]);
    let best = out.aim, bd = 1e9;
    for (const [a, b] of free) {
      if (b - a < 2 * TIP_R + 14) continue;
      const cx = clamp(s.cx, a + TIP_R + 10, b - TIP_R - 10), dd = Math.abs(cx - s.cx);
      if (dd < bd) { bd = dd; best = (a + b) / 2 * 0.4 + cx * 0.6; }
    }
    out.aim = best;
  }
  // twin beetles: fork around them, or take one side lane
  for (const tr of s.traps) {
    if (tr.kind !== 'twins' || tr.passed || tr.y > y || tr.y < y - look) continue;
    out.aim = forked ? tr.x : tr.x + (s.cx >= tr.x ? 1 : -1) * 84;
  }
  // golden lure: stay out of the pocket (weak bots notice late)
  for (const tr of s.traps) {
    if (tr.kind !== 'cap' || tr.passed) continue;
    const wallBot = tr.y + 270;
    const notice = sk >= 0.45 ? look + 200 : 120 + sk * 200;
    if (y < wallBot - 10 || wallBot < y - notice) continue;
    const safe = tr.side < 0 ? tr.wx + 16 + TIP_R + 26 + sp : tr.wx - 16 - TIP_R - 26 - sp;
    if (tr.side < 0) out.aim = Math.max(out.aim, safe); else out.aim = Math.min(out.aim, safe);
  }
  // twig and sap zones ahead: steer around them
  for (const tr of s.traps) {
    if ((tr.kind !== 'twig' && tr.kind !== 'sap') || tr.snapped) continue;
    if (tr.y1 > y || tr.y0 < y - (180 + sk * 200)) continue;
    const m = TIP_R + 10 + sp;
    if (out.aim > tr.x0 - m && out.aim < tr.x1 + m) {
      const l = tr.x0 - m, rr = tr.x1 + m;
      const goL = l > 20 && (rr > W - 20 || Math.abs(s.cx - l) < Math.abs(s.cx - rr));
      out.aim = goL ? l - 6 : rr + 6;
    }
  }
  // hedge: keep off the downwind edge
  for (const tr of s.traps) {
    if (tr.kind !== 'hedge' || tr.y1 > y || tr.y0 < y - 200) continue;
    if (tr.side > 0) out.aim = Math.min(out.aim, tr.x0 - TIP_R - 34 - sp); else out.aim = Math.max(out.aim, tr.x1 + TIP_R + 34 + sp);
  }
  // crow: merge before it swoops
  for (const tr of s.traps) if (tr.kind === 'crow' && tr.st === 'warn' && forked && CROW_WARN - tr.t > 0.5 - sk * 0.4) out.merge = true;
  return out;
}
