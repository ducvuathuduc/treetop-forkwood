// Forkwood v3 GAME FEEL layer (pure, deterministic, no DOM).
//
// Everything here is behind the run's feel flag: `createSim({ feel: 'v2' })` turns it all
// off (the v2.0 game exactly); the default is 'v3'. Pure runs (daily, weekly, quest,
// duel, race, challenge) always use the default so everyone plays the same game.
// Course hazards are never moved: the layer only re-dresses rest glades (signature
// currents), re-labels split-gate sunlight (choice lanes) and adds its own pickups from
// its own random stream, so the course RNG sequence is unchanged.
//
//   combo meter    chain sunlight, close calls, merges, blooms, foils -> tiers (×1.15 pts each)
//   flow state     N clean seconds at tier >= 1: wider magnet, the world brightens
//   input buffer   a tap during the fork cooldown is kept for 0.2 s, not dropped
//   coyote merge   a merge just after passing a thorn row still counts as just-in-time
//   last gasp      at 0 sap the tip wilts for 1.4 s; catch one sunlight to come back (CLUTCH)
//   signature      every ~200 m a rest glade becomes the world's signature current
//   choice lanes   split gates offer sap (green) on one side, gold seeds (points/combo) on the other
//   finisher       a boss leaves a glowing weak point at the end of phase 3
//   death reading  why the run ended, in one line
import { mulberry32, clamp } from './rng.js';

export const FEEL_DEFAULT = 'v3';
export const FT = {
  comboWin: 2.4,     // s a combo holds without a new link
  comboDecay: 5,     // links lost per second once the window closes
  tiers: [10, 24, 42, 64, 90], // links needed for each tier
  maxTier: 5,
  tierPts: 0.15,     // points per tier
  tierSap: 2,        // sap on every tier up
  flowClean: 14,     // clean seconds to enter flow
  flowTier: 2,       // ...at this combo tier or higher
  flowMagnet: 60,    // flow pulls sunlight in from this far
  turn: 1.15,        // steering response (max turn rate ×)
  bufT: 0.22,        // input buffer window (s)
  coyoteT: 0.18,     // a merge this soon after passing a row still counts as just in time
  gaspT: 1.4,        // last-gasp window (s, sim time)
  gaspCd: 30,        // s between last gasps
  gaspSap: 12,       // sap a clutch catch gives back
  sigFirstM: 85,     // first signature current
  sigEveryM: 205,    // then one every ~30 s of climbing
  sigLen: 980,       // height of a signature current (u)
  sigN: 18,          // nodes on it
  sigBonusSap: 6,
  dmg: 1.5,          // v3 hit damage multiplier (hits are the readable way to lose)
  late: 2.0,         // v3 multiplier on the height part of the drain (tuned)
  drain: 1.08,       // v3 sap drain multiplier (balance knob, tuned with tools/feel/telemetry.mjs)
  laneGoldPts: 3,    // gold seeds pay ×3 points, half sap
  grazeK: 1.3,       // close-call detection is this much wider
};
const LINK = { collect: 1, acorn: 1, dew: 2, near: 3, merge: 3, bloom: 3, straddle: 3, splitpass: 2, trapFoil: 3, 'boss.foil': 3, 'ring.pick': 2, pickup: 2, crowfoil: 3, stormend: 3, 'vehicle.action': 1 };

