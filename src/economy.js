// P8-ECON: the endless-runner economy, modelled on common endless-runner
// games (see ECONOMY.md for the numbers and the 30-day simulation).
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
import { UNLOCK_ALL_MAPS } from './flags.js'; // V3.2
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
  ride:   { name: 'Ride Token', price: 200, blurb: 'Start the run on a random ride from this world (mounted at 10 m).', icon: 'ride' }, // V2-MECH
};
export const BOOST_IDS = Object.keys(BOOSTS);

// ------------------------------------------------------------------ upgrades (power-up durations)
// Six levels each; prices grow ~1.6x per level (a classic runner upgrade ladder).
export const UPGRADE_COST = [250, 500, 900, 1500, 2400, 3600];
export const UPGRADES = {
  pollen: { name: 'Pollen', base: 6, per: 0.15, unit: 's', blurb: 'sunlight drifts to your tips for longer' },
  ink:    { name: 'Ink ×2', base: 8, per: 0.15, unit: 's', blurb: 'double points last longer' },
  rush:   { name: 'Sap Rush', base: 3, per: 0.12, unit: 's', blurb: 'the surge lasts longer' },
  golden: { name: 'Golden hour', base: 6, per: 0.10, unit: 's', blurb: 'combo ×8 shines for longer' },
  dew:    { name: 'Dew drops', base: 30, per: 0.08, unit: 'sap', blurb: 'every dew drop gives more sap' },
  // V2-MECH: two new tracks (MECHANICS.md §2.8)
  wild:   { name: 'Wild Kit', base: 1, per: 0.087, unit: '×', blurb: 'the nine wild power-ups last longer; shears cut more, acorn rain pours more' },
  rides:  { name: 'Rides', base: 1, per: 0.08, unit: '×', blurb: 'every ride lasts longer; at level 6 your first ride takes two hits' },
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
  { id: 'acorns', w: 38, lo: 60, hi: 180, text: '60-180 acorns' }, // V2-MECH: 46 -> 38, a Ride Token takes 8
  { id: 'rideToken', w: 8, text: 'a Ride Token' },
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

// ------------------------------------------------------------------ word hunt (daily word)
export const WORDS = ['ACORN', 'BLOOM', 'CEDAR', 'MAPLE', 'ROOTS', 'GRAFT', 'BOUGH', 'TWIGS', 'BIRCH', 'ASPEN', 'SPORE', 'PETAL', 'GROVE', 'BRANCH', 'SAPLING', 'CANOPY', 'FOREST', 'LEAVES'];
export const wordOf = (day) => WORDS[strSeed('word' + day) % WORDS.length];
export const WORD_REWARD = ['a seed pod', '150 acorns', '1 dew gem', '300 acorns', 'a golden pod + 1 dew gem'];

// ------------------------------------------------------------------ save block
export function freshEcon() {
  return { v: 1, gems: 0, gemsEarned: 0, gemsSpent: 0, boosts: { sprout: 1, pollen: 1 }, up: {}, podDay: '', podN: 0, pods: 0, gpods: 0, word: { day: '', got: 0, done: false, streak: 0, last: '' }, revives: 0, log: [], armed: [], maps: [],
    critters: {}, skill: '', curses: [], vines: [], vine: {}, trophies: [], worlds: [] }; // V2-MECH
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
  // V2-MECH: critter levels, vine skins, trophies, worlds (repaired on load)
  for (const id of Object.keys(E.critters)) { const c = E.critters[id]; if (!CRITTER_IDS.includes(id) || !c || typeof c !== 'object') delete E.critters[id]; else { c.xp = Math.max(0, +c.xp || 0); c.bought = Math.max(0, Math.min(3, c.bought | 0)); } }
  if (E.skill && !CRITTER_IDS.includes(E.skill)) E.skill = '';
  E.curses = [...new Set(E.curses.filter((k) => CURSE_IDS.includes(k)))];
  E.vines = [...new Set(E.vines.filter((id) => VINE[id] && !VINE[id].free))];
  for (const w of Object.keys(E.vine)) { const v = VINE[E.vine[w]]; if (!v || !(v.free || E.vines.includes(v.id))) delete E.vine[w]; }
  E.trophies = [...new Set(E.trophies.filter((t) => typeof t === 'string'))];
  E.worlds = [...new Set(E.worlds.filter((id) => WORLD_PRICE[id]))];
  return E;
}
export function gainGems(S, n, why = '') { const E = ensureEcon(S); n = Math.max(0, n | 0); E.gems += n; E.gemsEarned += n; if (n && why) { E.log.unshift({ n, why }); E.log.length = Math.min(E.log.length, 12); } return n; }
export function spendGems(S, n) { const E = ensureEcon(S); if (n <= 0 || E.gems < n) return false; E.gems -= n; E.gemsSpent += n; return true; }
const spendAcorns = (S, n) => { if (!(n > 0) || S.acorns < n) return false; S.acorns -= n; S.spent += n; return true; };
const gainAcorns = (S, n) => { S.acorns += n; S.earned += n; };

// ------------------------------------------------------------------ maps (v1.0: one-off acorn sinks)
// Prices match `unlock.cost` in src/maps.js (Forkwood and Phong Nha are free).
export const MAP_PRICE = { arashiyama: 900, redwoods: 1200, blackforest: 1500, amazon: 1800, beanstalk: 2400 };
export const ownsMap = (S, id) => UNLOCK_ALL_MAPS || !MAP_PRICE[id] || ensureEcon(S).maps.includes(id); // V3.2: flags.UNLOCK_ALL_MAPS opens every world
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
  if (o.id === 'rideToken') { E.boosts.ride = (E.boosts.ride || 0) + 1; res.boosts.push('ride'); } // V2-MECH
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
  return table.reduce((a, o) => a + (o.w / tot) * ((o.lo ? (o.lo + o.hi) / 2 : 0) + (o.gems || 0) * 150 + (o.id === 'boost' ? avgBoost : o.id === 'boost3' ? 3 * avgBoost : 0) + (o.id === 'skin' ? 400 : 0) + (o.id === 'rideToken' ? BOOSTS.ride.price : 0)), 0);
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
  // V2-MECH: chest loot and critter XP (metres climbed with the equipped critter's skill)
  if (sum.loot && sum.loot.length) res.loot = applyLoot(S, sum.loot, ctx);
  if (sum.skill && sum.skill.id) addCritterXp(S, sum.skill.id, sum.height || 0);
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

// ================================================================== V2-MECH
// Worlds (v2): the 7 worlds take over the 7 map slots and their prices, in order.
export const WORLD_PRICE = { fresco: 900, ukiyo: 1200, lilies: 1500, gilded: 1800, lacquer: 2400 }; // meadow + starry free
export const LEGACY_MAP_WORLD = { forkwood: 'meadow', phongnha: 'starry', arashiyama: 'fresco', redwoods: 'ukiyo', blackforest: 'lilies', amazon: 'gilded', beanstalk: 'lacquer' };
export const ownsWorld = (S, id) => !WORLD_PRICE[id] || ensureEcon(S).worlds.includes(id) || ensureEcon(S).maps.some((m) => LEGACY_MAP_WORLD[m] === id);
export function buyWorld(S, id) { const c = WORLD_PRICE[id]; if (!c || ownsWorld(S, id) || !spendAcorns(S, c)) return false; ensureEcon(S).worlds.push(id); return c; }

// Critter skill levels: 1-3 from critter XP (metres climbed with that critter), 4-6 for acorns at HALF the
// v12 research price (owner brief): 450 / 750 / 1,200 (4,800 -> 2,400 per critter, 19,200 for all 8).
export const CRITTER_IDS = ['sparrow', 'squirrel', 'owl', 'fox', 'snail', 'moth', 'frog', 'beetle'];
export const CRITTER_XP = [0, 6000, 15000];                // metres climbed with the critter for levels 1 (free), 2, 3
export const CRITTER_COST = [450, 750, 1200];               // acorns for levels 4, 5, 6
export const CRITTER_UNLOCK = { sparrow: 'free', squirrel: 'free', owl: '3-day streak', fox: 'reach 400 m', snail: 'play 10 runs', moth: 'catch 300 sunlight', frog: 'spell a word-hunt word', beetle: 'reach the Treetop on Oak' };
const crit = (S, id) => { const E = ensureEcon(S); return E.critters[id] || (E.critters[id] = { xp: 0, bought: 0 }); };
export function critterLevel(S, id) { if (!CRITTER_IDS.includes(id)) return 0; const c = crit(S, id); let lv = 1; while (lv < 3 && c.xp >= CRITTER_XP[lv]) lv++; return lv + (lv >= 3 ? c.bought : 0); }
export const critterCost = (S, id) => { const lv = critterLevel(S, id); return lv < 3 || lv >= 6 ? null : CRITTER_COST[lv - 3]; };
export function buyCritterLevel(S, id) { const c = critterCost(S, id); if (c == null || !spendAcorns(S, c)) return false; crit(S, id).bought++; return c; }
export function addCritterXp(S, id, metres) { if (!CRITTER_IDS.includes(id)) return 0; const c = crit(S, id); c.xp += Math.max(0, metres | 0); return c.xp; }
export function equipSkill(S, id) { const E = ensureEcon(S); if (id && !CRITTER_IDS.includes(id)) return false; E.skill = id || ''; return true; }

// Opt-in curses (Knots chosen before a run): +20% acorns and +15% points each. Free play only.
export const CURSE_IDS = ['brittle', 'thirst', 'crow', 'thornfall'];
export function setCurses(S, ids) { ensureEcon(S).curses = [...new Set((ids || []).filter((k) => CURSE_IDS.includes(k)))]; return ensureEcon(S).curses; }

/** createSim options for the critter skill and curses, or null on fair runs (daily, weekly, quest, challenge, duel, race, tutorial). */
export function mechOptions(S, ctx = {}) {
  if (!econAllowed(ctx)) return null;
  const E = ensureEcon(S);
  return { skill: E.skill ? { id: E.skill, lv: critterLevel(S, E.skill) } : null, curses: E.curses.slice() };
}

// Vine skins: cosmetic only (no stats). Each world has a free default and two to buy; plus three that
// fit every world. Registry ids `vine.skin.<name>` (ART draws them).
export const VINE_SKINS = [
  { id: 'vine.skin.meadowgrass', name: 'Meadow Grass', world: 'meadow', free: true },
  { id: 'vine.skin.wildflower', name: 'Wildflower', world: 'meadow', cost: 480 },
  { id: 'vine.skin.goldenhour', name: 'Golden Hour', world: 'meadow', cost: 900 },
  { id: 'vine.skin.impasto', name: 'Impasto Stroke', world: 'starry', free: true },
  { id: 'vine.skin.cypress', name: 'Cypress Flame', world: 'starry', cost: 600 },
  { id: 'vine.skin.starswirl', name: 'Star Swirl', world: 'starry', cost: 1100 },
  { id: 'vine.skin.plaster', name: 'Plaster Garland', world: 'fresco', free: true },
  { id: 'vine.skin.laurel', name: 'Gilded Laurel', world: 'fresco', cost: 600 },
  { id: 'vine.skin.halo', name: 'Halo Thread', world: 'fresco', cost: 1100 },
  { id: 'vine.skin.woodblock', name: 'Woodblock Line', world: 'ukiyo', free: true },
  { id: 'vine.skin.pinewave', name: 'Pine & Wave', world: 'ukiyo', cost: 600 },
  { id: 'vine.skin.indigo', name: 'Indigo Foam', world: 'ukiyo', cost: 1100 },
  { id: 'vine.skin.dab', name: 'Water Dab', world: 'lilies', free: true },
  { id: 'vine.skin.lilypad', name: 'Lily Pad', world: 'lilies', cost: 600 },
  { id: 'vine.skin.willow', name: 'Willow Light', world: 'lilies', cost: 1100 },
  { id: 'vine.skin.goldleaf', name: 'Gold Leaf', world: 'gilded', free: true },
  { id: 'vine.skin.mosaic', name: 'Mosaic Birch', world: 'gilded', cost: 600 },
  { id: 'vine.skin.spiral', name: 'Gilt Spiral', world: 'gilded', cost: 1100 },
  { id: 'vine.skin.lacquer', name: 'Red Lacquer', world: 'lacquer', free: true },
  { id: 'vine.skin.eggshell', name: 'Eggshell Inlay', world: 'lacquer', cost: 600 },
  { id: 'vine.skin.lanternsilk', name: 'Lantern Silk', world: 'lacquer', cost: 1100 },
  { id: 'vine.skin.moonthread', name: 'Moon Thread', world: null, cost: 1400 },
  { id: 'vine.skin.ember', name: 'Ember Vine', world: null, cost: 1400 },
  { id: 'vine.skin.aurora', name: 'Aurora', world: null, cost: 2000 },
];
export const VINE = Object.fromEntries(VINE_SKINS.map((v) => [v.id, v]));
export const vineDefault = (world) => (VINE_SKINS.find((v) => v.world === world && v.free) || VINE_SKINS[0]).id;
export const ownsVine = (S, id) => !!VINE[id] && (VINE[id].free || ensureEcon(S).vines.includes(id));
export function buyVine(S, id) { const v = VINE[id]; if (!v || v.free || ownsVine(S, id) || !spendAcorns(S, v.cost)) return false; ensureEcon(S).vines.push(id); return v.cost; }
/** Pick the vine skin worn in a world (cosmetic only; the sim never reads it). */
export function selectVine(S, world, id) { if (!ownsVine(S, id) || (VINE[id].world && VINE[id].world !== world)) return false; ensureEcon(S).vine[world] = id; return true; }
export const vineFor = (S, world) => ensureEcon(S).vine[world] || vineDefault(world);

/** Apply the meta loot of a run (sim summary().loot): boosts, ride tokens, skins, trophies. ctx: { rng, skins: [buyable skin ids by world] }. */
export function applyLoot(S, loot = [], ctx = {}) {
  const E = ensureEcon(S), r = ctx.rng || mulberry32(strSeed('loot' + (S.earned | 0) + loot.length)), got = [];
  for (const l of loot) {
    if (l.type === 'boost') for (let i = 0; i < (l.n || 1); i++) { const b = BOOST_IDS[Math.floor(r() * BOOST_IDS.length)]; E.boosts[b] = (E.boosts[b] || 0) + 1; got.push({ type: 'boost', id: b }); }
    else if (l.type === 'rideToken') { E.boosts.ride = (E.boosts.ride || 0) + (l.n || 1); got.push({ type: 'rideToken', n: l.n || 1 }); }
    else if (l.type === 'skin') {
      const pool = (ctx.skinsFor ? ctx.skinsFor(l.world) : VINE_SKINS.filter((v) => v.world === l.world && !v.free).map((v) => v.id)).filter((id) => !(VINE[id] ? ownsVine(S, id) : S.owned.includes(id)));
      if (pool.length) { const id = pool[Math.floor(r() * pool.length)]; if (VINE[id]) E.vines.push(id); else S.owned.push(id); got.push({ type: 'skin', id }); }
      else { gainAcorns(S, l.fallback || 600); got.push({ type: 'acorns', n: l.fallback || 600 }); }
    } else if (l.type === 'trophy' && l.boss) { if (!E.trophies.includes(l.boss)) { E.trophies.push(l.boss); got.push({ type: 'trophy', boss: l.boss }); } else { gainAcorns(S, 300); got.push({ type: 'acorns', n: 300 }); } }
  }
  return got;
}
// ================================================================== /V2-MECH
