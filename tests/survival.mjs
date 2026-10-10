// Survival by height for weak / average / expert bots (pass 3 balance report). usage: N=100 node tests/survival.mjs
// survival curve by height + death reasons, for weak / average / expert bots
import { createSim, step, heightM, TUNE } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
const N = Number(process.env.N || 100);
const marks = [120, 240, 400, 520, 600, 850, 1000, 1200, 1500];
const out = {};
for (const sk of (process.env.SKS || '0.3,0.6,0.95').split(',').map(Number)) {
  const H = [], T = [], starve = { hit: 0, starve: 0 }; let grafts = 0, pick = 0, storms = 0, stormSeen = 0;
  for (let i = 0; i < N; i++) {
    const s = createSim({ seed: 5000 + i, tutorial: true }); const bot = createBot(sk, i + 7);
    let lastHit = -9;
    while (!s.dead && s.t < 400) { step(s, 1 / 60, botInput(bot, s)); for (const e of s.events) if (e.type === 'hit' || e.type === 'revert') lastHit = s.t; }
    H.push(heightM(s)); T.push(s.t); (s.t - lastHit < 3 ? starve.hit++ : starve.starve++);
    grafts += s.grafts.length; pick += s.pickups; if (heightM(s) > 430) { stormSeen++; if (s.storms >= 1) storms++; }
  }
  const row = { medianT: T.sort((a, b) => a - b)[N >> 1].toFixed(1) };
  for (const mk of marks) row['≥' + mk] = Math.round(100 * H.filter((h) => h >= mk).length / N) + '%';
  row.deathAfterHit = Math.round(100 * starve.hit / N) + '%'; row.grafts = (grafts / N).toFixed(1); row.pickups = (pick / N).toFixed(1); row.stormSurvive = stormSeen ? Math.round(100 * storms / stormSeen) + '%' : '-';
  out[sk] = row;
}
if (process.env.JSON) console.log(JSON.stringify(out)); else console.table(out);
