// Forkwood V3.1 "living vine" art: per-world styling for the painterly vine (shadow, rim light, fresh
// growth, curling tendrils, sprouting leaves, flowers, tip trail) and the painted ground strata + roots.
// Everything here is generated ONCE into small canvases (cached textures); gl.js only fills geometry and
// pooled sprites per frame. No DOM besides offscreen canvases, no filters.

const TAU = Math.PI * 2;
const hex = (h) => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const shade = (h, k) => { const c = hex(h); return k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k); };
/** Seeded PRNG (mulberry32) so the ground of a world always paints the same. */
export function prng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ per-world vine + ground styles
// shadow: [colour, alpha, dx, dy]   rim: additive rim-light colour (null = none) + alpha
// fresh: young growth overlay [mid, lit, shade, highlight]   tendril: [base, tip, edge]
// leafStep/flowerStep: world units of stem between sprouting leaves / flowers (lower = lusher)
// trail: tip particles { kinds, cols, rate }   ground: painted strata (see paintGround)
export const VSTYLE = {
  meadow: {
    shadow: ['#1b3320', 0.34, 3, 5], rim: '#ffe7a6', rimA: 0.34,
    fresh: ['#8be68f', '#d9ffb0', '#4fae6a', '#fffbe0'], tendril: ['#5cbf6e', '#b8f08a', '#24502e'],
    leafStep: 22, leafSkip: 0.18, flowerStep: 190, flowerP: 0.55, curl: 4.2,
    trail: { kinds: ['dot', 'dot', 'spark'], cols: ['#fff2b0', '#ffe07a', '#ffffff', '#c8ffb0'], rate: 22 },
    ground: { style: 'dab', top: ['#c9b24a', '#9fae3c', '#e8d27a', '#6f8f34', '#f6e7a0'], flowers: ['#ffffff', '#ffd6e4', '#fff3a0'],
      soil: ['#7a5a32', '#5e4226', '#47301c', '#2f2014'], fleck: '#c99a5a', stone: '#9a8a74', root: '#5a3e24', rootHi: '#b08452', deep: '#24180f' },
  },
  starry: {
    shadow: ['#06102a', 0.42, 3, 5], rim: '#ffe27a', rimA: 0.37,
    fresh: ['#7fe0a0', '#f6f0a0', '#2f8a7a', '#fff8c8'], tendril: ['#3f78d0', '#f2dc6a', '#0d1c3c'],
    leafStep: 22, leafSkip: 0.2, flowerStep: 210, flowerP: 0.5, curl: 5.6,
    trail: { kinds: ['stroke', 'stroke', 'dot'], cols: ['#f6e27a', '#9fc8ff', '#5a8ae0', '#fff6c0'], rate: 24 },
    ground: { style: 'swirl', top: ['#2f6a8a', '#3f8a72', '#e8d070', '#1f4a7a', '#7ab0d0'], flowers: ['#f6e27a', '#fff6c0'],
      soil: ['#1f3566', '#182a54', '#121f42', '#0c1530'], fleck: '#e8d070', stone: '#4a6aa0', root: '#1c2036', rootHi: '#6a80b8', deep: '#0a1128' },
  },
  fresco: {
    shadow: ['#4a3420', 0.3, 2, 4], rim: '#fff4d8', rimA: 0.31,
    fresh: ['#9ad8a8', '#f4ffe8', '#5e9a72', '#ffffff'], tendril: ['#7aae86', '#d8ecc0', '#4a3a28'],
    leafStep: 26, leafSkip: 0.22, flowerStep: 220, flowerP: 0.5, curl: 3.8,
    trail: { kinds: ['dot', 'dot', 'spark'], cols: ['#ffe6a8', '#ffd27a', '#fff6e0'], rate: 18 },
    ground: { style: 'chalk', top: ['#7a8a5a', '#a8a070', '#5e6e46', '#c9b88a', '#d8c8a0'], flowers: ['#fff6e0', '#e8b8a0'],
      soil: ['#d2b48c', '#b38f5c', '#8f6a40', '#634628'], mosaic: ['#8a2a22', '#3a6a4a', '#d8b050', '#efe2c4', '#5a3a6a'], fleck: '#e8d6b0', stone: '#d8c8a8', root: '#6a5034', rootHi: '#d8b888', deep: '#3e2c1a' },
  },
  ukiyo: {
    shadow: ['#0a0f18', 0.36, 2, 3], rim: '#f6efdc', rimA: 0.20,
    fresh: ['#6fc89a', '#e8f6e0', '#2f6a56', '#ffffff'], tendril: ['#2c4a4a', '#6fae8e', '#0a0f14'],
    leafStep: 26, leafSkip: 0.25, flowerStep: 200, flowerP: 0.55, curl: 4.6,
    trail: { kinds: ['leaf', 'dot', 'leaf'], cols: ['#ffc8d8', '#ffe4ec', '#f6efdc'], rate: 14 },
    ground: { style: 'ink', top: ['#3a6a5a', '#5a8a6a', '#24403a', '#8aa878', '#1b2a3a'], flowers: ['#ffc8d8', '#f6efdc'],
      soil: ['#4a6488', '#36507a', '#283e62', '#1c2c4a'], fleck: '#efe2c4', stone: '#e8dcc0', root: '#1b2433', rootHi: '#7a90b0', deep: '#121a2a' },
  },
  lilies: {
    shadow: ['#28304a', 0.3, 3, 4], rim: '#fff0f8', rimA: 0.28,
    fresh: ['#9ae0b8', '#f0fff4', '#5a9a9a', '#ffffff'], tendril: ['#7ab89a', '#d8b8e8', '#3a4a5a'],
    leafStep: 22, leafSkip: 0.2, flowerStep: 180, flowerP: 0.6, curl: 4.0,
    trail: { kinds: ['dot', 'dot', 'leaf'], cols: ['#ffd6ec', '#d8e8ff', '#fff6d0', '#c8f0d8'], rate: 18 },
    ground: { style: 'dab', top: ['#6aa080', '#8ab890', '#4a7a6a', '#b8c8a0', '#9a8ac8'], flowers: ['#ffc0dc', '#ffffff', '#f8e080'],
      soil: ['#6a8a6a', '#557562', '#435e56', '#33464a'], fleck: '#c8a8e0', stone: '#b8c0b0', root: '#3a4436', rootHi: '#b8c8a8', deep: '#252f33', dabs: ['#c8a8e0', '#9ab8e8', '#e8c8d8', '#8ac0a0', '#f0e0a0'] },
  },
  gilded: {
    shadow: ['#2a1a06', 0.4, 3, 4], rim: '#fff0a0', rimA: 0.43,
    fresh: ['#8ad8a0', '#fff6c0', '#3f8a6a', '#fffbe8'], tendril: ['#c89a2a', '#ffe9a0', '#3a2608'],
    leafStep: 24, leafSkip: 0.22, flowerStep: 200, flowerP: 0.55, curl: 5.2,
    trail: { kinds: ['spark', 'dot', 'spark'], cols: ['#ffe27a', '#fff6c8', '#d8a840'], rate: 20 },
    ground: { style: 'gold', top: ['#c9a040', '#e8c860', '#8a6a20', '#f6e0a0', '#3f6a4a'], flowers: ['#ffffff', '#e86a4a', '#4a8ad8'],
      soil: ['#5a4214', '#46320e', '#33240a', '#221806'], fleck: '#e8c050', stone: '#d8b050', root: '#3a2608', rootHi: '#e8c060', deep: '#1a1204' },
  },
  lacquer: {
    shadow: ['#000000', 0.45, 3, 5], rim: '#ffcf6a', rimA: 0.37,
    fresh: ['#6fd09a', '#ffe8a0', '#2a7a5a', '#fff6d8'], tendril: ['#b8862a', '#ffd77a', '#1a0a04'],
    leafStep: 24, leafSkip: 0.22, flowerStep: 200, flowerP: 0.55, curl: 4.8,
    trail: { kinds: ['spark', 'dot', 'dot'], cols: ['#ffcf6a', '#ff9a4a', '#fff0c0'], rate: 20 },
    ground: { style: 'lacquer', top: ['#2a4a2a', '#c8962a', '#3a2a1a', '#ffcf6a', '#5a1a10'], flowers: ['#ffcf6a', '#e84a2a', '#fff0d0'],
      soil: ['#4a120c', '#360c08', '#240806', '#140404'], fleck: '#ffcf6a', stone: '#f0e4c8', root: '#1a0806', rootHi: '#d8a040', deep: '#0e0404' },
  },
};
export const vstyle = (w) => VSTYLE[w] || VSTYLE.meadow;

