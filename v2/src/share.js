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

export function renderCard(s, sum, meta) {
  const Wc = 1080, Hc = 1350;
  const c = document.createElement('canvas');
  c.width = Wc; c.height = Hc;
  const ctx = c.getContext('2d');
  const reached = stageIndexFor(sum.height);
  const map = (meta.map && (MAP[meta.map] || meta.map)) || selectedMap() || MAP.forkwood;
  // paper: the postcard skin; the default cream takes the map's own tint
  const CARD = THEME.card;
  const paper = CARD.id === 'card.cream' && map.paper ? map.paper : CARD.paper, CI = CARD.ink;
  const dark = lum(paper) < 0.4;
  const inkA = (a) => rgba(CI, a);
  ctx.fillStyle = paper; ctx.fillRect(0, 0, Wc, Hc);
  // a whisper of the map's colours across the paper
  const pg = ctx.createLinearGradient(0, 0, Wc, Hc);
  pg.addColorStop(0, rgba(map.swatch[0], dark ? 0.1 : 0.07)); pg.addColorStop(1, rgba(map.swatch[1], dark ? 0.06 : 0.1));
  ctx.fillStyle = pg; ctx.fillRect(0, 0, Wc, Hc);
  // the window: the map, hazy, with the tree in it
  const P = { x: 56, y: 262, w: Wc - 112, h: 930 };
  ctx.save();
  roundRect(ctx, P.x, P.y, P.w, P.h, 28); ctx.clip();
  const groundY = drawWindow(ctx, s, sum, map, P);
  const rect = { x: P.x + 150, y: P.y + 90, w: P.w - 230, h: groundY + 20 - (P.y + 90) };
  const { mapY } = drawTreeCompact(ctx, s, rect, { leafLen: 24 });
  // stage marks: hairlines with small glass labels
  ctx.textAlign = 'left';
  let lastLabelY = 1e9;
  for (let i = 1; i <= reached; i++) {
    const y = mapY(-STAGES[i].m * PX_PER_M);
    if (y < rect.y + 40 || lastLabelY - y < 70 || y > groundY - 60) continue;
    lastLabelY = y;
    const goal = STAGES[i].name === 'Treetop';
    ctx.strokeStyle = 'rgba(255,246,230,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(P.x + 18, y); ctx.lineTo(P.x + 180, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = f(700, 19);
    const label = `${STAGES[i].name}  ${STAGES[i].m} m`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(12,18,24,0.58)'; roundRect(ctx, P.x + 20, y - 36, tw + 24, 28, 14); ctx.fill();
    ctx.fillStyle = goal ? '#ffc94d' : '#fff6e6'; ctx.fillText(label, P.x + 32, y - 16);
    if (goal) { flagPath(ctx, P.x + tw + 54, y - 22, 12); ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.fillStyle = '#ffc94d'; ctx.fill(); ctx.strokeStyle = 'rgba(12,18,24,0.7)'; ctx.stroke(); }
  }
  // "greetings from" caption, top-left of the window
  ctx.textAlign = 'left';
  ctx.font = f(600, 22); ctx.fillStyle = 'rgba(255,246,230,0.92)';
  ctx.shadowColor = 'rgba(8,11,28,0.45)'; ctx.shadowBlur = 12;
  ctx.fillText('GREETINGS FROM', P.x + 34, P.y + 50);
  ctx.font = f(500, 52, 'display'); ctx.fillText(map.name, P.x + 32, P.y + 104, P.w * 0.62);
  ctx.font = f(600, 22); ctx.fillStyle = 'rgba(255,246,230,0.8)';
  ctx.fillText(`${map.place}${map.country && map.country !== map.place ? ' · ' + map.country : ''}${map.tale ? ' · ' + map.tale : ''}`, P.x + 34, P.y + 138, P.w * 0.62);
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.strokeStyle = inkA(0.22); ctx.lineWidth = 2; roundRect(ctx, P.x, P.y, P.w, P.h, 28); ctx.stroke();

  // header on the paper
  ctx.fillStyle = CI; ctx.textAlign = 'left';
  ctx.font = f(700, 24); ctx.fillText('F O R K W O O D', 62, 86);
  if (meta.title) { const tw0 = ctx.measureText('F O R K W O O D').width; ctx.font = f(600, 22); ctx.fillStyle = inkA(0.7); ctx.fillText(`· ${meta.title}`, 74 + tw0, 86); ctx.fillStyle = CI; }
  ctx.font = f(400, 168, 'display');
  const ht = `${sum.height}`;
  ctx.fillText(ht, 50, 236);
  const hw = ctx.measureText(ht).width;
  ctx.font = f(400, 70, 'display'); ctx.fillText('m', 64 + hw, 236);
  ctx.textAlign = 'right';
  ctx.font = f(700, 34, 'mono'); ctx.fillText(`${sum.score.toLocaleString('en-US')} pts`, Wc - 60, 92);
  ctx.font = f(600, 26); ctx.fillStyle = inkA(0.75);
  ctx.fillText(`reached ${sum.stage}`, Wc - 60, 134);
  let ry = 170;
  if (meta.modeLine) { ctx.fillText(meta.modeLine, Wc - 60, ry, 560); ry += 36; }
  if (meta.stars) {
    for (let i = 0; i < 3; i++) {
      const cx = Wc - 60 - 26 - (2 - i) * 58, cy = ry + 4;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 11 : 25; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = i < meta.stars.run ? '#ffc94d' : paper; ctx.fill();
      ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = CI; ctx.stroke();
    }
    ry += 48;
  }
  if (meta.daily) { ctx.fillText(`Daily tree · ${meta.dailyLabel}`, Wc - 60, ry); ry += 36; }
  if (meta.challenge) { const u = meta.challenge.pts ? ' pts' : ' m'; ctx.fillText(meta.challenge.won ? `beat a friend's ${meta.challenge.m.toLocaleString('en-US')}${u}` : `friend's best: ${meta.challenge.m.toLocaleString('en-US')}${u}`, Wc - 60, ry); ry += 36; }
  if (meta.newBest) {
    ctx.save(); ctx.translate(Wc - 160, Math.min(236, Math.max(ry, 200)) + 4); ctx.rotate(-0.04);
    ctx.fillStyle = '#ffc94d'; roundRect(ctx, -100, -28, 200, 50, 25); ctx.fill();
    ctx.fillStyle = '#2a1e08'; ctx.textAlign = 'center'; ctx.font = f(800, 24); ctx.fillText('NEW BEST', 0, 6);
    ctx.restore();
  }
  // footer: git-flavoured summary (left), stamp + postmark (right)
  ctx.textAlign = 'left';
  ctx.font = f(700, 27, 'mono');
  const h1 = `tree ${sum.hash}`;
  ctx.fillStyle = CI; ctx.fillText(h1, 62, 1252);
  ctx.fillStyle = inkA(0.72);
  ctx.fillText(` · ${sum.commits} commits · ${sum.merges} merges${sum.blooms ? ` · ${sum.blooms} blooms` : ''} · ×${sum.maxMult}`, 62 + ctx.measureText(h1).width, 1252, 650 - 62 - ctx.measureText(h1).width);
  ctx.font = f(600, 21); ctx.fillStyle = inkA(0.62);
  ctx.fillText(`${meta.url || 'Forkwood'}${meta.seed != null ? `  ·  course #${meta.seed}` : ''}`, 62, 1296, 590);
  if (ST) {
    ST.drawStamp(ctx, map, Wc - 172, 1166, 236, 300, { height: sum.height, rot: 0.035 });
    ST.drawPostmark(ctx, map, Wc - 336, 1238, 74, dark ? '#fff6e6' : (map.stamp.ink), meta);
  } else loadStamps().catch(() => {});
  if (CARD.edge === 'perforated') {
    ctx.strokeStyle = inkA(0.4); ctx.lineWidth = 3; ctx.setLineDash([2, 9]); roundRect(ctx, 26, 26, Wc - 52, Hc - 52, 8); ctx.stroke(); ctx.setLineDash([]);
  }
  grain(ctx, Wc, Hc);
  if (CARD.edge === 'perforated') {
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 18; x < Wc; x += 36) { ctx.beginPath(); ctx.arc(x, 0, 11, 0, TAU); ctx.arc(x, Hc, 11, 0, TAU); ctx.fill(); }
    for (let y = 18; y < Hc; y += 36) { ctx.beginPath(); ctx.arc(0, y, 11, 0, TAU); ctx.arc(Wc, y, 11, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  return c;
}

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

