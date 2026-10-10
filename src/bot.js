// Greedy auto-player. Drives the title-screen attract mode and the headless
// balance tests. `skill` in [0,1]: lower = slower reactions, noisier aim,
// sloppier fork timing.
import { W, FORK_SPREAD, TIP_R } from './sim.js';
import { mulberry32 } from './rng.js';

export function createBot(skill = 0.7, seed = 1) {
  return {
    skill,
    rng: mulberry32(seed * 7919 + 13),
    aim: W / 2,
    nextThink: 0,
    forkUntil: 0,
    noise: 0,
  };
}

export function botInput(bot, s) {
  const out = { targetX: bot.aim, toggle: false };
  if (s.dead) return out;
  const r = bot.rng;
  const sk = bot.skill;
  if (s.t < bot.nextThink) return out;
  bot.nextThink = s.t + 0.04 + (1 - sk) * 0.22 + r() * 0.05;

  const look = 260 + sk * 240;
  const y = s.cy;
  const forked = s.tips.length === 2;

  // next bramble ahead
  let br = null;
  for (const b of s.brambles) if (b.y < y - 2 && b.y > y - look && (!br || b.y > br.y)) br = b;

  let aim = s.cx;
  if (br) {
    if (forked && br.kind === 'split') aim = br.px;
    else {
      // choose the gap whose centre is nearest
      let best = null, bd = 1e9;
      for (const [a, b] of br.gaps) {
        const c = (a + b) / 2; const d = Math.abs(c - s.cx);
        if (d < bd) { bd = d; best = c; }
      }
      aim = best;
    }
  } else {
    // nearest valuable mote ahead, weighted by vertical distance
    let best = null, bs = -1e9;
    for (const o of s.motes) {
      const dy = y - o.y;
      if (dy < 20 || dy > look) continue;
      let dx = Math.abs(o.x - s.cx);
      if (forked) dx = Math.min(Math.abs(o.x - (s.cx - s.spread)), Math.abs(o.x - (s.cx + s.spread)));
      if (dx > dy * 1.2 + 40) continue;
      const val = o.kind === 'dew' ? (s.sap < 60 ? 3 : 1) : o.kind === 'bark' ? 1.5 : 1;
      const sc = val * 100 - dy * 0.15 - dx * 0.6;
      if (sc > bs) {
        bs = sc;
        if (forked) best = Math.abs(o.x - (s.cx - s.spread)) < Math.abs(o.x - (s.cx + s.spread)) ? o.x + s.spread : o.x - s.spread;
        else best = o.x;
      }
    }
    if (best != null) aim = best;
  }

  // beetle avoidance by predicting where each will be when we reach its row
  for (const b of s.beetles) {
    const dy = y - b.y;
    if (dy < -10 || dy > 140 + sk * 120) continue;
    const t = dy / Math.max(60, s.speed);
    let px = b.x + b.vx * t;
    if (px < 18) px = 36 - px; if (px > W - 18) px = 2 * (W - 18) - px;
    const tipsX = forked ? [s.cx - s.spread, s.cx + s.spread] : [s.cx];
    for (const tx of tipsX) {
      const d = tx - px;
      if (Math.abs(d) < b.r + TIP_R + 26) aim += (d >= 0 ? 1 : -1) * (b.r + TIP_R + 40);
    }
  }
  // frost avoidance
  for (const f of s.frosts) {
    const dy = y - f.y;
    if (dy < -f.r || dy > f.r + 220) continue;
    if (Math.abs(aim - f.x) < f.r + 20) aim = f.x + (aim >= f.x ? 1 : -1) * (f.r + 30);
  }
  // wind compensation
  aim -= s.wind * 0.6 * sk;

  bot.noise = bot.noise * 0.6 + (r() - 0.5) * (1 - sk) * 260;
  bot.aim = Math.max(10, Math.min(W - 10, aim + bot.noise));
  out.targetX = bot.aim;

  // fork policy
  const singleGateSoon = s.brambles.some((b) => b.kind === 'gate' && b.y < y && b.y > y - (forked ? 330 : 520));
  const beetleSoon = s.beetles.some((b) => b.y < y && b.y > y - 220);
  if (!forked) {
    if (!singleGateSoon && s.sap > 30 && s.forkCooldown <= 0) {
      const twin = s.motes.some((o) => o.y < y - 40 && o.y > y - 260 && s.motes.some((q) => q !== o && Math.abs(q.y - o.y) < 2 && Math.abs(Math.abs(q.x - o.x) - 2 * FORK_SPREAD) < 4));
      const split = s.brambles.some((b) => b.kind === 'split' && b.y < y - 120 && b.y > y - 420);
      const want = (twin || split) ? 0.35 + sk * 0.6 : 0.01 * sk;
      if (r() < want && !(beetleSoon && sk < 0.5)) { out.toggle = true; bot.forkUntil = s.t + 1.4 + r() * 2.2; }
    }
  } else if (singleGateSoon || s.sap < 18 || (s.t > bot.forkUntil && !s.brambles.some((b) => b.kind === 'split' && b.y < y && b.y > y - 300))) {
    if (r() < 0.3 + sk * 0.7) out.toggle = true;
  }
  return out;
}
