// Forkwood simulation: pure, deterministic, no DOM. Shared by the browser game
// and the headless auto-playtest bot (tests/balance.mjs).
import { mulberry32, clamp, treeHash } from './rng.js';

export const W = 560;            // playfield width in world units
export const PX_PER_M = 30;      // world units per metre of height
export const TIP_R = 9;          // collision radius of a growing tip
export const FORK_SPREAD = 78;   // half-distance between the two tips when forked
export const SAP_MAX = 100;
export const MAX_MULT = 8;
export const GOLDEN_SEC = 6;     // golden hour length (s), triggered by a merge that reaches MAX_MULT
export const BLOOM_MIN = 4;      // a trail needs at least this many sunlights to bloom

// Charms: one optional ability per run, charged by scoring merges and fired with
// a second button (E / Shift / the charm badge). Never active on the daily tree
// or on challenge links ("pure" runs), so those stay identical for everyone.
// Each one has a price: it needs merges to charge, and Deep Roots costs combo.
export const CHARMS = {
  ward:  { name: 'Bark Ward',  charge: 4, dur: 0,   blurb: 'Grow a bark shield that blocks the next hit.' },
  sun:   { name: 'Sun Call',   charge: 4, dur: 4,   blurb: 'For 4 s nearby sunlight drifts to your tips.' },
  roots: { name: 'Deep Roots', charge: 4, dur: 0,   blurb: '+25 sap at once, but your combo drops by 2.' },
  still: { name: 'Stillness',  charge: 3, dur: 4,   blurb: 'For 4 s beetles, frost and wind slow to a crawl and sap drains slower.' },
};

// Balance knobs (tuned with tests/balance.mjs).
export const TUNE = {
  drain0: 4.6,      // sap drain per second at ground level
  drainK: 5.8,      // extra drain per second per 600 m climbed
  forkDrain: 1.4,   // drain multiplier while two tips grow
  moteSap0: 7.0,    // sap from one sunlight mote at ground level
  moteSapMin: 4.0,  // sap from one mote high up
  hazardK: 1.5,     // hazard density multiplier
};

export const STAGES = [
  { m: 0, name: 'Twig', sky: '#ffcf9f', haze: '#fff1de', leaf: '#86d66b' },
  { m: 40, name: 'Sapling', sky: '#bfe6f2', haze: '#eefaff', leaf: '#5cc65c' },
  { m: 120, name: 'Bough', sky: '#86c8ee', haze: '#d9f1ff', leaf: '#3cae56' },
  { m: 240, name: 'Canopy', sky: '#f3a76a', haze: '#ffe0b8', leaf: '#eaa13a' },
  { m: 400, name: 'Treetop', sky: '#b4689c', haze: '#f3c4dc', leaf: '#f59ac0' },
  { m: 600, name: 'Cloudline', sky: '#3b3f7c', haze: '#8e8fc8', leaf: '#a6dcff' },
  { m: 850, name: 'Starlight', sky: '#0e1132', haze: '#2c2f66', leaf: '#eaf2ff' },
];

// Sky colour keyframes by height (m). Extra stops keep transitions vivid
// instead of passing through grey when hues are far apart.
export const SKY_STOPS = [
  [0, '#ffc98a'], [18, '#ffb3a7'], [40, '#bfe2fb'], [120, '#86c8f2'], [200, '#7fc4ee'],
  [222, '#ffe1a6'], [260, '#ffb46e'], [330, '#ff8f7a'], [400, '#c463a2'], [500, '#7f4f9e'],
  [600, '#3b3f7c'], [850, '#121540'], [1100, '#090b24'],
];

export function stageIndexFor(m) {
  let i = 0;
  while (i + 1 < STAGES.length && m >= STAGES[i + 1].m) i++;
  return i;
}

