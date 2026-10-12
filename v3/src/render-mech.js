// Forkwood 2.0 (V2-INT): painted sprites for the v2 systems on the 2D overlay, replacing MECH's debug
// vectors. Reads only sim state: trapShapes2 (15 new mechanics), bossShapes + the boss body, the ride you
// sit on, ride knots and Knot Hollows. Sprites come from ART's registry (atlas pages, "@2x" rects, baked
// warn frame cross-faded in over the telegraph). Anything ART has not drawn falls back to a clean vector
// shape in the constant safety colours (danger red-orange, reward gold) with an ink outline: never a crash,
// never the debug look. No filters, no shadowBlur; one drawImage per sprite.
import { trapShapes2, CONE } from './traps2.js';
import gsap from './vendor/gsap.mjs';
import { bossShapes, BOSSES } from './setpieces.js';
import { loadRegistry, registryEntry, resolveId, registryReady } from './worlds.js';

const DANGER = '#ff5a2a', INK = '#2a1a12', GOLD = '#ffc94a', WW = 560;
const BASE = new URL('../assets/v2/', import.meta.url).href;
let regAsked = false;
const pages = new Map(); // url -> HTMLImageElement (complete when decoded)
function page(file) {
  const url = BASE + file;
  let im = pages.get(url);
  if (!im) { im = new Image(); im.decoding = 'async'; im.src = url; pages.set(url, im); }
  return im.complete && im.naturalWidth ? im : null;
}
/** Registry entry + decoded page for a skin id (or null while loading / missing). */
function spr(id, mech) {
  if (!regAsked) { regAsked = true; loadRegistry(); }
  if (!registryReady()) return null;
  const rid = resolveId(id, mech); if (!rid) return null;
  const e = registryEntry(rid); if (!e || e.type === 'layer') return null;
  const v = (e.variants && e.variants[0]) || e;
  const im = page(v.file || e.file); if (!im) return null;
  return { e, im };
}
const warnState = (o) => o.state === 'warn' || o.state === 'quiver' || o.state === 'track' || o.state === 'glow' || o.state === 'warm' || o.state === 'shake' || o.state === 'lock' || !!o.warn || !!o.pulse;
/** Frame index: flappers ping-pong their normal frames at fps; still sprites use frame 0. */
function frameOf(e, now, ph = 0) {
  const warnF = e.warnFrames || [];
  const normal = (e.rects ? e.rects.length : 1) - warnF.length;
  if (!e.fps || normal < 2) return 0;
  const seq = normal === 3 ? [0, 1, 2, 1] : [...Array(normal).keys()];
  return seq[Math.floor(now * e.fps + ph) % seq.length];
}
function rectOf(S, i) { const r = S.e.rects && S.e.rects[i]; return r || [0, 0, S.im.naturalWidth, S.im.naturalHeight]; }
/** Draw frame i of a sprite centred at (x,y) to fit a w x h box (aspect kept unless stretch). */
function blit(ctx, S, i, x, y, w, h, { stretch = false, rot = 0, alpha = 1, flip = 1, sx = 1, sy = 1 } = {}) {
  const [rx, ry, rw, rh] = rectOf(S, i);
  let dw = w, dh = h;
  if (!stretch) { const k = Math.min(w / rw, h / rh); dw = rw * k; dh = rh * k; }
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(flip * sx, sy);
  ctx.drawImage(S.im, rx, ry, rw, rh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
/** Base frame + baked warn frame cross-faded by `warnK` (0..1). */
function blitWarn(ctx, S, now, ph, x, y, w, h, warnK, opt = {}) {
  blit(ctx, S, frameOf(S.e, now, ph), x, y, w, h, opt);
  const wf = S.e.warnFrames && S.e.warnFrames[0];
  if (warnK > 0 && wf != null) blit(ctx, S, wf, x, y, w, h, { ...opt, alpha: (opt.alpha ?? 1) * warnK });
}

// ---------------------------------------------------------------- clean vector fallbacks
function vCircle(ctx, x, y, r, warn, now) {
  ctx.save();
  ctx.fillStyle = warn ? 'rgba(255,90,42,0.22)' : 'rgba(255,90,42,0.78)';
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,236,200,0.55)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.22, 0, Math.PI * 2); ctx.fill();
  if (warn) { ctx.strokeStyle = DANGER; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.lineDashOffset = -now * 30; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function vBar(ctx, a, b, y, h, warn) {
  ctx.save();
  const r = Math.min(h / 2, 8);
  ctx.fillStyle = warn ? 'rgba(255,90,42,0.25)' : '#7a3b22'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(a, y - h / 2, b - a, h, r); ctx.fill(); ctx.stroke();
  if (!warn) { ctx.fillStyle = DANGER; ctx.fillRect(a + 4, y - 1.5, Math.max(0, b - a - 8), 3); }
  ctx.restore();
}
function vCol(ctx, x, y0, y1, hw, warn) {
  ctx.save();
  ctx.fillStyle = warn ? 'rgba(255,90,42,0.22)' : 'rgba(255,90,42,0.7)'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
  const top = Math.min(y0, y1), h = Math.abs(y0 - y1);
  ctx.beginPath(); ctx.roundRect(x - hw, top, hw * 2, h, Math.min(hw, 10)); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function telegraphLine(ctx, y, now) {
  ctx.save(); ctx.strokeStyle = 'rgba(255,90,42,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]); ctx.lineDashOffset = -now * 40;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WW, y); ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- traps (15 new mechanics)
const SPIN = new Set(['vortex', 'spores']);
// V3.1 trap motion: GSAP eases drive anticipation (squash + jitter while warning), a back-out pop when a
// trap snaps into its dangerous state, a soft danger glow under telegraphs and an idle breath otherwise.
const E = { back: gsap.parseEase('back.out(2.4)'), elastic: gsap.parseEase('elastic.out(1,0.45)'), outQ: gsap.parseEase('power2.out'), inQ: gsap.parseEase('power2.in'), inOut: gsap.parseEase('sine.inOut') };
const tstate = new Map(); // stable key (kind + world row) -> { st, t } for transition pops
let glowCv = null;
function dangerGlow() {
  if (glowCv || typeof document === 'undefined') return glowCv;
  glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 64;
  const g = glowCv.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,120,60,0.85)'); r.addColorStop(0.45, 'rgba(255,90,42,0.35)'); r.addColorStop(1, 'rgba(255,90,42,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return glowCv;
}
function glowAt(ctx, x, y, r, a) { const G = dangerGlow(); if (!G || a <= 0.01) return; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(G, x - r, y - r, r * 2, r * 2); ctx.restore(); }
const jit = (now, k) => (Math.sin(now * 91.7) * 0.6 + Math.sin(now * 53.3) * 0.4) * k;
function juice(o, now, mech, warn) {
  const key = mech + ':' + (o.t === 'row' ? Math.round(o.y) : o.t === 'col' ? Math.round(o.x) + ':' + Math.round(Math.min(o.y0, o.y1) / 400) : '');
  let m = null, pop = 1;
  if (o.t === 'row' || o.t === 'col') {
    m = tstate.get(key); const st = String(o.state || '') + (o.solids ? o.solids.length : '');
    if (!m) { m = { st, t: now - 9 }; tstate.set(key, m); if (tstate.size > 80) tstate.delete(tstate.keys().next().value); }
    else if (m.st !== st) { m.st = st; m.t = now; }
    const e = now - m.t; if (e >= 0 && e < 0.32 && !warn) { const u = E.outQ(e / 0.32); pop = 1 + 0.2 * Math.sin(Math.PI * u) * (1 - 0.5 * u); } // snap pop
  }
  if (warn) {
    const k = 0.5 + 0.5 * Math.sin(now * 17);
    const hard = o.state === 'quiver' || o.state === 'shake' || o.state === 'lock' || o.state === 'warm';
    return { sx: 1 + 0.07 * k, sy: 1 - 0.06 * k, dx: jit(now, hard ? 2.6 : 1.1), dy: jit(now + 3, hard ? 1.6 : 0.6), rot: jit(now + 7, hard ? 0.05 : 0.015), glow: 0.35 + 0.35 * k };
  }
  const br = Math.sin(now * 2.2 + (o.x || o.y || 0) * 0.01) * 0.025;
  return { sx: pop * (1 + br), sy: pop * (1 - br), dx: 0, dy: 0, rot: 0, glow: 0 };
}
function drawShape(ctx, o, now, mech) {
  const warn = warnState(o);
  const warnK = warn ? 0.6 + 0.4 * Math.sin(now * 9) * 0.5 + 0.2 : 0;
  const S = spr(o.skin, mech);
  const ph = (o.x || 0) * 0.013 + (o.y || 0) * 0.007;
  const J = juice(o, now, mech, warn);
  if (o.t === 'circle') {
    if (mech === 'cone' || /:grab$/.test(o.kind || '')) { // target reticle on the player: a telegraph, kept vector
      ctx.save(); ctx.strokeStyle = DANGER; ctx.lineWidth = 3; ctx.setLineDash(o.state === 'lock' ? [] : [8, 7]); ctx.lineDashOffset = -now * 40;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2), s2 = Math.sin(a * Math.PI / 2); ctx.moveTo(o.x + c * (o.r - 8), o.y + s2 * (o.r - 8)); ctx.lineTo(o.x + c * (o.r + 8), o.y + s2 * (o.r + 8)); } ctx.stroke(); ctx.restore();
      if (S && mech === 'cone' && !/squirrel/.test(o.skin || '')) blitWarn(ctx, S, now, ph, o.x, o.y - o.r - 34, 70, 70, o.state === 'lock' ? 1 : 0.4); // squirrels act on their own (drawSquirrels)
      return;
    }
    const d = Math.max(o.r * 2.5, 44);
    if (S) {
      const rot = SPIN.has(mech) ? now * Math.PI * 2 * 0.5 : 0;
      const bob = mech === 'hornets' || mech === 'bats' ? Math.sin(now * 6 + ph) * 3 : 0;
      if (J.glow) glowAt(ctx, o.x, o.y, d * 0.75, J.glow);
      blitWarn(ctx, S, now, ph, o.x + J.dx, o.y + bob + J.dy, d, d, warnK, { rot: rot + J.rot, sx: J.sx, sy: J.sy });
      if (o.ring) { ctx.save(); ctx.strokeStyle = 'rgba(255,90,42,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -now * 25; ctx.beginPath(); ctx.arc(o.x, o.y, o.ring, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    } else vCircle(ctx, o.x, o.y, o.r, warn, now);
    return;
  }
  if (o.t === 'row') {
    if (!o.solids || !o.solids.length) { if (warn || o.state) telegraphLine(ctx, o.y, now); return; }
    for (const [a, b] of o.solids) {
      const w = b - a; if (w < 4) continue;
      if (S) {
        const [, , rw, rh] = rectOf(S, 0);
        if (J.glow) glowAt(ctx, (a + b) / 2, o.y, Math.min(90, Math.max(40, w * 0.5)), J.glow * 0.8);
        if (mech === 'seesaw') { blitWarn(ctx, S, now, ph, (a + b) / 2 + J.dx, o.y + J.dy, w, Math.min(60, Math.max(30, w * rh / rw)), warnK, { stretch: true, sx: J.sx, sy: J.sy, rot: J.rot }); continue; }
        if (mech === 'pendulum') { blitWarn(ctx, S, now, ph, (a + b) / 2, o.y, Math.max(w, 60), 76, warnK, { sx: J.sx, sy: J.sy }); continue; }
        // pecker / jaws / strangle: the painted motif repeats along the solid span (aspect kept, clipped)
        const th = 46, tw = Math.max(24, th * rw / rh), n = Math.ceil(w / tw);
        ctx.save(); ctx.beginPath(); ctx.rect(a, o.y - th, w, th * 2); ctx.clip();
        for (let i = 0; i < n; i++) blitWarn(ctx, S, now, ph + i, a + tw / 2 + i * tw + J.dx * (i % 2 ? -1 : 1), o.y + J.dy, tw, th, warnK, { flip: i % 2 ? -1 : 1, sx: J.sx, sy: J.sy * (warn ? 1 : 1 + 0.04 * Math.sin(now * 6 + i)) });
        ctx.restore();
      } else vBar(ctx, a, b, o.y, 18, warn);
    }
    return;
  }
  if (o.t === 'col') {
    const top = Math.min(o.y0, o.y1), h = Math.max(24, Math.abs(o.y0 - o.y1));
    if (J.glow) glowAt(ctx, o.x, top + h / 2, Math.max(36, o.hw * 3), J.glow);
    // a falling column stretches along its fall (icicle / plaster / falling star), squashes while it shakes
    const falling = mech === 'icicle' && o.state === 'fall';
    if (S) blitWarn(ctx, S, now, ph, o.x + J.dx, top + h / 2 + J.dy, Math.max(o.hw * 2.6, 30), h, warnK, { stretch: mech === 'beam', sx: falling ? 0.86 : J.sx, sy: falling ? 1.22 : J.sy, rot: J.rot });
    else vCol(ctx, o.x, o.y0, o.y1, o.hw, warn);
    return;
  }
  if (o.t === 'box') { // candy: the folding screen around triple sunlight
    const w = o.x1 - o.x0, h = Math.abs(o.y0 - o.y1), cy = (o.y0 + o.y1) / 2;
    if (S) { blitWarn(ctx, S, now, ph, o.x0 + 10, cy, 34, h, warnK, { stretch: true }); blitWarn(ctx, S, now, ph, o.x1 - 10, cy, 34, h, warnK, { stretch: true, flip: -1 }); }
    else { ctx.save(); ctx.strokeStyle = DANGER; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeRect(o.x0, o.y1, w, h); ctx.restore(); }
    return;
  }
  if (o.t === 'lane') { // boss lane telegraph: soft red-orange band with a bright core
    const left = o.left != null ? Math.max(0, Math.min(1, o.left / 1.2)) : 0;
    ctx.save();
    ctx.fillStyle = o.warn ? `rgba(255,90,42,${0.1 + 0.12 * (1 - left)})` : 'rgba(255,90,42,0.42)';
    ctx.fillRect(o.x - o.hw, -1e5, o.hw * 2, 2e5);
    ctx.fillStyle = 'rgba(255,200,150,0.35)'; ctx.fillRect(o.x - 2, -1e5, 4, 2e5);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- boss body
function drawBoss(ctx, s, now) {
  const B = s.boss; if (!B) return;
  const S = spr(B.skin);
  const a = B.atk, winding = !!(a && a.warn && a.t < a.warn);
  const x = WW / 2 + Math.sin(now * 0.7) * 70, y = s.cy - 360 + Math.sin(now * Math.PI) * 6; // hovers ahead of the tip
  const breathe = 1 + Math.sin(now * Math.PI) * 0.02;
  const intro = Math.min(1, Math.max(0, 1 - (B.t > 0 && B.phase < 0 ? B.t / 1.6 : 0)));
  if (S) {
    const fi = winding && S.e.rects && S.e.rects.length > 1 ? 1 : 0;
    const sq = winding ? 1 - 0.04 : breathe;
    blit(ctx, S, fi, x, y - (1 - intro) * 120, 250, 220, { alpha: intro, sx: winding ? 1.04 : 1, sy: sq });
  } else {
    ctx.save(); ctx.globalAlpha = intro; ctx.fillStyle = '#3a2a3a'; ctx.strokeStyle = DANGER; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, 90, 60, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // phase pips (3) under the boss
  const ph = Math.max(0, B.phase);
  ctx.save(); ctx.globalAlpha = intro;
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i < ph ? 'rgba(255,255,255,0.25)' : DANGER; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x - 22 + i * 22, y + 110, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------- rides, knots, hollows
function drawRides(ctx, s, now) {
  for (const m of s.motes) {
    if (m.taken) continue;
    if (m.kind === 'ride') {
      const S = spr(m.skin);
      const bob = Math.sin(now * 2.4 + m.x * 0.01) * 4;
      ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(m.x, m.y + bob, m.r + 10 + Math.sin(now * 4) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (S) blit(ctx, S, 0, m.x, m.y + bob, m.r * 3, m.r * 3);
      else { ctx.save(); ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m.x, m.y + bob, m.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
    } else if (m.kind === 'hollow') {
      const S = spr(m.skin);
      if (S) blit(ctx, S, 0, m.x, m.y, m.r * 3.2, m.r * 3.2);
      else { ctx.save(); ctx.fillStyle = '#7a4a22'; ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
  }
  if (s.ride) {
    const S = spr(s.ride.skin);
    const mount = s.ride.t > s.ride.dur - 0.3 ? 1 + (s.ride.t - (s.ride.dur - 0.3)) * 0.8 : 1; // little pop on mount
    const blink = s.ride.t < 1 && Math.floor(now * 12) % 2 === 0 ? 0.45 : 1; // about to end
    if (S) blit(ctx, S, 0, s.cx, s.cy + 6, 74 * mount, 74 * mount, { alpha: blink, flip: s.ride.lane < 0 ? -1 : 1, rot: Math.sin(now * 3) * 0.05 });
    else { ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.cx, s.cy, 24, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  }
  if (s.decoy > 0) { ctx.save(); ctx.fillStyle = 'rgba(255,201,74,0.7)'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s.decoyX, s.cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
}

const MECH_OF = (s, o) => { const k = String(o.kind || ''); return k.startsWith('boss:') ? null : k; };
/** Everything above, in world space (called inside the overlay's world transform). */
// ---------------------------------------------------------------- V3.1: the Acorn Squirrel, a real actor
// perch: hides in a leafy bough at the field edge ahead; the bough rustles and the squirrel peeks out as
//        the vine approaches (telegraph). track: it leaps from the bough and scampers up the edge beside
//        the tip (hop cycle). lock: wind-up squash, then a stretch as it hurls the acorn in an arc onto the
//        locked circle. dropped: the acorn cracks (shell bits) and the squirrel bounds off the edge.
const actorMem = new WeakMap();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function drawBough(ctx, ex, y, side, now, rustle) {
  const L = spr('vine.skin.cel.leaf');
  ctx.save();
  ctx.strokeStyle = '#4a3020'; ctx.lineCap = 'round';
  ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(ex + side * 90, y + 22); ctx.quadraticCurveTo(ex + side * 30, y + 30, ex - side * 26, y + 24); ctx.stroke();
  ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex + side * 88, y + 19); ctx.quadraticCurveTo(ex + side * 30, y + 26, ex - side * 22, y + 21); ctx.stroke();
  const shake = rustle < 1 ? rustle : 0.25 + 0.2 * Math.abs(Math.sin(now * 2.7));
  for (let i = 0; i < 7; i++) {
    const lx = ex + side * (70 - i * 15) + Math.sin(i * 2.1) * 6, ly = y + 16 - (i % 3) * 9;
    const r = (i % 2 ? -1 : 1) * (0.6 + i * 0.12) + Math.sin(now * 24 + i * 1.7) * 0.32 * shake;
    if (L) blit(ctx, L, 0, lx, ly, 30, 30, { rot: r - Math.PI / 4, flip: i % 2 ? -1 : 1 });
    else { ctx.fillStyle = i % 2 ? '#3f8a4a' : '#6cbf5a'; ctx.beginPath(); ctx.ellipse(lx, ly, 13, 6, r, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
function drawSquirrels(ctx, s, now) {
  for (const tr of s.traps) {
    if (tr.kind !== 'cone' || !tr.t2 || tr.broken || !/squirrel/.test(tr.skin || '')) continue;
    let m = actorMem.get(tr); if (!m) { m = {}; actorMem.set(tr, m); }
    const side = tr.side < 0 ? -1 : 1, ex = side < 0 ? 50 : WW - 50, face = side < 0 ? -1 : 1; // the sprite faces left
    const S = spr(tr.skin, 'cone');
    let x, y, sx = 1, sy = 1, rot = 0, a = 1, warnK = 0, acorn = null;
    if (tr.st === 'perch') {
      const d = s.cy - tr.y; // > 0 while the tip is still below the perch
      if (d > 820 || d < -240) continue;
      const pk = clamp01((760 - d) / 300), e = E.back(pk);
      drawBough(ctx, ex, tr.y, side, now, pk);
      x = ex + side * (1 - e) * 80; y = tr.y - 6; a = Math.min(1, pk * 2.5);
      rot = side * -0.25 * (1 - pk) + Math.sin(now * 3 + tr.y) * 0.04;
      if (pk >= 1) { const b = Math.max(0, Math.sin(now * 8)); sy = 1 + 0.06 * b; sx = 1 - 0.04 * b; y -= b * 4; } // alert bounce
      warnK = pk >= 1 ? 0.25 : 0;
    } else if (tr.st === 'track') {
      const el = CONE.track + CONE.lock - tr.t;
      if (m.y0 == null) m.y0 = tr.y - 6;
      drawBough(ctx, ex, m.y0 + 6, side, now, 1);
      const lp = clamp01(el / 0.34), q = E.outQ(lp);
      x = ex; y = m.y0 + (s.cy - 46 - m.y0) * q - Math.sin(lp * Math.PI) * 46;
      if (lp < 1) { sy = 1.12 - 0.12 * lp; sx = 0.9 + 0.1 * lp; rot = -side * 0.3 * (1 - lp); }
      if (tr.t > CONE.lock) { if (lp >= 1) { const hop = Math.abs(Math.sin(now * 15)); y -= hop * 9; sy = 1 - 0.09 * hop; sx = 1 + 0.07 * hop; } }
      else {
        warnK = 1;
        const THROW = 0.3;
        if (tr.t > THROW) { const k = E.inOut(clamp01((CONE.lock - tr.t) / (CONE.lock - THROW))); sy = 1 - 0.16 * k; sx = 1 + 0.12 * k; rot = side * 0.16 * k; } // wind-up
        else {
          const k = clamp01(1 - tr.t / THROW), kk = E.outQ(Math.min(1, k * 2.2));
          sy = 0.84 + 0.36 * kk - 0.2 * k; sx = 1.12 - 0.22 * kk + 0.1 * k; rot = -side * 0.22 * (1 - k); // release stretch
          const fx = ex - side * 20, fy = s.cy - 72, tx = tr.x, ty = s.cy;
          acorn = { x: fx + (tx - fx) * k, y: fy + (ty - fy) * k - Math.sin(k * Math.PI) * 110, s: 0.7 + 0.5 * k, r: k * 10 };
        }
      }
    } else if (tr.st === 'dropped') {
      if (m.dropT == null) { m.dropT = now; m.tx = tr.x; m.ty = s.cy; }
      const e = now - m.dropT; if (e > 0.95) continue;
      if (e < 0.5) { // cracked acorn: shell bits + a dust puff where it landed
        const k = e / 0.5;
        ctx.save(); ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 6; i++) { const an = -Math.PI / 2 + (i - 2.5) * 0.55, v = 120 + i * 14; ctx.fillStyle = i % 2 ? '#8a5a2a' : '#c08a4a';
          ctx.save(); ctx.translate(m.tx + Math.cos(an) * v * e, m.ty + Math.sin(an) * v * e + 420 * e * e); ctx.rotate(e * 14 + i); ctx.fillRect(-3, -2, 6, 4); ctx.restore(); }
        ctx.strokeStyle = 'rgba(255,236,200,0.8)'; ctx.lineWidth = 3 * (1 - k); ctx.beginPath(); ctx.arc(m.tx, m.ty, 14 + 40 * E.outQ(k), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      const k = E.inQ(clamp01((e - 0.12) / 0.6));
      x = ex + side * k * 120; y = s.cy - 46 - Math.sin(clamp01(e / 0.35) * Math.PI) * 26; a = 1 - clamp01((e - 0.55) / 0.4);
      sx = 1 + 0.08 * Math.sin(e * 28); sy = 1 - 0.08 * Math.sin(e * 28); rot = side * 0.2 * k;
    } else continue;
    if (S) blitWarn(ctx, S, now, 0, x, y, 80, 82, warnK, { flip: face, sx, sy, rot, alpha: a });
    else { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#c0602a'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 16 * sx, 20 * sy, rot, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x + side * 16, y - 14, 10, 20, side * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
    if (acorn) {
      const A = spr('pickup.acorn');
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(acorn.x, s.cy + 4, 8 * acorn.s, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (A) blit(ctx, A, 0, acorn.x, acorn.y, 26 * acorn.s, 26 * acorn.s, { rot: acorn.r });
      else { ctx.save(); ctx.translate(acorn.x, acorn.y); ctx.rotate(acorn.r); ctx.fillStyle = '#b07a3a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 2, 7, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#6a4424'; ctx.fillRect(-8, -8, 16, 6); ctx.restore(); }
    }
  }
}
export function drawMech(ctx, s, now) {
  if (!s || !s.traps) return;
  drawSquirrels(ctx, s, now);
  for (const o of trapShapes2(s)) drawShape(ctx, o, now, MECH_OF(s, o));
  if (s.boss) { drawBoss(ctx, s, now); for (const o of bossShapes(s)) drawShape(ctx, o, now, null); }
  drawRides(ctx, s, now);
}
// growth ring / knot medallions (render.js drawToken asks for these through render-traps.js)
const RING_ICON = { deep: 'deepsap', quick: 'quickmerge', magnet: 'magnetroots', bark: 'thickbark', clover: 'luckyclover', craft: 'ridecraft', ember: 'emberheart',
  echo: 'echofork', sunwise: 'sunwise', acorn: 'acornsense', dancer: 'thorndancer', crowf: 'crowfriend', dew: 'dewring', brittle: 'k:brittlebark', thirst: 'k:thirst', crow: 'k:restlesscrow', thornfall: 'k:thornfall' };
/** Draw a ring/knot medallion icon; false while not loaded (caller keeps its vector medallion). */
export function drawRingIcon(ctx, ringId, x, y, size) {
  const n = RING_ICON[ringId] || 'graft';
  const S = spr(n.startsWith('k:') ? 'icon.knot.' + n.slice(2) : 'icon.ring.' + n);
  if (!S) return false;
  blit(ctx, S, 0, x, y, size, size);
  return true;
}
export { BOSSES };

// ---------------------------------------------------------------- classic v1 hazards in ART's paint (V2-INT fix)
// Bramble rows (gate/split/slide + pulse/door/cap rails), thorn columns and thorn walls used to keep the v1
// ink-and-coral vectors on top of the painted worlds. They now repeat the world's painted barrier sprite
// (meadow briar, starry wheat spikes, fresco arch gate, gilded spiral thorn...). Worlds ART gave no row
// sprite fall back to the nearest painted thorn row (resolveId by mechanic), never to the v1 vector.
const BARRIER_MECH = ['pulse', 'door', 'pecker', 'jaws', 'strangle'];
const barrierCache = new Map();
function barrier(world) {
  if (barrierCache.has(world)) { const c = barrierCache.get(world); if (c) return c; }
  let S = null;
  for (const m of BARRIER_MECH) { S = spr(`${world}.trap.barrier`, m); if (S && S.e.world === world) break; }
  if (!S) for (const m of BARRIER_MECH) { S = spr(`${world}.trap.barrier`, m); if (S) break; }
  if (S) barrierCache.set(world, S);
  return S;
}
/** Painted bramble row over [a,b] at y. false while the art is loading (caller keeps its own look). */
function rowArt(ctx, S, a, b, y, th = 44) {
  const w = b - a; if (w < 2) return;
  const [, , rw, rh] = rectOf(S, 0);
  const tw = Math.max(28, th * rw / rh), n = Math.max(1, Math.round(w / tw)), step = w / n;
  ctx.save(); ctx.beginPath(); ctx.rect(a - 2, y - th, w + 4, th * 2); ctx.clip();
  for (let i = 0; i < n; i++) blit(ctx, S, 0, a + step * (i + 0.5), y, step * 1.04, th, { stretch: true, flip: i % 2 ? -1 : 1 });
  ctx.restore();
}
export function drawBrambleArt(ctx, s, b) {
  const S = s && barrier(s.world); if (!S) return false;
  for (const [a, c] of b.solids) rowArt(ctx, S, a, c, b.y);
  return true;
}
/** Thorn column (vertical): the same painted row, turned upright. */
export function drawColumnArt(ctx, s, c) {
  if (c.kind === 'bolt') return false;
  const S = s && barrier(s.world); if (!S) return false;
  const top = Math.min(c.y0, c.y1), h = Math.abs(c.y0 - c.y1), th = Math.max(30, (c.hw || 12) * 2.6);
  ctx.save(); ctx.translate(c.x, top + h / 2); ctx.rotate(Math.PI / 2);
  rowArt(ctx, S, -h / 2, h / 2, 0, th);
  ctx.restore();
  return true;
}
/** Thorn wall / hedge block: stacked painted rows clipped to the block. */
export function drawWallArt(ctx, s, x0, y1, x1, y0) {
  const S = s && barrier(s.world); if (!S) return false;
  const h = y0 - y1, w = x1 - x0, th = Math.min(44, Math.max(26, w * 0.9));
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 4, y1 - 4, w + 8, h + 8); ctx.clip();
  ctx.translate((x0 + x1) / 2, (y0 + y1) / 2); ctx.rotate(Math.PI / 2);
  rowArt(ctx, S, -h / 2, h / 2, 0, Math.max(th, w + 10));
  ctx.restore();
  return true;
}
/** World sprite for a classic trap mechanic (crow, gust, tide ...), or null. */
export function classicSprite(s, mech) { return s ? spr(`${s.world}.trap.${mech}`, mech) : null; }
export function blitSprite(ctx, S, i, x, y, w, h, opt) { blit(ctx, S, i, x, y, w, h, opt); }
export function frameIndex(S, now, ph) { return frameOf(S.e, now, ph); }
