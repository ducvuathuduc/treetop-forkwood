// End-of-run share card: the player's tree as a postcard from the map it grew
// in, with height, score and a commit-style hash.
// P8-MAPS: retheme to the layered-silhouette world (haze window built from the
// map's palette and plates, hairline frame, light type on the dark papers) and
// a postage stamp unique to each map (motif, colours, perforated edge,
// denomination = height) with a postmark naming the map and country. The
// postcard skins (THEME.card: cream / kraft / night / stamp / storm) still set
// paper, ink and edge; the default cream takes the map's own paper tint.
import { PX_PER_M, STAGES, SKY_STOPS, stageIndexFor } from './sim.js';
import { roundRect, INK, PAPER, OCHRE, MOSS, FONT, skyAt, flagPath, skinLeaf, drawBud } from './render.js';
import { THEME, leafColor } from './skins.js';
import { MAP, selected as selectedMap, zonePalettes } from './maps.js'; // P8-MAPS
import { ZONES } from './backdrop.js'; // P8-MAPS: classic zone palettes
import { art } from './art.js'; // P8-MAPS: the map's plates, when already decoded
import { WORLD as WMETA } from './worlds-meta.js'; // V2-INT fix: the postcard is from the v2 world, not a v1 map
import { buildHistory, drawGraph, graphPalette } from './commit-graph.js'; // V3.2-CARD
import { poemFacts, offlinePoem, aiPoem, uiLang, stageName, causeShort } from './commit-poet.js'; // V3.2-CARD

