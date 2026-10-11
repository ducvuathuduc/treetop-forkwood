// Quest map, modes and stakes, headless: every level is deterministic and
// beatable (and its 3 stars reachable) by the expert bot; mode rules work;
// unlocks, chests, prizes and titles follow the rules; old saves load.
// Run: node tests/quest.mjs
import { createSim, step, summary, heightM } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
import { LEVELS, LEVEL, WORLDS, levelRules, goalMet, MAX_STARS } from '../src/campaign.js';
import { MODES, STAKES, STAKE, rulesFor, weekKey, weekSeed, weekCode, parseWeek } from '../src/modes.js';
import * as Q from '../src/quest.js';
import * as M from '../src/meta.js';
import { SKINS } from '../src/skins.js';

let fails = 0;
const ok = (c, msg) => { if (c) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };
const TRIES = Number(process.env.TRIES || 24);

function play(opts, skill, bseed, maxT = 240) {
  const s = createSim(opts);
  const b = createBot(skill, bseed);
  while (!s.dead && s.t < maxT) step(s, 1 / 60, botInput(b, s));
  return { s, sum: summary(s) };
}

// ---------------------------------------------------------------- levels
const rows = [];
for (const lv of LEVELS) {
  const opts = { seed: lv.seed, rules: levelRules(lv), pure: true };
  // deterministic: the same level builds the same course
  const a = createSim(opts), b = createSim(opts);
  const sig = (s) => JSON.stringify([s.finishM, s.chunkLog.map((c) => c.id + c.y), s.brambles.length, s.motes.length, s.columns.length]);
  const same = sig(a) === sig(b);
  let wins = 0, best = 0, all3 = false, goalHit = [false, false], winsMid = 0;
  for (let i = 0; i < TRIES; i++) {
    const { sum } = play(opts, 0.95, 31 + i * 17);
    if (sum.won) wins++;
    const st = sum.won ? 1 + lv.goals.filter((g) => goalMet(g, sum)).length : 0;
    best = Math.max(best, st);
    lv.goals.forEach((g, k) => { if (goalMet(g, sum)) goalHit[k] = true; });
    if (st === 3) all3 = true;
    if (i < 8 && play(opts, 0.6, 7 + i * 13).sum.won) winsMid++;
  }
  rows.push(`${lv.id.padEnd(4)} ${lv.name.padEnd(18)} finish ${String(a.finishM).padStart(3)} m · expert clears ${Math.round(100 * wins / TRIES)}% · average ${Math.round(100 * winsMid / 8)}% · best ${best}★`);
  ok(same, `${lv.id} is deterministic (same seed, same course)`);
  ok(wins > 0, `${lv.id} ${lv.name}: beatable (expert bot clears ${wins}/${TRIES})`);
  ok(goalHit[0] && goalHit[1], `${lv.id}: both goal stars are reachable (${lv.goals.map((g, k) => goalHit[k] ? 'yes' : 'NO').join(', ')})`);
  ok(all3 || (goalHit[0] && goalHit[1]), `${lv.id}: 3 stars possible (in one run: ${all3 ? 'yes' : 'across runs'})`);
}
console.log(rows.join('\n'));
// difficulty climbs world by world (average of expert clear rates)
const rate = (w) => { const ls = LEVELS.filter((l) => l.id.startsWith(w + '-')); return ls.length; };
ok(WORLDS.every((w) => rate(w.id) === 4), 'five worlds of four levels');
ok(MAX_STARS === 60, '60 stars on the map');

