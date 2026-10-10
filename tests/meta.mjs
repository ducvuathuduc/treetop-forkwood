// Meta progression tests (node only, no browser): save migration and repair,
// economy pacing with the real sim + bot, gifts and streaks, shop rules,
// challenges, achievements, and that charms/skins never touch fair runs.
// usage: node tests/meta.mjs   (ECON=1 prints the pacing table)
import * as M from '../src/meta.js';
import { SKINS } from '../src/skins.js';
import { createSim, step, summary, CHARMS } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';

const fails = [];
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const getter = (obj) => (k) => (k in obj ? JSON.parse(JSON.stringify(obj[k])) : null);

// ---------------------------------------------------------------- migration
{
  const old = { 'forkwood.best': { score: 12345, height: 432 }, 'forkwood.stats': { runs: 17, meters: 5200, merges: 90, treetops: 2, bestMult: 8 }, 'forkwood.tutorial': true, 'forkwood.calm': true };
  const S = M.loadSave(getter(old), '2026-10-10');
  ok(S.v === 2 && S.best.height === 432 && S.best.score === 12345, 'v1 best carried over');
  ok(S.stats.runs === 17 && S.stats.meters === 5200 && S.tutorial === true && S.calm === true, 'v1 stats, tutorial and calm carried over');
  ok(S.migrationBonus === 208 && S.acorns >= 208, `returning players get acorns for metres grown (${S.migrationBonus})`);
  ok(S.ach.treetop && S.ach.canopy && !S.ach.cloudline, 'retro badges from the old best (treetop, canopy, not cloudline)');
  const S2 = M.loadSave(getter({}), '2026-10-10');
  ok(S2.acorns === 0 && S2.level === 1 && !S2.migrationBonus && S2.owned.length === SKINS.filter((s) => s.unlock.free).length, 'a new player starts clean with only starter skins');
  const S3 = M.loadSave(getter({ 'forkwood.best': 'garbage', 'forkwood.stats': { runs: -4, meters: 'x' } }), '2026-10-10');
  ok(S3.stats.runs === 0 && S3.best.height === 0, 'corrupt v1 keys are ignored safely');
  // corrupt v2 save gets repaired, not wiped
  const bad = { [M.SAVE_KEY]: { v: 2, acorns: 55.7, owned: ['bark.birch', 'nope'], loadout: { bark: 'bark.cherry', sky: 'leaf.ginkgo' }, level: 3, goals: 'x', charm: 'roots', stats: { runs: 4 } } };
  const R = M.loadSave(getter(bad), '2026-10-10');
  ok(R.acorns === 55 && R.owned.includes('bark.birch') && !R.owned.includes('nope'), 'repair keeps owned skins and drops unknown ids');
  ok(R.loadout.bark === 'bark.walnut' && R.loadout.sky === 'sky.print', 'repair un-equips skins that are not owned or are in the wrong slot');
  ok(R.charm === null && R.goals.length === 3 && R.stats.meters === 0, 'repair drops a charm above the level and rebuilds goals/stats');
  ok(M.describe(R.goals[0]) === M.describe(M.levelGoals(3)[0]), 'rebuilt goals belong to the saved level, not level 1');
  ok(R.daily.list.length === 3 && R.weekly.list.length === 3, 'daily and weekly sets exist after load');
}

// ---------------------------------------------------------------- gifts and streaks
{
  const S = M.freshSave('2026-10-01');
  const g1 = M.claimGift(S, '2026-10-01');
  ok(g1 && g1.amount === 20 && S.streak.count === 1, 'first gift: 20 acorns, streak 1');
  ok(M.claimGift(S, '2026-10-01') === null, 'one gift per day');
  for (let d = 2; d <= 7; d++) M.claimGift(S, `2026-10-0${d}`);
  ok(S.streak.count === 7 && S.streak.freezes === 1, 'day 7 reached and a frost guard earned');
  const g9 = M.claimGift(S, '2026-10-09'); // missed the 8th
  ok(g9.usedFreeze && S.streak.count === 8 && S.streak.freezes === 0, 'a frost guard covers one missed day');
  M.claimGift(S, '2026-10-12');
  ok(S.streak.count === 1 && S.streak.best === 8, 'a longer gap resets the streak, best is kept');
}

// ---------------------------------------------------------------- shop
{
  const S = M.freshSave('2026-10-10');
  const deal = M.featured(S, '2026-10-10');
  ok(!!deal && M.priceOf(S, deal.id, '2026-10-10') === Math.round(deal.unlock.cost * 0.75), `daily deal is 25% off (${deal.name})`);
  const target = SKINS.find((s) => s.unlock.cost && s.id !== deal.id);
  ok(!M.buy(S, target.id, '2026-10-10'), 'cannot buy without acorns');
  S.acorns = 1000;
  ok(M.buy(S, target.id, '2026-10-10') && S.acorns === 1000 - target.unlock.cost && S.spent === target.unlock.cost, 'buy spends exactly the price');
  ok(!M.buy(S, target.id, '2026-10-10'), 'cannot buy twice');
  ok(M.equip(S, target.id) && S.loadout[target.slot] === target.id, 'equip a bought skin');
  ok(!M.equip(S, 'bark.gilded'), 'cannot equip an earned-only skin before earning it');
  ok(!M.buy(S, 'bark.gilded', '2026-10-10'), 'earned-only skins are not for sale');
  ok(SKINS.every((s) => s.unlock.free || s.unlock.cost || s.unlock.level || s.unlock.ach), 'every skin has a way to unlock it');
}

