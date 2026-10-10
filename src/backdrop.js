// P6-ART: calm procedural woodblock backdrop (replaces the painted bg plates).
//
// The play band is kept the quietest part of the screen: a soft vertical
// gradient per height zone, two or three huge faint silhouette masses and at
// most three slow clouds. Everything with detail (mushrooms, oak boughs, pines,
// storm canopy, fireflies) lives in strips at the screen edges and changes with
// height, cross-fading between zones. Nothing is a tiled image, nothing is
// mirrored: side props are placed per world slot from a hash, so the pattern
// never repeats in an obvious way. All of it is drawn in screen space.
//
// Seasons / skins can retint it: backdrop.setTheme({ tint: '#hex', amount: 0.25,
// zones: { oak: { top: '#hex', ... } } }); backdrop.setTheme(null) resets.

const TAU = Math.PI * 2;
const FADE = 50; // metres of cross-fade around each zone boundary

// colours: top/bot = sky gradient, mass = far silhouettes, cloud, deep/mid/lite
// = side props, acc = accent (caps, snow, stars), crit = critters
export const ZONES = [
  { id: 'meadow', name: 'Meadow', m0: 0, m1: 200,
    top: '#cfe3e6', bot: '#f4ead2', mass: '#b7c9a0', cloud: '#fffaf0',
    deep: '#4f7a45', mid: '#7fa760', lite: '#a9c97f', acc: '#e2603f', crit: '#f2b33d' },
  { id: 'oak', name: 'Oak forest', m0: 200, m1: 450,
    top: '#ecd3ad', bot: '#f6ead3', mass: '#cfa77c', cloud: '#fff4e2',
    deep: '#5d4a2c', mid: '#8a7a3c', lite: '#b39a4f', acc: '#c97a35', crit: '#4a3a2e' },
  { id: 'snow', name: 'Snowy pines', m0: 450, m1: 800,
    top: '#c3cfe3', bot: '#edf0f1', mass: '#a6b4c9', cloud: '#f7f9fb',
    deep: '#35505c', mid: '#5f7f86', lite: '#8fa7a8', acc: '#fbfdff', crit: '#dcebf6' },
  { id: 'storm', name: 'Storm canopy', m0: 800, m1: 1200,
    top: '#565f78', bot: '#959bab', mass: '#4b5268', cloud: '#c7cad3',
    deep: '#232a3a', mid: '#36405a', lite: '#4f5b72', acc: '#93a86a', crit: '#c8b673' },
  { id: 'sky', name: 'Starry sky', m0: 1200, m1: 1e9,
    top: '#1a2048', bot: '#3d4482', mass: '#2c3366', cloud: '#5a5f98',
    deep: '#1d2350', mid: '#3a4185', lite: '#5a62a6', acc: '#fff3c8', crit: '#f7e27a' },
];
const KEYS = ['top', 'bot', 'mass', 'cloud', 'deep', 'mid', 'lite', 'acc', 'crit'];

