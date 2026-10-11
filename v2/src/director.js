// Forkwood pass 6: the hidden difficulty director.
// Reads the player's last 5 personal runs (localStorage) and returns a small
// offset k in [-0.15, +0.15]: positive = a little harder (fewer rest glades,
// chunk tiers arrive up to 15% sooner), negative = a little gentler.
// It never touches a run anyone else plays the same way: daily, weekly, race,
// duel, challenge links, quest levels and any fixed/seeded compare run get k = 0
// (the sim ignores it there anyway because those runs are "pure").
// No dark patterns: it never reacts inside a run, never touches rewards, and
// only ever moves pacing by a bounded amount.

export const MAX_K = 0.15;
export const KEEP = 5;
const KEY = 'forkwood.director.v1';
const OFF = new Set(['daily', 'weekly', 'race', 'duel', 'challenge', 'quest', 'seeded', 'compare', 'level', 'demo', 'bot']);

/** Is the director allowed for this mode? */
export function enabled(mode) {
  if (!mode) return false;
  return !OFF.has(String(mode));
}

function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
export function load(st = store()) {
  if (!st) return [];
  try { const v = JSON.parse(st.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(-KEEP) : []; } catch { return []; }
}

/** Record a finished personal run (a summary() object). Ignored for modes where the director is off. */
export function record(sum, mode, st = store()) {
  if (!enabled(mode) || !sum || !st) return load(st);
  const t = Math.max(1, sum.time || 1);
  const runs = load(st);
  runs.push({ h: sum.height | 0, near: (sum.nearMisses || 0) / t * 60, hits: (sum.hits || 0) / t * 60, t: Math.round(t) });
  const out = runs.slice(-KEEP);
  try { st.setItem(KEY, JSON.stringify(out)); } catch { /* full or blocked: no director */ }
  return out;
}

const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : 0; };

/** Hidden skill score in [0, 1] from the last runs (0.5 = typical). */
export function skill(runs) {
  if (!runs || runs.length < 3) return 0.5; // not enough to judge: neutral
  const h = median(runs.map((r) => r.h));          // metres
  const near = median(runs.map((r) => r.near));    // close calls per minute
  const hits = median(runs.map((r) => r.hits));    // hits per minute
  const hs = Math.min(1, h / 900);                 // ~450 m is typical
  const ns = Math.min(1, near / 12);               // ~6 close calls a minute is typical
  const xs = 1 - Math.min(1, hits / 4);            // ~2 hits a minute is typical
  return Math.max(0, Math.min(1, hs * 0.6 + ns * 0.2 + xs * 0.2));
}

/** Offset k for a new run in this mode, clamped to ±MAX_K. */
export function offset(mode, runs = load()) {
  if (!enabled(mode)) return 0;
  const k = (skill(runs) - 0.5) * 2 * MAX_K;
  return Math.max(-MAX_K, Math.min(MAX_K, Math.round(k * 1000) / 1000));
}

/** Options for createSim({ director }) or null when off. */
export function params(mode, runs) {
  if (!enabled(mode)) return null;
  const k = offset(mode, runs ?? load());
  return k ? { k } : null;
}

export const director = { enabled, record, skill, offset, params, load, MAX_K };
export default director;
