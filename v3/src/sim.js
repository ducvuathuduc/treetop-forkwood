// Forkwood simulation: pure, deterministic, no DOM. Shared by the browser game
// and the headless auto-playtest bot (tests/balance.mjs).
import { mulberry32, clamp, treeHash } from './rng.js';
// P6-TRAPS: ten traps + difficulty director knobs (src/traps.js, src/director.js)
import { TRAP_CHUNKS, trapChunkFor, trapsUpdate, trapsCollide, trapWind, trapsCull, WARN_LEAD } from './traps.js';
const TRAP_W = 1.4; // trap chunks are a little more common than the classic ones (tuned with tests/balance.mjs)
// /P6-TRAPS
// V2-MECH: worlds, 15 more traps, rides, pickups, critter skills, rings, set pieces
import { WORLD_MECH, DEFAULT_WORLD, worldMech, hasMech, trapSkin, hazardSkin } from './world-mech.js';
import { TRAP2_CHUNKS, traps2Update, traps2Collide, vortexWind, rowAhead2, breakTrapAhead, MECH2 } from './traps2.js';
import { RIDES, mount as rideMount, dismount as rideDismount, rideHit, rideMods, rideStep, rideAir, railTarget, rideCatchXs, ridePick, addRideKnot } from './rides.js';
import { SKILLS, makeSkill, fireSkill, skillTick, skillMergeCut, skillEffects, skillReady } from './skills.js';
import { ringAt, ringOffer, takeRing, addKnot, ringLevel, knotAcornK, knotScoreK, ringCatchK, ringJitK, ringJitMult, ringLuck, ringGolden, ringAcornK, ringEcho, ringDancer, ringEmber, ringCrow, OFFER_SLOW, KNOTS } from './rings.js';
import { spOpen, spChunk, spUpdate, hollowYs, openHollow } from './setpieces.js';
// V3-FEEL: combo, flow, input buffer, coyote merge, last gasp, signature currents, choice lanes, finisher
import { feelInit, feelInput, feelPost, feelGasp, feelSigBeat, feelLanes, feelCollect, feelSapK, feelCoyote, feelPassed, feelDeath, turnK, grazeK, scoreTierK, surgeV } from './feel.js';
export const MECH_TUNE = { trap2W: 1.0, rideChance: 0.06, rideGapM: 150, rideFirstM: 120, calmSap: 0.35, lateSpan: 420 };
// /V2-MECH

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
  roots: { name: 'Deep Roots', charge: 5, dur: 0,   blurb: '+25 sap at once, but your combo drops by 2.' },
  still: { name: 'Stillness',  charge: 3, dur: 4,   blurb: 'For 4 s beetles, frost, wind and sliding thorns slow to a crawl and sap drains slower.' },
};

// Power-ups found in the tree (short, stackable: picking one up again adds time).
export const PICKUPS = {
  pollen: { name: 'Pollen', dur: 6, blurb: 'sunlight drifts to your tips' },
  ink:    { name: 'Ink ×2', dur: 8, blurb: 'double points' },
  rush:   { name: 'Sap Rush', dur: 3, blurb: 'surge upward, nothing can hurt you' },
  // V2-MECH: nine more (MECHANICS.md §2.1); durations scale with the Wild Kit upgrade
  lantern: { name: 'Firefly Lantern', dur: 10, blurb: 'warnings come earlier · night sunlight ×1.5', rarity: 'uncommon', wild: true },
  bubble:  { name: 'Dew Bubble', dur: 12, blurb: 'absorbs the next hit', rarity: 'common', wild: true },
  shears:  { name: 'Pruning Shears', dur: 9, blurb: 'the next 3 thorns are cut, not felt', rarity: 'uncommon', wild: true },
  prism:   { name: 'Sun Prism', dur: 7, blurb: 'every sunlight counts twice', rarity: 'rare', wild: true },
  twin:    { name: 'Twin Seed', dur: 6, blurb: 'a free wide fork with no extra drain', rarity: 'uncommon', wild: true },
  amber:   { name: 'Amber Hourglass', dur: 5, blurb: 'the world slows, you do not', rarity: 'rare', wild: true },
  acornrain: { name: 'Acorn Rain', dur: 3, blurb: 'a fountain of acorns', rarity: 'common', wild: true },
  goldleaf: { name: 'Golden Leaf', dur: 8, blurb: 'your combo cannot break', rarity: 'uncommon', wild: true },
  sail:    { name: 'Leaf Sail', dur: 9, blurb: 'wind pushes you faster, never into thorns', rarity: 'common', wild: true },
  // /V2-MECH
};
export const PICKUP_IDS2 = ['lantern', 'bubble', 'shears', 'prism', 'twin', 'amber', 'acornrain', 'goldleaf', 'sail'];
const PU_W = { common: 50, uncommon: 25, rare: 10 };

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

// Run rules: every mode, stake and quest level is the same sim with a few knobs.
// The default (an empty rules object) is the classic Sapling run.
export const RULES = {
  drain: 1,        // sap drain multiplier
  hazard: 0,       // added to the director's intensity (ramps in over the first 150 m)
  speed: 1,        // growth speed multiplier
  beetle: 1,       // beetle speed multiplier
  dmg: 1,          // hit damage multiplier
  score: 1,        // points multiplier (stakes and modes)
  oneHit: false,   // Hardcore: any hit ends the run
  noDeath: false,  // Zen: sap never runs out
  timeLimit: 0,    // Sprint: the run ends after this many seconds
  finishM: 0,      // a finish line (metres); reaching it ends the run as a win
  script: null,    // quest level: an exact list of chunks (deterministic, pre-built)
  d: null,         // quest level: fixed intensity for every chunk
  biome: 0,        // metres added for the look and the stage name (quest worlds)
  climb: 0,        // metres added to the drain curve (quest worlds feel like their height)
  storms: null,    // Storm Rush: a custom storm list
  restSwap: 0,     // Ancient: every Nth rest glade becomes a spike instead
  noGrafts: false,
  // P6-SEASONS: seasonal modifiers (src/seasons.js); defaults are no-ops, never set in fair modes
  slip: 0,         // Winter Snow: steering responds slower (0..1)
  windK: 1,        // Autumn Maple: wind band force multiplier
  fireflies: 0,    // Firefly Night: extra sunlight motes (own rng stream, course unchanged)
  envelopes: 0,    // Tết: some acorns become red envelopes worth 3
  // /P6-SEASONS
  // P8-ECON: stakes reward skill with sap (expert play) and punish hits harder
  bloomSap: 0,     // extra sap for every full bloom
  mergeSap: 1,     // multiplier on the sap a scoring merge gives back
  drainAdd: 0,     // flat sap drain per second added from the ground up
  lateK: 1,        // multiplier on the height part of the drain curve
  // /P8-ECON
};
export function makeRules(r = {}) { return { ...RULES, ...r }; }

// Balance knobs (tuned with tests/balance.mjs).
export const TUNE = {
  drain0: 5.0,      // sap drain per second at ground level (P6-TRAPS: 4.6 -> 5.0)
  drainK: 7.3,      // extra drain per second per 600 m climbed (P6-TRAPS: 5.8 -> 6.9; V2-MECH: 7.3, rides and set pieces give back)
  forkDrain: 1.4,   // drain multiplier while two tips grow
  moteSap0: 7.0,    // sap from one sunlight mote at ground level
  moteSapMin: 4.8,  // sap from one mote high up
  hazardK: 1.0,     // scales the director's intensity curve
  drainLate: 6.0,   // extra drain per second phased in between 280 m and 700 m (P6-TRAPS: 2.6 -> 3.8; V2-MECH: 6.0)
};

// P6-TRAPS: hand-built quest levels were balanced on the pass-5 drain; they keep it
export const TUNE_QUEST = { drain0: 4.6, drainK: 5.8, drainLate: 2.6 };

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
    mercy: !!opts.mercy, // P0-FTUE: the very first run (set by main.js only) forgives the sap meter while it teaches
    demo: !!opts.demo,
    pure: !!opts.pure,
    R: makeRules(opts.rules),
    won: false,
    end: '',
    finishM: 0,
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
    dir: { pos: 0, last: [], graftI: 0, stormI: 0, stormOpen: -1, gateN: 0, si: 0, script: null, rests: 0 },
    chunkLog: [],
    pu: { pollen: 0, ink: 0, rush: 0, lantern: 0, bubble: 0, shears: 0, prism: 0, twin: 0, amber: 0, acornrain: 0, goldleaf: 0, sail: 0 },
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
    // P6-TRAPS
    traps: [],
    trapSeen: {},
    crowSteals: 0,
    // director: hidden difficulty offset in [-0.15, 0.15]; only ever set for personal, unseeded runs
    dk: opts.director && !opts.pure && !opts.rules?.script ? clamp(+opts.director.k || 0, -0.15, 0.15) : 0,
    // /P6-TRAPS
    // P8-ECON: boosts, upgrades, grower multiplier, word-hunt letter and gem drops (never on pure runs)
    econ: !opts.pure && opts.econ ? opts.econ : null,
    gems: 0, letter: null, revives: 0, drops: [],
    // /P8-ECON
    // V2-MECH: world, rides, skills, rings, knots, set pieces, loot (see src/world-mech.js and friends)
    world: WORLD_MECH[opts.world] ? opts.world : DEFAULT_WORLD,
    ride: null, ridesTaken: 0, rideKnots: 0, gooseUsed: false, lastRideM: -999,
    skill: null, rings: [], knots: [], ringGates: {}, sapMaxV: SAP_MAX,
    spList: [], sp: null, boss: null, loot: [], hollows: [], timeScale: 1, slowmo: 0, slowK: 0.5,
    webT: 0, invertT: 0, burnT: 0, shellT: 0, owlT: 0, decoy: 0, decoyX: 0, mothT: 0, hornT: 0, hornN: 0, dashT: 0, warnBonus: 0, bubble: false, shears: 0, acornFrac: 0,
    stat: { cuts: 0, eggs: 0, rideHits: 0, foils: 0, skills: 0, torn: 0 },
    // /V2-MECH
  };
  if (s.econ) applyEcon(s); // P8-ECON
  s.feelS = feelInit(s, opts); // V3-FEEL ('v2' turns the layer off; pure runs always use the default)
  // V2-MECH: skills, opt-in curses and Knot Hollows (skills and knots never on pure runs)
  if (!s.pure && !opts.rules?.script) {
    const sk = makeSkill(opts.skill);
    if (sk) { s.skill = sk; s.charm = null; }
    for (const k of opts.curses || []) addKnot(s, k, API2);
  }
  if (!opts.rules?.script) s.hollows = hollowYs(s, 3000);
  // /V2-MECH
  const main = newPath(s, W / 2, 40, -1);
  main.pts.push({ x: W / 2, y: 0, t: 0 });
  s.tips.push({ x: W / 2, side: 0, path: main.id, staged: 0 });
  s.stageIdx = stageIndexFor(s.R.biome);
  if (s.R.finishM) s.finishM = s.R.finishM;
  if (s.R.script) {
    // a quest level is built in full up front: same seed, same level, every time
    s.dir.script = expandScript(s.R.script);
    while (s.dir.si < s.dir.script.length) s.nextBeatY -= spawnBeat(s, s.nextBeatY);
    s.finishM = Math.round(-s.nextBeatY / PX_PER_M) - 4;
  }
  return s;
}

