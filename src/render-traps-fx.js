// Forkwood pass 8: trap, pickup and boost visuals. Drawing only: the trap rules
// live in src/traps.js and the sim in src/sim.js (this file never changes state
// the sim reads, except the presentation fields fx.hitStop and cam.trauma).
//
// Every trap has four readable beats (art bible §2.2, hazard family = dark body
// #1a1216 + coral rim #f0785a, sharp shapes; friendly = round + light glow):
//   idle      a slow living motion so a trap never reads as scenery
//   telegraph ~1 s before it can hurt: coral warning glyph, ground shadow, shake
//   attack    the trap's own move (thorns snap out, door slams, crow dives ...)
//   hit       one shared big reaction: hit-stop, scaled shake, vine flash,
//             impact star + shards, damage number, sap streak to the meter
// plus an avoid / near-miss effect (mint swoosh) that feels as good as a hit
// feels bad.
//
// Events: the sim's own names (hit, revert, near, graze, snap, crow, crowsteal,
// crowfoil, tide, straddle, collect, pickup, shield, shieldbreak) and, when the
// economy pass ships them, trapWarn / trapHit / trapAvoid {kind, x, y, dmg}.
// Missing events are fine: telegraphs are derived from trap state each frame.
//
// Cost: every particle, glyph and crow frame is a cached offscreen sprite
// (drawImage only, no shadowBlur, no per-frame gradients), capped pools.
import { rowSolids, pulseState, doorState, gustState, twinsXs, TRAPS, PULSE, DOOR, GUST, CROW_WARN, TWIG_SNAP } from './traps.js';
import { loadArt, art } from './art.js';
import { drawWallArt, classicSprite, mechApi } from './render-traps.js'; // V2-INT: classic traps in ART's paint

const W = 560, TAU = Math.PI * 2;
const INK = '#1a1216', PAPER = '#fff6e6', CORAL = '#f0785a', CORAL_HOT = '#ffb08f';
const MINT = '#5fd99a', MINT_CORE = '#b8ffd6', GOLD = '#ffc94d', GOLD_HOT = '#fff3c4', CREAM = '#fff1c4';
const RIM = CORAL, BODY = INK;
const FONT = '"Bricolage", "Avenir Next", "Segoe UI", sans-serif';
const DISPLAY = '"Fraunces", Georgia, serif';
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeIn = (t) => t * t;
const vis = (tr, topY, botY) => {
  const lo = tr.y0 ?? tr.y, hi = tr.y1 ?? tr.y;
  return lo > topY - 120 && hi < botY + 120;
};

// ---------------------------------------------------------------- sprite cache
const HAS_DOC = typeof document !== 'undefined';
const SPR = new Map();
/** A cached sprite drawn once at 2x, centred on (0,0) within size w*h (world units). */
function sprite(key, w, h, draw) {
  let c = SPR.get(key);
  if (c) return c;
  if (!HAS_DOC) return null;
  c = document.createElement('canvas');
  c.width = Math.ceil(w * 2); c.height = Math.ceil(h * 2);
  const g = c.getContext('2d');
  g.scale(2, 2); g.translate(w / 2, h / 2); g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g);
  c.hw = w / 2; c.hh = h / 2;
  SPR.set(key, c);
  return c;
}
function blit(ctx, spr, x, y, s = 1, rot = 0, a = 1) {
  if (!spr || a <= 0.01) return;
  ctx.globalAlpha = a;
  if (rot) { ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(spr, -spr.hw * s, -spr.hh * s, spr.hw * 2 * s, spr.hh * 2 * s); ctx.rotate(-rot); ctx.translate(-x, -y); }
  else ctx.drawImage(spr, x - spr.hw * s, y - spr.hh * s, spr.hw * 2 * s, spr.hh * 2 * s);
  ctx.globalAlpha = 1;
}
function softDot(col) {
  return sprite('dot' + col, 64, 64, (g) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 32);
    gr.addColorStop(0, col); gr.addColorStop(0.3, col + 'aa'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(-32, -32, 64, 64);
  });
}
function additive(ctx, col, x, y, r, a) {
  const sp = softDot(col); if (!sp || a <= 0.01) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
// particle sprites
const SPRITES = {
  shard: () => sprite('shard', 22, 22, (g) => {
    g.beginPath(); g.moveTo(-8, 5); g.lineTo(9, -1); g.lineTo(-3, -8); g.closePath();
    g.fillStyle = BODY; g.fill(); g.strokeStyle = RIM; g.lineWidth = 1.8; g.stroke();
  }),
  feather: () => sprite('feather', 30, 14, (g) => {
    g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(-2, -6, 13, -1); g.quadraticCurveTo(0, 5, -13, 0); g.closePath();
    g.fillStyle = BODY; g.fill(); g.strokeStyle = 'rgba(240,120,90,0.8)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(-13, 0); g.lineTo(11, -1); g.strokeStyle = 'rgba(240,120,90,0.5)'; g.lineWidth = 0.8; g.stroke();
  }),
  seed: () => sprite('seed', 18, 18, (g) => {
    g.fillStyle = 'rgba(16,32,27,0.6)'; g.beginPath(); g.arc(0, 0, 6.5, 0, TAU); g.fill();
    g.fillStyle = GOLD; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
    g.fillStyle = GOLD_HOT; g.beginPath(); g.arc(-1, -1.2, 2.3, 0, TAU); g.fill();
  }),
  star: () => sprite('star', 26, 26, (g) => {
    g.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a + Math.PI / 4) * 3, Math.sin(a + Math.PI / 4) * 3); }
    g.closePath(); g.fillStyle = GOLD_HOT; g.fill();
  }),
  mintstar: () => sprite('mintstar', 26, 26, (g) => {
    g.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a + Math.PI / 4) * 3, Math.sin(a + Math.PI / 4) * 3); }
    g.closePath(); g.fillStyle = MINT_CORE; g.fill();
  }),
  drop: () => sprite('drop', 14, 18, (g) => {
    g.beginPath(); g.moveTo(0, -7); g.quadraticCurveTo(5.5, 1, 0, 6); g.quadraticCurveTo(-5.5, 1, 0, -7);
    g.fillStyle = MINT; g.fill(); g.strokeStyle = '#10201b'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = MINT_CORE; g.beginPath(); g.ellipse(-1.4, 1, 1.2, 2.2, 0, 0, TAU); g.fill();
  }),
  sapdrop: () => sprite('sapdrop', 14, 18, (g) => {
    g.beginPath(); g.moveTo(0, -7); g.quadraticCurveTo(5.5, 1, 0, 6); g.quadraticCurveTo(-5.5, 1, 0, -7);
    g.fillStyle = CORAL; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
  }),
  splinter: () => sprite('splinter', 22, 8, (g) => {
    g.beginPath(); g.moveTo(-10, 0); g.lineTo(-2, -2.5); g.lineTo(10, 0); g.lineTo(-2, 2.5); g.closePath();
    g.fillStyle = '#3a2a22'; g.fill(); g.strokeStyle = RIM; g.lineWidth = 1; g.stroke();
  }),
  leaf: () => sprite('leaf', 20, 12, (g) => {
    g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(0, -6, 8, 0); g.quadraticCurveTo(0, 6, -8, 0);
    g.fillStyle = MINT; g.fill(); g.strokeStyle = '#10201b'; g.lineWidth = 1.2; g.stroke();
  }),
  bark: () => sprite('bark', 16, 16, (g) => {
    g.beginPath(); g.moveTo(-6, -4); g.lineTo(5, -6); g.lineTo(6, 4); g.lineTo(-4, 6); g.closePath();
    g.fillStyle = CREAM; g.fill(); g.strokeStyle = '#c98a4a'; g.lineWidth = 1.5; g.stroke();
  }),
  dust: () => softDot('#e9d8c4'),
};
const SP = {};
for (const k in SPRITES) Object.defineProperty(SP, k, { get: () => SPRITES[k]() });

// warning glyph: coral rounded triangle, dark "!" (never glows: danger is matte)
function glyphSprite() {
  return sprite('glyph', 46, 42, (g) => {
    const tri = (r) => { g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 1.04, r * 0.78); g.lineTo(-r * 1.04, r * 0.78); g.closePath(); };
    g.lineJoin = 'round';
    tri(17); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    tri(17); g.lineWidth = 3.5; g.strokeStyle = CORAL; g.stroke(); g.fillStyle = CORAL; g.fill();
    g.fillStyle = INK; g.beginPath(); g.moveTo(-2.6, -7); g.lineTo(2.6, -7); g.lineTo(1.6, 5); g.lineTo(-1.6, 5); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, 9.6, 2.4, 0, TAU); g.fill();
  });
}
/** Telegraph: the glyph pops in with overshoot and throbs; k = 0..1 progress of the warning. */
function warnGlyph(ctx, x, y, k, now, calm) {
  const pop = k < 0.18 ? easeBack(k / 0.18) : 1;
  const beat = calm ? 0 : Math.pow(Math.max(0, Math.sin(now * (9 + k * 10))), 4);
  const s = pop * (1 + 0.14 * beat) * 0.92;
  const wob = calm ? 0 : Math.sin(now * 31) * 0.06 * k;
  // the ring that closes as the hit approaches
  ctx.strokeStyle = `rgba(240,120,90,${(0.35 + 0.45 * k).toFixed(3)})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y + 2, 25, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k)); ctx.stroke();
  blit(ctx, glyphSprite(), x, y, s, wob);
}
/** A soft dark shadow pooled on the ground where something will land. */
function shadow(ctx, x, y, rx, ry, a) {
  ctx.fillStyle = `rgba(26,18,22,${a.toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}
const shakeX = (now, k, seed = 0) => Math.sin(now * 61 + seed) * 2.6 * k + Math.sin(now * 37 + seed * 2) * 1.4 * k;

// ---------------------------------------------------------------- shared FX state
function newFx() { return { last: 0, parts: [], pops: [], rings: [], stars: [], streaks: [], swoosh: [], crows: [], delayed: [], flash: 0, flashX: 0, flashY: 0, edge: 0, chunk: 0, tick: 0 }; }
let FX = newFx();
let CLOCK = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
/** Debug/gallery: swap the FX state and the clock (deterministic stills). */
export function useFx(state, clock) { FX = state || newFx(); if (clock) CLOCK = clock; return FX; }
export { newFx };
export function resetTrapFx() { FX = newFx(); }

const MAXP = 160;
function part(o) { if (FX.parts.length < MAXP) FX.parts.push(o); else FX.parts[(FX.tick++) % MAXP] = o; }
function burst(kind, x, y, n, sp, life, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = (opt.dir ?? 0) + (opt.spread ?? TAU) * (opt.spread ? (Math.random() - 0.5) : Math.random());
    const v = sp * (0.45 + Math.random() * 0.75);
    part({ k: kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opt.up || 0), g: opt.g ?? 0, drag: opt.drag ?? 2.4, life: life * (0.7 + Math.random() * 0.5), max: life, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * (opt.spin ?? 14), s: (opt.s ?? 1) * (0.7 + Math.random() * 0.5), add: opt.add, to: opt.to });
  }
}
function ring(x, y, r, col, life, w = 4) { FX.rings.push({ x, y, r, col, life, max: life, w }); }
function pop(x, y, text, col, size, life = 1.1, sub = '') { FX.pops.push({ x, y, text, sub, col, size, life, max: life, vy: -46, rot: (Math.random() - 0.5) * 0.12 }); }