// the seven signature currents (shape t in [0,1] -> x offset; spacing; look)
export const SIGS = {
  meadow:  { name: 'WIND GUST GLIDE', nameVi: 'Lướt gió', sub: 'ride the gust · steer through the seed stream', col: '#ffe9a8', surge: 50 },
  starry:  { name: 'SWIRL CURRENT', nameVi: 'Dòng xoáy sao', sub: 'follow the swirl as it tightens', col: '#9fc8ff', surge: 55 },
  fresco:  { name: 'FALLING SCAFFOLD', nameVi: 'Giàn giáo rơi', sub: 'climb the rungs before they fall', col: '#f3d2a2', surge: 45 },
  ukiyo:   { name: 'WAVE CREST', nameVi: 'Ngọn sóng', sub: 'surf the crest · drift and snap back', col: '#bfe6ff', surge: 60 },
  lilies:  { name: 'LILY PAD HOP', nameVi: 'Nhảy lá súng', sub: 'hop pad to pad', col: '#c9f2b8', surge: 45 },
  gilded:  { name: 'MOSAIC LIGHT BEAMS', nameVi: 'Tia sáng khảm', sub: 'ride the beams of light', col: '#ffd76a', surge: 55 },
  lacquer: { name: 'LANTERN UPDRAFT', nameVi: 'Gió lồng đèn', sub: 'catch the updraft · lanterns lift you', col: '#ffb27a', surge: 75 },
};
function sigShape(world, t, rr) {
  // returns x offset from centre (u); slopes stay under ~0.6 so a tip can follow (steer cap ~0.9)
  switch (world) {
    case 'starry': { const r = 165 * (1 - 0.7 * t); return r * Math.sin(t * Math.PI * 2.2 + rr * 6); }
    case 'ukiyo': { const ph = (t * 1.6 + rr) % 1; return ph < 0.72 ? -150 + 300 * (ph / 0.72) : 150 - 300 * ((ph - 0.72) / 0.28) * 0.85; }
    case 'lilies': { const i = Math.round(t * (FT.sigN - 1)); return 60 * Math.sin(t * Math.PI * 1.4 + rr * 5) + (i % 2 ? 46 : -46); }
    case 'fresco': { const ph = (t * 1.5 + rr) % 1; return ph < 0.5 ? -120 + 240 * ph * 2 : 120 - 240 * (ph - 0.5) * 2; }
    case 'gilded': { return t < 0.5 ? -150 + 300 * (t / 0.5) * 0.9 : 120 - 260 * ((t - 0.5) / 0.5); }
    case 'lacquer': { return (rr < 0.5 ? -1 : 1) * 110 + 18 * Math.sin(t * Math.PI * 4); }
    default: { return 165 * Math.sin(t * Math.PI * 1.5 + rr * 4); }
  }
}

export function feelInit(s, opts) {
  // feelForce: tests/telemetry only (compare v2 and v3 on the same pure course)
  const v = opts.feelForce || (s.pure ? FEEL_DEFAULT : (opts.feel === 'v2' ? 'v2' : FEEL_DEFAULT));
  s.feel = v;
  if (v !== 'v3') return null;
  return {
    rng: mulberry32((s.seed ^ 0x6c8e9cf5) >>> 0),
    combo: 0, comboT: 0, tier: 0, best: 0, bestTier: 0, tiers: 0,
    clean: 0, flow: 0, flows: 0, flowT: 0,
    buf: 0, lastPass: -9, coyotes: 0, buffered: 0,
    gasp: 0, gaspCd: 0, gasps: 0, clutches: 0,
    sigNext: FT.sigFirstM, sigs: [], sigDone: 0, sigStarted: 0,
    surge: 0, surgeV: 0,
    lanes: 0, gold: 0, fins: {}, finishers: 0,
    hitLog: [], seen: 0, missed: [], sapHit: 0, sapDrain: 0, prevSap: s.sap,
    death: null, drainK: FT.drain, dmgK: FT.dmg, lateK: FT.late,
  };
}

/** Before the step's input is read: steering response and the input buffer. Returns the input to use. */
export function feelInput(s, input, dt) {
  const F = s.feelS;
  if (!F) return input;
  F.buf = Math.max(0, F.buf - dt);
  const canFork = !s.ride && (s.forked || (s.tips.length === 1 && s.forkCooldown <= 0));
  if (input.toggle && !canFork && !s.ride) { F.buf = FT.bufT; return { ...input, toggle: false }; }
  if (!input.toggle && F.buf > 0 && canFork) { F.buf = 0; F.buffered++; s.events.push({ type: 'feel.buffer', x: s.cx, y: s.cy }); return { ...input, toggle: true }; }
  return input;
}
export const turnK = (s) => (s.feelS ? FT.turn : 1);
export const grazeK = (s) => (s.feelS ? FT.grazeK : 1);
export const scoreTierK = (s) => (s.feelS ? 1 + FT.tierPts * s.feelS.tier : 1);
export const surgeV = (s) => (s.feelS && s.feelS.surge > 0 ? s.feelS.surgeV : 0);
/** A thorn row / column was just passed (for the coyote merge). */
export function feelPassed(s) { if (s.feelS) s.feelS.lastPass = s.t; }
/** Merge just-in-time check with coyote time. */
export function feelCoyote(s, jit) {
  const F = s.feelS;
  if (!F || jit) return jit;
  if (s.t - F.lastPass < FT.coyoteT) { F.coyotes++; s.events.push({ type: 'feel.coyote', x: s.cx, y: s.cy }); return true; }
  return false;
}

