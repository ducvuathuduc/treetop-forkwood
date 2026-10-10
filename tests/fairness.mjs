// Static fairness check over many seeds: generate the course far ahead (by
// growing a ghost tip straight up) and assert every obstacle is passable.
import { createSim, step, W, TIP_R, FORK_SPREAD, PX_PER_M } from '../src/sim.js';

const SEEDS = Number(process.env.N || 300);
const MAX_LATERAL = 0.62; // reachable x per unit of height between gates (see reachableX)
let problems = 0, gates = 0, splits = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const s = createSim({ seed, tutorial: true, demo: true });
  const seen = new Set();
  const all = [];
  // fly straight up with no collisions by keeping the ghost invulnerable
  while (-s.cy / PX_PER_M < 1200) {
    s.invuln = 10; step(s, 1 / 30, { targetX: W / 2 });
    for (const b of s.brambles) if (!seen.has(b)) { seen.add(b); all.push({ b, beetles: s.beetles.slice(), frosts: s.frosts.slice() }); }
  }
  all.sort((p, q) => q.b.y - p.b.y);
  let prev = null;
  for (const { b, beetles, frosts } of all) {
    if (b.kind === 'gate') gates++; else splits++;
    for (const [a, c] of b.gaps) if (c - a < 2 * TIP_R + 60) { problems++; console.log('narrow gap', seed, b.y, c - a); }
    if (b.kind === 'split') {
      // both lanes must fit a forked pair centred on the pillar
      const [g1, g2] = b.gaps;
      const l = b.px - FORK_SPREAD, r = b.px + FORK_SPREAD;
      if (!(l - TIP_R > g1[0] && l + TIP_R < g1[1] && r - TIP_R > g2[0] && r + TIP_R < g2[1])) { problems++; console.log('split lanes misfit', seed, b.y); }
    }
    for (const be of beetles) if (Math.abs(be.y - b.y) < 40) { problems++; console.log('beetle on bramble', seed, b.y); }
    for (const f of frosts) if (Math.abs(f.y - b.y) < f.r + 10) { problems++; console.log('frost on bramble', seed, b.y); }
    if (prev) {
      const dy = prev.b.y - b.y;
      const gp = prev.b.gaps.map(([a, c]) => (a + c) / 2), gn = b.gaps.map(([a, c]) => (a + c) / 2);
      const best = Math.min(...gp.flatMap((x) => gn.map((y) => Math.abs(x - y))));
      if (best > 80 + dy * MAX_LATERAL + 1 && dy < 700) { problems++; console.log('unreachable gate pair', seed, b.y, best, dy); }
    }
    prev = { b };
  }
}
console.log(`checked ${SEEDS} seeds: ${gates} gates, ${splits} splits, ${problems} problems`);
process.exit(problems ? 1 : 0);