// per-trap animation memory (previous state, transition times)
const MEM = new WeakMap();
const mem = (tr) => { let m = MEM.get(tr); if (!m) { m = {}; MEM.set(tr, m); } return m; };

// shake added on top of main.js's own (which is 12/26 trauma for a hit) by source
const SHAKE = { tide: 0.32, door: 0.2, pulse: 0.16, cap: 0.14, wall: 0.12, hedge: 0.12, beetle: 0.12, twig: 0.1, crow: 0.26, gate: 0.08, split: 0.08, bolt: 0.2,
  // V3.1: the 15 v2 mechanics get their own weight (heavy slams shake more, stings less)
  cone: 0.2, icicle: 0.22, jaws: 0.24, pendulum: 0.22, seesaw: 0.18, candy: 0.26, strangle: 0.18, pecker: 0.16, hornets: 0.12, bats: 0.14, beam: 0.16, vortex: 0.18, embers: 0.08, web: 0.06, spores: 0.06 };

// ---------------------------------------------------------------- events
/** Read this frame's sim events once (marks them) and start their effects. */
function consume(R, s, fx, cam, ui) {
  if (!s.events || !s.events.length) return;
  // main.js floats a small text for these; our big damage number replaces it
  if (fx && fx.floaters && fx.floaters.length && s.events.some((e) => !e._tfx && (e.type === 'hit' || e.type === 'revert' || e.type === 'crowsteal'))) {
    fx.floaters = fx.floaters.filter((f) => !(f.life > f.max - 0.05 && /(sap|^reverted|^crow stole|^crow!)/.test(f.text)));
  }
  const loud = !!(ui && ui.hud) && !(ui && ui.calm);
  for (const e of s.events) {
    if (e._tfx) continue;
    e._tfx = 1;
    switch (e.type) {
      case 'hit': case 'trapHit':
        if (e.type === 'trapHit' && e.effect === 'drain') { ring(e.x, e.y, 70, CORAL, 0.45, 4); pop(e.x + 36, e.y - 30, 'DRAIN', CORAL_HOT, 22, 0.9); streak(R, e.x, e.y, 5, CORAL); FX.chunk = 1; break; }
        if (e.type === 'trapHit' && (e.effect === 'shield' || e.effect === 'cut' || s.events.some((o) => o.type === 'hit' || o.type === 'revert' || o.type === 'shieldbreak'))) break; // covered
        impact(R, s, e.x, e.y, e.dmg, e.src || e.kind, fx, cam, loud, e.fatal ? 'ONE HIT' : null);
        break;
      case 'revert':
        impact(R, s, e.x, e.y, 8, e.src, fx, cam, loud, 'BRANCH LOST');
        break;
      case 'near': case 'trapAvoid': nearFx(e.x, e.y, e.n || 1); break;
      case 'graze': ring(e.x, e.y, 70, GOLD, 0.45, 3); burst('star', e.x, e.y, 5, 160, 0.5, { s: 0.7 }); break;
      case 'snap': {
        // the twig breaks: splinters + the two halves are animated by the trap draw
        burst('splinter', e.x, e.y, 14, 260, 0.9, { g: 420, spin: 20 });
        burst('dust', e.x, e.y, 6, 70, 0.7, { s: 0.6 });
        break;
      }
      case 'crow': { const m = { t0: CLOCK() }; FX.crowWarn = m; break; }
      case 'crowsteal': {
        // wall-clock dive: 0.17 s swoop, then the impact (hit-stop, shake ...) lands as the beak hits
        const c = s.traps && s.traps.find((t) => t.kind === 'crow' && t.st === 'stole' && !mem(t).anim);
        const from = c ? mem(c).last : null;
        const a = { kind: 'steal', t0: CLOCK(), x: e.x, y: e.y, fx0: from ? from.x : e.x - 90, fy0: from ? from.y : e.y - 140, lost: e.lost || 0, side: e.x < W / 2 ? 1 : -1, hit: false };
        if (c) mem(c).anim = a;
        FX.crows.push(a);
        FX.delayed.push({ at: CLOCK() + 0.17, run: () => { impact(R, s, e.x, e.y, e.sap ?? null, 'crow', fx, cam, loud, null, e.lost || 0); a.hit = true; } });
        break;
      }
      case 'crowfoil': {
        const c = s.traps && s.traps.find((t) => t.kind === 'crow' && t.st === 'foiled' && !mem(t).anim);
        const from = c ? mem(c).last : null;
        const a = { kind: 'foil', t0: CLOCK(), x: from ? from.x : e.x, y: from ? from.y : e.y - 120, side: e.x < W / 2 ? 1 : -1 };
        if (c) mem(c).anim = a;
        FX.crows.push(a);
        burst('feather', a.x, a.y, 9, 180, 1.3, { g: 60, drag: 1.6, spin: 6 });
        ring(a.x, a.y, 46, PAPER, 0.4, 3);
        nearFx(e.x, e.y, 2);
        break;
      }
      case 'tide': ring(s.cx, s.cy + 240, 140, CORAL, 0.6, 3); break;
      case 'straddle': nearFx(e.x, e.y, 3); burst('mintstar', e.x, e.y, 8, 200, 0.6); break;
      case 'collect': collectFx(e.x, e.y, e.chain || 1); break;
      case 'pickup': pickupFx(e.kind, e.x, e.y); break;
      case 'shield': ring(e.x, e.y, 60, CREAM, 0.5, 4); burst('bark', e.x, e.y, 8, 180, 0.6); FX.bubbleIn = CLOCK(); break;
      case 'shieldbreak':
        ring(e.x, e.y, 80, CREAM, 0.5, 5); ring(e.x, e.y, 46, PAPER, 0.3, 3);
        burst('bark', e.x, e.y, 16, 320, 0.8, { g: 300 });
        FX.flash = 0.16; FX.flashX = e.x; FX.flashY = e.y;
        pop(e.x, e.y - 46, 'BLOCKED', CREAM, 24, 0.9);
        break;
      case 'trapWarn':
        // a quiet coral ping where a trap will act (the trap's own glyph does the loud part)
        if (!e.hazard && e.x != null && e.y != null) ring(e.x, e.y, 44, CORAL, 0.5, 2.5);
        break;
    }
  }
}

/** The shared HIT reaction. */
function impact(R, s, x, y, dmg, src, fx, cam, loud, label, lostSeeds) {
  // hit-stop 60-90 ms (main.js already holds 90 ms on 'hit'; we top up for crow)
  if (loud && fx) fx.hitStop = Math.max(fx.hitStop || 0, src === 'crow' ? 0.085 : 0.07);
  if (loud && cam) cam.trauma = Math.min(1, (cam.trauma || 0) + (SHAKE[src] ?? 0.1) + (dmg ? Math.min(0.12, dmg / 260) : 0));
  // v1.0: a second hit inside 0.7 s gets a soft flash, not another white-out
  const tNow = CLOCK(), rep = tNow - (FX.lastHitT ?? -9) < 0.7; FX.lastHitT = tNow;
  FX.flash = rep ? Math.max(FX.flash, 0.1) : 0.22; FX.flashRep = rep; FX.flashX = x; FX.flashY = y;
  FX.edge = rep ? Math.max(FX.edge, 0.55) : 1;
  FX.stars.push({ x, y, life: 0.32, max: 0.32, rot: Math.random() * TAU, col: src === 'crow' ? GOLD : CORAL });
  ring(x, y, 92, CORAL, 0.5, 6); ring(x, y, 52, PAPER, 0.28, 3);
  burst('shard', x, y, 12, 380, 0.75, { g: 520, spin: 18 });
  burst('leaf', x, y, 6, 220, 1.0, { g: 260, spin: 10 });
  if (lostSeeds != null) {
    // seeds torn off the vine, flung up toward the fleeing crow
    burst('seed', x, y, Math.max(5, Math.min(14, lostSeeds * 2)), 300, 0.9, { dir: -Math.PI / 2, spread: 1.6, g: 380, up: 90 });
    if (dmg) pop(x, y - 54, `−${Math.round(dmg)}`, CORAL_HOT, 42, 1.25, lostSeeds ? `SAP · ${lostSeeds} SUNLIGHT STOLEN` : 'SAP · PECKED');
    else pop(x, y - 54, lostSeeds ? `−${lostSeeds}` : 'PECKED', GOLD, 40, 1.25, lostSeeds ? 'SUNLIGHT STOLEN' : '');
    FX.chunk = 1; streak(R, x, y, 5, GOLD); if (dmg) streak(R, x, y, 6, CORAL);
  } else {
    if (dmg != null) pop(x, y - 52, dmg ? `−${dmg}` : (label || 'HIT'), CORAL_HOT, dmg ? 42 : 30, 1.2, dmg ? 'SAP' : '');
    else if (label) pop(x, y - 52, label, CORAL_HOT, 26, 1.1);
    if (dmg || label) { FX.chunk = 1; streak(R, x, y, dmg ? Math.min(12, 4 + dmg / 4) : 5, CORAL); }
  }
}
/** Sap drain streak: drops fly from the vine (world) to the sap meter (screen). */
function streak(R, wx, wy, n, col) {
  if (!R || !R.toScreen) return;
  const p = R.toScreen(wx, wy), t0 = CLOCK();
  for (let i = 0; i < n; i++) FX.streaks.push({ sx: p.x, sy: p.y, cx: p.x + (Math.random() - 0.5) * 140, cy: p.y - 40 - Math.random() * 90, t0: t0 + i * 0.03, dur: 0.42 + Math.random() * 0.12, col });
}
function nearFx(x, y, n) {
  const t0 = CLOCK();
  FX.swoosh.push({ x, y, t0, dur: 0.42, side: -1, n }, { x, y, t0, dur: 0.42, side: 1, n });
  burst('mintstar', x, y, 4 + Math.min(4, n), 200, 0.5, { s: 0.65 });
  ring(x, y, 48 + n * 6, MINT_CORE, 0.32, 2.5);
}
function collectFx(x, y, chain) {
  ring(x, y, 30 + Math.min(20, chain * 3), GOLD_HOT, 0.32, 3);
  burst('star', x, y, 4, 150, 0.42, { s: 0.6, spin: 8 });
  FX.glints = FX.glints || [];
  FX.glints.push({ x, y, t0: CLOCK() });
  if (FX.glints.length > 12) FX.glints.shift();
}
function pickupFx(kind, x, y) {
  const col = kind === 'rush' ? MINT_CORE : kind === 'ink' ? GOLD : CREAM;
  ring(x, y, 110, col, 0.6, 5); ring(x, y, 60, PAPER, 0.35, 3);
  burst(kind === 'rush' ? 'mintstar' : 'star', x, y, 14, 300, 0.7, { s: 0.8 });
  FX.flash = 0.14; FX.flashX = x; FX.flashY = y;
}