// ------------------------------------------------------------------ strip textures (V across the stroke)
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function vstrip(W, H, fn) {
  const cv = canvas(W, H), g = cv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, c = fn((x + 0.5) / W, (y + 0.5) / H, x, y); D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = c[3]; }
  g.putImageData(img, 0, 0); return cv;
}
/** Soft drop shadow band under the stem (white; tinted dark). m = transparent margin of the stem strip. */
export function paintShadowStrip(m = 0) {
  const lo = Math.max(0, m - 0.06), hi = Math.min(1, 1 - m + 0.06);
  return vstrip(8, 64, (u, v) => { const t = (v - lo) / (hi - lo); const a = t <= 0 || t >= 1 ? 0 : Math.pow(Math.sin(Math.PI * t), 0.55); return [255, 255, 255, a * 255]; });
}
/** Rim light: a bright band on the lit (left, V≈1) edge and a faint bounce light on the shaded edge. */
export function paintRimStrip(m = 0) {
  const span = 1 - 2 * m, c1 = 1 - m - span * 0.16, c2 = m + span * 0.1;
  return vstrip(8, 64, (u, v) => {
    const a = Math.exp(-Math.pow((v - c1) / (span * 0.07), 2)) + 0.35 * Math.exp(-Math.pow((v - c2) / (span * 0.05), 2));
    return [255, 255, 255, Math.min(1, a) * 255];
  });
}
/** Fresh young growth overlaid on the last stretch of a live stem: U = 0 at the tip .. 1 where it fades out. */
export function paintFreshStrip(st, streaky = false) {
  const [mid, lit, sh, hl] = st.fresh.map(hex);
  return vstrip(128, 32, (u, v, x, y) => {
    const across = Math.abs(v - 0.5) * 2;
    let c = v > 0.5 ? mix(mid, lit, (v - 0.5) * 1.6) : mix(sh, mid, v * 2);
    const h = Math.exp(-Math.pow((v - 0.72) / 0.07, 2)) * (1 - u) ; c = mix(c, hl, Math.min(1, h * 0.9));
    if (streaky) { const s = Math.sin(v * 38 + Math.sin(u * 9) * 2) * 0.5 + 0.5; c = mix(c, s > 0.6 ? lit : sh, 0.18 * Math.abs(s - 0.5)); }
    let a = Math.pow(1 - u, 1.6) * (across > 0.88 ? Math.max(0, (1 - across) / 0.12) : 1);
    return [c[0], c[1], c[2], a * 140];
  });
}
/** Tendril strip: U along the tendril (base -> tip colour), V across (dark edge, light core). */
export function paintTendrilStrip(st) {
  const [base, tip, edge] = st.tendril.map(hex);
  return vstrip(64, 16, (u, v) => {
    const across = Math.abs(v - 0.5) * 2;
    let c = mix(base, tip, Math.pow(u, 0.8));
    if (v > 0.55 && v < 0.75) c = mix(c, [255, 255, 240], 0.35);
    if (across > 0.62) c = mix(c, edge, Math.min(1, (across - 0.62) / 0.3));
    const a = across > 0.92 ? (1 - across) / 0.08 : 1;
    return [c[0], c[1], c[2], a * 255];
  });
}

