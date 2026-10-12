// P8-ECON economy checks + a 30-day simulation of three player types.
// Node only: node tests/economy.mjs   (POOL=runs per bot skill, OUT=path for the markdown report)
import { createSim, step, summary, heightM, W } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
import { rulesFor } from '../src/modes.js';
import { mulberry32 } from '../src/rng.js';
import * as M from '../src/meta.js';
import * as R from '../src/retention.js';
import * as E from '../src/economy.js';
import { SKINS } from '../src/skins.js';
import { writeFileSync } from 'fs';
import { WORLD_IDS } from '../src/world-mech.js';

let fails = 0;
const ok = (c, msg) => { if (c) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };
const day0 = '2026-11-02'; // a Monday
const dayN = (n) => new Date(Date.parse(day0 + 'T12:00:00Z') + n * 864e5);
const COST_SKINS = SKINS.filter((s) => s.unlock.cost).map((s) => s.id);

// ---------------------------------------------------------------- unit checks
{
  ok(Math.abs(E.POD_ODDS.reduce((a, o) => a + o.w, 0) - 100) < 1e-9 && Math.abs(E.GOLDEN_ODDS.reduce((a, o) => a + o.w, 0) - 100) < 1e-9, 'pod odds are published as percentages that add up to 100');
  ok([0, 1, 2, 3].map(E.reviveCost).join() === '1,2,4,8', 'second chance costs 1, 2, 4, 8 gems in one run');
  const S = M.freshSave(day0); S.acorns = 5000;
  const p = [0, 1, 2, 3, 4, 5, 6].map(() => { const pr = E.podPrice(S, day0); E.buyPod(S, { today: day0, skins: COST_SKINS, rng: mulberry32(7) }); return pr; });
  ok(p[0] === 300 && p[1] > p[0] && p[6] <= E.POD_CAP, `seed pod price rises with each pod bought today (${p.join(', ')})`);
  ok(E.podPrice(S, '2026-11-03') === 300, 'and resets the next day');
  ok(E.podValue(E.POD_ODDS) < E.POD_BASE, `a seed pod is a net sink: expected value ${Math.round(E.podValue(E.POD_ODDS))} acorns for ${E.POD_BASE}`);
  // odds are honoured
  const T = M.freshSave(day0); const cnt = {}; const r = mulberry32(99);
  for (let i = 0; i < 20000; i++) { const o = E.openPod(T, E.POD_ODDS, { rng: r, skins: [] }); cnt[o.id] = (cnt[o.id] || 0) + 1; }
  ok(E.POD_ODDS.every((o) => Math.abs(cnt[o.id] / 200 - o.w) < Math.max(0.6, o.w * 0.12)), `20,000 pods match the published odds (${E.POD_ODDS.map((o) => `${o.id} ${(cnt[o.id] / 200).toFixed(1)}%`).join(', ')})`);
  // upgrades
  const U = M.freshSave(day0); U.acorns = 1e6;
  let spent = 0; for (let i = 0; i < 8; i++) { const c = E.upCost(U, 'pollen'); if (E.buyUpgrade(U, 'pollen')) spent += c; }
  ok(E.upLevel(U, 'pollen') === E.MAX_UP && spent === E.UPGRADE_COST.reduce((a, b) => a + b, 0), `upgrades stop at level ${E.MAX_UP} (${spent} acorns for one track)`);
  // boosts are consumed and only on fair-free runs
  const B = M.freshSave(day0); B.econ.boosts = { sprout: 2, ink: 1 };
  ok(E.runOptions(B, { pure: true }, ['sprout']) === null && B.econ.boosts.sprout === 2, 'fair runs (daily, weekly, challenge, race, quest) take no boosts and get no economy effects');
  const o = E.runOptions(B, { today: day0 }, ['sprout', 'ink', 'mega']);
  ok(o.boosts.join() === 'sprout,ink' && B.econ.boosts.sprout === 1 && B.econ.boosts.ink === 0, 'armed boosts are taken from the inventory (only ones you own)');
  // sim effects
  const run = (opts, sec) => { const s = createSim({ seed: 4242, ...opts }); for (let i = 0; i < sec * 60 && !s.dead; i++) step(s, 1 / 60, { targetX: W / 2 }); return s; };
  const plain = run({}, 6), head = run({ econ: { boosts: ['sprout'], up: {}, mult: 1 } }, 6), mega = run({ econ: { boosts: ['mega'], up: {}, mult: 1 } }, 18), plain18 = run({}, 18);
  ok(heightM(head) > heightM(plain) + 20, `head start: ${Math.round(heightM(head))} m after 6 s vs ${Math.round(heightM(plain))} m`);
  ok(heightM(mega) > heightM(plain18) + 70, `mega head start: ${Math.round(heightM(mega))} m after 18 s vs ${Math.round(heightM(plain18))} m`);
  const pure = run({ pure: true, econ: { boosts: ['mega'], up: {}, mult: 3 } }, 6);
  ok(pure.econ === null && Math.abs(heightM(pure) - heightM(plain)) < 1, 'a pure run ignores economy options entirely');
  const up = createSim({ seed: 1, econ: { boosts: [], up: { pollen: 6 }, mult: 1 } });
  ok(Math.abs(Math.round(6 * (1 + 0.15 * 6) * 10) / 10 - E.upValue('pollen', 6)) < 0.11, `pollen level 6 lasts ${E.upValue('pollen', 6)} s (base 6 s)`);
  const sm = createSim({ seed: 1, econ: { boosts: ['ink'], up: {}, mult: 1.5 } });
  ok(Math.abs(sm.R.score - 2.25) < 1e-9, 'grower multiplier ×1.5 and the score booster ×1.5 stack (×2.25)');
  ok(E.growerMult({ level: 1 }) === 1 && E.growerMult({ level: 11 }) === 2 && E.growerMult({ level: 40 }) === 3, 'grower multiplier: +0.1 per level, capped at ×3');
  // letter + gem drops spawn on the course and can be picked up
  const L = createSim({ seed: 77, econ: { boosts: [], up: {}, mult: 1, letter: 'A', gemDrop: true } });
  ok(L.drops.some((d) => d.letter === 'A'), 'the word-hunt letter is placed on the course (60-160 m)');
  const d = L.drops.find((q) => q.letter);
  for (let i = 0; i < 60 * 60 && !L.dead && !L.letter; i++) { L.sap = 100; const m = L.motes.find((q) => q.letter); step(L, 1 / 60, { targetX: m ? m.x : d.x }); }
  ok(L.letter === 'A', 'steering into the letter collects it');
  // revive
  const V = createSim({ seed: 5 }); V.sap = -1; step(V, 1 / 60, {}); ok(V.dead, 'a run can run dry');
  const S2 = M.freshSave(day0); E.gainGems(S2, 3);
  ok(E.payRevive(S2, 0) === 1 && E.payRevive(S2, 1) === 2 && E.payRevive(S2, 2) === false && S2.econ.gems === 0, 'second chance spends 1 then 2 gems; the 4-gem one needs 4 gems');
  // sim.revive is a pure state change (main.js calls it after payRevive)
  const { revive } = await import('../src/sim.js');
  ok(revive(V) && !V.dead && V.sap === 70 && V.invuln > 2, 'second chance: back to life with 70 sap and 2.5 s of safety');
  // word hunt
  const WS = M.freshSave(day0); const word = E.wordOf(day0);
  for (const ch of word) E.afterRunEcon(WS, { letter: ch }, { today: day0, out: {}, rng: mulberry32(3), skins: COST_SKINS });
  ok(WS.econ.word.done && WS.econ.word.streak === 1, `word hunt: ${word} spelled one letter per run completes the day`);
  // skip a goal
  const G = M.freshSave(day0); E.gainGems(G, 3); ok(E.skipGoal(G) && G.goals.filter((g) => g.done).length === 1 && G.econ.gems === 0, 'skip a goal for 3 gems');
}