export function createSim(opts = {}) {
  const seed = (opts.seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const s = {
    seed,
    rng: mulberry32(seed),
    tutorial: !!opts.tutorial,
    demo: !!opts.demo,
    pure: !!opts.pure,
    rng2: mulberry32((seed ^ 0x5bd1e995) >>> 0), // acorns only: never shifts the course itself
    charm: !opts.pure && opts.charm && CHARMS[opts.charm] ? opts.charm : null,
    charge: 0,
    lure: 0,
    still: 0,
    forks: 0,
    splits: 0,
    acorns: 0,
    charmUses: 0,
    blocks: 0,
    bestM: opts.bestM || 0,
    t: 0,
    cx: W / 2,
    cy: 0,
    prevCy: 0,
    heading: 0,
    speed: 0,
    spread: 0,
    forked: false,
    forkTime: 0,
    forkCooldown: 0,
    tips: [],
    paths: [],
    sap: SAP_MAX,
    score: 0,
    mult: 1,
    maxMult: 1,
    commits: 0,
    merges: 0,
    reverts: 0,
    hits: 0,
    nearMisses: 0,
    chain: 0,
    chainTimer: 0,
    heightScored: 0,
    motes: [],
    beetles: [],
    brambles: [],
    frosts: [],
    winds: [],
    hints: [],
    scars: [],
    nextBeatY: -240,
    beatIndex: 0,
    lastGate: null,
    stageIdx: 0,
    invuln: 0,
    shield: false,
    inFrost: false,
    wind: 0,
    dead: false,
    deathT: 0,
    newBest: false,
    events: [],
    golden: 0,
    goldens: 0,
    blooms: 0,
    trailSeq: 0,
    trails: new Map(),
  };
  const main = newPath(s, W / 2, 40, -1);
  main.pts.push({ x: W / 2, y: 0, t: 0 });
  s.tips.push({ x: W / 2, side: 0, path: main.id, staged: 0 });
  return s;
}

function newPath(s, x, y, parent) {
  const p = { id: s.paths.length, parent, pts: [{ x, y, t: s.t }], commits: [], state: 'live', born: s.t, endT: 0 };
  s.paths.push(p);
  return p;
}

export const heightM = (s) => Math.max(0, -s.cy / PX_PER_M);

function emit(s, type, data = {}) {
  s.events.push({ type, ...data });
}

// ---------------------------------------------------------------- spawning
function addTrail(s, y0, opts = {}) {
  const r = s.rng;
  const n = opts.n ?? 5 + Math.floor(r() * 3);
  const amp = opts.amp ?? 40 + r() * 110;
  const cx = opts.cx ?? clamp(90 + r() * (W - 180), 60 + amp * 0.5, W - 60 - amp * 0.5);
  const ph = r() * Math.PI * 2;
  const k = 0.35 + r() * 0.35;
  const trail = newTrail(s, n);
  for (let i = 0; i < n; i++) {
    const x = clamp(cx + Math.sin(ph + i * k) * amp * 0.5, 40, W - 40);
    s.motes.push({ x, y: y0 - i * 44, kind: 'sun', r: 11, ph: r() * 6.28, taken: false, trail });
  }
}

function addTwinTrail(s, y0, cx) {
  // Two parallel rows exactly one fork-width apart: a reward for forking.
  const r = s.rng;
  cx = clamp(cx, FORK_SPREAD + 40, W - FORK_SPREAD - 40);
  const n = 4 + Math.floor(r() * 3);
  const trail = newTrail(s, n * 2);
  for (let i = 0; i < n; i++) {
    for (const side of [-1, 1]) {
      s.motes.push({ x: cx + side * FORK_SPREAD, y: y0 - i * 46, kind: 'sun', r: 11, ph: r() * 6.28, taken: false, trail });
    }
  }
}

function newTrail(s, n) {
  // a trail of sunlight: catch all of it for a full bloom
  const id = ++s.trailSeq;
  s.trails.set(id, { n, got: 0 });
  if (s.trails.size > 40) s.trails.delete(s.trails.keys().next().value);
  return id;
}

function addGate(s, y, gapCx, gapW) {
  gapCx = clamp(gapCx, gapW / 2 + 10, W - gapW / 2 - 10);
  const solids = [];
  if (gapCx - gapW / 2 > 4) solids.push([0, gapCx - gapW / 2]);
  if (gapCx + gapW / 2 < W - 4) solids.push([gapCx + gapW / 2, W]);
  s.brambles.push({ y, solids, gaps: [[gapCx - gapW / 2, gapCx + gapW / 2]], kind: 'gate', passed: false, seed: s.rng() * 1000 });
  for (let i = 0; i < 3; i++) s.motes.push({ x: gapCx, y: y + 60 - i * 60, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false });
  s.lastGate = { y, x: gapCx };
}

function addSplit(s, y, px, gapW) {
  // Two gaps either side of a central pillar; forked tips fit both at once.
  const half = 34;
  px = clamp(px, half + gapW + 12, W - half - gapW - 12);
  const solids = [[0, px - half - gapW], [px - half, px + half], [px + half + gapW, W]];
  const gaps = [[px - half - gapW, px - half], [px + half, px + half + gapW]];
  s.brambles.push({ y, solids, gaps, kind: 'split', passed: false, seed: s.rng() * 1000, px });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) s.motes.push({ x: px + side * FORK_SPREAD, y: y + 40 - i * 80, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false });
  }
  s.lastGate = { y, x: px };
}

