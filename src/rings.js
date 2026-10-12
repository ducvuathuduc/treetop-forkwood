// Forkwood 2.0 MECH: Growth Rings draft and Knots (opt-in curses), MECHANICS.md §2.5.
// At each ring gate three medallions float across the band with 0.6 s of 0.5×
// slow-mo (in-world, no pause card). Steer into one to take it; fork through two
// to take both, but a random Knot comes with them. Taking a ring again levels it
// (I -> II -> III). Six ring slots per run; after that gates offer upgrades to
// rings you hold, or a Dew Ring (+15 sap). The six v1 Grafts are Rare rings.
// Free play only: pure runs keep today's graft gates.
import { mulberry32 } from './rng.js';

export const RING_SLOTS = 6, RING_MAX_LV = 3;
export const RING_AT = [40, 120, 240, 400, 600, 850]; // then every 250 m
export const RING_EVERY = 250;
export const OFFER_SLOW = { t: 0.6, k: 0.5 };
const RW = { common: 50, uncommon: 25, rare: 10 };

export const RINGS = {
  deep:    { name: 'Deep Sap', rarity: 'common', lv: ['max sap 115', 'max sap 130', 'max sap 145'] },
  quick:   { name: 'Quick Merge', rarity: 'common', lv: ['just-in-time window +25%', '+50%', '+80%, JIT ×1.7'] },
  magnet:  { name: 'Magnet Roots', rarity: 'common', lv: ['catch radius +20%', '+40%', '+60%'] },
  bark:    { name: 'Thick Bark', rarity: 'uncommon', lv: ['first hit of each stage blocked', '…and the first after each ride', '…and 1 s safe after a block'] },
  clover:  { name: 'Lucky Clover', rarity: 'uncommon', lv: ['pickups and ride knots +15%', '+30%', '+45%'] },
  craft:   { name: 'Ride Craft', rarity: 'uncommon', lv: ['rides +2 s', 'rides +4 s', 'rides +6 s and take 2 hits'] },
  ember:   { name: 'Ember Heart', rarity: 'rare', lv: ['after a hit: 1.5 s Sap Rush', '2 s', '2.5 s'] },
  echo:    { name: 'Echo Fork', rarity: 'rare', lv: ['every 6th merge: a free ghost fork', 'every 5th', 'every 4th'] },
  sunwise: { name: 'Sunwise', rarity: 'rare', lv: ['golden hour at combo ×7', '×6', '×5'] },
  acorn:   { name: 'Acorn Sense', rarity: 'uncommon', lv: ['acorns from pickups ×1.2', '×1.4', '×1.6'] },
  dancer:  { name: 'Thorn Dancer', rarity: 'uncommon', lv: ['every 4th close call in a row: +1 combo', 'every 3rd', 'every 2nd'] },
  crowf:   { name: 'Crow Friend', rarity: 'rare', lv: ['crows mark 0.3 s earlier, foils ×2 and 5 acorns', '×3, 10 acorns', '×4, 15 acorns'] },
};
// the six v1 grafts join the pool at Rare weight (their boon/cost text is in sim.js GRAFTS)
export const GRAFT_RINGS = ['taproot', 'wild', 'crown', 'shave', 'bloom', 'pollen'];
export const RING_IDS = Object.keys(RINGS);
export const KNOTS = {
  brittle:  { name: 'Brittle Bark', cost: 'hits cost +30% sap' },
  thirst:   { name: 'Thirst', cost: 'sap drain +12%' },
  crow:     { name: 'Restless Crow', cost: 'a crow every stage, at least' },
  thornfall:{ name: 'Thornfall', cost: 'more traps (hazard +0.15)' },
};
export const KNOT_IDS = Object.keys(KNOTS);
export const KNOT_PAY = { acorns: 0.2, points: 0.15 };
export const RING_SYN = {
  rootstock: { name: 'Rootstock', of: ['magnet', 'craft'], text: 'rides pull sunlight from twice as far' },
  phoenix: { name: 'Phoenix', of: ['bark', 'ember'], text: 'a blocked hit also lights Ember Heart' },
  swarm: { name: 'Swarm', of: ['echo', 'dancer'], text: 'close calls on a ghost fork count double' },
};
export const ringSkin = (id) => `ring.${id}`;
export const knotSkin = (id) => `knot.${id}`;

export function ringAt(i) { return i < RING_AT.length ? RING_AT[i] : RING_AT[RING_AT.length - 1] + RING_EVERY * (i - RING_AT.length + 1); }
export const ringLevel = (s, id) => { const r = s.rings && s.rings.find((q) => q.id === id); return r ? r.lv : 0; };
export const knotCount = (s) => (s.knots ? s.knots.length : 0);
const ringStream = (s) => s.rng5 || (s.rng5 = mulberry32((s.seed ^ 0x68e31da4) >>> 0));