// ------------------------------------------------------------------ painted ground strata (tiles along x)
export const GROUND = { W: 1024, H: 860, TOP: 150, RES: 1.5 }; // world units; canvas is RES x
const P2 = TAU / GROUND.W;
export const soilLine = (x) => GROUND.TOP + 12 * Math.sin(x * P2 * 2 + 0.6) + 7 * Math.sin(x * P2 * 5 + 1.3) + 3 * Math.sin(x * P2 * 11);
const bandY = (k, x) => GROUND.TOP + [44, 120, 260][k] + 16 * Math.sin(x * P2 * (2 + k) + k * 1.7) + 8 * Math.sin(x * P2 * (5 + k * 2) + k);

/** Paints one world's ground tile (soil strata, texture strokes, stones, rootlets, top grass/flowers). */
export function paintGround(worldId) {
  const G = vstyle(worldId).ground, { W, H, RES } = GROUND;
  const cv = canvas(Math.round(W * RES), Math.round(H * RES)), g = cv.getContext('2d');
  g.scale(RES, RES);
  const R = prng(0x9e3779b9 ^ worldId.length * 7919 ^ worldId.charCodeAt(0) * 131);
  const soil = G.soil.map(hex), deep = hex(G.deep);
  const wrap = (fn) => { fn(0); fn(-W); fn(W); }; // seamless along x
  const bandOf = (x, y) => (y < bandY(0, x) ? 0 : y < bandY(1, x) ? 1 : y < bandY(2, x) ? 2 : 3);
  // 1. strata bodies
  for (let k = 3; k >= 0; k--) {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, k === 0 ? soilLine(x) : bandY(k - 1, x));
    g.lineTo(W, H); g.closePath();
    const top = k === 0 ? GROUND.TOP - 20 : GROUND.TOP + [44, 120, 260][k - 1];
    const gr = g.createLinearGradient(0, top, 0, Math.min(H, top + 260));
    gr.addColorStop(0, rgba(mix(soil[k], [255, 255, 255], 0.06))); gr.addColorStop(1, rgba(mix(soil[k], [0, 0, 0], 0.12)));
    g.fillStyle = gr; g.fill();
  }
  // 2. texture strokes per medium
  const N = G.style === 'gold' ? 2200 : G.style === 'ink' ? 1100 : 4600;
  g.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    const x = R() * W, y = GROUND.TOP + Math.pow(R(), 0.8) * (H - GROUND.TOP - 30);
    if (y < soilLine(x) + 4) continue;
    const k = bandOf(x, y), base = soil[k];
    const depthFade = Math.min(1, (y - GROUND.TOP) / (H - GROUND.TOP));
    const tone = mix(base, R() < 0.5 ? [255, 240, 210] : [0, 0, 0], 0.08 + R() * 0.16);
    if (G.style === 'dab') {
      const L = 10 + R() * 20, a = (R() - 0.5) * 0.7;
      g.strokeStyle = rgba(R() < 0.06 ? hex(G.fleck) : G.dabs && R() < 0.3 ? mix(base, hex(G.dabs[(R() * G.dabs.length) | 0]), 0.35 + R() * 0.25) : tone, 0.6 - depthFade * 0.2); g.lineWidth = 4 + R() * 6;
      wrap((o) => { g.beginPath(); g.moveTo(x + o - Math.cos(a) * L / 2, y - Math.sin(a) * L / 2); g.lineTo(x + o + Math.cos(a) * L / 2, y + Math.sin(a) * L / 2); g.stroke(); });
    } else if (G.style === 'swirl') {
      const ang = Math.sin(x * 0.012 + y * 0.004) * 1.2 + Math.cos(y * 0.02) * 0.6, L = 18 + R() * 30, bend = (R() - 0.5) * 0.9;
      const fl = R() < 0.07; g.strokeStyle = rgba(fl ? hex(G.fleck) : R() < 0.3 ? mix(base, [110, 160, 230], 0.3 + R() * 0.2) : R() < 0.2 ? mix(base, [20, 60, 80], 0.3) : tone, fl ? 0.75 : 0.7); g.lineWidth = fl ? 3 : 4 + R() * 5;
      wrap((o) => { g.beginPath(); g.moveTo(x + o, y); g.quadraticCurveTo(x + o + Math.cos(ang + bend) * L * 0.6, y + Math.sin(ang + bend) * L * 0.6, x + o + Math.cos(ang) * L, y + Math.sin(ang) * L); g.stroke(); });
    } else if (G.style === 'chalk') {
      const L = 20 + R() * 50; g.strokeStyle = rgba(mix(base, [255, 250, 235], 0.1 + R() * 0.25), 0.22); g.lineWidth = 2 + R() * 6;
      wrap((o) => { g.beginPath(); g.moveTo(x + o, y); g.lineTo(x + o + L, y + (R() - 0.5) * 4); g.stroke(); });
      if (R() < 0.05) { g.strokeStyle = rgba(mix(base, [40, 24, 10], 0.5), 0.5); g.lineWidth = 1.2; let cx = x, cy = y; g.beginPath(); g.moveTo(cx, cy); for (let s = 0; s < 6; s++) { cx += 6 + R() * 10; cy += (R() - 0.4) * 10; g.lineTo(cx, cy); } g.stroke(); }
    } else if (G.style === 'ink') {
      const L = 10 + R() * 26; g.strokeStyle = rgba(mix(base, R() < 0.5 ? [239, 226, 196] : [8, 12, 20], 0.12), 0.35); g.lineWidth = 1.2 + R() * 2;
      wrap((o) => { g.beginPath(); g.moveTo(x + o, y); g.lineTo(x + o + L, y + (R() - 0.5) * 2); g.stroke(); });
    } else if (G.style === 'gold') {
      const s = 4 + R() * 7, gold = R() < 0.45 * (1 - depthFade * 0.6);
      g.fillStyle = rgba(gold ? mix(hex(G.fleck), [255, 250, 220], R() * 0.4) : tone, gold ? 0.85 : 0.5);
      wrap((o) => { g.save(); g.translate(x + o, y); g.rotate((R() - 0.5) * 0.5); g.fillRect(-s / 2, -s / 2, s, s); g.restore(); });
      if (R() < 0.03) { g.strokeStyle = rgba(hex(G.fleck), 0.8); g.lineWidth = 1.6; wrap((o) => { g.beginPath(); for (let t = 0; t < 14; t += 0.3) g.lineTo(x + o + Math.cos(t) * t * 0.9, y + Math.sin(t) * t * 0.9); g.stroke(); }); }
    } else if (G.style === 'lacquer') {
      if (R() < 0.12) { // gold leaf flake / eggshell chip
        const egg = R() < 0.35, s = 3 + R() * 6; g.fillStyle = rgba(egg ? hex(G.stone) : mix(hex(G.fleck), [255, 255, 255], R() * 0.3), egg ? 0.8 : 0.75 - depthFade * 0.3);
        wrap((o) => { g.beginPath(); for (let j = 0; j < 5; j++) { const a = j / 5 * TAU + R() * 0.5, r = s * (0.6 + R() * 0.5); g.lineTo(x + o + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill(); });
      } else { const L = 30 + R() * 60; g.strokeStyle = rgba(mix(base, [255, 210, 160], 0.08), 0.25); g.lineWidth = 2 + R() * 4; wrap((o) => { g.beginPath(); g.moveTo(x + o, y); g.lineTo(x + o + L, y); g.stroke(); }); }
    }
  }
  if (G.style === 'swirl') { // Van Gogh: concentric swirl knots in the soil
    for (let i = 0; i < 22; i++) {
      const x = R() * W, y = GROUND.TOP + 90 + R() * 480, k = bandOf(x, y), rr = 16 + R() * 26, dir = R() < 0.5 ? 1 : -1;
      for (let r = 4; r < rr; r += 4.5) {
        g.strokeStyle = rgba(r > rr - 6 && R() < 0.5 ? hex(G.fleck) : mix(soil[k], [140, 180, 240], 0.25 + R() * 0.3), 0.7); g.lineWidth = 3;
        const a0 = R() * TAU; wrap((o) => { g.beginPath(); g.arc(x + o, y, r, a0, a0 + dir * (3.5 + R() * 1.5), dir < 0); g.stroke(); });
      }
    }
  }
  if (G.style === 'ink') { // woodblock: bokashi at the top of each band, seigaiha waves, washi grain
    for (let k = 0; k < 3; k++) {
      const y0 = GROUND.TOP + [44, 120, 260][k], bk = g.createLinearGradient(0, y0 - 10, 0, y0 + 60);
      bk.addColorStop(0, 'rgba(255,248,230,0.16)'); bk.addColorStop(1, 'rgba(255,248,230,0)'); g.fillStyle = bk; g.fillRect(0, y0 - 20, W, 90);
    }
    const sr = 22;
    for (let row = 0; row < 7; row++) for (let col = -1; col < W / (sr * 2) + 1; col++) {
      const cx = col * sr * 2 + (row % 2) * sr, cy = GROUND.TOP + 66 + row * sr * 0.55;
      if (cy > bandY(1, cx) - 2) continue;
      for (let r = sr; r > 3; r -= 5) { g.strokeStyle = rgba(r === sr ? [12, 18, 30] : mix(soil[1], [239, 226, 196], 0.18 + (sr - r) * 0.012), r === sr ? 0.7 : 0.55); g.lineWidth = r === sr ? 2 : 1.6; g.beginPath(); g.arc(cx, cy, r, Math.PI, TAU); g.stroke(); }
    }
    for (let i = 0; i < 9000; i++) { const x = R() * W, y = GROUND.TOP + R() * (H - GROUND.TOP); g.fillStyle = R() < 0.5 ? 'rgba(255,248,230,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(x, y, 1 + R() * 2, 1); }
  }
  if (G.mosaic) { // fresco: a cosmatesque inlay band under the floor line
    const y0 = GROUND.TOP + 22, sz = 16, M = G.mosaic.map(hex);
    g.fillStyle = rgba(mix(soil[0], [255, 250, 235], 0.25)); g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 - 6 + 4 * Math.sin(x * P2 * 2 + 0.6)); for (let x = W; x >= 0; x -= 8) g.lineTo(x, y0 + sz + 6 + 4 * Math.sin(x * P2 * 2 + 0.6)); g.closePath(); g.fill();
    for (let x = 0; x < W; x += sz) {
      const yy = y0 + 4 * Math.sin(x * P2 * 2 + 0.6), c = M[(x / sz) % M.length | 0], c2 = M[((x / sz) + 2) % M.length | 0];
      g.fillStyle = rgba(c, 0.9); g.beginPath(); g.moveTo(x, yy + sz); g.lineTo(x + sz / 2, yy); g.lineTo(x + sz, yy + sz); g.closePath(); g.fill();
      g.fillStyle = rgba(c2, 0.85); g.beginPath(); g.arc(x + sz / 2, yy + sz * 0.62, sz * 0.18, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,40,20,0.5)'; g.lineWidth = 1; g.strokeRect(x, yy, sz, sz);
    }
    for (let i = 0; i < 6000; i++) { const x = R() * W, y = GROUND.TOP + R() * (H - GROUND.TOP); g.fillStyle = R() < 0.5 ? 'rgba(255,250,235,0.07)' : 'rgba(60,40,20,0.06)'; g.fillRect(x, y, 1.5, 1.5); }
  }
  { const sh = g.createLinearGradient(0, GROUND.TOP - 10, 0, GROUND.TOP + 70); sh.addColorStop(0, 'rgba(0,0,0,0.38)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.beginPath(); g.moveTo(0, GROUND.TOP + 80); for (let x = 0; x <= W; x += 8) g.lineTo(x, soilLine(x)); g.lineTo(W, GROUND.TOP + 80); g.closePath(); g.fill(); }
  // 3. strata boundaries: dark seam + light lip (ink worlds get a woodblock keyline)
  for (let k = 0; k < 3; k++) {
    g.beginPath(); for (let x = 0; x <= W; x += 6) g.lineTo(x, bandY(k, x));
    g.strokeStyle = rgba(mix(soil[k + 1], [0, 0, 0], 0.35), G.style === 'ink' ? 0.9 : 0.45); g.lineWidth = G.style === 'ink' ? 3 : 2.5; g.stroke();
    g.beginPath(); for (let x = 0; x <= W; x += 6) g.lineTo(x, bandY(k, x) - 3);
    g.strokeStyle = rgba(mix(soil[k], [255, 245, 220], 0.25), 0.25); g.lineWidth = 2; g.stroke();
  }
  // 4. stones (lit from the upper left)
  for (let i = 0; i < 26; i++) {
    const x = R() * W, y = GROUND.TOP + 40 + R() * 520, rx = 6 + R() * 16, ry = rx * (0.55 + R() * 0.3), st = hex(G.stone), k = bandOf(x, y);
    wrap((o) => {
      g.fillStyle = rgba(mix(st, soil[k], 0.45 + k * 0.1)); g.beginPath(); g.ellipse(x + o, y, rx, ry, (R() - 0.5) * 0.6, 0, TAU); g.fill();
      g.fillStyle = rgba(mix(st, [255, 255, 255], 0.25), 0.55 - k * 0.1); g.beginPath(); g.ellipse(x + o - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.35, -0.3, 0, TAU); g.fill();
      g.strokeStyle = rgba(mix(soil[k], [0, 0, 0], 0.5), 0.5); g.lineWidth = 1.2; g.beginPath(); g.ellipse(x + o, y, rx, ry, 0, 0.2, Math.PI - 0.2); g.stroke();
    });
  }
  // 5. fine rootlets
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    let x = R() * W, y = soilLine(x) + 6 + R() * 120, a = Math.PI / 2 + (R() - 0.5) * 1.4;
    const n = 6 + (R() * 8) | 0; g.strokeStyle = rgba(hex(G.root), 0.55); g.lineWidth = 1 + R() * 1.6;
    const pts = [[x, y]]; for (let s = 0; s < n; s++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
    wrap((o) => { g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px + o, py) : g.moveTo(px + o, py))); g.stroke(); });
  }
  // 6. soil lip: dark rim then a sunlit edge right under the grass
  g.beginPath(); for (let x = 0; x <= W; x += 6) g.lineTo(x, soilLine(x) + 3); g.strokeStyle = rgba(mix(soil[0], [0, 0, 0], 0.45), 0.7); g.lineWidth = 5; g.stroke();
  g.beginPath(); for (let x = 0; x <= W; x += 6) g.lineTo(x, soilLine(x) + 8); g.strokeStyle = rgba(mix(soil[0], [255, 230, 180], 0.3), 0.35); g.lineWidth = 3; g.stroke();
  // 7. grass / plants along the top edge (behind -> front, three depth rows)
  const top = G.top.map((h) => mix(hex(h), soil[0], 0.12));
  const clump = (x) => 0.55 + 0.45 * Math.sin(x * P2 * 7 + 0.4) * Math.sin(x * P2 * 3 + 1.1);
  for (let row = 0; row < 3; row++) {
    const n = [170, 220, 120][row];
    for (let i = 0; i < n; i++) {
      const x = R() * W, y0 = soilLine(x) + 5 + row * 4, h = ((G.style === 'gold' || G.style === 'ink' ? 16 : 20) + R() * (row === 1 ? 44 : 30)) * (0.45 + clump(x) * 0.9);
      const lean = (R() - 0.5) * 0.9 + Math.sin(x * 0.01) * 0.35, bw = 2.2 + R() * 2.6;
      const c = mix(top[(R() * top.length) | 0], row === 0 ? soil[1] : [255, 250, 230], row === 0 ? 0.45 : row === 2 ? 0.1 : 0);
      const tx = lean * h * 0.7, cx = lean * h * 0.25;
      wrap((o) => {
        g.fillStyle = rgba(c, 0.97); g.beginPath(); g.moveTo(x + o - bw, y0); g.quadraticCurveTo(x + o + cx - bw * 0.4, y0 - h * 0.55, x + o + tx, y0 - h); g.quadraticCurveTo(x + o + cx + bw * 0.4, y0 - h * 0.5, x + o + bw, y0); g.closePath(); g.fill();
        if (row) { g.strokeStyle = rgba(mix(c, [255, 252, 235], 0.35), 0.55); g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + o - bw * 0.3, y0 - 2); g.quadraticCurveTo(x + o + cx - bw * 0.3, y0 - h * 0.55, x + o + tx, y0 - h); g.stroke(); }
        if (G.style === 'ink' && row) { g.strokeStyle = 'rgba(10,15,20,0.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + o + bw, y0); g.quadraticCurveTo(x + o + cx + bw * 0.4, y0 - h * 0.5, x + o + tx, y0 - h); g.stroke(); }
        if ((G.style === 'gold' || G.style === 'lacquer') && row === 2) { g.strokeStyle = rgba(hex(G.fleck), 0.8); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + o + bw, y0); g.quadraticCurveTo(x + o + cx + bw * 0.4, y0 - h * 0.5, x + o + tx, y0 - h); g.stroke(); }
      });
    }
    if (row === 1) { // flowers / pads / gold spirals between the rows
      const fc = G.flowers.map(hex);
      for (let i = 0; i < 46; i++) {
        const x = R() * W, y = soilLine(x) - 6 - R() * 30, r = 2.2 + R() * 3, c = fc[(R() * fc.length) | 0];
        wrap((o) => {
          if (G.style === 'dab' && worldId === 'lilies' && R() < 0.4) { g.fillStyle = rgba(mix(top[0], [0, 0, 0], 0.15)); g.beginPath(); g.ellipse(x + o, y + 22, 12, 4, 0, 0.3, TAU); g.fill(); }
          g.strokeStyle = rgba(mix(top[1], [0, 0, 0], 0.2)); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + o, y); g.lineTo(x + o + (R() - 0.5) * 4, y + 26); g.stroke();
          for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; g.fillStyle = rgba(c); g.beginPath(); g.arc(x + o + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, TAU); g.fill(); }
          g.fillStyle = rgba(G.style === 'gold' ? [60, 30, 10] : [255, 200, 60]); g.beginPath(); g.arc(x + o, y, r * 0.55, 0, TAU); g.fill();
        });
      }
    }
  }
  // 8. fade the bottom into the deep soil colour (the solid fill below matches it)
  const fd = g.createLinearGradient(0, H - 300, 0, H);
  fd.addColorStop(0, rgba(deep, 0)); fd.addColorStop(1, rgba(deep, 1));
  g.fillStyle = fd; g.fillRect(0, H - 300, W, 300);
  return cv;
}

