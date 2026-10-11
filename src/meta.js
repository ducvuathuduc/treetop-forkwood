// Forkwood meta progression: acorns, levels (three goals each), daily and
// weekly challenges, achievements, the daily gift and streak, the skin shop
// and charms. Pure functions over one plain save object, so it runs the same
// in the browser and in node tests. Acorns are earned only by playing; there
// is nothing to buy with money and no network.
import { SKINS, SKIN, DEFAULT_LOADOUT } from './skins.js';
import { CHARMS } from './sim.js';
import { mulberry32 } from './rng.js';
import { freshQuest, repairQuest, PRIZES } from './quest.js';
import { freshRet, ensure as ensureRet, streakMilestones, itemUnlocked, unlockLabel } from './retention.js';
import { freshEcon, ensureEcon, afterRunEcon } from './economy.js'; // P8-ECON

export const SAVE_KEY = 'forkwood.save.v2';
export const SAVE_VERSION = 2;

// ------------------------------------------------------------------ dates (UTC, like the daily tree)
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export function weekKey(d = new Date()) {
  // ISO week, e.g. 2026-W41
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  const fy = t.getUTCFullYear();
  const ft = new Date(Date.UTC(fy, 0, 4));
  const wk = 1 + Math.round(((t - ft) / 864e5 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
  return `${fy}-W${String(wk).padStart(2, '0')}`;
}
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const strSeed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
export function msToNextDay(d = new Date()) { const n = new Date(d); n.setUTCHours(24, 0, 0, 0); return n - d; }

// ------------------------------------------------------------------ tasks
// A task is { k: kind, n: target, run: true (in one run) | false (in total) }.
const KIND = {
  height: { v: (s) => s.height, run: (n) => `Grow ${n} m in one run`, tot: (n) => `Climb ${n.toLocaleString('en-US')} m in total` },
  merges: { v: (s) => s.merges, run: (n) => n === 1 ? 'Merge a fork' : `Merge ${n} times in one run`, tot: (n) => `Merge ${n} times` },
  forks: { v: (s) => s.forks, run: (n) => n === 1 ? 'Fork your branch' : `Fork ${n} times in one run`, tot: (n) => `Fork ${n} times` },
  blooms: { v: (s) => s.blooms, run: (n) => n === 1 ? 'Grow a full bloom' : `Grow ${n} full blooms in one run`, tot: (n) => `Grow ${n} full blooms` },
  mult: { v: (s) => s.maxMult, run: (n) => `Reach combo ×${n}`, tot: (n) => `Reach combo ×${n}` },
  golden: { v: (s) => s.goldens, run: (n) => n === 1 ? 'Start a golden hour' : `Start ${n} golden hours in one run`, tot: (n) => `Start ${n} golden hours` },
  near: { v: (s) => s.nearMisses, run: (n) => `Make ${n} close calls in one run`, tot: (n) => `Make ${n} close calls` },
  splits: { v: (s) => s.splits, run: (n) => `Pass ${n} split gates forked in one run`, tot: (n) => `Pass ${n} split gates forked` },
  acorns: { v: (s) => s.acorns, run: (n) => `Pick up ${n} acorns in one run`, tot: (n) => `Pick up ${n} acorns` },
  clean: { v: (s) => (s.reverts === 0 && s.hits === 0 ? s.height : 0), run: (n) => `Grow ${n} m without a hit`, tot: (n) => `Grow ${n} m without a hit` },
  daily: { v: (s, c) => (c.daily ? 1 : 0), run: () => 'Play the daily tree', tot: (n) => `Play the daily tree ${n} times` },
  charm: { v: (s) => s.charmUses, run: (n) => `Use your charm ${n} times in one run`, tot: (n) => n === 1 ? 'Use a charm' : `Use your charm ${n} times` },
  runs: { v: () => 1, run: () => 'Play a run', tot: (n) => `Play ${n} runs` },
  stage: { v: (s) => s.height, run: (n) => `Reach ${STAGE_AT[n] || n + ' m'}`, tot: (n) => `Reach ${STAGE_AT[n] || n + ' m'}` },
  grafts: { v: (s) => s.grafts || 0, run: (n) => n === 1 ? 'Take a graft' : `Take ${n} grafts in one run`, tot: (n) => `Take ${n} grafts` },
  pickups: { v: (s) => s.pickups || 0, run: (n) => n === 1 ? 'Grab a power-up' : `Grab ${n} power-ups in one run`, tot: (n) => `Grab ${n} power-ups` },
  storm: { v: (s) => s.storms || 0, run: (n) => n === 1 ? 'Grow through the storm' : `Grow through ${n} storms in one run`, tot: (n) => `Grow through ${n} storms` },
  graze: { v: (s) => s.grazeBest || 0, run: (n) => `Chain ${n} close calls`, tot: (n) => `Chain ${n} close calls` },
  jit: { v: (s) => s.jits || 0, run: (n) => n === 1 ? 'Merge just before a thorn gate' : `Merge just in time ${n} times in one run`, tot: (n) => `Merge just in time ${n} times` },
};
const STAGE_AT = { 40: 'Sapling (40 m)', 120: 'Bough (120 m)', 240: 'the Canopy (240 m)', 400: 'the Treetop (400 m)', 600: 'the Cloudline (600 m)', 850: 'Starlight (850 m)' };

export function describe(t) { const K = KIND[t.k]; return t.run ? K.run(t.n) : K.tot(t.n); }
export function taskValue(t, sum, ctx = {}) { return KIND[t.k].v(sum, ctx) || 0; }

/** Advance one task with one finished run; returns true when it just completed. */
export function advance(task, sum, ctx = {}) {
  if (task.done) return false;
  const v = taskValue(task, sum, ctx);
  task.p = task.run ? Math.max(task.p || 0, v) : (task.p || 0) + v;
  if (task.p >= task.n) { task.p = task.n; task.done = true; return true; }
  return false;
}

// Levels, Alto's-style: three hand-made goals per level (one that teaches,
// one that stretches, one you will do anyway); finish all three to level up.
const T = (k, n, run = true) => ({ k, n, run });
export const LEVELS = [
  [T('forks', 1), T('merges', 1), T('height', 80)],
  [T('stage', 120), T('acorns', 10, false), T('mult', 3)],
  [T('blooms', 1), T('near', 3), T('grafts', 1)],
  [T('stage', 240), T('splits', 2), T('charm', 1, false)],
  [T('mult', 5), T('merges', 8), T('pickups', 2)],
  [T('stage', 400), T('blooms', 3, false), T('jit', 1)],
  [T('golden', 1), T('clean', 150), T('height', 3000, false)],
  [T('storm', 1), T('graze', 3), T('merges', 60, false)],
  [T('blooms', 3), T('charm', 2), T('pickups', 15, false)],
  [T('stage', 600), T('golden', 3, false), T('clean', 250)],
  [T('mult', 8), T('grafts', 3), T('storm', 3, false)],
  [T('stage', 850), T('golden', 2), T('height', 15000, false)],
];
// Goals that earlier builds used and this one retired, swapped on load so no
// saved level ever waits on a mode the player may not want to play.
const RETIRED = { 3: { runs: T('grafts', 1) }, 5: { daily: T('pickups', 2) }, 6: { acorns: T('jit', 1) }, 8: { splits: T('storm', 1), near: T('graze', 3) }, 9: { acorns: T('pickups', 15, false) }, 11: { blooms: T('grafts', 3), daily: T('storm', 3, false) } };
export function levelGoals(level) {
  if (level <= LEVELS.length) return LEVELS[level - 1].map((t) => ({ ...t, p: 0, done: false }));
  // after the hand-made levels: generated sets that keep stretching
  const r = mulberry32(level * 7919);
  const L = level - LEVELS.length;
  const pick = (a) => a[Math.floor(r() * a.length)];
  return [
    pick([T('height', 500 + 50 * Math.min(8, L)), T('clean', 200 + 25 * Math.min(8, L)), T('mult', 8)]),
    pick([T('merges', 10 + Math.min(10, L)), T('blooms', 3 + Math.min(4, L >> 1)), T('near', 6 + Math.min(6, L)), T('splits', 4 + Math.min(4, L >> 1)), T('graze', 4 + Math.min(4, L >> 1)), T('grafts', 3 + Math.min(2, L >> 2))]),
    pick([T('height', 4000 + 1000 * L, false), T('acorns', 80 + 20 * L, false), T('golden', 2 + L, false), T('blooms', 10 + 2 * L, false), T('storm', 2 + L, false), T('pickups', 15 + 5 * L, false)]),
  ].map((t) => ({ ...t, p: 0, done: false }));
}
export const levelReward = (level) => 25 + 10 * level; // acorns for finishing `level`
export const CHARM_LEVEL = { ward: 2, sun: 3, still: 5, roots: 7 }; // charm unlocked on reaching this level

// Daily (3) and weekly (3) challenges, picked from pools by the date.
const DAILY_POOL = [
  [T('height', 150), T('height', 220), T('merges', 4), T('acorns', 6), T('forks', 4), T('stage', 120), T('grafts', 1), T('pickups', 1)],
  [T('blooms', 2), T('mult', 5), T('near', 4), T('splits', 3), T('merges', 8), T('acorns', 12, false), T('clean', 120), T('pickups', 3, false), T('graze', 3), T('jit', 1)],
  [T('stage', 400), T('golden', 1), T('clean', 250), T('blooms', 4), T('mult', 7), T('splits', 5), T('storm', 1), T('grafts', 3)],
];
const DAILY_REWARD = [15, 25, 40];
const WEEKLY_POOL = [
  [T('height', 4000, false), T('height', 6000, false), T('runs', 15, false)],
  [T('blooms', 15, false), T('merges', 80, false), T('acorns', 100, false), T('near', 40, false)],
  [T('golden', 4, false), T('daily', 3, false), T('splits', 25, false), T('stage', 600), T('storm', 4, false), T('grafts', 15, false)],
];
const WEEKLY_REWARD = [80, 110, 150];

export function dailySet(day) {
  const r = mulberry32(strSeed('d' + day));
  return DAILY_POOL.map((pool, i) => ({ ...pool[Math.floor(r() * pool.length)], p: 0, done: false, claimed: false, reward: DAILY_REWARD[i] }));
}
export function weeklySet(week) {
  const r = mulberry32(strSeed('w' + week));
  return WEEKLY_POOL.map((pool, i) => ({ ...pool[Math.floor(r() * pool.length)], p: 0, done: false, claimed: false, reward: WEEKLY_REWARD[i] }));
}

// ------------------------------------------------------------------ achievements
export const ACHIEVEMENTS = [
  { id: 'sprout', name: 'First sprout', text: 'Finish your first run', reward: 10, test: (s, S) => S.stats.runs >= 1 },
  { id: 'merge', name: 'Fast-forward', text: 'Merge a fork for the first time', reward: 10, test: (s, S) => S.stats.merges >= 1 },
  { id: 'canopy', name: 'Into the canopy', text: 'Reach 240 m', reward: 20, test: (s, S) => S.best.height >= 240 },
  { id: 'treetop', name: 'Treetop', text: 'Reach the Treetop at 400 m', reward: 50, test: (s, S) => S.best.height >= 400 },
  { id: 'cloudline', name: 'Head in the clouds', text: 'Reach the Cloudline at 600 m', reward: 80, test: (s, S) => S.best.height >= 600 },
  { id: 'starlight', name: 'Starlight', text: 'Reach 850 m. Unlocks Gilded bark', reward: 120, test: (s, S) => S.best.height >= 850 },
  { id: 'golden', name: 'Golden hour', text: 'Reach combo ×8', reward: 30, test: (s, S) => S.stats.goldens >= 1 },
  { id: 'goldx3', name: 'Long afternoon', text: 'Three golden hours in one run', reward: 80, test: (s) => s && s.goldens >= 3 },
  { id: 'florist', name: 'Florist', text: 'Five full blooms in one run. Unlocks Moonflower', reward: 60, test: (s) => s && s.blooms >= 5 },
  { id: 'clean', name: 'Clean history', text: '300 m without a single hit', reward: 60, test: (s) => s && s.hits === 0 && s.reverts === 0 && s.height >= 300 },
  { id: 'shave', name: 'Close shave', text: 'Ten close calls in one run', reward: 40, test: (s) => s && s.nearMisses >= 10 },
  { id: 'lanes', name: 'Both lanes', text: 'Pass five split gates forked in one run', reward: 40, test: (s) => s && s.splits >= 5 },
  { id: 'hoard', name: 'Squirrel', text: 'Pick up 250 acorns in total', reward: 50, test: (s, S) => S.stats.acorns >= 250 },
  { id: 'week', name: 'Seven mornings', text: 'Keep a 7-day streak', reward: 70, test: (s, S) => S.streak.best >= 7 },
  { id: 'collector', name: 'Collector', text: 'Own 12 skins', reward: 60, test: (s, S) => S.owned.length >= 12 },
  { id: 'charmed', name: 'Charmed', text: 'Use charms 20 times', reward: 40, test: (s, S) => S.stats.charmUses >= 20 },
  { id: 'friend', name: 'Rival', text: 'Beat a friend on their challenge link', reward: 40, test: (s, S, c) => !!(c && c.challengeWon) },
  { id: 'regular', name: 'Regular', text: 'Play 50 runs', reward: 60, test: (s, S) => S.stats.runs >= 50 },
  { id: 'weathered', name: 'Weathered', text: 'Grow through the storm', reward: 50, test: (s, S) => S.stats.storms >= 1 },
  { id: 'grafter', name: 'Grafter', text: 'Take four grafts in one run', reward: 50, test: (s) => s && s.grafts >= 4 },
  { id: 'kindred', name: 'Kindred grafts', text: 'Pair two grafts into a synergy', reward: 40, test: (s) => s && s.synergies && s.synergies.length >= 1 },
];
export const ACH = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// ------------------------------------------------------------------ save
export function freshSave(today = dayKey()) {
  return {
    v: SAVE_VERSION,
    created: today,
    acorns: 0, earned: 0, spent: 0,
    owned: SKINS.filter((s) => s.unlock.free).map((s) => s.id),
    loadout: { ...DEFAULT_LOADOUT },
    charm: null,
    level: 1, goals: levelGoals(1),
    daily: { day: '', list: [] },
    weekly: { week: '', list: [] },
    streak: { last: '', count: 0, best: 0, freezes: 0 },
    ach: {},
    seen: {},
    stats: { runs: 0, meters: 0, merges: 0, treetops: 0, bestMult: 1, blooms: 0, goldens: 0, acorns: 0, nearMisses: 0, splits: 0, charmUses: 0, forks: 0, time: 0, dailyRuns: 0, grafts: 0, storms: 0, pickups: 0 },
    best: { score: 0, height: 0 },
    topRuns: [],
    tutorial: false,
    calm: null,
    quest: freshQuest(),
    ret: freshRet(),
    econ: freshEcon(), // P8-ECON
  };
}

/**
 * Load the save, upgrading old data. `get(key)` returns parsed JSON or null.
 * Version 1 (the first public build) kept best/stats/tutorial/calm in separate
 * keys; those players keep everything and get acorns for the metres they grew.
 */
export function loadSave(get, today = dayKey()) {
  let S = null;
  try { S = get(SAVE_KEY); } catch { S = null; }
  if (S && typeof S === 'object' && S.v === SAVE_VERSION) return repair(S, today);
  S = freshSave(today);
  const best = safe(get, 'forkwood.best'), stats = safe(get, 'forkwood.stats');
  const tut = safe(get, 'forkwood.tutorial'), calm = safe(get, 'forkwood.calm');
  if (best && typeof best === 'object') S.best = { score: num(best.score), height: num(best.height) };
  if (stats && typeof stats === 'object') {
    for (const k of ['runs', 'meters', 'merges', 'treetops']) S.stats[k] = num(stats[k]);
    S.stats.bestMult = Math.max(1, num(stats.bestMult));
  }
  if (tut === true) S.tutorial = true;
  if (calm === true || calm === false) S.calm = calm;
  if (S.stats.runs > 0 || S.best.height > 0) {
    S.migrated = 1;
    const bonus = Math.min(400, Math.floor(S.stats.meters / 25));
    S.acorns += bonus; S.earned += bonus;
    S.migrationBonus = bonus;
    checkAchievements(S, null, {}); // retro badges: treetop, canopy...
  }
  return repair(S, today);
}
const safe = (get, k) => { try { return get(k); } catch { return null; } };
const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);

/** Fill anything missing or broken, and roll daily/weekly sets over. */
export function repair(S, today = dayKey()) {
  const F = freshSave(today);
  const lvl = Number.isFinite(S.level) && S.level >= 1 ? Math.floor(S.level) : 1;
  const goalsOk = Array.isArray(S.goals) && S.goals.length === 3 && S.goals.every((g) => g && KIND[g.k] && Number.isFinite(g.n));
  for (const k of Object.keys(F)) if (k !== 'calm' && k !== 'charm' && (S[k] == null || typeof S[k] !== typeof F[k] || Array.isArray(S[k]) !== Array.isArray(F[k]))) S[k] = F[k];
  if (S.calm !== true && S.calm !== false) S.calm = null;
  if (typeof S.charm !== 'string') S.charm = null;
  for (const k of Object.keys(F.stats)) if (!Number.isFinite(S.stats[k])) S.stats[k] = F.stats[k];
  S.acorns = Math.max(0, Math.floor(S.acorns));
  S.owned = [...new Set(S.owned.filter((id) => SKIN[id]).concat(F.owned))];
  for (const slot of Object.keys(DEFAULT_LOADOUT)) if (!S.owned.includes(S.loadout[slot]) || SKIN[S.loadout[slot]].slot !== slot) S.loadout[slot] = DEFAULT_LOADOUT[slot];
  if (S.charm && (!CHARMS[S.charm] || !charmUnlocked(S, S.charm))) S.charm = null;
  S.level = lvl;
  if (!goalsOk) S.goals = levelGoals(lvl);
  else if (RETIRED[lvl]) S.goals = S.goals.map((g) => (RETIRED[lvl][g.k] && !LEVELS[lvl - 1].some((t) => t.k === g.k && t.n === g.n && t.run === g.run) ? (g.done ? { ...RETIRED[lvl][g.k], p: RETIRED[lvl][g.k].n, done: true } : { ...RETIRED[lvl][g.k], p: 0, done: false }) : g));
  repairQuest(S);
  ensureRet(S);
  ensureEcon(S); // P8-ECON
  unlockEarned(S);
  rollover(S, new Date(today + 'T12:00:00Z'));
  return S;
}

export function rollover(S, now = new Date()) {
  const d = dayKey(now), w = weekKey(now);
  if (S.daily.day !== d) S.daily = { day: d, list: dailySet(d) };
  if (S.weekly.week !== w) S.weekly = { week: w, list: weeklySet(w) };
}

// ------------------------------------------------------------------ gift + streak
export const GIFTS = [20, 25, 30, 40, 50, 60, 100];
export function giftReady(S, today = dayKey()) { return S.streak.last !== today; }
/** Claim today's gift. A missed day can be covered by a frost guard (earned every 7 days). */
export function claimGift(S, today = dayKey()) {
  if (!giftReady(S, today)) return null;
  const st = S.streak;
  let usedFreeze = false;
  const gap = st.last ? dayDiff(st.last, today) : 99;
  if (gap === 1) st.count++;
  else if (gap === 2 && st.freezes > 0) { st.freezes--; st.count++; usedFreeze = true; }
  else st.count = 1;
  st.last = today;
  st.best = Math.max(st.best, st.count);
  const amount = GIFTS[(st.count - 1) % 7];
  let freeze = false;
  if (st.count % 7 === 0 && st.freezes < 2) { st.freezes++; freeze = true; }
  gain(S, amount);
  const milestones = streakMilestones(S);
  unlockEarned(S);
  const achs = checkAchievements(S, null, {});
  return { amount, day: st.count, usedFreeze, freeze, achs, milestones };
}

function gain(S, n) { S.acorns += n; S.earned += n; }

// ------------------------------------------------------------------ shop
export function priceOf(S, id, today = dayKey()) {
  const it = SKIN[id];
  if (!it || !it.unlock.cost) return null;
  const deal = featured(S, today);
  return deal && deal.id === id ? Math.round(it.unlock.cost * 0.75) : it.unlock.cost;
}
/** One unowned shop item a day at 25% off. */
export function featured(S, today = dayKey()) {
  const pool = SKINS.filter((s) => s.unlock.cost && !S.owned.includes(s.id));
  if (!pool.length) return null;
  const r = mulberry32(strSeed('f' + today));
  return pool[Math.floor(r() * pool.length)];
}
export function canBuy(S, id, today) { const p = priceOf(S, id, today); return p != null && !S.owned.includes(id) && S.acorns >= p; }
export function buy(S, id, today = dayKey()) {
  if (!canBuy(S, id, today)) return false;
  const p = priceOf(S, id, today);
  S.acorns -= p; S.spent += p;
  S.owned.push(id);
  return true;
}
export function equip(S, id) {
  const it = SKIN[id];
  if (!it || !S.owned.includes(id)) return false;
  S.loadout[it.slot] = id;
  return true;
}
export function unlockText(it) {
  const u = it.unlock;
  if (u.free) return 'Starter';
  if (u.cost) return `${u.cost} acorns`;
  if (u.level) return `Reach level ${u.level}`;
  if (u.ach) return `Badge: ${ACH[u.ach] ? ACH[u.ach].name : u.ach}`;
  if (u.prize) return `Quest: ${PRIZES[u.prize] ? PRIZES[u.prize].text : u.prize}`;
  return unlockLabel(u);
}
export function unlockEarned(S) {
  const got = [];
  for (const it of SKINS) {
    if (S.owned.includes(it.id)) continue;
    if ((it.unlock.level && S.level >= it.unlock.level) || (it.unlock.ach && S.ach[it.unlock.ach]) || (it.unlock.prize && S.quest && S.quest.prizes.includes(it.unlock.prize)) || ((it.unlock.season || it.unlock.streak || it.unlock.league) && S.ret && itemUnlocked(S, it.unlock))) { S.owned.push(it.id); got.push(it.id); }
  }
  return got;
}

// ------------------------------------------------------------------ charms
export const charmUnlocked = (S, id) => S.level >= (CHARM_LEVEL[id] || 99);
export function setCharm(S, id) { if (id === null || (CHARMS[id] && charmUnlocked(S, id))) { S.charm = id; return true; } return false; }

// ------------------------------------------------------------------ achievements
export function checkAchievements(S, sum, ctx) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (S.ach[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(sum, S, ctx); } catch { ok = false; }
    if (ok) { S.ach[a.id] = dayKey(); gain(S, a.reward); got.push(a.id); }
  }
  return got;
}

