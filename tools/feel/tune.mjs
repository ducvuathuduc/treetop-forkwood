// quick Oak-median tuner: node tools/feel/tune.mjs drain=1.1 dmg=1.5 [N=5] [feel=v3]
import { createSim, step } from '../../src/sim.js';
import { createBot, botInput } from '../../src/bot.js';
import { rulesFor } from '../../src/modes.js';
import { WORLD_IDS } from '../../src/world-mech.js';
import { FT } from '../../src/feel.js';
const a = Object.fromEntries(process.argv.slice(2).map((x) => x.split('=')));
if (a.drain) FT.drain = +a.drain; if (a.dmg) FT.dmg = +a.dmg; if (a.late) FT.late = +a.late; for (const k of Object.keys(a)) if (k.startsWith('FT.')) FT[k.slice(3)] = +a[k];
const N = +(a.N || 9), med = (x) => { x = x.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
const out = [];
for (const sk of [0.3, 0.6, 0.95]) { const T = []; let gasp = 0, clutch = 0, starve = 0;
  for (let i = 0; i < N; i++) { const s = createSim({ seed: 5000 + i * 7, rules: rulesFor({ mode: 'classic', stake: 'oak' }), pure: true, world: WORLD_IDS[i % 7], feel: a.feel || 'v3', feelForce: a.feel || 'v3' }); const b = createBot(sk, 11 + i * 3);
    while (!s.dead && s.t < 400) step(s, 1 / 60, botInput(b, s)); T.push(s.t); if (s.feelS) { gasp += s.feelS.gasps; clutch += s.feelS.clutches; if (s.feelS.death && s.feelS.death.cause === 'ran out of sap') starve++; } }
  out.push(`${sk}: ${med(T).toFixed(1)}s (gasp ${gasp} clutch ${clutch} starve ${starve}/${N})`); }
console.log(JSON.stringify(a), out.join(' | '));
// second seed set (telemetry seeds) for robustness
if (a.both) { const out2 = []; for (const sk of [0.3, 0.6, 0.95]) { const T = []; for (const w of WORLD_IDS) for (let i = 0; i < 9; i++) { const seed = 9000 + i * 13 + WORLD_IDS.indexOf(w) * 101; const s = createSim({ seed, rules: rulesFor({ mode: 'classic', stake: 'oak' }), pure: true, world: w, feel: a.feel || 'v3', feelForce: a.feel || 'v3' }); const b = createBot(sk, 21 + i * 5); while (!s.dead && s.t < 400) step(s, 1 / 60, botInput(b, s)); T.push(s.t); } out2.push(`${sk}: ${med(T).toFixed(1)}`); } console.log('   set2', out2.join(' | ')); }
