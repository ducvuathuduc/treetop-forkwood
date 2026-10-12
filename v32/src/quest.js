// Forkwood quest progress: stars, world and mode unlocks, stakes, chests,
// prizes (world-exclusive skins) and titles. Pure functions over the save's
// `quest` block, so node tests run the same logic as the browser. Rewards are
// earned by playing only; there is nothing to buy.
import { WORLDS, LEVELS, LEVEL, levelsOf, goalMet, MAX_STARS } from './campaign.js';
import { MODES, STAKES, STAKE } from './modes.js';

export function freshQuest() {
  return {
    stars: {},       // level id -> stars (0-3): goals stay earned across tries
    marks: {},       // level id -> bitmask: 1 finish, 2 goal one, 4 goal two
    best: {},        // level id -> best score
    chests: 0,       // chests opened (one per 6 stars)
    prizes: [],      // prize ids won (unlock world skins)
    titles: [],      // title ids earned
    title: null,     // title shown on the postcard
    modeBest: {},    // mode id -> { h, s }
    stakeBest: {},   // stake id -> best classic height
    stake: 'sapling',
    weekly: {},      // week key -> { h, s }
    seen: [],        // unlock ids already announced
  };
}

/** Fill a missing or broken quest block (saves from earlier builds). */
export function repairQuest(S) {
  const F = freshQuest();
  if (!S.quest || typeof S.quest !== 'object' || Array.isArray(S.quest)) S.quest = F;
  const Q = S.quest;
  for (const k of Object.keys(F)) if (Q[k] == null || typeof Q[k] !== typeof F[k] || Array.isArray(Q[k]) !== Array.isArray(F[k])) Q[k] = F[k];
  for (const [id, v] of Object.entries(Q.stars)) if (!LEVEL[id] || !Number.isFinite(v)) delete Q.stars[id]; else Q.stars[id] = Math.max(0, Math.min(3, Math.floor(v)));
  if (!STAKE[Q.stake] || !stakeUnlocked(S, Q.stake)) Q.stake = 'sapling';
  if (Q.title && !TITLE[Q.title]) Q.title = null;
  Q.chests = Math.max(0, Math.min(chestsEarned(S), Math.floor(Q.chests) || 0));
  return Q;
}

const popcount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
export const totalStars = (S) => Object.values(S.quest.stars).reduce((a, b) => a + b, 0);
export const worldStars = (S, w) => levelsOf(w).reduce((a, l) => a + (S.quest.stars[l.id] || 0), 0);
export const cleared = (S, id) => (S.quest.stars[id] || 0) >= 1;
export const worldCleared = (S, w) => levelsOf(w).every((l) => cleared(S, l.id));

export function worldUnlocked(S, w) {
  const W = WORLDS[w - 1];
  if (!W) return false;
  return w === 1 || (totalStars(S) >= W.need && cleared(S, `${w - 1}-1`));
}
/** A level opens when its world is open and the level before it is cleared. */
export function levelUnlocked(S, id) {
  const lv = LEVEL[id];
  if (!lv) return false;
  const [w, n] = id.split('-').map(Number);
  if (!worldUnlocked(S, w)) return false;
  return n === 1 || cleared(S, `${w}-${n - 1}`);
}

// Modes and stakes unlock through the quest map, or through endless play for
// growers who never open the map (either way works).
export const MODE_UNLOCK = {
  classic: { text: 'Open from the start', test: () => true },
  zen: { text: 'Clear level 1-2, or play 3 runs', test: (S) => cleared(S, '1-2') || S.stats.runs >= 3 },
  sprint: { text: 'Clear World 1, or grow 240 m', test: (S) => worldCleared(S, 1) || S.best.height >= 240 },
  hardcore: { text: 'Clear World 2, or reach the Treetop (400 m)', test: (S) => worldCleared(S, 2) || S.best.height >= 400 },
  mirror: { text: 'Clear World 3, or grow 600 m', test: (S) => worldCleared(S, 3) || S.best.height >= 600 },
  storm: { text: 'Clear World 4, or reach the Treetop on Oak', test: (S) => worldCleared(S, 4) || (S.quest.stakeBest.oak || 0) >= 400 },
  weekly: { text: 'Earn 12 stars, or grow 850 m', test: (S) => totalStars(S) >= 12 || S.best.height >= 850 },
};
export const modeUnlocked = (S, id) => !!(MODE_UNLOCK[id] && MODE_UNLOCK[id].test(S));