function reachableX(s, y, want) {
  // Keep consecutive gates within steering reach of each other.
  if (!s.lastGate) return want;
  const dy = Math.abs(s.lastGate.y - y);
  const reach = 80 + dy * 0.62;
  return clamp(want, s.lastGate.x - reach, s.lastGate.x + reach);
}

function spawnBeat(s, y) {
  const r = s.rng;
  const m = -y / PX_PER_M;
  const diff = clamp((m / 650) * TUNE.hazardK, 0, 1.6);
  const idx = s.beatIndex++;

  // Scripted opening that teaches by doing: steer, fork, merge.
  if (idx === 0) { addTrail(s, y, { n: 6, cx: W / 2, amp: 120 }); if (s.tutorial) s.hints.push({ y: y + 70, text: 'steer the tip', sub: 'mouse · touch · ← →' }); return 340; }
  if (idx === 1) { addTrail(s, y, { n: 6, amp: 160 }); return 360; }
  if (idx === 2) { addSplit(s, y - 40, W / 2, 112); if (s.tutorial) s.hints.push({ y: y + 150, text: 'TAP to fork', sub: 'click · tap · space' }); return 330; }
  if (idx === 3) { addTwinTrail(s, y, W / 2); if (s.tutorial) s.hints.push({ y: y - 290, text: 'TAP again to merge', sub: 'merge = combo ×' }); return 420; }

  let len = 330 + r() * 80;
  const roll = r();
  const gateP = 0.22 + 0.1 * Math.min(1, diff);
  if (m > 18 && roll < gateP) {
    const gapW = Math.max(140, 205 - diff * 45);
    const want = reachableX(s, y, 70 + r() * (W - 140));
    addGate(s, y, want, gapW);
    if (r() < 0.5 + diff * 0.3) addTrail(s, y - 150, { n: 4 });
    len += 40;
  } else if (m > 18 && roll < gateP + 0.16) {
    const px = reachableX(s, y, 150 + r() * (W - 300));
    addSplit(s, y, px, Math.max(104, 124 - diff * 14));
    len += 40;
  } else if (m > 200 && roll < gateP + 0.16 + 0.12 * diff) {
    // wind gust band
    const dir = r() < 0.5 ? -1 : 1;
    s.winds.push({ y0: y, y1: y - 300, force: dir * (80 + 70 * Math.min(1, diff)) });
    addTrail(s, y - 40, { n: 6, cx: dir > 0 ? W * 0.62 : W * 0.38, amp: 60 });
    s.lastGate = null;
    len += 60;
  } else if (m > 100 && roll < gateP + 0.16 + 0.12 * diff + 0.14) {
    // frost cloud with sunlight skirting around it
    const fr = 60 + r() * 35 + diff * 20;
    const fx = 120 + r() * (W - 240);
    s.frosts.push({ x: fx, y: y - 120, r: fr, vx: (r() - 0.5) * 30, ph: r() * 6.28 });
    const side = fx < W / 2 ? 1 : -1;
    addTrail(s, y, { n: 5, cx: clamp(fx + side * (fr + 70), 60, W - 60), amp: 30 });
    s.lastGate = null;
    len += 40;
  } else {
    // open air: sunlight trails, some forkable, plus beetles
    if (r() < 0.32) addTwinTrail(s, y, 120 + r() * (W - 240));
    else addTrail(s, y);
    const nb = m < 10 ? 0 : (r() < 0.55 + diff * 0.35 ? 1 : 0) + (r() < diff * 0.55 ? 1 : 0);
    for (let i = 0; i < nb; i++) {
      const by = y - 60 - i * 150 - r() * 60;
      const sp = (45 + r() * 50 + diff * 55) * (r() < 0.5 ? -1 : 1);
      s.beetles.push({ x: 40 + r() * (W - 80), y: by, vx: sp, ph: r() * 6.28, passed: false, r: 14 });
    }
    s.lastGate = null;
  }
  if (r() < 0.09) s.motes.push({ x: 60 + r() * (W - 120), y: y - len * 0.5, kind: 'dew', r: 13, ph: 0, taken: false });
  if (m > 70 && r() < 0.045) s.motes.push({ x: 60 + r() * (W - 120), y: y - len * 0.75, kind: 'bark', r: 13, ph: 0, taken: false });
  // acorns (the meta currency) come from their own random stream
  const r2 = s.rng2;
  if (m > 6 && r2() < 0.42) {
    const n = 1 + Math.floor(r2() * 3), ax = 70 + r2() * (W - 140), ay = y - len * (0.2 + r2() * 0.5), dx = (r2() - 0.5) * 60;
    for (let i = 0; i < n; i++) s.motes.push({ x: clamp(ax + dx * i, 40, W - 40), y: ay - i * 38, kind: 'acorn', r: 10, ph: r2() * 6.28, taken: false });
  }
  return len;
}