function stepFx(dt) {
  const now = CLOCK();
  for (let i = FX.delayed.length - 1; i >= 0; i--) if (now >= FX.delayed[i].at) { const d = FX.delayed[i]; FX.delayed.splice(i, 1); d.run(); }
  for (const p of FX.parts) {
    p.life -= dt; p.vy += p.g * dt; const dr = 1 - Math.min(0.9, p.drag * dt);
    p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.to) { const k = Math.min(1, dt * 7); p.x += (p.to.x - p.x) * k; p.y += (p.to.y - p.y) * k; }
  }
  if (FX.parts.length) FX.parts = FX.parts.filter((p) => p.life > 0);
  for (const r of FX.rings) r.life -= dt;
  if (FX.rings.length) FX.rings = FX.rings.filter((r) => r.life > 0);
  for (const r of FX.stars) r.life -= dt;
  if (FX.stars.length) FX.stars = FX.stars.filter((r) => r.life > 0);
  for (const p of FX.pops) { p.life -= dt; p.y += p.vy * dt; p.vy *= 1 - Math.min(0.9, dt * 2.2); }
  if (FX.pops.length) FX.pops = FX.pops.filter((p) => p.life > 0);
  if (FX.swoosh.length) FX.swoosh = FX.swoosh.filter((w) => now - w.t0 < w.dur);
  if (FX.streaks.length) FX.streaks = FX.streaks.filter((w) => now - w.t0 < w.dur);
  if (FX.crows.length) FX.crows = FX.crows.filter((c) => now - c.t0 < 2.2);
  FX.flash = Math.max(0, FX.flash - dt);
  FX.edge = Math.max(0, FX.edge - dt * 2.6);
  FX.chunk = Math.max(0, FX.chunk - dt * 2.2);
}