/** At 0 sap: start the last gasp instead of ending the run. Returns true when the run goes on. */
export function feelGasp(s) {
  const F = s.feelS;
  if (!F || s.R.oneHit || s.R.script || s.demo) return false;
  if (F.gasp > 0) { s.sap = 0.001; return true; }
  if (F.gaspCd > 0 || FT.gaspT <= 0) return false;
  F.gasp = FT.gaspT; F.gaspCd = FT.gaspCd; F.gasps++; s.sap = 0.001;
  s.slowmo = Math.max(s.slowmo, 0.5); s.slowK = 0.5;
  // the nearest sunlight ahead glows so the way back is readable
  let best = null, bd = 1e9;
  for (const o of s.motes) if (o.kind === 'sun' && !o.taken && o.y < s.cy - 40 && o.y > s.cy - 420) { const d = Math.abs(o.x - s.cx) + (s.cy - o.y) * 0.5; if (d < bd) { bd = d; best = o; } }
  if (best) best.gasp = true;
  s.events.push({ type: 'feel.gasp', x: s.cx, y: s.cy, tx: best ? best.x : null, ty: best ? best.y : null });
  return true;
}

/** A rest glade becomes the world's signature current (called by spawnBeat; returns extra length). */
export function feelSigBeat(s, y, len, m, mi0, A) {
  const F = s.feelS;
  if (!F || m < F.sigNext || s.R.script || s.tutorial) return 0;
  F.sigNext = m + FT.sigEveryM;
  // the glade's own sunlight trails make way for the current (pickups and dew stay)
  const glade = s.motes.slice(mi0);
  s.motes.length = mi0;
  for (const o of glade) if (o.kind !== 'sun') s.motes.push(o);
  const r = F.rng, rr = r(), world = s.world, n = FT.sigN, H = FT.sigLen;
  const amp = 170, cx = clamp(W2 + (r() - 0.5) * 80, 60 + amp, 560 - 60 - amp);
  const y0 = y - 40, trail = A.newTrail(s, n);
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = clamp(cx + sigShape(world, t, rr), 40, 520);
    const o = { x, y: y0 - t * H, kind: 'sun', r: world === 'lilies' ? 15 : 12, ph: i * 0.4, taken: false, trail, sig: world, si: i };
    s.motes.push(o); nodes.push(o);
  }
  F.sigs.push({ world, y0: y0 + 120, y1: y0 - H - 20, nodes, started: false, done: false, chain: 0, got: 0 });
  return Math.max(0, H + 160 - len);
}

/** Split gates: one side keeps sap sunlight, the other turns into gold seeds (points, combo). */
export function feelLanes(s, br0) {
  const F = s.feelS;
  if (!F) return;
  for (let i = br0; i < s.brambles.length; i++) {
    const br = s.brambles[i];
    if (br.kind !== 'split' || br.lane) continue;
    br.lane = F.rng() < 0.5 ? -1 : 1; // the gold side
    for (const o of s.motes) if (o.kind === 'sun' && !o.taken && !o.gold && Math.abs(o.y - br.y) < 100 && Math.sign(o.x - br.px) === br.lane && Math.abs(o.x - br.px) < 120) o.gold = true;
  }
}