// ---------------------------------------------------------------- core step
const SPEED0 = 170;

export function step(s, dt, input = {}) {
  s.events.length = 0;
  if (s.dead) { s.t += dt; s.deathT += dt; return s; }
  s.t += dt;
  const m = heightM(s);
  const prog = Math.min(1, m / 650);
  s.forkCooldown = Math.max(0, s.forkCooldown - dt);
  s.invuln = Math.max(0, s.invuln - dt);
  s.chainTimer -= dt;
  if (s.chainTimer <= 0) s.chain = 0;

  // speed and steering
  const frostK = s.inFrost ? 0.62 : 1;
  const target = (SPEED0 + 90 * prog + Math.min(40, Math.max(0, m - 650) * 0.05)) * frostK;
  s.speed += (target - s.speed) * Math.min(1, dt * 3);
  let desired = 0;
  if (input.targetX != null) desired = clamp(Math.atan2(input.targetX - s.cx, 120), -1.12, 1.12);
  else desired = (input.dir || 0) * 0.98;
  const maxTurn = 5.2 * dt;
  s.heading += clamp(desired - s.heading, -maxTurn, maxTurn);

  // wind bands
  let wind = 0;
  for (const w of s.winds) {
    if (s.cy < w.y0 && s.cy > w.y1) {
      const k = Math.sin(((w.y0 - s.cy) / (w.y0 - w.y1)) * Math.PI);
      wind += w.force * k;
    }
  }
  if (s.still > 0) wind *= 0.35;
  s.wind = wind;

  s.prevCy = s.cy;
  s.cx += (Math.sin(s.heading) * s.speed + wind) * dt;
  s.cy -= Math.cos(s.heading) * s.speed * dt;

  // fork / merge toggle
  if (input.toggle) {
    if (!s.forked && s.tips.length === 1 && s.forkCooldown <= 0) fork(s);
    else if (s.forked) { s.forked = false; emit(s, 'merging'); }
  }
  if (input.charm) useCharm(s);
  if (s.lure > 0) s.lure = Math.max(0, s.lure - dt);
  if (s.still > 0) s.still = Math.max(0, s.still - dt);
  if (s.forked) s.forkTime += dt;
  const spreadTarget = s.forked ? FORK_SPREAD : 0;
  const k = s.forked ? 5.5 : 7;
  s.spread += (spreadTarget - s.spread) * Math.min(1, dt * k);

  const lim = 16 + (s.tips.length === 2 ? s.spread : 0);
  if (s.cx < lim) { s.cx = lim; s.heading *= 0.8; }
  if (s.cx > W - lim) { s.cx = W - lim; s.heading *= 0.8; }

  for (const tip of s.tips) {
    tip.x = s.cx + tip.side * s.spread;
    const p = s.paths[tip.path];
    const last = p.pts[p.pts.length - 1];
    const dx = tip.x - last.x, dy = s.cy - last.y;
    if (dx * dx + dy * dy > 36) p.pts.push({ x: tip.x, y: s.cy, t: s.t });
  }
  if (s.tips.length === 2 && !s.forked && s.spread < 4) merge(s);

  // energy
  const climb = Math.min(2.2, m / 600);
  const drain = (TUNE.drain0 + TUNE.drainK * climb) * (s.tips.length === 2 ? TUNE.forkDrain : 1) + (s.inFrost ? (s.still > 0 ? 6 : 20) : 0);
  if (!s.demo) s.sap -= drain * dt * (s.golden > 0 ? 0.4 : s.still > 0 ? 0.6 : 1);

  // golden hour: sunlight drifts to your tips, slower drain, double points
  if (s.golden > 0 || s.lure > 0) attract(s, dt);
  if (s.golden > 0) {
    s.golden -= dt;
    if (s.golden <= 0) { s.golden = 0; s.mult = Math.min(s.mult, 4); emit(s, 'goldenend'); }
  }

  // height score
  const mi = Math.floor(m);
  if (mi > s.heightScored) { s.score += (mi - s.heightScored) * s.mult; s.heightScored = mi; }
  const si = stageIndexFor(m);
  if (si > s.stageIdx) { s.stageIdx = si; emit(s, 'stage', { idx: si }); s.sap = Math.min(SAP_MAX, s.sap + 15); }
  if (!s.newBest && s.bestM > 5 && m > s.bestM) { s.newBest = true; emit(s, 'newbest'); }

  // world update + spawning
  while (s.nextBeatY > s.cy - 1500) s.nextBeatY -= spawnBeat(s, s.nextBeatY);
  const slow = s.still > 0 ? 0.25 : 1;
  for (const b of s.beetles) {
    b.x += b.vx * dt * slow; b.ph += dt * 10 * slow;
    if (b.x < 18) { b.x = 18; b.vx = Math.abs(b.vx); }
    if (b.x > W - 18) { b.x = W - 18; b.vx = -Math.abs(b.vx); }
  }
  for (const f of s.frosts) { f.x += f.vx * dt * slow; f.ph += dt; if (f.x < f.r * 0.5 || f.x > W - f.r * 0.5) f.vx *= -1; }

  collide(s);
  retract(s, dt);

  const cull = s.cy + 1000;
  s.motes = s.motes.filter((o) => o.y < cull && !o.taken);
  s.beetles = s.beetles.filter((o) => o.y < cull);
  s.frosts = s.frosts.filter((o) => o.y - o.r < cull);
  s.brambles = s.brambles.filter((o) => o.y < cull);
  s.winds = s.winds.filter((o) => o.y1 < cull);
  s.hints = s.hints.filter((o) => o.y < cull);

  if (s.sap <= 0) {
    s.sap = 0; s.dead = true; s.deathT = 0;
    for (const tip of s.tips) { const p = s.paths[tip.path]; if (p.state === 'live') p.state = 'done'; }
    emit(s, 'death');
  }
  return s;
}