// ------------------------------------------------------------------ colour
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a >= 1 ? 1 : a.toFixed(3)})`;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** Far layers: ~20% less saturation, ~15% less contrast, tinted toward the sky. */
function far(c, sky) {
  const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  let o = lerp(c, [l, l, l], 0.2);
  const sl = sky[0] * 0.3 + sky[1] * 0.59 + sky[2] * 0.11;
  o = o.map((v) => v + (sl - v) * 0.15);
  return lerp(o, sky, 0.15);
}

let theme = null;
let pal = null; // resolved palettes (rgb arrays), rebuilt after setTheme
function resolve() {
  if (pal) return pal;
  const tint = theme && theme.tint ? hex(theme.tint) : null, amt = theme && theme.amount != null ? theme.amount : 0.25;
  pal = ZONES.map((z) => {
    const o = { ...z, ...((theme && theme.zones && theme.zones[z.id]) || {}) };
    const r = {};
    for (const k of KEYS) { r[k] = hex(o[k]); if (tint) r[k] = lerp(r[k], tint, amt); }
    return r;
  });
  return pal;
}

/** Zone index, its weight pair for cross-fades, and progress through it. */
export function zoneAt(m) {
  let i = 0;
  for (let k = ZONES.length - 1; k >= 0; k--) if (m >= ZONES[k].m0) { i = k; break; }
  const Z = ZONES[i], N = ZONES[i + 1];
  // blend toward the next zone in the last FADE/2 m, from the previous in the first FADE/2
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

// ------------------------------------------------------------------ band
/**
 * Draw the whole backdrop in screen space.
 * o: { m (metres, camera), camPx (camera height in screen px, grows upward),
 *      playL, playR (playfield edges on screen), t (seconds), calm }
 */
const DBG = {}; // perf toggles for QA scripts only
let cache = null, cacheKey = '', themeRev = 0;
function draw(ctx, cw, ch, o) {
  const z = zoneAt(o.m), C = blendPal(z), t = o.calm ? 0 : o.t;
  // the gradient and the far masses change by well under a pixel per metre, so
  // they are painted into an offscreen canvas once per metre and blitted
  const dpr = ctx.getTransform ? ctx.getTransform().a || 1 : 1;
  const key = `${cw}x${ch}@${dpr}:${Math.round(o.m)}:${themeRev}`;
  if (DBG.far) {} else if (typeof document !== 'undefined') {
    if (!cache) cache = document.createElement('canvas');
    if (key !== cacheKey) {
      cacheKey = key;
      const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
      if (cache.width !== W || cache.height !== H) { cache.width = W; cache.height = H; }
      const g = cache.getContext('2d', { alpha: false });
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFar(g, cw, ch, { ...o, m: Math.round(o.m) });
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cache, 0, 0); ctx.restore();
  } else drawFar(ctx, cw, ch, o);
  const night = z.i === 4 ? 1 - (z.j !== 4 ? z.w : 0) : z.j === 4 ? z.w : 0;
  if (night > 0.01) drawStars(ctx, cw, ch, o, C, night, t);
  if (!DBG.near) drawNear(ctx, cw, ch, o, z, C, t);
}
function drawFar(ctx, cw, ch, o) {
  const z = zoneAt(o.m), C = blendPal(z);
  // 1. soft vertical gradient (the next zone's sky leaks in at the very top)
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  const nTop = z.next ? lerp(C.top, resolve()[Math.min(ZONES.length - 1, z.i + 1)].top, 0.18 * z.prog) : C.top;
  g.addColorStop(0, css(nTop)); g.addColorStop(0.62, css(lerp(C.top, C.bot, 0.7))); g.addColorStop(1, css(C.bot));
  ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  // 2. two or three large faint masses, sinking slowly through each zone
  ctx.save();
  if (z.w < 0.999) { ctx.globalAlpha = 1 - z.w; drawMasses(ctx, cw, ch, z.i, z.i === z.j ? z.prog : localProg(o.m, z.i), C, o); }
  if (z.w > 0.001) { ctx.globalAlpha = z.w; drawMasses(ctx, cw, ch, z.j, localProg(o.m, z.j), C, o); }
  ctx.restore();
}
function drawNear(ctx, cw, ch, o, z, C, t) {
  // 3. at most three slow clouds
  drawClouds(ctx, cw, ch, C, z, t, o);
  // 4. side art, only at the screen edges
  const L = Math.max(0, o.playL), R = Math.max(0, cw - o.playR);
  const sideW = (gap) => Math.min(420, Math.max(gap + cw * 0.02, cw * 0.075));
  const sides = [[-1, sideW(L)], [1, sideW(R)]];
  ctx.save();
  if (z.w < 0.999) { ctx.globalAlpha = 1 - z.w; drawSides(ctx, cw, ch, z.i, sides, o, t); }
  if (z.w > 0.001) { ctx.globalAlpha = z.w; drawSides(ctx, cw, ch, z.j, sides, o, t); }
  ctx.restore();
  ctx.globalAlpha = 1;
}
const localProg = (m, i) => { const Z = ZONES[i]; return Z.m1 > 1e8 ? Math.min(1, Math.max(0, (m - Z.m0) / 800)) : Math.min(1, Math.max(0, (m - Z.m0) / (Z.m1 - Z.m0))); };

function drawStars(ctx, cw, ch, o, C, a, t) {
  const off = (o.camPx * 0.02) % ch;
  for (let i = 0; i < 46; i++) {
    const x = hash(i) * cw;
    let y = (hash(i + 99) * ch + off) % ch;
    // fewer and dimmer over the play band
    const inBand = x > o.playL && x < o.playR;
    if (inBand && hash(i + 5) < 0.55) continue;
    const tw = t ? 0.6 + 0.4 * Math.sin(t * 1.3 + i * 2.1) : 0.8;
    ctx.fillStyle = css(C.acc, a * tw * (inBand ? 0.35 : 0.75));
    const r = hash(i + 3) < 0.15 ? 2 : 1.2;
    ctx.fillRect(x, y, r, r);
  }
}

function drawMasses(ctx, cw, ch, zi, prog, C, o) {
  const P = resolve()[zi], sky = C.top;
  const m1 = css(far(P.mass, sky), 0.5), m2 = css(far(lerp(P.mass, P.bot, 0.35), sky), 0.45);
  const sink = prog * ch * 0.16; // they drift down as you climb through the zone
  const id = ZONES[zi].id;
  // edge-weighted height: masses rise at the screen edges, stay low under play
  const edge = (x) => { const u = Math.abs(x / cw - 0.5) * 2; return u * u; };
  ctx.fillStyle = m2;
  if (id === 'meadow' || id === 'oak') {
    // far rolling hills / distant wood line
    ctx.beginPath(); ctx.moveTo(0, ch);
    for (let x = 0; x <= cw + 20; x += 20) ctx.lineTo(x, ch * 0.7 + sink - ch * 0.22 * edge(x) - 16 * Math.sin(x * 0.006 + zi));
    ctx.lineTo(cw, ch); ctx.fill();
    ctx.fillStyle = m1;
    if (id === 'oak') {
      // two huge soft crowns at the sides
      for (const [x, y, r] of [[cw * 0.02, ch * 0.5, ch * 0.3], [cw * 0.98, ch * 0.62, ch * 0.26]]) {
        ctx.beginPath(); ctx.arc(x, y + sink, r, 0, TAU); ctx.arc(x + (x < cw / 2 ? r * 0.6 : -r * 0.6), y + sink + r * 0.4, r * 0.7, 0, TAU); ctx.fill();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(0, ch);
      for (let x = 0; x <= cw + 20; x += 20) ctx.lineTo(x, ch * 0.84 + sink * 0.6 - ch * 0.16 * edge(x) - 10 * Math.sin(x * 0.011 + 2));
      ctx.lineTo(cw, ch); ctx.fill();
    }
  } else if (id === 'snow') {
    // a distant mountain ridge, peaks at the sides
    ctx.beginPath(); ctx.moveTo(0, ch);
    const peaks = [[0, 0.42], [0.16, 0.6], [0.3, 0.52], [0.5, 0.78], [0.7, 0.55], [0.86, 0.62], [1, 0.4]];
    for (const [u, v] of peaks) ctx.lineTo(u * cw, ch * v + sink);
    ctx.lineTo(cw, ch); ctx.fill();
    ctx.fillStyle = m1;
    ctx.beginPath(); ctx.moveTo(0, ch);
    for (const [u, v] of [[0, 0.6], [0.12, 0.74], [0.24, 0.68], [0.5, 0.9], [0.78, 0.7], [0.9, 0.76], [1, 0.58]]) ctx.lineTo(u * cw, ch * v + sink * 0.6);
    ctx.lineTo(cw, ch); ctx.fill();
  } else {
    // storm / sky: heavy cloud banks top and bottom, thinning at the centre
    const bank = (y0, dir) => {
      ctx.beginPath(); ctx.moveTo(0, dir > 0 ? ch : 0);
      for (let x = 0; x <= cw + 30; x += 30) ctx.lineTo(x, y0 - dir * (ch * 0.12 * edge(x) + 14 * Math.sin(x * 0.009 + zi * 3)));
      ctx.lineTo(cw, dir > 0 ? ch : 0); ctx.fill();
    };
    bank(ch * 0.8 + sink * 0.5, 1);
    ctx.fillStyle = m1;
    if (id === 'storm') bank(ch * 0.08 - sink * 0.3, -1);
    else bank(ch * 0.9 + sink * 0.3, 1);
  }
}

function drawClouds(ctx, cw, ch, C, z, t, o) {
  const col = css(far(C.cloud, C.top), z.i >= 3 ? 0.35 : 0.55), under = css(far(lerp(C.cloud, C.top, 0.4), C.top), z.i >= 3 ? 0.35 : 0.5);
  const span = cw + 500;
  for (let k = 0; k < 3; k++) {
    const h = hash(k * 13.7 + 2);
    const r = Math.min(cw, ch) * (0.05 + h * 0.035);
    const x = ((h * span + t * (2.5 + h * 3)) % span) - 250;
    // clouds sit high, and the middle one is shifted toward the nearer edge
    const y = ch * (0.1 + k * 0.13) + ((o.camPx * 0.015) % (ch * 0.1));
    ctx.fillStyle = under;
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 2.0, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.arc(x + r * 1.05, y + r * 0.25, r * 0.7, Math.PI, 0); ctx.arc(x - r * 0.95, y + r * 0.3, r * 0.6, Math.PI, 0); ctx.closePath(); ctx.fill();
  }
}

// ------------------------------------------------------------------ side art
const SLOT = 150;
// each side prop is painted once into a small sprite and then just blitted
const sprites = new Map();
function propSprite(zi, side, s, sw, k, h, dpr) {
  const key = `${zi}:${side}:${s}:${sw | 0}:${dpr}:${themeRev}`;
  let sp = sprites.get(key);
  if (sp) return sp;
  const P = resolve()[zi], id = ZONES[zi].id;
  const inset = (0.12 + hash(s * 3.7 + zi) * 0.6) * sw;
  // tight bounds: props reach ~60k past their inset and ~150k above / ~70k below their anchor
  const w = Math.ceil(inset + 62 * k + 12), hh = Math.ceil(225 * k), ay = Math.ceil(152 * k);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(hh * dpr);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ex = side < 0 ? 0 : w;
  PROPS[id](g, ex - side * inset, ay, side, k, P, h, 0, ex);
  sp = { c, w, hh, ay };
  sprites.set(key, sp);
  if (sprites.size > 48) sprites.delete(sprites.keys().next().value);
  return sp;
}
function drawSides(ctx, cw, ch, zi, sides, o, t) {
  const P = resolve()[zi], id = ZONES[zi].id;
  const off = o.camPx * 0.5; // props scroll at half the camera speed
  const s0 = Math.floor(-off / SLOT) - 2, s1 = Math.ceil((ch - off) / SLOT) + 1;
  const dpr = ctx.getTransform ? ctx.getTransform().a || 1 : 1;
  const canSprite = backdrop.useSprites && typeof document !== 'undefined';
  for (const [side, sw] of sides) {
    const ex = side < 0 ? 0 : cw;
    const kk = Math.min(1.6, Math.max(0.55, sw / 150)); // prop scale
    for (let s = s0; s <= s1; s++) {
      const h = hash(s * 7.13 + (side > 0 ? 53 : 0) + zi * 101), h2 = hash(s * 2.31 + (side > 0 ? 17 : 0) + zi * 7);
      if (h2 < 0.22) continue; // irregular gaps so no rhythm shows
      const y = s * SLOT + off + (h2 - 0.5) * 110;
      const k = kk * (0.6 + h2 * 0.7);
      if (canSprite) {
        const sp = propSprite(zi, side, s, sw, k, h, dpr);
        ctx.drawImage(sp.c, side < 0 ? 0 : cw - sp.w, y - sp.ay, sp.w, sp.hh);
      } else {
        const inset = (0.12 + hash(s * 3.7 + zi) * 0.6) * sw;
        PROPS[id](ctx, ex - side * inset, y, side, k, P, h, 0, ex);
      }
    }
    CRITTERS[id](ctx, cw, ch, side, sw, P, t, o);
  }
}

const PROPS = {
  meadow(ctx, x, y, side, k, P, h, t, ex) {
    // a grass tuft growing in from the edge; some carry mushrooms or a flower
    const n = 3 + Math.floor(h * 4), sway = t ? Math.sin(t * 0.8 + h * 9) * 0.12 : 0;
    for (let i = 0; i < n; i++) {
      const bx = ex - side * (4 + i * 9) * k, len = (50 + hash(h * 50 + i) * 70) * k;
      const lean = side * (6 + i * 7 + hash(h + i) * 10) * k * (1 + sway);
      ctx.fillStyle = css(i % 3 === 0 ? P.deep : i % 3 === 1 ? P.mid : P.lite);
      ctx.beginPath(); ctx.moveTo(bx - 4 * k, y); ctx.quadraticCurveTo(bx - lean * 0.2, y - len * 0.6, bx - lean, y - len); ctx.quadraticCurveTo(bx - lean * 0.1, y - len * 0.5, bx + 4 * k, y); ctx.fill();
    }
    if (h > 0.45) {
      const cnt = h > 0.8 ? 2 : 1;
      for (let j = 0; j < cnt; j++) {
        const r = (13 - j * 4) * k, mx = ex - side * (12 + n * 9 + j * 16) * k, my = y - j * 2 * k;
        ctx.fillStyle = css(lerp(P.bot, P.deep, 0.3));
        ctx.fillRect(mx - r * 0.22, my - r * 1.1, r * 0.44, r * 1.1);
        ctx.fillStyle = css(P.acc);
        ctx.beginPath(); ctx.ellipse(mx, my - r * 1.1, r, r * 0.62, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = css(P.bot);
        ctx.beginPath(); ctx.arc(mx - r * 0.4, my - r * 1.35, r * 0.13, 0, TAU); ctx.arc(mx + r * 0.3, my - r * 1.45, r * 0.1, 0, TAU); ctx.fill();
      }
      // a mossy clump they sit on
      ctx.fillStyle = css(P.deep);
      ctx.beginPath(); ctx.ellipse(ex - side * (8 + n * 6) * k, y + 2 * k, (14 + n * 7) * k, 6 * k, 0, 0, TAU); ctx.fill();
    } else if (h > 0.25) {
      const fx = ex - side * (n * 9 + 6) * k, fy = y - 70 * k;
      ctx.strokeStyle = css(P.mid); ctx.lineWidth = 2.5 * k;
      ctx.beginPath(); ctx.moveTo(ex - side * 6 * k, y); ctx.quadraticCurveTo(fx, y - 30 * k, fx, fy); ctx.stroke();
      ctx.fillStyle = css(lerp(P.bot, [255, 255, 255], 0.5));
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 5 * k, fy + Math.sin(a) * 5 * k, 3.6 * k, 0, TAU); ctx.fill(); }
      ctx.fillStyle = css(P.crit); ctx.beginPath(); ctx.arc(fx, fy, 2.8 * k, 0, TAU); ctx.fill();
    }
  },
  oak(ctx, x, y, side, k, P, h, t, ex) {
    // a bough from the edge with a lobed leaf cluster; every one is shaped differently
    const tipY = y - (h - 0.3) * 50 * k;
    ctx.strokeStyle = css(P.deep); ctx.lineWidth = (6 + h * 6) * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex + side * 10, y + (20 + h * 30) * k); ctx.quadraticCurveTo((ex + x) / 2, y + (h - 0.5) * 30 * k, x, tipY); ctx.stroke();
    const sway = t ? Math.sin(t * 0.6 + h * 7) * 3 * k : 0;
    const nb = 3 + Math.floor(hash(h * 9) * 4), blobs = [];
    for (let i = 0; i < nb; i++) {
      const a = hash(h * 13 + i) * TAU, d = i ? 12 + hash(h * 5 + i) * 18 : 0;
      blobs.push([Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.8, 13 + hash(h * 7 + i) * 14]);
    }
    for (const [layer, col] of [[0, P.deep], [1, P.mid], [2, P.lite]]) {
      if (layer === 2 && h < 0.4) continue;
      ctx.fillStyle = css(col);
      ctx.beginPath();
      for (const [dx, dy, r] of blobs) {
        const rr = r * k * (1 - layer * 0.28), cx = x + dx * k + sway - side * layer * 3 * k, cy = tipY + dy * k - layer * 5 * k;
        ctx.moveTo(cx + rr, cy); ctx.arc(cx, cy, rr, 0, TAU);
      }
      ctx.fill();
    }
  },
  snow(ctx, x, y, side, k, P, h, t, ex) {
    // a pine leaning in from the edge: stacked tiers with snow caps
    const H = 120 * k, wB = 46 * k;
    for (let i = 0; i < 4; i++) {
      const ty = y - i * H * 0.24, w = wB * (1 - i * 0.2);
      ctx.fillStyle = css(i & 1 ? P.mid : P.deep);
      ctx.beginPath(); ctx.moveTo(x - w, ty); ctx.lineTo(x, ty - H * 0.36); ctx.lineTo(x + w, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle = css(P.acc, 0.92);
      ctx.beginPath(); ctx.moveTo(x - w * 0.42, ty - H * 0.21); ctx.lineTo(x, ty - H * 0.36); ctx.lineTo(x + w * 0.42, ty - H * 0.21); ctx.quadraticCurveTo(x, ty - H * 0.17, x - w * 0.42, ty - H * 0.21); ctx.fill();
    }
    ctx.fillStyle = css(P.deep); ctx.fillRect(x - 4 * k, y, 8 * k, 14 * k);
  },
  storm(ctx, x, y, side, k, P, h, t, ex) {
    // heavy canopy mass hanging from the edge, swaying
    const sway = t ? Math.sin(t * 1.4 + h * 8) * 0.06 : 0;
    ctx.save(); ctx.translate(ex, y); ctx.rotate(sway * -side);
    const d = Math.abs(x - ex);
    for (const [layer, col] of [[0, P.deep], [1, P.mid]]) {
      ctx.fillStyle = css(col);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const bx = -side * (d * (0.3 + i * 0.25)) - side * layer * 6, by = (hash(h * 31 + i) - 0.5) * 40 * k - layer * 6;
        const r = (30 - i * 4) * k * (1 - layer * 0.3);
        ctx.moveTo(bx + r, by); ctx.arc(bx, by, r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  },
  sky(ctx, x, y, side, k, P, h, t, ex) {
    if (h < 0.55) return; // keep the night sparse
    // a soft cloud puff hugging the edge
    const r = 26 * k;
    ctx.fillStyle = css(P.mid, 0.55);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x - side * r * 0.9, y + r * 0.2, r * 0.8, 0, TAU); ctx.arc(x + side * r * 0.8, y + r * 0.35, r * 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = css(P.lite, 0.5);
    ctx.beginPath(); ctx.arc(x - side * r * 0.2, y - r * 0.25, r * 0.6, 0, TAU); ctx.fill();
  },
};

// small moving life, confined to the edge strip (sparrows may cross the top)
const CRITTERS = {
  meadow(ctx, cw, ch, side, sw, P, t) {
    for (let i = 0; i < 2; i++) {
      const ph = i * 2.3 + (side > 0 ? 1.1 : 0);
      const x = side < 0 ? sw * (0.35 + 0.25 * Math.sin(t * 0.3 + ph)) : cw - sw * (0.35 + 0.25 * Math.sin(t * 0.27 + ph));
      const y = ch * (0.3 + i * 0.3) + Math.sin(t * 0.5 + ph * 3) * 30;
      const flap = t ? Math.abs(Math.sin(t * 9 + ph)) : 0.7, s = 7;
      ctx.fillStyle = css(i ? P.acc : P.crit, 0.85);
      ctx.beginPath(); ctx.ellipse(x - s * 0.7 * flap, y, s * flap, s * 0.8, -0.4, 0, TAU); ctx.ellipse(x + s * 0.7 * flap, y, s * flap, s * 0.8, 0.4, 0, TAU); ctx.fill();
    }
  },
  oak(ctx, cw, ch, side, sw, P, t) {
    if (side > 0 || !t) return; // one sparrow at a time, from the left side's turn
    const per = 9, k = (t % per) / per, n = Math.floor(t / per);
    if (k > 0.55) return;
    const dir = n & 1 ? -1 : 1, u = k / 0.55;
    const x = dir > 0 ? -30 + u * (cw + 60) : cw + 30 - u * (cw + 60);
    const y = ch * (0.08 + hash(n) * 0.12) + Math.sin(u * 12) * 8;
    const flap = Math.sin(t * 18) * 6;
    ctx.fillStyle = css(P.crit, 0.7);
    ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x - 9 * dir, y - flap - 3); ctx.lineTo(x + 3 * dir, y - 1); ctx.fill();
  },
  snow(ctx, cw, ch, side, sw, P) {
    // icicles hanging from the top edge, inside the strip only
    ctx.fillStyle = css(P.crit, 0.85);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const x = side < 0 ? 6 + i * sw / 6 : cw - 6 - i * sw / 6, len = 14 + hash(i * 3 + (side > 0 ? 9 : 0)) * 26;
      ctx.moveTo(x - 4, 0); ctx.lineTo(x, len); ctx.lineTo(x + 4, 0);
    }
    ctx.fill();
  },
  storm(ctx, cw, ch, side, sw, P, t) {
    // leaves swirling in the strip
    ctx.fillStyle = css(P.acc, 0.8);
    for (let i = 0; i < 5; i++) {
      const a = t * (0.6 + i * 0.1) + i * 1.3, r = sw * (0.15 + i * 0.05);
      const cx = side < 0 ? sw * 0.45 : cw - sw * 0.45;
      const x = cx + Math.cos(a) * r, y = ch * (0.2 + i * 0.15) + Math.sin(a) * r * 0.6;
      ctx.beginPath(); ctx.ellipse(x, y, 6, 3, a * 2, 0, TAU); ctx.fill();
    }
  },
  sky(ctx, cw, ch, side, sw, P, t) {
    // fireflies wandering in the strip
    for (let i = 0; i < 4; i++) {
      const ph = i * 1.9 + (side > 0 ? 4 : 0);
      const x = side < 0 ? sw * (0.2 + 0.5 * hash(ph)) + Math.sin(t * 0.4 + ph) * 18 : cw - sw * (0.2 + 0.5 * hash(ph)) + Math.sin(t * 0.4 + ph) * 18;
      const y = ch * (0.2 + 0.18 * i) + Math.cos(t * 0.3 + ph) * 22;
      const glow = t ? 0.5 + 0.5 * Math.sin(t * 2 + ph * 3) : 0.8;
      ctx.fillStyle = css(P.crit, 0.18 * glow); ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = css(P.crit, 0.9 * glow); ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
    }
  },
};

// ------------------------------------------------------------------ HUD bits
/** Thin progress bar to the next zone at the very top of the screen. */
function drawZoneBar(ctx, cw, m, font) {
  const z = zoneAt(m), P = resolve()[z.i];
  const h = 4;
  ctx.fillStyle = 'rgba(30,26,22,0.35)'; ctx.fillRect(0, 0, cw, h);
  ctx.fillStyle = css(lerp(P.acc, [242, 179, 61], 0.5)); ctx.fillRect(0, 0, cw * z.prog, h);
  ctx.fillStyle = '#1e1a16'; ctx.fillRect(cw * z.prog - 1, 0, 2, h + 2);
  const label = z.next ? `${z.zone.name.toUpperCase()} → ${z.next.name.toUpperCase()} · ${z.toNext} m` : z.zone.name.toUpperCase();
  ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#1e1a16'; ctx.strokeText(label, 16, 17);
  ctx.fillStyle = '#f4ecd8'; ctx.fillText(label, 16, 17);
}

/** A record pennant on a pole; x,y in world units, s = size. */
function drawRecordFlag(ctx, x, y, s, label, t) {
  const wave = t ? Math.sin(t * 3) * 0.12 : 0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1e1a16'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y - s * 2.2); ctx.stroke();
  ctx.fillStyle = '#e2603f';
  ctx.beginPath(); ctx.moveTo(x, y - s * 2.2); ctx.quadraticCurveTo(x + s * 0.8, y - s * (2.0 + wave), x + s * 1.6, y - s * 1.75);
  ctx.quadraticCurveTo(x + s * 0.8, y - s * (1.45 - wave), x, y - s * 1.3); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2.5; ctx.stroke();
  ctx.font = `800 ${Math.round(s * 0.42)}px "Bricolage", "Avenir Next", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = '#f4ecd8';
  ctx.fillText(label, x + s * 0.62, y - s * 1.62);
  ctx.textAlign = 'left';
}

export const backdrop = {
  draw, drawZoneBar, DBG, useSprites: true, drawRecordFlag, zoneAt, ZONES,
  /** Palette override for seasons/skins: { tint, amount, zones: { id: {key: '#hex'} } }; null resets. */
  setTheme(o) { theme = o || null; pal = null; themeRev++; },
  get theme() { return theme; },
};
export default backdrop;