// ---------------------------------------------------------------- mode rules
{
  // hardcore: the first hit ends the run
  let ended = 0, n = 0;
  for (let i = 0; i < 12; i++) {
    const { s } = play({ seed: 900 + i, rules: rulesFor({ mode: 'hardcore' }) }, 0.4, 3 + i);
    n++; if (s.end === 'hit' && s.hits === 1) ended++;
    if (s.end === 'sap' && s.hits > 0) ok(false, 'hardcore run survived a hit');
  }
  ok(ended > n / 2, `hardcore: runs end on the first hit (${ended}/${n})`);
  // zen: never dies, reaches its finish
  const z = play({ seed: 77, rules: rulesFor({ mode: 'zen' }) }, 0.3, 5, 400);
  ok(z.s.end === 'finish' && z.s.won, `zen: a weak player reaches the Cloudline (${Math.round(heightM(z.s))} m, ${z.s.hits} hits)`);
  // sprint: ends at 60 s on the clock (or earlier by sap)
  const sp = play({ seed: 78, rules: rulesFor({ mode: 'sprint' }) }, 0.95, 5);
  ok(sp.s.end === 'time' && Math.abs(sp.s.t - 60) < 0.05, `sprint: the clock ends the run at 60 s (${Math.round(heightM(sp.s))} m)`);
  // storm rush: storms come early and often
  const sr = play({ seed: 79, rules: rulesFor({ mode: 'storm' }) }, 0.95, 5);
  ok(sr.sum.storms >= 2, `storm rush: ${sr.sum.storms} storms weathered by ${sr.sum.height} m`);
  // score multipliers stack: stake × mode
  ok(rulesFor({ mode: 'classic', stake: 'ancient' }).score === 2.2 && rulesFor({ mode: 'hardcore', stake: 'ancient' }).score === 2, 'stake multiplier on endless only; modes use their own');
  ok(rulesFor({ mode: 'weekly' }).hazard === STAKE.oak.rules.hazard && rulesFor({ mode: 'weekly' }).dmg === STAKE.oak.rules.dmg, 'weekly tree is always on Oak'); // P8-ECON: Oak rules changed
  // weekly codes
  const wk = weekKey(new Date(Date.UTC(2026, 9, 10)));
  ok(wk === '2026-W41' && weekCode(wk) === 'FW-2026W41' && parseWeek('FW-2026W41') === wk && parseWeek('nope') === null, `weekly code ${weekCode(wk)} round-trips`);
  ok(weekSeed('2026-W41') !== weekSeed('2026-W42') && weekSeed('2026-W41') === weekSeed('2026-W41'), 'weekly seed is stable within a week and changes next week');
  ok(weekKey(new Date(Date.UTC(2027, 0, 1))) === '2026-W53', 'ISO week at a year boundary');
}

// ---------------------------------------------------------------- unlocks, chests, prizes, titles
{
  const S = M.freshSave();
  Q.repairQuest(S);
  ok(Q.levelUnlocked(S, '1-1') && !Q.levelUnlocked(S, '1-2') && !Q.worldUnlocked(S, 2), 'fresh save: only 1-1 open');
  ok(!Q.modeUnlocked(S, 'zen') && Q.modeUnlocked(S, 'classic') && !Q.stakeUnlocked(S, 'oak'), 'fresh save: endless only, Sapling only');
  const won = (lv, extra = {}) => ({ won: true, score: 99999, merges: 99, blooms: 99, hits: 0, reverts: 0, nearMisses: 99, splits: 99, maxMult: 8, commits: 999, time: 10, grafts: 9, storms: 9, goldens: 1, acorns: 9, height: 200, ...extra });
  let out = Q.finishQuest(S, won('1-1', { hits: 1 }), { level: '1-1' });
  ok(out.stars === 2 && S.quest.stars['1-1'] === 2, `1-1 with a hit: 2 stars (finish + sunlight), got ${out.stars}`);
  out = Q.finishQuest(S, won('1-1', { commits: 0 }), { level: '1-1' });
  ok(S.quest.stars['1-1'] === 3 && out.newStars === 1, 'goal stars add up across tries (3 stars after two runs)');
  out = Q.finishQuest(S, { won: false, score: 5, height: 10 }, { level: '1-1' });
  ok(S.quest.stars['1-1'] === 3 && out.stars === 3 && out.runStars === 0, 'a failed try never removes stars');
  ok(Q.levelUnlocked(S, '1-2') && out.unlocks.length === 0, '1-2 opens after 1-1');
  out = Q.finishQuest(S, won(), { level: '1-2' });
  ok(out.unlocks.includes('mode:zen'), 'clearing 1-2 announces Zen');
  Q.finishQuest(S, won(), { level: '1-3' });
  const before = S.acorns;
  out = Q.finishQuest(S, won(), { level: '1-4' });
  ok(Q.totalStars(S) === 12 && S.quest.chests === 2 && S.acorns - before === Q.chestReward(2), `chests: one per 6 stars (${S.quest.chests} opened, +${S.acorns - before} on this run)`);
  ok(out.prizes.includes('w1') && out.titles.includes('pathfinder') && S.quest.title === 'pathfinder', 'World 1 clear: prize skin + Pathfinder title (auto-shown)');
  ok(out.unlocks.includes('mode:sprint') && ['world:2', 'stake:oak', 'mode:weekly'].every((u) => S.quest.seen.includes(u)), `world 1 done: Sprint now; World 2, Oak, Weekly announced along the way (${S.quest.seen.join(', ')})`);
  const got = M.unlockEarned(S);
  ok(got.includes('blossom.dandelion'), 'prize skin lands in the shop as owned');
  ok(!SKINS.filter((k) => k.unlock.prize).some((k) => M.canBuy(S, k.id)), 'prize skins are never for sale');
  ok(!Q.setTitle(S, 'ancient') && S.quest.title === 'pathfinder', 'cannot wear a title not yet earned');
  // stakes by endless progress
  const E = M.freshSave(); Q.repairQuest(E);
  Q.finishQuest(E, { height: 410, score: 1 }, { mode: 'classic', stake: 'sapling' });
  ok(Q.stakeUnlocked(E, 'oak') && !Q.stakeUnlocked(E, 'ancient'), 'reaching the Treetop on Sapling opens Oak');
  Q.finishQuest(E, { height: 405, score: 1 }, { mode: 'classic', stake: 'oak' });
  ok(Q.stakeUnlocked(E, 'ancient') && E.quest.titles.includes('oakheart'), 'Treetop on Oak opens Ancient + Oakheart title');
  // mode bests
  Q.finishQuest(E, { height: 300, score: 900 }, { mode: 'hardcore' });
  ok(E.quest.modeBest.hardcore.h === 300 && E.quest.prizes.includes('hardcore'), 'hardcore best recorded; 300 m wins the Ember cap');
  Q.finishQuest(E, { height: 120, score: 500 }, { mode: 'weekly', week: '2026-W41' });
  ok(E.quest.weekly['2026-W41'].h === 120, 'weekly best per week');
  // endless bests stay endless: a level never changes the best height line
  const B = M.freshSave(); B.best.height = 50;
  M.finishRun(B, { height: 300, score: 9, commits: 0, merges: 0, maxMult: 1, hits: 0, reverts: 0, nearMisses: 0, splits: 0, blooms: 0, time: 30, acorns: 0, grafts: 0, storms: 0, goldens: 0, pickups: 0, stage: 'x', hash: 'h' }, { noBest: true });
  ok(B.best.height === 50 && B.topRuns.length === 0, 'quest/mode runs do not touch the endless best or top runs');
}