/** Three offers (own random stream, so the course never shifts). */
export function ringOffer(s) {
  const r = ringStream(s);
  const held = s.rings.map((q) => q.id);
  let pool;
  if (held.length >= RING_SLOTS) pool = s.rings.filter((q) => q.lv < RING_MAX_LV).map((q) => q.id);
  else pool = RING_IDS.filter((id) => ringLevel(s, id) < RING_MAX_LV).concat(GRAFT_RINGS.filter((g) => !s.grafts.includes(g)));
  const out = [];
  while (out.length < 3) {
    const cand = pool.filter((id) => !out.includes(id));
    if (!cand.length) { out.push('dew'); continue; }
    const ws = cand.map((id) => (RINGS[id] ? RW[RINGS[id].rarity] : RW.rare));
    let q = r() * ws.reduce((a, b) => a + b, 0), pick = cand[cand.length - 1];
    for (let i = 0; i < cand.length; i++) { q -= ws[i]; if (q <= 0) { pick = cand[i]; break; } }
    out.push(pick);
  }
  return out;
}

/** Take a ring medallion. A: sim api (takeGraft for graft rings). Returns the event payload. */
export function takeRing(s, tok, A) {
  const id = tok.ring;
  const gate = s.ringGates[tok.gate] || (s.ringGates[tok.gate] = { took: 0 });
  gate.took++;
  let ev;
  if (id === 'dew') { s.sap = Math.min(A.sapMax(s), s.sap + 15); ev = { id, lv: 0 }; }
  else if (GRAFT_RINGS.includes(id)) { A.takeGraft(s, { id, x: tok.x, y: tok.y, taken: true }); ev = { id, lv: 1, graft: true }; }
  else {
    let r = s.rings.find((q) => q.id === id);
    if (r) r.lv = Math.min(RING_MAX_LV, r.lv + 1); else if (s.rings.length < RING_SLOTS) { r = { id, lv: 1 }; s.rings.push(r); }
    ev = { id, lv: r ? r.lv : 0 };
    applyRing(s, id);
    for (const [sid, sy] of Object.entries(RING_SYN)) if (!s.synergies.includes(sid) && sy.of.every((q) => ringLevel(s, q) > 0)) { s.synergies.push(sid); A.emit(s, 'synergy', { id: sid, x: tok.x, y: tok.y, ring: true, name: sy.name, text: sy.text }); }
  }
  A.emit(s, 'ring.pick', { ...ev, x: tok.x, y: tok.y, gate: tok.gate, skin: ringSkin(id), name: RINGS[id] ? RINGS[id].name : id });
  // fork through two: both rings, plus a Knot
  if (gate.took === 2) addKnot(s, KNOT_IDS[Math.floor(ringStream(s)() * KNOT_IDS.length)], A, tok);
  return ev;
}
function applyRing(s, id) {
  if (id === 'deep') s.sapMaxV = 100 + 15 * ringLevel(s, 'deep');
  if (id === 'bark') s.barkReady = true;
}

/** Add a curse: chosen opt-in before the run, or the price of forking through two rings. */
export function addKnot(s, id, A, at = {}) {
  if (!KNOTS[id] || s.knots.includes(id)) return false;
  s.knots.push(id);
  if (id === 'thornfall') s.R.hazard += 0.15;
  A.emit(s, 'ring.knot', { id, name: KNOTS[id].name, cost: KNOTS[id].cost, x: at.x ?? s.cx, y: at.y ?? s.cy, skin: knotSkin(id), n: s.knots.length });
  return true;
}
/** Reward multipliers from knots (+20% acorns, +15% points each, stacking). */
export const knotAcornK = (s) => 1 + KNOT_PAY.acorns * knotCount(s);
export const knotScoreK = (s) => 1 + KNOT_PAY.points * knotCount(s);

// ring effect helpers read by sim.js (all return neutral values when not held)
export const ringCatchK = (s) => 1 + 0.2 * ringLevel(s, 'magnet');
export const ringJitK = (s) => 1 + [0, 0.25, 0.5, 0.8][ringLevel(s, 'quick')];
export const ringJitMult = (s) => (ringLevel(s, 'quick') >= 3 ? 1.7 : 1.5);
export const ringLuck = (s) => 1 + 0.15 * ringLevel(s, 'clover');
export const ringGolden = (s) => [8, 7, 6, 5][ringLevel(s, 'sunwise')];
export const ringAcornK = (s) => 1 + 0.2 * ringLevel(s, 'acorn');
export const ringEcho = (s) => [0, 6, 5, 4][ringLevel(s, 'echo')];
export const ringDancer = (s) => [0, 4, 3, 2][ringLevel(s, 'dancer')];
export const ringEmber = (s) => [0, 1.5, 2, 2.5][ringLevel(s, 'ember')];
export const ringCrow = (s) => ringLevel(s, 'crowf');

/** Bot: pick the medallion nearest the aim (a confident forked bot takes two). */
export function ringBotPick(s, toks, r) { return toks[Math.floor(r() * toks.length)]; }
