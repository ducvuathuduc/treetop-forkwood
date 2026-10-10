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
export const COLUMN_HW = 24;     // half-width of a thorn column: a forked pair straddles it

// Charms: one optional ability per run, charged by scoring merges and fired with
// a second button (E / Shift / the charm badge). Never active on the daily tree
// or on challenge links ("pure" runs), so those stay identical for everyone.
// Each one has a price: it needs merges to charge, and Deep Roots costs combo.
export const CHARMS = {
  ward:  { name: 'Bark Ward',  charge: 5, dur: 0,   blurb: 'Grow a bark shield that blocks the next hit.' },
  sun:   { name: 'Sun Call',   charge: 5, dur: 3,   blurb: 'For 3 s nearby sunlight drifts to your tips.' },
  roots: { name: 'Deep Roots', charge: 4, dur: 0,   blurb: '+25 sap at once, but your combo drops by 2.' },
  still: { name: 'Stillness',  charge: 3, dur: 4,   blurb: 'For 4 s beetles, frost, wind and sliding thorns slow to a crawl and sap drains slower.' },
};

// Power-ups found in the tree (short, stackable: picking one up again adds time).
export const PICKUPS = {
  pollen: { name: 'Pollen', dur: 6, blurb: 'sunlight drifts to your tips' },
  ink:    { name: 'Ink ×2', dur: 8, blurb: 'double points' },
  rush:   { name: 'Sap Rush', dur: 3, blurb: 'surge upward, nothing can hurt you' },
};

// Grafts: run modifiers offered at biome gates. Steer into one medallion to take
// it; fork through the gate to take both. Each has a boon and a cost.
export const GRAFTS = {
  taproot: { name: 'Taproot',     boon: 'sap drains 15% slower', cost: 'dew is worth half' },
  wild:    { name: 'Wild Growth', boon: 'forked sunlight stages 2 commits', cost: 'forking drains 20% more' },
  crown:   { name: 'Thorn Crown', boon: 'all points ×1.25', cost: 'hits cost 50% more sap' },
  shave:   { name: 'Close Shave', boon: 'close calls pay ×3 and +3 sap', cost: 'your tip is a little wider' },
  bloom:   { name: 'Early Bloom', boon: 'trails bloom from 3 sunlights, +6 sap', cost: 'beetles move 15% faster' },
  pollen:  { name: 'Pollinator',  boon: 'power-ups last 50% longer', cost: 'an empty merge costs 1 combo' },
};
// Named pairs that do something extra together (discovered in play).
export const SYNERGIES = {
  orchard: { name: 'Orchard', of: ['wild', 'bloom'], text: 'every full bloom adds +1 combo' },
  briar:   { name: 'Briar',   of: ['crown', 'shave'], text: 'every 3rd close call in a row adds +1 combo' },
  spring:  { name: 'Spring',  of: ['taproot', 'pollen'], text: 'each new stage starts 4 s of pollen' },
};
const GRAFT_IDS = Object.keys(GRAFTS);

// Balance knobs (tuned with tests/balance.mjs).
export const TUNE = {
  drain0: 4.6,      // sap drain per second at ground level
  drainK: 5.8,      // extra drain per second per 600 m climbed
  forkDrain: 1.4,   // drain multiplier while two tips grow
  moteSap0: 7.0,    // sap from one sunlight mote at ground level
  moteSapMin: 4.8,  // sap from one mote high up
  hazardK: 1.0,     // scales the director's intensity curve
};

export const STAGES = [
  { m: 0, name: 'Twig', sky: '#ffcf9f', haze: '#fff1de', leaf: '#86d66b', news: 'sunlight and beetles' },
  { m: 40, name: 'Sapling', sky: '#bfe6f2', haze: '#eefaff', leaf: '#5cc65c', news: 'thorn gates · split gates' },
  { m: 120, name: 'Bough', sky: '#86c8ee', haze: '#d9f1ff', leaf: '#3cae56', news: 'frost clouds · zig-zag thorns' },
  { m: 240, name: 'Canopy', sky: '#f3a76a', haze: '#ffe0b8', leaf: '#eaa13a', news: 'gusts · thorn columns' },
  { m: 400, name: 'Treetop', sky: '#b4689c', haze: '#f3c4dc', leaf: '#f59ac0', news: 'a storm is coming' },
  { m: 600, name: 'Cloudline', sky: '#3b3f7c', haze: '#8e8fc8', leaf: '#a6dcff', news: 'sliding thorns' },
  { m: 850, name: 'Starlight', sky: '#0e1132', haze: '#2c2f66', leaf: '#eaf2ff', news: 'storms return · all of it' },
];

// Fixed beats of every course (same for every seed, so players learn them).
export const GRAFT_AT = [120, 240, 545, 850, 1250, 1650];
export const STORMS = [{ m: 430, len: 85 }, { m: 1020, len: 95 }, { m: 1500, len: 100 }, { m: 1950, len: 110 }];

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
    columns: [],
    tokens: [],
    stormZones: [],
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
    // pass 3: director, power-ups, grafts, storms, skill bonuses
    dir: { pos: 0, last: [], graftI: 0, stormI: 0, stormOpen: -1, gateN: 0 },
    chunkLog: [],
    pu: { pollen: 0, ink: 0, rush: 0 },
    pickups: 0,
    rushes: 0,
    grafts: [],
    synergies: [],
    storm: null,
    storms: 0,
    strikes: 0,
    graze: 0,
    grazeBest: 0,
    lastNear: -9,
    jits: 0,
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
export const hasGraft = (s, id) => s.grafts.includes(id);
const tipR = (s) => TIP_R + (hasGraft(s, 'shave') ? 2 : 0);
const scoreK = (s) => (s.pu.ink > 0 ? 2 : 1) * (hasGraft(s, 'crown') ? 1.25 : 1);
function addScore(s, pts) { const v = Math.round(pts * scoreK(s)); s.score += v; return v; }