// ---------------------------------------------------------------- saves
{
  const store = (o) => (k) => (k === M.SAVE_KEY ? o : null);
  const old = M.loadSave(store({ v: 2, acorns: 120, best: { score: 10, height: 480 }, stats: { runs: 9 } }));
  ok(old.quest && old.quest.stake === 'sapling' && Q.totalStars(old) === 0, 'a pass-3 save (no quest block) loads with a fresh quest');
  ok(Q.stakeUnlocked(old, 'oak') && Q.modeUnlocked(old, 'hardcore'), 'returning growers keep their progress: 480 m opens Oak and Hardcore');
  const bad = M.loadSave(store({ v: 2, quest: { stars: { '1-1': 9, 'zz': 3, '1-2': 'x' }, stake: 'ancient', chests: 99, title: 'nope', titles: 'x', prizes: null } }));
  ok(bad.quest.stars['1-1'] === 3 && !('zz' in bad.quest.stars) && !('1-2' in bad.quest.stars), 'repair clamps stars and drops unknown levels');
  ok(bad.quest.stake === 'sapling' && bad.quest.chests === 0 && bad.quest.title === null && Array.isArray(bad.quest.titles), 'repair drops a locked stake, phantom chests, unknown titles');
  const v1 = M.loadSave((k) => (k === M.SAVE_KEY ? null : k === 'forkwood.best' ? { score: 100, height: 200 } : null));
  ok(v1.quest && v1.best.height === 200, 'a first-build save still migrates and gets a quest block');
  const rt = JSON.parse(JSON.stringify(old));
  ok(JSON.stringify(Q.repairQuest(rt)) === JSON.stringify(old.quest), 'quest block survives a JSON round trip unchanged');
  ok(/^Forkwood quest 0\/60★\n1 ☆☆☆ ☆☆☆ ☆☆☆ ☆☆☆\n2 · locked/.test(Q.mapGrid(old)), 'share grid is spoiler-free text');
}

console.log(fails ? `\n${fails} FAILED` : '\nquest, modes and unlock checks OK');
process.exit(fails ? 1 : 0);
