// Forkwood 2.0 (V2-INT): painted sprites for the v2 systems on the 2D overlay, replacing MECH's debug
// vectors. Reads only sim state: trapShapes2 (15 new mechanics), bossShapes + the boss body, the ride you
// sit on, ride knots and Knot Hollows. Sprites come from ART's registry (atlas pages, "@2x" rects, baked
// warn frame cross-faded in over the telegraph). Anything ART has not drawn falls back to a clean vector
// shape in the constant safety colours (danger red-orange, reward gold) with an ink outline: never a crash,
// never the debug look. No filters, no shadowBlur; one drawImage per sprite.
import { trapShapes2 } from './traps2.js';
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
function drawShape(ctx, o, now, mech) {
  const warn = warnState(o);
  const warnK = warn ? 0.6 + 0.4 * Math.sin(now * 9) * 0.5 + 0.2 : 0;
  const S = spr(o.skin, mech);
  const ph = (o.x || 0) * 0.013 + (o.y || 0) * 0.007;
  if (o.t === 'circle') {
    if (mech === 'cone' || /:grab$/.test(o.kind || '')) { // target reticle on the player: a telegraph, kept vector
      ctx.save(); ctx.strokeStyle = DANGER; ctx.lineWidth = 3; ctx.setLineDash(o.state === 'lock' ? [] : [8, 7]); ctx.lineDashOffset = -now * 40;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); for (const a of [0, 1, 2, 3]) { const c = Math.cos(a * Math.PI / 2), s2 = Math.sin(a * Math.PI / 2); ctx.moveTo(o.x + c * (o.r - 8), o.y + s2 * (o.r - 8)); ctx.lineTo(o.x + c * (o.r + 8), o.y + s2 * (o.r + 8)); } ctx.stroke(); ctx.restore();
      if (S && mech === 'cone') blitWarn(ctx, S, now, ph, o.x, o.y - o.r - 34, 70, 70, o.state === 'lock' ? 1 : 0.4);
      return;
    }
    const d = Math.max(o.r * 2.5, 44);
    if (S) {
      const rot = SPIN.has(mech) ? now * Math.PI * 2 * 0.5 : 0;
      const bob = mech === 'hornets' || mech === 'bats' ? Math.sin(now * 6 + ph) * 3 : 0;
      blitWarn(ctx, S, now, ph, o.x, o.y + bob, d, d, warnK, { rot });
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
        if (mech === 'seesaw') { blitWarn(ctx, S, now, ph, (a + b) / 2, o.y, w, Math.min(60, Math.max(30, w * rh / rw)), warnK, { stretch: true }); continue; }
        if (mech === 'pendulum') { blitWarn(ctx, S, now, ph, (a + b) / 2, o.y, Math.max(w, 60), 76, warnK); continue; }
        // pecker / jaws / strangle: the painted motif repeats along the solid span (aspect kept, clipped)
        const th = 46, tw = Math.max(24, th * rw / rh), n = Math.ceil(w / tw);
        ctx.save(); ctx.beginPath(); ctx.rect(a, o.y - th, w, th * 2); ctx.clip();
        for (let i = 0; i < n; i++) blitWarn(ctx, S, now, ph + i, a + tw / 2 + i * tw, o.y, tw, th, warnK, { flip: i % 2 ? -1 : 1 });
        ctx.restore();
      } else vBar(ctx, a, b, o.y, 18, warn);
    }
    return;
  }
  if (o.t === 'col') {
    const top = Math.min(o.y0, o.y1), h = Math.max(24, Math.abs(o.y0 - o.y1));
    if (S) blitWarn(ctx, S, now, ph, o.x, top + h / 2, Math.max(o.hw * 2.6, 30), h, warnK, { stretch: mech === 'beam' });
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
export function drawMech(ctx, s, now) {
  if (!s || !s.traps) return;
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