/** Root system of the vine under the ground: tapered polygons [{pts:[[x,y]..], hi:[[x,y]..]}] relative to the base. */
export function rootShapes(seed) {
  const R = prng(seed * 2654435761 >>> 0), out = [];
  const grow = (x, y, a, len, w, depth) => {
    const n = Math.max(5, Math.round(len / 16)), L = [], Rr = [], mid = [];
    let cx = x, cy = y, ang = a;
    for (let i = 0; i <= n; i++) {
      const t = i / n, ww = w * (1 - t * 0.92) + 0.6;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      L.push([cx + nx * ww / 2, cy + ny * ww / 2]); Rr.push([cx - nx * ww / 2, cy - ny * ww / 2]); mid.push([cx, cy, ww]);
      if (depth < 2 && i > 1 && i < n - 1 && R() < 0.22) grow(cx, cy, ang + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.5), len * (0.35 + R() * 0.25), ww * 0.7, depth + 1);
      ang += (R() - 0.5) * 0.5 + (Math.PI / 2 - ang) * 0.06; // gravitropism: slowly bends downward
      cx += Math.cos(ang) * len / n; cy += Math.sin(ang) * len / n;
    }
    out.push({ pts: L.concat(Rr.reverse()), mid, depth });
  };
  const N = 6;
  for (let i = 0; i < N; i++) {
    const side = i % 2 ? 1 : -1, a = Math.PI / 2 + side * (0.25 + (i >> 1) * 0.42 + R() * 0.2);
    grow(side * (2 + R() * 4), 2, a, 160 + R() * 150 - (i >> 1) * 20, 19 - (i >> 1) * 4, 0);
  }
  return out.sort((p, q) => q.depth - p.depth);
}