// ---------------------------------------------------------------- V2-MECH unit checks
{
  ok(E.CRITTER_COST.join() === '450,750,1200' && E.CRITTER_IDS.length === 8, `critter levels 4-6 cost half the research price (450 / 750 / 1,200; ${E.CRITTER_IDS.length * 2400} for all 8)`);
  const C = M.freshSave(day0); C.acorns = 10000;
  ok(E.critterLevel(C, 'owl') === 1 && E.critterCost(C, 'owl') === null && E.buyCritterLevel(C, 'owl') === false, 'levels 1-3 come from critter XP, not acorns');
  E.addCritterXp(C, 'owl', 6000); ok(E.critterLevel(C, 'owl') === 2, 'owl level 2 at 6,000 m'); E.addCritterXp(C, 'owl', 9000);
  ok(E.critterLevel(C, 'owl') === 3 && E.buyCritterLevel(C, 'owl') === 450 && E.buyCritterLevel(C, 'owl') === 750 && E.buyCritterLevel(C, 'owl') === 1200 && E.critterLevel(C, 'owl') === 6 && E.buyCritterLevel(C, 'owl') === false, 'level 3 by XP, then 4-6 for acorns, capped at 6');
  ok(E.upValue('wild', 6) === 1.5 && E.upValue('rides', 6) === 1.5 && E.UPGRADE_IDS.includes('wild') && E.UPGRADE_IDS.includes('rides'), 'Wild Kit and Rides are upgrade tracks (×1.5 at level 6)');
  ok(E.BOOSTS.ride.price === 200 && E.POD_ODDS.find((o) => o.id === 'rideToken').w === 8 && E.POD_ODDS.find((o) => o.id === 'acorns').w === 38, 'Ride Token boost (200) and 8% in seed pods (acorns 46 -> 38%)');
  ok(E.mechOptions(C, { pure: true }) === null && E.mechOptions(C, { race: true }) === null && E.mechOptions(C, { level: true }) === null && E.mechOptions(C, { tutorial: true }) === null, 'skills and curses are off on fair runs');
  E.equipSkill(C, 'owl'); E.setCurses(C, ['thirst', 'bogus']);
  const mo = E.mechOptions(C, {}); ok(mo.skill.id === 'owl' && mo.skill.lv === 6 && mo.curses.join() === 'thirst', 'free play gets the equipped skill at its level and the chosen curses');
  const V = M.freshSave(day0); V.acorns = 700;
  ok(E.ownsVine(V, 'vine.skin.impasto') && E.buyVine(V, 'vine.skin.impasto') === false, 'each world has a free vine skin');
  ok(E.buyVine(V, 'vine.skin.cypress') === 600 && V.acorns === 100 && E.selectVine(V, 'starry', 'vine.skin.cypress') && !E.selectVine(V, 'meadow', 'vine.skin.cypress') && E.vineFor(V, 'starry') === 'vine.skin.cypress', 'vine skins are bought once and worn in their own world (cosmetic: the sim never reads them)');
  ok(E.VINE_SKINS.every((v) => /^vine\.skin\.[a-z]+$/.test(v.id)) && E.VINE_SKINS.every((v) => !('stat' in v) && !('power' in v)), 'vine skin ids follow the registry and carry no stats');
  const L = M.freshSave(day0); const got = E.applyLoot(L, [{ type: 'rideToken', n: 2 }, { type: 'boost', n: 1 }, { type: 'trophy', boss: 'kitsune' }, { type: 'trophy', boss: 'kitsune' }], { rng: mulberry32(5) });
  ok(L.econ.boosts.ride >= 2 && L.econ.trophies.join() === 'kitsune' && got.some((g) => g.type === 'acorns' && g.n === 300), 'chest loot: ride tokens, boosts, one-time boss trophies (a repeat pays 300 acorns)');
  ok(E.podValue(E.POD_ODDS) < E.POD_BASE, `the seed pod is still a net sink with the Ride Token (EV ${Math.round(E.podValue(E.POD_ODDS))})`);
  const W2 = M.freshSave(day0); W2.econ.maps = ['arashiyama']; ok(E.ownsWorld(W2, 'meadow') && E.ownsWorld(W2, 'starry') && E.ownsWorld(W2, 'fresco') && !E.ownsWorld(W2, 'ukiyo'), 'worlds take over the map slots (meadow + starry free; a bought v1 map unlocks its world)');
}