const TAU = Math.PI * 2;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const f = (w, px, fam = 'ui') => `${w} ${px}px ${FONT[fam]}`;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const g = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${g((n >> 16) & 255)},${g((n >> 8) & 255)},${g(n & 255)})`;
}

function leaf(ctx, x, y, len, ang, fill) { skinLeaf(ctx, x, y, len, ang, fill, 2.6); }

function flower(ctx, x, y, r, rot, petal) {
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass ? petal : INK;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) { const a = rot + k * TAU / 5, px = x + Math.cos(a) * r * 0.9, py = y + Math.sin(a) * r * 0.9; ctx.moveTo(px + r * 0.62 + (pass ? 0 : 2), py); ctx.arc(px, py, r * 0.62 + (pass ? 0 : 2), 0, TAU); }
    ctx.fill();
  }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r * 0.42 + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = THEME.blossom.center; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
}

/**
 * Draw the whole tree into rect (x, y, w, h) in screen pixels: vertical
 * compressed to fit, horizontal gently exaggerated so it keeps a silhouette.
 */
export function drawTreeCompact(ctx, s, rect, opts = {}) {
  let y0 = 0, x0 = 1e9, x1 = -1e9;
  for (const p of s.paths) {
    if (p.state === 'gone' || p.state === 'reverting') continue;
    for (const q of p.pts) { if (q.y < y0) y0 = q.y; if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; }
  }
  const treeH = Math.max(600, -y0);
  const sy = rect.h / treeH;
  const sx = Math.min(rect.w / Math.max(220, x1 - x0 + 60), Math.max(sy * 1.8, Math.min(0.55, sy * 2.6)));
  const midX = (x0 + x1) / 2;
  const mapX = (x) => rect.x + rect.w / 2 + (x - midX) * sx;
  const mapY = (y) => rect.y + rect.h + y * sy;
  const wk = Math.max(0.55, Math.min(1, sx * 1.6));
  const now = s.t;
  const minGap = 6;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const paths = s.paths.filter((p) => p.state !== 'gone' && p.state !== 'reverting' && p.pts.length > 1);
  paths.sort((a, b) => (a.id === 0 ? 1 : 0) - (b.id === 0 ? 1 : 0));
  const leafLen = opts.leafLen || 22;
  // foliage behind the wood
  const blooms = [];
  for (const p of paths) for (const c of p.commits) {
    const pt = p.pts[Math.min(c.i, p.pts.length - 1)];
    const X = mapX(pt.x), Y = mapY(pt.y), st = STAGES[stageIndexFor(-pt.y / PX_PER_M)];
    if (c.kind === 'bloom') { blooms.push({ X, Y, seed: c.i }); continue; }
    const n = c.kind === 'merge' ? 4 : 2;
    for (let j = 0; j < n; j++) {
      const h = hash(c.i * 3.1 + p.id * 7 + j);
      const side = j % 2 ? -1 : 1;
      const ang = -Math.PI / 2 + side * (0.6 + h * 0.8);
      const lc = THEME.leaf.leaves ? leafColor(st, j) : (j % 2 ? shade(st.leaf, 0.78) : st.leaf);
      leaf(ctx, X, Y, leafLen * (0.7 + h * 0.5), ang, lc);
    }
  }
  // wood: ink outline, bark, light edge
  for (let pass = 0; pass < 3; pass++) {
    for (const p of paths) {
      let lastX = null, lastY = null, bucket = -1;
      ctx.beginPath();
      for (let i = 0; i < p.pts.length; i++) {
        const q = p.pts[i];
        const X = mapX(q.x), Y = mapY(q.y);
        if (lastX !== null && i < p.pts.length - 1 && Math.hypot(X - lastX, Y - lastY) < minGap) continue;
        const age = Math.max(0, now - q.t);
        let w = (2.6 + Math.min(24, 2.1 * Math.sqrt(age))) * wk + 2;
        if (pass === 0) w += 4; else if (pass === 2) w *= 0.28;
        const bk = Math.round(w * 2);
        if (lastX === null) ctx.moveTo(X, Y);
        else {
          if (bk !== bucket && bucket !== -1) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(lastX - (pass === 2 ? w * 0.6 : 0), lastY); }
          ctx.lineWidth = w;
          ctx.strokeStyle = pass === 0 ? INK : pass === 1 ? THEME.bark.wood : THEME.bark.light;
          ctx.lineTo(X - (pass === 2 ? w * 0.6 : 0), Y);
        }
        bucket = bk; lastX = X; lastY = Y;
      }
      ctx.stroke();
    }
  }
  for (const b of blooms) for (let k = 0; k < 3; k++) flower(ctx, b.X + (k - 1) * 13, b.Y - 6 - (k % 2) * 10, 8 + hash(b.seed + k) * 3, hash(b.seed * 2 + k) * 6, k === 1 ? THEME.blossom.alt : THEME.blossom.petal);
  // commit dots
  for (const p of paths) for (const c of p.commits) {
    if (c.kind === 'bloom') continue;
    const pt = p.pts[Math.min(c.i, p.pts.length - 1)];
    const X = mapX(pt.x), Y = mapY(pt.y);
    const r = c.kind === 'merge' ? 5 : c.kind === 'fork' ? 4 : 2.8;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(X, Y, r + 2, 0, TAU); ctx.fill();
    ctx.fillStyle = c.kind === 'merge' ? OCHRE : c.kind === 'fork' ? '#8fd0e6' : PAPER;
    ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
  }
  // the bud at the very top
  const tx = mapX(s.cx), ty = mapY(s.cy);
  ctx.save(); ctx.translate(tx, ty - 4); drawBud(ctx, false, 1.15); ctx.restore();
  return { mapY, sy };
}

function grain(ctx, w, h, seed = 3) {
  let a = seed;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / 90; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(30,26,22,0.06)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  }
}


// ------------------------------------------------------------------ P8-MAPS: card helpers
const hx = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 1) => { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const mixh = (a, b, t) => { const A = hx(a), B = hx(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const lum = (h) => { const [r, g, b] = hx(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
/** The five zone palettes (sky top/bot, mass, mid, lite, deep, fog, ray) for a map. */
function palsFor(map) { return zonePalettes(map) || ZONES.map((z) => z); }
const ZM = [0, 200, 450, 800, 1200];
function zoneIdx(m) { let i = 0; for (let k = 0; k < ZM.length; k++) if (m >= ZM[k]) i = k; return i; }

/** Haze window: the map's sky through every zone climbed, plates or procedural treelines, tree on top. */
function drawWindow(ctx, s, sum, map, P) {
  const pals = palsFor(map);
  const topM = Math.max(60, sum.height * 1.12);
  const zTop = zoneIdx(topM);
  // sky: bottom = zone 0 horizon, top = the highest zone reached
  const g = ctx.createLinearGradient(0, P.y + P.h, 0, P.y);
  g.addColorStop(0, pals[0].bot);
  for (let i = 1; i <= zTop; i++) g.addColorStop(Math.min(0.98, ZM[i] / topM), mixh(pals[i - 1].top, pals[i].bot, 0.5));
  g.addColorStop(1, pals[zTop].top);
  ctx.fillStyle = g; ctx.fillRect(P.x, P.y, P.w, P.h);
  const top = pals[zTop], base = pals[0];
  if (map.painting) { // V2-INT: the world's own painting fills the window; the tree grows over it
    const im = map.painting, k = Math.max(P.w / im.naturalWidth, P.h / im.naturalHeight);
    ctx.drawImage(im, P.x + (P.w - im.naturalWidth * k) / 2, P.y + (P.h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
    const fg = ctx.createLinearGradient(0, P.y, 0, P.y + P.h); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = fg; ctx.fillRect(P.x, P.y, P.w, P.h);
    return P.y + P.h - 96;
  }
  // sky plate of the map, faint, for its signature (cave skylight, castle, sun...)
  const sky = art(map.plates ? `m-sky-${map.plates}` : 'w-sky-meadow');
  if (sky) { ctx.globalAlpha = zTop >= 3 ? 0.18 : 0.5; const k = Math.max(P.w / sky.naturalWidth, P.h / sky.naturalHeight); ctx.drawImage(sky, P.x + (P.w - sky.naturalWidth * k) / 2, P.y + (P.h - sky.naturalHeight * k) / 2, sky.naturalWidth * k, sky.naturalHeight * k); ctx.globalAlpha = 1; }
  // stars above dusk
  if (zTop >= 3) for (let i = 0; i < 90; i++) { ctx.fillStyle = rgba(top.acc, (0.3 + hash(i) * 0.6).toFixed(2)); ctx.fillRect(P.x + hash(i + 1) * P.w, P.y + hash(i + 2) * P.h * 0.45, 2.4, 2.4); }
  // sun / moon: soft disc in the ray colour
  const sx = P.x + P.w * 0.78, sy = P.y + 150;
  for (let k = 3; k >= 1; k--) { ctx.fillStyle = rgba(top.ray, 0.09); ctx.beginPath(); ctx.arc(sx, sy, 56 * (1 + k * 0.45), 0, TAU); ctx.fill(); }
  ctx.fillStyle = rgba(top.ray, 0.95); ctx.beginPath(); ctx.arc(sx, sy, 56, 0, TAU); ctx.fill();
  // far layer: the map's plate tiled, else code-drawn treelines
  const far = art(map.plates ? `m-far-${map.plates}` : 'w-far-meadow');
  const groundY = P.y + P.h - 96;
  if (far) {
    const k = P.w / far.naturalWidth, th = far.naturalHeight * k;
    ctx.globalAlpha = 0.5;
    for (let y = groundY - th * 0.92; y > P.y - th; y -= th) ctx.drawImage(far, P.x, y, P.w, th);
    ctx.drawImage(far, P.x, groundY - th * 0.92 + th, P.w, th);
    ctx.globalAlpha = 1;
  } else {
    for (let L = 0; L < 3; L++) {
      ctx.fillStyle = rgba([base.mass, base.mid, base.lite][L], 0.55 + L * 0.15);
      ctx.beginPath(); ctx.moveTo(P.x, P.y + P.h);
      for (let x = 0; x <= P.w; x += 12) { const h = 140 - L * 40 + 40 * Math.sin(x * 0.012 + L * 2) + 30 * hash(Math.floor(x / 36) + L * 50); ctx.lineTo(P.x + x, groundY - h); }
      ctx.lineTo(P.x + P.w, P.y + P.h); ctx.fill();
    }
  }
  // haze over the far layer, thicker low down
  const fg = ctx.createLinearGradient(0, P.y, 0, P.y + P.h);
  fg.addColorStop(0, rgba(top.fog, 0)); fg.addColorStop(0.6, rgba(base.fog, 0.22)); fg.addColorStop(1, rgba(base.fog, 0.5));
  ctx.fillStyle = fg; ctx.fillRect(P.x, P.y, P.w, P.h);
  // side frames at the window edges
  const side = art(map.plates ? `m-side-${map.plates}` : 'w-side-meadow');
  if (side) {
    const k = (P.w / side.naturalWidth) * 0.9, hw = side.naturalWidth / 2, th = side.naturalHeight * k;
    ctx.globalAlpha = 0.92;
    for (const [sx0, dx, off] of [[0, P.x, 0], [hw, P.x + P.w - hw * k, th * 0.4]]) {
      for (let y = P.y - off; y < P.y + P.h; y += th) ctx.drawImage(side, sx0, 0, hw, side.naturalHeight, dx, y, hw * k, th);
    }
    ctx.globalAlpha = 1;
  }
  // ground: two silhouette hills
  for (const [col, off, amp] of [[base.lite, 0, 14], [base.deep, 26, 9]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(P.x, P.y + P.h);
    for (let x = 0; x <= P.w; x += 16) ctx.lineTo(P.x + x, groundY + off - amp * Math.sin(x * 0.009 + off));
    ctx.lineTo(P.x + P.w, P.y + P.h); ctx.fill();
  }
  return groundY;
}

// P8-MAPS: the stamp + postmark drawing lives in stamps.js, fetched after boot
// (keeps first load under budget); a card rendered before it lands has no stamp.
let ST = null;
export const loadStamps = () => (ST ? Promise.resolve(ST) : import('./stamps.js').then((m) => (ST = m)));
if (typeof window !== 'undefined') setTimeout(() => loadStamps().catch(() => {}), 2500);

// ---------------------------------------------------------------- V2 world postcard
// v1 maps (Phong Nha, Arashiyama, Redwoods ...) are retired: the card, stamp and postmark name the
// painted world you climbed (EN + VI) and show its gallery painting (<world>.ui.painting).
const PAINT = new Map();
/** Decode a world's painting for the card (resolves when ready or failed; never rejects). */
export function preloadPainting(worldId) {
  if (!worldId || !WMETA[worldId]) return Promise.resolve(null);
  if (PAINT.has(worldId)) return PAINT.get(worldId).p;
  const im = new Image(); im.decoding = 'async';
  const p = new Promise((res) => { im.onload = () => res(im); im.onerror = () => res(null); });
  im.src = new URL(`../assets/v2/${worldId}/ui/${worldId}.ui.painting.webp`, import.meta.url).href;
  PAINT.set(worldId, { im, p });
  return p;
}
const painting = (id) => { const e = PAINT.get(id); return e && e.im.complete && e.im.naturalWidth ? e.im : null; };
/** A v1-map-shaped card description of a v2 world (palettes borrowed from its legacy slot). */
export function worldCard(worldId) {
  const w = WMETA[worldId]; if (!w) return null;
  const legacy = MAP[w.legacy] || MAP.forkwood;
  const [t0, t1, t2, t3] = w.tones;
  return { ...legacy, id: w.legacy, world: w.id, name: w.name, nameVi: w.nameVi, place: w.nameVi, country: w.medium, code: '', tale: null, plates: null, painting: painting(w.id),
    swatch: [t0, t1, t3], paper: '#f3eee4',
    stamp: { motif: 'painting', ink: t3, bg: [t0, t1], accent: t1, word: w.nameVi.toUpperCase(), postmark: `${w.name.toUpperCase()} · FORKWOOD` } };
}

// ---------------------------------------------------------------- V3.2-CARD: commit-graph postcard
// The card is a `git log --graph` of the run: the actual fork/merge/revert lines
// painted beside the tree (same vertical scale, so a commit dot sits at the height
// it happened), and the tree's "commit message" (offline poet, optional AI line).
// Sizes: 'portrait' 1080x1350 (default, feeds/stories) and 'wide' 1200x630 (link previews, X/FB).
export const CARD_SIZES = { portrait: [1080, 1350], wide: [1200, 630] };

/** History + facts + offline poem for a run (cached on the sim so re-renders agree). */
export function cardStory(s, sum, meta = {}) {
  const lang = meta.lang || uiLang();
  const key = `${lang}|${sum.hash}|${s.paths ? s.paths.length : 0}`;
  if (s.__card && s.__card.key === key) return s.__card;
  const H = buildHistory(s);
  const F = poemFacts(H, { ...sum, newBest: !!meta.newBest }, meta.world || sum.world);
  const poem = offlinePoem(F, sum.hash, lang);
  const st = { key, lang, H, F, poem };
  try { Object.defineProperty(s, '__card', { value: st, configurable: true, writable: true, enumerable: false }); } catch { /* frozen clone */ }
  return st;
}

/** Optional AI line (worker endpoint configured): resolves to a poem or null within ~2 s. */
export async function poetize(s, sum, meta = {}) {
  const st = cardStory(s, sum, meta);
  const p = await aiPoem(st.F, st.poem, st.lang);
  if (p) st.poem = p;
  return p;
}

function cardPal(meta, map, CI, paper, dark) {
  const w = WMETA[meta.world];
  const tones = w ? w.tones : [map.swatch[0], map.swatch[1], map.swatch[2] || map.swatch[1], CI];
  return graphPalette(tones, CI, paper, dark);
}

/** The commit line as coloured runs: sha, type(scope):, message. */
function commitRuns(poem, pal) {
  return [[poem.sha + ' ', pal.tag, 800], [`${poem.type}(${poem.scope}): `, pal.head, 800], [poem.line.replace(/(\d) (m\b)/g, '$1\u00a0$2'), pal.ink, 700]];
}
/** Lay out runs into at most maxLines lines of width w, shrinking px from px0 to pxMin. Returns {px, lines}. */
function fitRuns(ctx, runs, w, px0, pxMin, maxLines, fam = 'mono') {
  for (let px = px0; px >= pxMin; px -= 1) {
    const lines = [[]]; let x = 0;
    for (const [t, c, wt] of runs) {
      ctx.font = f(wt, px, fam);
      for (const word of t.split(/(?<= )/)) {
        const ww = ctx.measureText(word).width;
        if (x + ww > w && x > 0) { lines.push([]); x = 0; }
        lines[lines.length - 1].push([word, c, wt]); x += ww;
      }
    }
    if (lines.length <= maxLines) return { px, lines };
  }
  return null;
}
function drawRuns(ctx, fit, x, y, lh, fam = 'mono') {
  ctx.textAlign = 'left';
  fit.lines.forEach((ln, i) => {
    let cx = x;
    for (const [t, c, wt] of ln) { ctx.font = f(wt, fit.px, fam); ctx.fillStyle = c; ctx.fillText(t, cx, y + i * lh); cx += ctx.measureText(t).width; }
  });
}

function paperBg(ctx, Wc, Hc, paper, map, dark) {
  ctx.fillStyle = paper; ctx.fillRect(0, 0, Wc, Hc);
  const pg = ctx.createLinearGradient(0, 0, Wc, Hc);
  pg.addColorStop(0, rgba(map.swatch[0], dark ? 0.1 : 0.07)); pg.addColorStop(1, rgba(map.swatch[1], dark ? 0.06 : 0.1));
  ctx.fillStyle = pg; ctx.fillRect(0, 0, Wc, Hc);
}
function edges(ctx, CARD, Wc, Hc, inkA) {
  if (CARD.edge === 'perforated') { ctx.strokeStyle = inkA(0.4); ctx.lineWidth = 3; ctx.setLineDash([2, 9]); roundRect(ctx, 26, 26, Wc - 52, Hc - 52, 8); ctx.stroke(); ctx.setLineDash([]); }
  grain(ctx, Wc, Hc);
  if (CARD.edge === 'perforated') {
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 18; x < Wc; x += 36) { ctx.beginPath(); ctx.arc(x, 0, 11, 0, TAU); ctx.arc(x, Hc, 11, 0, TAU); ctx.fill(); }
    for (let y = 18; y < Hc; y += 36) { ctx.beginPath(); ctx.arc(0, y, 11, 0, TAU); ctx.arc(Wc, y, 11, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
}
/** Window + tree + graph panel; returns nothing. Graph shares the tree's vertical scale. */
function body(ctx, s, sum, map, P, G, st, pal, CI, dark, o) {
  const lang = st.lang;
  // graph panel: a slightly deeper sheet of the same paper
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : rgba(CI, 0.045);
  roundRect(ctx, G.x, G.y, G.w, G.h, 22); ctx.fill();
  ctx.strokeStyle = rgba(CI, 0.14); ctx.lineWidth = 2; roundRect(ctx, G.x, G.y, G.w, G.h, 22); ctx.stroke();
  ctx.save(); roundRect(ctx, P.x, P.y, P.w, P.h, 26); ctx.clip();
  const groundY = drawWindow(ctx, s, sum, map, P);
  const top = P.y + o.treeTop;
  const rect = { x: P.x + o.treePad, y: top, w: P.w - o.treePad * 2, h: groundY + 20 - top };
  const { mapY } = drawTreeCompact(ctx, s, rect, { leafLen: o.leaf });
  // caption
  ctx.textAlign = 'left'; ctx.shadowColor = 'rgba(8,11,28,0.5)'; ctx.shadowBlur = 12;
  ctx.font = f(700, o.capPx * 0.5); ctx.fillStyle = 'rgba(255,246,230,0.92)';
  ctx.fillText(lang === 'vi' ? 'GỬI TỪ' : 'GREETINGS FROM', P.x + 28, P.y + o.capPx * 0.95);
  ctx.font = f(500, o.capPx, 'display'); ctx.fillText(lang === 'vi' && map.nameVi ? map.nameVi : map.name, P.x + 26, P.y + o.capPx * 2.05, P.w - 52);
  ctx.font = f(600, o.capPx * 0.44); ctx.fillStyle = 'rgba(255,246,230,0.82)';
  ctx.fillText(lang === 'vi' ? `${map.name} · ${map.country || ''}` : `${map.nameVi || map.place} · ${map.country || ''}`, P.x + 28, P.y + o.capPx * 2.7, P.w - 56);
  ctx.shadowBlur = 0; ctx.restore();
  ctx.strokeStyle = rgba(CI, 0.22); ctx.lineWidth = 2; roundRect(ctx, P.x, P.y, P.w, P.h, 26); ctx.stroke();
  // graph: header, then lanes aligned to the tree
  ctx.textAlign = 'left'; ctx.fillStyle = rgba(CI, 0.5); ctx.font = f(700, o.gHead);
  ctx.fillText('$ git log --graph', G.x + 20, G.y + o.gHead * 1.9, G.w - 36);
  ctx.fillStyle = CI; ctx.font = f(500, o.gName, 'display');
  ctx.fillText(st.poem.name, G.x + 20, G.y + o.gHead * 1.9 + o.gName * 1.25, G.w - 36);
  const gRect = { x: G.x + 8, y: Math.max(G.y + o.gHead * 1.9 + o.gName * 2, rect.y), w: G.w - 16, h: 0 };
  gRect.h = mapY(0) - gRect.y;
  drawGraph(ctx, st.H, gRect, {
    pal, mapM: (m) => Math.max(gRect.y + 10, mapY(-m * PX_PER_M)), laneX: o.laneX, laneGap: o.laneGap, stroke: o.stroke, labelPx: o.labelPx,
    font: (w, px) => f(w, px), headLabel: st.poem.scope, stageName: (n) => stageName(n, lang), causeShort: (src) => causeShort(src, lang),
    stormWord: lang === 'vi' ? '~ bão ~' : '~ storm ~', rootLabel: lang === 'vi' ? 'gieo hạt' : 'init', labels: o.labels !== false,
  });
}
function statsLine(sum, st, lang) {
  const H = st.H;
  const parts = lang === 'vi'
    ? [`${sum.commits} commit`, `${H.merges} merge`, H.deaths.length ? `${H.deaths.length} revert` : '', sum.blooms ? `${sum.blooms} hoa` : '', `×${sum.maxMult}`]
    : [`${sum.commits} commit${sum.commits === 1 ? '' : 's'}`, `${H.merges} merge${H.merges === 1 ? '' : 's'}`, H.deaths.length ? `${H.deaths.length} revert${H.deaths.length > 1 ? 's' : ''}` : '', sum.blooms ? `${sum.blooms} bloom${sum.blooms > 1 ? 's' : ''}` : '', `×${sum.maxMult}`];
  return parts.filter(Boolean).join(' · ');
}

export function renderCard(s, sum, meta, opts = {}) {
  const size = opts.size || meta.size || 'portrait';
  const [Wc, Hc] = CARD_SIZES[size] || CARD_SIZES.portrait;
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const ctx = c.getContext('2d');
  const map = worldCard(meta.world) || (meta.map && (MAP[meta.map] || meta.map)) || selectedMap() || MAP.forkwood;
  const CARD = THEME.card;
  const paper = CARD.id === 'card.cream' && map.paper ? map.paper : CARD.paper, CI = CARD.ink;
  const dark = lum(paper) < 0.4;
  const inkA = (a) => rgba(CI, a);
  const st = cardStory(s, sum, meta);
  if (meta.poem) st.poem = meta.poem;
  const lang = st.lang;
  const pal = cardPal(meta, map, CI, paper, dark);
  pal.ink = CI;
  paperBg(ctx, Wc, Hc, paper, map, dark);
  const ptsTxt = lang === 'vi' ? 'điểm' : 'pts';
  const reachTxt = lang === 'vi' ? `tới ${stageName(sum.stage, lang)}` : `reached ${sum.stage}`;
  if (size === 'wide') {
    const P = { x: 24, y: 24, w: 440, h: Hc - 48 }, G = { x: 476, y: 24, w: 262, h: Hc - 48 };
    body(ctx, s, sum, map, P, G, st, pal, CI, dark, { treeTop: 130, treePad: 34, leaf: 16, capPx: 34, gHead: 15, gName: 22, laneX: 30, laneGap: 36, stroke: 8, labelPx: 14 });
    const X = 762, RW = Wc - X - 30;
    ctx.textAlign = 'left'; ctx.fillStyle = CI; ctx.font = f(700, 18); ctx.fillText('F O R K W O O D', X, 62);
    ctx.font = f(400, 112, 'display'); const ht = `${sum.height}`; ctx.fillText(ht, X - 4, 170, RW - 70);
    const hw = Math.min(ctx.measureText(ht).width, RW - 70); ctx.font = f(400, 48, 'display'); ctx.fillText('m', X + hw + 6, 170);
    ctx.font = f(700, 24); ctx.fillStyle = inkA(0.78); ctx.fillText(`${reachTxt} · ${sum.score.toLocaleString('en-US')} ${ptsTxt}`, X, 212, RW);
    if (meta.newBest) { ctx.save(); ctx.translate(Wc - 96, 70); ctx.rotate(0.05); ctx.fillStyle = '#ffc94d'; roundRect(ctx, -70, -22, 140, 40, 20); ctx.fill(); ctx.fillStyle = '#2a1e08'; ctx.textAlign = 'center'; ctx.font = f(800, 18); ctx.fillText(lang === 'vi' ? 'KỶ LỤC' : 'NEW BEST', 0, 5); ctx.restore(); ctx.textAlign = 'left'; }
    // commit message block
    ctx.strokeStyle = inkA(0.16); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, 246); ctx.lineTo(Wc - 30, 246); ctx.stroke();
    const fit = fitRuns(ctx, commitRuns(st.poem, pal), RW, 30, 19, 3) || fitRuns(ctx, commitRuns(st.poem, pal), RW, 19, 14, 5);
    drawRuns(ctx, fit, X, 290, fit.px * 1.32);
    const yAfter = 290 + fit.lines.length * fit.px * 1.32 + 6;
    ctx.font = f(600, 19); ctx.fillStyle = inkA(0.66); ctx.fillText(statsLine(sum, st, lang), X, Math.min(yAfter + 8, 470), RW);
    ctx.font = f(600, 17); ctx.fillStyle = inkA(0.58);
    ctx.fillText(`tree ${sum.hash}${meta.seed != null ? ` · course #${meta.seed}` : ''}`, X, Hc - 72, RW - 140);
    ctx.fillText(meta.url || 'Forkwood', X, Hc - 44, RW - 140);
    if (ST) ST.drawStamp(ctx, map, Wc - 92, Hc - 110, 116, 148, { height: sum.height, rot: 0.04 });
    else loadStamps().catch(() => {});
    edges(ctx, CARD, Wc, Hc, inkA);
    return c;
  }
  // ---- portrait 1080x1350
  ctx.fillStyle = CI; ctx.textAlign = 'left';
  ctx.font = f(700, 24); ctx.fillText('F O R K W O O D', 62, 86);
  if (meta.title) { const tw0 = ctx.measureText('F O R K W O O D').width; ctx.font = f(600, 22); ctx.fillStyle = inkA(0.7); ctx.fillText(`· ${meta.title}`, 74 + tw0, 86, 420 - tw0); ctx.fillStyle = CI; }
  ctx.font = f(400, 168, 'display');
  const ht = `${sum.height}`; ctx.fillText(ht, 50, 236, 560);
  const hw = Math.min(560, ctx.measureText(ht).width);
  ctx.font = f(400, 70, 'display'); ctx.fillText('m', 64 + hw, 236);
  ctx.textAlign = 'right';
  ctx.font = f(700, 34, 'mono'); ctx.fillText(`${sum.score.toLocaleString('en-US')} ${ptsTxt}`, Wc - 60, 92);
  ctx.font = f(600, 26); ctx.fillStyle = inkA(0.75);
  ctx.fillText(reachTxt, Wc - 60, 134);
  let ry = 170;
  if (meta.modeLine) { ctx.fillText(meta.modeLine, Wc - 60, ry, 420); ry += 36; }
  if (meta.stars) {
    for (let i = 0; i < 3; i++) {
      const cx = Wc - 60 - 26 - (2 - i) * 58, cy = ry + 4;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 11 : 25; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath(); ctx.fillStyle = i < meta.stars.run ? '#ffc94d' : paper; ctx.fill();
      ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = CI; ctx.stroke();
    }
    ry += 48;
  }
  if (meta.daily) { ctx.fillText(`Daily tree · ${meta.dailyLabel}`, Wc - 60, ry, 420); ry += 36; }
  if (meta.challenge) { const u = meta.challenge.pts ? ' pts' : ' m'; ctx.fillText(meta.challenge.won ? `beat a friend's ${meta.challenge.m.toLocaleString('en-US')}${u}` : `friend's best: ${meta.challenge.m.toLocaleString('en-US')}${u}`, Wc - 60, ry, 420); ry += 36; }
  if (meta.newBest) {
    ctx.save(); ctx.translate(Wc - 160, Math.min(236, Math.max(ry, 200)) + 4); ctx.rotate(-0.04);
    ctx.fillStyle = '#ffc94d'; roundRect(ctx, -100, -28, 200, 50, 25); ctx.fill();
    ctx.fillStyle = '#2a1e08'; ctx.textAlign = 'center'; ctx.font = f(800, 24); ctx.fillText(lang === 'vi' ? 'KỶ LỤC MỚI' : 'NEW BEST', 0, 6);
    ctx.restore();
  }
  const G = { x: 56, y: 262, w: 342, h: 846 }, P = { x: 414, y: 262, w: Wc - 414 - 56, h: 846 };
  body(ctx, s, sum, map, P, G, st, pal, CI, dark, { treeTop: 165, treePad: 50, leaf: 22, capPx: 44, gHead: 19, gName: 30, laneX: 40, laneGap: 50, stroke: 10, labelPx: 18 });
  // commit message: the tree's git-log oneline
  const CW = Wc - 62 - 280;
  const runs = commitRuns(st.poem, pal);
  const fit = fitRuns(ctx, runs, CW, 36, 27, 1) || fitRuns(ctx, runs, CW, 34, 22, 2) || fitRuns(ctx, runs, CW, 22, 14, 3);
  drawRuns(ctx, fit, 62, 1166, fit.px * 1.3);
  const yS = 1166 + fit.lines.length * fit.px * 1.3 + 4;
  ctx.font = f(600, 23); ctx.fillStyle = inkA(0.68); ctx.textAlign = 'left';
  ctx.fillText(`tree ${sum.hash} · ${statsLine(sum, st, lang)}`, 62, Math.min(yS + 6, 1262), Wc - 62 - 370);
  ctx.font = f(600, 20); ctx.fillStyle = inkA(0.58);
  ctx.fillText(`${meta.url || 'Forkwood'}${meta.seed != null ? `  ·  course #${meta.seed}` : ''}`, 62, 1302, Wc - 62 - 370);
  if (ST) {
    ST.drawStamp(ctx, map, Wc - 150, 1222, 184, 232, { height: sum.height, rot: 0.035 });
    ST.drawPostmark(ctx, map, Wc - 292, 1268, 58, dark ? '#fff6e6' : (map.stamp.ink), meta);
  } else loadStamps().catch(() => {});
  edges(ctx, CARD, Wc, Hc, inkA);
  return c;
}

/** Both sizes at once (portrait for feeds, wide for link previews). */
export function renderCards(s, sum, meta) { return { portrait: renderCard(s, sum, meta, { size: 'portrait' }), wide: renderCard(s, sum, meta, { size: 'wide' }) }; }


export async function shareCard(canvas, text, filename) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) return 'failed';
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    }
  } catch (e) { /* fall through to download */ }
  downloadBlob(blob, filename);
  return 'downloaded';
}

export function downloadCard(canvas, filename) {
  canvas.toBlob((blob) => { if (blob) downloadBlob(blob, filename); }, 'image/png');
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