function fork(s) {
  // git-style: the parent line ends at the fork commit and two child
  // branches start from it, so a revert only ever rolls back its own branch.
  const main = s.tips[0];
  const mp = s.paths[main.path];
  const last = mp.pts[mp.pts.length - 1];
  mp.state = 'done';
  const a = newPath(s, last.x, last.y, mp.id);
  const b = newPath(s, last.x, last.y, mp.id);
  a.pts[0].t = last.t; b.pts[0].t = last.t;
  s.tips = [{ x: main.x, side: -1, path: a.id, staged: 0 }, { x: main.x, side: 1, path: b.id, staged: 0 }];
  s.forked = true;
  s.forkTime = 0;
  s.forks++;
  // a commit dot marks the fork point
  mp.commits.push({ i: mp.pts.length - 1, kind: 'fork', born: s.t });
  emit(s, 'fork', { x: s.cx, y: s.cy });
}

function merge(s) {
  const [a, b] = s.tips;
  const pa = s.paths[a.path], pb = s.paths[b.path];
  // close the branch onto the surviving tip
  pb.pts.push({ x: s.cx, y: s.cy, t: s.t });
  pa.pts.push({ x: s.cx, y: s.cy, t: s.t });
  pb.state = 'merged'; pb.endT = s.t;
  pa.state = 'merged'; pa.endT = s.t;
  const staged = a.staged + b.staged;
  const mc = newPath(s, s.cx, s.cy, pa.id);
  s.tips = [{ x: s.cx, side: 0, path: mc.id, staged: 0 }];
  s.spread = 0;
  s.forkCooldown = 0.25;
  if (staged > 0 && s.forkTime > 0.9) {
    const bonus = 50 + 20 * staged * s.mult;
    s.score += bonus;
    s.mult = Math.min(MAX_MULT, s.mult + 1);
    s.maxMult = Math.max(s.maxMult, s.mult);
    const goldenNow = s.mult === MAX_MULT && s.golden <= 0;
    s.sap = Math.min(SAP_MAX, s.sap + 3 * staged);
    s.merges++;
    s.commits++;
    if (s.charm && s.charge < CHARMS[s.charm].charge) { s.charge++; if (s.charge === CHARMS[s.charm].charge) emit(s, 'charged', { charm: s.charm }); }
    mc.commits.push({ i: 0, kind: 'merge', born: s.t });
    emit(s, 'merge', { x: s.cx, y: s.cy, staged, bonus, mult: s.mult });
    if (goldenNow) { s.golden = GOLDEN_SEC; s.goldens++; emit(s, 'golden', { x: s.cx, y: s.cy }); }
  } else {
    emit(s, 'emptymerge', { x: s.cx, y: s.cy });
  }
}

