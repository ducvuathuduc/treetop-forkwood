// Survival per stake and per mode with the three bots (weak 0.3, average 0.6,
// expert 0.95). Asserts the ladder: each stake is harder than the one below,
// the weak bot still gets ~50 s on Sapling, Ancient is not a wall.
// Run: node tests/stakes.mjs   (N=runs per cell, default 60; JSON=1 for raw)
import { createSim, step, summary } from '../src/sim.js';
import { createBot, botInput } from '../src/bot.js';
import { rulesFor } from '../src/modes.js';

const N = Number(process.env.N || 60);
const SK = [0.3, 0.6, 0.95];
const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
function cell(run) {
  const T = [], H = [], S = [];
  for (let i = 0; i < N; i++) {
    const s = createSim({ seed: 5000 + i * 7, rules: rulesFor(run), pure: true });
    const b = createBot(run.skill, 11 + i * 3);
    while (!s.dead && s.t < 400) step(s, 1 / 60, botInput(b, s));
    const u = summary(s); T.push(u.time); H.push(u.height); S.push(u.score);
  }
  return { medT: +med(T).toFixed(1), medH: med(H), tree: Math.round(100 * H.filter((h) => h >= 400).length / N), medS: med(S) };
}
const out = {};
for (const stake of ['sapling', 'oak', 'ancient']) for (const skill of SK) out[`${stake} ${skill}`] = cell({ mode: 'classic', stake, skill });
for (const mode of ['hardcore', 'storm', 'sprint', 'mirror']) for (const skill of SK) out[`${mode} ${skill}`] = cell({ mode, skill });
if (process.env.JSON) console.log(JSON.stringify(out));
console.log('cell              median s  median m  ≥400 m  median pts');
for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(17)} ${String(v.medT).padStart(8)}  ${String(v.medH).padStart(8)}  ${String(v.tree).padStart(5)}%  ${String(v.medS).padStart(10)}`);
ok(out['sapling 0.3'].medT >= 45 && out['sapling 0.3'].medT <= 65, `weak bot on Sapling lasts ~50 s (${out['sapling 0.3'].medT} s)`);
for (const sk of SK) ok(out[`oak ${sk}`].medH <= out[`sapling ${sk}`].medH && out[`ancient ${sk}`].medH <= out[`oak ${sk}`].medH, `bot ${sk}: Sapling ${out[`sapling ${sk}`].medH} m ≥ Oak ${out[`oak ${sk}`].medH} m ≥ Ancient ${out[`ancient ${sk}`].medH} m`);
ok(out['ancient 0.95'].tree >= 15, `Ancient is hard, not a wall: expert reaches the Treetop ${out['ancient 0.95'].tree}% of runs`);
ok(out['oak 0.95'].medS > out['sapling 0.95'].medS * 0.9, 'the Oak multiplier pays back the extra risk for a strong player');
ok(out['sprint 0.95'].medT <= 60.01, 'sprint never runs past its clock');
console.log(fails ? `\n${fails} FAILED` : '\nstake ladder OK');
process.exit(fails ? 1 : 0);
