// Forkwood 2.0 vine skins are DATA: a texture strip plus stroke params.
//
// Strip texture (registry id `vine.skin.<name>`, type 'sprite', ideally 256x64 WebP):
//   U (x, 0..1) = AGE of the wood: left = fresh growth at the tip, right = old mature stem.
//   V (y, 0..1) = ACROSS the stroke: 0 = left edge, 0.5 = centre, 1 = right edge.
//   Paint bristle streaks, impasto ridges, gold flecks etc. so they run along U (horizontal
//   lines). The engine maps each vertex's age to U, so streaks follow the stroke direction.
//   Keep the keyline/edge inside the strip (top and bottom rows); the engine adds no outline.
// When ART has not supplied a strip, the engine paints one from `strip` below.
//
// Stroke params:
//   width     multiplier on the sim's growth width (1 = v1 thickness)
//   glow      additive halo colour for live tips (null = none); safety rule: vine stays readable
//   tip       colour of the bud/brush tip, wet  = gloss highlight strength at the tip
//   leaf      { fill, dark, vein, shape: 'leaf'|'brush'|'petal'|'diamond'|'dab' }
//   dot       commit dot colours { fork, plain }
const SK = (o) => o;

export const VINE_SKINS = {
  'vine.skin.cel': SK({
    name: 'Anime cel', medium: 'cinematic anime cel paint',
    strip: { fresh: '#8ff0c4', mid: '#4fc996', old: '#2c6e58', edge: '#14322a', edgeW: 0.13, core: '#e6fff2', coreW: 0.16, coreOff: -0.18, streaks: 0, grain: 0.02, cel: 3, rim: '#fff3c8' },
    width: 1, glow: '#7ff0c0', tip: '#eafff4', wet: 0.6,
    leaf: { fill: '#68d89c', dark: '#2f8f66', vein: '#d8ffe8', shape: 'leaf' }, dot: { fork: '#e6fff2', plain: '#fff3d0' },
  }),
  'vine.skin.impasto': SK({
    name: 'Oil impasto', medium: 'Van Gogh thick oil',
    strip: { fresh: '#8ff2b8', mid: '#3fae7a', old: '#2a5a6a', edge: '#0d1c2c', edgeW: 0.12, core: '#f6f0a0', coreW: 0.1, coreOff: -0.16, streaks: 9, streakA: 0.32, grain: 0.1, ridges: true },
    width: 1.12, glow: '#9fe8ff', tip: '#fff4a8', wet: 0.9,
    leaf: { fill: '#4fbf7a', dark: '#1f6a6a', vein: '#f2e27a', shape: 'brush' }, dot: { fork: '#f6f0a0', plain: '#fff3d0' },
  }),
  'vine.skin.sumi': SK({
    name: 'Sumi ink', medium: 'ukiyo-e ink and washi',
    strip: { fresh: '#7fe0b0', mid: '#3e8a6c', old: '#1c2a2e', edge: '#0a0f14', edgeW: 0.18, core: '#d8f0e0', coreW: 0.06, coreOff: -0.1, streaks: 5, streakA: 0.4, grain: 0.14, dryEdge: 0.35 },
    width: 1, glow: null, tip: '#f0f6f0', wet: 0.4,
    leaf: { fill: '#3f8a6a', dark: '#14262a', vein: '#e8efe0', shape: 'brush' }, dot: { fork: '#e8efe0', plain: '#fff3d0' },
  }),
  'vine.skin.goldleaf': SK({
    name: 'Gold leaf', medium: 'Klimt gold leaf',
    strip: { fresh: '#8ff0c0', mid: '#3fa77a', old: '#5a4a1a', edge: '#2a1a06', edgeW: 0.12, core: '#fff2b0', coreW: 0.12, coreOff: -0.14, streaks: 3, streakA: 0.2, grain: 0.06, flecks: '#ffd75a', fleckD: 0.06 },
    width: 1.05, glow: '#ffe9a0', tip: '#fff6c8', wet: 0.8,
    leaf: { fill: '#58c08a', dark: '#2a6a4a', vein: '#ffd75a', shape: 'diamond' }, dot: { fork: '#fff2b0', plain: '#ffe9a0' },
  }),
  'vine.skin.lacquer': SK({
    name: 'Sơn mài lacquer', medium: 'Vietnamese lacquer',
    strip: { fresh: '#8ff0c0', mid: '#3aa47a', old: '#6a1e14', edge: '#0a0404', edgeW: 0.14, core: '#ffd77a', coreW: 0.08, coreOff: -0.2, streaks: 0, grain: 0.03, sheen: 0.55, flecks: '#ffcf6a', fleckD: 0.015 },
    width: 1.05, glow: '#ffcf6a', tip: '#fff0c0', wet: 1,
    leaf: { fill: '#3fae7a', dark: '#1a4a34', vein: '#ffcf6a', shape: 'leaf' }, dot: { fork: '#ffd77a', plain: '#fff0c0' },
  }),
  'vine.skin.frescochalk': SK({
    name: 'Fresco chalk', medium: 'Renaissance fresco on plaster',
    strip: { fresh: '#9ae8c0', mid: '#62b48e', old: '#7a6a4e', edge: '#3a2a1c', edgeW: 0.1, core: '#fff6e0', coreW: 0.14, coreOff: -0.12, streaks: 4, streakA: 0.16, grain: 0.18, dryEdge: 0.5 },
    width: 1, glow: '#fff1c8', tip: '#fffaf0', wet: 0.3,
    leaf: { fill: '#7cc89a', dark: '#4a7a5e', vein: '#fff6e0', shape: 'leaf' }, dot: { fork: '#fff6e0', plain: '#ffe6a8' },
  }),
  'vine.skin.watercolour': SK({
    name: 'Watercolour', medium: 'Monet / watercolour wash',
    strip: { fresh: '#9cf2cc', mid: '#5ec2a0', old: '#4a6a8e', edge: '#2a3a5a', edgeW: 0.08, core: '#f2fff8', coreW: 0.2, coreOff: -0.1, streaks: 2, streakA: 0.12, grain: 0.06, bleed: 0.45, pool: true },
    width: 1.08, glow: '#c8f0ff', tip: '#f4fff8', wet: 0.7,
    leaf: { fill: '#7ad8a8', dark: '#3e7a8a', vein: '#f4f0ff', shape: 'dab' }, dot: { fork: '#f2fff8', plain: '#fff0d0' },
  }),
};
VINE_SKINS['vine.skin.dabs'] = SK({ ...VINE_SKINS['vine.skin.watercolour'], name: 'Impressionist dabs', medium: 'Monet broken colour',
  strip: { ...VINE_SKINS['vine.skin.watercolour'].strip, streaks: 6, streakA: 0.22, ridges: true, bleed: 0.25 },
  leaf: { fill: '#7ad8a8', dark: '#4a7ab0', vein: '#fff0f8', shape: 'dab' } });