function revert(s, tipIdx) {
  const tip = s.tips[tipIdx];
  const other = s.tips[1 - tipIdx];
  const p = s.paths[tip.path];
  p.state = 'reverting'; p.endT = s.t;
  // staged commits on the reverted branch are lost
  const lost = tip.staged;
  s.commits -= lost;
  s.cx = other.x;
  s.tips = [{ x: other.x, side: 0, path: other.path, staged: 0 }];
  s.forked = false;
  s.spread = 0;
  s.mult = Math.max(1, s.mult - 1);
  if (!s.demo) s.sap -= 8;
  s.reverts++;
  s.invuln = 0.8;
  s.forkCooldown = 0.6;
  emit(s, 'revert', { x: tip.x, y: s.cy, lost });
}

function hit(s, tipIdx, dmg) {
  if (s.invuln > 0) return;
  const tip = s.tips[tipIdx];
  if (s.shield) {
    s.shield = false; s.invuln = 1; s.blocks++;
    emit(s, 'shieldbreak', { x: tip.x, y: s.cy });
    return;
  }
  s.hits++;
  if (s.tips.length === 2) { revert(s, tipIdx); return; }
  if (!s.demo) s.sap -= dmg;
  s.mult = 1;
  s.invuln = 1.0;
  s.chain = 0;
  s.heading *= -0.4;
  const p = s.paths[tip.path];
  s.scars.push({ x: tip.x, y: s.cy, path: p.id, i: p.pts.length - 1 });
  emit(s, 'hit', { x: tip.x, y: s.cy, dmg });
}

