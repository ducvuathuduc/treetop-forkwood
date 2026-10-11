// P8-ECON: the endless-runner economy, modelled on Subway Surfers and Jetpack
// Joyride (see ECONOMY.md for the numbers and the 30-day simulation).
//
//   acorns (soft, earned every run)  -> boosts, upgrades, seed pods, skins
//   dew gems (hard, rare, earned only by playing: levels, dailies, word hunt,
//             streaks, season tiers, rare drops)  -> second chance, golden pods,
//             frost guards, goal skips
//
// There is NO real-money store. The "gem nest" only lists how gems are earned.
// Boosts, upgrades and the grower multiplier are switched off on every fair run
// (daily, weekly, quest levels, challenge and duel links, live races), exactly
// like charms. Pure functions over the save object; no DOM, no Math.random
// (callers pass a rng, so the browser and node tests behave the same).
import { mulberry32 } from './rng.js';

const strSeed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------------ boosts (consumables, one of each per run)
export const BOOSTS = {
  sprout: { name: 'Head start', price: 150, blurb: '8 s of Sap Rush from the soil: about 40 m ahead, untouchable.', icon: 'rush' },
  mega:   { name: 'Mega head start', price: 450, blurb: '18 s of Sap Rush: about 95 m ahead, past the meadow and into the Bough.', icon: 'rush' },
  ink:    { name: 'Score booster', price: 300, blurb: 'Points ×1.5 for the whole run.', icon: 'ink' },
  pollen: { name: 'Pollen start', price: 100, blurb: 'Start with 15 s of Pollen: sunlight drifts to you.', icon: 'pollen' },
  bark:   { name: 'Bark shield', price: 120, blurb: 'Start with a bark shield that blocks one hit.', icon: 'bark' },
};
export const BOOST_IDS = Object.keys(BOOSTS);