export const STAKE_UNLOCK = {
  sapling: { text: 'Open from the start', test: () => true },
  oak: { text: 'Reach the Treetop (400 m) on Sapling, or earn 9 stars', test: (S) => (S.quest.stakeBest.sapling || 0) >= 400 || S.best.height >= 400 || totalStars(S) >= 9 },
  ancient: { text: 'Reach the Treetop on Oak, or earn 30 stars', test: (S) => (S.quest.stakeBest.oak || 0) >= 400 || totalStars(S) >= 30 },
};
export const stakeUnlocked = (S, id) => !!(STAKE_UNLOCK[id] && STAKE_UNLOCK[id].test(S));

// Chests: one per 6 stars; contents fixed by chest number.
export const STARS_PER_CHEST = 6;
export const chestsEarned = (S) => Math.floor(totalStars(S) / STARS_PER_CHEST);
export const chestReward = (k) => 40 + 15 * k; // acorns in chest k (1-based)

// Prizes: world clears and mode feats unlock skins that cannot be bought.
export const PRIZES = {
  w1: { text: 'Clear World 1', test: (S) => worldCleared(S, 1) },
  w2: { text: 'Clear World 2', test: (S) => worldCleared(S, 2) },
  w3: { text: 'Clear World 3', test: (S) => worldCleared(S, 3) },
  w4: { text: 'Clear World 4', test: (S) => worldCleared(S, 4) },
  w5: { text: 'Clear World 5', test: (S) => worldCleared(S, 5) },
  hardcore: { text: 'Grow 300 m in Hardcore', test: (S) => ((S.quest.modeBest.hardcore || {}).h || 0) >= 300 },
  sprint: { text: 'Grow 420 m in a Sprint', test: (S) => ((S.quest.modeBest.sprint || {}).h || 0) >= 420 },
  allstars: { text: `Earn all ${MAX_STARS} stars`, test: (S) => totalStars(S) >= MAX_STARS },
};

export const TITLES = [
  { id: 'pathfinder', name: 'Pathfinder', text: 'Clear World 1', test: (S) => worldCleared(S, 1) },
  { id: 'frostwalker', name: 'Frostwalker', text: 'Clear World 2', test: (S) => worldCleared(S, 2) },
  { id: 'windrider', name: 'Windrider', text: 'Clear World 3', test: (S) => worldCleared(S, 3) },
  { id: 'stormchaser', name: 'Stormchaser', text: 'Clear World 4', test: (S) => worldCleared(S, 4) },
  { id: 'starborn', name: 'Starborn', text: 'Clear World 5', test: (S) => worldCleared(S, 5) },
  { id: 'ironbark', name: 'Ironbark', text: 'Grow 300 m in Hardcore', test: (S) => PRIZES.hardcore.test(S) },
  { id: 'swift', name: 'Swift', text: 'Grow 420 m in a Sprint', test: (S) => PRIZES.sprint.test(S) },
  { id: 'oakheart', name: 'Oakheart', text: 'Reach the Treetop on Oak', test: (S) => (S.quest.stakeBest.oak || 0) >= 400 },
  { id: 'ancient', name: 'Ancient One', text: 'Reach the Treetop on Ancient', test: (S) => (S.quest.stakeBest.ancient || 0) >= 400 },
  { id: 'mapmaker', name: 'Mapmaker', text: `Earn all ${MAX_STARS} stars`, test: (S) => PRIZES.allstars.test(S) },
];
export const TITLE = Object.fromEntries(TITLES.map((t) => [t.id, t]));
export function setTitle(S, id) { if (id === null || S.quest.titles.includes(id)) { S.quest.title = id; return true; } return false; }