function collide(s) {
  s.inFrost = false;
  const y = s.cy, py = s.prevCy;
  for (let ti = s.tips.length - 1; ti >= 0; ti--) {
    if (ti >= s.tips.length) continue;
    const tip = s.tips[ti];
    const x = tip.x;
    for (const o of s.motes) {
      if (o.taken) continue;
      const dx = o.x - x, dy = o.y - y, rr = o.r + TIP_R + 4;
      if (dx * dx + dy * dy < rr * rr) collect(s, o, tip);
    }
    for (const f of s.frosts) {
      const dx = f.x - x, dy = f.y - y;
      if (dx * dx + dy * dy < f.r * f.r * 0.7) s.inFrost = true;
    }
    for (const b of s.beetles) {
      const dx = b.x - x, dy = b.y - y, rr = b.r + TIP_R - 3;
      if (dx * dx + dy * dy < rr * rr) { hit(s, ti, 24); break; }
    }
    if (ti >= s.tips.length) continue;
    for (const br of s.brambles) {
      if (br.y > py + 10 || br.y < y - 10) continue;
      if (Math.abs(br.y - y) > 9) continue;
      for (const [a, b] of br.solids) {
        if (x > a - TIP_R + 3 && x < b + TIP_R - 3) { hit(s, ti, 30); break; }
      }
      if (ti >= s.tips.length) break;
    }
  }
  // near misses (checked once per object as the tips cross its height)
  for (const b of s.beetles) {
    if (b.passed || !(b.y >= y && b.y < py)) continue;
    b.passed = true;
    if (s.invuln > 0) continue;
    let best = 1e9;
    for (const tip of s.tips) best = Math.min(best, Math.abs(tip.x - b.x));
    if (best < 50 && best > b.r + TIP_R - 3) nearMiss(s, b.x, b.y);
  }
  for (const br of s.brambles) {
    if (br.passed || !(br.y >= y && br.y < py)) continue;
    br.passed = true;
    if (s.invuln > 0) continue;
    let close = false;
    for (const tip of s.tips) for (const [a, b] of br.gaps) {
      if (tip.x > a && tip.x < b && (tip.x - a < 26 || b - tip.x < 26)) close = true;
    }
    if (br.kind === 'split' && s.tips.length === 2) {
      const bonus = 40 * s.mult;
      s.score += bonus;
      s.splits++;
      emit(s, 'splitpass', { x: s.cx, y: br.y, bonus });
    } else if (close) nearMiss(s, s.cx, br.y);
  }
}

function nearMiss(s, x, y) {
  s.nearMisses++;
  const bonus = 15 * s.mult;
  s.score += bonus;
  emit(s, 'near', { x, y, bonus });
}