// P8-ECON: run-start effects of the economy (src/economy.js builds opts.econ)
const UP_PER = { pollen: 0.15, ink: 0.15, rush: 0.12, golden: 0.10, dew: 0.08, wild: 0.087, rides: 0.08 }; // V2-MECH: Wild Kit, Rides
export const upK = (s, id) => 1 + (s.econ && s.econ.up ? (UP_PER[id] || 0) * (s.econ.up[id] | 0) : 0);
function applyEcon(s) {
  const E = s.econ, b = E.boosts || [];
  if (E.mult > 1) s.R.score *= E.mult;
  if (b.includes('ink')) s.R.score *= 1.5;
  if (b.includes('mega')) s.pu.rush = 18; else if (b.includes('sprout')) s.pu.rush = 8;
  if (b.includes('pollen')) s.pu.pollen = 15;
  if (b.includes('bark')) s.shield = true;
  const r4 = mulberry32((s.seed ^ 0x2545f491) >>> 0); // own stream: the course never shifts
  if (E.letter) s.drops.push({ y: -(60 + r4() * 100) * PX_PER_M, x: 80 + r4() * (W - 160), letter: E.letter });
  if (b.includes('ride')) s.rideStart = true; // V2-MECH: Ride Token boost (mounted at 10 m)
  if (E.gemDrop && r4() < 0.10 && E.hollowGems === false) s.drops.push({ y: -(250 + r4() * 350) * PX_PER_M, x: 80 + r4() * (W - 160), gem: true });
}
/** Second chance: bring a run that just ran out of sap back to life (main.js charges the gems). */
export function revive(s) {
  if (!s.dead || s.won) return false;
  s.dead = false; s.deathT = 0; s.end = ''; s.revives++;
  s.sap = 70; s.invuln = 2.5; s.pu.rush = Math.max(s.pu.rush, 1.5);
  const ahead = s.cy - 700; // clear what was right on top of the tip
  const keep = (y) => y > s.cy + 40 || y < ahead;
  s.brambles = s.brambles.filter((o) => keep(o.y)); s.beetles = s.beetles.filter((o) => keep(o.y));
  s.columns = s.columns.filter((o) => keep(o.y0) && keep(o.y1)); s.traps = s.traps.filter((o) => o.kind === 'label' || keep(o.y ?? o.y0));
  for (const tip of s.tips) { const p = s.paths[tip.path]; p.state = 'live'; }
  emit(s, 'revive', { x: s.cx, y: s.cy, n: s.revives });
  return true;
}
// /P8-ECON

function newPath(s, x, y, parent) {
  const p = { id: s.paths.length, parent, pts: [{ x, y, t: s.t }], commits: [], state: 'live', born: s.t, endT: 0 };
  s.paths.push(p);
  return p;
}

export const heightM = (s) => Math.max(0, -s.cy / PX_PER_M);
/** Metres used for the look and stage names (quest worlds start in their biome). */
export const biomeM = (s) => heightM(s) + s.R.biome;
export const hasGraft = (s, id) => s.grafts.includes(id);
const tipR = (s) => TIP_R + (hasGraft(s, 'shave') ? 2 : 0);
const scoreK = (s) => scoreTierK(s) /* V3-FEEL combo tier */ * (s.pu.ink > 0 ? 2 : 1) * (hasGraft(s, 'crown') ? 1.25 : 1) * s.R.score * (s.knots.length ? knotScoreK(s) : 1);
/** V2-MECH: max sap (Deep Sap ring raises it). */
export const sapMax = (s) => s.sapMaxV || SAP_MAX;
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
    s.motes.push({ x, y: y0 - i * 44, kind: 'sun', r: 11, ph: r() * 6.28, taken: false, trail, bonus: opts.bonus || 0 });
  }
}

