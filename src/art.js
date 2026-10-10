// Illustrated layers for the renderer. The plates (five painted backdrops, the
// side foliage, three gameplay sprites) are woodblock-style images made for
// Forkwood with an image model (our own output, see CREDITS.md), compressed to
// WebP. Everything here is optional: until an image has loaded, the renderer's
// procedural sky and shapes stand in, so a slow network never blocks play.
const BASE = 'assets/art/';
const IMGS = Object.create(null);

/** Start loading an image (idempotent). */
export function loadArt(name) {
  if (IMGS[name] || typeof Image === 'undefined') return IMGS[name] || null;
  const im = new Image();
  im.decoding = 'async';
  im.src = BASE + name + '.webp';
  IMGS[name] = im;
  // decode off the main thread before first use, so crossing into a new biome never hitches
  if (im.decode) im.decode().then(() => { im.ready = true; }, () => { im.ready = im.naturalWidth > 0; });
  else im.onload = () => { im.ready = true; };
  return im;
}
/** The image if it is decoded and ready to draw, else null. */
export function art(name) {
  const im = IMGS[name];
  return im && im.ready && im.naturalWidth > 0 ? im : null;
}
export function artReady(name) { return !!art(name); }

// biome plates by height (metres); neighbours cross-fade over FADE metres
export const PLATES = [
  { img: 'bg-dawn', m0: -1e9, m1: 40, span: 40, wash: 0.04 },
  { img: 'bg-day', m0: 40, m1: 240, span: 200, wash: 0.12 },
  { img: 'bg-canopy', m0: 240, m1: 400, span: 160 },
  { img: 'bg-dusk', m0: 400, m1: 600, span: 200 },
  { img: 'bg-night', m0: 600, m1: 1e9, span: 700, edge: 0.1 },
];
const FADE = 26;
// P6-ART: the bg-* plates and side foliage are no longer drawn in play (see backdrop.js), so they are not preloaded
export const CRITICAL = ['ground', 'sun', 'bramble', 'beetle'];
/** Load the first plate and the sprites now. */
export function preloadArt() {
  // the other plates load as you climb toward them (see drawPlates)
  for (const n of CRITICAL) loadArt(n);
}
export function plateIndex(m) {
  for (let i = PLATES.length - 1; i >= 0; i--) if (m >= PLATES[i].m0) return i;
  return 0;
}