function collect(s, o, tip) {
  o.taken = true;
  if (o.kind === 'sun') {
    s.chain++;
    s.chainTimer = 1.3;
    s.commits++;
    const pts = 10 * s.mult * (s.golden > 0 ? 2 : 1);
    s.score += pts;
    s.sap = Math.min(SAP_MAX, s.sap + Math.max(TUNE.moteSapMin, TUNE.moteSap0 - heightM(s) / 150));
    if (s.tips.length === 2) tip.staged++;
    const p = s.paths[tip.path];
    p.commits.push({ i: p.pts.length - 1, kind: 'commit', born: s.t });
    emit(s, 'collect', { x: o.x, y: o.y, chain: s.chain, pts, forked: s.tips.length === 2 });
    const tr = o.trail && s.trails.get(o.trail);
    if (tr && ++tr.got >= tr.n) {
      s.trails.delete(o.trail);
      if (tr.n >= BLOOM_MIN) {
        const bonus = 15 * tr.n * s.mult;
        s.score += bonus;
        s.sap = Math.min(SAP_MAX, s.sap + 4);
        s.blooms++;
        p.commits.push({ i: p.pts.length - 1, kind: 'bloom', born: s.t });
        emit(s, 'bloom', { x: tip.x, y: s.cy, n: tr.n, bonus });
      }
    }
  } else if (o.kind === 'dew') {
    s.sap = Math.min(SAP_MAX, s.sap + 30);
    s.score += 25 * s.mult;
    emit(s, 'dew', { x: o.x, y: o.y });
  } else if (o.kind === 'acorn') {
    s.acorns++;
    s.score += 5 * s.mult;
    emit(s, 'acorn', { x: o.x, y: o.y, n: s.acorns });
  } else if (o.kind === 'bark') {
    s.shield = true;
    emit(s, 'shield', { x: o.x, y: o.y });
  }
}

function attract(s, dt) {
  // golden hour and Sun Call: sunlight (and acorns) drift to the nearest tip
  for (const o of s.motes) {
    if ((o.kind !== 'sun' && o.kind !== 'acorn') || o.taken || o.y < s.cy - 220 || o.y > s.cy + 30) continue;
    let bt = null, bd = 150 * 150;
    for (const tip of s.tips) { const dx = tip.x - o.x, dy = s.cy - o.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bt = tip; } }
    if (bt) { const d = Math.sqrt(bd) || 1, v = Math.min(d, 380 * dt); o.x += ((bt.x - o.x) / d) * v; o.y += ((s.cy - o.y) / d) * v; }
  }
}

export function charmReady(s) {
  return !!s.charm && !s.dead && s.charge >= CHARMS[s.charm].charge;
}

function useCharm(s) {
  if (!charmReady(s)) return;
  const c = s.charm;
  s.charge = 0;
  s.charmUses++;
  if (c === 'ward') s.shield = true;
  else if (c === 'sun') s.lure = CHARMS.sun.dur;
  else if (c === 'roots') { s.sap = Math.min(SAP_MAX, s.sap + 25); s.mult = Math.max(1, s.mult - 2); }
  else if (c === 'still') s.still = CHARMS.still.dur;
  emit(s, 'charm', { charm: c, x: s.cx, y: s.cy });
}

function retract(s, dt) {
  for (const p of s.paths) {
    if (p.state !== 'reverting') continue;
    let budget = 900 * dt;
    while (budget > 0 && p.pts.length > 1) {
      const a = p.pts[p.pts.length - 1], b = p.pts[p.pts.length - 2];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d <= budget) { p.pts.pop(); budget -= d; }
      else { const t = budget / d; a.x += (b.x - a.x) * t; a.y += (b.y - a.y) * t; budget = 0; }
    }
    p.commits = p.commits.filter((c) => c.i < p.pts.length);
    if (p.pts.length <= 1) p.state = 'gone';
  }
}

/** Summary used by the game-over card and the share image. */
export function summary(s) {
  const pts = [];
  for (const p of s.paths) if (p.state !== 'gone' && p.state !== 'reverting') for (let i = 0; i < p.pts.length; i += 7) pts.push(p.pts[i].x, p.pts[i].y);
  return {
    score: Math.floor(s.score),
    height: Math.floor(heightM(s)),
    commits: Math.max(0, s.commits),
    merges: s.merges,
    reverts: s.reverts,
    maxMult: s.maxMult,
    nearMisses: s.nearMisses,
    blooms: s.blooms,
    goldens: s.goldens,
    forks: s.forks,
    splits: s.splits,
    acorns: s.acorns,
    charmUses: s.charmUses,
    blocks: s.blocks,
    hits: s.hits,
    charm: s.charm,
    pure: s.pure,
    stage: STAGES[s.stageIdx].name,
    time: s.t,
    hash: treeHash([s.seed, Math.floor(s.score), ...pts]),
  };
}
