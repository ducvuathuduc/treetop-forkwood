// Runtime vector atlas: every gameplay sprite and FX particle the engine needs, drawn once
// into ONE canvas page (<= 2048 px) so sprites and particles batch into a handful of draw calls.
// Registry sprites from ART (assets/v2/registry.json, type sprite/anim/icon/fx) replace frames
// by id when they load; anything missing stays a clean vector placeholder (never a crash).
//
// Frame ids follow the registry convention (dotted): 'pickup.sun', 'enemy.beetle.0',
// 'fx.spark', 'fx.stroke.3', 'leaf.vine.skin.impasto', ...
import { VINE_SKINS } from './skins.js';

const TAU = Math.PI * 2;
const INK = '#1e1a16', KEY = '#10201b', SEED = '#f2b33d', SEED_HOT = '#fff1b0', CREAM = '#fff6e6';
const RES = 2; // atlas texels per sprite unit (sprites are authored in world units)

function leafPath(g, len, wide, shape) {
  g.beginPath();
  if (shape === 'diamond') { g.moveTo(0, 0); g.lineTo(len * 0.5, -len * wide * 0.6); g.lineTo(len, 0); g.lineTo(len * 0.5, len * wide * 0.6); g.closePath(); return; }
  if (shape === 'dab') { g.ellipse(len * 0.5, 0, len * 0.5, len * wide * 0.55, 0, 0, TAU); return; }
  if (shape === 'brush') { g.moveTo(0, 0); g.bezierCurveTo(len * 0.25, -len * wide * 0.9, len * 0.8, -len * wide * 0.3, len, 0); g.bezierCurveTo(len * 0.7, len * wide * 0.25, len * 0.3, len * wide * 0.5, 0, 0); return; }
  g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * wide, len, 0); g.quadraticCurveTo(len * 0.5, len * wide, 0, 0);
}