// ---------------------------------------------------------------- crow sprites
// assets/art/fx-crow.webp: 6 flight frames (anchor = beak tip) + 5 perch frames
// (rest, look, caw, crouch, take-off; anchor = feet). Made for Forkwood with an
// image model (see CREDITS.md). Loaded lazily the first time a crow is near.
const CROW = {
  fly: [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 152, y: 0, w: 152, h: 155, ax: 147, ay: 84 })),
  perch: [0, 1, 2, 3, 4].map((i) => ({ x: i * 179, y: 155, w: 179, h: 108, ax: 74, ay: 106 })),
  scale: 0.5, // atlas px -> world units (frame art was packed at 0.38 of a 1408 px sheet)
};
const FLAP = [0, 1, 2, 3, 4, 3, 2, 1]; // ping-pong wing cycle
let crowAsked = false;
function crowImg() { if (!crowAsked) { crowAsked = true; loadArt('fx-crow'); } return art('fx-crow'); }
/** Draw a crow frame. kind 'fly'|'perch', facing 1 = right. Returns false if not loaded. */
function crowFrame(ctx, kind, i, x, y, facing, s = 1, rot = 0, a = 1) {
  // V2-INT: the world's painted crow (meadow crow, starry flock, fresco dove, heron, egret...) on the WebGL path
  if (R_GL && CUR_S) { const S = classicSprite(CUR_S, 'crow'), M = mechApi(); if (S && M) { const n = S.e.rects ? S.e.rects.length - (S.e.warnFrames || []).length : 1; M.blitSprite(ctx, S, kind === 'perch' ? 0 : Math.min(Math.max(0, n - 1), 1 + (i % Math.max(1, n - 1))), x, y - 20 * s, 78 * s, 78 * s, { flip: facing, rot, alpha: a }); return true; } }
  const im = crowImg();
  if (!im) return false;
  const f = CROW[kind][i], k = CROW.scale * s;
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(facing * k, k); ctx.globalAlpha = a;
  ctx.drawImage(im, f.x, f.y, f.w, f.h, -f.ax, -f.ay, f.w, f.h);
  ctx.restore(); ctx.globalAlpha = 1;
  return true;
}
// fallback (code) crow, also cached per flap frame
function crowShape(ctx, x, y, s, flap, facing = 1) {
  const fi = Math.round((flap * 0.5 + 0.5) * 5);
  const spr = sprite('crowc' + fi, 70, 50, (g) => {
    const fl = fi / 5 * 2 - 1;
    g.fillStyle = INK;
    g.beginPath(); g.ellipse(0, 0, 16, 9, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(14, -6, 7, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(19, -7); g.lineTo(29, -4); g.lineTo(19, -2); g.closePath(); g.fillStyle = CORAL; g.fill();
    g.fillStyle = INK;
    g.beginPath(); g.moveTo(-4, -3); g.lineTo(-22, -6 - fl * 14); g.lineTo(6, -6); g.closePath(); g.fill();
    g.strokeStyle = CORAL; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-22, -6 - fl * 14); g.lineTo(6, -6); g.stroke();
    g.beginPath(); g.moveTo(-14, 0); g.lineTo(-28, 6); g.lineTo(-14, 5); g.closePath(); g.fill();
    g.fillStyle = CORAL; g.beginPath(); g.arc(16, -7, 1.8, 0, TAU); g.fill();
  });
  ctx.save(); ctx.translate(x, y); ctx.scale(facing * s, s); blit(ctx, spr, 0, 0); ctx.restore();
}
/** A flying crow centred near its body; t drives the wing cycle. */
function flyingCrow(ctx, x, y, facing, t, s = 1, rot = 0, speed = 14) {
  const i = FLAP[Math.floor(t * speed) % FLAP.length];
  // frames are anchored at the beak; shift so (x,y) is the body
  if (!crowFrame(ctx, 'fly', i, x + facing * 34 * s * Math.cos(rot), y - 4 * s + facing * 34 * s * Math.sin(rot), facing, s, rot)) crowShape(ctx, x, y, 1.15 * s, Math.sin(t * speed * 0.8), facing);
}

// ---------------------------------------------------------------- small drawing helpers
function thornRow(R, ctx, y, solids, seed) {
  if (solids.length) R.drawBramble(ctx, { y, solids, gaps: [], kind: 'gate', seed });
}
function spikeRow(ctx, a, b, y, k, jx, flash) {
  // a row of hooked coral-rimmed spikes growing out of a dark rail; k 0..1
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = a + 8; x < b - 4; x += 15) {
    const up = (Math.floor(x / 15) % 2) ? -1 : 1, h = 22 * k * (0.8 + 0.2 * hash(x));
    ctx.moveTo(x - 4.5 + jx, y); ctx.quadraticCurveTo(x + jx, y + up * h * 0.6, x + 2 + jx, y + up * h); ctx.lineTo(x + 4.5 + jx, y); ctx.closePath();
  }
  ctx.fillStyle = BODY; ctx.fill();
  ctx.strokeStyle = flash ? CORAL_HOT : RIM; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.lineCap = 'round';
  ctx.strokeStyle = RIM; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(a + 4 + jx, y); ctx.lineTo(b - 4 + jx, y); ctx.stroke();
  ctx.strokeStyle = BODY; ctx.lineWidth = 4.5; ctx.stroke();
}
function label(ctx, x, y, text) {
  ctx.font = `600 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 26;
  ctx.fillStyle = 'rgba(10,16,22,0.5)'; roundRect(ctx, x - w / 2, y - 15, w, 30, 15); ctx.fill();
  ctx.strokeStyle = 'rgba(240,120,90,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = PAPER; ctx.fillText(text, x, y + 1);
  ctx.textBaseline = 'alphabetic';
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** How close the vine tip is to a band [y0 (bottom) .. y1 (top)]: 0 far .. 1 at its edge. */
const approach = (s, yb, dist = 220) => clamp01(1 - (s.cy - yb) / dist);
const tipIn = (s, x0, x1, y0, y1) => s.tips.some((t) => t.x > x0 && t.x < x1) && s.cy < y0 && s.cy > y1;

// ---------------------------------------------------------------- traps (under the tree)
/** Under the tree: every trap body, idle motion, telegraph and attack. */
export function drawTraps(R, ctx, s, now, topY, botY, calm, fx, cam, ui) {
  R_GL = !!(R && R.gl); CUR_S = s;
  const wall = CLOCK();
  const dt = Math.min(1 / 20, Math.max(0, wall - (FX.last || wall)));
  FX.last = wall;
  stepFx(fx && fx.hitStop > 0 ? dt * 0.15 : dt);
  consume(R, s, fx, cam, ui || { hud: true, calm });
  if (!s.traps || !s.traps.length) return;
  for (const o of s.motes) if (o.lure && !o.taken && o.y > topY - 30 && o.y < botY + 30) {
    // the lure: too-perfect sunlight (a warmer, wider halo than honest seeds)
    additive(ctx, GOLD, o.x, o.y, 30 + 3 * Math.sin(now * 6 + o.ph), 0.35);
  }
  for (const tr of s.traps) {
    if (tr.kind === 'crow' && !crowAsked) crowImg(); // lazy: fetch the crow atlas once a crow is spawned ahead
    if (!vis(tr, topY, botY)) continue;
    switch (tr.kind) {
      case 'twig': drawTwig(ctx, s, tr, now, calm); break;
      case 'sap': drawSap(ctx, s, tr, now, calm); break;
      case 'pulse': drawPulse(R, ctx, s, tr, now, calm); break;
      case 'door': drawDoor(R, ctx, s, tr, now, calm); break;
      case 'cap': drawCap(R, ctx, s, tr, now, calm); break;
      case 'wall': case 'hedge': drawWall(ctx, s, tr, now, calm); break;
      case 'gust': drawGust(ctx, s, tr, now, calm); break;
      case 'twins': drawTwins(R, ctx, s, tr, now, calm); break;
      case 'tide': drawTide(ctx, s, tr, now, botY, calm); break;
      case 'crow': drawCrowTrap(ctx, s, tr, now, calm); break;
      case 'label': {
        if (calm && s.cy < tr.y - 400) break;
        label(ctx, W / 2, tr.y - 10, tr.name || (TRAPS[tr.id] || {}).name || tr.id); // V2-MECH: world names
        break;
      }
    }
  }
}

function drawTwig(ctx, s, tr, now, calm) {
  const w = tr.x1 - tr.x0, h = tr.y0 - tr.y1, cx = (tr.x0 + tr.x1) / 2, k = Math.min(1, tr.t / TWIG_SNAP);
  const m = mem(tr);
  if (tr.snapped) {
    // attack: the twig breaks in two and the halves fall away, spinning
    const u = Math.max(0, s.t - (tr.snapT || 0));
    if (u > 1.2) return;
    const a = 1 - u / 1.2;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(cx + side * (w * 0.18 + u * 60), tr.y1 + h * (side < 0 ? 0.3 : 0.7) + u * u * 500);
      ctx.rotate(side * u * 3.2); ctx.globalAlpha = a;
      twigBody(ctx, 0, -h * 0.22, 0, h * 0.22, 0.2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    return;
  }
  // idle: a brittle twig bridging the zone, creaking in the wind; a dashed danger frame
  const sway = calm ? 0 : Math.sin(now * 1.6 + tr.x0) * 2;
  const jx = calm ? 0 : shakeX(now, k * 1.4, tr.x0);
  ctx.fillStyle = `rgba(26,18,22,${(0.2 + 0.12 * k).toFixed(3)})`; roundRect(ctx, tr.x0, tr.y1, w, h, 14); ctx.fill();
  ctx.strokeStyle = `rgba(240,120,90,${(0.55 + 0.4 * k).toFixed(3)})`; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -now * 12; ctx.stroke(); ctx.setLineDash([]);
  twigBody(ctx, cx + sway + jx, tr.y0 - 6, cx - sway + jx, tr.y1 + 6, k);
  if (k > 0) {
    // telegraph: it trembles, splinters fly and the glyph counts down to the snap
    if (!calm && Math.random() < 0.35) part({ k: 'splinter', x: cx + (Math.random() - 0.5) * 20, y: s.cy - 10, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 60, g: 400, drag: 1, life: 0.5, max: 0.5, rot: Math.random() * TAU, vr: 10, s: 0.6 });
    warnGlyph(ctx, cx, s.cy - 70, k, now, calm);
  } else if (approach(s, tr.y0, 160) > 0) {
    warnGlyph(ctx, cx, tr.y0 - 26, 0.2 + 0.0 * approach(s, tr.y0, 160), now, true);
  }
  m.k = k;
}
function twigBody(ctx, x0, y0, x1, y1, k) {
  // a dark knotted stick with a coral crack that widens with k
  ctx.lineCap = 'round';
  ctx.strokeStyle = RIM; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = BODY; ctx.lineWidth = 7.5; ctx.stroke();
  const dx = x1 - x0, dy = y1 - y0;
  ctx.strokeStyle = BODY; ctx.lineWidth = 4;
  for (let i = 1; i < 4; i++) { const u = i / 4, x = x0 + dx * u, y = y0 + dy * u, d = i % 2 ? 1 : -1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * 16, y - 12); ctx.stroke(); }
  // the crack, mid-length
  const mx = x0 + dx * 0.5, my = y0 + dy * 0.5, cw = 4 + k * 9;
  ctx.strokeStyle = k > 0 ? CORAL_HOT : RIM; ctx.lineWidth = 1.6 + k * 2.6;
  ctx.beginPath(); ctx.moveTo(mx - cw, my - 2); ctx.lineTo(mx - cw * 0.3, my + 3); ctx.lineTo(mx + cw * 0.2, my - 3); ctx.lineTo(mx + cw, my + 2); ctx.stroke();
}

function drawSap(ctx, s, tr, now, calm) {
  const w = tr.x1 - tr.x0, h = tr.y0 - tr.y1, cx = (tr.x0 + tr.x1) / 2, m = mem(tr);
  const near = approach(s, tr.y0, 200) * (s.cy > tr.y1 ? 1 : 0);
  const on = tr.on;
  m.on = on ? Math.min(1, (m.on || 0) + 0.12) : Math.max(0, (m.on || 0) - 0.06);
  const k = m.on;
  // body: withered bark patch, breathing
  const br = calm ? 0 : Math.sin(now * 2.4 + cx) * 0.03;
  ctx.fillStyle = `rgba(26,18,22,${(0.38 + 0.18 * k + br).toFixed(3)})`;
  roundRect(ctx, tr.x0, tr.y1, w, h, 22); ctx.fill();
  ctx.strokeStyle = `rgba(240,120,90,${(0.45 + 0.25 * near + 0.3 * k).toFixed(3)})`; ctx.lineWidth = 2.5; ctx.stroke();
  // veins: branching coral lines that brighten as you approach and pulse while feeding
  ctx.lineCap = 'round';
  const pulse = 0.5 + 0.5 * Math.sin(now * (3 + 9 * k));
  ctx.strokeStyle = `rgba(240,120,90,${(0.22 + 0.3 * near + 0.4 * k * pulse).toFixed(3)})`; ctx.lineWidth = 2 + k * 1.5;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = tr.x0 + 18 + hash(i + tr.x0) * (w - 36);
    let yy = tr.y0 - 10, xx = x; ctx.moveTo(xx, yy);
    for (let j = 1; j < 6; j++) { yy -= h / 6; xx = x + Math.sin(j * 1.7 + i) * 14; ctx.lineTo(xx, yy); }
  }
  ctx.stroke();
  // idle: slow ooze drips falling through the patch
  for (let i = 0; i < 6; i++) {
    const x = tr.x0 + 14 + hash(i + tr.x0) * (w - 28), y = tr.y1 + ((now * (34 + 40 * k) + hash(i * 3) * h) % h);
    blit(ctx, SP.sapdrop, x, y, 0.75, 0, 0.6);
  }
  // telegraph: glyph at the mouth of the patch as the vine comes up to it
  if (near > 0 && !on && s.cy > tr.y0 - 4 && s.tips.some((t) => t.x > tr.x0 - 30 && t.x < tr.x1 + 30)) warnGlyph(ctx, cx, tr.y0 + 4, near, now, calm);
  // attack: tendrils latch onto each tip inside and drink: mint drops are sucked out
  if (k > 0.02) {
    for (const t of s.tips) {
      if (!(t.x > tr.x0 - 10 && t.x < tr.x1 + 10)) continue;
      ctx.strokeStyle = `rgba(26,18,22,${(0.85 * k).toFixed(3)})`; ctx.lineWidth = 5;
      for (const sd of [-1, 1]) {
        const ex = sd < 0 ? tr.x0 : tr.x1, wig = calm ? 0 : Math.sin(now * 14 + sd) * 8;
        ctx.beginPath(); ctx.moveTo(ex, s.cy + 30); ctx.quadraticCurveTo((ex + t.x) / 2 + wig, s.cy - 30, t.x + sd * 6, s.cy); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(240,120,90,${(0.9 * k).toFixed(3)})`; ctx.lineWidth = 2; ctx.stroke();
      if (on && !calm && Math.random() < 0.6) part({ k: 'drop', x: t.x + (Math.random() - 0.5) * 10, y: s.cy, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 40, g: 0, drag: 0.5, life: 0.5, max: 0.5, rot: 0, vr: 0, s: 0.8, to: { x: cx, y: tr.y0 - h * 0.35 } });
      if (on) {
        m.tick = (m.tick || 0) + 1;
        if (m.tick % 24 === 1) { pop(t.x + 30, s.cy - 20, '−sap', CORAL_HOT, 20, 0.7); FX.chunk = Math.max(FX.chunk, 0.6); }
      }
    }
  }
}