function drawPlate(ctx, im, cw, ch, p, alpha, edge = 0.22) {
  // cover the screen with 14% spare height; the plate drifts down as you climb
  const ih = im.naturalHeight, iw = im.naturalWidth;
  // fit the height (with 14% spare for the drift); wider screens get mirrored
  // copies either side, which join the painting seamlessly at its edges
  const k = Math.max(ch * 1.14 / ih, Math.min(cw, ch * 0.62) / iw), Wd = iw * k, H = ih * k;
  const x = (cw - Wd) / 2, y = -(H - ch) * (1 - p);
  ctx.globalAlpha = alpha;
  ctx.drawImage(im, x, y, Wd, H);
  if (x > 0) {
    // wider screens: repeat the painting's outer 22% (its trees, never a sun or
    // moon), mirrored every other copy so each seam joins up, out to the edge
    const fr = edge, sw = iw * fr, dw = Wd * fr;
    for (const side of [-1, 1]) {
      for (let k = 0, edge = side < 0 ? x : x + Wd; side < 0 ? edge > 0 : edge < cw; k++, edge += side * dw) {
        ctx.save();
        ctx.translate(edge, 0);
        // k even: mirrored strip next to the edge it came from; k odd: unmirrored
        if (k % 2 === 0) ctx.scale(-1, 1);
        const src = side < 0 ? 0 : iw - sw;
        if (k % 2 === 0) ctx.drawImage(im, src, 0, sw, ih, side < 0 ? 0 : -dw, y, dw + 0.5, H);
        else ctx.drawImage(im, src, 0, sw, ih, side < 0 ? -dw : 0, y, dw + 0.5, H);
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw the painted backdrop for height `m` in screen space. Returns false when
 * the plate for this height has not loaded yet (the caller keeps its sky).
 */
export function drawPlates(ctx, cw, ch, m) {
  const i = plateIndex(m), P = PLATES[i];
  const im = art(P.img) || loadArt(P.img) && art(P.img);
  if (!im) return false;
  const prog = (k) => { const Q = PLATES[k]; return Math.min(1, Math.max(0, (m - Math.max(0, Q.m0)) / Q.span)); };
  drawPlate(ctx, im, cw, ch, prog(i), 1, P.edge);
  if (P.wash) { ctx.fillStyle = `rgba(244,236,216,${P.wash})`; ctx.fillRect(0, 0, cw, ch); }
  // cross-fade into the next plate as its boundary approaches
  const N = PLATES[i + 1];
  if (N && m > N.m0 - FADE) {
    const nim = art(N.img) || (loadArt(N.img), null);
    if (nim) drawPlate(ctx, nim, cw, ch, 0, Math.min(1, (m - (N.m0 - FADE)) / FADE), N.edge);
  } else if (N && m > N.m0 - FADE * 6) loadArt(N.img);
  return true;
}

// ---------------------------------------------------------------- foliage frame
// three tints of the side foliage, rendered once: day, warm (canopy/dusk), night
let tints = null;
function foliageTints() {
  if (tints) return tints;
  const im = art('foliage');
  if (!im || typeof document === 'undefined') return null;
  const mk = (fill, a) => {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    if (fill) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height); }
    // feather the top and bottom so overlapping tiles melt into each other
    g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.16, '#000'); gr.addColorStop(0.84, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    return c;
  };
  tints = [mk('#d9f1ff', 0.18), mk('#e08a4a', 0.34), mk('#b4689c', 0.42), mk('#141a40', 0.64)];
  return tints;
}
/**
 * The side bands on wide screens, in world space: painted boughs either side of
 * the playfield (parallax 0.85), mirrored every other tile so they join up.
 */
export function drawFoliageFrame(ctx, camY, topY, botY, leftX, rightX, W, m) {
  const T = foliageTints();
  if (!T) return false;
  // atmospheric tint by biome: day, canopy, dusk, night (cross-faded)
  const stops = [[0, 0], [230, 0], [270, 1], [400, 1], [440, 2], [590, 2], [640, 3]];
  let f = 3;
  for (let i = 0; i < stops.length - 1; i++) if (m < stops[i + 1][0]) { const [m0, a] = stops[i], [m1, b] = stops[i + 1]; f = a + (b - a) * Math.max(0, (m - m0) / (m1 - m0)); break; }
  const lo = Math.floor(f), hi = Math.min(3, lo + 1), ft = f - lo;
  const layers = [[T[lo], 1], [T[hi], ft]];
  const p = 0.85, tile = 560, shift = camY * (1 - p);
  const fw = tile * T[0].width / T[0].height;
  const t0 = Math.floor((topY - shift) / tile) - 1, t1 = Math.floor((botY - shift) / tile) + 1;
  for (const side of [-1, 1]) {
    const span = side < 0 ? -leftX : rightX - W;
    if (span < 24) continue;
    for (let t = t0; t <= t1; t++) {
      const y = t * tile + shift;
      const h = Math.abs(Math.sin((t + (side > 0 ? 37 : 0)) * 12.9898) * 43758.5453) % 1;
      if (h < 0.18 && t !== -1) continue; // gaps let the painting breathe
      ctx.save();
      // the bough grows out of the screen edge toward the playfield, never over it
      // anchored at the outer screen edge, reaching in toward (never over) the playfield
      const w = Math.min(fw * 1.35, Math.max(fw * 0.6, span + 16)) * (0.86 + h * 0.14) / 1.1;
      const x0 = side < 0 ? leftX - 14 : rightX + 14;
      const th = tile * 1.36;
      ctx.translate(x0, y + tile / 2);
      ctx.scale(side < 0 ? 1 : -1, t & 1 ? -1 : 1);
      for (const [c, a] of layers) {
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(c, 0, -th / 2, w * 1.1, th);
      }
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  return true;
}

// ---------------------------------------------------------------- sprites
export function drawSunSprite(ctx, x, y, r, rot) {
  const im = art('sun');
  if (!im) return false;
  const s = r * 3.5;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.drawImage(im, -s / 2, -s / 2, s, s);
  ctx.restore();
  return true;
}
export function drawBeetleSprite(ctx, b, now) {
  const im = art('beetle');
  if (!im) return false;
  const dir = b.vx >= 0 ? 1 : -1, w = 58, h = w * im.naturalHeight / im.naturalWidth;
  ctx.save();
  ctx.translate(b.x, b.y);
  // soft cast shadow, then a scuttle: tiny yaw and a step bob
  ctx.fillStyle = 'rgba(30,26,22,0.16)';
  ctx.beginPath(); ctx.ellipse(3, 6, w * 0.42, h * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(Math.sin(now * 16 + b.ph) * 0.07);
  ctx.scale(dir * (1 + Math.sin(now * 32 + b.ph) * 0.025), 1);
  ctx.drawImage(im, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
/** A bramble segment from x=a to x=c, the painted vine tiled and clipped. */
export function drawBrambleSprite(ctx, a, c, y, seed) {
  const im = art('bramble');
  if (!im) return false;
  const h = 54, tw = h * im.naturalWidth / im.naturalHeight;
  ctx.save();
  ctx.beginPath(); ctx.rect(a, y - h, c - a, h * 2); ctx.clip();
  const off = ((seed * 997) % 1) * tw;
  for (let x = a - (((a + off) % tw) + tw) % tw; x < c; x += tw) ctx.drawImage(im, x, y - h / 2, tw + 0.5, h);
  ctx.restore();
  return true;
}

/** Painted meadow edge and soil, tiled (mirrored every other tile). Ground top is y=0. */
export function drawGroundSprite(ctx, leftX, rightX, botY) {
  const im = art('ground');
  if (!im) return false;
  const G = 210, top = -G * 0.4, tw = G * im.naturalWidth / im.naturalHeight;
  ctx.fillStyle = '#352418';
  ctx.fillRect(leftX - 20, top + G - 2, rightX - leftX + 40, Math.max(0, botY - top - G) + 42);
  const n0 = Math.floor((leftX - 20) / tw), n1 = Math.ceil((rightX + 20) / tw);
  for (let n = n0; n <= n1; n++) {
    ctx.save();
    ctx.translate(n * tw + (n & 1 ? tw : 0), top);
    if (n & 1) ctx.scale(-1, 1);
    ctx.drawImage(im, 0, 0, tw + 0.5, G);
    ctx.restore();
  }
  return true;
}
