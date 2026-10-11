// P7-WORLD: layered-silhouette backdrop (art direction A, Alto's-like haze).
//
// Back to front, all in screen space:
//   sky plate (stretched, parallax 0) → L1 far plate copy (0.08, small, hazy)
//   → fog → L2 far plate (0.25) → centre haze over the play band
//   → L3 side frame, fog-tinted (0.5) → god rays (day zones) → ambient particles
//   → L4 side frame (1.0) → L4+ code-drawn foreground clumps (1.1, outer 20% only).
// Plates are small WebPs in assets/art/w-*.webp; until a plate has decoded the
// zone's gradient stands in, so a slow network never blocks play. Zones
// cross-fade over FADE metres. Parallax reads a lightly damped camera.
//
// Seasons / skins can retint it: backdrop.setTheme({ tint: '#hex', amount: 0.25,
// zones: { oak: { top: '#hex', ... } } }); backdrop.setTheme(null) resets.
//
// P8-MAPS: backdrop.setMap(map) swaps the whole world for a map theme from
// src/maps.js: its own sky/far/side plates (m-*-<id>.webp, streamed on pick),
// five zone palettes (day -> night with height), zone names, particles and a
// foreground clump style. setMap(null) (or the 'forkwood' map) restores the
// classic per-zone plates. The API above is unchanged; themes stack on top.
import { loadArt, art } from './art.js';
import { zonePalettes as zonePal } from './maps.js';
import quality from './quality.js'; // v1.0.1 PERF

const TAU = Math.PI * 2;
const FADE = 46; // metres of cross-fade around each zone boundary

// Palettes from the art bible §2.1. top/bot = sky, mass = L1, mid = L2, lite = L3,
// deep = L4, fog, ray, acc = accent (stars, snow), crit = critter/particle tint.
// `cloud` kept for older theme overrides.
export const ZONES = [
  { id: 'meadow', name: 'Meadow', plate: 'meadow', m0: 0, m1: 200,
    top: '#8db9b6', bot: '#f3d3ae', mass: '#c4cdb2', mid: '#8faa94', lite: '#4e7464', deep: '#173029',
    fog: '#e3cdb0', ray: '#ffe6b3', acc: '#fff4dc', crit: '#ffe6b3', cloud: '#fff6e6', farA: 0.62, rays: 1 },
  { id: 'oak', name: 'Oak forest', plate: 'oak', m0: 200, m1: 450,
    top: '#6e9890', bot: '#edbf92', mass: '#bdb397', mid: '#83937c', lite: '#435c50', deep: '#14241f',
    fog: '#ddc2a2', ray: '#ffd58a', acc: '#ffd58a', crit: '#c8762f', cloud: '#fff1dc', farA: 0.58, rays: 1 },
  { id: 'snow', name: 'Snowy pines', plate: 'pine', m0: 450, m1: 800,
    top: '#7f98b6', bot: '#e6dfe0', mass: '#bac6d2', mid: '#8599ae', lite: '#4a6176', deep: '#16222e',
    fog: '#cfd7e0', ray: '#ffefd6', acc: '#fbfdff', crit: '#f4f8ff', cloud: '#f2f5fa', farA: 0.5, rays: 0.7 },
  { id: 'storm', name: 'Storm canopy', plate: 'storm', m0: 800, m1: 1200,
    top: '#353f52', bot: '#7a8291', mass: '#636c7c', mid: '#4a5366', lite: '#2f3747', deep: '#12171f',
    fog: '#6c7483', ray: '#cfe0ff', acc: '#cfe0ff', crit: '#9fb0a0', cloud: '#a9b0bd', farA: 0.45, rays: 0 },
  { id: 'sky', name: 'Starry sky', plate: 'stars', m0: 1200, m1: 1e9,
    top: '#0b1029', bot: '#2a3060', mass: '#262c59', mid: '#1c2248', lite: '#141935', deep: '#080b1c',
    fog: '#353c70', ray: '#fff1c4', acc: '#fff1c4', crit: '#fff1c4', cloud: '#5a5f98', farA: 0.8, rays: 0 },
];
const KEYS = ['top', 'bot', 'mass', 'mid', 'lite', 'deep', 'fog', 'ray', 'acc', 'crit', 'cloud'];
// colour grade per zone (bible §2.4), applied by drawPost
const GRADE = [['soft-light', '#ffd9a8', 0.10], ['soft-light', '#ffb86b', 0.12], ['soft-light', '#b9c6ff', 0.10], ['multiply', '#9aa6c4', 0.10], ['screen', '#2b2f7a', 0.08]];
// moon position in the stars sky plate (fraction of the cover-fitted plate)
const MOON = { u: 0.76, v: 0.155, r: 0.17 };