// ---------------------------------------------------------------- run pools from the real bots
const POOL = Number(process.env.POOL || 50);
function pool(skill, stake) {
  const out = [];
  for (let i = 0; i < POOL; i++) {
    // V2-MECH: every world, a critter skill at level 3 (the free XP levels), rides / rings / chests / hollows in play
    const s = createSim({ seed: 9000 + i * 13, world: WORLD_IDS[i % WORLD_IDS.length], skill: { id: ['sparrow', 'squirrel', 'snail', 'moth'][i % 4], lv: 3 }, rules: rulesFor({ mode: 'classic', stake }), charm: 'ward', econ: { boosts: [], up: {}, mult: 1, letter: 'X', gemDrop: true } });
    const b = createBot(skill, 31 + i);
    while (!s.dead && s.t < 400) step(s, 1 / 60, botInput(b, s));
    out.push(summary(s));
  }
  return out;
}
const P = { casual: pool(0.3, 'sapling'), average: pool(0.6, 'sapling'), hardcore: pool(0.95, 'oak') };
for (const [k, v] of Object.entries(P)) console.log(`pool ${k}: median ${v.map((x) => x.height).sort((a, b) => a - b)[v.length >> 1]} m, letter picked ${Math.round(100 * v.filter((x) => x.letter).length / v.length)}%, gems found ${v.reduce((a, x) => a + x.gems, 0)}/${v.length} runs`);