// ------------------------------------------------------------------ upgrades (power-up durations)
// Six levels each; prices grow ~1.6x per level (Subway's power-up upgrade ladder).
export const UPGRADE_COST = [250, 500, 900, 1500, 2400, 3600];
export const UPGRADES = {
  pollen: { name: 'Pollen', base: 6, per: 0.15, unit: 's', blurb: 'sunlight drifts to your tips for longer' },
  ink:    { name: 'Ink ×2', base: 8, per: 0.15, unit: 's', blurb: 'double points last longer' },
  rush:   { name: 'Sap Rush', base: 3, per: 0.12, unit: 's', blurb: 'the surge lasts longer' },
  golden: { name: 'Golden hour', base: 6, per: 0.10, unit: 's', blurb: 'combo ×8 shines for longer' },
  dew:    { name: 'Dew drops', base: 30, per: 0.08, unit: 'sap', blurb: 'every dew drop gives more sap' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);
export const MAX_UP = UPGRADE_COST.length;
export const upLevel = (S, id) => Math.max(0, Math.min(MAX_UP, (S.econ && S.econ.up[id]) | 0));
export const upCost = (S, id) => (upLevel(S, id) >= MAX_UP ? null : UPGRADE_COST[upLevel(S, id)]);
export const upValue = (id, lv) => +(UPGRADES[id].base * (1 + UPGRADES[id].per * lv)).toFixed(1);

// ------------------------------------------------------------------ grower multiplier (mission sets)
// Every level (a set of three goals) raises the score multiplier by 0.1, up to ×3.
export const MULT_PER_LEVEL = 0.1, MULT_MAX = 3;
export const growerMult = (S) => Math.min(MULT_MAX, +(1 + MULT_PER_LEVEL * Math.max(0, (S.level || 1) - 1)).toFixed(2));

// ------------------------------------------------------------------ gems
export const GEM = {
  levelUp: 1,        // every 3rd finished goal set (levels 3, 6, 9, ...)
  allDaily: 1,       // all three daily challenges
  allWeekly: 2,      // all three weekly challenges
  word: [0, 0, 1, 0, 1], // word hunt day 1..5 (day 5+ repeats the last)
  streak: { 7: 3, 14: 3, 30: 8, 60: 10, 100: 15 },
  season: { 5: 2, 10: 2, 15: 2, 20: 3, 25: 3, 30: 5 },
  promote: 2,        // league promotion
  dropChance: 0.10,  // a dew gem in the tree, once per run, past 250 m
};
export const REVIVE_BASE = 1;               // gems; doubles each time in the same run (1, 2, 4, 8)
export const reviveCost = (n) => REVIVE_BASE * Math.pow(2, n);
export const MAX_REVIVES = 4;
export const GEM_SHOP = {
  golden: { name: 'Golden pod', gems: 5, blurb: 'A pod with better odds (see below).' },
  freeze: { name: 'Frost guard', gems: 4, blurb: 'Saves your streak on a missed day (max 2).' },
  skip:   { name: 'Skip a goal', gems: 3, blurb: 'Tick off one level goal you are stuck on.' },
};

// ------------------------------------------------------------------ seed pods (mystery boxes, transparent odds)
export const POD_BASE = 300, POD_STEP = 1.25, POD_CAP = 900; // the n-th pod bought today costs 300 x 1.25^n (max 900)
export const podPrice = (S, today = dayKey()) => { const n = S.econ && S.econ.podDay === today ? S.econ.podN : 0; return Math.min(POD_CAP, Math.round(POD_BASE * Math.pow(POD_STEP, n) / 10) * 10); };
// weights are percentages and add up to 100 (asserted by tests/economy.mjs)
export const POD_ODDS = [
  { id: 'acorns', w: 46, lo: 60, hi: 180, text: '60-180 acorns' },
  { id: 'boost', w: 30, text: 'a random boost' },
  { id: 'acornsBig', w: 10, lo: 400, hi: 600, text: '400-600 acorns' },
  { id: 'gem1', w: 8, gems: 1, text: '1 dew gem' },
  { id: 'gem2', w: 3, gems: 2, text: '2 dew gems' },
  { id: 'skin', w: 2.5, text: 'a shop skin you do not own (or 800 acorns)' },
  { id: 'jackpot', w: 0.5, lo: 3000, hi: 3000, text: 'jackpot: 3,000 acorns' },
];
export const GOLDEN_ODDS = [
  { id: 'acornsBig', w: 40, lo: 500, hi: 900, text: '500-900 acorns' },
  { id: 'boost3', w: 25, text: 'three random boosts' },
  { id: 'gem2', w: 15, gems: 2, text: '2 dew gems' },
  { id: 'gem4', w: 5, gems: 4, text: '4 dew gems' },
  { id: 'skin', w: 13, text: 'a shop skin you do not own (or 800 acorns)' },
  { id: 'jackpot', w: 2, lo: 5000, hi: 5000, text: 'jackpot: 5,000 acorns' },
];

// ------------------------------------------------------------------ word hunt (Subway's daily word)
export const WORDS = ['ACORN', 'BLOOM', 'CEDAR', 'MAPLE', 'ROOTS', 'GRAFT', 'BOUGH', 'TWIGS', 'BIRCH', 'ASPEN', 'SPORE', 'PETAL', 'GROVE', 'BRANCH', 'SAPLING', 'CANOPY', 'FOREST', 'LEAVES'];
export const wordOf = (day) => WORDS[strSeed('word' + day) % WORDS.length];
export const WORD_REWARD = ['a seed pod', '150 acorns', '1 dew gem', '300 acorns', 'a golden pod + 1 dew gem'];

// ------------------------------------------------------------------ save block
export function freshEcon() {
  return { v: 1, gems: 0, gemsEarned: 0, gemsSpent: 0, boosts: { sprout: 1, pollen: 1 }, up: {}, podDay: '', podN: 0, pods: 0, gpods: 0, word: { day: '', got: 0, done: false, streak: 0, last: '' }, revives: 0, log: [], armed: [], maps: [] };
}
export function ensureEcon(S) {
  const F = freshEcon();
  if (!S.econ || typeof S.econ !== 'object' || Array.isArray(S.econ)) S.econ = F;
  const E = S.econ;
  for (const k of Object.keys(F)) if (E[k] == null || typeof E[k] !== typeof F[k] || Array.isArray(E[k]) !== Array.isArray(F[k])) E[k] = F[k];
  for (const k of ['gems', 'gemsEarned', 'gemsSpent', 'podN', 'pods', 'gpods', 'revives']) E[k] = Math.max(0, Math.floor(+E[k]) || 0);
  for (const id of Object.keys(E.boosts)) if (!BOOSTS[id]) delete E.boosts[id]; else E.boosts[id] = Math.max(0, Math.min(99, E.boosts[id] | 0));
  for (const id of Object.keys(E.up)) if (!UPGRADES[id]) delete E.up[id]; else E.up[id] = Math.max(0, Math.min(MAX_UP, E.up[id] | 0));
  for (const k of Object.keys(F.word)) if (typeof E.word[k] !== typeof F.word[k]) E.word[k] = F.word[k];
  E.maps = [...new Set(E.maps.filter((id) => typeof id === 'string' && MAP_PRICE[id]))];
  return E;
}
export function gainGems(S, n, why = '') { const E = ensureEcon(S); n = Math.max(0, n | 0); E.gems += n; E.gemsEarned += n; if (n && why) { E.log.unshift({ n, why }); E.log.length = Math.min(E.log.length, 12); } return n; }
export function spendGems(S, n) { const E = ensureEcon(S); if (n <= 0 || E.gems < n) return false; E.gems -= n; E.gemsSpent += n; return true; }
const spendAcorns = (S, n) => { if (!(n > 0) || S.acorns < n) return false; S.acorns -= n; S.spent += n; return true; };
const gainAcorns = (S, n) => { S.acorns += n; S.earned += n; };

// ------------------------------------------------------------------ maps (v1.0: one-off acorn sinks)
// Prices match `unlock.cost` in src/maps.js (Forkwood and Phong Nha are free).
export const MAP_PRICE = { arashiyama: 900, redwoods: 1200, blackforest: 1500, amazon: 1800, beanstalk: 2400 };
export const ownsMap = (S, id) => !MAP_PRICE[id] || ensureEcon(S).maps.includes(id);
/** Buy a map with acorns. Returns the price paid, or false. */
export function buyMap(S, id) {
  const c = MAP_PRICE[id];
  if (!c || ownsMap(S, id) || !spendAcorns(S, c)) return false;
  ensureEcon(S).maps.push(id);
  return c;
}

// ------------------------------------------------------------------ shop actions
export function buyBoost(S, id) { const b = BOOSTS[id]; if (!b || !spendAcorns(S, b.price)) return false; const E = ensureEcon(S); E.boosts[id] = (E.boosts[id] || 0) + 1; return true; }
export function buyUpgrade(S, id) { const c = upCost(S, id); if (c == null || !spendAcorns(S, c)) return false; const E = ensureEcon(S); E.up[id] = upLevel(S, id) + 1; return true; }

function pick(table, r) { const tot = table.reduce((a, o) => a + o.w, 0); let q = r() * tot; for (const o of table) { q -= o.w; if (q <= 0) return o; } return table[table.length - 1]; }
/** Apply one pod outcome. skins: list of buyable skin ids (cost skins); grant(id) gives one. */
function applyPod(S, o, r, ctx) {
  const E = ensureEcon(S), res = { id: o.id, text: o.text, acorns: 0, gems: 0, boosts: [], skin: null };
  if (o.lo) { res.acorns = o.lo + Math.floor(r() * (o.hi - o.lo + 1)); gainAcorns(S, res.acorns); }
  if (o.gems) res.gems = gainGems(S, o.gems, 'seed pod');
  if (o.id === 'boost' || o.id === 'boost3') for (let i = 0; i < (o.id === 'boost3' ? 3 : 1); i++) { const b = BOOST_IDS[Math.floor(r() * BOOST_IDS.length)]; E.boosts[b] = (E.boosts[b] || 0) + 1; res.boosts.push(b); }
  if (o.id === 'skin') {
    const pool = (ctx.skins || []).filter((id) => !S.owned.includes(id));
    if (pool.length) { res.skin = pool[Math.floor(r() * pool.length)]; S.owned.push(res.skin); }
    else { res.acorns = 800; gainAcorns(S, 800); }
  }
  return res;
}
/** Buy and open a seed pod with acorns (price rises with each pod bought today). */
export function buyPod(S, ctx = {}) {
  const today = ctx.today || dayKey(), E = ensureEcon(S), price = podPrice(S, today);
  if (!spendAcorns(S, price)) return null;
  if (E.podDay !== today) { E.podDay = today; E.podN = 0; }
  E.podN++; E.pods++;
  return { price, ...openPod(S, POD_ODDS, ctx) };
}
export function openPod(S, table = POD_ODDS, ctx = {}) { const r = ctx.rng || mulberry32(strSeed('pod' + (S.econ.pods + S.econ.gpods * 7919) + (S.earned | 0))); return applyPod(S, pick(table, r), r, ctx); }
export function buyGolden(S, ctx = {}) { if (!spendGems(S, GEM_SHOP.golden.gems)) return null; ensureEcon(S).gpods++; return { gems: GEM_SHOP.golden.gems, ...openPod(S, GOLDEN_ODDS, ctx) }; }
export function buyFreeze(S) { if (S.streak.freezes >= 2 || !spendGems(S, GEM_SHOP.freeze.gems)) return false; S.streak.freezes++; return true; }
/** Expected acorn value of a pod table (boosts valued at their price, gems at 150 acorns, skins at 400). */
export function podValue(table) {
  const tot = table.reduce((a, o) => a + o.w, 0), avgBoost = BOOST_IDS.reduce((a, id) => a + BOOSTS[id].price, 0) / BOOST_IDS.length;
  return table.reduce((a, o) => a + (o.w / tot) * ((o.lo ? (o.lo + o.hi) / 2 : 0) + (o.gems || 0) * 150 + (o.id === 'boost' ? avgBoost : o.id === 'boost3' ? 3 * avgBoost : 0) + (o.id === 'skin' ? 400 : 0)), 0);
}

// ------------------------------------------------------------------ runs
/** Is this run allowed to use boosts, upgrades and the grower multiplier? */
export const econAllowed = (ctx = {}) => !ctx.pure && !ctx.race && !ctx.level && !ctx.tutorial;
/**
 * Options for createSim({ econ }) for a run. `use` lists the boost ids the player
 * armed; they are taken out of the inventory here. Returns null on fair runs.
 */
export function runOptions(S, ctx = {}, use = []) {
  if (!econAllowed(ctx)) return null;
  const E = ensureEcon(S), boosts = [];
  for (const id of use) if (BOOSTS[id] && E.boosts[id] > 0 && !boosts.includes(id)) { E.boosts[id]--; boosts.push(id); }
  const up = {}; for (const id of UPGRADE_IDS) up[id] = upLevel(S, id);
  const today = ctx.today || dayKey();
  wordRoll(S, today);
  const w = E.word, word = wordOf(today);
  const letter = w.done ? null : word[w.got] || null;
  return { boosts, up, mult: growerMult(S), letter, gemDrop: true };
}

function wordRoll(S, today) {
  const w = ensureEcon(S).word;
  if (w.day !== today) { w.day = today; w.got = 0; w.done = false; }
  return w;
}
/** After a run: letters, gems found, gem rewards for challenges and levels. ctx: { today, out (finishRun result) }. */
export function afterRunEcon(S, sum, ctx = {}) {
  const E = ensureEcon(S), today = ctx.today || dayKey(), res = { gems: 0, parts: [], letter: null, word: null, pods: [] };
  const add = (n, why) => { if (n > 0) { res.gems += gainGems(S, n, why); res.parts.push([why, n]); } };
  if (sum.gems) add(sum.gems, 'found in the tree');
  const out = ctx.out || {};
  if (out.levelUps && out.levelUps.length) add(GEM.levelUp * out.levelUps.filter((l) => (l.level - 1) % 3 === 0).length, 'level up');
  if (out.daily && out.daily.length && S.daily.list.every((c) => c.done)) add(GEM.allDaily, 'all daily challenges');
  if (out.weekly && out.weekly.length && S.weekly.list.every((c) => c.done)) add(GEM.allWeekly, 'all weekly challenges');
  // word hunt: one letter a run, in order
  const w = wordRoll(S, today), word = wordOf(today);
  if (sum.letter && !w.done && sum.letter === word[w.got]) {
    w.got++; res.letter = sum.letter;
    if (w.got >= word.length) {
      w.done = true;
      const yday = new Date(Date.parse(today + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
      w.streak = w.last === yday ? w.streak + 1 : 1; w.last = today;
      const day = Math.min(5, w.streak);
      res.word = { word, day, reward: WORD_REWARD[day - 1] };
      if (day === 1) res.pods.push(openPod(S, POD_ODDS, ctx));
      else if (day === 2) gainAcorns(S, 150);
      else if (day === 4) gainAcorns(S, 300);
      else if (day >= 5) res.pods.push(openPod(S, GOLDEN_ODDS, ctx));
      add(GEM.word[day - 1], 'word hunt');
    }
  }
  return res;
}
/** Gems for streak milestones and season tiers reached (call with the lists afterRun / claimGift returned). */
export function milestoneGems(S, { streak = [], tiers = [], promoted = false } = {}) {
  let n = 0;
  for (const m of streak) n += gainGems(S, GEM.streak[m.d] || 0, `${m.d}-day streak`);
  for (const t of tiers) n += gainGems(S, GEM.season[t.tier] || 0, `season tier ${t.tier}`);
  if (promoted) n += gainGems(S, GEM.promote, 'league promotion');
  return n;
}
/** Spend gems on a second chance; n = revives already used this run. */
export function payRevive(S, n) { if (n >= MAX_REVIVES) return false; const c = reviveCost(n); if (!spendGems(S, c)) return false; ensureEcon(S).revives++; return c; }

/** Spend gems to tick off one unfinished level goal (the level-up pays at the end of the next run). */
export function skipGoal(S) {
  const g = (S.goals || []).find((x) => !x.done);
  if (!g || !spendGems(S, GEM_SHOP.skip.gems)) return null;
  g.p = g.n; g.done = true; g.skipped = true;
  return g;
}