/** Everything the player can unlock, in one list (for announcements). */
function unlockState(S) {
  const out = [];
  for (const m of MODES) if (m.id !== 'classic' && modeUnlocked(S, m.id)) out.push('mode:' + m.id);
  for (const k of STAKES) if (k.id !== 'sapling' && stakeUnlocked(S, k.id)) out.push('stake:' + k.id);
  for (let w = 2; w <= WORLDS.length; w++) if (worldUnlocked(S, w)) out.push('world:' + w);
  return out;
}

/**
 * Apply a finished run to the quest block. ctx: { mode, stake, level, week }.
 * Returns what the game-over card celebrates: stars, chests, prizes, titles, unlocks.
 */
export function finishQuest(S, sum, ctx = {}) {
  repairQuest(S);
  const Q = S.quest;
  const out = { stars: 0, prevStars: 0, newStars: 0, chests: [], prizes: [], titles: [], unlocks: [], modeBest: false, stakeBest: false };
  if (ctx.level && LEVEL[ctx.level]) {
    const lv = LEVEL[ctx.level];
    const mask = sum.won ? 1 | lv.goals.reduce((m, g, i) => m | (goalMet(g, sum) ? 2 << i : 0), 0) : 0;
    out.mask = mask;
    out.runStars = popcount(mask);
    out.prevStars = Q.stars[lv.id] || 0;
    Q.marks[lv.id] = (Q.marks[lv.id] || 0) | mask;
    Q.stars[lv.id] = Math.max(out.prevStars, popcount(Q.marks[lv.id]));
    out.stars = Q.stars[lv.id];
    out.newStars = Math.max(0, out.stars - out.prevStars);
    if (sum.won && sum.score > (Q.best[lv.id] || 0)) { Q.best[lv.id] = sum.score; out.levelBest = true; }
  } else if (ctx.mode && ctx.mode !== 'classic') {
    const key = ctx.mode, b = Q.modeBest[key] || { h: 0, s: 0 };
    if (sum.height > b.h || sum.score > b.s) { Q.modeBest[key] = { h: Math.max(b.h, sum.height), s: Math.max(b.s, sum.score) }; out.modeBest = true; }
    if (ctx.mode === 'weekly' && ctx.week) {
      const w = Q.weekly[ctx.week] || { h: 0, s: 0 };
      Q.weekly[ctx.week] = { h: Math.max(w.h, sum.height), s: Math.max(w.s, sum.score) };
      const keys = Object.keys(Q.weekly).sort(); while (keys.length > 8) delete Q.weekly[keys.shift()];
    }
  } else {
    const st = ctx.stake || 'sapling';
    if (sum.height > (Q.stakeBest[st] || 0)) { Q.stakeBest[st] = sum.height; out.stakeBest = true; }
  }
  // chests for every 6 stars
  while (Q.chests < chestsEarned(S)) {
    Q.chests++;
    const n = chestReward(Q.chests);
    S.acorns += n; S.earned += n;
    out.chests.push({ k: Q.chests, acorns: n });
  }
  for (const [id, p] of Object.entries(PRIZES)) if (!Q.prizes.includes(id) && p.test(S)) { Q.prizes.push(id); out.prizes.push(id); }
  for (const t of TITLES) if (!Q.titles.includes(t.id) && t.test(S)) { Q.titles.push(t.id); out.titles.push(t.id); if (!Q.title) Q.title = t.id; }
  for (const u of unlockState(S)) if (!Q.seen.includes(u)) { Q.seen.push(u); out.unlocks.push(u); }
  return out;
}

/** Mark unlocks the player already has as seen (first load, so old saves are not spammed). */
export function primeSeen(S) { repairQuest(S); for (const u of unlockState(S)) if (!S.quest.seen.includes(u)) S.quest.seen.push(u); }

/** Spoiler-free text grid of the quest map for sharing (like a Wordle grid). */
export function mapGrid(S) {
  const rows = WORLDS.map((w) => {
    if (!worldUnlocked(S, w.id)) return `${w.id} · locked`;
    return `${w.id} ` + levelsOf(w.id).map((l) => { const n = S.quest.stars[l.id] || 0; return '★'.repeat(n) + '☆'.repeat(3 - n); }).join(' ');
  });
  return `Forkwood quest ${totalStars(S)}/${MAX_STARS}★\n` + rows.join('\n');
}
export { LEVELS, WORLDS, MAX_STARS };