// ------------------------------------------------------------------ colour
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a >= 1 ? 1 : Math.max(0, a).toFixed(3)})`;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

let theme = null, themeRev = 0;
let pal = null;
// P8-MAPS: the active map (null = classic) and its five zone palettes
let mapDef = null, mapPal = null;
const ZONE_NAMES = ZONES.map((z) => z.name);
// per-zone plate treatment for maps: one plate set re-lit from day to night
const SKY_A = [1, 0.9, 0.62, 0.36, 0.16];
const WASH = [0, 0.14, 0.34, 0.56, 0.82];
const FAR_A = [0.62, 0.58, 0.52, 0.46, 0.4];
const farA = (zi) => (mapDef && mapDef.plates ? FAR_A[zi] : ZONES[zi].farA);
function resolve() {
  if (pal) return pal;
  const tint = theme && theme.tint ? hex(theme.tint) : null, amt = theme && theme.amount != null ? theme.amount : 0.25;
  pal = ZONES.map((z, zi) => {
    const o = { ...z, ...(mapPal ? mapPal[zi] : {}), ...((theme && theme.zones && theme.zones[z.id]) || {}) };
    const r = {};
    for (const k of KEYS) { r[k] = hex(o[k]); if (tint) r[k] = lerp(r[k], tint, amt * 0.6); }
    return r;
  });
  return pal;
}

/** Zone index, its weight pair for cross-fades, and progress through it. */
export function zoneAt(m) {
  let i = 0;
  for (let k = ZONES.length - 1; k >= 0; k--) if (m >= ZONES[k].m0) { i = k; break; }
  const Z = ZONES[i], N = ZONES[i + 1];
  let j = i, w = 0;
  if (N && m > N.m0 - FADE / 2) { j = i + 1; w = (m - (N.m0 - FADE / 2)) / FADE; }
  else if (i > 0 && m < Z.m0 + FADE / 2) { j = i - 1; w = 0.5 - (m - Z.m0) / FADE; }
  const prog = N ? Math.min(1, Math.max(0, (m - Z.m0) / (Z.m1 - Z.m0))) : 1;
  return { i, j, w: Math.max(0, Math.min(1, w)), prog, zone: Z, next: N || null, toNext: N ? Math.max(0, Math.ceil(N.m0 - m)) : 0 };
}
function blendPal(z) {
  const P = resolve(), a = P[z.i], b = P[z.j], o = {};
  for (const k of KEYS) o[k] = lerp(a[k], b[k], z.w);
  return o;
}

// ------------------------------------------------------------------ assets
const name = (layer, zi) => (mapDef && mapDef.plates ? `m-${layer}-${mapDef.plates}` : `w-${layer}-${ZONES[zi].plate}`);
/** First-load set: the meadow plates and the particle sheet. */
export const WORLD_CRITICAL = ['w-sky-meadow', 'w-far-meadow', 'w-side-meadow', 'w-sprites-fx'];
function ensureZone(zi) { for (const l of ['sky', 'far', 'side']) loadArt(name(l, zi)); }
const rawImg = (layer, zi) => art(name(layer, zi));
// P8-MAPS: in a map, higher zones see the same plates washed toward the zone's
// own colours (far -> mid, side -> deep), cached once per zone.
const washed = new Map();
function img(layer, zi) {
  const im = rawImg(layer, zi);
  if (!im || !mapDef || !mapDef.plates || layer === 'sky' || !WASH[zi] || typeof document === 'undefined') return im;
  const key = `${layer}:${zi}:${themeRev}`;
  let c = washed.get(key);
  if (c && c.src === im) return c.cv;
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.naturalWidth = cv.width; cv.naturalHeight = cv.height;
  const g = cv.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const P = resolve()[zi];
  g.fillStyle = css(layer === 'far' ? lerp(P.mid, P.fog, 0.25) : P.deep, WASH[zi]); g.fillRect(0, 0, cv.width, cv.height);
  washed.set(key, { src: im, cv });
  return cv;
}

// fog-tinted copy of a zone's side plate for the L3 layer (built once per zone/theme)
const tinted = new Map();
function tintedSide(zi) {
  const key = zi + ':' + themeRev;
  if (tinted.has(key)) return tinted.get(key);
  const im = img('side', zi);
  if (!im || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth >> 1; c.height = im.naturalHeight >> 1; // half res = free softness
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-atop';
  const P = resolve()[zi];
  g.fillStyle = css(lerp(P.lite, P.fog, 0.35), 0.78); g.fillRect(0, 0, c.width, c.height);
  tinted.set(key, c);
  return c;
}

// ------------------------------------------------------------------ helpers
/** Tile a vertical strip (source columns sx..sx+sw) down the screen. */
function tileY(ctx, im, sx, sw, dx, dw, scale, off, ch, alpha) {
  if (alpha <= 0.004) return;
  const sh = im.height || im.naturalHeight, th = sh * scale;
  ctx.globalAlpha = Math.min(1, alpha);
  for (let y = ((off % th) + th) % th - th; y < ch; y += th) ctx.drawImage(im, sx, 0, sw, sh, dx, Math.floor(y), dw, Math.ceil(th) + 1);
  ctx.globalAlpha = 1;
}
/** Tile a far plate down and, on wide screens, across (centre copy at x0, width dw). */
function tileXY(ctx, im, x0, dw, cw, scale, off, ch, alpha) {
  tileY(ctx, im, 0, 540, x0, dw, scale, off, ch, alpha);
  if (dw >= cw * 0.98) return;
  for (let x = x0 - dw; x > -dw; x -= dw) tileY(ctx, im, 0, 540, x, dw, scale, off + dw * 0.37, ch, alpha);
  for (let x = x0 + dw; x < cw; x += dw) tileY(ctx, im, 0, 540, x, dw, scale, off + dw * 0.61, ch, alpha);
}
function skyCover(ctx, im, cw, ch, a) {
  const iw = im.naturalWidth, ih = im.naturalHeight, k = Math.max(cw / iw, ch / ih);
  ctx.globalAlpha = a;
  ctx.drawImage(im, (cw - iw * k) / 2, (ch - ih * k) / 2, iw * k, ih * k);
  ctx.globalAlpha = 1;
}
function moonPos(cw, ch) {
  const iw = 270, ih = 484, k = Math.max(cw / iw, ch / ih);
  return { x: (cw - iw * k) / 2 + MOON.u * iw * k, y: (ch - ih * k) / 2 + MOON.v * ih * k, r: MOON.r * iw * k };
}

// god ray strip, rendered once
let rayCanvas = null;
function rays() {
  if (rayCanvas || typeof document === 'undefined') return rayCanvas;
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(52, 0); g.lineTo(76, 0); g.lineTo(128, 512); g.lineTo(0, 512); g.closePath(); g.fill();
  // soften the sides
  g.globalCompositeOperation = 'destination-in';
  const hg = g.createLinearGradient(0, 0, 128, 0);
  hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.5, '#000'); hg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hg; g.fillRect(0, 0, 128, 512);
  rayCanvas = c;
  return c;
}

// ------------------------------------------------------------------ foreground clumps (L4+, code-drawn)
const clumps = new Map();
function clumpSprite(zi, s, side, k) {
  const key = `${zi}:${s}:${side}:${k.toFixed(2)}:${themeRev}`;
  let sp = clumps.get(key);
  if (sp) return sp;
  if (typeof document === 'undefined') return null;
  const P = resolve()[zi];
  const id = mapDef && mapDef.clump ? ({ bough: 'snow', vine: 'sky' }[mapDef.clump] || mapDef.clump) : ZONES[zi].id;
  const w = Math.ceil(110 * k), h = Math.ceil(220 * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (side > 0) { g.translate(w, 0); g.scale(-1, 1); } // shape only; drawn anchored to the edge
  g.fillStyle = css(P.deep);
  const r0 = hash(s * 3.1 + zi);
  if (id === 'snow') {
    // a dark pine bough reaching in from the edge
    g.beginPath(); g.moveTo(0, h * 0.42); g.lineTo(w * 0.9, h * 0.5); g.lineTo(0, h * 0.56); g.fill();
    for (let i = 0; i < 6; i++) { const x = w * (0.12 + i * 0.13), y = h * (0.47 + i * 0.006); g.beginPath(); g.moveTo(x - 10 * k, y); g.lineTo(x + 18 * k, y + (22 - i * 2) * k); g.lineTo(x + 4 * k, y + 2); g.fill(); g.beginPath(); g.moveTo(x - 10 * k, y); g.lineTo(x + 18 * k, y - (16 - i * 2) * k); g.lineTo(x + 4 * k, y - 2); g.fill(); }
  } else if (id === 'sky') {
    // a hanging star-vine with a few leaves
    g.strokeStyle = css(P.deep); g.lineWidth = 3 * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(w * 0.5, h * 0.25, w * 0.1, h * 0.55, w * 0.45, h * 0.8); g.stroke();
    for (let i = 0; i < 5; i++) { const t = 0.2 + i * 0.14, x = w * (0.25 + 0.2 * Math.sin(t * 7)), y = h * t; g.beginPath(); g.ellipse(x, y, 9 * k, 4 * k, 0.6 + i, 0, TAU); g.fill(); }
  } else if (id === 'bamboo' || id === 'fern') {
    // P8-MAPS: a spray of slim leaves (bamboo) or a fern frond reaching in from the edge
    g.strokeStyle = css(P.deep); g.lineCap = 'round';
    g.lineWidth = (id === 'bamboo' ? 4 : 3) * k;
    g.beginPath(); g.moveTo(0, h * 0.58); g.quadraticCurveTo(w * 0.45, h * 0.5, w * 0.92, h * 0.36); g.stroke();
    const n = id === 'bamboo' ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const t = 0.15 + (i / n) * 0.8, x = w * 0.92 * t, y = h * (0.58 - 0.22 * t * t);
      const L = (id === 'bamboo' ? 34 - i * 2 : 22 - i) * k, sgn = i % 2 ? 1 : -1;
      g.save(); g.translate(x, y); g.rotate(sgn * (id === 'bamboo' ? 0.7 : 1.2) + (id === 'bamboo' ? 0.5 : 0.2));
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -L * 0.14, L, 0); g.quadraticCurveTo(L * 0.5, L * 0.14, 0, 0); g.fill(); g.restore();
    }
  } else if (id === 'bean') {
    // P8-MAPS: a curling beanstalk tendril with heart-shaped leaves
    g.strokeStyle = css(P.deep); g.lineCap = 'round'; g.lineWidth = 6 * k;
    g.beginPath(); g.moveTo(0, h * 0.7); g.bezierCurveTo(w * 0.5, h * 0.62, w * 0.2, h * 0.4, w * 0.6, h * 0.32); g.stroke();
    g.lineWidth = 2.2 * k; g.beginPath(); g.arc(w * 0.66, h * 0.27, 9 * k, 3.6, 3.6 + 4.8); g.stroke();
    for (const [u, v, r, a] of [[0.25, 0.58, 20, 0.4], [0.42, 0.44, 16, -0.6], [0.12, 0.66, 14, 1.2]]) {
      g.save(); g.translate(w * u, h * v); g.rotate(a); const R = r * k;
      g.beginPath(); g.moveTo(0, R); g.bezierCurveTo(-R * 1.4, R * 0.1, -R * 0.7, -R * 1.1, 0, -R * 0.45); g.bezierCurveTo(R * 0.7, -R * 1.1, R * 1.4, R * 0.1, 0, R); g.fill(); g.restore();
    }
  } else {
    // a scalloped leaf clump on a short branch
    g.strokeStyle = css(P.deep); g.lineWidth = 7 * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, h * 0.62); g.quadraticCurveTo(w * 0.35, h * 0.55, w * 0.55, h * 0.45); g.stroke();
    g.beginPath();
    const n = 7 + Math.floor(r0 * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, d = (22 + hash(s + i) * 14) * k;
      const x = w * 0.45 + Math.cos(a) * d * 1.1, y = h * 0.42 + Math.sin(a) * d * 0.9, r = (16 + hash(s * 2 + i) * 10) * k;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
    g.arc(w * 0.4, h * 0.42, 30 * k, 0, TAU);
    g.fill();
  }
  sp = { c, w, h };
  clumps.set(key, sp);
  if (clumps.size > 40) clumps.delete(clumps.keys().next().value);
  return sp;
}

// ------------------------------------------------------------------ particles (pooled, screen space)
const FX = { bird: [0, 64, 128], leaf: 192, snow: 256, glow: 320 };
const POOL = [];
const MAXP = 26;
for (let i = 0; i < MAXP; i++) POOL.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, s: 1, r: 0, vr: 0, ph: 0, kind: '', a: 0 });
// which particles each zone spawns, and how many at once
const AMB = { meadow: [['glow', 10]], oak: [['leaf', 7], ['bird', 3]], snow: [['snow', 18]], storm: [['leaf', 9]], sky: [['glow', 12]] };
const ambFor = (zi) => (mapDef && mapDef.amb ? mapDef.amb[zi] || [] : AMB[ZONES[zi].id]);
// P8-MAPS: code-drawn particle kinds (no sprite needed), coloured by the map's pcol
const CODE = new Set(['blade', 'petal', 'crumb', 'mote', 'morpho', 'feather', 'drop']);
let lastT = 0, birdT = 0;
function spawn(kind, cw, ch, fresh, P) {
  const p = POOL.find((q) => !q.on);
  if (!p) return;
  p.on = true; p.kind = kind; p.ph = Math.random() * TAU; p.r = Math.random() * TAU; p.a = 0;
  const edge = () => (Math.random() < 0.5 ? Math.random() * cw * 0.22 : cw - Math.random() * cw * 0.22);
  if (CODE.has(kind)) {
    const col = (mapDef && mapDef.pcol && mapDef.pcol[kind]) || '#fff4dc';
    p.col = Array.isArray(col) ? col[(Math.random() * col.length) | 0] : col;
  }
  if (kind === 'drop') { p.s = 0.6 + Math.random() * 0.6; p.x = Math.random() * cw; p.y = fresh ? Math.random() * ch : -20; p.vx = -18; p.vy = 380 + Math.random() * 160; p.vr = 0; p.r = 0; return; }
  if (kind === 'mote') { p.s = 0.6 + Math.random() * 1.2; p.x = Math.random() < 0.7 ? edge() : Math.random() * cw; p.y = Math.random() * ch; p.vx = (Math.random() - 0.5) * 6; p.vy = -3 - Math.random() * 5; p.vr = 0; return; }
  if (kind === 'morpho') { const dir = Math.random() < 0.5 ? 1 : -1; p.s = 0.8 + Math.random() * 0.4; p.x = dir > 0 ? -20 : cw + 20; p.y = ch * (0.15 + Math.random() * 0.7); p.vx = dir * (22 + Math.random() * 16); p.vy = -4 + Math.random() * 8; p.vr = 0; return; }
  if (kind === 'blade' || kind === 'petal' || kind === 'crumb' || kind === 'feather') {
    p.s = kind === 'crumb' ? 0.7 + Math.random() * 0.6 : 0.8 + Math.random() * 0.5; p.x = edge(); p.y = fresh ? Math.random() * ch : -16;
    p.vx = (Math.random() - 0.4) * (kind === 'feather' ? 14 : 24); p.vy = kind === 'feather' ? 14 + Math.random() * 10 : kind === 'crumb' ? 38 + Math.random() * 20 : 24 + Math.random() * 20; p.vr = (Math.random() - 0.5) * (kind === 'crumb' ? 1 : 2.6); return;
  }
  if (kind === 'snow') { p.s = 0.12 + Math.random() * 0.16; p.x = Math.random() * cw; p.y = fresh ? Math.random() * ch : -10; p.vx = -6 + Math.random() * 12; p.vy = 18 + p.s * 120; p.vr = (Math.random() - 0.5) * 0.8; }
  else if (kind === 'leaf') { p.s = 0.22 + Math.random() * 0.12; p.x = edge(); p.y = fresh ? Math.random() * ch : -16; p.vx = (Math.random() - 0.3) * 30; p.vy = 26 + Math.random() * 22; p.vr = (Math.random() - 0.5) * 3; }
  else if (kind === 'glow') { p.s = 0.16 + Math.random() * 0.14; p.x = edge(); p.y = Math.random() * ch; p.vx = 0; p.vy = -4 - Math.random() * 6; p.vr = 0; }
  else if (kind === 'bird') { const dir = Math.random() < 0.5 ? 1 : -1; p.s = 0.3 + Math.random() * 0.12; p.x = dir > 0 ? -30 : cw + 30; p.y = ch * (0.06 + Math.random() * 0.16); p.vx = dir * (55 + Math.random() * 25); p.vy = -3; p.vr = 0; }
}
function stepParticles(dt, cw, ch, z, calm) {
  const want = {};
  for (const [zi, wt] of [[z.i, 1 - z.w], [z.j, z.w]]) if (wt > 0.3) for (const [k, n] of ambFor(zi)) want[k] = Math.max(want[k] || 0, n);
  const have = {};
  for (const p of POOL) if (p.on) have[p.kind] = (have[p.kind] || 0) + 1;
  for (const k in want) {
    if (k === 'bird') { birdT -= dt; if (birdT <= 0 && (have.bird || 0) === 0) { birdT = 6 + Math.random() * 6; for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) spawn('bird', cw, ch, false); } continue; }
    const cap = Math.ceil(want[k] * quality.T.amb); // v1.0.1 PERF: fewer motes on low tiers
    for (let n = have[k] || 0; n < cap; n++) spawn(k, cw, ch, lastT === 0);
  }
  for (const p of POOL) {
    if (!p.on) continue;
    if (!want[p.kind]) p.a -= dt * 1.5; else p.a = Math.min(1, p.a + dt * 1.2);
    if (calm) continue;
    const sway = p.kind === 'leaf' || p.kind === 'snow' || p.kind === 'blade' || p.kind === 'petal' || p.kind === 'feather';
    p.x += (p.vx + (sway ? Math.sin(p.ph + lastT * 1.3) * 14 : 0) + (p.kind === 'morpho' ? Math.sin(lastT * 1.7 + p.ph) * 18 : 0)) * dt;
    if (p.kind === 'mote') p.x += Math.sin(lastT * 0.6 + p.ph) * 5 * dt;
    p.y += p.vy * dt + (p.kind === 'bird' ? Math.sin(lastT * 2 + p.ph) * 0.3 : 0);
    if (p.kind === 'glow') p.x += Math.sin(lastT * 0.7 + p.ph) * 6 * dt;
    if (p.kind === 'morpho') p.y += Math.sin(lastT * 2.3 + p.ph) * 12 * dt;
    p.r += p.vr * dt;
    if (p.y > ch + 30 || p.y < -40 || p.x < -60 || p.x > cw + 60 || p.a < 0) p.on = false;
  }
}
function drawParticles(ctx, sheet, t, calm) {
  for (const p of POOL) {
    if (!p.on || p.a <= 0) continue;
    if (CODE.has(p.kind)) { drawCode(ctx, p, t, calm); continue; }
    const sz = 64 * p.s;
    let sx = 0;
    if (p.kind === 'bird') sx = FX.bird[calm ? 1 : Math.floor((t * 8 + p.ph) % 3)];
    else sx = FX[p.kind];
    const glow = p.kind === 'glow';
    ctx.globalAlpha = p.a * (glow ? 0.55 + 0.45 * Math.sin(t * 2.2 + p.ph * 3) : p.kind === 'snow' ? 0.85 : 0.8);
    if (glow) ctx.globalCompositeOperation = 'lighter';
    if (p.r && p.kind !== 'bird') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.drawImage(sheet, sx, 0, 64, 64, -sz / 2, -sz / 2, sz, sz); ctx.restore();
    } else {
      if (p.kind === 'bird' && p.vx < 0) { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(-1, 1); ctx.drawImage(sheet, sx, 0, 64, 64, -sz / 2, -sz / 2, sz, sz); ctx.restore(); }
      else ctx.drawImage(sheet, sx, 0, 64, 64, p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

function drawCode(ctx, p, t, calm) {
  ctx.fillStyle = p.col || '#fff4dc';
  const k = p.kind, s = p.s;
  if (k === 'drop') { ctx.globalAlpha = p.a * 0.32; ctx.fillRect(p.x, p.y, 1.2, 12 * s); ctx.globalAlpha = 1; return; }
  if (k === 'mote') {
    ctx.globalAlpha = p.a * (0.35 + 0.25 * Math.sin((t || 0) * 1.4 + p.ph * 3)); ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 * s, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; return;
  }
  ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = p.a * 0.85;
  if (k === 'morpho') {
    const flap = calm ? 0.7 : 0.25 + 0.75 * Math.abs(Math.sin((t || 0) * 9 + p.ph));
    ctx.scale(s, s);
    for (const sg of [-1, 1]) { ctx.save(); ctx.scale(sg * flap, 1); ctx.beginPath(); ctx.ellipse(4.5, -2.5, 5, 4, -0.5, 0, TAU); ctx.ellipse(3.5, 3, 3.4, 2.8, 0.4, 0, TAU); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = 'rgba(10,20,30,0.85)'; ctx.fillRect(-0.6, -4, 1.2, 8);
  } else if (k === 'crumb') {
    ctx.rotate(p.r); ctx.beginPath(); ctx.moveTo(-2.4 * s, -1.6 * s); ctx.lineTo(2.6 * s, -1.2 * s); ctx.lineTo(1.6 * s, 2 * s); ctx.lineTo(-2 * s, 1.6 * s); ctx.closePath(); ctx.fill();
  } else if (k === 'feather') {
    ctx.rotate(p.r * 0.4 + 0.6); ctx.beginPath(); ctx.ellipse(0, 0, 9 * s, 2.6 * s, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha *= 0.5; ctx.fillStyle = 'rgba(120,80,20,0.8)'; ctx.fillRect(-9 * s, -0.4, 18 * s, 0.8);
  } else {
    // blade (slim leaf) or petal
    ctx.rotate(p.r);
    const L = (k === 'blade' ? 10 : 5) * s, W = (k === 'blade' ? 1.6 : 3.2) * s;
    ctx.beginPath(); ctx.moveTo(-L, 0); ctx.quadraticCurveTo(0, -W * 1.6, L, 0); ctx.quadraticCurveTo(0, W * 1.6, -L, 0); ctx.fill();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ main draw
/**
 * Draw the whole backdrop in screen space.
 * o: { m (metres, camera), camPx (camera height in screen px, grows upward),
 *      playL, playR (playfield edges on screen), t (seconds), calm }
 */
const DBG = {}; // perf toggles for QA scripts only
let lagCam = null, lagT = 0;
let fogCache = { key: '', g0: null, g1: null, g2: null };
// v1.0.1 PERF: the soft back layers (sky, haze, far plates, fog, stars, L3, rays) render into
// one low-resolution buffer that is blitted once; their sources are <= ~1.3 px per CSS px
// anyway, so this costs no visible detail but saves ~8 full-screen passes at device DPR.
let backCv = null, backCtx = null, backN = 0;
function draw(ctx, cw, ch, o) {
  const z = zoneAt(o.m), C = blendPal(z);
  const calm = !!o.calm, t = calm ? 0 : o.t;
  // damped camera for parallax (snaps on teleports)
  const dt = Math.min(0.1, Math.max(0, o.t - lagT)); lagT = o.t;
  if (lagCam == null || Math.abs(o.camPx - lagCam) > ch * 1.5 || calm) lagCam = o.camPx;
  else lagCam += (o.camPx - lagCam) * (1 - Math.exp(-dt * 6));
  const cam = lagCam;
  // stream plates: the current zone, plus the next one ahead of time
  ensureZone(z.i); if (z.j !== z.i) ensureZone(z.j);
  if (z.next && z.toNext < 160) ensureZone(z.i + 1);
  const pairs = z.j === z.i || z.w < 0.002 ? [[z.i, 1]] : z.w > 0.998 ? [[z.j, 1]] : [[z.i, 1 - z.w], [z.j, z.w]];
  const dens = (a) => Math.min(1, a * 2); // transparent layers: no density dip mid-fade

  const T = quality.T, main = ctx;
  // v1.0.1: plates are 540 px wide; on wide screens cap the upscale (was cw/540 = 3.5x on a
  // 1920 desktop, very blurry) and tile the far plates across instead of stretching them
  const base = Math.min(cw / 540, Math.max(1.25, ch / 700));
  const bd = Math.min(T.back, o.dpr || 1);
  const bw = Math.max(1, Math.round(cw * bd)), bh = Math.max(1, Math.round(ch * bd));
  if (DBG.noBack) { backCv = null; backCtx = null; }
  else if (!backCv && typeof document !== 'undefined') { backCv = document.createElement('canvas'); backCtx = backCv.getContext('2d', { alpha: false }); }
  if (backCv && (backCv.width !== bw || backCv.height !== bh)) { backCv.width = bw; backCv.height = bh; backN = 0; }
  backN++;
  // low tiers refresh the slow parallax layers every other frame
  if (!backCv || backN === 1 || T.backEvery <= 1 || backN % T.backEvery === 1) {
  const ctx = backCv ? backCtx : main;
  if (backCv) ctx.setTransform(bw / cw, 0, 0, bh / ch, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // 1. sky
  const skyFull = pairs.length === 1 && img('sky', pairs[0][0]) && (mapDef && mapDef.plates ? SKY_A[pairs[0][0]] : 1) >= 1;
  if (!skyFull) { // an opaque sky plate covers the gradient completely
    const gk = `${ch}:${C.top}:${C.bot}`;
    if (fogCache.gk !== gk) { fogCache.gk = gk; const g0 = ctx.createLinearGradient(0, 0, 0, ch); g0.addColorStop(0, css(C.top)); g0.addColorStop(1, css(C.bot)); fogCache.g0 = g0; }
    ctx.fillStyle = fogCache.g0; ctx.fillRect(0, 0, cw, ch);
  }
  for (const [zi, a] of pairs) { const s = img('sky', zi); if (s) skyCover(ctx, s, cw, ch, a * (mapDef && mapDef.plates ? SKY_A[zi] : 1)); }
  const night = pairs.reduce((s, [zi, a]) => s + (ZONES[zi].id === 'sky' ? a : 0), 0);
  const moonClip = (zi) => ZONES[zi].id === 'sky' && !(mapDef && mapDef.plates); // P8-MAPS: only the classic stars plate has the moon
  // 2. L1: the far plate again, small and hazy, nearly fog (0.08)
  if (!DBG.far && T.far1) {
    for (const [zi, a] of pairs) {
      const f = img('far', zi); if (!f) continue;
      const k = base * 0.72, dw = 540 * k;
      ctx.save();
      if (moonClip(zi)) { const mp = moonPos(cw, ch); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.arc(mp.x, mp.y, mp.r * 1.25, 0, TAU); ctx.clip('evenodd'); }
      tileXY(ctx, f, (cw - dw) / 2 - cw * 0.18, dw, cw, k, cam * 0.08 + 140, ch, dens(a) * farA(zi) * 0.42);
      ctx.restore();
    }
  }
  // fog sheet L1/L2 and centre haze (cached per zone pair and size)
  const fk = `${cw}x${ch}:${z.i}:${z.j}:${Math.round(z.w * 40)}:${themeRev}`;
  if (fogCache.key !== fk) {
    fogCache.key = fk;
    const g1 = ctx.createLinearGradient(0, 0, 0, ch);
    g1.addColorStop(0, css(C.fog, 0)); g1.addColorStop(0.55, css(C.fog, 0.18)); g1.addColorStop(1, css(C.fog, 0.42));
    const g2 = ctx.createLinearGradient(0, 0, cw, 0);
    g2.addColorStop(0, css(C.fog, 0)); g2.addColorStop(0.3, css(C.fog, 0.16)); g2.addColorStop(0.5, css(C.fog, 0.22)); g2.addColorStop(0.7, css(C.fog, 0.16)); g2.addColorStop(1, css(C.fog, 0));
    fogCache.g1 = g1; fogCache.g2 = g2;
  }
  ctx.fillStyle = fogCache.g1; ctx.fillRect(0, 0, cw, ch);
  // 3. L2: far plate (0.25); storm gets a lower opacity and a fog band to hide its seam
  if (!DBG.far) {
    for (const [zi, a] of pairs) {
      const f = img('far', zi); if (!f) continue;
      const k = base * 1.08, dw = 540 * k;
      ctx.save();
      if (moonClip(zi)) { const mp = moonPos(cw, ch); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.arc(mp.x, mp.y, mp.r * 1.25, 0, TAU); ctx.clip('evenodd'); }
      tileXY(ctx, f, (cw - dw) / 2, dw, cw, k, cam * 0.25, ch, dens(a) * farA(zi));
      ctx.restore();
    }
  }
  ctx.fillStyle = fogCache.g2; ctx.fillRect(0, 0, cw, ch);
  if (night > 0.01) drawStars(ctx, cw, ch, cam, C, night, t);
  // 4. L3: fog-tinted side frames, smaller, at half speed, offset from L4
  if (!DBG.near) {
    for (const [zi, a] of pairs) {
      const sc = tintedSide(zi); if (!sc) continue;
      const k = base * 0.82 * 2; // tinted copy is half res
      const hw = sc.width / 2, dw = hw * k;
      tileY(ctx, sc, 0, hw, -dw * 0.12, dw, k, cam * 0.5 + 211, ch, dens(a) * 0.9);
      tileY(ctx, sc, hw, hw, cw - dw * 0.88, dw, k, cam * 0.5 + 57, ch, dens(a) * 0.9);
    }
  }
  // 5. god rays (additive, breathing; day zones only)
  const rayA = pairs.reduce((s, [zi, a]) => s + ZONES[zi].rays * a, 0);
  if (rayA > 0.01 && !DBG.rays && T.rays) {
    const rc = rays();
    if (rc) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cw * 0.86, -ch * 0.06); ctx.rotate(0.42);
      const breathe = t ? 0.5 + 0.5 * Math.sin(t * 0.4) : 0.6;
      const tint = css(C.ray, 1);
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = rayA * (0.07 + 0.04 * (i === 1 ? breathe : 1 - breathe));
        ctx.drawImage(rc, -cw * 0.25 + i * cw * 0.22, 0, cw * (0.18 + i * 0.05), ch * 1.4);
      }
      ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = 1; void tint;
      ctx.restore();
    }
  }
  }
  if (backCv) { main.globalAlpha = 1; main.drawImage(backCv, 0, 0, cw, ch); }
  // 6. ambient particles (behind the frames, never over the vine's lane centre)
  const sheet = art('w-sprites-fx');
  if (sheet && !DBG.fx) {
    stepParticles(lastT ? Math.min(0.05, dt) : 0, cw, ch, z, calm); lastT = o.t || 1;
    drawParticles(ctx, sheet, t, calm);
  }
  // 7. L4: crisp side frames (1.0); left and right halves at different offsets
  if (!DBG.near) {
    for (const [zi, a] of pairs) {
      const s = img('side', zi); if (!s) continue;
      const k = base * 1.0, hw = s.naturalWidth / 2, dw = hw * k;
      tileY(ctx, s, 0, hw, 0, dw, k, cam * 1.0, ch, dens(a));
      tileY(ctx, s, hw, hw, cw - dw, dw, k * 1.06, cam * 1.0 + s.naturalHeight * k * 0.47, ch, dens(a));
    }
    // 8. L4+: sparse code-drawn foreground clumps (1.1), outer 20% only
    for (const [zi, a] of pairs) {
      const SL = ch * 0.9, off = cam * 1.1;
      const s0 = Math.floor(-off / SL) - 1, s1 = Math.ceil((ch - off) / SL) + 1;
      const kk = Math.max(0.6, Math.min(1.1, cw / 420));
      for (let sl = s0; sl <= s1; sl++) {
        const h = hash(sl * 5.7 + zi * 31);
        if (h < 0.45) continue;
        const side = h < 0.72 ? -1 : 1;
        const sp = clumpSprite(zi, sl, side, kk * (0.85 + hash(sl) * 0.3));
        if (!sp) continue;
        const reach = Math.min(sp.w, cw * 0.2);
        ctx.globalAlpha = dens(a);
        const x = side < 0 ? reach - sp.w : cw - reach;
        ctx.drawImage(sp.c, x, sl * SL + off + (hash(sl + 9) - 0.5) * SL * 0.4, sp.w, sp.h);
      }
      ctx.globalAlpha = 1;
    }
  }
  // seasons: a light wash of the season colour over the world (never the HUD)
  if (theme && theme.tint) { ctx.fillStyle = css(hex(theme.tint), (theme.amount != null ? theme.amount : 0.25) * 0.35); ctx.fillRect(0, 0, cw, ch); }
}

function drawStars(ctx, cw, ch, cam, C, a, t) {
  const off = cam * 0.03;
  for (let i = 0; i < 40; i++) {
    const x = hash(i) * cw;
    const y = (((hash(i + 99) * ch + off) % ch) + ch) % ch;
    const centre = Math.abs(x / cw - 0.5) < 0.3;
    const tw = t ? 0.6 + 0.4 * Math.sin(t * 1.3 + i * 2.1) : 0.8;
    ctx.fillStyle = css(C.acc, a * tw * (centre ? 0.35 : 0.8));
    const r = hash(i + 3) < 0.15 ? 2 : 1.2;
    ctx.fillRect(x, y, r, r);
  }
}

// ------------------------------------------------------------------ post (grade + vignette)
let vig = null, vigKey = '';
// v1.0.1 PERF: washes + vignette + paper grain are baked into one overlay (source-over is
// associative, so one blit equals the three passes) and rebuilt only when the zone mix moves.
let postCv = null, postKey = '', grainPat = null;
function vignette(cw, ch) {
  const key = cw + 'x' + ch;
  if (typeof document !== 'undefined' && vigKey !== key) {
    vigKey = key; vig = document.createElement('canvas');
    vig.width = Math.max(1, cw >> 1); vig.height = Math.max(1, ch >> 1);
    const g = vig.getContext('2d');
    const gr = g.createRadialGradient(vig.width / 2, vig.height * 0.45, Math.min(vig.width, vig.height) * 0.35, vig.width / 2, vig.height * 0.45, Math.hypot(vig.width, vig.height) * 0.62);
    gr.addColorStop(0, 'rgba(8,11,28,0)'); gr.addColorStop(1, 'rgba(8,11,28,0.38)');
    g.fillStyle = gr; g.fillRect(0, 0, vig.width, vig.height);
  }
  return vig;
}
function washes(ctx, cw, ch, z) {
  for (const [zi, a] of [[z.i, 1 - z.w], [z.j, z.w]]) {
    if (a < 0.01) continue;
    // plain alpha wash: soft-light/multiply full-screen blends are too costly on phone GPUs
    const [, col, al] = mapDef && mapDef.plates ? [0, css(resolve()[zi].ray), [0.06, 0.08, 0.1, 0.08, 0.06][zi]] : GRADE[zi];
    ctx.globalAlpha = al * a * 0.55; ctx.fillStyle = col; ctx.fillRect(0, 0, cw, ch);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
function drawPost(ctx, cw, ch, m, o = {}) {
  const z = zoneAt(m);
  if (o.grain && !DBG.noBake && typeof document !== 'undefined' && !o.hit) {
    const key = `${cw}x${ch}:${z.i}:${z.j}:${Math.round(z.w * 40)}:${mapDef ? mapDef.id : ''}:${themeRev}:${o.grainA}`;
    if (!postCv) postCv = document.createElement('canvas');
    if (postKey !== key) {
      postKey = key;
      if (postCv.width !== cw || postCv.height !== ch) { postCv.width = cw; postCv.height = ch; }
      const g = postCv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
      washes(g, cw, ch, { i: z.i, j: z.j, w: Math.round(z.w * 40) / 40 });
      const v = vignette(cw, ch); if (v) g.drawImage(v, 0, 0, cw, ch);
      if (o.grainA > 0) { g.globalAlpha = o.grainA; g.fillStyle = g.createPattern(o.grain, 'repeat'); g.fillRect(0, 0, cw, ch); g.globalAlpha = 1; }
    }
    ctx.globalAlpha = 1; ctx.drawImage(postCv, 0, 0, cw, ch);
    return;
  }
  washes(ctx, cw, ch, z);
  const v = vignette(cw, ch);
  if (v) ctx.drawImage(v, 0, 0, cw, ch);
  if (o.grain && o.grainA > 0) { ctx.globalAlpha = o.grainA; ctx.fillStyle = grainPat || (grainPat = ctx.createPattern(o.grain, 'repeat')); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
  if (o.hit > 0) { ctx.fillStyle = `rgba(240,120,90,${(o.hit * 0.25).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
}

// ------------------------------------------------------------------ HUD bits
/** A 2 px hairline progress to the next zone at the very top; a label only near the boundary. */
function drawZoneBar(ctx, cw, m, font) {
  const z = zoneAt(m);
  ctx.fillStyle = 'rgba(255,246,230,0.18)'; ctx.fillRect(0, 0, cw, 2);
  ctx.fillStyle = '#5fd99a'; ctx.fillRect(0, 0, cw * z.prog, 2);
  if (z.next && z.toNext <= 40) {
    const a = Math.min(1, (40 - z.toNext) / 10);
    ctx.globalAlpha = a;
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const label = `${z.next.name} in ${z.toNext} m`;
    ctx.fillStyle = 'rgba(8,11,28,0.55)'; ctx.fillText(label, cw / 2, 19);
    ctx.fillStyle = '#fff6e6'; ctx.fillText(label, cw / 2, 18);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
}

/** A record pennant on a pole; x,y in world units, s = size. */
function drawRecordFlag(ctx, x, y, s, label, t) {
  const wave = t ? Math.sin(t * 3) * 0.12 : 0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(16,32,27,0.75)'; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y - s * 2.2); ctx.stroke();
  ctx.strokeStyle = '#fff6e6'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x, y - s * 2.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - s * 2.2); ctx.quadraticCurveTo(x + s * 0.8, y - s * (2.0 + wave), x + s * 1.7, y - s * 1.75);
  ctx.quadraticCurveTo(x + s * 0.8, y - s * (1.45 - wave), x, y - s * 1.3); ctx.closePath();
  ctx.fillStyle = 'rgba(16,32,27,0.8)'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(16,32,27,0.8)'; ctx.stroke();
  ctx.fillStyle = '#ffc94d'; ctx.fill();
  ctx.font = `700 ${Math.round(s * 0.42)}px "Bricolage", "Avenir Next", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = '#10201b';
  ctx.fillText(label, x + s * 0.66, y - s * 1.62);
  ctx.textAlign = 'left';
}

export const backdrop = {
  draw, drawPost, drawZoneBar, DBG, useSprites: true, drawRecordFlag, zoneAt, ZONES, WORLD_CRITICAL,
  /** Palette override for seasons/skins: { tint, amount, zones: { id: {key: '#hex'} } }; null resets. */
  setTheme(o) { theme = o || null; pal = null; themeRev++; tinted.clear(); clumps.clear(); washed.clear(); fogCache.key = ''; },
  get theme() { return theme; },
  /** P8-MAPS: switch the world to a map from src/maps.js (null / 'forkwood' = classic). */
  setMap(m) {
    const next = m && m.plates ? m : null;
    if ((next && next.id) === (mapDef && mapDef.id)) return;
    mapDef = next;
    mapPal = next && next.day ? zonePal(next) : null;
    ZONES.forEach((z, i) => { z.name = (next && next.zones && next.zones[i]) || ZONE_NAMES[i]; });
    for (const p of POOL) p.on = false; lastT = 0;
    pal = null; themeRev++; tinted.clear(); clumps.clear(); washed.clear(); fogCache.key = '';
    if (next) ensureZone(0);
  },
  get map() { return mapDef; },
  /** P8-MAPS: start fetching a map's plates (carousel preview). */
  preloadMap(m) { if (m && m.plates) for (const l of ['sky', 'far', 'side']) loadArt(`m-${l}-${m.plates}`); },
};
export default backdrop;
