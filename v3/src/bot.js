// Greedy auto-player. Drives the title-screen attract mode and the headless
// balance tests. `skill` in [0,1]: lower = slower reactions, noisier aim,
// sloppier fork timing.
import { W, FORK_SPREAD, TIP_R, charmReady, PICKUPS } from './sim.js';
import { mulberry32 } from './rng.js';
import { trapBot } from './traps.js'; // P6-TRAPS
import { botPenalty2, botMerge2, anyTrap2Ahead } from './traps2.js'; // V2-MECH
import { rideBot } from './rides.js';
import { skillBot } from './skills.js';

// V2-MECH: penalty for a tip at x from the boss attack in flight
function bossPenalty(s, x, sk) {
  const a = s.boss && s.boss.atk; if (!a) return 0;
  const R = TIP_R + 10;
  if (a.xs && a.t > (a.warn || 1) * (0.55 - sk * 0.45)) for (const lx of a.xs) if (Math.abs(x - lx) < a.lane + R + 6) return 1500;
  if (a.kind === 'volley' && !a.passed && (x < a.gap - a.gapW / 2 + R || x > a.gap + a.gapW / 2 - R)) return 1500;
  if (a.kind === 'ring' && Math.abs(x - a.x) < a.r + R + 4) return 1200;
  if (a.kind === 'plates') for (const p of a.plates) if (!p.broken && Math.abs(x - p.x) < 16 + R + 4) return 1200;
  if (a.kind === 'orbs') for (const o of a.orbs) if (!o.done && Math.abs(x - o.x) < 14 + R + 10) return 900;
  return 0;
}

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
    else if (br.kind === 'slide' && sk > 0.45) {
      // lead the drifting gap: where will it be when we get there?
      const t = (y - br.y) / Math.max(80, s.speed);
      aim = br.base + Math.sin(br.ph + (br.clock + t) * br.w) * br.amp;
    } else {
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
      if (o.lure && sk >= 0.55) continue; // P6-TRAPS: a sharp eye ignores the golden lure
      let dx = Math.abs(o.x - s.cx);
      if (forked) dx = Math.min(Math.abs(o.x - (s.cx - s.spread)), Math.abs(o.x - (s.cx + s.spread)));
      if (dx > dy * 1.2 + 40) continue;
      const val = o.kind === 'dew' ? (s.sap < 60 ? 3 : 1) : o.kind === 'bark' ? 1.5 : o.kind === 'acorn' ? 0.6 : o.kind === 'ride' ? 2.6 + sk : o.kind === 'hollow' ? 1.6 : PICKUPS[o.kind] ? 2.2 : 1; // V2-MECH: ride knots, hollows
      const sc = val * 100 - dy * 0.15 - dx * 0.6;
      if (sc > bs) {
        bs = sc;
        if (forked) best = Math.abs(o.x - (s.cx - s.spread)) < Math.abs(o.x - (s.cx + s.spread)) ? o.x + s.spread : o.x - s.spread;
        else best = o.x;
      }
    }
    if (best != null) aim = best;
  }

  // graft medallions: pick one per gate (a confident forked bot takes both)
  const tok = s.tokens.filter((g) => !g.taken && g.y < y && g.y > y - look);
  if (tok.length && !br) {
    const gate = tok[0].gate;
    if (bot.gate !== gate) { bot.gate = gate; bot.pick = r() < 0.5 ? 0 : 1; }
    const mine = tok.filter((g) => g.gate === gate);
    if (forked && mine.length === 2) aim = (mine[0].x + mine[1].x) / 2;
    else if (mine.length) aim = (mine[Math.min(bot.pick, mine.length - 1)] || mine[0]).x;
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
  // P6-TRAPS: timed rows, twin beetles, lure pockets, twig/sap zones, hedges, crows
  const tb = trapBot(bot, s, aim, sk, r);
  aim = tb.aim;
  // /P6-TRAPS
  // wind compensation
  aim -= s.wind * 0.6 * sk;
  // thorn columns and lightning: straddle them when forked, else go round
  let colAhead = null;
  for (const c of s.columns) {
    if (c.y1 > y || c.y0 < y - look) continue;
    if (!colAhead || c.y0 > colAhead.y0) colAhead = c;
  }
  const t2 = anyTrap2Ahead(s, look) || !!(s.boss && s.boss.atk); // V2-MECH: the 15 new traps and boss attacks
  if (colAhead || t2) {
    // pick the x (for the pair of tips, if forked) that clears every column ahead,
    // weighting the nearest most, and staying close to what we wanted anyway
    const sp = forked ? Math.max(s.spread, FORK_SPREAD * 0.8) : 0, R = TIP_R + 10;
    let bestX = aim, bestC = 1e9;
    for (let cx = 20; cx <= W - 20; cx += 8) {
      if (forked && (cx < 16 + sp || cx > W - 16 - sp)) continue;
      let pen = 0;
      for (const c of s.columns) {
        if (c.y1 > y || c.y0 < y - look) continue;
        const near = 1 + Math.max(0, 1 - (y - c.y0) / look) * 3;
        const xs = forked ? [cx - sp, cx + sp] : [cx];
        for (const tx of xs) if (Math.abs(tx - c.x) < c.hw + R) pen += 1000 * near;
        // alongside a column: never try to cross through it
        if (c.y0 + 30 > y) {
          const cur = forked ? [s.cx - s.spread, s.cx + s.spread] : [s.cx];
          for (let k = 0; k < xs.length; k++) if (Math.sign(xs[k] - c.x) !== Math.sign(cur[k] - c.x)) pen += 3000;
        }
      }
      if (t2) { const xs = forked ? [cx - sp, cx + sp] : [cx]; for (const tx of xs) pen += botPenalty2(s, tx, sk, look) + bossPenalty(s, tx, sk); }
      for (const b of s.beetles) {
        const dy = y - b.y; if (dy < -10 || dy > 260) continue;
        const t = dy / Math.max(60, s.speed); let px = b.x + b.vx * t;
        if (px < 18) px = 36 - px; if (px > W - 18) px = 2 * (W - 18) - px;
        const xs = forked ? [cx - sp, cx + sp] : [cx];
        for (const tx of xs) if (Math.abs(tx - px) < b.r + R + 12) pen += 400;
      }
      const cost = pen + Math.abs(cx - aim) * 0.6 + Math.abs(cx - s.cx) * 0.4;
      if (cost < bestC) { bestC = cost; bestX = cx; }
    }
    aim = bestX - s.wind * 0.3 * sk;
    // steer hard when a column is close (a skilled player commits early)
    const urgent = t2 && (botPenalty2(s, s.cx, sk, 260) + bossPenalty(s, s.cx, sk)) > 0;
    if ((colAhead && y - colAhead.y0 < 320) || urgent) aim = s.cx + (aim - s.cx) * (1 + sk);
  }
  bot.col = colAhead;

  bot.noise = bot.noise * 0.6 + (r() - 0.5) * (1 - sk) * 260;
  bot.aim = Math.max(10, Math.min(W - 10, aim + bot.noise));
  out.targetX = bot.aim;

  // V2-MECH: on a ride the tap is the ride's action; the skill rides the charm button
  if (s.ride) { out.toggle = rideBot(s, sk, r); return out; }
  if (s.skill && skillBot(s, sk, r)) out.charm = true;
  // charm policy: fire it when it would help right now
  if (charmReady(s) && r() < 0.2 + sk * 0.8) {
    const danger = s.beetles.some((b) => b.y < y && b.y > y - 260) || s.brambles.some((b) => b.y < y && b.y > y - 260);
    const sunAhead = s.motes.filter((o) => o.kind === 'sun' && o.y < y && o.y > y - 240).length >= 3;
    if ((s.charm === 'ward' && !s.shield && danger) || (s.charm === 'still' && danger) || (s.charm === 'sun' && sunAhead) || (s.charm === 'roots' && s.sap < 35)) out.charm = true;
  }

  // fork policy
  const singleGateSoon = tb.merge || botMerge2(s, forked ? 330 : 520) || (s.boss && s.boss.atk && s.boss.atk.kind !== 'plates' && s.boss.atk.kind !== 'ring' && s.boss.atk.kind !== 'orbs') || s.brambles.some((b) => (b.kind === 'gate' || b.kind === 'slide') && b.y < y && b.y > y - (forked ? 330 : 520)); // P6-TRAPS: tb.merge
  const colSoon = s.columns.some((c) => c.y1 < y && c.y0 > y - 560);
  const beetleSoon = s.beetles.some((b) => b.y < y && b.y > y - 220);
  if (!forked) {
    if (!singleGateSoon && s.sap > 30 && s.forkCooldown <= 0) {
      const twin = s.motes.some((o) => o.y < y - 40 && o.y > y - 260 && s.motes.some((q) => q !== o && Math.abs(q.y - o.y) < 2 && Math.abs(Math.abs(q.x - o.x) - 2 * FORK_SPREAD) < 4));
      const split = s.brambles.some((b) => b.kind === 'split' && b.y < y - 120 && b.y > y - 420);
      const want = (twin || split) ? 0.35 + sk * 0.6 : colSoon ? 0.15 + sk * 0.7 : 0.01 * sk;
      if (r() < want && !(beetleSoon && sk < 0.5)) { out.toggle = true; bot.forkUntil = s.t + 1.4 + r() * 2.2; }
    }
  } else if ((singleGateSoon || s.sap < 18 || (s.t > bot.forkUntil && !s.brambles.some((b) => b.kind === 'split' && b.y < y && b.y > y - 300))) && !(colSoon && (s.sap > 12 || s.columns.some((c) => c.y1 < y && c.y0 > y - 260)))) {
    if (r() < 0.3 + sk * 0.7) out.toggle = true;
  }
  return out;
}