function drawPulse(R, ctx, s, tr, now, calm) {
  const seed = tr.y * 0.01, m = mem(tr);
  m.st = m.st || {};
  for (const g of tr.segs) {
    const st = pulseState(tr, g[2], tr.clock), key = g[0];
    const prev = m.st[key]; m.st[key] = st;
    if (prev === 'warn' && st === 'out') { // attack: the thorns slam out
      const mx = (g[0] + g[1]) / 2;
      burst('dust', mx, tr.y, 5, 120, 0.5, { s: 0.6 }); burst('shard', mx, tr.y, 4, 200, 0.4, { g: 400, s: 0.6 });
      m['slam' + key] = now;
    }
    if (st === 'out') {
      const sl = now - (m['slam' + key] ?? -9);
      const kick = sl < 0.15 ? 1 + 0.35 * (1 - sl / 0.15) : 1;
      if (kick > 1) { ctx.save(); ctx.translate((g[0] + g[1]) / 2, tr.y); ctx.scale(1, kick); ctx.translate(-(g[0] + g[1]) / 2, -tr.y); }
      thornRow(R, ctx, tr.y, [[g[0], g[1]]], seed + g[0]);
      if (kick > 1) ctx.restore();
      if (sl < 0.5) {
        // attack accent: full-length spikes stab out of the rail and retract into the bramble
        const a = 1 - sl / 0.5;
        spikeRow(ctx, g[0], g[1], tr.y, 1.25 * a + 0.2, 0, true);
        ctx.fillStyle = `rgba(240,120,90,${(0.22 * a).toFixed(3)})`; ctx.fillRect(g[0] + 4, tr.y - 34, g[1] - g[0] - 8, 68);
      }
    } else if (st === 'warn') {
      const u = ((tr.clock / tr.period + g[2] * 0.5) % 1 + 1) % 1, k = clamp01((u - (1 - PULSE.warn)) / PULSE.warn);
      const jx = calm ? 0 : shakeX(now, 0.4 + k, g[0]);
      shadow(ctx, (g[0] + g[1]) / 2, tr.y + 4, (g[1] - g[0]) * 0.5, 14, 0.12 + 0.18 * k);
      // matte coral wash over the lane that is about to close (danger never glows)
      ctx.fillStyle = `rgba(240,120,90,${(0.10 + 0.16 * k * (calm ? 1 : 0.6 + 0.4 * Math.sin(now * 18))).toFixed(3)})`;
      ctx.fillRect(g[0] + 4, tr.y - 30, g[1] - g[0] - 8, 60);
      spikeRow(ctx, g[0], g[1], tr.y, 0.25 + 0.75 * k, jx, !calm && Math.sin(now * 22) > 0);
      warnGlyph(ctx, (g[0] + g[1]) / 2, tr.y - 44, k, now, calm);
    } else {
      // idle (open lane): thorn nubs breathing in the rail
      const u = ((tr.clock / tr.period + g[2] * 0.5) % 1 + 1) % 1;
      const pre = clamp01((u - (1 - PULSE.warn - 0.12)) / 0.12); // the last beat before the warning
      ctx.strokeStyle = `rgba(240,120,90,${(0.35 + 0.25 * pre).toFixed(3)})`; ctx.lineWidth = 2.5; ctx.setLineDash([3, 10]);
      ctx.beginPath(); ctx.moveTo(g[0] + 6, tr.y); ctx.lineTo(g[1] - 6, tr.y); ctx.stroke(); ctx.setLineDash([]);
      const br = 0.12 + 0.06 * Math.sin(now * 3 + g[0]) + 0.15 * pre;
      spikeRow(ctx, g[0], g[1], tr.y, br, 0, false);
    }
  }
}

function drawDoor(R, ctx, s, tr, now, calm) {
  const st = doorState(tr, tr.clock), m = mem(tr);
  if (m.st === 'warn' && st === 'shut') { // attack: slam
    const mx = (tr.door[0] + tr.door[1]) / 2;
    burst('dust', mx, tr.y, 8, 160, 0.6, { s: 0.7 }); burst('shard', mx, tr.y, 6, 240, 0.45, { g: 400, s: 0.6 });
    ring(mx, tr.y, 70, CORAL, 0.35, 4); m.slam = now;
  }
  m.st = st;
  const sl = now - (m.slam ?? -9), kick = sl < 0.12 && !calm ? (1 - sl / 0.12) * 4 : 0;
  ctx.save(); if (kick) ctx.translate(0, Math.sin(sl * 90) * kick);
  thornRow(R, ctx, tr.y, rowSolids(tr, tr.clock), tr.y * 0.01);
  ctx.restore();
  const [a, b] = tr.door;
  if (st !== 'shut') {
    const u = ((tr.clock / tr.period) % 1 + 1) % 1;
    const k = st === 'warn' ? clamp01((u - DOOR.open) / DOOR.warn) : 0;
    const leaf = (b - a) / 2 * easeIn(k);
    const jy = st === 'warn' && !calm ? Math.sin(now * 50) * 1.5 * k : 0;
    // hinges + leaves: hooked plank, coral rim, swing in while warning
    for (const [x, d] of [[a, 1], [b, -1]]) {
      ctx.fillStyle = BODY; ctx.strokeStyle = RIM; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, tr.y, 8, 0, TAU); ctx.fill(); ctx.stroke();
      if (leaf > 0.5) {
        const x0 = d > 0 ? x : x - leaf;
        ctx.beginPath(); ctx.moveTo(x0, tr.y - 6 + jy); ctx.lineTo(x0 + leaf, tr.y - 6 + jy); ctx.lineTo(x0 + leaf + (d > 0 ? 8 : -8) * 0, tr.y + 6 + jy); ctx.lineTo(x0, tr.y + 6 + jy); ctx.closePath();
        ctx.fillStyle = !calm && Math.sin(now * 18) > 0 ? '#3a1d1d' : BODY; ctx.fill(); ctx.stroke();
        // the hook at the leaf's leading edge
        const hx = d > 0 ? x0 + leaf : x0;
        ctx.beginPath(); ctx.moveTo(hx, tr.y - 6 + jy); ctx.lineTo(hx + d * 9, tr.y - 13 + jy); ctx.lineTo(hx, tr.y + jy); ctx.closePath(); ctx.fillStyle = BODY; ctx.fill(); ctx.stroke();
      }
    }
    if (st === 'warn') { shadow(ctx, (a + b) / 2, tr.y + 6, (b - a) * 0.45, 12, 0.1 + 0.2 * k); warnGlyph(ctx, (a + b) / 2, tr.y - 44, k, now, calm); }
    else {
      // idle (open): a soft mint wash says "go"
      ctx.fillStyle = 'rgba(184,255,214,0.10)'; ctx.fillRect(a + 6, tr.y - 10, b - a - 12, 20);
    }
  }
  // the side squeeze never shuts: a cream arrow that nudges upward
  const sx = (tr.sq[0] + tr.sq[1]) / 2, bob = calm ? 0 : Math.sin(now * 4) * 3;
  ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, tr.y + 34 + bob); ctx.lineTo(sx, tr.y + 14 + bob); ctx.moveTo(sx - 7, tr.y + 21 + bob); ctx.lineTo(sx, tr.y + 14 + bob); ctx.lineTo(sx + 7, tr.y + 21 + bob); ctx.stroke();
}

function drawCap(R, ctx, s, tr, now, calm) {
  // the lure pocket's lid: bristles (telegraph) when the vine is inside the pocket
  const inside = s.cy < tr.y + 470 - 200 && s.cy > tr.y && (tr.side < 0 ? s.cx < tr.wx : s.cx > tr.wx);
  const m = mem(tr); m.k = inside ? Math.min(1, (m.k || 0) + 0.05) : Math.max(0, (m.k || 0) - 0.05);
  const jx = calm ? 0 : shakeX(now, m.k * 0.8, tr.y);
  ctx.save(); ctx.translate(jx, 0);
  thornRow(R, ctx, tr.y, [[tr.x0, tr.x1]], tr.y * 0.01);
  if (m.k > 0) spikeRow(ctx, tr.x0, tr.x1, tr.y + 10, m.k, 0, !calm && Math.sin(now * 20) > 0);
  ctx.restore();
  if (m.k > 0.05) warnGlyph(ctx, (tr.x0 + tr.x1) / 2, tr.y + 46, clamp01((tr.y + 270 - s.cy) / 270), now, calm);
}

function drawWall(ctx, s, tr, now, calm) {
  const w = tr.x1 - tr.x0, h = tr.y0 - tr.y1;
  if (R_GL && drawWallArt(ctx, s, tr.x0, tr.y1, tr.x1, tr.y0)) { // V2-INT fix: painted barrier, not the v1 pillar
    if (tr.kind === 'wall') { const px = tr.x0 < W / 2 ? tr.x0 / 2 : (tr.x1 + W) / 2; warnCross(ctx, px, tr.y1 + 46); }
    return;
  }
  ctx.fillStyle = BODY; ctx.strokeStyle = RIM; ctx.lineWidth = 2.5;
  roundRect(ctx, tr.x0, tr.y1, w, h, Math.min(8, w / 2)); ctx.fill(); ctx.stroke();
  // idle: the hooked thorns flex, one after another, like something breathing
  const near = s.cy < tr.y0 + 200 && s.cy > tr.y1 - 60;
  ctx.fillStyle = BODY;
  for (let y = tr.y1 + 10, i = 0; y < tr.y0 - 6; y += 22, i++) for (const side of [-1, 1]) {
    const x = side < 0 ? tr.x0 : tr.x1; if (x <= 1 || x >= W - 1) continue;
    const flex = calm ? 1 : 1 + 0.25 * Math.max(0, Math.sin(now * (near ? 6 : 2) - i * 0.7));
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + side * 12 * flex, y - 1); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (tr.kind === 'wall') {
    const px = tr.x0 < W / 2 ? tr.x0 / 2 : (tr.x1 + W) / 2, py = tr.y1 + 46;
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(px - 12, py - 12); ctx.lineTo(px + 12, py + 12); ctx.moveTo(px + 12, py - 12); ctx.lineTo(px - 12, py + 12); ctx.stroke();
    ctx.strokeStyle = CORAL; ctx.lineWidth = 5; ctx.stroke();
  }
}