// Each painter draws centred at (0,0) in a box of size [w,h] sprite units.
const P = {};
P.glow = { w: 64, h: 64, draw(g) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); } };
P.dot = { w: 16, h: 16, draw(g) { g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill(); } };
P['fx.ring'] = { w: 128, h: 128, draw(g) { g.strokeStyle = '#fff'; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 61, 0, TAU); g.stroke(); } };
P['fx.spark'] = { w: 32, h: 32, draw(g) { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); g.lineTo(Math.cos(a + Math.PI / 4) * 4.5, Math.sin(a + Math.PI / 4) * 4.5); } g.closePath(); g.fill(); } };
P['fx.leaf'] = { w: 32, h: 16, draw(g) { g.translate(-15, 0); leafPath(g, 30, 0.42, 'leaf'); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.stroke(); } };
P['fx.petal'] = { w: 20, h: 14, draw(g) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-9, 0); g.bezierCurveTo(-4, -7, 6, -6, 9, -1); g.bezierCurveTo(5, 5, -4, 6, -9, 0); g.fill(); g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(-9, 0); g.quadraticCurveTo(0, 1, 9, -1); g.quadraticCurveTo(2, 4, -9, 0); g.fill(); } };
P['fx.firefly'] = { w: 32, h: 32, draw(g) { const r = g.createRadialGradient(0, 0, 0, 0, 0, 15); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-16, -16, 32, 32); } };
P['fx.ember'] = { w: 16, h: 24, draw(g) { const r = g.createRadialGradient(0, 2, 0, 0, 2, 10); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(0, 2, 7, 10, 0, 0, TAU); g.fill(); } };
P['fx.flake'] = { w: 16, h: 16, draw(g) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-6, -3); g.lineTo(4, -6); g.lineTo(6, 3); g.lineTo(-3, 6); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-2, -2, 3, 3); } };
P['fx.dust'] = { w: 12, h: 12, draw(g) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill(); } };
P['fx.ripple'] = { w: 64, h: 24, draw(g) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 29, 9, 0, 0, TAU); g.stroke(); g.globalAlpha = 0.5; g.beginPath(); g.ellipse(0, 0, 19, 5.5, 0, 0, TAU); g.stroke(); } };
P['fx.foam'] = { w: 24, h: 24, draw(g) { g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { const a = i * 1.3; g.beginPath(); g.arc(Math.cos(a) * 6, Math.sin(a) * 5, 4 - i * 0.5, 0, TAU); g.fill(); } } };
for (let k = 0; k < 3; k++) {
  P[`fx.ink.${k}`] = { w: 32, h: 32, draw(g) { g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 8 - k, 0, TAU); g.fill(); for (let i = 0; i < 6 + k; i++) { const a = i * 2.39 + k, d = 9 + ((i * 7 + k * 3) % 5); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 1.5 + ((i + k) % 3), 0, TAU); g.fill(); } } };
}
// brush-stroke dabs for the flow-field sky: tapered, with bristle grooves (white; tinted at runtime)
for (let k = 0; k < 6; k++) {
  const L = 40 + k * 6, Wd = 7 + (k % 3) * 2;
  P[`fx.stroke.${k}`] = {
    w: L + 4, h: Wd * 2 + 4,
    draw(g) {
      g.beginPath(); g.moveTo(-L / 2, 0);
      g.bezierCurveTo(-L / 3, -Wd, L / 3, -Wd * 0.9, L / 2, -1);
      g.bezierCurveTo(L / 3, Wd * 0.8, -L / 3, Wd, -L / 2, 0);
      g.fillStyle = '#fff'; g.fill();
      g.save(); g.clip();
      for (let i = -3; i <= 3; i++) { g.strokeStyle = `rgba(0,0,0,${0.08 + 0.05 * ((i + k) & 1)})`; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-L / 2, i * Wd / 3.6); g.quadraticCurveTo(0, i * Wd / 3.6 + ((i + k) % 2 ? 1 : -1), L / 2, i * Wd / 4.2); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-L * 0.1, -Wd * 0.35, L * 0.32, Wd * 0.2, 0, 0, TAU); g.fill();
      g.restore();
    },
  };
}
// pickups (world units: sun r~11, acorn ~22 tall, gem 22, dew r~9, chip r~10, power-ups r~13)
P['pickup.sun'] = { w: 32, h: 32, draw(g) { g.fillStyle = 'rgba(16,32,27,0.6)'; g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill(); g.fillStyle = SEED; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); g.fillStyle = SEED_HOT; g.beginPath(); g.arc(-1.8, -2, 4.8, 0, TAU); g.fill(); } };
P['pickup.dew'] = { w: 32, h: 36, draw(g) { const r = 9; g.beginPath(); g.moveTo(0, -r * 1.4); g.quadraticCurveTo(r, 0, 0, r * 0.9); g.quadraticCurveTo(-r, 0, 0, -r * 1.4); g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#78bfe0'; g.fill(); g.fillStyle = '#f4fbff'; g.beginPath(); g.ellipse(-r * 0.25, 0, r * 0.15, r * 0.3, 0, 0, TAU); g.fill(); } };
P['pickup.acorn'] = { w: 28, h: 34, draw(g) { g.lineJoin = 'round'; g.beginPath(); g.ellipse(0, 4, 8.5, 10.5, 0, 0, TAU); g.fillStyle = '#c9803e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); g.fillStyle = '#e8a860'; g.beginPath(); g.ellipse(-3, 3, 2.5, 5, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(0, -5, 11, 6, 0, Math.PI, TAU); g.lineTo(11, -4); g.quadraticCurveTo(0, 0, -11, -4); g.closePath(); g.fillStyle = '#7a4a22'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -11); g.quadraticCurveTo(2, -15, 5, -15); g.lineWidth = 2.5; g.stroke(); } };
P['pickup.gem'] = { w: 30, h: 34, draw(g) { const rr = 11, Pp = [[0, -1.5], [0.82, -0.2], [0.62, 0.72], [0, 1.08], [-0.62, 0.72], [-0.82, -0.2]].map(([a, b]) => [a * rr, b * rr]); g.beginPath(); Pp.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#6f6fe6'; g.fill(); const C = [0, rr * 0.15], cols = ['#a9c4ff', '#8fa0ff', '#5a56d0', '#4b46b8', '#6a62dc', '#c3d6ff']; for (let i = 0; i < 6; i++) { const a = Pp[(i + 5) % 6], b = Pp[i]; g.fillStyle = cols[i]; g.beginPath(); g.moveTo(C[0], C[1]); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.closePath(); g.fill(); } } };
P['pickup.chip'] = { w: 28, h: 28, draw(g) { const r = 10; g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * TAU / 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#c98a4a'; g.fill(); g.strokeStyle = '#7a4a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(-5, -2); g.lineTo(5, -2); g.moveTo(-4, 2.5); g.lineTo(3, 2.5); g.stroke(); } };
const token = (fill, glyph) => ({ w: 36, h: 36, draw(g) { g.fillStyle = INK; g.beginPath(); g.arc(1.5, 2, 14, 0, TAU); g.fill(); g.fillStyle = fill; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke(); glyph(g); } });
P['pickup.pollen'] = token('#ffe7a0', (g) => { g.fillStyle = SEED; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 3.2, 2, a, 0, TAU); g.fill(); } g.fillStyle = '#7a4a22'; g.beginPath(); g.arc(0, 0, 2.6, 0, TAU); g.fill(); });
P['pickup.ink'] = token('#f4ecd8', (g) => { g.fillStyle = INK; g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(7, 2, 0, 7); g.quadraticCurveTo(-7, 2, 0, -8); g.fill(); g.fillStyle = '#fff'; g.font = '700 7px sans-serif'; g.textAlign = 'center'; g.fillText('×2', 0, 4); });
P['pickup.rush'] = token('#bfe08a', (g) => { g.strokeStyle = INK; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round'; for (const dy of [-1, 5]) { g.beginPath(); g.moveTo(-6, dy + 2); g.lineTo(0, dy - 5); g.lineTo(6, dy + 2); g.stroke(); } });
P['pickup.generic'] = token('#ffe7a0', (g) => { g.fillStyle = SEED; g.beginPath(); g.moveTo(0, -7); g.lineTo(7, 0); g.lineTo(0, 7); g.lineTo(-7, 0); g.closePath(); g.fill(); });
// enemy beetle, 2 scuttle frames (facing +x)
for (let fr = 0; fr < 2; fr++) {
  P[`enemy.beetle.${fr}`] = {
    w: 56, h: 40,
    draw(g) {
      g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i < 3; i++) { const lx = -6 + i * 6, sw = (fr ? 3 : -3) * (i & 1 ? -1 : 1); g.moveTo(lx, -6); g.lineTo(lx + sw - 2, -15); g.moveTo(lx, 6); g.lineTo(lx - sw - 2, 15); }
      g.strokeStyle = '#b39bff'; g.lineWidth = 4.2; g.stroke(); g.strokeStyle = '#2a1840'; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = '#b39bff'; g.beginPath(); g.arc(12, 0, 8, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-2, 0, 16.5, 13.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#2a1840'; g.beginPath(); g.arc(12, 0, 6, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-2, 0, 14.5, 11.5, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(179,155,255,0.75)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-15, 0); g.lineTo(9, 0); g.stroke();
      g.fillStyle = 'rgba(179,155,255,0.45)'; g.beginPath(); g.ellipse(-5, -5, 7, 3, -0.2, 0, TAU); g.fill();
      g.fillStyle = CREAM; g.beginPath(); g.arc(15, -2.6, 1.5, 0, TAU); g.arc(15, 2.6, 1.5, 0, TAU); g.fill();
    },
  };
}
// vine tip bud (white-ish, shaded; tinted per skin)
P['vine.bud'] = { w: 32, h: 40, draw(g) { g.lineJoin = 'round'; g.beginPath(); g.moveTo(0, -15); g.bezierCurveTo(9, -8, 9, 6, 0, 10); g.bezierCurveTo(-9, 6, -9, -8, 0, -15); g.fillStyle = KEY; g.save(); g.scale(1.18, 1.12); g.fill(); g.restore(); g.fillStyle = '#fff'; g.fill(); g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.moveTo(0, -15); g.bezierCurveTo(9, -8, 9, 6, 0, 10); g.bezierCurveTo(4, 2, 4, -8, 0, -15); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-3, -5, 2, 4.5, -0.3, 0, TAU); g.fill(); } };
P['vine.dot'] = { w: 24, h: 24, draw(g) { g.fillStyle = KEY; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 7.5, 0, TAU); g.fill(); } };
// per-skin leaves (pivot at the stem end = left edge, see anchors below)
for (const [id, s] of Object.entries(VINE_SKINS)) {
  for (const [suf, col] of [['', s.leaf.fill], ['.dark', s.leaf.dark]]) {
    P[`leaf.${id}${suf}`] = {
      w: 32, h: 18, ax: 0.02,
      draw(g) { g.translate(-15, 0); leafPath(g, 30, s.leaf.shape === 'dab' ? 0.5 : 0.42, s.leaf.shape); g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(16,32,27,0.85)'; g.lineWidth = s.leaf.shape === 'dab' ? 0 : 1.8; if (g.lineWidth) g.stroke(); g.strokeStyle = s.leaf.vein; g.globalAlpha = 0.55; g.lineWidth = 1; g.beginPath(); g.moveTo(2, 0); g.lineTo(24, 0); g.stroke(); },
    };
  }
}
// generic placeholder slots for unknown registry ids (painted on demand, see placeholder())
const SLOTS = 24;
for (let i = 0; i < SLOTS; i++) P[`_slot.${i}`] = { w: 48, h: 48, draw() {} };

/** Packs every painter into one canvas page. Returns { canvas, frames:{id:{x,y,w,h,ax,ay}}, res }. */
export function buildAtlas(maxW = 1024) {
  const items = Object.entries(P).map(([id, p]) => ({ id, p, pw: Math.ceil(p.w * RES) + 4, ph: Math.ceil(p.h * RES) + 4 }));
  items.sort((a, b) => b.ph - a.ph);
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x + it.pw > maxW) { x = 0; y += rowH; rowH = 0; }
    it.x = x; it.y = y; x += it.pw; rowH = Math.max(rowH, it.ph);
  }
  const H = Math.min(2048, 1 << Math.ceil(Math.log2(y + rowH)));
  const cv = document.createElement('canvas'); cv.width = maxW; cv.height = H;
  const g = cv.getContext('2d');
  const frames = {};
  for (const it of items) {
    g.save(); g.translate(it.x + it.pw / 2, it.y + it.ph / 2); g.scale(RES, RES);
    try { it.p.draw(g); } catch { /* a broken painter leaves an empty frame */ }
    g.restore();
    frames[it.id] = { x: it.x + 2, y: it.y + 2, w: it.pw - 4, h: it.ph - 4, ax: it.p.ax != null ? it.p.ax : 0.5, ay: 0.5 };
  }
  return { canvas: cv, ctx: g, frames, res: RES, slots: SLOTS };
}

/** Paints a clean generic placeholder for an unknown id into a free slot (hashed hue + initial). */
export function paintPlaceholder(atlas, slot, id) {
  const f = atlas.frames[`_slot.${slot}`], g = atlas.ctx;
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360, danger = /trap|enemy|boss|hazard/.test(id);
  g.save(); g.clearRect(f.x, f.y, f.w, f.h); g.translate(f.x + f.w / 2, f.y + f.h / 2); g.scale(RES, RES);
  g.lineJoin = 'round';
  g.beginPath();
  if (danger) { g.moveTo(0, -20); g.lineTo(19, 15); g.lineTo(-19, 15); g.closePath(); } else { g.arc(0, 0, 19, 0, TAU); }
  g.fillStyle = danger ? '#e2603f' : `hsl(${hue},55%,62%)`; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  g.fillStyle = INK; g.font = '800 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = id.split('.').filter((s) => !/^(trap|enemy|pickup|vehicle|icon|fx|boss|set)$/.test(s)).pop() || id;
  g.fillText(word.slice(0, 2).toUpperCase(), 0, danger ? 4 : 1);
  g.restore();
  return f;
}