// ------------------------------------------------------------------ end of run
/** Acorns a run is worth, itemised for the game-over screen. */
export function runAcorns(sum) {
  const parts = [
    ['picked up', sum.acorns || 0],
    ['height', Math.floor(sum.height / 30)],
    ['merges', sum.merges || 0],
    ['blooms', 2 * (sum.blooms || 0)],
    ['golden hours', 5 * (sum.goldens || 0)],
  ].filter((p) => p[1] > 0);
  return { total: parts.reduce((a, p) => a + p[1], 0), parts };
}

/**
 * Apply one finished run to the save. ctx: { daily, challengeWon, now }.
 * Returns everything the game-over screen celebrates.
 */
export function finishRun(S, sum, ctx = {}) {
  const now = ctx.now || new Date();
  rollover(S, now);
  const out = { acorns: runAcorns(sum), goalsDone: [], levelUps: [], daily: [], weekly: [], achs: [], unlocked: [], charms: [], bestScore: false, bestHeight: false };
  gain(S, out.acorns.total);
  const st = S.stats;
  st.runs++; st.meters += sum.height; st.merges += sum.merges; st.treetops += sum.height >= 400 ? 1 : 0;
  st.bestMult = Math.max(st.bestMult, sum.maxMult); st.blooms += sum.blooms; st.goldens += sum.goldens; st.acorns += sum.acorns || 0;
  st.nearMisses += sum.nearMisses; st.splits += sum.splits || 0; st.charmUses += sum.charmUses || 0; st.forks += sum.forks || 0;
  st.time += Math.round(sum.time || 0); if (ctx.daily) st.dailyRuns++;
  st.grafts += sum.grafts || 0; st.storms += sum.storms || 0; st.pickups += sum.pickups || 0;
  // personal bests and the top-5 come from endless runs only (quest levels, Zen
  // and Sprint have their own records in the quest block)
  if (!ctx.noBest) {
    if (sum.score > S.best.score) { S.best.score = sum.score; out.bestScore = true; }
    if (sum.height > S.best.height) { S.best.height = sum.height; out.bestHeight = true; }
    S.topRuns.push({ h: sum.height, s: sum.score, hash: sum.hash, d: dayKey(now), daily: !!ctx.daily });
    S.topRuns.sort((a, b) => b.h - a.h || b.s - a.s); S.topRuns.length = Math.min(S.topRuns.length, 5);
  }
  // level goals: finishing all three levels up; the next set starts fresh next run
  for (const g of S.goals) if (advance(g, sum, ctx)) out.goalsDone.push(describe(g));
  out.goalsAfter = S.goals.map((g) => ({ text: describe(g), done: g.done }));
  if (S.goals.every((g) => g.done)) {
    const reward = levelReward(S.level);
    gain(S, reward);
    S.level++;
    S.goals = levelGoals(S.level);
    out.levelUps.push({ level: S.level, reward });
    for (const [id, lv] of Object.entries(CHARM_LEVEL)) if (lv === S.level) { out.charms.push(id); if (!S.charm) S.charm = id; }
  }
  // challenges pay out at once
  for (const [list, sink] of [[S.daily.list, out.daily], [S.weekly.list, out.weekly]]) {
    for (const c of list) if (advance(c, sum, ctx) && !c.claimed) { c.claimed = true; gain(S, c.reward); sink.push({ text: describe(c), reward: c.reward }); }
  }
  out.econ = afterRunEcon(S, sum, { today: dayKey(now), out }); // P8-ECON: gems, word hunt
  out.achs = checkAchievements(S, sum, ctx);
  out.unlocked = unlockEarned(S);
  out.total = S.acorns;
  return out;
}

export function collection(S) { return { owned: S.owned.length, total: SKINS.length }; }