function emit(s, type, data = {}) {
  s.events.push({ type, ...data });
}

// ---------------------------------------------------------------- spawning primitives
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

function addTwinTrail(s, y0, cx, nOpt) {
  // Two parallel rows exactly one fork-width apart: a reward for forking.
  const r = s.rng;
  cx = clamp(cx, FORK_SPREAD + 40, W - FORK_SPREAD - 40);
  const n = nOpt ?? 4 + Math.floor(r() * 3);
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

function addGate(s, y, gapCx, gapW, motes = true) {
  gapCx = clamp(gapCx, gapW / 2 + 10, W - gapW / 2 - 10);
  const solids = [];
  if (gapCx - gapW / 2 > 4) solids.push([0, gapCx - gapW / 2]);
  if (gapCx + gapW / 2 < W - 4) solids.push([gapCx + gapW / 2, W]);
  s.brambles.push({ y, solids, gaps: [[gapCx - gapW / 2, gapCx + gapW / 2]], kind: 'gate', passed: false, seed: s.rng() * 1000 });
  if (motes) for (let i = 0; i < 3; i++) s.motes.push({ x: gapCx, y: y + 60 - i * 60, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false });
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

function addSlider(s, y, cx, gapW, amp, period) {
  // A thorn gate whose gap drifts side to side (Cloudline). The gap moves far
  // slower than a tip can steer; its path is drawn as arrows before you reach it.
  const lo = gapW / 2 + 14 + amp, hi = W - gapW / 2 - 14 - amp;
  cx = clamp(cx, lo, hi);
  const br = { y, solids: [], gaps: [], kind: 'slide', passed: false, seed: s.rng() * 1000, base: cx, amp, w: (Math.PI * 2) / period, ph: s.rng() * 6.28, gapW, clock: 0 };
  slideUpdate(br, 0);
  s.brambles.push(br);
  s.motes.push({ x: cx, y: y + 70, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false });
  s.lastGate = { y, x: cx, slide: amp };
}
function slideUpdate(br, dt) {
  br.clock += dt;
  const c = br.base + Math.sin(br.ph + br.clock * br.w) * br.amp;
  const a = c - br.gapW / 2, b = c + br.gapW / 2;
  br.gaps = [[a, b]];
  br.solids = [[0, a], [b, W]];
  br.cx = c;
}

function addColumn(s, x, yBottom, len, kind = 'thorn') {
  // A vertical thorn column (or a lightning bolt in a storm). Steer around it,
  // or fork so the two tips straddle it.
  x = clamp(x, COLUMN_HW + 2 * TIP_R + 70, W - COLUMN_HW - 2 * TIP_R - 70);
  s.columns.push({ x, y0: yBottom, y1: yBottom - len, hw: COLUMN_HW, kind, live: kind !== 'bolt', passed: false, seed: s.rng() * 1000 });
  s.lastGate = null;
  return x;
}

function addBeetle(s, x, y, speed) {
  const sp = speed * (s.rng() < 0.5 ? -1 : 1);
  s.beetles.push({ x: clamp(x, 40, W - 40), y, vx: sp, ph: s.rng() * 6.28, passed: false, r: 14 });
}

function addPickup(s, x, y, kind) {
  if (!kind) { const q = s.rng(); kind = q < 0.4 ? 'pollen' : q < 0.75 ? 'ink' : 'rush'; }
  s.motes.push({ x: clamp(x, 50, W - 50), y, kind, r: 15, ph: s.rng() * 6.28, taken: false, pickup: true });
}

function reachableX(s, y, want) {
  // Keep consecutive gates within steering reach of each other.
  if (!s.lastGate) return want;
  const dy = Math.abs(s.lastGate.y - y);
  const reach = 80 + dy * 0.62 - (s.lastGate.slide || 0);
  return clamp(want, s.lastGate.x - reach, s.lastGate.x + reach);
}

// ---------------------------------------------------------------- the director
// The course is built from hand-authored chunks at difficulty tiers 0-3 (plus
// rest glades), mixed by a director that follows a sawtooth: build, build,
// spike, rest. Each biome unlocks its own families. It reads only s.rng and
// height, never what the player did, so one seed always grows one course.
export const SET = ['build', 'build', 'spike', 'rest'];

/** Intensity 0..~1.5 at height m (the macro curve). */
export function intensity(m) {
  if (m < 18) return 0;
  return (Math.min(1, (m - 18) / 600) + 0.5 * clamp((m - 650) / 800, 0, 1)) * TUNE.hazardK;
}

const sig = (m) => STAGES[stageIndexFor(m)].name;

// Every chunk: id, tier, min height, weight, signature biome, gen(s, y, d) -> length.
export const CHUNKS = [
  // ---- tier 0: one idea at a time
  { id: 'meadow', tier: 0, minM: 0, w: 1.2, gen(s, y, d) {
    addTrail(s, y);
    if (heightM2(y) > 10 && s.rng() < 0.6) addBeetle(s, 40 + s.rng() * (W - 80), y - 150 - s.rng() * 60, 45 + s.rng() * 40);
    s.lastGate = null; return 340 + s.rng() * 60;
  } },
  { id: 'twinmeadow', tier: 0, minM: 0, w: 1, gen(s, y) {
    addTwinTrail(s, y, 120 + s.rng() * (W - 240));
    if (heightM2(y) > 10 && s.rng() < 0.4) addBeetle(s, 40 + s.rng() * (W - 80), y - 300, 45 + s.rng() * 30);
    s.lastGate = null; return 360 + s.rng() * 40;
  } },
  { id: 'widegate', tier: 0, minM: 18, w: 1.1, gen(s, y) {
    addGate(s, y, reachableX(s, y, 90 + s.rng() * (W - 180)), 215);
    addTrail(s, y - 150, { n: 4 }); return 380;
  } },
  { id: 'easysplit', tier: 0, minM: 18, w: 1, gen(s, y) {
    addSplit(s, y, reachableX(s, y, 160 + s.rng() * (W - 320)), 126); return 380;
  } },
  // ---- tier 1
  { id: 'gate', tier: 1, minM: 18, w: 1.2, gen(s, y, d) {
    addGate(s, y, reachableX(s, y, 70 + s.rng() * (W - 140)), Math.max(150, 200 - d * 40));
    if (s.rng() < 0.6) addTrail(s, y - 150, { n: 4 }); return 380 + s.rng() * 40;
  } },
  { id: 'split', tier: 1, minM: 18, w: 1.1, gen(s, y, d) {
    addSplit(s, y, reachableX(s, y, 150 + s.rng() * (W - 300)), Math.max(106, 122 - d * 12)); return 380;
  } },
  { id: 'beetles', tier: 1, minM: 30, w: 1, gen(s, y, d) {
    addTrail(s, y);
    for (let i = 0; i < 2; i++) addBeetle(s, 40 + s.rng() * (W - 80), y - 70 - i * 160 - s.rng() * 40, 50 + s.rng() * 45 + d * 40);
    s.lastGate = null; return 400;
  } },
  { id: 'frost', tier: 1, minM: 100, sig: 'Bough', w: 1, gen(s, y, d) {
    const fr = 60 + s.rng() * 35 + d * 18, fx = 120 + s.rng() * (W - 240);
    s.frosts.push({ x: fx, y: y - 120, r: fr, vx: (s.rng() - 0.5) * 30, ph: s.rng() * 6.28 });
    const side = fx < W / 2 ? 1 : -1;
    addTrail(s, y, { n: 5, cx: clamp(fx + side * (fr + 70), 60, W - 60), amp: 30 });
    s.lastGate = null; return 400;
  } },
  { id: 'zigzag', tier: 1, minM: 120, sig: 'Bough', w: 1.1, gen(s, y, d) {
    const x1 = reachableX(s, y, 120 + s.rng() * (W - 240)); const gw = Math.max(160, 205 - d * 35);
    addGate(s, y, x1, gw, false);
    const off = (120 + s.rng() * 50) * (x1 > W / 2 ? -1 : 1);
    addGate(s, y - 300, reachableX(s, y - 300, x1 + off), gw, false);
    addTrail(s, y - 60, { n: 4, cx: x1, amp: 30 });
    return 660;
  } },
  { id: 'crossroads', tier: 1, minM: 80, w: 0.8, gen(s, y, d) {
    // a column splits the way: one lane rich and guarded, one lane safe and thin
    const x = addColumn(s, W / 2, y - 60, 420);
    const rich = s.rng() < 0.5 ? -1 : 1, lx = x + rich * 150, sx = x - rich * 150;
    const trail = newTrail(s, 7);
    for (let i = 0; i < 7; i++) s.motes.push({ x: lx + Math.sin(i * 0.9) * 26, y: y - 70 - i * 50, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false, trail });
    addBeetle(s, lx, y - 250, 40 + d * 30);
    if (s.rng() < 0.65) addPickup(s, lx, y - 430);
    for (let i = 0; i < 2; i++) s.motes.push({ x: sx, y: y - 150 - i * 140, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false });
    s.hints.push({ y: y + 20, text: 'fork to take both lanes', sub: '', small: true });
    return 760;
  } },
  // ---- tier 2
  { id: 'gatesplit', tier: 2, minM: 60, w: 1, gen(s, y, d) {
    const x1 = reachableX(s, y, 120 + s.rng() * (W - 240));
    addGate(s, y, x1, Math.max(150, 195 - d * 35));
    addSplit(s, y - 340, reachableX(s, y - 340, x1 + (s.rng() - 0.5) * 160), Math.max(106, 120 - d * 12));
    return 700;
  } },
  { id: 'splitgate', tier: 2, minM: 140, w: 1, gen(s, y, d) {
    // fork through the split, then merge before the gate (just-in-time pays)
    const px = reachableX(s, y, 160 + s.rng() * (W - 320));
    addSplit(s, y, px, Math.max(108, 122 - d * 12));
    addTwinTrail(s, y - 80, px, 3);
    addGate(s, y - 360, reachableX(s, y - 360, px + (s.rng() - 0.5) * 140), Math.max(150, 190 - d * 30), false);
    return 720;
  } },
  { id: 'swarm', tier: 2, minM: 160, w: 1, gen(s, y, d) {
    addTrail(s, y, { n: 6 });
    for (let i = 0; i < 3; i++) addBeetle(s, 60 + ((i * 0.33 + s.rng() * 0.3) % 1) * (W - 120), y - 60 - i * 130, 55 + s.rng() * 45 + d * 45);
    s.lastGate = null; return 460;
  } },
  { id: 'wind', tier: 2, minM: 200, sig: 'Canopy', w: 1.2, gen(s, y, d) {
    const dir = s.rng() < 0.5 ? -1 : 1;
    s.winds.push({ y0: y, y1: y - 300, force: dir * (80 + 70 * Math.min(1, d)) });
    addTrail(s, y - 40, { n: 6, cx: dir > 0 ? W * 0.62 : W * 0.38, amp: 60 });
    s.lastGate = null; return 420;
  } },
  { id: 'column', tier: 2, minM: 240, sig: 'Canopy', w: 1.3, gen(s, y, d) {
    const len = 300 + s.rng() * 120 + d * 40;
    const x = addColumn(s, 140 + s.rng() * (W - 280), y - 80, len);
    addTwinTrail(s, y - 100, x, 4);
    if (s.rng() < 0.5) addPickup(s, x + (s.rng() < 0.5 ? -1 : 1) * 130, y - 80 - len * 0.6);
    return 280 + len;
  } },
  { id: 'slider', tier: 2, minM: 520, sig: 'Cloudline', w: 1.3, gen(s, y, d) {
    addSlider(s, y, 140 + s.rng() * (W - 280), Math.max(175, 215 - d * 25), 45 + s.rng() * 25, 5 + s.rng() * 1.2);
    addTrail(s, y - 160, { n: 4 }); s.lastGate = null; return 440;
  } },
  // ---- tier 3: two ideas at once
  { id: 'columnbeetles', tier: 3, minM: 300, w: 1, gen(s, y, d) {
    const len = 340 + s.rng() * 100;
    const x = addColumn(s, 160 + s.rng() * (W - 320), y - 80, len);
    addTwinTrail(s, y - 100, x, 4);
    const far = x < W / 2 ? 1 : -1;
    addBeetle(s, x + far * 170, y - 80 - len * 0.5, 50 + d * 35);
    return 300 + len;
  } },
  { id: 'gauntlet', tier: 3, minM: 380, w: 1, gen(s, y, d) {
    const x1 = reachableX(s, y, 120 + s.rng() * (W - 240));
    addGate(s, y, x1, Math.max(150, 185 - d * 25), false);
    addBeetle(s, W / 2, y - 175, 60 + d * 40);
    addSplit(s, y - 360, reachableX(s, y - 360, x1 + (s.rng() - 0.5) * 150), Math.max(106, 118 - d * 10));
    return 720;
  } },
  { id: 'twinslider', tier: 3, minM: 650, sig: 'Cloudline', w: 1, gen(s, y, d) {
    const g = Math.max(175, 205 - d * 20);
    addSlider(s, y, 140 + s.rng() * (W - 280), g, 60, 5.2);
    addSlider(s, y - 330, W / 2, g, 70, 5.8);
    addTrail(s, y - 120, { n: 4 }); s.lastGate = null; return 720;
  } },
  { id: 'windcolumn', tier: 3, minM: 650, w: 1, gen(s, y, d) {
    const dir = s.rng() < 0.5 ? -1 : 1, len = 340;
    s.winds.push({ y0: y, y1: y - 360, force: dir * 90 });
    const x = addColumn(s, W / 2 + (s.rng() - 0.5) * 120, y - 60, len);
    addTwinTrail(s, y - 90, x, 4);
    return 600;
  } },
];
const heightM2 = (y) => -y / PX_PER_M;

const REST = { id: 'glade', tier: -1, gen(s, y, d, m) {
  // rest beat: a long sunlight glade, a forkable twin trail and maybe a power-up
  addTrail(s, y, { n: 7, amp: 90 + s.rng() * 80 });
  addTwinTrail(s, y - 380, 140 + s.rng() * (W - 280), 4);
  if (m > 55 && s.rng() < 0.45) addPickup(s, 80 + s.rng() * (W - 160), y - 300);
  if (s.rng() < 0.18) s.motes.push({ x: 60 + s.rng() * (W - 120), y: y - 600, kind: 'dew', r: 13, ph: 0, taken: false });
  s.lastGate = null; return 660;
} };

const STORM_CHUNK = { id: 'bolts', tier: -2, gen(s, y, d) {
  // lightning: each bolt shows as a dashed warning long before it strikes
  const x1 = 120 + s.rng() * (W - 240);
  addColumn(s, x1, y - 40, 170, 'bolt');
  if (s.rng() < 0.7) { const x2 = x1 < W / 2 ? x1 + 190 + s.rng() * 60 : x1 - 190 - s.rng() * 60; addColumn(s, x2, y - 340, 170, 'bolt'); }
  addTrail(s, y - 20, { n: 5 });
  return 700;
} };

function graftGate(s, y) {
  // two medallions one fork-width apart: steer into one, or fork to take both
  const g = s.dir.gateN++;
  const order = s.dir.order || (s.dir.order = shuffle(s, GRAFT_IDS.slice()));
  if (g > 0 && g % 3 === 0) s.dir.order = shuffle(s, GRAFT_IDS.slice());
  const o = s.dir.order, k = (g % 3) * 2;
  const pair = [o[k], o[k + 1]];
  addTrail(s, y, { n: 5, cx: W / 2, amp: 40 });
  const ty = y - 330;
  s.tokens.push({ x: W / 2 - FORK_SPREAD, y: ty, id: pair[0], r: 20, taken: false, gate: g });
  s.tokens.push({ x: W / 2 + FORK_SPREAD, y: ty, id: pair[1], r: 20, taken: false, gate: g });
  s.hints.push({ y: ty + 120, text: 'choose a graft', sub: 'steer into one · fork to take both', graft: true });
  s.lastGate = null;
  return 640;
}
function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function pickChunk(s, tier, m) {
  const r = s.rng;
  for (let t = tier; t >= 0; t--) {
    const pool = CHUNKS.filter((c) => c.tier === t && m >= c.minM && !s.dir.last.includes(c.id));
    if (!pool.length) continue;
    const here = sig(m);
    let tot = 0; const ws = pool.map((c) => { const w = c.w * (c.sig === here ? 1.8 : 1); tot += w; return w; });
    let q = r() * tot;
    for (let i = 0; i < pool.length; i++) { q -= ws[i]; if (q <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  return CHUNKS[0];
}

function spawnBeat(s, y) {
  const r = s.rng;
  const m = -y / PX_PER_M;
  const idx = s.beatIndex++;

  // Scripted opening that teaches by doing: steer, fork, merge.
  if (idx === 0) { addTrail(s, y, { n: 6, cx: W / 2, amp: 120 }); if (s.tutorial) s.hints.push({ y: y + 70, text: 'steer the tip', sub: 'mouse · touch · ← →' }); return 340; }
  if (idx === 1) { addTrail(s, y, { n: 6, amp: 160 }); return 360; }
  if (idx === 2) { addSplit(s, y - 40, W / 2, 112); if (s.tutorial) s.hints.push({ y: y + 150, text: 'TAP to fork', sub: 'click · tap · space' }); return 330; }
  if (idx === 3) { addTwinTrail(s, y, W / 2); if (s.tutorial) s.hints.push({ y: y - 290, text: 'TAP again to merge', sub: 'merge = combo ×' }); return 420; }

  const D = s.dir;
  const d = intensity(m);
  let chunk, role, len;
  const st = STORMS[D.stormI];
  if (D.graftI < GRAFT_AT.length && m >= GRAFT_AT[D.graftI]) {
    D.graftI++; role = 'graft'; len = graftGate(s, y); chunk = { id: 'graft', tier: -1 };
  } else if (st && m >= st.m) {
    // the storm (a boss stretch): lightning chunks until it passes
    if (D.stormOpen !== D.stormI) { D.stormOpen = D.stormI; s.stormZones.push({ y0: y + 40, y1: y - st.len * PX_PER_M, i: D.stormI }); }
    const z = s.stormZones[s.stormZones.length - 1];
    if (y - 520 > z.y1) {
      z.n = (z.n || 0) + 1;
      if (z.n % 3 === 0) { role = 'rest'; chunk = REST; len = REST.gen(s, y, d, m); } // a lull in the rain
      else { role = 'storm'; chunk = STORM_CHUNK; len = chunk.gen(s, y, d); }
    }
    else { D.stormI++; role = 'rest'; chunk = REST; len = REST.gen(s, y, d, m); D.pos = 0; }
  } else {
    role = SET[D.pos]; D.pos = (D.pos + 1) % SET.length;
    if (role === 'rest' || m < 18) { chunk = REST; if (m < 18) chunk = CHUNKS[0]; len = chunk.gen(s, y, d, m); }
    else {
      const tf = d * 2.3 + (role === 'spike' ? 0.9 : D.pos === 2 ? 0.35 : 0) + (r() - 0.5) * 0.6 - 0.3;
      chunk = pickChunk(s, clamp(Math.round(tf), 0, 3), m);
      len = chunk.gen(s, y, d, m);
      D.last.push(chunk.id); if (D.last.length > 2) D.last.shift();
    }
  }
  s.chunkLog.push({ id: chunk.id, tier: chunk.tier, role, y, m: Math.round(m), len: Math.round(len) });
  if (s.chunkLog.length > 400) s.chunkLog.shift();
  if (role !== 'storm' && role !== 'graft') {
    if (r() < 0.07) s.motes.push({ x: 60 + r() * (W - 120), y: y - len * 0.5, kind: 'dew', r: 13, ph: 0, taken: false });
    if (m > 70 && r() < 0.04) s.motes.push({ x: 60 + r() * (W - 120), y: y - len * 0.75, kind: 'bark', r: 13, ph: 0, taken: false });
  }
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

  // power-up timers
  for (const k of ['pollen', 'ink', 'rush']) {
    if (s.pu[k] > 0) {
      s.pu[k] = Math.max(0, s.pu[k] - dt);
      if (s.pu[k] === 0) { if (k === 'rush') s.invuln = Math.max(s.invuln, 0.9); emit(s, 'puend', { kind: k }); }
    }
  }
  const rush = s.pu.rush > 0;

  // speed and steering
  const frostK = s.inFrost ? 0.62 : 1;
  const target = (SPEED0 + 90 * prog + Math.min(40, Math.max(0, m - 650) * 0.05)) * frostK * (rush ? 1.8 : 1);
  s.speed += (target - s.speed) * Math.min(1, dt * (rush ? 5 : 3));
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
  if (rush) wind *= 0.3;
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

  // the storm: rain feeds the tree (slower drain) while lightning falls
  let inStorm = null;
  for (const z of s.stormZones) if (s.cy < z.y0 && s.cy > z.y1) inStorm = z;
  if (inStorm && !s.storm) { s.storm = inStorm; emit(s, 'storm', { i: inStorm.i }); }
  else if (!inStorm && s.storm) {
    if (s.cy <= s.storm.y1) {
      s.storms++;
      const bonus = addScore(s, 150 * s.mult);
      s.sap = Math.min(SAP_MAX, s.sap + 20);
      emit(s, 'stormend', { bonus, x: s.cx, y: s.cy });
    }
    s.storm = null;
  }

  // energy
  const climb = Math.min(2.2, m / 600);
  const forkK = TUNE.forkDrain * (hasGraft(s, 'wild') ? 1.2 : 1);
  let drain = (TUNE.drain0 + TUNE.drainK * climb) * (s.tips.length === 2 ? forkK : 1) + (s.inFrost ? (s.still > 0 ? 6 : 20) : 0);
  drain *= (hasGraft(s, 'taproot') ? 0.85 : 1) * (s.storm ? 0.7 : 1);
  if (!s.demo && !rush) s.sap -= drain * dt * (s.golden > 0 ? 0.4 : s.still > 0 ? 0.6 : 1);

  // golden hour, Sun Call, pollen and Sap Rush: sunlight drifts to your tips
  if (s.golden > 0 || s.lure > 0 || s.pu.pollen > 0 || rush) attract(s, dt);
  if (s.golden > 0) {
    s.golden -= dt;
    if (s.golden <= 0) { s.golden = 0; s.mult = Math.min(s.mult, 4); emit(s, 'goldenend'); }
  }

  // height score
  const mi = Math.floor(m);
  if (mi > s.heightScored) { addScore(s, (mi - s.heightScored) * s.mult); s.heightScored = mi; }
  const si = stageIndexFor(m);
  if (si > s.stageIdx) {
    s.stageIdx = si; emit(s, 'stage', { idx: si }); s.sap = Math.min(SAP_MAX, s.sap + 15);
    if (s.synergies.includes('spring')) { s.pu.pollen = Math.max(s.pu.pollen, 4); emit(s, 'pickup', { kind: 'pollen', x: s.cx, y: s.cy, spring: true }); }
  }
  if (!s.newBest && s.bestM > 5 && m > s.bestM) { s.newBest = true; emit(s, 'newbest'); }

  // world update + spawning
  while (s.nextBeatY > s.cy - 1500) s.nextBeatY -= spawnBeat(s, s.nextBeatY);
  const slow = s.still > 0 ? 0.25 : 1;
  const bk = hasGraft(s, 'bloom') ? 1.15 : 1;
  for (const b of s.beetles) {
    b.x += b.vx * dt * slow * bk; b.ph += dt * 10 * slow;
    if (b.x < 18) { b.x = 18; b.vx = Math.abs(b.vx); }
    if (b.x > W - 18) { b.x = W - 18; b.vx = -Math.abs(b.vx); }
  }
  for (const f of s.frosts) { f.x += f.vx * dt * slow; f.ph += dt; if (f.x < f.r * 0.5 || f.x > W - f.r * 0.5) f.vx *= -1; }
  for (const br of s.brambles) if (br.kind === 'slide') slideUpdate(br, dt * slow);
  for (const c of s.columns) {
    if (c.kind === 'bolt' && !c.live && s.cy < c.y0 + 330) { c.live = true; s.strikes++; emit(s, 'strike', { x: c.x, y: c.y0, top: c.y1 }); }
  }

  collide(s);
  retract(s, dt);

  const cull = s.cy + 1000;
  s.motes = s.motes.filter((o) => o.y < cull && !o.taken);
  s.beetles = s.beetles.filter((o) => o.y < cull);
  s.frosts = s.frosts.filter((o) => o.y - o.r < cull);
  s.brambles = s.brambles.filter((o) => o.y < cull);
  s.winds = s.winds.filter((o) => o.y1 < cull);
  s.columns = s.columns.filter((o) => o.y1 < cull);
  s.tokens = s.tokens.filter((o) => o.y < cull);
  s.stormZones = s.stormZones.filter((o) => o.y1 < cull || o === s.storm);
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

/** Is a thorn gate (or a column) right ahead of the tips? Used for just-in-time merges. */
function hazardAhead(s, dist) {
  for (const b of s.brambles) if (b.kind !== 'split' && b.y < s.cy && b.y > s.cy - dist) return true;
  for (const c of s.columns) if (c.live && c.y0 < s.cy && c.y0 > s.cy - dist) return true;
  return false;
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
    const jit = hazardAhead(s, 190);
    let bonus = addScore(s, (50 + 20 * staged * s.mult) * (jit ? 1.5 : 1));
    s.mult = Math.min(MAX_MULT, s.mult + 1);
    s.maxMult = Math.max(s.maxMult, s.mult);
    const goldenNow = s.mult === MAX_MULT && s.golden <= 0;
    s.sap = Math.min(SAP_MAX, s.sap + 4 * staged);
    s.merges++;
    s.commits++;
    if (jit) s.jits++;
    if (s.charm && s.charge < CHARMS[s.charm].charge) { s.charge++; if (s.charge === CHARMS[s.charm].charge) emit(s, 'charged', { charm: s.charm }); }
    mc.commits.push({ i: 0, kind: 'merge', born: s.t });
    emit(s, 'merge', { x: s.cx, y: s.cy, staged, bonus, mult: s.mult, jit });
    if (goldenNow) startGolden(s);
  } else {
    if (hasGraft(s, 'pollen') && s.mult > 1) s.mult--;
    emit(s, 'emptymerge', { x: s.cx, y: s.cy });
  }
}

function startGolden(s) { s.golden = GOLDEN_SEC; s.goldens++; emit(s, 'golden', { x: s.cx, y: s.cy }); }
function bumpMult(s) {
  s.mult = Math.min(MAX_MULT, s.mult + 1); s.maxMult = Math.max(s.maxMult, s.mult);
  if (s.mult === MAX_MULT && s.golden <= 0) startGolden(s);
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
  emit(s, 'revert', { x: tip.x, y: s.cy, lost, src: s.lastHitSrc });
}

function hit(s, tipIdx, dmg, src = '') {
  s.lastHitSrc = src;
  if (s.invuln > 0 || s.pu.rush > 0) return;
  const tip = s.tips[tipIdx];
  if (s.shield) {
    s.shield = false; s.invuln = 1; s.blocks++;
    emit(s, 'shieldbreak', { x: tip.x, y: s.cy });
    return;
  }
  s.hits++;
  s.graze = 0;
  if (s.tips.length === 2) { revert(s, tipIdx); return; }
  if (hasGraft(s, 'crown')) dmg *= 1.5;
  if (!s.demo) s.sap -= dmg;
  s.mult = 1;
  s.invuln = 1.0;
  s.chain = 0;
  s.heading *= -0.4;
  const p = s.paths[tip.path];
  s.scars.push({ x: tip.x, y: s.cy, path: p.id, i: p.pts.length - 1 });
  emit(s, 'hit', { x: tip.x, y: s.cy, dmg: Math.round(dmg), src });
}

function collide(s) {
  s.inFrost = false;
  const y = s.cy, py = s.prevCy, R = tipR(s);
  for (let ti = s.tips.length - 1; ti >= 0; ti--) {
    if (ti >= s.tips.length) continue;
    const tip = s.tips[ti];
    const x = tip.x;
    for (const o of s.motes) {
      if (o.taken) continue;
      const dx = o.x - x, dy = o.y - y, rr = o.r + TIP_R + 4;
      if (dx * dx + dy * dy < rr * rr) collect(s, o, tip);
    }
    for (const g of s.tokens) {
      if (g.taken) continue;
      const dx = g.x - x, dy = g.y - y, rr = g.r + TIP_R + 6;
      if (dx * dx + dy * dy < rr * rr) takeGraft(s, g);
    }
    for (const f of s.frosts) {
      const dx = f.x - x, dy = f.y - y;
      if (dx * dx + dy * dy < f.r * f.r * 0.7) s.inFrost = true;
    }
    for (const b of s.beetles) {
      const dx = b.x - x, dy = b.y - y, rr = b.r + R - 3;
      if (dx * dx + dy * dy < rr * rr) { hit(s, ti, 24, 'beetle'); break; }
    }
    if (ti >= s.tips.length) continue;
    for (const c of s.columns) {
      if (!c.live || y > c.y0 + 2 || y < c.y1 - 2) continue;
      if (Math.abs(x - c.x) < c.hw + R - 3) { hit(s, ti, c.kind === 'bolt' ? 26 : 22, c.kind); break; }
    }
    if (ti >= s.tips.length) continue;
    for (const br of s.brambles) {
      if (br.y > py + 10 || br.y < y - 10) continue;
      if (Math.abs(br.y - y) > 9) continue;
      for (const [a, b] of br.solids) {
        if (x > a - R + 3 && x < b + R - 3) { hit(s, ti, 30, br.kind); break; }
      }
      if (ti >= s.tips.length) break;
    }
  }
  // near misses (checked once per object as the tips cross its height)
  for (const b of s.beetles) {
    if (b.passed || !(b.y >= y && b.y < py)) continue;
    b.passed = true;
    if (s.invuln > 0 || s.pu.rush > 0) continue;
    let best = 1e9;
    for (const tip of s.tips) best = Math.min(best, Math.abs(tip.x - b.x));
    if (best < 50 && best > b.r + R - 3) nearMiss(s, b.x, b.y);
  }
  for (const c of s.columns) {
    if (c.passed || !c.live || !(c.y1 >= y && c.y1 < py)) continue;
    c.passed = true;
    if (s.invuln > 0 || s.pu.rush > 0) continue;
    let best = 1e9, straddle = s.tips.length === 2 && s.tips[0].x < c.x && s.tips[1].x > c.x;
    for (const tip of s.tips) best = Math.min(best, Math.abs(tip.x - c.x) - c.hw);
    if (straddle) { const bonus = addScore(s, 40 * s.mult); s.splits++; emit(s, 'straddle', { x: c.x, y: c.y1, bonus }); }
    else if (best < 30) nearMiss(s, c.x, c.y1);
  }
  for (const br of s.brambles) {
    if (br.passed || !(br.y >= y && br.y < py)) continue;
    br.passed = true;
    if (s.invuln > 0 || s.pu.rush > 0) continue;
    let close = false;
    for (const tip of s.tips) for (const [a, b] of br.gaps) {
      if (tip.x > a && tip.x < b && (tip.x - a < 26 || b - tip.x < 26)) close = true;
    }
    if (br.kind === 'split' && s.tips.length === 2) {
      const bonus = addScore(s, 40 * s.mult);
      s.splits++;
      emit(s, 'splitpass', { x: s.cx, y: br.y, bonus });
    } else if (close) nearMiss(s, s.cx, br.y);
  }
}

function nearMiss(s, x, y) {
  // close calls chain: each one inside 2.5 s of the last pays more
  s.nearMisses++;
  s.graze = s.t - s.lastNear < 2.5 ? s.graze + 1 : 1;
  s.lastNear = s.t;
  s.grazeBest = Math.max(s.grazeBest, s.graze);
  const shave = hasGraft(s, 'shave');
  const bonus = addScore(s, 15 * s.mult * Math.min(5, s.graze) * (shave ? 3 : 1));
  if (shave) s.sap = Math.min(SAP_MAX, s.sap + 3);
  if (s.graze % 3 === 0) {
    s.sap = Math.min(SAP_MAX, s.sap + 4);
    if (s.synergies.includes('briar')) bumpMult(s);
    emit(s, 'graze', { x, y, n: s.graze });
  }
  emit(s, 'near', { x, y, bonus, n: s.graze });
}

function collect(s, o, tip) {
  o.taken = true;
  if (o.kind === 'sun') {
    s.chain++;
    s.chainTimer = 1.3;
    s.commits++;
    const pts = addScore(s, 10 * s.mult * (s.golden > 0 ? 2 : 1));
    // a little mercy when sap runs low (never changes the course itself)
    const sap = Math.max(TUNE.moteSapMin, TUNE.moteSap0 - heightM(s) / 150) * (s.sap < 25 ? 1.3 : 1);
    s.sap = Math.min(SAP_MAX, s.sap + sap);
    if (s.tips.length === 2) tip.staged += hasGraft(s, 'wild') ? 2 : 1;
    const p = s.paths[tip.path];
    p.commits.push({ i: p.pts.length - 1, kind: 'commit', born: s.t });
    emit(s, 'collect', { x: o.x, y: o.y, chain: s.chain, pts, forked: s.tips.length === 2 });
    const tr = o.trail && s.trails.get(o.trail);
    const need = hasGraft(s, 'bloom') ? 3 : BLOOM_MIN;
    if (tr && ++tr.got >= tr.n) {
      s.trails.delete(o.trail);
      if (tr.n >= need) {
        const bonus = addScore(s, 15 * tr.n * s.mult);
        s.sap = Math.min(SAP_MAX, s.sap + 4 + (hasGraft(s, 'bloom') ? 6 : 0));
        s.blooms++;
        p.commits.push({ i: p.pts.length - 1, kind: 'bloom', born: s.t });
        emit(s, 'bloom', { x: tip.x, y: s.cy, n: tr.n, bonus });
        if (s.synergies.includes('orchard')) bumpMult(s);
      }
    }
  } else if (o.kind === 'dew') {
    s.sap = Math.min(SAP_MAX, s.sap + (hasGraft(s, 'taproot') ? 15 : 30));
    addScore(s, 25 * s.mult);
    emit(s, 'dew', { x: o.x, y: o.y, sap: hasGraft(s, 'taproot') ? 15 : 30 });
  } else if (o.kind === 'acorn') {
    s.acorns++;
    addScore(s, 5 * s.mult);
    emit(s, 'acorn', { x: o.x, y: o.y, n: s.acorns });
  } else if (o.kind === 'bark') {
    s.shield = true;
    emit(s, 'shield', { x: o.x, y: o.y });
  } else if (PICKUPS[o.kind]) {
    const dur = PICKUPS[o.kind].dur * (hasGraft(s, 'pollen') ? 1.5 : 1);
    const was = s.pu[o.kind] > 0;
    s.pu[o.kind] = Math.min(dur * 2, s.pu[o.kind] + dur);
    s.pickups++;
    if (o.kind === 'rush') s.rushes++;
    const active = Object.values(s.pu).filter((v) => v > 0).length;
    emit(s, 'pickup', { kind: o.kind, x: o.x, y: o.y, extended: was, stacked: active });
  }
}

function takeGraft(s, g) {
  g.taken = true;
  // the other medallion of this gate fades unless the second tip is about to take it
  if (s.grafts.includes(g.id)) {
    const bonus = addScore(s, 300 * s.mult);
    s.sap = Math.min(SAP_MAX, s.sap + 20);
    emit(s, 'graft', { id: g.id, x: g.x, y: g.y, again: true, bonus });
    return;
  }
  s.grafts.push(g.id);
  emit(s, 'graft', { id: g.id, x: g.x, y: g.y });
  for (const [sid, sy] of Object.entries(SYNERGIES)) {
    if (!s.synergies.includes(sid) && sy.of.every((id) => s.grafts.includes(id))) { s.synergies.push(sid); emit(s, 'synergy', { id: sid, x: g.x, y: g.y }); }
  }
}

function attract(s, dt) {
  // golden hour, Sun Call, pollen and Sap Rush: sunlight (and acorns) drift to the nearest tip
  const reach = s.pu.rush > 0 ? 190 : (s.tips.length === 2 && s.pu.pollen > 0 ? 190 : 150);
  for (const o of s.motes) {
    if ((o.kind !== 'sun' && o.kind !== 'acorn') || o.taken || o.y < s.cy - 220 || o.y > s.cy + 30) continue;
    let bt = null, bd = reach * reach;
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
    pickups: s.pickups,
    rushes: s.rushes,
    grafts: s.grafts.length,
    graftIds: s.grafts.slice(),
    synergies: s.synergies.slice(),
    storms: s.storms,
    grazeBest: s.grazeBest,
    jits: s.jits,
    stage: STAGES[s.stageIdx].name,
    time: s.t,
    hash: treeHash([s.seed, Math.floor(s.score), ...pts]),
  };
}
