// Forkwood v3 game-feel telemetry: headless bot runs that measure what makes a
// run feel good or flat. Usage:
//   node tools/feel/telemetry.mjs [feel=v2|v3] [N=runs per world per skill] [mode=pure|free]
// Prints a table and writes JSON to work/v3/telemetry-<feel>-<mode>.json (when OUT is set).
import { createSim, step, summary } from '../../src/sim.js';
import { createBot, botInput } from '../../src/bot.js';
import { rulesFor } from '../../src/modes.js';
import { WORLD_IDS } from '../../src/world-mech.js';
import { writeFileSync } from 'node:fs';

const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const FEEL = arg.feel || 'v3';
const N = +(arg.N || 6);
const FREE = arg.mode === 'free';
const SK = [0.3, 0.6, 0.95];
const DT = 1 / 60;
// reward = something that pays you (points, sap, a new toy); decision = something the course asked you to answer
const REWARD = new Set(['collect', 'acorn', 'dew', 'pickup', 'near', 'merge', 'bloom', 'golden', 'ring.pick', 'vehicle.mount', 'trapFoil', 'straddle', 'chest', 'hollow', 'stormend', 'boss.foil', 'feel.graze', 'feel.sig', 'feel.lane', 'feel.finisher', 'feel.flow']);
const DECIDE = new Set(['trapWarn', 'fork', 'merge', 'ring.offer', 'vehicle.mount', 'feel.lane', 'feel.sigstart']);
const BIG = new Set(['merge', 'bloom', 'golden', 'ring.pick', 'vehicle.mount', 'chest', 'stormend', 'boss.foil', 'setpiece.start', 'feel.sig', 'feel.tier', 'feel.flow', 'feel.finisher', 'synergy', 'stage']);
const med = (a) => { if (!a.length) return 0; a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const pct = (a, q) => { if (!a.length) return 0; a = a.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function one(world, skill, i) {
  const seed = 9000 + i * 13 + WORLD_IDS.indexOf(world) * 101;
  const opts = FREE ? { seed, rules: rulesFor({ mode: 'classic', stake: 'oak' }), world, skill: 'sparrow', feel: FEEL, feelForce: FEEL }
    : { seed, rules: rulesFor({ mode: 'classic', stake: 'oak' }), pure: true, world, feel: FEEL, feelForce: FEEL };
  const s = createSim(opts);
  const b = createBot(skill, 21 + i * 5);
  let lastReward = 0, lastBig = 0; const gaps = [], bigGaps = []; let dead = 0, decide = 0, warns = [], hits = [], combo = { peak: 0, tiers: 0, flows: 0, flowT: 0, grazes: 0, sig: 0, sigStart: 0, lanes: 0, fin: 0, buffered: 0, coyote: 0 };
  let sapHit = 0, sapDrain = 0, prevSap = s.sap;
  while (!s.dead && s.t < 400) {
    const t0 = s.t; const sap0 = s.sap; const hits0 = s.hits;
    step(s, DT, botInput(b, s));
    for (const e of s.events) {
      if (REWARD.has(e.type)) { const g = s.t - lastReward; if (g > 0.05) gaps.push(g); if (g > 2.5) dead += g - 2.5; lastReward = s.t; }
      if (BIG.has(e.type)) { bigGaps.push(s.t - lastBig); lastBig = s.t; }
      if (DECIDE.has(e.type)) decide++;
      if (e.type === 'trapWarn') warns.push({ t: s.t, trap: e.trap, lead: e.t });
      if (e.type === 'trapHit' && e.effect !== 'shield') {
        let lead = null; for (let k = warns.length - 1; k >= 0; k--) { if (s.t - warns[k].t > 4) break; if (warns[k].trap === e.trap) { lead = s.t - warns[k].t; break; } }
        hits.push({ t: s.t, trap: e.trap, lead, effect: e.effect, dmg: e.dmg });
      }
      if (e.type === 'feel.tier') combo.tiers++;
      if (e.type === 'feel.flow') combo.flows++;
      if (e.type === 'feel.graze') combo.grazes++;
      if (e.type === 'feel.sig') combo.sig++;
      if (e.type === 'feel.sigstart') combo.sigStart++;
      if (e.type === 'feel.lane') combo.lanes++;
      if (e.type === 'feel.finisher') combo.fin++;
      if (e.type === 'feel.buffer') combo.buffered++;
      if (e.type === 'feel.coyote') combo.coyote++;
    }
    if (s.feelS) { combo.peak = Math.max(combo.peak, s.feelS.combo); if (s.feelS.flow > 0) combo.flowT += DT; }
    const d = sap0 - s.sap; if (d > 0) { if (s.hits > hits0 || s.events.some((e) => e.type === 'trapHit' || e.type === 'revert')) sapHit += d; else sapDrain += d; }
  }
  const T = s.t, u = summary(s);
  // death reading: what ended it
  const lastHits = hits.filter((h) => T - h.t < 6);
  const cause = s.won ? 'win' : !lastHits.length ? 'starve' : lastHits.length >= 2 && T - lastHits[lastHits.length - 2].t < 4 ? 'hit-chain' : 'hit';
  const unfair = hits.filter((h) => h.effect !== 'ride' && (h.lead == null || h.lead < 0.8)).length;
  const deathUnfair = lastHits.some((h) => h.lead == null || h.lead < 0.8);
  return { world, skill, T, m: u.height, score: u.score, gapMed: med(gaps), gapP90: pct(gaps, 0.9), deadPct: (dead / T) * 100, bigGapMed: med(bigGaps), decidePer10: (decide / T) * 10,
    hitsPerMin: (hits.length / T) * 60, unfairHitPct: hits.length ? (unfair / hits.length) * 100 : 0, cause, deathUnfair, sapHitPct: (sapHit / Math.max(1, sapHit + sapDrain)) * 100, near: u.nearMisses, merges: u.merges, ...combo };
}

const rows = [];
for (const sk of SK) for (const w of WORLD_IDS) for (let i = 0; i < N; i++) rows.push(one(w, sk, i));
const agg = {};
for (const sk of SK) {
  const r = rows.filter((x) => x.skill === sk);
  const T = r.map((x) => x.T);
  agg[sk] = {
    runs: r.length, medT: +med(T).toFixed(1), p10T: +pct(T, 0.1).toFixed(1), p90T: +pct(T, 0.9).toFixed(1), medM: med(r.map((x) => x.m)),
    deathsPerMin: +(60 / mean(T)).toFixed(2),
    rewardGapMed: +mean(r.map((x) => x.gapMed)).toFixed(2), rewardGapP90: +mean(r.map((x) => x.gapP90)).toFixed(2),
    deadTimePct: +mean(r.map((x) => x.deadPct)).toFixed(1), bigMomentGap: +mean(r.map((x) => x.bigGapMed)).toFixed(1),
    decisionsPer10s: +mean(r.map((x) => x.decidePer10)).toFixed(1), hitsPerMin: +mean(r.map((x) => x.hitsPerMin)).toFixed(1),
    unfairHitPct: +mean(r.map((x) => x.unfairHitPct)).toFixed(1),
    starveDeathPct: +(100 * r.filter((x) => x.cause === 'starve').length / r.length).toFixed(0),
    hitChainDeathPct: +(100 * r.filter((x) => x.cause === 'hit-chain').length / r.length).toFixed(0),
    unfairDeathPct: +(100 * r.filter((x) => x.deathUnfair).length / r.length).toFixed(0),
    sapLostToHitsPct: +mean(r.map((x) => x.sapHitPct)).toFixed(0),
    nearPerMin: +mean(r.map((x) => (x.near / x.T) * 60)).toFixed(1), mergesPerMin: +mean(r.map((x) => (x.merges / x.T) * 60)).toFixed(1),
    comboPeakMed: med(r.map((x) => x.peak)), tiersPerRun: +mean(r.map((x) => x.tiers)).toFixed(1), flowPct: +mean(r.map((x) => (x.flowT / x.T) * 100)).toFixed(0),
    grazesPerMin: +mean(r.map((x) => (x.grazes / x.T) * 60)).toFixed(1), sigPerRun: +mean(r.map((x) => x.sigStart)).toFixed(1), sigRidden: +mean(r.map((x) => x.sig)).toFixed(1),
    lanesPerRun: +mean(r.map((x) => x.lanes)).toFixed(1), finishers: +mean(r.map((x) => x.fin)).toFixed(2), buffered: +mean(r.map((x) => x.buffered)).toFixed(1), coyote: +mean(r.map((x) => x.coyote)).toFixed(1),
  };
}
const label = { 0.3: 'weak', 0.6: 'avg', 0.95: 'expert' };
console.log(`feel=${FEEL} mode=${FREE ? 'free' : 'pure Oak'} N=${N}×7 worlds`);
const keys = Object.keys(agg[0.3]);
console.log('metric'.padEnd(18) + SK.map((k) => label[k].padStart(9)).join(''));
for (const k of keys) console.log(k.padEnd(18) + SK.map((s) => String(agg[s][k]).padStart(9)).join(''));
// per world medians (avg bot)
const pw = {}; for (const w of WORLD_IDS) pw[w] = SK.map((sk) => +med(rows.filter((x) => x.world === w && x.skill === sk).map((x) => x.T)).toFixed(0)).join('/');
console.log('per world med s (weak/avg/expert):', JSON.stringify(pw));
if (arg.OUT || process.env.OUT) writeFileSync(arg.OUT || process.env.OUT, JSON.stringify({ feel: FEEL, free: FREE, N, agg, perWorld: pw }, null, 1));