let R_GL = false, CUR_S = null; // set per frame: true on the WebGL path (painted worlds)
function warnCross(ctx, px, py) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(px - 12, py - 12); ctx.lineTo(px + 12, py + 12); ctx.moveTo(px + 12, py - 12); ctx.lineTo(px - 12, py + 12); ctx.stroke();
  ctx.strokeStyle = CORAL; ctx.lineWidth = 5; ctx.stroke();
}
function drawGust(ctx, s, tr, now, calm) {
  // V2-INT: the world's painted gust (meadow gust, ukiyo spray, starry vortex...) blows from the upwind edge
  if (R_GL) { const S = classicSprite(s, 'gust'), M = mechApi(); if (S && M) { const g0 = gustState(tr), yc = Math.min(tr.y0 - 40, Math.max(tr.y1 + 40, s.cy - 60)); M.blitSprite(ctx, S, g0.st === 'warn' && S.e.warnFrames ? S.e.warnFrames[0] : 0, tr.dir > 0 ? 46 : W - 46, yc, 96, 96, { flip: tr.dir > 0 ? 1 : -1, alpha: g0.st === 'calm' ? 0.7 : 1 }); } }
  const g = gustState(tr), dir = tr.dir, m = mem(tr);
  if (m.st === 'warn' && g.st === 'gust') ring(dir > 0 ? 40 : W - 40, Math.min(tr.y0, Math.max(tr.y1, s.cy)), 80, PAPER, 0.4, 3);
  m.st = g.st;
  // idle (calm): a couple of lazy leaves so the band reads as a wind lane
  const n = g.st === 'calm' ? 4 : g.st === 'warn' ? 12 : 26, a = g.st === 'calm' ? 0.35 : g.st === 'warn' ? 0.55 : 0.85;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const y = tr.y0 - hash(i * 3.3 + tr.y0) * (tr.y0 - tr.y1);
    const sp = (g.st === 'calm' ? 50 : g.st === 'warn' ? 260 : 540) + hash(i) * 200;
    const x = ((hash(i * 7.7) * (W + 200) + dir * now * sp) % (W + 200) + W + 200) % (W + 200) - 100;
    const len = g.st === 'calm' ? 0 : (40 + hash(i * 1.9) * 50) * (g.st === 'gust' ? 1.4 : 1);
    if (len) { ctx.strokeStyle = `rgba(255,250,236,${a})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * len, y + 3); ctx.stroke(); }
    ctx.save(); ctx.translate(x, y + (g.st === 'calm' ? Math.sin(now * 2 + i) * 8 : 0)); ctx.rotate(dir * 0.5 + now * (g.st === 'calm' ? 1.5 : 8) + i);
    blit(ctx, SP.leaf, 0, 0, 0.8, 0, g.st === 'calm' ? 0.55 : 0.95); ctx.restore();
  }
  if (g.st === 'warn') {
    // telegraph: chevrons march across the lane in the wind's direction + the glyph upwind
    const k = clamp01(1 - (g.left ?? 0) / GUST.warn);
    const yc = Math.min(tr.y0 - 40, Math.max(tr.y1 + 40, s.cy - 60));
    ctx.lineWidth = 5; ctx.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const ph = ((now * 2.2 + i / 4) % 1), x = dir > 0 ? 70 + ph * (W - 140) : W - 70 - ph * (W - 140), al = Math.sin(ph * Math.PI) * (0.4 + 0.5 * k);
      ctx.strokeStyle = `rgba(240,120,90,${al.toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(x - dir * 9, yc - 13); ctx.lineTo(x + dir * 5, yc); ctx.lineTo(x - dir * 9, yc + 13); ctx.stroke();
    }
    warnGlyph(ctx, dir > 0 ? 42 : W - 42, yc, k, now, calm);
  }
}

function drawTwins(R, ctx, s, tr, now, calm) {
  const [a, b] = twinsXs(tr), near = !tr.passed ? approach(s, tr.y + 280, 280) * (s.cy > tr.y ? 1 : 0) : 0;
  // telegraph: the scissor arc between them and coral eye glints
  if (near > 0) {
    ctx.strokeStyle = `rgba(240,120,90,${(0.25 + 0.45 * near).toFixed(3)})`; ctx.lineWidth = 2.5; ctx.setLineDash([5, 7]); ctx.lineDashOffset = now * 30;
    ctx.beginPath(); ctx.moveTo(a, tr.y); ctx.quadraticCurveTo(tr.x, tr.y - 26 - 10 * Math.sin(now * 6), b, tr.y); ctx.stroke(); ctx.setLineDash([]);
    shadow(ctx, tr.x, tr.y + 10, 52, 12, 0.15 * near);
  }
  for (const x of [a, b]) R.drawBeetle(ctx, { x, y: tr.y, vx: x < tr.x ? -1 : 1, ph: tr.clock * 10, r: tr.r }, now);
  // attack: as the pair scissors shut, a coral snip flashes between them
  const shut = clamp01(1 - (b - a - 32) / 8);
  if (shut > 0 && near > 0) {
    ctx.strokeStyle = `rgba(255,176,143,${(shut * (0.5 + 0.5 * near)).toFixed(3)})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const an = -Math.PI / 2 + (i - 1.5) * 0.45; ctx.moveTo(tr.x + Math.cos(an) * 14, tr.y + Math.sin(an) * 14); ctx.lineTo(tr.x + Math.cos(an) * (22 + 8 * shut), tr.y + Math.sin(an) * (22 + 8 * shut)); }
    ctx.stroke();
  }
  if (near > 0) {
    for (const x of [a, b]) { ctx.fillStyle = CORAL_HOT; ctx.beginPath(); ctx.arc(x + (x < tr.x ? -7 : 7), tr.y - 5, 2.2 + near, 0, TAU); ctx.fill(); }
    if (near > 0.15) warnGlyph(ctx, tr.x, tr.y - 50, near, now, calm);
  }
}

function drawTide(ctx, s, tr, now, botY, calm) {
  if (tr.top == null) return;
  // v1.0.1 fix: the tide body is a world-space band (-200..W+200); after death the camera pulls
  // back to 0.42x and it showed as a black column under the game-over card. Fade it out on death.
  const fade = s.dead ? Math.max(0, 1 - (s.deathT || 0) * 2.5) : 1;
  if (fade <= 0) return;
  ctx.save(); ctx.globalAlpha *= fade;
  drawTideBody(ctx, s, tr, now, botY, calm);
  ctx.restore();
}
function drawTideBody(ctx, s, tr, now, botY, calm) {
  const TX = 3000; // span the whole screen on wide displays, not just the playfield
  const top = tr.top, gap = top - s.cy, close = !tr.done && gap < 140;
  const k = tr.done ? 0 : clamp01(1 - (gap - 40) / 140);
  // body: a wall of thorns rising from below, its crest of hooked teeth undulating (idle)
  ctx.fillStyle = `rgba(${(26 + 34 * k) | 0},18,${(22 + 4 * k) | 0},0.86)`;
  ctx.beginPath(); ctx.moveTo(-TX, botY + 200); ctx.lineTo(-TX, top + 10);
  for (let x = -TX; x <= W + TX; x += 24) ctx.lineTo(x + 12, top - 18 - 6 * Math.sin(now * (6 + 6 * k) + x) - 6 * k), ctx.lineTo(x + 24, top + 6);
  ctx.lineTo(W + TX, botY + 200); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = k > 0.6 && !calm && Math.sin(now * 20) > 0 ? CORAL_HOT : RIM; ctx.lineWidth = 3; ctx.stroke();
  // inner depth: a second, darker row of teeth a little lower
  ctx.fillStyle = 'rgba(10,6,8,0.55)';
  ctx.beginPath(); ctx.moveTo(-TX, top + 60);
  for (let x = -TX; x <= W + TX; x += 36) ctx.lineTo(x + 18, top + 30 - 5 * Math.sin(now * 4 + x * 0.7)), ctx.lineTo(x + 36, top + 60);
  ctx.lineTo(W + TX, botY + 200); ctx.lineTo(-TX, botY + 200); ctx.closePath(); ctx.fill();
  if (close) {
    // telegraph: rising chevrons over the crest + the glyph right under the tip
    for (let i = 0; i < 3; i++) {
      const ph = (now * 1.8 + i / 3) % 1, y = top - 20 - ph * 60;
      ctx.strokeStyle = `rgba(240,120,90,${(Math.sin(ph * Math.PI) * (0.4 + 0.5 * k)).toFixed(3)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.cx - 14, y + 8); ctx.lineTo(s.cx, y - 4); ctx.lineTo(s.cx + 14, y + 8); ctx.stroke();
    }
    warnGlyph(ctx, s.cx + 60, top - 34, k, now, calm);
  }
}

// ---- crow: the trap that steals your staged sunlight
function drawCrowTrap(ctx, s, tr, now, calm) {
  const m = mem(tr);
  if (tr.st === 'perch') {
    // idle: perched on a branch stub at the edge; rests, looks down, caws as you near
    const facing = tr.side < 0 ? 1 : -1;
    const x = tr.side < 0 ? 40 : W - 40, by = tr.y + 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = RIM; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(tr.side < 0 ? -20 : W + 20, by + 2); ctx.lineTo(x + facing * 30, by - 2); ctx.stroke();
    ctx.strokeStyle = BODY; ctx.lineWidth = 6; ctx.stroke();
    const near = approach(s, tr.y + 300, 300);
    const cyc = (now * 0.7 + tr.y * 0.001) % 3;
    let fi = cyc < 1.8 ? 0 : cyc < 2.5 ? 1 : 0;
    if (near > 0.45) fi = (now * 3) % 2 < 1.2 ? 2 : 0; // caw: it has seen you
    if (near > 0.85) fi = 3;                          // crouch: about to launch
    const bob = calm ? 0 : Math.sin(now * 2.2) * 1.2;
    if (!crowFrame(ctx, 'perch', fi, x, by + bob - 1, facing, 1.15)) {
      ctx.save(); if (tr.side > 0) { ctx.translate(2 * x, 0); ctx.scale(-1, 1); } crowShape(ctx, x, tr.y, 1.1, 0.2); ctx.restore();
    }
    if (fi === 2 && !calm) { // caw lines
      const hx = x + facing * 30, hy = by - 46;
      ctx.strokeStyle = 'rgba(255,246,230,0.8)'; ctx.lineWidth = 2.2;
      for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.5; ctx.beginPath(); ctx.moveTo(hx + facing * Math.cos(a) * 10, hy + Math.sin(a) * 10); ctx.lineTo(hx + facing * Math.cos(a) * 18, hy + Math.sin(a) * 18); ctx.stroke(); }
    }
    if (near > 0.3 && s.tips.length === 2 && s.tips.some((t) => t.staged > 0)) warnGlyph(ctx, x, by - 82, near, now, calm);
    m.last = { x, y: by - 30 };
    return;
  }
  if (tr.st === 'warn') {
    // telegraph (1.2 s): it circles the vine, its shadow sweeps over the tip and a
    // reticle locks onto the staged sunlight; the glyph's ring counts down
    const total = tr.lane ? 1.1 : CROW_WARN, k = clamp01(1 - tr.t / total), yy = tr.yy ?? s.cy;
    const lx = tr.x ?? s.cx;
    if (tr.lane) {
      // the dive lane: a hatched coral column the crow will drop through; swerve out of it
      const hw = tr.lane, top = yy - 240, bot = yy + 70;
      ctx.fillStyle = `rgba(240,120,90,${(0.08 + 0.14 * k).toFixed(3)})`; ctx.fillRect(lx - hw, top, hw * 2, bot - top);
      ctx.save(); ctx.beginPath(); ctx.rect(lx - hw, top, hw * 2, bot - top); ctx.clip();
      ctx.strokeStyle = `rgba(240,120,90,${(0.18 + 0.22 * k).toFixed(3)})`; ctx.lineWidth = 3;
      const off = calm ? 0 : (now * 60) % 24;
      ctx.beginPath(); for (let y = top - 2 * hw + off; y < bot; y += 24) { ctx.moveTo(lx - hw, y + 2 * hw); ctx.lineTo(lx + hw, y); } ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = `rgba(240,120,90,${(0.5 + 0.45 * k).toFixed(3)})`; ctx.lineWidth = 2.5; ctx.setLineDash([8, 7]); ctx.lineDashOffset = -now * 40;
      ctx.beginPath(); ctx.moveTo(lx - hw, top); ctx.lineTo(lx - hw, bot); ctx.moveTo(lx + hw, top); ctx.lineTo(lx + hw, bot); ctx.stroke(); ctx.setLineDash([]);
    }
    const ang = now * 4.2, rx = 70 - 30 * k, cx = lx + Math.cos(ang) * rx, cy = yy - 150 + k * 40 + Math.sin(ang) * 16;
    const facing = -Math.sin(ang) >= 0 ? 1 : -1;
    shadow(ctx, lx + Math.cos(ang) * rx * 0.5, yy + 18, 26 + 14 * k, 8 + 3 * k, 0.15 + 0.25 * k);
    // reticle: four corner brackets that close in and turn
    const rr = 44 - 22 * k, rot = now * 2 + k * 2;
    ctx.save(); ctx.translate(lx, yy); ctx.rotate(rot);
    ctx.strokeStyle = `rgba(240,120,90,${(0.55 + 0.4 * k).toFixed(3)})`; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(rr, rr - 10); ctx.lineTo(rr, rr); ctx.lineTo(rr - 10, rr); ctx.stroke(); }
    ctx.restore();
    flyingCrow(ctx, cx, cy, facing, now, 1.3 + 0.12 * k, Math.sin(ang) * 0.15, 13 + 6 * k);
    warnGlyph(ctx, lx, yy - 74 - 10 * (1 - k), k, now, calm);
    m.last = { x: cx, y: cy };
    return;
  }
  // attack / foiled / gone: wall-clock animations (they survive hit-stop and read well)
  const a = m.anim;
  if (a) { drawCrowAnim(ctx, a, now); return; }
  if (tr.st === 'gone' && tr.t < 2.2) {
    // nothing staged: it takes off lazily and leaves
    const x0 = tr.side < 0 ? 40 : W - 40, u = tr.t;
    flyingCrow(ctx, x0 - tr.side * u * 160, tr.y - u * 180 - u * u * 60, tr.side < 0 ? 1 : -1, now, 1, -0.25, 11);
  }
}
function drawCrowAnim(ctx, a, now) {
  const u = CLOCK() - a.t0;
  if (a.kind === 'steal') {
    if (u < 0.17) {
      // the dive: a fast swoop from its circle to the vine, wings swept, motion streaks
      const k = easeIn(u / 0.17), x = a.fx0 + (a.x - a.fx0) * k, y = a.fy0 + (a.y - 16 - a.fy0) * k;
      const facing = a.x >= a.fx0 ? 1 : -1, ang = Math.atan2(a.y - a.fy0, (a.x - a.fx0) * facing);
      ctx.strokeStyle = 'rgba(26,18,22,0.35)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - (a.x - a.fx0) * 0.25 + i * 8, y - (a.y - a.fy0) * 0.25); ctx.lineTo(x + i * 8, y); ctx.stroke(); }
      flyingCrow(ctx, x, y, facing, 0.25, 1.35, ang * 0.6, 0);
    } else {
      // the getaway: it climbs away with the stolen sunlight glinting in its claws
      const v = u - 0.17, x = a.x + a.side * (v * 260 + v * v * 120), y = a.y - 16 - v * 240 - v * v * 160;
      flyingCrow(ctx, x, y, a.side, now, 1.3, -0.35, 16);
      if (a.lost !== 0) { blit(ctx, SP.seed, x - a.side * 4, y + 18, 1.1); additive(ctx, GOLD, x - a.side * 4, y + 18, 18, 0.5); }
    }
  } else if (a.kind === 'foil') {
    // foiled: knocked back (bonk star, feathers), dazed wobble, then flees upward
    const x = a.x - a.side * (u * 140), y = a.y - u * 180 - u * u * 80, wob = Math.sin(u * 22) * 0.35 * Math.max(0, 1 - u);
    flyingCrow(ctx, x, y, -a.side, now, 1.25, wob, 18);
    if (u < 0.6) {
      const k = u / 0.6;
      for (let i = 0; i < 3; i++) { const an = now * 6 + i * TAU / 3; blit(ctx, SP.star, x + Math.cos(an) * 22, y - 26 + Math.sin(an) * 6, 0.55, an, 1 - k); }
    }
  }
}