// ---------------------------------------------------------------- tasks and achievements
{
  const S = M.freshSave('2026-10-10');
  const sum = { height: 450, score: 9000, merges: 9, forks: 10, blooms: 5, goldens: 3, maxMult: 8, nearMisses: 10, splits: 5, acorns: 12, charmUses: 0, hits: 0, reverts: 0, time: 90, hash: 'abcdef' };
  const out = M.finishRun(S, sum, { daily: true, now: new Date('2026-10-10T10:00:00Z') });
  ok(out.levelUps.length === 1 && S.level === 2, 'level 1 goals done in one good run, exactly one level-up');
  ok(out.charms.includes('ward') && S.charm === 'ward', 'level 2 unlocks and equips Bark Ward');
  for (const a of ['sprout', 'merge', 'treetop', 'golden', 'goldx3', 'florist', 'clean', 'shave', 'lanes']) ok(!!S.ach[a], `badge ${a}`);
  ok(S.owned.includes('blossom.moonflower'), 'Florist badge unlocks Moonflower');
  ok(out.acorns.total === 12 + 15 + 9 + 10 + 15, `run acorns itemised (${out.acorns.total})`);
  const gained = S.acorns;
  const expected = out.acorns.total + out.levelUps.reduce((a, l) => a + l.reward, 0) + out.achs.reduce((a, id) => a + M.ACH[id].reward, 0) + out.daily.reduce((a, c) => a + c.reward, 0) + out.weekly.reduce((a, c) => a + c.reward, 0);
  ok(gained === expected, `wallet equals the sum of all rewards (${gained})`);
  const again = M.finishRun(S, sum, { now: new Date('2026-10-10T11:00:00Z') });
  ok(again.daily.length === 0 || again.daily.every((d) => !out.daily.find((o) => o.text === d.text)), 'a finished daily pays only once');
  const S2 = M.freshSave();
  M.finishRun(S2, { ...sum, height: 10, merges: 0, forks: 0, blooms: 0, goldens: 0, maxMult: 1, nearMisses: 0, splits: 0, acorns: 0, hits: 3 }, {});
  ok(S2.level === 1 && S2.goals.filter((g) => g.done).length === 0, 'a weak run completes no level goals');
  ok(M.describe({ k: 'merges', n: 1, run: true }) !== '' && LEVEL_TEXTS_OK(), 'every level goal has text');
}
function LEVEL_TEXTS_OK() { for (let l = 1; l < 30; l++) for (const g of M.levelGoals(l)) if (!M.describe(g) || /undefined|NaN/.test(M.describe(g))) return false; return true; }

// ---------------------------------------------------------------- week keys and sets
{
  ok(M.weekKey(new Date('2026-10-10T12:00:00Z')) === '2026-W41', 'ISO week key');
  ok(M.weekKey(new Date('2027-01-01T12:00:00Z')) === '2026-W53', 'ISO week key at year end');
  const a = M.dailySet('2026-10-10').map(M.describe).join('|'), b = M.dailySet('2026-10-10').map(M.describe).join('|');
  ok(a === b, 'daily challenges are the same for everyone on a day');
  const days = new Set(); for (let d = 1; d <= 28; d++) days.add(M.dailySet(`2026-10-${String(d).padStart(2, '0')}`).map(M.describe).join('|'));
  ok(days.size >= 20, `daily challenges vary day to day (${days.size}/28 distinct)`);
}

// ---------------------------------------------------------------- fairness: pure runs
{
  const s = createSim({ seed: 77, charm: 'roots', pure: true });
  ok(s.charm === null, 'a pure run (daily tree, challenge link) ignores the equipped charm');
  // the course itself does not depend on the charm: same seed -> same gates
  const g = (charm) => { const s2 = createSim({ seed: 4242, charm }); for (let i = 0; i < 60 * 40; i++) step(s2, 1 / 60, { targetX: 280 }); return s2; };
  const A = g(null), B = g('ward');
  ok(JSON.stringify(A.brambles.map((b) => [b.y, b.solids])) === JSON.stringify(B.brambles.map((b) => [b.y, b.solids])), 'course is identical with or without a charm');
}