const W2 = 280;
/** After collisions, before the cull: combo, flow, signature currents, finisher, gasp, death reading. */
export function feelPost(s, dt, A) {
  const F = s.feelS;
  if (!F) return;
  const ev = s.events;
  // gasp: a sunlight caught brings the tip back
  if (F.gaspCd > 0) F.gaspCd = Math.max(0, F.gaspCd - dt);
  if (F.gasp > 0) {
    if (ev.some((e) => e.type === 'collect' || e.type === 'dew')) {
      F.gasp = 0; F.clutches++; s.sap = Math.max(s.sap, 0) + FT.gaspSap; s.invuln = Math.max(s.invuln, 0.8);
      const b = A.addScore(s, 100 * s.mult);
      ev.push({ type: 'feel.clutch', x: s.cx, y: s.cy, bonus: b });
      F.combo += 4; F.comboT = FT.comboWin;
    } else {
      F.gasp = Math.max(0, F.gasp - dt);
      if (s.sap <= 0.001 || ev.some((e) => e.type === 'hit')) s.sap = F.gasp > 0 && !ev.some((e) => e.type === 'hit') ? 0.001 : 0;
      if (F.gasp <= 0 || s.sap <= 0) { F.gasp = 0; s.sap = 0; }
    }
  }
  // combo links and breaks
  let hit = false, link = 0;
  for (const e of ev) {
    if (e.type === 'hit' || e.type === 'revert') hit = true;
    else if (LINK[e.type]) link += LINK[e.type] + (e.type === 'merge' ? Math.min(3, e.staged || 0) : 0);
  }
  // gold seeds: extra points and combo (the lane you chose)
  if (hit) {
    F.hitLog.push({ t: s.t, src: s.lastHitSrc || '' });
    if (F.hitLog.length > 8) F.hitLog.shift();
    if (!(s.pu.goldleaf > 0)) { if (F.combo >= FT.tiers[0]) ev.push({ type: 'feel.break', x: s.cx, y: s.cy, combo: Math.floor(F.combo) }); F.combo = 0; F.tier = 0; }
    F.clean = 0;
    if (F.flow) { F.flow = 0; ev.push({ type: 'feel.flowend', x: s.cx, y: s.cy }); }
  } else F.clean += dt;
  if (link) { F.combo += link; F.comboT = FT.comboWin; }
  else { F.comboT -= dt; if (F.comboT <= 0 && F.combo > 0) F.combo = Math.max(0, F.combo - FT.comboDecay * dt); }
  F.best = Math.max(F.best, Math.floor(F.combo));
  let want = 0; while (want < FT.maxTier && F.combo >= FT.tiers[want]) want++;
  if (want > F.tier) { F.tier = want; F.tiers++; F.bestTier = Math.max(F.bestTier, want); s.sap = Math.min(A.sapMax(s), s.sap + FT.tierSap); ev.push({ type: 'feel.tier', tier: want, k: +(1 + FT.tierPts * want).toFixed(2), x: s.cx, y: s.cy }); }
  else if (want < F.tier && F.combo < FT.tiers[F.tier - 1] - 4) F.tier = want;
  // flow state
  if (!F.flow && F.clean >= FT.flowClean && F.tier >= FT.flowTier) { F.flow = 1; F.flows++; ev.push({ type: 'feel.flow', x: s.cx, y: s.cy }); }
  if (F.flow) {
    F.flowT += dt;
    const reach = FT.flowMagnet;
    for (const o of s.motes) {
      if ((o.kind !== 'sun' && o.kind !== 'acorn') || o.taken || o.y < s.cy - 200 || o.y > s.cy + 20) continue;
      for (const tip of s.tips) { const dx = tip.x - o.x, dy = s.cy - o.y, d = Math.hypot(dx, dy); if (d < reach && d > 1) { const v = Math.min(d, 170 * dt); o.x += (dx / d) * v; o.y += (dy / d) * v; break; } }
    }
  }
  // signature currents
  F.surge = Math.max(0, F.surge - dt);
  for (const sg of F.sigs) {
    if (sg.done) continue;
    if (!sg.started && s.cy < sg.y0) { sg.started = true; F.sigStarted++; const D = SIGS[sg.world] || SIGS.meadow; ev.push({ type: 'feel.sigstart', world: sg.world, name: D.name, nameVi: D.nameVi, sub: D.sub, x: s.cx, y: s.cy }); }
    if (!sg.started) continue;
    let got = 0; for (const o of sg.nodes) if (o.taken) got++;
    if (got > sg.got) { sg.chain += got - sg.got; sg.got = got; const D = SIGS[sg.world] || SIGS.meadow; F.surge = 0.55; F.surgeV = D.surge; ev.push({ type: 'feel.signode', n: got, of: sg.nodes.length, x: s.cx, y: s.cy, world: sg.world }); }
    if (s.cy < sg.y1) {
      sg.done = true;
      const k = sg.got / sg.nodes.length;
      if (k >= 0.7) {
        F.sigDone++;
        const b = A.addScore(s, Math.round(250 * k) * s.mult);
        s.sap = Math.min(A.sapMax(s), s.sap + FT.sigBonusSap);
        F.combo += 6; F.comboT = FT.comboWin;
        ev.push({ type: 'feel.sig', world: sg.world, got: sg.got, of: sg.nodes.length, perfect: sg.got === sg.nodes.length, bonus: b, x: s.cx, y: s.cy });
      } else ev.push({ type: 'feel.sigmiss', world: sg.world, got: sg.got, of: sg.nodes.length, x: s.cx, y: s.cy });
    }
  }
  if (F.sigs.length > 4) F.sigs = F.sigs.filter((g) => !g.done || g.y1 < s.cy + 1200);
  // boss finisher: a weak point glows at the end of phase 3
  if (s.boss && s.boss.sp) {
    const sp = s.boss.sp, p = (sp.y0 - s.cy) / (sp.y0 - sp.y1);
    if (p > 0.84 && !F.fins[sp.i ?? sp.y0]) {
      F.fins[sp.i ?? sp.y0] = true;
      const x = clamp(s.cx + (F.rng() - 0.5) * 160, 70, 490);
      s.motes.push({ x, y: s.cy - 430, kind: 'sun', r: 22, ph: 0, taken: false, fin: s.boss.id, finSkin: s.boss.skin });
      ev.push({ type: 'feel.finready', boss: s.boss.id, x, y: s.cy - 430 });
    }
  }
  // death reading: sunlight passed by, sap lost to hits vs the climb
  for (const e of ev) if (e.type === 'collect') F.missed.push({ t: s.t, got: true });
  for (const o of s.motes) if (o.kind === 'sun' && !o.fseen && !o.taken && o.y > s.cy + 30) { o.fseen = true; F.missed.push({ t: s.t, got: false }); }
  if (F.missed.length > 80) F.missed.splice(0, F.missed.length - 80);
  const dSap = F.prevSap - s.sap;
  if (dSap > 0) { if (hit) F.sapHit += dSap; else F.sapDrain += dSap; }
  F.prevSap = s.sap;
}