// ---------------------------------------------------------------- over the tree (world space)
/** Boosts on the vine (shield bubble, rush rocket, ink aura, pollen magnet) and all hit/avoid FX. */
export function drawTrapFx(R, ctx, s, now, px, ui = {}) {
  const t = CLOCK(), calm = !!ui.calm;
  if (!ui.reveal && s.tips) drawBoosts(ctx, s, now, t, calm);
  // vine flash: the tip blooms white-mint for a beat on a hit
  if (FX.flash > 0) {
    const k = clamp01(FX.flash / 0.22), w = FX.flashRep ? 0.4 : 1;
    additive(ctx, MINT_CORE, FX.flashX, FX.flashY, 60 + 40 * (1 - k), 0.9 * k * w);
    additive(ctx, '#ffffff', FX.flashX, FX.flashY, 26, k * w * w);
    if (s.tips) for (const tip of s.tips) additive(ctx, MINT_CORE, tip.x, s.cy, 40, 0.6 * k * w);
  }
  // V2-INT fix: every hit/flash shape is drawn from a clean state with clamped sizes (no inherited
  // lineWidth / dash / alpha / composite from trap or ART draws, no NaN/overshoot growth)
  ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // impact stars: 8 coral spikes that shoot out and thin
  for (const st of FX.stars) {
    const k = clamp01(1 - st.life / st.max); if (!(k >= 0)) continue;
    const r0 = 14 + 40 * easeOut(k), r1 = r0 + 34 * (1 - k);
    ctx.strokeStyle = st.col; ctx.lineCap = 'round'; ctx.lineWidth = Math.min(7, 6 * (1 - k) + 1);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = st.rot + i * TAU / 8, l = i % 2 ? 0.7 : 1; ctx.moveTo(st.x + Math.cos(a) * r0, st.y + Math.sin(a) * r0); ctx.lineTo(st.x + Math.cos(a) * r1 * l, st.y + Math.sin(a) * r1 * l); }
    ctx.stroke();
  }
  // rings
  for (const r of FX.rings) {
    const k = clamp01(1 - r.life / r.max); if (!(k >= 0)) continue;
    const rr = Math.min(8 + r.r, 8 + r.r * easeOut(k));
    ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = r.col; ctx.lineWidth = Math.min(r.w * 1.5, r.w * (1 - k * 0.7) * Math.max(1, Math.min(2, px)));
    ctx.beginPath(); ctx.arc(r.x, r.y, rr, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // near-miss swoosh: two mint crescents sweep past the tip, a speed-line pair trails them
  for (const w of FX.swoosh) {
    const k = clamp01((t - w.t0) / w.dur), e = easeOut(k);
    const r = 26 + 22 * e, a0 = w.side < 0 ? Math.PI * (0.6 + 0.5 * e) : Math.PI * (0.4 - 0.5 * e) ;
    ctx.strokeStyle = `rgba(184,255,214,${(1 - k).toFixed(3)})`; ctx.lineWidth = 5 * (1 - k) + 1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(w.x, w.y, r, a0 - 0.9 * w.side, a0, w.side < 0); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - k)).toFixed(3)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w.x + w.side * (r + 6), w.y + 10 + 40 * e); ctx.lineTo(w.x + w.side * (r + 6), w.y + 40 + 60 * e); ctx.stroke();
  }
  // particles (all cached sprites)
  for (const p of FX.parts) {
    const a = clamp01(p.life / p.max * 1.6);
    if (p.k === 'dust') { blit(ctx, SP.dust, p.x, p.y, 0.5 * p.s * (1.6 - a), 0, a * 0.5); continue; }
    if (p.k === 'star' || p.k === 'mintstar') { blit(ctx, SP[p.k], p.x, p.y, p.s * (0.5 + 0.5 * a), p.rot, a); continue; }
    blit(ctx, SP[p.k], p.x, p.y, p.s, p.rot, a);
  }
  // collect glints: a cross-sparkle that turns and fades where a seed was taken
  if (FX.glints) for (const g of FX.glints) {
    const k = (t - g.t0) / 0.35; if (k > 1) continue;
    blit(ctx, SP.star, g.x, g.y, 1.4 * (1 - k) + 0.3, k * 1.5, 1 - k);
  }
  // crows animating outside their trap (e.g. trap culled mid-getaway): drawn by the trap
  // damage numbers: pop with overshoot + jitter, then drift and shrink
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.textBaseline = 'alphabetic';
  for (const p of FX.pops) {
    const k = 1 - p.life / p.max;
    const sc = Math.min(1.3, k < 0.16 ? easeBack(k / 0.16) * 1.0 : p.life < 0.25 ? easeOut(p.life / 0.25) : 1);
    if (!(sc > 0.02)) continue;
    const jit = k < 0.2 && !calm ? Math.sin(t * 90) * 2.5 * (1 - k / 0.2) : 0;
    ctx.save(); ctx.translate(p.x + jit, p.y); ctx.scale(sc, sc); ctx.rotate(p.rot);
    ctx.font = `800 ${p.size}px ${DISPLAY}`;
    ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.col; ctx.fillText(p.text, 0, 0);
    if (p.sub) { ctx.font = `800 ${Math.round(p.size * 0.4)}px ${FONT}`; ctx.lineWidth = 5; ctx.strokeText(p.sub, 0, p.size * 0.5); ctx.fillStyle = PAPER; ctx.fillText(p.sub, 0, p.size * 0.5); }
    ctx.restore();
  }
}