/** Painted roots (canvas, once per run): layered bristle strokes along each root, lit from the upper left.
 *  Returns { cv, ox, oy, res }: draw at (base.x - ox, base.y - oy) scaled 1/res. */
export function paintRoots(worldId, seed) {
  const G = vstyle(worldId).ground, res = 1.5, Wd = 760, Hd = 460, ox = Wd / 2, oy = 14;
  const cv = canvas(Wd * res, Hd * res), g = cv.getContext('2d'); g.scale(res, res); g.translate(ox, oy);
  const root = hex(G.root), hi = hex(G.rootHi), R = prng(seed * 7 + 3);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = (m, off, wk, col, a) => { g.strokeStyle = rgba(col, a); g.beginPath(); m.forEach(([x, y, w], i) => { const X = x - w * off, Y = y - w * off * 0.4; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.lineWidth = Math.max(0.8, m[0][2] * wk); g.stroke(); };
  for (const r of rootShapes(seed || 1)) {
    const m = r.mid; if (m.length < 2) continue;
    // tapered body: draw the root as overlapping segments of decreasing width
    for (let i = 0; i < m.length - 1; i++) {
      const [x0, y0, w0] = m[i], [x1, y1] = m[i + 1];
      g.strokeStyle = rgba(mix(root, [0, 0, 0], 0.35)); g.lineWidth = w0 + 2.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    for (let i = 0; i < m.length - 1; i++) {
      const [x0, y0, w0] = m[i], [x1, y1] = m[i + 1];
      g.strokeStyle = rgba(root); g.lineWidth = w0; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // bark streaks + lit edge
    for (let k = 0; k < 3; k++) {
      const seg = m.slice(0, Math.max(2, Math.round(m.length * (0.6 + R() * 0.4))));
      g.strokeStyle = rgba(mix(root, k ? [0, 0, 0] : hi, k ? 0.25 : 0.35), 0.6); g.lineWidth = 1.1;
      g.beginPath(); seg.forEach(([x, y, w], i) => { const X = x + w * (k - 1) * 0.22; i ? g.lineTo(X, y) : g.moveTo(X, y); }); g.stroke();
    }
    line(m.slice(0, Math.max(2, m.length - 2)), 0.28, 0.16, hi, 0.55);
  }
  // collar where the stem enters the soil
  const cg = g.createRadialGradient(0, 4, 2, 0, 4, 34); cg.addColorStop(0, 'rgba(0,0,0,0.45)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = cg; g.beginPath(); g.ellipse(0, 4, 34, 10, 0, 0, TAU); g.fill();
  return { cv, ox, oy, res };
}
