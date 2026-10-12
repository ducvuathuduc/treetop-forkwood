// Forkwood quest map: five worlds, four hand-made levels each. A level is a
// fixed seed + an exact chunk script, so it plays the same every time (and in
// tests). Star 1 = reach the finish ribbon; stars 2 and 3 are the level's own
// goals. Pure data + helpers, no DOM.

// World look: `biome` metres decide the sky and stage name; `climb` metres set
// how thirsty the tree is (as if grown that high).
export const WORLDS = [
  { id: 1, name: 'Meadow', biome: 40, climb: 0, need: 0, twist: 'Learn to fork, merge and weave.', color: '#86d66b' },
  { id: 2, name: 'Frost Bough', biome: 130, climb: 60, need: 6, twist: 'Frost clouds slow you and drink your sap.', color: '#9fd3ec' },
  { id: 3, name: 'Windy Canopy', biome: 250, climb: 120, need: 14, twist: 'Gusts push you sideways; fork around thorn columns.', color: '#eaa13a' },
  { id: 4, name: 'Storm Crown', biome: 430, climb: 170, need: 24, twist: 'Lightning strikes where the dashed lines warn.', color: '#c463a2' },
  { id: 5, name: 'Starlight', biome: 870, climb: 220, need: 34, twist: 'Sliding thorns and every hazard at once.', color: '#5b7fc4' },
];

// Goal kinds for stars 2-3 (sum = sim summary).
const GOALS = {
  score: { v: (s) => s.score, text: (n) => `Score ${n.toLocaleString('en-US')}` },
  merges: { v: (s) => s.merges, text: (n) => `Merge ${n} times` },
  blooms: { v: (s) => s.blooms, text: (n) => n === 1 ? 'Grow a full bloom' : `Grow ${n} full blooms` },
  clean: { v: (s) => (s.hits === 0 && s.reverts === 0 ? 1 : 0), text: () => 'No hits, no reverts' },
  nohit: { v: (s) => (s.hits === 0 ? 1 : 0), text: () => 'No hits (reverts allowed)' },
  near: { v: (s) => s.nearMisses, text: (n) => `${n} close calls` },
  splits: { v: (s) => s.splits, text: (n) => `${n} forked passes (splits or columns)` },
  mult: { v: (s) => s.maxMult, text: (n) => `Reach combo ×${n}` },
  commits: { v: (s) => s.commits, text: (n) => `Catch ${n} sunlight` },
  time: { v: (s) => (s.won ? Math.max(0, 999 - Math.ceil(s.time)) : 0), text: (n) => `Finish in ${999 - n} s or less`, raw: (n) => 999 - n },
  grafts: { v: (s) => s.grafts, text: (n) => n === 1 ? 'Take a graft' : `Take ${n} grafts` },
  storms: { v: (s) => s.storms, text: (n) => n === 1 ? 'Grow through the storm' : `Grow through ${n} storms` },
  golden: { v: (s) => s.goldens, text: () => 'Start a golden hour' },
  acorns: { v: (s) => s.acorns, text: (n) => `Pick up ${n} acorns` },
};
export const goalText = (g) => GOALS[g.k].text(g.n);
export const goalMet = (g, sum) => !!sum.won && (GOALS[g.k].v(sum) || 0) >= g.n;
// "finish in t s" is stored as n = 999 - t so every goal is ">= n"
const T = (sec) => ({ k: 'time', n: 999 - sec });

