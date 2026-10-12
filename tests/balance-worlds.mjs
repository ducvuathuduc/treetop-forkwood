import { createSim, step, summary, MECH_TUNE, TUNE } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
import { rulesFor } from '../src/modes.js';
import { WORLD_IDS } from '../src/world-mech.js';
if (process.env.MT) Object.assign(MECH_TUNE, JSON.parse(process.env.MT)); if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
const N = +process.env.N || 12, SK = [0.3, 0.6, 0.95], stake = process.env.STAKE || 'oak';
const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
const out = [];
for (const sk of SK) { const T = [], per = {};
  for (const w of WORLD_IDS) { per[w] = [];
    for (let i = 0; i < N; i++) { const s = createSim({ seed: 5000 + i * 7, rules: rulesFor({ mode: 'classic', stake }), pure: true, world: w });
      const b = createBot(sk, 11 + i * 3); while (!s.dead && s.t < 400) step(s, 1 / 60, botInput(b, s)); T.push(s.t); per[w].push(s.t); } }
  out.push(`${sk}: pooled ${med(T).toFixed(1)}s  ` + WORLD_IDS.map((w) => `${w.slice(0,4)} ${med(per[w]).toFixed(0)}`).join(' ')); }
console.log(stake, process.env.TUNE || '', '\n' + out.join('\n'));
