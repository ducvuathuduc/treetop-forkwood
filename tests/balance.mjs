// Headless auto-playtest: plays many seeded runs with greedy bots of several
// skill levels and reports run length / height distributions.
import { createSim, step, heightM, summary, TUNE } from '../src/sim.js';
if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
import { createBot, botInput } from '../src/bot.js';

const N = Number(process.env.N || 120);
const skills = (process.env.SKILLS || '0.3,0.55,0.75,0.95').split(',').map(Number);
const dt = 1 / 60, CAP = 400;
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const out = {};
for (const sk of skills) {
  const T = [], H = [], C = { hits: [], merges: [], reverts: [], forks: [], score: [] };
  for (let i = 0; i < N; i++) {
    const s = createSim({ seed: 1000 + i, tutorial: true });
    const bot = createBot(sk, i + 1);
    let forks = 0;
    while (!s.dead && s.t < CAP) { step(s, dt, botInput(bot, s)); for (const e of s.events) if (e.type === 'fork') forks++; }
    const sm = summary(s);
    T.push(s.t); H.push(heightM(s)); C.hits.push(s.hits); C.merges.push(s.merges); C.reverts.push(s.reverts); C.forks.push(forks); C.score.push(sm.score);
  }
  out[sk] = { medianT: q(T, .5).toFixed(1), p10T: q(T, .1).toFixed(1), p90T: q(T, .9).toFixed(1), medianH: q(H, .5).toFixed(0), p90H: q(H, .9).toFixed(0), capped: T.filter(t => t >= CAP).length, hits: q(C.hits, .5), forks: q(C.forks, .5), merges: q(C.merges, .5), reverts: q(C.reverts, .5), score: q(C.score, .5) };
}
console.table(out);