// ---------------------------------------------------------------- 30-day simulation
const PROFILES = {
  casual: { runs: 4, days: [1, 1, 0, 1, 1, 0, 1], boostEvery: 4 },
  average: { runs: 10, days: [1, 1, 1, 1, 1, 0, 1], boostEvery: 2 },
  hardcore: { runs: 30, days: [1, 1, 1, 1, 1, 1, 1], boostEvery: 1 },
  'hardcore (saver)': { runs: 30, days: [1, 1, 1, 1, 1, 1, 1], boostEvery: 0, pool: 'hardcore' },
};
const MAP_IDS = Object.keys(E.MAP_PRICE), MAPS_TOTAL = MAP_IDS.reduce((a, id) => a + E.MAP_PRICE[id], 0);
// V2-MECH: + Wild Kit and Rides tracks (in UPGRADE_IDS), critter levels 4-6 at half price, vine skins
const CRITTERS_TOTAL = E.CRITTER_IDS.length * E.CRITTER_COST.reduce((a, b) => a + b, 0);
const VINES_TOTAL = E.VINE_SKINS.filter((v) => v.cost).reduce((a, v) => a + v.cost, 0);
const CATALOGUE = E.UPGRADE_IDS.length * E.UPGRADE_COST.reduce((a, b) => a + b, 0) + SKINS.filter((s) => s.unlock.cost).reduce((a, s) => a + s.unlock.cost, 0) + MAPS_TOTAL + CRITTERS_TOTAL + VINES_TOTAL;
function owned(S) {
  let v = 0; for (const id of E.UPGRADE_IDS) for (let l = 0; l < E.upLevel(S, id); l++) v += E.UPGRADE_COST[l];
  for (const id of E.CRITTER_IDS) for (let l = 4; l <= E.critterLevel(S, id); l++) v += E.CRITTER_COST[l - 4];
  for (const id of S.econ.vines) v += E.VINE[id].cost || 0;
  for (const s of SKINS) if (s.unlock.cost && S.owned.includes(s.id)) v += s.unlock.cost;
  for (const id of S.econ.maps) v += E.MAP_PRICE[id] || 0;
  return v;
}
function simulate(name) {
  const pr = PROFILES[name], pl = P[pr.pool || name], r = mulberry32(name.length * 101);
  const S = M.freshSave(day0); const rows = [];
  let runsTotal = 0, revives = 0, boostsUsed = 0, pods = 0, sinks = { upgrades: 0, skins: 0, maps: 0, boosts: 0, pods: 0 };
  for (let d = 0; d < 30; d++) {
    const now = dayN(d), today = now.toISOString().slice(0, 10);
    const play = pr.days[d % 7];
    const startA = S.acorns;
    if (play) {
      M.rollover(S, now);
      for (let k = 0; k < pr.runs; k++) {
        // arm boosts: casual players use what they own now and then; hardcore buy a head start + booster every run if rich
        const use = [];
        if (pr.boostEvery && (k % pr.boostEvery) === 0) {
          for (const id of name.startsWith('hardcore') ? ['sprout', 'ink'] : ['sprout']) {
            if (!(S.econ.boosts[id] > 0) && S.acorns > (name.startsWith('hardcore') ? 1500 : 3000) && E.buyBoost(S, id)) sinks.boosts += E.BOOSTS[id].price;
            if (S.econ.boosts[id] > 0) use.push(id);
          }
        }
        const opts = E.runOptions(S, { today }, use); boostsUsed += use.length;
        const base = pl[Math.floor(r() * pl.length)];
        const sum = { ...base, letter: base.letter && opts.letter ? opts.letter : null, gems: base.gems };
        if (use.includes('sprout')) sum.height += 40;
        // second chance: hardcore spends gems on a good run
        if (name !== 'casual' && sum.height > 300 && S.econ.gems >= E.reviveCost(0) + 2) { E.payRevive(S, 0); revives++; sum.height += 60; }
        E.equipSkill(S, E.CRITTER_IDS[d % E.CRITTER_IDS.length]); sum.skill = { id: S.econ.skill, lv: E.critterLevel(S, S.econ.skill) }; // V2-MECH: a different critter each day
        const out = M.finishRun(S, sum, { now });
        R.afterRun(S, sum, out, M.claimGift, now);
        runsTotal++;
      }
      // shopping: cheapest upgrade first, then the cheapest skin, then pods (hardcore only, with a buffer)
      let bought = true;
      while (bought) {
        bought = false;
        const ups = E.UPGRADE_IDS.map((id) => [id, E.upCost(S, id)]).filter(([, c]) => c != null)
          .concat(E.CRITTER_IDS.map((id) => ['critter:' + id, E.critterCost(S, id)]).filter(([, c]) => c != null)).sort((a, b) => a[1] - b[1]); // V2-MECH: critter levels 4-6
        // skins and maps compete as cosmetics: the cheapest one not owned yet
        const sk = COST_SKINS.filter((id) => !S.owned.includes(id)).map((id) => [id, M.priceOf(S, id, today), 'skin'])
          .concat(MAP_IDS.filter((id) => !E.ownsMap(S, id)).map((id) => [id, E.MAP_PRICE[id], 'map']))
          .concat(E.VINE_SKINS.filter((v) => v.cost && !E.ownsVine(S, v.id)).map((v) => [v.id, v.cost, 'vine'])).sort((a, b) => a[1] - b[1]); // V2-MECH: vine skins
        const nextUp = ups[0], nextSkin = sk[0];
        if (nextUp && (!nextSkin || nextUp[1] <= nextSkin[1] * 1.5) && S.acorns >= nextUp[1]) { if (nextUp[0].startsWith('critter:')) E.buyCritterLevel(S, nextUp[0].slice(8)); else E.buyUpgrade(S, nextUp[0]); sinks.upgrades += nextUp[1]; bought = true; }
        else if (nextSkin && S.acorns >= nextSkin[1]) { if (nextSkin[2] === 'map') { E.buyMap(S, nextSkin[0]); sinks.maps += nextSkin[1]; } else if (nextSkin[2] === 'vine') { E.buyVine(S, nextSkin[0]); sinks.skins += nextSkin[1]; } else { M.buy(S, nextSkin[0], today); sinks.skins += nextSkin[1]; } bought = true; }
      }
      if (name === 'hardcore') while (S.acorns > 2500 && E.podPrice(S, today) <= 600) { const pr2 = E.podPrice(S, today); E.buyPod(S, { today, skins: COST_SKINS, rng: r }); sinks.pods += pr2; pods++; }
      if (S.econ.gems >= E.GEM_SHOP.golden.gems + 4 && name === 'hardcore') E.buyGolden(S, { skins: COST_SKINS, rng: r });
    }
    rows.push({ day: d + 1, acorns: S.acorns, earned: S.earned, spent: S.spent, gems: S.econ.gems, gemsEarned: S.econ.gemsEarned, pct: Math.round((100 * owned(S)) / CATALOGUE), level: S.level, mult: E.growerMult(S), delta: S.acorns - startA });
  }
  return { rows, runsTotal, revives, boostsUsed, pods, sinks, S };
}
const res = {}; for (const n of Object.keys(PROFILES)) res[n] = simulate(n);
const pick = (rows, ds) => ds.map((d) => rows[d - 1]);
let md = `| player | day | acorn balance | earned (total) | spent (total) | gems held / earned | catalogue owned | level | grower × |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const [n, v] of Object.entries(res)) for (const row of pick(v.rows, [1, 3, 7, 14, 21, 30])) md += `| ${n} | ${row.day} | ${row.acorns.toLocaleString('en-US')} | ${row.earned.toLocaleString('en-US')} | ${row.spent.toLocaleString('en-US')} | ${row.gems} / ${row.gemsEarned} | ${row.pct}% | ${row.level} | ×${row.mult} |\n`;
md += `\n| player | runs in 30 days | acorns per run (avg) | spent on upgrades / skins / maps / boosts / pods | second chances | boosts used | pods bought | maps owned |\n|---|---|---|---|---|---|---|---|\n`;
for (const [n, v] of Object.entries(res)) { const last = v.rows[29]; md += `| ${n} | ${v.runsTotal} | ${Math.round(last.earned / v.runsTotal)} | ${v.sinks.upgrades.toLocaleString('en-US')} / ${v.sinks.skins.toLocaleString('en-US')} / ${v.sinks.maps.toLocaleString('en-US')} / ${v.sinks.boosts.toLocaleString('en-US')} / ${v.sinks.pods.toLocaleString('en-US')} | ${v.revives} | ${v.boostsUsed} | ${v.pods} | ${v.S.econ.maps.length}/${MAP_IDS.length} |\n`; }
console.log('\n' + md);
console.log(`catalogue (${E.UPGRADE_IDS.length} upgrade tracks + ${COST_SKINS.length} shop skins + ${MAP_IDS.length} maps, ${MAPS_TOTAL.toLocaleString('en-US')} + critter levels ${CRITTERS_TOTAL.toLocaleString('en-US')} + vine skins ${VINES_TOTAL.toLocaleString('en-US')}): ${CATALOGUE.toLocaleString('en-US')} acorns`);
if (process.env.OUT) writeFileSync(process.env.OUT, md + `\ncatalogue: ${CATALOGUE} acorns\n`);

{
  const MS = M.freshSave(day0); MS.acorns = 1000;
  ok(E.ownsMap(MS, 'phongnha') && E.ownsMap(MS, 'forkwood') && !E.ownsMap(MS, 'arashiyama'), 'Forkwood and Phong Nha are free; the other maps start locked');
  ok(E.buyMap(MS, 'redwoods') === false && MS.acorns === 1000, 'a map you cannot afford costs nothing');
  ok(E.buyMap(MS, 'arashiyama') === 900 && MS.acorns === 100 && E.ownsMap(MS, 'arashiyama') && E.buyMap(MS, 'arashiyama') === false, 'buying a map spends its price once and keeps it');
  MS.econ.maps.push('bogus', 'arashiyama'); E.ensureEcon(MS);
  ok(MS.econ.maps.length === 1, 'the owned-maps list is repaired on load (no duplicates or unknown ids)');
}
const H = res.hardcore.rows, C = res.casual.rows, A = res.average.rows;
const HS = res['hardcore (saver)'].rows;
ok(HS[6].pct < 60 && H[6].pct < 60, `even a hardcore player who saves every acorn owns only ${HS[6].pct}% of the permanent catalogue after week 1 (${H[6].pct}% when buying boosts)`);
ok(HS[29].pct >= 65, `a hardcore saver owns most of it in a month (${HS[29].pct}% at day 30; v2 catalogue is ~5-6 weeks of saving by design)`);
ok(H[29].pct <= 100 && H[13].pct < 100, `hardcore still has something to buy at day 14 (${H[13].pct}%)`);
ok(C[29].pct >= 8, `a casual player still makes visible progress in a month (${C[29].pct}% of the catalogue)`);
ok(Math.max(...H.map((x) => x.acorns)) < 6000, `hardcore balance never piles up (max ${Math.max(...H.map((x) => x.acorns))} acorns held)`);
ok(Math.max(...A.map((x) => x.acorns)) < 6000, `average balance stays spendable (max ${Math.max(...A.map((x) => x.acorns))})`);
ok(H[29].gemsEarned < 150 && C[29].gemsEarned >= 5, `gems stay rare (< 5 a day even at 30 runs a day): hardcore earned ${H[29].gemsEarned}, casual ${C[29].gemsEarned} in 30 days`);
console.log(fails ? `\n${fails} FAILED` : '\neconomy OK');
process.exit(fails ? 1 : 0);
