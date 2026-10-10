// End-of-run share card: the player's tree as a printed postcard, with height,
// score and a commit-style hash. Same woodblock style as the game.
import { PX_PER_M, STAGES, SKY_STOPS, stageIndexFor } from './sim.js';
import { roundRect, INK, PAPER, OCHRE, MOSS, FONT, skyAt, flagPath } from './render.js';

const TAU = Math.PI * 2;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const f = (w, px, fam = 'ui') => `${w} ${px}px ${FONT[fam]}`;

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const g = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${g((n >> 16) & 255)},${g((n >> 8) & 255)},${g(n & 255)})`;
}

function leaf(ctx, x, y, len, ang, fill) {
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * len * 0.5 + s * len * 0.42, y + s * len * 0.5 - c * len * 0.42, x + c * len, y + s * len);
  ctx.quadraticCurveTo(x + c * len * 0.5 - s * len * 0.42, y + s * len * 0.5 + c * len * 0.42, x, y);
  ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}

function flower(ctx, x, y, r, rot, petal) {
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass ? petal : INK;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) { const a = rot + k * TAU / 5, px = x + Math.cos(a) * r * 0.9, py = y + Math.sin(a) * r * 0.9; ctx.moveTo(px + r * 0.62 + (pass ? 0 : 2), py); ctx.arc(px, py, r * 0.62 + (pass ? 0 : 2), 0, TAU); }
    ctx.fill();
  }
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r * 0.42 + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = OCHRE; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
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
      leaf(ctx, X, Y, leafLen * (0.7 + h * 0.5), ang, j % 2 ? shade(st.leaf, 0.78) : st.leaf);
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
          ctx.strokeStyle = pass === 0 ? INK : pass === 1 ? '#6b4429' : '#a8744a';
          ctx.lineTo(X - (pass === 2 ? w * 0.6 : 0), Y);
        }
        bucket = bk; lastX = X; lastY = Y;
      }
      ctx.stroke();
    }
  }
  for (const b of blooms) for (let k = 0; k < 3; k++) flower(ctx, b.X + (k - 1) * 13, b.Y - 6 - (k % 2) * 10, 8 + hash(b.seed + k) * 3, hash(b.seed * 2 + k) * 6, k === 1 ? '#fff4ec' : '#f7b6c8');
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
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(tx, ty - 6, 11, 15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6faa3c'; ctx.beginPath(); ctx.ellipse(tx, ty - 6, 8, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c4e88a'; ctx.beginPath(); ctx.ellipse(tx - 2.5, ty - 10, 3, 5.5, 0, 0, TAU); ctx.fill();
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

export function renderCard(s, sum, meta) {
  const Wc = 1080, Hc = 1350;
  const c = document.createElement('canvas');
  c.width = Wc; c.height = Hc;
  const ctx = c.getContext('2d');
  const reached = stageIndexFor(sum.height);
  // paper
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, Wc, Hc);
  // print window: posterised sky through every stage the tree climbed
  const P = { x: 56, y: 262, w: Wc - 112, h: 930 };
  ctx.save();
  roundRect(ctx, P.x, P.y, P.w, P.h, 22); ctx.clip();
  const topM = Math.max(60, sum.height * 1.12);
  const bands = 18;
  for (let i = 0; i < bands; i++) {
    const m = topM * (1 - (i + 0.5) / bands);
    ctx.fillStyle = css(skyAt(m));
    ctx.fillRect(P.x, P.y + (P.h * i) / bands, P.w, P.h / bands + 1);
  }
  if (reached >= 5) for (let i = 0; i < 110; i++) { ctx.fillStyle = `rgba(255,248,226,${(0.35 + hash(i) * 0.6).toFixed(2)})`; ctx.fillRect(P.x + hash(i + 1) * P.w, P.y + hash(i + 2) * P.h * 0.4, 2.4, 2.4); }
  // sun (or moon) disc
  const sunC = reached >= 5 ? 'rgba(250,240,214,0.95)' : 'rgba(255,244,214,0.95)';
  for (let k = 3; k >= 1; k--) { ctx.fillStyle = `rgba(255,244,214,${0.1})`; ctx.beginPath(); ctx.arc(P.x + P.w * 0.8, P.y + 150, 60 * (1 + k * 0.5), 0, TAU); ctx.fill(); }
  ctx.fillStyle = sunC; ctx.beginPath(); ctx.arc(P.x + P.w * 0.8, P.y + 150, 60, 0, TAU); ctx.fill();
  // ground
  const groundY = P.y + P.h - 70;
  ctx.fillStyle = MOSS;
  ctx.beginPath(); ctx.moveTo(P.x, groundY + 20);
  for (let x = P.x; x <= P.x + P.w; x += 20) ctx.lineTo(x, groundY - 8 - 12 * Math.sin(x * 0.01 + 1));
  ctx.lineTo(P.x + P.w, P.y + P.h); ctx.lineTo(P.x, P.y + P.h); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); for (let x = P.x; x <= P.x + P.w; x += 20) x === P.x ? ctx.moveTo(x, groundY - 8 - 12 * Math.sin(x * 0.01 + 1)) : ctx.lineTo(x, groundY - 8 - 12 * Math.sin(x * 0.01 + 1)); ctx.stroke();
  ctx.fillStyle = '#4a3324'; ctx.fillRect(P.x, groundY + 26, P.w, P.h);
  ctx.fillStyle = INK; ctx.fillRect(P.x, groundY + 24, P.w, 4);
  // stage marks on the left
  const rect = { x: P.x + 150, y: P.y + 70, w: P.w - 230, h: groundY + 26 - (P.y + 70) };
  const { mapY } = drawTreeCompact(ctx, s, rect, { leafLen: 24 });
  ctx.textAlign = 'left';
  let lastLabelY = 1e9;
  for (let i = 1; i <= reached; i++) {
    const y = mapY(-STAGES[i].m * PX_PER_M);
    if (y < rect.y - 10 || lastLabelY - y < 70 || y > groundY - 60) continue;
    lastLabelY = y;
    const goal = STAGES[i].name === 'Treetop';
    ctx.strokeStyle = 'rgba(30,26,22,0.55)'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(P.x + 18, y); ctx.lineTo(P.x + 170, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = f(800, 20);
    const label = `${STAGES[i].name.toUpperCase()}  ${STAGES[i].m} m`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = INK; roundRect(ctx, P.x + 20, y - 36, tw + 20, 28, 8); ctx.fill();
    ctx.fillStyle = goal ? OCHRE : PAPER; ctx.fillText(label, P.x + 30, y - 15);
    if (goal) { flagPath(ctx, P.x + tw + 50, y - 22, 12); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.fillStyle = OCHRE; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); }
  }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 5; roundRect(ctx, P.x, P.y, P.w, P.h, 22); ctx.stroke();

  // header on the paper
  ctx.fillStyle = INK; ctx.textAlign = 'left';
  ctx.font = f(800, 26); ctx.fillText('F O R K W O O D', 62, 86);
  ctx.font = f(800, 168, 'display');
  const ht = `${sum.height}`;
  ctx.fillText(ht, 54, 236);
  const hw = ctx.measureText(ht).width;
  ctx.font = f(800, 70, 'display'); ctx.fillText('m', 70 + hw, 236);
  ctx.textAlign = 'right';
  ctx.font = f(700, 34, 'mono'); ctx.fillText(`${sum.score.toLocaleString('en-US')} pts`, Wc - 60, 92);
  ctx.font = f(600, 26); ctx.fillStyle = 'rgba(30,26,22,0.8)';
  ctx.fillText(`reached ${sum.stage}`, Wc - 60, 134);
  let ry = 170;
  if (meta.daily) { ctx.fillText(`Daily tree · ${meta.dailyLabel}`, Wc - 60, ry); ry += 36; }
  if (meta.challenge) { ctx.fillText(meta.challenge.won ? `beat a friend's ${meta.challenge.m} m` : `friend's tree: ${meta.challenge.m} m`, Wc - 60, ry); ry += 36; }
  if (meta.newBest) {
    ctx.save(); ctx.translate(Wc - 160, Math.max(ry, 200) + 12); ctx.rotate(-0.06);
    ctx.fillStyle = INK; roundRect(ctx, -96, -26, 200, 54, 12); ctx.fill();
    ctx.fillStyle = OCHRE; roundRect(ctx, -100, -30, 200, 54, 12); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; roundRect(ctx, -100, -30, 200, 54, 12); ctx.stroke();
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = f(800, 26); ctx.fillText('NEW BEST', 0, 6);
    ctx.restore();
  }
  // footer: git-flavoured summary
  ctx.textAlign = 'left';
  ctx.font = f(700, 27, 'mono');
  const h1 = `tree ${sum.hash}`;
  ctx.fillStyle = INK; ctx.fillText(h1, 62, 1252);
  ctx.fillStyle = 'rgba(30,26,22,0.78)';
  ctx.fillText(` · ${sum.commits} commits · ${sum.merges} merges${sum.blooms ? ` · ${sum.blooms} blooms` : ''} · ×${sum.maxMult}`, 62 + ctx.measureText(h1).width, 1252, Wc - 140 - ctx.measureText(h1).width);
  ctx.font = f(600, 21); ctx.fillStyle = 'rgba(30,26,22,0.68)';
  ctx.fillText(`${meta.url || 'Forkwood'}${meta.seed != null ? `  ·  course #${meta.seed}` : ''}`, 62, 1296, Wc - 124);
  grain(ctx, Wc, Hc);
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