function addTwinTrail(s, y0, cx, nOpt, bonus = 0) {
  // Two parallel rows exactly one fork-width apart: a reward for forking.
  const r = s.rng;
  cx = clamp(cx, FORK_SPREAD + 40, W - FORK_SPREAD - 40);
  const n = nOpt ?? 4 + Math.floor(r() * 3);
  const trail = newTrail(s, n * 2);
  for (let i = 0; i < n; i++) {
    for (const side of [-1, 1]) {
      s.motes.push({ x: cx + side * FORK_SPREAD, y: y0 - i * 46, kind: 'sun', r: 11, ph: r() * 6.28, taken: false, trail, bonus });
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
  s.brambles.push({ y, solids, gaps: [[gapCx - gapW / 2, gapCx + gapW / 2]], kind: 'gate', passed: false, seed: s.rng() * 1000, skin: hazardSkin(s.world, 'gate') });
  if (motes) for (let i = 0; i < 3; i++) s.motes.push({ x: gapCx, y: y + 60 - i * 60, kind: 'sun', r: 11, ph: s.rng() * 6.28, taken: false });
  s.lastGate = { y, x: gapCx };
}

function addSplit(s, y, px, gapW) {
  // Two gaps either side of a central pillar; forked tips fit both at once.
  const half = 34;
  px = clamp(px, half + gapW + 12, W - half - gapW - 12);
  const solids = [[0, px - half - gapW], [px - half, px + half], [px + half + gapW, W]];
  const gaps = [[px - half - gapW, px - half], [px + half, px + half + gapW]];
  s.brambles.push({ y, solids, gaps, kind: 'split', passed: false, seed: s.rng() * 1000, px, skin: hazardSkin(s.world, 'split') });
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
  const br = { y, solids: [], gaps: [], kind: 'slide', passed: false, seed: s.rng() * 1000, base: cx, amp, w: (Math.PI * 2) / period, ph: s.rng() * 6.28, gapW, clock: 0, skin: hazardSkin(s.world, 'slide') };
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
  s.columns.push({ x, y0: yBottom, y1: yBottom - len, hw: COLUMN_HW, kind, live: kind !== 'bolt', passed: false, seed: s.rng() * 1000, skin: hazardSkin(s.world, kind) });
  s.lastGate = null;
  return x;
}

function addBeetle(s, x, y, speed) {
  const sp = speed * (s.rng() < 0.5 ? -1 : 1);
  s.beetles.push({ x: clamp(x, 40, W - 40), y, vx: sp, ph: s.rng() * 6.28, passed: false, r: 14, skin: hazardSkin(s.world, 'beetle') });
}

function addPickup(s, x, y, kind) {
  // V2-MECH: half the power-ups are the classic three, half the nine new ones (by rarity)
  if (!kind) { const q = s.rng(); kind = s.R.script ? (q < 0.4 ? 'pollen' : q < 0.75 ? 'ink' : 'rush') /* quest levels keep their v1 power-ups */ : q < 0.2 ? 'pollen' : q < 0.375 ? 'ink' : q < 0.5 ? 'rush' : pickWeighted2((q - 0.5) * 2, s); }
  s.motes.push({ x: clamp(x, 50, W - 50), y, kind, r: 15, ph: s.rng() * 6.28, taken: false, pickup: true, skin: 'pickup.' + kind });
}
function pickWeighted2(q, s) {
  const ids = PICKUP_IDS2.filter((id) => id !== 'sail' || s.world === 'ukiyo' || s.world === 'meadow' || s.world === 'starry');
  const ws = ids.map((id) => PU_W[PICKUPS[id].rarity]); let t = q * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) { t -= ws[i]; if (t <= 0) return ids[i]; }
  return ids[ids.length - 1];
}
export const randomPickup2 = (r) => { const q = r(); return q < 0.5 ? ['pollen', 'ink', 'rush'][Math.floor(q * 6)] : PICKUP_IDS2[Math.floor((q - 0.5) * 2 * PICKUP_IDS2.length)]; };

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
export function intensity(m, add = 0) {
  if (m < 18) return 0;
  // the opening minute (to ~300 m) is unchanged; after it the pressure rises
  // much faster (1.0 by ~475 m instead of 618 m) and keeps rising late
  const base = m < 300 ? (m - 18) / 600 : Math.min(1, 0.47 + (m - 300) / 330);
  return (base + 0.6 * clamp((m - 560) / 700, 0, 1) + add * clamp((m - 18) / 150, 0, 1)) * TUNE.hazardK;
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
  // ---- pass 4: late combos (two biome ideas at once)
  { id: 'frostgate', tier: 3, minM: 420, sig: 'Bough', w: 0.9, gen(s, y, d) {
    // a frost cloud sits in the run-up, just off the line to the gap: swerve
    // round it and still line up with the gate (or take the cold way through)
    const gx = reachableX(s, y - 330, 130 + s.rng() * (W - 260)), gw = Math.max(166, 200 - d * 20);
    const fr = 56 + d * 12, off = (gx < W / 2 ? 1 : -1) * (30 + s.rng() * 30);
    s.frosts.push({ x: clamp(gx + off, fr * 0.6, W - fr * 0.6), y: y - 90, r: fr, vx: 0, ph: s.rng() * 6.28 });
    addTrail(s, y, { n: 4, cx: clamp(gx - off * 3, 60, W - 60), amp: 24 });
    addGate(s, y - 330, gx, gw, false);
    return 700;
  } },
  { id: 'swarmsplit', tier: 3, minM: 460, w: 0.9, gen(s, y, d) {
    // beetles patrol the run-up to a split gate: fork late, or weave and fork
    addTrail(s, y, { n: 4 });
    for (let i = 0; i < 2; i++) addBeetle(s, 80 + ((i * 0.5 + s.rng() * 0.3) % 1) * (W - 160), y - 70 - i * 120, 55 + s.rng() * 35 + d * 35);
    addSplit(s, y - 400, reachableX(s, y - 400, 160 + s.rng() * (W - 320)), Math.max(106, 116 - d * 8));
    return 720;
  } },
  { id: 'slidercolumn', tier: 3, minM: 700, sig: 'Cloudline', w: 1, gen(s, y, d) {
    // a drifting gap, then a column to straddle
    addSlider(s, y, 150 + s.rng() * (W - 300), Math.max(180, 205 - d * 18), 50, 5.4);
    const len = 320;
    const x = addColumn(s, 150 + s.rng() * (W - 300), y - 340, len);
    addTwinTrail(s, y - 360, x, 4);
    return 340 + len + 120;
  } },
  // P6-TRAPS: trap chunks (src/traps.js), weighted ×1.4 over the classic chunks; a combo whose traps were not met yet plays the missing trap's intro
  ...TRAP_CHUNKS.map((c) => ({ id: c.id, tier: c.tier, minM: c.minM, w: c.w * TRAP_W, sig: c.sig, trap: c.trap, mechs: c.needs ? c.needs.slice() : c.trap.split('+').filter((q) => q !== 'beetle'),
    gen(s, y, d, m) { const k = trapChunkFor(s, c); if (k !== c) s.trapSwap = k.id; return k.gen(s, y, d, TRAP_API); } })),
  // /P6-TRAPS
  // V2-MECH: the 15 new mechanics (src/traps2.js) and per-world combos; a world only grows its own trap set
  ...TRAP2_CHUNKS.map((c) => ({ id: c.id, tier: c.tier, minM: c.minM, w: c.w * TRAP_W, trap: c.trap, mechs: [c.trap], t2: true,
    gen(s, y, d, m) { return c.gen(s, y, d, TRAP_API); } })),
  ...comboChunks(),
  // /V2-MECH
];
/** V2-MECH: two trap ideas in one chunk (Cloudline-style combos), built for every world from its own set. */
function comboChunks() {
  const pairs = new Map();
  for (const w of Object.values(WORLD_MECH)) {
    const ms = w.traps.map((t) => t.mech).filter((q) => q !== 'tide' && q !== 'lure');
    // three combos per world: neighbours in its list (stable, readable pairs)
    for (let i = 0; i < 3; i++) { const a = ms[(i * 2) % ms.length], b = ms[(i * 2 + 3) % ms.length]; if (a !== b) pairs.set(`${a}+${b}`, [a, b]); }
  }
  const single = (id) => TRAP2_CHUNKS.find((c) => c.trap === id) || TRAP_CHUNKS.find((c) => c.trap === id && !c.needs);
  return [...pairs.values()].map(([a, b]) => ({ id: `c2_${a}_${b}`, tier: 3, minM: 420, w: 0.8 * TRAP_W, trap: `${a}+${b}`, mechs: [a, b], needs: [a, b], t2: true,
    gen(s, y, d, m) {
      const miss = [a, b].find((q) => !s.trapSeen[q]);
      if (miss) { const c = single(miss); s.trapSwap = c.id; return c.gen(s, y, d, TRAP_API); }
      const l1 = single(a).gen(s, y, d, TRAP_API);
      s.lastGate = null;
      return l1 - 60 + single(b).gen(s, y - l1 + 60, d, TRAP_API);
    } }));
}
export const CHUNK = Object.fromEntries(CHUNKS.map((c) => [c.id, c]));
// P6-TRAPS: the primitives traps.js may use (functions are hoisted)
const TRAP_API = { addTrail, addTwinTrail, addGate, addBeetle, newTrail, reachableX, emit, addScore,
  hit: (s, ti, dmg, src) => hit(s, ti, dmg, src), nearMiss: (s, x, y) => nearMiss(s, x, y), tipR: (s) => tipR(s),
  acorns: (s, n, x, y, p, q) => addAcorns(s, n, x, y, p, q), ringCrow: (s) => ringCrow(s) };
// /P6-TRAPS
// V2-MECH: the wider api for rides, skills, rings and set pieces
const API2 = { ...TRAP_API,
  mergeNow: (s) => { if (s.tips.length === 2) { s.forked = false; s.spread = 0; merge(s); } },
  upK: (s, id) => upK(s, id), sapMax: (s) => sapMax(s), bumpMult: (s) => bumpMult(s), takeGraft: (s, g) => takeGraft(s, g),
  addRideKnot: (s, x, y, id) => addRideKnot(s, x, y, id), mount: (s, id, why) => rideMount(s, id, API2, why),
  ridePick: (s, r) => ridePick(s.world, heightM(s), r, { gooseUsed: s.gooseUsed }),
  randomPickup: (r) => randomPickup2(r), givePickup: (s, k, x, y) => givePickup(s, k, x, y),
  clearAhead: (s, dist) => clearAhead(s, dist), breakAhead: (s, reach) => breakAhead(s, reach),
  crushNear: (s, r) => crushNear(s, r), stunBeetles: (s, r, t) => stunBeetles(s, r, t),
  tongue: (s, reach, n) => tongue(s, reach, n), pull: (s, reach) => pull(s, reach),
  worldChunk: (s, y, d, m, maxTier) => { s.trapSwap = null; const c = pickChunk(s, maxTier, m, maxTier); const len = c.gen(s, y, d, m); s.dir.last.push(s.trapSwap || c.id); if (s.dir.last.length > 2) s.dir.last.shift(); return len; },
};
const inAhead = (s, y, dist) => y < s.cy + 30 && y > s.cy - dist;
/** The hazard-free stretch after a dismount: clear everything that can hurt in the next `dist` units. */
function clearAhead(s, dist) {
  const keep = (y) => !inAhead(s, y, dist);
  s.brambles = s.brambles.filter((o) => keep(o.y)); s.beetles = s.beetles.filter((o) => keep(o.y));
  s.columns = s.columns.filter((o) => keep(o.y0) && keep(o.y1)); s.frosts = s.frosts.filter((o) => keep(o.y));
  s.traps = s.traps.filter((o) => o.kind === 'label' || o.kind === 'tide' || (o.kind === 'gust' ? keep(o.y0) : keep(o.y ?? o.y0)));
  if (s.boss && s.boss.atk) { s.boss.atk = null; s.boss.t = Math.max(s.boss.t, 2); }
}
/** Smash the next hazard object ahead (Stag snap, Updraft Dash lv4+). Returns what broke. */
function breakAhead(s, reach) {
  let best = null, by = -1e9;
  const cand = (o, y, kind) => { if (y < s.cy + 20 && y > s.cy - reach && y > by) { best = { o, kind }; by = y; } };
  for (const b of s.brambles) if (!b.broken) cand(b, b.y, 'bramble');
  for (const c of s.columns) if (c.live) cand(c, c.y0, 'column');
  for (const b of s.beetles) if (!b.dead) cand(b, b.y, 'beetle');
  for (const t of s.traps) if (['twig', 'pulse', 'door', 'cap', 'wall', 'twins', 'crow'].includes(t.kind) && !t.broken) cand(t, t.y ?? t.y0, t.kind);
  const t2 = breakTrapAhead(s, reach);
  if (t2 && (t2.y ?? t2.y0) >= by) return { kind: t2.kind, x: t2.x ?? t2.c ?? s.cx, y: t2.y ?? t2.y0 };
  if (!best) return null;
  const o = best.o;
  if (best.kind === 'bramble') { o.broken = true; o.solids = []; o.gaps = [[0, W]]; }
  else if (best.kind === 'column') { o.live = false; o.broken = true; }
  else if (best.kind === 'beetle') o.dead = true;
  else { o.broken = true; o.passed = true; o.snapped = true; if (o.kind === 'crow') o.st = 'foiled'; if (o.kind === 'pulse' || o.kind === 'door') o.segs = []; s.traps = s.traps.filter((q) => q !== o || q.kind === 'crow'); }
  return { kind: best.kind, x: o.x ?? s.cx, y: by };
}
function crushNear(s, r) { let n = 0; for (const b of s.beetles) if (!b.dead && Math.hypot(b.x - s.cx, b.y - s.cy) < r) { b.dead = true; n++; addScore(s, 40 * s.mult); } return n; }
function stunBeetles(s, r, t) {
  let n = 0;
  for (const b of s.beetles) if (!b.dead && Math.hypot(b.x - s.cx, b.y - s.cy) < r) { b.stun = t; n++; }
  for (const tr of s.traps) if (tr.kind === 'crow' && tr.st === 'warn') { tr.st = 'foiled'; n++; emit(s, 'crowfoil', { x: s.cx, y: s.cy, bonus: addScore(s, 30 * s.mult), stun: true }); }
  return n;
}
/** Frog: grab the nearest pickup / ride knot / letter / gem / hollow, or eat a beetle. */
function tongue(s, reach, n) {
  const got = [];
  for (let k = 0; k < n; k++) {
    let best = null, bd = reach;
    for (const o of s.motes) { if (o.taken || !(o.pickup || o.kind === 'ride' || o.letter || o.gem || o.kind === 'hollow' || o.kind === 'dew')) continue; const d = Math.hypot(o.x - s.cx, o.y - s.cy); if (d < bd) { bd = d; best = o; } }
    if (best) { got.push({ kind: best.kind, x: best.x, y: best.y }); collect(s, best, s.tips[0]); continue; }
    let bb = null; bd = reach;
    for (const b of s.beetles) { if (b.dead) continue; const d = Math.hypot(b.x - s.cx, b.y - s.cy); if (d < bd) { bd = d; bb = b; } }
    if (bb) { bb.dead = true; addScore(s, 40 * s.mult); got.push({ kind: 'beetle', x: bb.x, y: bb.y }); }
  }
  return got;
}
/** Moth: pull every sunlight within reach straight to the tip. */
function pull(s, reach) { let n = 0; for (const o of s.motes) if (!o.taken && o.kind === 'sun' && Math.hypot(o.x - s.cx, o.y - s.cy) < reach) { collect(s, o, s.tips[0]); n++; } return n; }
// /V2-MECH
const heightM2 = (y) => -y / PX_PER_M;

// P6-TRAPS: tests and screenshots: grow one chunk (by id) with its bottom at y
const FEEL_API = { addScore: (s, p) => addScore(s, p), sapMax: (s) => sapMax(s), newTrail: (s, n) => newTrail(s, n) }; // V3-FEEL
export function spawnChunkAt(s, id, y, d = 0.4) { const c = CHUNK[id]; return c ? c.gen(s, y, d, -y / PX_PER_M) : 0; }
// /P6-TRAPS

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
// V2-MECH: a Growth Ring gate: three medallions one fork-width apart (steer into one, fork through two)
function ringGate(s, y) {
  const g = (s.dir.ringN = (s.dir.ringN || 0) + 1) - 1;
  const ids = ringOffer(s);
  addTrail(s, y, { n: 5, cx: W / 2, amp: 40 });
  const ty = y - 330;
  ids.forEach((id, i) => s.tokens.push({ x: W / 2 + (i - 1) * 2 * FORK_SPREAD, y: ty, id, ring: id, r: 20, taken: false, gate: 'r' + g, skin: 'ring.' + id }));
  s.hints.push({ y: ty + 120, text: 'choose a growth ring', sub: 'steer into one · fork through two (+ a knot)', graft: true, ring: true });
  s.lastGate = null;
  return 640;
}
function placeRide(s, y, m, id) {
  id = id || ridePick(s.world, m, s.rng, { gooseUsed: s.gooseUsed });
  addRideKnot(s, 100 + s.rng() * (W - 200), y, id);
  s.lastRideM = m;
}
function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(s.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** V2-MECH: may this world grow this chunk? (classic chunks: every world; trap chunks: only its own mechanics) */
const worldOK = (s, c) => !c.mechs || c.mechs.every((q) => hasMech(s.world, q));
function pickChunk(s, tier, m, maxTier = 3) {
  const r = s.rng;
  for (let t = Math.min(tier, maxTier); t >= 0; t--) {
    const pool = CHUNKS.filter((c) => c.tier === t && m >= c.minM && !s.dir.last.includes(c.id) && worldOK(s, c));
    if (!pool.length) continue;
    const here = sig(m);
    let tot = 0; const ws = pool.map((c) => { const w = c.w * (c.sig === here ? 1.8 : 1); tot += w; return w; });
    let q = r() * tot;
    for (let i = 0; i < pool.length; i++) { q -= ws[i]; if (q <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  return CHUNKS[0];
}

/** Quest scripts: 'chunkId' | 'glade' | 'graft' | { storm: n } (a storm of n lightning chunks). */
function expandScript(list) {
  const out = [];
  for (const it of list) {
    if (it && typeof it === 'object' && it.storm) { out.push({ stormOpen: it.storm }); for (let i = 1; i < it.storm; i++) out.push('bolts'); }
    else out.push(it);
  }
  return out;
}

function scriptBeat(s, y) {
  // one entry of a hand-made quest level; filler glades after the finish
  const D = s.dir, d = s.R.d ?? 0.3, m = -y / PX_PER_M;
  if (s.beatIndex++ === 0) { addTrail(s, y, { n: 6, cx: W / 2, amp: 100 }); s.chunkLog.push({ id: 'start', tier: 0, role: 'build', y, m: 0, len: 360 }); return 360; }
  const it = D.si < (D.script || []).length ? D.script[D.si++] : 'glade';
  let len, id = typeof it === 'string' ? it : 'bolts', role = 'build', tier = 0;
  if (it === 'glade') { len = REST.gen(s, y, d, m); role = 'rest'; tier = -1; }
  else if (it === 'graft') { len = graftGate(s, y); role = 'graft'; tier = -1; }
  else if (it === 'bolts' || (it && it.stormOpen)) {
    if (it.stormOpen) s.stormZones.push({ y0: y + 40, y1: y - it.stormOpen * 700 + 120, i: s.storms + s.stormZones.length });
    len = STORM_CHUNK.gen(s, y, d); role = 'storm'; tier = -2;
  } else {
    const c = CHUNK[it] || CHUNKS[0];
    len = c.gen(s, y, d, m); tier = c.tier;
  }
  s.chunkLog.push({ id, tier, role, y, m: Math.round(m), len: Math.round(len) });
  const r2 = s.rng2;
  if (role !== 'storm' && r2() < 0.5) {
    const n = 1 + Math.floor(r2() * 3), ax = 70 + r2() * (W - 140), ay = y - len * (0.2 + r2() * 0.5);
    for (let i = 0; i < n; i++) s.motes.push({ x: ax, y: ay - i * 38, kind: 'acorn', r: 10, ph: r2() * 6.28, taken: false });
  }
  return len;
}

function spawnBeat(s, y) {
  if (s.R.script) return scriptBeat(s, y);
  const r = s.rng;
  const m = -y / PX_PER_M;
  const idx = s.beatIndex++;

  // Scripted opening that teaches by doing: steer, fork, merge.
  if (idx === 0) { addTrail(s, y, { n: 6, cx: W / 2, amp: 120 }); if (s.tutorial) s.hints.push({ y: y + 70, text: 'steer the tip', sub: 'mouse · touch · ← →' }); return 340; }
  if (idx === 1) { addTrail(s, y, { n: 6, amp: 160 }); return 360; }
  if (idx === 2) { addSplit(s, y - 40, W / 2, 112); if (s.tutorial) s.hints.push({ y: y + 150, text: 'TAP to fork', sub: 'click · tap · space' }); return 330; }
  if (idx === 3) { addTwinTrail(s, y, W / 2); if (s.tutorial) s.hints.push({ y: y - 290, text: 'TAP again to merge', sub: 'merge = combo ×' }); return 420; }

  const D = s.dir;
  // P6-TRAPS director: tier timing runs up to 15% ahead (harder) or behind (easier)
  const d = intensity(m * (1 + s.dk), s.R.hazard);
  // /P6-TRAPS
  let chunk, role, len;
  const st = (s.R.storms || STORMS)[D.stormI];
  // V2-MECH: free play has Growth Ring gates (the grafts are in the ring pool); pure runs keep the graft gates
  const freeRings = !s.pure && !s.R.noGrafts && !s.tutorialOnly;
  D.ringI = D.ringI || 0;
  const inStormNow = D.stormOpen === D.stormI && st && m >= st.m;
  if (D.spCur && !(y > D.spCur.y1 + 100)) D.spCur = null; // the set piece is fully grown
  if (D.spCur) {
    role = 'setpiece'; len = spChunk(s, D.spCur, y, d, m, API2); chunk = { id: D.spCur.id, tier: -3 };
  } else if (freeRings && m >= ringAt(D.ringI)) {
    D.ringI++; role = 'ring'; len = ringGate(s, y); chunk = { id: 'ring', tier: -1 };
  } else if (!freeRings && !s.R.noGrafts && D.graftI < GRAFT_AT.length && m >= GRAFT_AT[D.graftI]) {
    D.graftI++; role = 'graft'; len = graftGate(s, y); chunk = { id: 'graft', tier: -1 };
  } else if (!inStormNow && !s.tutorialOnly && (D.spCur = spOpen(s, y, m))) {
    role = 'setpiece'; len = spChunk(s, D.spCur, y, d, m, API2); chunk = { id: D.spCur.id, tier: -3 };
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
    // Ancient stake: every Nth rest glade is taken away and becomes a spike
    if (role === 'rest' && m >= 18 && s.R.restSwap && ++D.rests % s.R.restSwap === 0) role = 'spike';
    // P6-TRAPS director: rest-beat frequency ±15% (never two changes in a row)
    if (s.dk && m >= 18) {
      const q = s.rng();
      if (s.dk > 0 && role === 'rest' && !D.dkSwap && q < s.dk) { role = 'build'; D.dkSwap = 1; }
      else if (s.dk < 0 && role === 'build' && !D.dkSwap && q < -s.dk) { role = 'rest'; D.dkSwap = 1; }
      else D.dkSwap = 0;
    }
    // /P6-TRAPS
    if (role === 'spike') D.spikes = (D.spikes || 0) + 1;
    if (role === 'rest' || m < 18) {
      const mi0 = s.motes.length; // V3-FEEL
      chunk = REST; if (m < 18) chunk = CHUNKS[0]; len = chunk.gen(s, y, d, m);
      // V2-MECH: the ride/reward beat: after every second spike a rest glade carries a Ride Knot
      if (role === 'rest' && m >= MECH_TUNE.rideFirstM && (D.spikes || 0) >= 2) { D.spikes = 0; role = 'reward'; placeRide(s, y - len * 0.45, m); }
      else if (role === 'rest' && s.feelS && m >= 18) { const ex = feelSigBeat(s, y, len, m, mi0, FEEL_API); if (ex || s.motes.length !== mi0) len += ex; } // V3-FEEL: signature current
    } else {
      const tf = d * 2.3 + (role === 'spike' ? 0.9 : D.pos === 2 ? 0.35 : 0) + (r() - 0.5) * 0.6 - 0.3;
      chunk = pickChunk(s, clamp(Math.round(tf), 0, 3), m);
      s.trapSwap = null;
      const br0 = s.brambles.length; // V3-FEEL
      len = chunk.gen(s, y, d, m);
      if (s.feelS) feelLanes(s, br0); // V3-FEEL: choice lanes on split gates
      if (s.trapSwap) chunk = { id: s.trapSwap, tier: CHUNK[s.trapSwap].tier }; // P6-TRAPS
      D.last.push(chunk.id); if (D.last.length > 2) D.last.shift();
      // V2-MECH: the first ride (a Dandelion, the easiest to learn) at ~120 m; then a 6% chance per build chunk
      if (!D.firstRide && m >= MECH_TUNE.rideFirstM) { D.firstRide = true; placeRide(s, y - len - 40, m, 'dandelion'); len += 120; }
      else if (role === 'build' && m >= MECH_TUNE.rideFirstM && m - s.lastRideM >= MECH_TUNE.rideGapM && r() < MECH_TUNE.rideChance * (s.rings.length ? ringLuck(s) : 1)) { placeRide(s, y - len - 40, m); len += 120; }
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
  // P6-SEASONS: fireflies (sunlight) and red envelopes, from their own stream so the course never shifts
  if ((s.R.fireflies || s.R.envelopes) && m > 6) {
    const r3 = s.rng3 || (s.rng3 = mulberry32((s.seed ^ 0x9e3779b9) >>> 0));
    if (s.R.fireflies && r3() < 0.6) { const n = 1 + Math.floor(r3() * 2); for (let i = 0; i < n; i++) s.motes.push({ x: 60 + r3() * (W - 120), y: y - len * r3(), kind: 'sun', r: 11, ph: r3() * 6.28, taken: false, ff: true }); }
    if (s.R.envelopes && r3() < 0.22) s.motes.push({ x: 60 + r3() * (W - 120), y: y - len * (0.3 + r3() * 0.4), kind: 'acorn', r: 12, ph: r3() * 6.28, taken: false, env: true });
  }
  // /P6-SEASONS
  // V2-MECH: Knot Hollows (own stream) and skins for everything the chunk grew
  if (s.hollows.length) for (const h of s.hollows) if (!h.done && h.y <= y && h.y > y - len) { h.done = true; s.motes.push({ x: h.x, y: h.y, kind: 'hollow', r: 18, ph: 0, taken: false, skin: 'common.hollow' }); }
  for (const f of s.frosts) if (!f.skin) f.skin = hazardSkin(s.world, 'frost');
  for (const z of s.winds) if (!z.skin) z.skin = hazardSkin(s.world, 'wind');
  for (const tr of s.traps) if (!tr.skin && tr.kind !== 'label') tr.skin = trapSkin(s.world, HIT_TRAP[tr.kind] || tr.kind);
  // P8-ECON: word-hunt letter and gem drops (fixed heights from their own stream)
  if (s.drops.length) for (const d of s.drops) if (!d.done && d.y <= y && d.y > y - len) { d.done = true; s.motes.push({ x: d.x, y: d.y, kind: 'acorn', r: 13, ph: 0, taken: false, letter: d.letter || null, gem: !!d.gem }); }
  return len;
}

// ---------------------------------------------------------------- core step
const SPEED0 = 170;

export function step(s, dt, input = {}) {
  s.events.length = 0;
  if (s.dead) { s.t += dt; s.deathT += dt; return s; }
  // V2-MECH: slow-mo moments (ride mount, ring offer, golden leaf save): the whole world at 0.5x
  if (s.slowmo > 0) { s.slowmo = Math.max(0, s.slowmo - dt); dt *= s.slowK; s.timeScale = s.slowK; } else s.timeScale = 1;
  s.t += dt;
  if (s.feelS) input = feelInput(s, input, dt); // V3-FEEL: input buffer
  const m = heightM(s);
  const prog = Math.min(1, m / 650);
  s.forkCooldown = Math.max(0, s.forkCooldown - dt);
  s.invuln = Math.max(0, s.invuln - dt);
  s.chainTimer -= dt;
  if (s.chainTimer <= 0) s.chain = 0;

  // power-up timers
  for (const k in s.pu) {
    if (s.pu[k] > 0) {
      s.pu[k] = Math.max(0, s.pu[k] - dt);
      if (s.pu[k] === 0) {
        if (k === 'rush') s.invuln = Math.max(s.invuln, 0.9);
        if (k === 'bubble') s.bubble = false;
        if (k === 'shears') s.shears = 0;
        emit(s, 'puend', { kind: k });
      }
    }
  }
  const rush = s.pu.rush > 0;
  // V2-MECH: timers of rides, skills and trap effects
  skillTick(s, dt); skillEffects(s, dt, API2);
  s.webT = Math.max(0, s.webT - dt); s.invertT = Math.max(0, s.invertT - dt);
  if (s.burnT > 0) { s.burnT = Math.max(0, s.burnT - dt); if (!s.demo && !rush) s.sap -= 5 * dt; }
  s.warnBonus = (s.pu.lantern > 0 ? 0.5 : 0) + (s.owlT > 0 ? s.owlWarn || 0 : 0);
  if (s.rideStart && m >= 10 && !s.ride) { s.rideStart = false; const r7 = mulberry32((s.seed ^ 0x1d872b41) >>> 0); rideMount(s, ridePick(s.world, m, r7), API2, 'token'); }
  if (s.autoFork && !s.forked && s.tips.length === 1 && !s.ride && s.forkCooldown <= 0) { s.autoFork = false; fork(s); }
  const RM = rideMods(s);
  // /V2-MECH

  // speed and steering
  const frostK = s.inFrost ? 0.62 : 1;
  let target = (SPEED0 + 90 * prog + Math.min(40, Math.max(0, m - 650) * 0.05)) * frostK * (rush ? 1.8 : 1) * s.R.speed;
  // V2-MECH: rides, webs, the snail's shell, the sparrow's dash, a leaf sail in the wind
  if (RM) target *= RM.speed;
  if (s.webT > 0) target *= 0.4;
  if (s.shellT > 0) target *= 0.5;
  if (s.dashT > 0) target += s.dashV;
  if (s.pu.sail > 0 && Math.abs(s.wind) > 20) target *= 1.25;
  target += surgeV(s); // V3-FEEL: signature current surge
  s.speed += (target - s.speed) * Math.min(1, dt * (rush ? 5 : 3));
  let desired = 0;
  const railX = railTarget(s); // V2-MECH: the rail carries you
  if (railX != null) desired = clamp(Math.atan2(railX - s.cx, 120), -1.12, 1.12);
  else if (input.targetX != null) desired = clamp(Math.atan2((s.invertT > 0 ? 2 * s.cx - input.targetX : input.targetX) - s.cx, 120), -1.12, 1.12);
  else desired = (input.dir || 0) * 0.98 * (s.invertT > 0 ? -1 : 1);
  const maxTurn = 5.2 * turnK(s) /* V3-FEEL */ * dt * (1 - (s.R.slip || 0)) * (RM ? RM.steer : 1); // P6-SEASONS: slippery branches
  s.heading += clamp(desired - s.heading, -maxTurn, maxTurn);

  // wind bands
  let wind = 0;
  for (const w of s.winds) {
    if (s.cy < w.y0 && s.cy > w.y1) {
      const k = Math.sin(((w.y0 - s.cy) / (w.y0 - w.y1)) * Math.PI);
      wind += w.force * k;
    }
  }
  wind *= s.R.windK ?? 1; // P6-SEASONS: leaf wind
  wind += trapWind(s); // P6-TRAPS crosswind gusts
  if (s.still > 0) wind *= 0.35;
  if (rush) wind *= 0.3;
  if (s.pu.sail > 0) wind *= 0.15; // V2-MECH: the sail turns wind into speed (above), not a push
  wind += vortexWind(s); // V2-MECH: swirl currents
  s.wind = wind;

  s.prevCy = s.cy;
  s.cx += (Math.sin(s.heading) * s.speed + wind) * dt;
  s.cy -= Math.cos(s.heading) * s.speed * dt;

  // fork / merge toggle
  // V2-MECH: on a ride the tap is the ride's action; the charm button fires the critter skill
  const rideTap = s.ride ? rideStep(s, dt, input, API2) : false;
  if (input.toggle && !rideTap && !s.ride) {
    if (!s.forked && s.tips.length === 1 && s.forkCooldown <= 0) fork(s);
    else if (s.forked) { s.forked = false; emit(s, 'merging'); }
  }
  if (input.charm) { if (s.skill) { if (fireSkill(s, API2)) s.stat.skills++; } else useCharm(s); }
  if (s.lure > 0) s.lure = Math.max(0, s.lure - dt);
  if (s.still > 0) s.still = Math.max(0, s.still - dt);
  if (s.forked) s.forkTime += dt;
  const spreadTarget = s.forked ? (s.pu.twin > 0 ? 110 : FORK_SPREAD) : 0;
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
      s.sap = Math.min(sapMax(s), s.sap + 20);
      emit(s, 'stormend', { bonus, x: s.cx, y: s.cy });
    }
    s.storm = null;
  }

  // energy
  const climb = Math.min(2.2, (m + s.R.climb) / 600);
  const forkK = s.pu.twin > 0 ? 1 : TUNE.forkDrain * (hasGraft(s, 'wild') ? 1.2 : 1); // V2-MECH: Twin Seed forks for free
  const TU = s.R.script ? TUNE_QUEST : TUNE; // P6-TRAPS: quest levels keep their pass-5 drain
  const late = TU.drainLate * clamp((m + s.R.climb - 280) / (s.R.script ? 420 : MECH_TUNE.lateSpan), 0, 1); // pass 4: pressure after the opening minute
  let drain = (TU.drain0 + s.R.drainAdd + (TU.drainK * climb + late) * s.R.lateK * (s.feelS ? s.feelS.lateK : 1)) * (s.tips.length === 2 ? forkK : 1) /* P8-ECON drainAdd, lateK */ + (s.inFrost ? (s.still > 0 ? 6 : 20) : 0);
  drain *= (hasGraft(s, 'taproot') ? 0.85 : 1) * (s.storm ? 0.7 : 1) * s.R.drain;
  drain *= (RM ? RM.drain : 1) * (s.pu.amber > 0 ? 0.7 : 1) * (s.knots.includes('thirst') ? 1.12 : 1); // V2-MECH
  if (s.feelS) drain *= s.feelS.drainK; // V3-FEEL balance knob
  if (s.mercy) drain *= s.merges < 1 && m < 200 ? 0 : m < 150 ? 0.5 : 1; // P0-FTUE: no drain until the first merge, half drain to 150 m
  if (s.webT > 0) drain += 6;
  if (!s.demo && !rush) s.sap -= drain * dt * (s.golden > 0 ? 0.4 : s.still > 0 ? 0.6 : 1);

  // golden hour, Sun Call, pollen and Sap Rush: sunlight drifts to your tips
  if (s.golden > 0 || s.lure > 0 || s.pu.pollen > 0 || rush || s.pu.acornrain > 0) attract(s, dt);
  if (s.golden > 0) {
    s.golden -= dt;
    if (s.golden <= 0) { s.golden = 0; s.mult = Math.min(s.mult, 4); emit(s, 'goldenend'); }
  }

  // height score
  const mi = Math.floor(m);
  if (mi > s.heightScored) { addScore(s, (mi - s.heightScored) * s.mult); s.heightScored = mi; }
  const si = stageIndexFor(m + s.R.biome);
  if (si > s.stageIdx) {
    s.stageIdx = si; emit(s, 'stage', { idx: si }); s.sap = Math.min(sapMax(s), s.sap + 15);
    // V2-MECH: Thick Bark blocks the first hit of each stage; Restless Crow sends one every stage
    if (ringLevel(s, 'bark')) s.barkReady = true;
    if (s.knots.includes('crow') && !s.R.script) s.traps.push({ kind: 'crow', y: s.cy - 320, side: s.cx < W / 2 ? 1 : -1, st: 'perch', t: 0, skin: trapSkin(s.world, 'crow') });
    if (s.synergies.includes('spring')) { s.pu.pollen = Math.max(s.pu.pollen, 4); emit(s, 'pickup', { kind: 'pollen', x: s.cx, y: s.cy, spring: true }); }
  }
  if (!s.newBest && s.bestM > 5 && m > s.bestM) { s.newBest = true; emit(s, 'newbest'); }

  // world update + spawning
  while (s.nextBeatY > s.cy - 1500) s.nextBeatY -= spawnBeat(s, s.nextBeatY);
  const slow = (s.still > 0 ? 0.25 : 1) * (s.pu.amber > 0 ? 0.7 : 1) * (s.owlT > 0 ? s.owlK || 0.6 : 1); // V2-MECH: Amber, Night Sight
  // V2-MECH: ring medallions coming on screen get a moment of slow-mo
  for (const g of s.tokens) if (g.ring && !g.offered && g.y > s.cy - 520 && g.y < s.cy) {
    const same = s.tokens.filter((q) => q.gate === g.gate); for (const q of same) q.offered = true;
    s.slowmo = Math.max(s.slowmo, OFFER_SLOW.t); emit(s, 'ring.offer', { ids: same.map((q) => q.ring), x: W / 2, y: g.y, gate: g.gate, skins: same.map((q) => q.skin) });
  }
  const bk = (hasGraft(s, 'bloom') ? 1.15 : 1) * s.R.beetle;
  for (const b of s.beetles) {
    if (b.stun > 0) { b.stun -= dt; continue; } // V2-MECH: a sonar ping stuns it
    b.x += b.vx * dt * slow * bk; b.ph += dt * 10 * slow;
    if (b.x < 18) { b.x = 18; b.vx = Math.abs(b.vx); }
    if (b.x > W - 18) { b.x = W - 18; b.vx = -Math.abs(b.vx); }
  }
  for (const f of s.frosts) { f.x += f.vx * dt * slow; f.ph += dt; if (f.x < f.r * 0.5 || f.x > W - f.r * 0.5) f.vx *= -1; }
  for (const br of s.brambles) if (br.kind === 'slide') slideUpdate(br, dt * slow);
  for (const c of s.columns) {
    if (c.kind === 'bolt' && !c.live && s.cy < c.y0 + 330) { c.live = true; s.strikes++; emit(s, 'strike', { x: c.x, y: c.y0, top: c.y1 }); }
  }

  trapsUpdate(s, dt, slow, TRAP_API); // P6-TRAPS
  traps2Update(s, dt, slow, API2); // V2-MECH
  spUpdate(s, dt, API2); // V2-MECH: set pieces, bosses, chests
  approachWarn(s); // P8-ECON
  collide(s);
  trapsCollide(s, dt, TRAP_API); // P6-TRAPS
  traps2Collide(s, dt, API2); // V2-MECH
  retract(s, dt);
  if (s.feelS) feelPost(s, dt, FEEL_API); // V3-FEEL

  const cull = s.cy + 1000;
  s.motes = s.motes.filter((o) => o.y < cull && !o.taken);
  s.beetles = s.beetles.filter((o) => o.y < cull && !o.dead);
  s.frosts = s.frosts.filter((o) => o.y - o.r < cull);
  s.brambles = s.brambles.filter((o) => o.y < cull);
  s.winds = s.winds.filter((o) => o.y1 < cull);
  s.columns = s.columns.filter((o) => o.y1 < cull);
  s.tokens = s.tokens.filter((o) => o.y < cull);
  s.stormZones = s.stormZones.filter((o) => o.y1 < cull || o === s.storm);
  s.hints = s.hints.filter((o) => o.y < cull);
  trapsCull(s, cull); // P6-TRAPS

  if (s.R.noDeath && s.sap < 1) s.sap = 1;
  if (s.finishM && heightM(s) >= s.finishM) endRun(s, 'finish');
  else if (s.R.timeLimit && s.t >= s.R.timeLimit) endRun(s, 'time');
  else if (s.sap <= 0 && !feelGasp(s)) { s.sap = 0; endRun(s, s.R.oneHit && s.hits ? 'hit' : 'sap'); } // V3-FEEL: last gasp
  return s;
}

/** End the run: out of sap, one hit in Hardcore, the Sprint clock, or a finish line. */
function endRun(s, why) {
  s.dead = true; s.deathT = 0; s.end = why;
  s.won = why === 'finish' || why === 'time';
  if (s.feelS) s.feelS.death = feelDeath(s); // V3-FEEL
  for (const tip of s.tips) { const p = s.paths[tip.path]; if (p.state === 'live') p.state = 'done'; }
  emit(s, s.won ? 'finish' : 'death', { why });
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
  return rowAhead2(s, dist); // V2-MECH: pinching roots, jaws, seesaws count too
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
    const jit = feelCoyote(s, hazardAhead(s, 190 * ringJitK(s))); // V3-FEEL: coyote time after a row // V2-MECH: Quick Merge widens the window
    let bonus = addScore(s, (50 + 20 * staged * s.mult) * (jit ? ringJitMult(s) : 1));
    s.mult = Math.min(MAX_MULT, s.mult + 1);
    s.maxMult = Math.max(s.maxMult, s.mult);
    const goldenNow = s.mult >= ringGolden(s) && s.golden <= 0; // V2-MECH: Sunwise
    skillMergeCut(s); // V2-MECH: merges charge the critter skill
    if (ringEcho(s) && s.merges % ringEcho(s) === ringEcho(s) - 1) { s.autoFork = true; s.pu.twin = Math.max(s.pu.twin, 3); emit(s, 'ring.echo', { x: s.cx, y: s.cy }); }
    s.sap = Math.min(sapMax(s), s.sap + 4 * staged * s.R.mergeSap); // P8-ECON: mergeSap
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

function startGolden(s) { s.golden = GOLDEN_SEC * upK(s, 'golden'); /* P8-ECON */ s.goldens++; emit(s, 'golden', { x: s.cx, y: s.cy }); }
function bumpMult(s) {
  s.mult = Math.min(MAX_MULT, s.mult + 1); s.maxMult = Math.max(s.maxMult, s.mult);
  if (s.mult >= ringGolden(s) && s.golden <= 0) startGolden(s);
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
  if (!(s.pu.goldleaf > 0)) s.mult = Math.max(1, s.mult - 1); // V2-MECH: Golden Leaf
  if (!s.demo) s.sap -= 8;
  s.reverts++;
  s.invuln = 0.8;
  s.forkCooldown = 0.6;
  emit(s, 'revert', { x: tip.x, y: s.cy, lost, src: s.lastHitSrc });
}

// P8-ECON: hit sources -> trap ids for the trapHit event (see TRAP-EVENTS.md)
export const HIT_TRAP = { cap: 'lure', wall: 'lure', hedge: 'gust', twig: 'twig', pulse: 'pulse', door: 'door', tide: 'tide', crow: 'crow', twins: 'twins',
  ...Object.fromEntries(Object.keys(MECH2).map((k) => [k, k])) }; // V2-MECH: the 15 new mechanics
function hitEvent(s, tip, src, effect, dmg) {
  s.hitLog = s.hitLog || {}; s.hitLog[src] = (s.hitLog[src] || 0) + 1;
  const trap = HIT_TRAP[src] || src;
  emit(s, 'trapHit', { trap, src, hazard: !HIT_TRAP[src] && src !== 'boss', effect, dmg: Math.round(dmg || 0), x: tip.x, y: s.cy, sap: Math.round(s.sap), skin: HIT_TRAP[src] ? trapSkin(s.world, trap) : src === 'boss' && s.boss ? s.boss.skin : hazardSkin(s.world, src) });
}
// V2-MECH: what Pruning Shears can cut and what a Horn Charge / airborne bounce ignores
const THORNY = new Set(['gate', 'split', 'slide', 'thorn', 'pulse', 'door', 'cap', 'wall', 'hedge', 'strangle', 'seesaw', 'jaws']);
const SKY_SRC = new Set(['crow', 'boss', 'bats', 'cone', 'icicle', 'hornets', 'bolt']);
function hit(s, tipIdx, dmg, src = '') {
  s.lastHitSrc = src;
  if (s.invuln > 0 || s.pu.rush > 0) return;
  const tip = s.tips[tipIdx];
  if (!tip) return;
  // V2-MECH: the layers of protection, in order
  if (rideAir(s) && !SKY_SRC.has(src)) return; // bouncing over it
  if (s.ride) { if (rideHit(s, API2, src)) { s.stat.rideHits++; hitEvent(s, tip, src, 'ride', 0); return; } }
  if (s.hornT > 0 && s.hornN > 0) { s.hornN--; s.invuln = 0.45; const b = addScore(s, 60 * s.mult); emit(s, 'skill.smash', { id: 'beetle', src, x: tip.x, y: s.cy, bonus: b }); hitEvent(s, tip, src, 'smashed', 0); return; }
  if (s.shears > 0 && THORNY.has(src)) { s.shears--; s.stat.cuts++; s.invuln = 0.35; const b = addScore(s, 25 * s.mult); if (s.shears === 0) { s.pu.shears = 0; bumpMult(s); } emit(s, 'pickup.shears.cut', { src, x: tip.x, y: s.cy, bonus: b, left: s.shears }); hitEvent(s, tip, src, 'cut', 0); return; }
  if (s.bubble) { s.bubble = false; s.pu.bubble = 0; s.invuln = 1.2; s.blocks++; emit(s, 'pickup.bubble.pop', { src, x: tip.x, y: s.cy }); hitEvent(s, tip, src, 'shield', 0); return; }
  if (s.barkReady && ringLevel(s, 'bark')) {
    s.barkReady = false; s.invuln = ringLevel(s, 'bark') >= 3 ? 1.0 : 0.6; s.blocks++;
    emit(s, 'shieldbreak', { x: tip.x, y: s.cy, ring: 'bark' }); hitEvent(s, tip, src, 'shield', 0);
    if (s.synergies.includes('phoenix')) emberHeart(s);
    return;
  }
  // /V2-MECH
  if (s.shield) {
    s.shield = false; s.invuln = 1; s.blocks++;
    emit(s, 'shieldbreak', { x: tip.x, y: s.cy });
    hitEvent(s, tip, src, 'shield', 0); // P8-ECON
    return;
  }
  s.hits++;
  s.graze = 0;
  if (s.R.oneHit && !s.demo) {
    // Hardcore: one hit and the tree is done
    s.sap = 0;
    emit(s, 'hit', { x: tip.x, y: s.cy, dmg: 0, src, fatal: true });
    hitEvent(s, tip, src, 'fatal', 0); // P8-ECON
    return;
  }
  if (s.tips.length === 2) { const sap0 = s.sap; revert(s, tipIdx); hitEvent(s, tip, src, 'cut', sap0 - s.sap); return; } // P8-ECON
  dmg *= s.R.dmg * (s.feelS ? s.feelS.dmgK : 1); // V3-FEEL: hits matter more, the climb drains less
  if (hasGraft(s, 'crown')) dmg *= 1.5;
  if (s.knots.includes('brittle')) dmg *= 1.3; // V2-MECH: Brittle Bark
  if (!s.demo) s.sap -= dmg;
  if (s.pu.goldleaf > 0) { if (!s.leafSaved) { s.leafSaved = true; s.slowmo = Math.max(s.slowmo, 0.5); } emit(s, 'pickup.goldleaf.save', { x: tip.x, y: s.cy, mult: s.mult }); } // V2-MECH
  else s.mult = 1;
  emberHeart(s); // V2-MECH
  s.invuln = 1.0;
  s.chain = 0;
  s.heading *= -0.4;
  const p = s.paths[tip.path];
  s.scars.push({ x: tip.x, y: s.cy, path: p.id, i: p.pts.length - 1 });
  emit(s, 'hit', { x: tip.x, y: s.cy, dmg: Math.round(dmg), src });
  hitEvent(s, tip, src, 'sap', dmg); // P8-ECON
}

function emberHeart(s) { const t = ringEmber(s); if (t && s.t - (s.emberAt ?? -99) >= 20) { s.emberAt = s.t; s.pu.rush = Math.max(s.pu.rush, t); emit(s, 'ring.ember', { x: s.cx, y: s.cy, t }); } }
/** V2-MECH: catch radius multiplier (rides, Magnet Roots, Dew Bubble). */
const catchK = (s, RM = rideMods(s)) => (RM ? RM.catch : 1) * ringCatchK(s) * (s.bubble ? 1.15 : 1);
function collide(s) {
  s.inFrost = false;
  const y = s.cy, py = s.prevCy, R = tipR(s);
  const ck = catchK(s);
  // V2-MECH: Morpho scatter catches with two more tips
  const extra = rideCatchXs(s);
  if (extra) for (const x of extra) for (const o of s.motes) { if (o.taken || o.kind === 'ride' || o.kind === 'hollow') continue; const dx = o.x - x, dy = o.y - y, rr = (o.r + TIP_R + 4) * ck; if (dx * dx + dy * dy < rr * rr) collect(s, o, s.tips[0]); }
  for (let ti = s.tips.length - 1; ti >= 0; ti--) {
    if (ti >= s.tips.length) continue;
    const tip = s.tips[ti];
    const x = tip.x;
    for (const o of s.motes) {
      if (o.taken) continue;
      const dx = o.x - x, dy = o.y - y, rr = (o.r + TIP_R + 4) * (o.kind === 'ride' || o.kind === 'hollow' ? 1 : ck);
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
      if (b.dead || b.stun > 0) continue;
      const dx = b.x - x, dy = b.y - y, rr = b.r + R - 3;
      if (dx * dx + dy * dy < rr * rr) {
        if (s.ride && (s.ride.id === 'rocket' || s.ride.id === 'stag')) { b.dead = true; emit(s, 'vehicle.smash', { ride: s.ride.id, x: b.x, y: b.y, bonus: addScore(s, 50 * s.mult) }); continue; } // V2-MECH
        hit(s, ti, 24, 'beetle'); break;
      }
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
    if (best < 50 * grazeK(s) && best > b.r + R - 3) nearMiss(s, b.x, b.y);
  }
  for (const c of s.columns) {
    if (c.passed || !c.live || !(c.y1 >= y && c.y1 < py)) continue;
    c.passed = true; feelPassed(s);
    if (s.invuln > 0 || s.pu.rush > 0) continue;
    let best = 1e9, straddle = s.tips.length === 2 && s.tips[0].x < c.x && s.tips[1].x > c.x;
    for (const tip of s.tips) best = Math.min(best, Math.abs(tip.x - c.x) - c.hw);
    if (straddle) { const bonus = addScore(s, 40 * s.mult); s.splits++; emit(s, 'straddle', { x: c.x, y: c.y1, bonus }); }
    else if (best < 30 * grazeK(s)) nearMiss(s, c.x, c.y1);
  }
  for (const br of s.brambles) {
    if (br.passed || !(br.y >= y && br.y < py)) continue;
    br.passed = true; feelPassed(s);
    if (s.invuln > 0 || s.pu.rush > 0) continue;
    let close = false; const gz = 26 * grazeK(s);
    for (const tip of s.tips) for (const [a, b] of br.gaps) {
      if (tip.x > a && tip.x < b && (tip.x - a < gz || b - tip.x < gz)) close = true;
    }
    if (br.kind === 'split' && s.tips.length === 2) {
      const bonus = addScore(s, 40 * s.mult);
      s.splits++;
      emit(s, 'splitpass', { x: s.cx, y: br.y, bonus });
    } else if (close) nearMiss(s, s.cx, br.y);
  }
}

// P8-ECON: one trapWarn per trap / hazard, WARN_LEAD s before the tip reaches it
const WARN_KIND = { twig: 'twig', sap: 'sap', pulse: 'pulse', door: 'door', gust: 'gust', wall: 'lure', twins: 'twins' };
function approachWarn(s) {
  if (s.demo) return;
  const reach = s.cy - Math.max(120, s.speed) * (WARN_LEAD + (s.warnBonus || 0)); // V2-MECH: lantern / night sight
  const w = (o, trap, y, x, hazard) => { if (o.w8 || y > s.cy || y < reach) return; o.w8 = 1; emit(s, 'trapWarn', { trap, x, y, t: +((s.cy - y) / Math.max(60, s.speed)).toFixed(2), hazard: !!hazard, skin: o.skin }); };
  for (const tr of s.traps) { const k = WARN_KIND[tr.kind]; if (k) w(tr, k, tr.y ?? tr.y0, tr.x ?? ((tr.x0 ?? 0) + (tr.x1 ?? W)) / 2); }
  for (const b of s.brambles) w(b, b.kind, b.y, b.gaps[0] ? (b.gaps[0][0] + b.gaps[0][1]) / 2 : W / 2, true);
  for (const c of s.columns) w(c, c.kind, c.y0, c.x, true);
  for (const b of s.beetles) w(b, 'beetle', b.y, b.x, true);
  for (const f of s.frosts) w(f, 'frost', f.y + f.r, f.x, true);
  for (const z of s.winds) w(z, 'wind', z.y0, W / 2, true);
}

function nearMiss(s, x, y) {
  // close calls chain: each one inside 2.5 s of the last pays more
  s.nearMisses++;
  s.graze = s.t - s.lastNear < 2.5 ? s.graze + 1 : 1;
  s.lastNear = s.t;
  s.grazeBest = Math.max(s.grazeBest, s.graze);
  const shave = hasGraft(s, 'shave');
  const bonus = addScore(s, 15 * s.mult * Math.min(5, s.graze) * (shave ? 3 : 1) * (s.pu.amber > 0 ? 2 : 1)); // V2-MECH: Amber doubles close calls
  if (ringDancer(s) && s.graze % ringDancer(s) === 0) { bumpMult(s); emit(s, 'ring.dance', { x, y, n: s.graze }); } // V2-MECH: Thorn Dancer
  if (shave) s.sap = Math.min(sapMax(s), s.sap + 3);
  if (s.graze % 3 === 0) {
    s.sap = Math.min(sapMax(s), s.sap + 4);
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
    // V2-MECH: Sun Prism doubles, calm set pieces pay double, candy triple, moth call and night lantern add
    const prism = s.pu.prism > 0 ? 2 : 1;
    const vk = feelCollect(s, o, FEEL_API) /* V3-FEEL gold seeds, finisher */ * prism * (o.bonus || 1) * (o.candy ? 3 : 1) * (s.mothT > 0 ? s.mothK : 1) * (s.pu.lantern > 0 && s.stageIdx >= 5 ? 1.5 : 1);
    const pts = addScore(s, 10 * s.mult * (s.golden > 0 ? 2 : 1) * vk);
    if (o.candy && !s.pure) addAcorns(s, 1, o.x, o.y, true);
    // a little mercy when sap runs low (never changes the course itself)
    const sap = Math.max(TUNE.moteSapMin, TUNE.moteSap0 - heightM(s) / 150) * (s.sap < 25 ? 1.3 : 1) * prism * (o.bonus ? MECH_TUNE.calmSap : 1) * feelSapK(s, o); // V2-MECH: calm sunlight pays points, a little less sap
    s.sap = Math.min(sapMax(s), s.sap + sap);
    if (s.tips.length === 2) tip.staged += (hasGraft(s, 'wild') ? 2 : 1) * prism;
    const p = s.paths[tip.path];
    p.commits.push({ i: p.pts.length - 1, kind: 'commit', born: s.t });
    emit(s, 'collect', { x: o.x, y: o.y, chain: s.chain, pts, forked: s.tips.length === 2 });
    const tr = o.trail && s.trails.get(o.trail);
    const need = hasGraft(s, 'bloom') ? 3 : BLOOM_MIN;
    if (tr && ++tr.got >= tr.n) {
      s.trails.delete(o.trail);
      if (tr.n >= need) {
        const bonus = addScore(s, 15 * tr.n * s.mult);
        s.sap = Math.min(sapMax(s), s.sap + 4 + (hasGraft(s, 'bloom') ? 6 : 0) + s.R.bloomSap); // P8-ECON: bloomSap
        s.blooms++;
        p.commits.push({ i: p.pts.length - 1, kind: 'bloom', born: s.t });
        emit(s, 'bloom', { x: tip.x, y: s.cy, n: tr.n, bonus });
        if (s.synergies.includes('orchard')) bumpMult(s);
      }
    }
  } else if (o.kind === 'dew') {
    const dsap = Math.round((hasGraft(s, 'taproot') ? 15 : 30) * upK(s, 'dew')); // P8-ECON upgrades
    s.sap = Math.min(sapMax(s), s.sap + dsap);
    addScore(s, 25 * s.mult);
    emit(s, 'dew', { x: o.x, y: o.y, sap: dsap });
  } else if (o.kind === 'acorn' && (o.letter || o.gem)) { // P8-ECON
    if (o.letter) { s.letter = o.letter; emit(s, 'letter', { x: o.x, y: o.y, ch: o.letter }); }
    else { s.gems++; emit(s, 'gem', { x: o.x, y: o.y, n: s.gems }); }
    addScore(s, 25 * s.mult);
  } else if (o.kind === 'acorn') {
    if (s.knots.length || o.rain) addAcorns(s, o.env ? 3 : 1, o.x, o.y, !!o.rain, true); else s.acorns += o.env ? 3 : 1; // P6-SEASONS: a red envelope holds 3
    if (o.env) s.envelopes = (s.envelopes || 0) + 1;
    addScore(s, 5 * s.mult);
    emit(s, 'acorn', { x: o.x, y: o.y, n: s.acorns, env: !!o.env });
  } else if (o.kind === 'ride') { // V2-MECH: a Ride Knot
    rideMount(s, o.ride, API2, 'knot');
  } else if (o.kind === 'hollow') { // V2-MECH: a Knot Hollow (mystery crate)
    openHollow(s, o, API2);
  } else if (o.kind === 'bark') {
    s.shield = true;
    emit(s, 'shield', { x: o.x, y: o.y });
  } else if (PICKUPS[o.kind]) givePickup(s, o.kind, o.x, o.y);
}
/** V2-MECH: give a power-up (found on the course, from a Knot Hollow, or the frog's tongue). */
function givePickup(s, kind, x, y) {
  const P = PICKUPS[kind];
  const dur = P.dur * (hasGraft(s, 'pollen') ? 1.5 : 1) * (P.wild ? upK(s, 'wild') : upK(s, kind)); // P8-ECON upgrades
  const was = s.pu[kind] > 0;
  s.pu[kind] = Math.min(dur * 2, s.pu[kind] + dur);
  s.pickups++;
  if (kind === 'rush') s.rushes++;
  if (kind === 'bubble') s.bubble = true;
  if (kind === 'shears') { const lv = s.econ && s.econ.up ? s.econ.up.wild | 0 : 0; s.shears = 3 + (lv >= 3 ? 1 : 0) + (lv >= 6 ? 1 : 0); }
  if (kind === 'twin' && !s.ride) { if (!s.forked && s.tips.length === 1) { s.forkCooldown = 0; fork(s); } }
  if (kind === 'acornrain') {
    const n = Math.round(12 * upK(s, 'wild')); // V2-MECH econ tune: 20 -> 12 (18 at Wild Kit 6)
    for (let i = 0; i < n; i++) s.motes.push({ x: clamp(s.cx + Math.sin(i * 1.7) * (40 + i * 4), 30, W - 30), y: s.cy - 120 - i * 14, kind: 'acorn', r: 10, ph: i, taken: false, rain: true });
  }
  const active = Object.values(s.pu).filter((v) => v > 0).length;
  emit(s, 'pickup', { kind, x, y, extended: was, stacked: active });
  if (P.wild) emit(s, 'pickup.' + kind, { x, y, dur: +dur.toFixed(1), extended: was, skin: 'pickup.' + kind });
}
/** V2-MECH: add acorns with the run's multipliers (knots; Acorn Sense for pickup acorns). Returns the whole acorns added. */
function addAcorns(s, n, x, y, fromPickup = false, quiet = false) {
  const k = (s.knots.length ? knotAcornK(s) : 1) * (fromPickup ? ringAcornK(s) : 1);
  s.acornFrac += n * k;
  const whole = Math.floor(s.acornFrac + 1e-9); s.acornFrac -= whole; s.acorns += whole;
  if (!quiet && whole) emit(s, 'acorn', { x, y, n: s.acorns, add: whole });
  return whole;
}

function takeGraft(s, g) {
  g.taken = true;
  if (g.ring) { takeRing(s, g, API2); return; } // V2-MECH: a Growth Ring medallion
  // the other medallion of this gate fades unless the second tip is about to take it
  if (s.grafts.includes(g.id)) {
    const bonus = addScore(s, 300 * s.mult);
    s.sap = Math.min(sapMax(s), s.sap + 20);
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
    if (o.rain && !o.taken && s.pu.acornrain > 0 && o.y > s.cy - 520) { const dx = s.cx - o.x, dy = s.cy - o.y, d = Math.hypot(dx, dy) || 1, v = Math.min(d, 520 * dt); o.x += (dx / d) * v; o.y += (dy / d) * v; continue; } // V2-MECH: Acorn Rain homes in
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
  else if (c === 'roots') { s.sap = Math.min(sapMax(s), s.sap + 25); s.mult = Math.max(1, s.mult - 2); }
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
    crowSteals: s.crowSteals, // P6-TRAPS
    // V2-MECH
    world: s.world, rides: s.ridesTaken, rings: s.rings.map((r) => ({ ...r })), knots: s.knots.slice(), skill: s.skill ? { id: s.skill.id, lv: s.skill.lv, uses: s.skill.uses } : null,
    setPieces: s.setPieces || 0, bosses: s.bossesBeaten || 0, loot: s.loot.slice(), cuts: s.stat.cuts, rideHits: s.stat.rideHits,
    trapsSeen: Object.keys(s.trapSeen), // P6-TRAPS
    gems: s.gems, letter: s.letter, revives: s.revives, crowFoils: s.crowFoils || 0, // P8-ECON
    stage: STAGES[s.stageIdx].name,
    time: s.t,
    won: s.won,
    end: s.end,
    finishM: s.finishM,
    hash: treeHash([s.seed, Math.floor(s.score), ...pts]),
  };
}