/** Called on the step a mote is collected (sim.collect): gold seeds and the finisher. Returns a points multiplier. */
export function feelCollect(s, o, A) {
  const F = s.feelS;
  if (!F) return 1;
  if (o.gold) { F.gold++; F.combo += 2; F.comboT = FT.comboWin; if (!o.laneSaid) { F.lanes++; s.events.push({ type: 'feel.lane', x: o.x, y: o.y, gold: true }); } return FT.laneGoldPts; }
  if (o.fin) {
    F.finishers++;
    const b = A.addScore(s, 500 * s.mult);
    s.sap = Math.min(A.sapMax(s), s.sap + 14);
    F.combo += 8; F.comboT = FT.comboWin;
    if (s.boss) s.boss.finished = true;
    s.events.push({ type: 'feel.finisher', boss: o.fin, skin: o.finSkin, x: o.x, y: o.y, bonus: b });
    return 2;
  }
  return 1;
}
export const feelSapK = (s, o) => (s.feelS && o.gold ? 0.5 : 1);

/** One line on why the run ended (also for the death replay card). */
export function feelDeath(s) {
  const F = s.feelS;
  if (!F) return null;
  const recent = F.hitLog.filter((h) => s.t - h.t < 8);
  const win = F.missed.filter((m) => s.t - m.t < 15);
  const miss = win.filter((m) => !m.got).length;
  const total = win.length;
  const hitShare = F.sapHit / Math.max(1, F.sapHit + F.sapDrain);
  let cause, tip;
  if (s.end === 'hit') { cause = 'one hit'; tip = 'hardcore: any touch ends the tree'; }
  else if (s.won) { cause = 'finish'; tip = ''; }
  else if (recent.length >= 2) { cause = `${recent.length} hits in ${Math.max(1, Math.round(s.t - recent[0].t))} s`; tip = `${uniq(recent.map((h) => nice(h.src))).slice(0, 3).join(', ')} · each hit costs sap and your combo`; }
  else if (recent.length === 1 && miss < total * 0.5) { cause = `hit by ${nice(recent[0].src)}`; tip = 'it tipped a low sap meter over'; }
  else { cause = 'ran out of sap'; tip = total ? `caught ${total - miss} of ${total} sunlight in the last 15 s` : 'sunlight is your sap'; }
  return { cause, tip, miss, total, hits: recent.length, hitShare: Math.round(hitShare * 100), bestCombo: F.best, bestTier: F.bestTier, flows: F.flows, sigs: F.sigDone, clutches: F.clutches };
}
const uniq = (a) => [...new Set(a)];
const NICE = { gate: 'thorns', split: 'thorns', slide: 'sliding thorns', thorn: 'a thorn column', beetle: 'a beetle', frost: 'frost', bolt: 'lightning', cap: 'a honey lure', wall: 'a lure pocket', hedge: 'a gust', boss: 'the boss' };
const nice = (src) => NICE[src] || (src ? src.replace(/[._]/g, ' ') : 'a hazard');