// Levels. d = hazard intensity for every chunk; drain = sap drain multiplier.
// Scripts use chunk ids from sim.js, 'glade' (rest), 'graft' and { storm: n }.
export const LEVELS = [
  // ---- World 1: Meadow (teaches)
  { id: '1-1', name: 'First Light', seed: 1101, d: 0.15, drain: 0.85, script: ['twinmeadow', 'easysplit', 'meadow', 'glade', 'widegate', 'twinmeadow'],
    goals: [{ k: 'commits', n: 22 }, { k: 'clean', n: 1 }] },
  { id: '1-2', name: 'Two Tips', seed: 1202, d: 0.25, drain: 0.9, script: ['twinmeadow', 'easysplit', 'twinmeadow', 'split', 'glade', 'easysplit', 'twinmeadow'],
    goals: [{ k: 'merges', n: 4 }, { k: 'splits', n: 3 }] },
  { id: '1-3', name: 'Beetle Lane', seed: 1303, d: 0.35, drain: 0.95, script: ['beetles', 'meadow', 'gate', 'beetles', 'glade', 'gatesplit', 'beetles'],
    goals: [{ k: 'near', n: 2 }, { k: 'nohit', n: 1 }] },
  { id: '1-4', name: 'Meadow Remix', seed: 1404, d: 0.55, drain: 1, script: ['gatesplit', 'beetles', 'split', 'crossroads', 'glade', 'gate', 'swarm', 'splitgate'],
    goals: [{ k: 'score', n: 1800 }, { k: 'mult', n: 5 }] },
  // ---- World 2: Frost Bough
  { id: '2-1', name: 'Cold Snap', seed: 2101, d: 0.5, drain: 0.95, script: ['frost', 'meadow', 'frost', 'zigzag', 'glade', 'frost', 'twinmeadow'],
    goals: [{ k: 'commits', n: 30 }, { k: 'nohit', n: 1 }] },
  { id: '2-2', name: 'Zig-Zag', seed: 2202, d: 0.6, drain: 1, script: ['zigzag', 'gate', 'zigzag', 'splitgate', 'glade', 'zigzag', 'split'],
    goals: [{ k: 'splits', n: 2 }, T(29)] },
  { id: '2-3', name: 'Whiteout', seed: 2303, d: 0.7, drain: 1, script: ['frost', 'frostgate', 'zigzag', 'glade', 'frost', 'gatesplit', 'frostgate'],
    goals: [{ k: 'merges', n: 3 }, { k: 'clean', n: 1 }] },
  { id: '2-4', name: 'Frost Remix', seed: 2404, d: 0.85, drain: 1.05, script: ['frostgate', 'zigzag', 'swarm', 'glade', 'frost', 'splitgate', 'frostgate', 'zigzag'],
    goals: [{ k: 'score', n: 2000 }, { k: 'blooms', n: 3 }] },
  // ---- World 3: Windy Canopy
  { id: '3-1', name: 'Gusts', seed: 3101, d: 0.7, drain: 1, script: ['wind', 'meadow', 'wind', 'column', 'glade', 'wind', 'twinmeadow'],
    goals: [{ k: 'commits', n: 40 }, { k: 'nohit', n: 1 }] },
  { id: '3-2', name: 'Straddle', seed: 3202, d: 0.8, drain: 1, script: ['column', 'twinmeadow', 'column', 'crossroads', 'glade', 'column', 'column'],
    goals: [{ k: 'splits', n: 2 }, { k: 'mult', n: 4 }] },
  { id: '3-3', name: 'Crosswind', seed: 3303, d: 0.9, drain: 1.05, script: ['windcolumn', 'wind', 'columnbeetles', 'glade', 'wind', 'windcolumn', 'graft', 'column'],
    goals: [{ k: 'grafts', n: 1 }, { k: 'clean', n: 1 }] },
  { id: '3-4', name: 'Canopy Remix', seed: 3404, d: 1.0, drain: 1.05, script: ['windcolumn', 'columnbeetles', 'wind', 'glade', 'swarmsplit', 'column', 'windcolumn', 'gauntlet'],
    goals: [{ k: 'score', n: 4500 }, { k: 'near', n: 2 }] },
  // ---- World 4: Storm Crown
  { id: '4-1', name: 'First Thunder', seed: 4101, d: 0.9, drain: 1, script: ['meadow', { storm: 3 }, 'glade', { storm: 2 }, 'twinmeadow'],
    goals: [{ k: 'storms', n: 2 }, { k: 'nohit', n: 1 }] },
  { id: '4-2', name: 'Rain Dance', seed: 4202, d: 1.0, drain: 1.05, script: [{ storm: 4 }, 'glade', { storm: 3 }, 'splitgate'],
    goals: [{ k: 'commits', n: 33 }, { k: 'blooms', n: 4 }] },
  { id: '4-3', name: 'Graft in the Rain', seed: 4303, d: 1.05, drain: 1.05, script: ['graft', { storm: 3 }, 'gauntlet', 'glade', { storm: 3 }, 'swarm'],
    goals: [{ k: 'grafts', n: 2 }, { k: 'clean', n: 1 }] },
  { id: '4-4', name: 'Storm Remix', seed: 4404, d: 1.15, drain: 1.1, script: [{ storm: 3 }, 'gauntlet', { storm: 3 }, 'glade', 'swarmsplit', { storm: 3 }, 'gatesplit'],
    goals: [{ k: 'score', n: 8000 }, { k: 'nohit', n: 1 }] },
  // ---- World 5: Starlight
  { id: '5-1', name: 'Drift', seed: 5101, d: 1.0, drain: 1, script: ['slider', 'meadow', 'slider', 'twinslider', 'glade', 'slider', 'twinmeadow'],
    goals: [{ k: 'commits', n: 22 }, { k: 'nohit', n: 1 }] },
  { id: '5-2', name: 'Night Columns', seed: 5202, d: 1.1, drain: 1.05, script: ['slidercolumn', 'column', 'twinslider', 'glade', 'windcolumn', 'slidercolumn'],
    goals: [{ k: 'splits', n: 1 }, T(28)] },
  { id: '5-3', name: 'Everything', seed: 5303, d: 1.2, drain: 1.05, script: ['gauntlet', 'twinslider', 'swarmsplit', 'glade', 'frostgate', { storm: 2 }, 'slidercolumn'],
    goals: [{ k: 'score', n: 3300 }, { k: 'blooms', n: 4 }] },
  { id: '5-4', name: 'Starlight Remix', seed: 5404, d: 1.35, drain: 1.1, script: ['slidercolumn', 'gauntlet', 'windcolumn', 'glade', 'twinslider', 'swarmsplit', { storm: 2 }, 'frostgate', 'slidercolumn'],
    goals: [{ k: 'score', n: 6000 }, { k: 'mult', n: 5 }] },
];
export const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const worldOf = (lv) => WORLDS[Number(String(lv.id).split('-')[0]) - 1];
export const levelsOf = (w) => LEVELS.filter((l) => l.id.startsWith(w + '-'));
export const MAX_STARS = LEVELS.length * 3;

/** Sim rules for a quest level. */
export function levelRules(lv) {
  const w = worldOf(lv);
  return { script: lv.script, d: lv.d, drain: lv.drain, biome: w.biome, climb: w.climb, noGrafts: true };
}
/** Stars earned by one finished level run (0 if the finish was not reached). */
export function starsFor(lv, sum) {
  if (!sum.won) return 0;
  return 1 + lv.goals.filter((g) => goalMet(g, sum)).length;
}
export const nextLevel = (lv) => LEVELS[LEVELS.indexOf(lv) + 1] || null;