// ---------------------------------------------------------------- charm balance (bot)
function play(seed, skill, charm) {
  const s = createSim({ seed, tutorial: true, charm });
  const bot = createBot(skill, seed);
  while (!s.dead && s.t < 400) step(s, 1 / 60, botInput(bot, s));
  return summary(s);
}
{
  const N = Number(process.env.N || 120);
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const base = []; const by = {};
  for (let i = 0; i < N; i++) base.push(play(300 + i, 0.6, null).height);
  for (const c of Object.keys(CHARMS)) { by[c] = []; for (let i = 0; i < N; i++) by[c].push(play(300 + i, 0.6, c).height); }
  const b = med(base);
  for (const c of Object.keys(CHARMS)) {
    const r = med(by[c]) / b;
    ok(r > 0.95 && r < 1.15, `charm ${c}: median height ${med(by[c])} m vs ${b} m without (×${r.toFixed(2)}, a small edge: must stay within 0.95–1.15)`);
  }
}

// ---------------------------------------------------------------- economy pacing
{
  const skills = [0.35, 0.6, 0.9];
  const rows = [];
  for (const sk of skills) {
    const S = M.freshSave('2026-10-01');
    let firstBuyRun = null, day = 1;
    const cheapest = Math.min(...SKINS.filter((s) => s.unlock.cost).map((s) => s.unlock.cost));
    for (let run = 1; run <= 40; run++) {
      if (run % 5 === 1) { M.claimGift(S, `2026-10-${String(day).padStart(2, '0')}`); day++; }
      const sum = play(9000 + run, sk, S.charm);
      M.finishRun(S, sum, { now: new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`) });
      if (firstBuyRun == null && S.acorns >= cheapest) firstBuyRun = run;
      if (run === 5 || run === 15 || run === 40) rows.push({ skill: sk, runs: run, level: S.level, earned: S.earned, perRun: Math.round(S.earned / run), badges: Object.keys(S.ach).length, firstBuyRun });
    }
  }
  if (process.env.ECON) console.table(rows);
  const total = SKINS.filter((s) => s.unlock.cost).reduce((a, s) => a + s.unlock.cost, 0);
  const mid = rows.find((r) => r.skill === 0.6 && r.runs === 40);
  const weak5 = rows.find((r) => r.skill === 0.35 && r.runs === 5);
  ok(weak5.firstBuyRun != null && weak5.firstBuyRun <= 5, `even a weak player can buy a first skin within 5 runs (run ${weak5.firstBuyRun})`);
  ok(weak5.level >= 2, `a weak player levels up within 5 runs (level ${weak5.level})`);
  const runsToAll = Math.round(total / mid.perRun);
  ok(runsToAll >= 45 && runsToAll <= 200, `buying the whole shop takes a mid player ~${runsToAll} runs (shop total ${total} acorns): long tail, not a grind wall`);
}


// ---------------------------------------------------------------- pass 3: new content in goals, retired gates
{
  const T = (k, n, run = true) => ({ k, n, run, p: 0, done: false });
  // a save from the previous build parked at level 5 waiting on "Play the daily tree"
  const S = M.freshSave('2026-10-10'); S.level = 5; S.goals = [T('mult', 5), { ...T('merges', 8), p: 8, done: true }, T('daily', 1)];
  const R = M.repair(JSON.parse(JSON.stringify(S)), '2026-10-10');
  ok(!R.goals.some((g) => g.k === 'daily') && R.goals.some((g) => g.k === 'pickups') && R.goals[1].done, 'level 5 no longer waits on the daily tree; finished goals stay finished');
  const S11 = M.freshSave('2026-10-10'); S11.level = 11; S11.goals = [T('mult', 8), T('blooms', 4), T('daily', 5, false)];
  const R11 = M.repair(JSON.parse(JSON.stringify(S11)), '2026-10-10');
  ok(!R11.goals.some((g) => g.k === 'daily') && R11.goals.some((g) => g.k === 'storm'), 'level 11 trades its daily-tree goal for the storm');
  ok(M.LEVELS.every((L) => L.every((t) => t.k !== 'daily')), 'no hand-made level requires the daily tree');
  const kinds = new Set(M.LEVELS.flat().map((t) => t.k));
  ok(['grafts', 'pickups', 'storm', 'graze', 'jit'].every((k) => kinds.has(k)), 'levels use the new content: grafts, power-ups, storm, graze chains, just-in-time merges');
  const g = T('grafts', 2), sum = { grafts: 2, pickups: 3, storms: 1, grazeBest: 4, jits: 1, height: 500 };
  ok(M.advance(g, sum) && M.describe(g) === 'Take 2 grafts in one run', 'graft goals progress from a run summary');
  const Sx = M.freshSave('2026-10-10'); const out = M.finishRun(Sx, { ...sum, score: 1000, merges: 3, maxMult: 3, nearMisses: 2, blooms: 1, goldens: 0, acorns: 2, forks: 4, splits: 1, charmUses: 0, reverts: 0, hits: 1, synergies: ['orchard'], time: 80 }, { now: new Date('2026-10-10T10:00:00Z') });
  ok(Sx.stats.grafts === 2 && Sx.stats.storms === 1 && Sx.ach.weathered && Sx.ach.kindred && out.achs.includes('weathered'), 'run stats track grafts and storms; Weathered and Kindred grafts badges unlock');
}
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log('\nmeta checks OK');