VINE_SKINS['vine.skin.sakura'] = SK({ ...VINE_SKINS['vine.skin.cel'], name: 'Sakura', leaf: { fill: '#ffc8d8', dark: '#e890a8', vein: '#fff4f8', shape: 'petal' } });
VINE_SKINS['vine.skin.maple'] = SK({ ...VINE_SKINS['vine.skin.cel'], name: 'Maple', leaf: { fill: '#f08a3a', dark: '#c0502a', vein: '#ffe0b0', shape: 'leaf' } });
export const DEFAULT_SKIN = 'vine.skin.cel';
export const skinDef = (id) => VINE_SKINS[id] || VINE_SKINS[DEFAULT_SKIN];

// ------------------------------------------------------------------ procedural strip
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Paints a 256x64 strip canvas for a skin (used when ART has no `vine.skin.*` texture). */
export function paintStrip(id, W = 256, H = 64) {
  const S = skinDef(id).strip;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H), D = img.data;
  const fresh = hex(S.fresh), mid = hex(S.mid), old = hex(S.old), edge = hex(S.edge), core = hex(S.core);
  const fleck = S.flecks ? hex(S.flecks) : null, rim = S.rim ? hex(S.rim) : null;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, across = Math.abs(v - 0.5) * 2; // 0 centre .. 1 edge
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      let c = u < 0.4 ? mixc(fresh, mid, u / 0.4) : mixc(mid, old, (u - 0.4) / 0.6);
      // body shading: lit from the upper left (v < 0.5 side brighter), cel = stepped
      let shade = 1 - 0.32 * Math.max(0, v - 0.45) * 2;
      if (S.cel) shade = v > 0.62 ? 0.74 : v > 0.5 ? 0.9 : 1;
      c = c.map((k) => k * shade);
      // bristle streaks run along U (constant across y)
      if (S.streaks) {
        const st = Math.sin(v * Math.PI * S.streaks * 2 + vnoise(v * 9, 3) * 3) * 0.5 + 0.5;
        const a = (S.streakA || 0.2) * (st - 0.5);
        c = c.map((k) => k * (1 + a));
      }
      if (S.ridges) { // impasto ridge highlights with slow variation along the stroke
        const r = Math.pow(Math.max(0, Math.sin(v * Math.PI * 7 + vnoise(u * 6, v * 4) * 4)), 8);
        c = mixc(c, core, r * 0.35 * (1 - across));
      }
      if (S.sheen) { // lacquer: one hard specular band off-centre
        const b = Math.exp(-Math.pow((v - 0.3) / 0.06, 2));
        c = mixc(c, [255, 246, 220], b * S.sheen);
      }
      if (S.pool) { // watercolour: pigment pools darker at the edges
        c = c.map((k) => k * (1 - 0.25 * Math.pow(across, 3)));
      }
      // light core
      const cd = Math.abs(v - (0.5 + S.coreOff * 0.5)) / Math.max(0.01, S.coreW * 0.5);
      if (cd < 1) c = mixc(c, core, (1 - cd * cd) * 0.75);
      if (rim && v < 0.22 && v > 0.13) c = mixc(c, rim, 0.45);
      // grain
      const gr = (hash2(x * 0.7, y * 1.3) - 0.5) * (S.grain || 0) * 255;
      c = c.map((k) => k + gr);
      if (fleck && hash2(x * 3.1, y * 7.7) < (S.fleckD || 0.03) * (1 - across * 0.6)) c = mixc(c, fleck, 0.85);
      // edge keyline (inside the strip)
      let a = 255;
      const ew = S.edgeW || 0.1, dry = S.dryEdge ? (vnoise(u * 40, v * 3) - 0.5) * S.dryEdge * ew : 0;
      if (across > 1 - ew + dry) c = mixc(c, edge, 0.92);
      if (S.bleed) { const t = (across - (1 - S.bleed * 0.4)) / (S.bleed * 0.4); if (t > 0) a = 255 * Math.max(0.25, 1 - t * 0.75); }
      if (across > 0.985) a *= 0.5; // soft 1px AA at the very edge
      const o = (y * W + x) * 4;
      D[o] = Math.max(0, Math.min(255, c[0])); D[o + 1] = Math.max(0, Math.min(255, c[1])); D[o + 2] = Math.max(0, Math.min(255, c[2])); D[o + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Soft glow strip: white, gaussian across V, used additively (tinted by the skin glow). */
export function paintGlowStrip(W = 8, H = 64) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); const img = g.createImageData(W, H), D = img.data;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H, a = Math.exp(-Math.pow((v - 0.5) / 0.22, 2)) * 255;
    for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; D[o] = D[o + 1] = D[o + 2] = 255; D[o + 3] = a; }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