function drawBoosts(ctx, s, now, t, calm) {
  const pu = s.pu || {};
  // pollen (magnet): gold threads reel nearby sunlight in, the reach ring breathes
  if (pu.pollen > 0) {
    const reach = s.tips.length === 2 ? 190 : 150;
    // v1.0: thicker, brighter threads: a dark keyline under a gold dash with a hot core
    ctx.lineCap = 'round';
    for (const o of s.motes) {
      if (o.taken || o.kind !== 'sun') continue;
      let best = null, bd = reach * reach;
      for (const tip of s.tips) { const dx = o.x - tip.x, dy = o.y - s.cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = tip; } }
      if (!best) continue;
      const k = 1 - Math.sqrt(bd) / reach;
      const path = () => { ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.quadraticCurveTo((o.x + best.x) / 2 + (o.y - s.cy) * 0.2, (o.y + s.cy) / 2, best.x, s.cy); };
      ctx.setLineDash([]); path();
      ctx.strokeStyle = `rgba(30,22,12,${(0.22 + 0.2 * k).toFixed(3)})`; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = `rgba(255,214,102,${(0.35 + 0.35 * k).toFixed(3)})`; ctx.lineWidth = 5; ctx.stroke();
      ctx.setLineDash([7, 9]); ctx.lineDashOffset = calm ? 0 : -now * 90;
      ctx.strokeStyle = `rgba(255,248,214,${(0.6 + 0.4 * k).toFixed(3)})`; ctx.lineWidth = 2.6; ctx.stroke();
      additive(ctx, GOLD, o.x, o.y, 26, 0.35 + 0.35 * k);
    }
    ctx.setLineDash([]);
    for (const tip of s.tips) {
      ctx.strokeStyle = `rgba(255,214,102,${(0.3 + 0.1 * Math.sin(now * 4)).toFixed(3)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tip.x, s.cy, reach * (0.96 + 0.04 * Math.sin(now * 4)), 0, TAU); ctx.stroke();
    }
  }
  // ink (score booster ×2): a gold aura with two orbiting ×2 sparks and rising motes
  if (pu.ink > 0) {
    for (const tip of s.tips) {
      additive(ctx, GOLD, tip.x, s.cy, 48 + 4 * Math.sin(now * 5), 0.32);
      ctx.strokeStyle = 'rgba(255,243,196,0.7)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -now * 40;
      ctx.beginPath(); ctx.arc(tip.x, s.cy, 30, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 2; i++) { const a = now * 3 + i * Math.PI; blit(ctx, SP.star, tip.x + Math.cos(a) * 30, s.cy + Math.sin(a) * 30 * 0.5, 0.6, a); }
      if (!calm && Math.random() < 0.12) part({ k: 'star', x: tip.x + (Math.random() - 0.5) * 40, y: s.cy + 10, vx: 0, vy: 40, g: 0, drag: 0, life: 0.6, max: 0.6, rot: 0, vr: 3, s: 0.35 });
    }
  }
  // rush (headstart rocket-vine): a mint exhaust plume behind the tip and a cone of light ahead
  if (pu.rush > 0) {
    for (const tip of s.tips) {
      const fl = calm ? 1 : 0.85 + 0.15 * Math.sin(now * 40);
      additive(ctx, MINT, tip.x, s.cy + 30, 46 * fl, 0.55);
      additive(ctx, MINT_CORE, tip.x, s.cy + 12, 24 * fl, 0.8);
      additive(ctx, MINT_CORE, tip.x, s.cy - 40, 30, 0.25);
      if (!calm && Math.random() < 0.6) part({ k: Math.random() < 0.5 ? 'mintstar' : 'drop', x: tip.x + (Math.random() - 0.5) * 10, y: s.cy + 14, vx: (Math.random() - 0.5) * 70, vy: 260 + Math.random() * 140, g: 0, drag: 2, life: 0.4, max: 0.4, rot: Math.random() * TAU, vr: 6, s: 0.55 });
    }
  }
  // shield (bark ward): a cream bubble with turning facets and a glint; inflates when gained
  if (s.shield) {
    const inK = FX.bubbleIn ? clamp01((t - FX.bubbleIn) / 0.35) : 1;
    const sc = inK < 1 ? easeBack(inK) : 1;
    for (const tip of s.tips) {
      const r = 25 * sc;
      additive(ctx, CREAM, tip.x, s.cy, r * 1.7, 0.22);
      ctx.fillStyle = 'rgba(255,241,196,0.10)'; ctx.beginPath(); ctx.arc(tip.x, s.cy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(16,32,27,0.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = CREAM; ctx.lineWidth = 2.2; ctx.stroke();
      // hex facets
      ctx.strokeStyle = 'rgba(255,241,196,0.45)'; ctx.lineWidth = 1.4; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = now * 0.8 + i * TAU / 6; ctx.moveTo(tip.x + Math.cos(a) * r * 0.55, s.cy + Math.sin(a) * r * 0.55); ctx.lineTo(tip.x + Math.cos(a) * r, s.cy + Math.sin(a) * r); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      if (r > 7) { ctx.beginPath(); ctx.arc(tip.x, s.cy, r - 5, -2.5, -1.7); ctx.stroke(); }
    }
  }
}

// ---------------------------------------------------------------- screen space
/** Hit vignette (coral edge pulse) under the HUD. */
export function drawTrapFxScreen(R, ctx, cw, ch, ui = {}) {
  if (FX.edge > 0 && !ui.calm) {
    const a = FX.edge * 0.5;
    const g = edgeSprite();
    if (g) { ctx.globalAlpha = a; ctx.drawImage(g, 0, 0, cw, ch); ctx.globalAlpha = 1; }
  }
}
function edgeSprite() {
  return sprite('edge', 200, 300, (g) => {
    const gr = g.createRadialGradient(0, 0, 60, 0, 0, 190);
    gr.addColorStop(0, 'rgba(240,120,90,0)'); gr.addColorStop(1, 'rgba(240,80,60,0.9)');
    g.save(); g.scale(1, 1.5); g.fillStyle = gr; g.fillRect(-100, -100, 200, 200); g.restore();
  });
}
/** Sap streaks fly into the meter, and the meter's chunk flashes (after the HUD). */
export function drawTrapFxHud(R, ctx, ui = {}) {
  const T = R.sapTarget, t = CLOCK();
  if (!ui.hud || !T) return;
  for (const w of FX.streaks) {
    const k = clamp01((t - w.t0) / w.dur); if (k <= 0) continue;
    const e = easeIn(k), u = 1 - e;
    const x = u * u * w.sx + 2 * u * e * w.cx + e * e * T.x, y = u * u * w.sy + 2 * u * e * w.cy + e * e * T.y;
    const k2 = Math.max(0, k - 0.12), e2 = easeIn(k2), u2 = 1 - e2;
    const x2 = u2 * u2 * w.sx + 2 * u2 * e2 * w.cx + e2 * e2 * T.x, y2 = u2 * u2 * w.sy + 2 * u2 * e2 * w.cy + e2 * e2 * T.y;
    ctx.strokeStyle = w.col; ctx.lineCap = 'round'; ctx.lineWidth = 5 * (1 - k * 0.5);
    ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
    blit(ctx, w.col === GOLD ? SP.seed : SP.sapdrop, x, y, 0.9);
  }
  if (FX.chunk > 0) {
    const k = FX.chunk;
    ctx.fillStyle = `rgba(240,120,90,${(0.55 * k).toFixed(3)})`;
    roundRect(ctx, T.x - 4 - 26 * k, T.y - 6 - 3 * k, 8 + 52 * k, 12 + 6 * k, 6); ctx.fill();
    ctx.strokeStyle = `rgba(255,246,230,${(0.8 * k).toFixed(3)})`; ctx.lineWidth = 2; ctx.stroke();
  }
}
