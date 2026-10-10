// Forkwood modes and stakes: every way to play is the same simulation with a
// few rules changed (see RULES in sim.js). Pure data + helpers, no DOM.

// Stakes: a difficulty ladder (Balatro-style). Each stake keeps the rules of
// the one below it and adds its own, and pays a score multiplier for it.
export const STAKES = [
  { id: 'sapling', name: 'Sapling', mult: 1, blurb: 'The tree as it grows.', adds: [], rules: {} },
  { id: 'oak', name: 'Oak', mult: 1.5, blurb: 'Thornier and thirstier.', adds: ['hazards come sooner', 'sap drains 10% faster', 'beetles 15% faster'],
    rules: { hazard: 0.25, drain: 1.1, beetle: 1.15 } },
  { id: 'ancient', name: 'Ancient', mult: 2.2, blurb: 'For growers who have seen the stars.', adds: ['everything in Oak', 'hazards sooner still', 'sap drains 28% faster', 'hits cost 30% more', 'every 2nd rest glade is gone', 'growth 5% faster'],
    rules: { hazard: 0.7, drain: 1.28, beetle: 1.3, dmg: 1.3, restSwap: 2, speed: 1.05 } },
];
export const STAKE = Object.fromEntries(STAKES.map((s) => [s.id, s]));

// Modes. `rules` are merged over the stake's rules; `pure` runs ignore charms
// so everyone plays the same tree.
export const MODES = [
  { id: 'classic', name: 'Grow', short: 'Endless', blurb: 'Grow as high as you can. Stakes raise the heat.', stakes: true },
  { id: 'zen', name: 'Zen', short: 'No death', blurb: 'No sap to lose. Hazards still prune you. Grow to the Cloudline at your own pace.', rules: { noDeath: true, drain: 0.35, score: 0.5, finishM: 600 } },
  { id: 'sprint', name: 'Sprint', short: '60 seconds', blurb: 'Sixty seconds on the clock, a little faster. How high can you get?', rules: { timeLimit: 60, speed: 1.12, drain: 0.9, score: 1.2 } },
  { id: 'hardcore', name: 'Hardcore', short: 'One hit', blurb: 'One hit and the tree is done. Forks still revert, so a forked hit ends it too. Points ×2.', rules: { oneHit: true, score: 2 } },
  { id: 'mirror', name: 'Looking-glass', short: 'Left is right', blurb: 'Your steering is mirrored. Points ×1.5.', rules: { score: 1.5 }, mirror: true },
  { id: 'storm', name: 'Storm Rush', short: 'Boss gauntlet', blurb: 'Storm after storm from 60 m up, each one longer, on thornier ground. Points ×1.6.',
    rules: { score: 1.6, hazard: 0.25, drain: 1.15, storms: [{ m: 60, len: 60 }, { m: 200, len: 70 }, { m: 360, len: 85 }, { m: 540, len: 95 }, { m: 740, len: 105 }, { m: 960, len: 115 }, { m: 1200, len: 125 }, { m: 1460, len: 135 }] } },
  { id: 'weekly', name: 'Weekly tree', short: 'Same for all', blurb: 'One course for everyone all week, on Oak, no charms. Share your code.', stake: 'oak', pure: true },
];
export const MODE = Object.fromEntries(MODES.map((m) => [m.id, m]));

/** Rules for a run. run: { mode, stake } (quest levels pass their own rules). */
export function rulesFor(run = {}) {
  const mode = MODE[run.mode] || MODE.classic;
  const stakeId = mode.stake || (mode.stakes ? run.stake : 'sapling') || 'sapling';
  const stake = STAKE[stakeId] || STAKE.sapling;
  const r = { ...stake.rules, ...(mode.rules || {}) };
  // stake and mode multipliers stack
  r.score = (mode.rules && mode.rules.score ? mode.rules.score : 1) * stake.mult;
  return r;
}
export const stakeOf = (run = {}) => { const mode = MODE[run.mode] || MODE.classic; return mode.stake || (mode.stakes ? run.stake || 'sapling' : 'sapling'); };

// ------------------------------------------------------------ weekly seed and codes (UTC, ISO week)
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  const fy = t.getUTCFullYear();
  const ft = new Date(Date.UTC(fy, 0, 4));
  const wk = 1 + Math.round(((t - ft) / 864e5 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
  return `${fy}-W${String(wk).padStart(2, '0')}`;
}
export function weekSeed(key = weekKey()) {
  let h = 2166136261;
  for (const ch of 'forkwood-week-' + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** A short shareable code for a week, e.g. FW-2026W41. */
export const weekCode = (key = weekKey()) => 'FW-' + key.replace('-', '');
export function parseWeek(v) {
  const m = /^(?:FW-)?(\d{4})-?W(\d{2})$/i.exec(String(v || '').trim());
  if (!m) return null;
  const wk = Number(m[2]);
  return wk >= 1 && wk <= 53 ? `${m[1]}-W${m[2]}` : null;
}
