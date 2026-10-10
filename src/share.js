// End-of-run share card: the player's tree drawn as a tall portrait "postcard"
// with score, height and a commit-style hash. Rendered to an offscreen canvas.
import { W, PX_PER_M, STAGES, SKY_STOPS, stageIndexFor } from './sim.js';
import { roundRect } from './render.js';

const TAU = Math.PI * 2;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/**
 * Draw the whole tree into rect (x, y, w, h) in screen pixels, using a
 * stylised projection: vertical compressed to fit, horizontal exaggerated so
 * the tree keeps a pleasing silhouette instead of a hairline.
 */
export function drawTreeCompact(ctx, s, rect, opts = {}) {
  let y0 = 0, x0 = 1e9, x1 = -1e9;
  for (const p of s.paths) {
    if (p.state === 'gone' || p.state === 'reverting') continue;
    for (const q of p.pts) { if (q.y < y0) y0 = q.y; if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; }
  }
  const treeH = Math.max(600, -y0);
  const sy = rect.h / treeH;
  const sx = Math.min(rect.w / Math.max(220, x1 - x0 + 60), Math.max(sy * 2.2, Math.min(0.62, sy * 3.2)));
  const midX = (x0 + x1) / 2;
  const mapX = (x) => rect.x + rect.w / 2 + (x - midX) * sx;
  const mapY = (y) => rect.y + rect.h + y * sy;
  const wk = Math.max(0.5, Math.min(1, sx * 1.6));
  const now = s.t;
  const minGap = 5; // px between drawn vertices (also smooths wiggles)

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const paths = s.paths.filter((p) => p.state !== 'gone' && p.state !== 'reverting' && p.pts.length > 1);
  paths.sort((a, b) => (a.id === 0 ? 1 : 0) - (b.id === 0 ? 1 : 0));
  // foliage behind the wood
  const leaves = [];
  for (const p of paths) for (const c of p.commits) {
    const pt = p.pts[Math.min(c.i, p.pts.length - 1)];
    leaves.push({ x: mapX(pt.x), y: mapY(pt.y), m: -pt.y / PX_PER_M, kind: c.kind, seed: c.i + p.id * 977 });
  }
  const leafR = opts.leafR || 9;
  for (const pass of [0, 1]) {
    for (const L of leaves) {
      const st = STAGES[stageIndexFor(L.m)];
      const n = L.kind === 'merge' ? 5 : 3;
      for (let j = 0; j < n; j++) {
        const h1 = hash(L.seed * 3.1 + j), h2 = hash(L.seed * 7.7 + j * 2);
        const ox = (h1 - 0.5) * leafR * 3.2, oy = (h2 - 0.5) * leafR * 2.2;
        const r = leafR * (0.65 + h2 * 0.55) * (L.kind === 'merge' ? 1.25 : 1);
        ctx.fillStyle = pass === 0 ? shade(st.leaf, 0.62) : (L.kind === 'merge' && j > 2 ? '#ffe3f0' : shade(st.leaf, 0.92 + h1 * 0.2));
        ctx.beginPath();
        ctx.ellipse(L.x + ox + (pass === 0 ? 2 : 0), L.y + oy + (pass === 0 ? 3 : 0), r, r * 0.72, h1 * 3, 0, TAU);
        ctx.fill();
      }
    }
  }
  // wood
  for (let pass = 0; pass < 3; pass++) {
    for (const p of paths) {
      const isMain = p.id === 0;
      let lastX = null, lastY = null, bucket = -1;
      ctx.beginPath();
      for (let i = 0; i < p.pts.length; i++) {
        const q = p.pts[i];
        const X = mapX(q.x), Y = mapY(q.y);
        if (lastX !== null && i < p.pts.length - 1 && Math.hypot(X - lastX, Y - lastY) < minGap) continue;
        const age = Math.max(0, now - q.t);
        let w = (2.4 + Math.min(24, 2.1 * Math.sqrt(age))) * wk + 2;
        if (pass === 0) w += 3; else if (pass === 2) w *= 0.3;
        const bk = Math.round(w * 2);
        if (lastX === null) { ctx.moveTo(X, Y); }
        else {
          if (bk !== bucket && bucket !== -1) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(lastX, lastY); }
          ctx.lineWidth = w;
          ctx.strokeStyle = pass === 0 ? '#2a1a10' : pass === 1 ? '#6c452b' : 'rgba(184,130,84,0.8)';
          ctx.lineTo(X - (pass === 2 ? w * 0.6 : 0), Y);
        }
        bucket = bk; lastX = X; lastY = Y;
      }
      ctx.stroke();
    }
  }
  // commit dots
  for (const p of paths) for (const c of p.commits) {
    const pt = p.pts[Math.min(c.i, p.pts.length - 1)];
    const X = mapX(pt.x), Y = mapY(pt.y);
    const r = c.kind === 'merge' ? 4.6 : c.kind === 'fork' ? 3.6 : 2.6;
    ctx.fillStyle = '#24160e'; ctx.beginPath(); ctx.arc(X, Y, r + 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = c.kind === 'merge' ? '#ffd76a' : c.kind === 'fork' ? '#9fe8ff' : '#fbf6e9';
    ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
  }
  // glowing bud at the very top
  const top = { x: mapX(s.cx), y: mapY(s.cy) };
  const g = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, 34);
  g.addColorStop(0, 'rgba(255,250,200,0.95)'); g.addColorStop(1, 'rgba(255,250,200,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(top.x, top.y, 34, 0, TAU); ctx.fill();
  return { mapY, sy };
}

export function renderCard(s, sum, meta) {
  const Wc = 1080, Hc = 1350;
  const c = document.createElement('canvas');
  c.width = Wc; c.height = Hc;
  const ctx = c.getContext('2d');
  const reached = stageIndexFor(sum.height);
  // sky through every stage the tree climbed
  const g = ctx.createLinearGradient(0, Hc, 0, 0);
  const topM = Math.max(60, sum.height * 1.15);
  for (const [m, col] of SKY_STOPS) if (m <= topM) g.addColorStop(m / topM, col);
  const nextStop = SKY_STOPS.find(([m]) => m > topM);
  if (nextStop) g.addColorStop(1, nextStop[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, Wc, Hc);
  if (reached >= 5) {
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,240,${(0.3 + hash(i) * 0.6).toFixed(2)})`;
      ctx.fillRect(hash(i + 1) * Wc, hash(i + 2) * Hc * 0.45, 2, 2);
    }
  }
  const sun = ctx.createRadialGradient(Wc * 0.8, 160, 0, Wc * 0.8, 160, 700);
  sun.addColorStop(0, 'rgba(255,248,220,0.55)'); sun.addColorStop(1, 'rgba(255,248,220,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, Wc, Hc);
  // ground
  const groundY = 1180;
  ctx.fillStyle = '#7fb062';
  ctx.beginPath(); ctx.moveTo(0, groundY + 20);
  for (let x = 0; x <= Wc; x += 20) ctx.lineTo(x, groundY - 10 - 14 * Math.sin(x * 0.01 + 1));
  ctx.lineTo(Wc, Hc); ctx.lineTo(0, Hc); ctx.fill();
  ctx.fillStyle = '#5a3d2a'; ctx.fillRect(0, groundY + 24, Wc, Hc - groundY);

  // height ruler with stage names
  const rect = { x: 170, y: 300, w: 780, h: groundY - 300 };
  const { mapY } = drawTreeCompact(ctx, s, rect, { leafR: 13 });
  const band = ctx.createLinearGradient(0, 0, 0, 280);
  band.addColorStop(0, 'rgba(20,18,50,0.42)'); band.addColorStop(1, 'rgba(20,18,50,0)');
  ctx.fillStyle = band; ctx.fillRect(0, 0, Wc, 280);
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.textAlign = 'left';
  let lastLabelY = 1e9;
  for (let i = 1; i <= reached; i++) {
    const y = mapY(-STAGES[i].m * PX_PER_M);
    if (y < rect.y - 10 || lastLabelY - y < 64) continue;
    lastLabelY = y;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(150, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`${STAGES[i].name}`, 40, y - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`${STAGES[i].m} m`, 40, y + 24);
  }

  // header
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillText('F O R K W O O D', 60, 84);
  ctx.font = '900 150px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(20,20,40,0.25)'; ctx.fillText(`${sum.height} m`, 64, 236);
  ctx.fillStyle = '#ffffff'; ctx.fillText(`${sum.height} m`, 58, 230);
  ctx.textAlign = 'right';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillStyle = '#fff6d8';
  ctx.fillText(`${sum.score.toLocaleString('en-US')} pts`, Wc - 60, 84);
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`reached ${sum.stage.toUpperCase()}`, Wc - 60, 126);
  if (meta.daily) ctx.fillText(`Daily tree · ${meta.dailyLabel}`, Wc - 60, 164);
  if (meta.challenge) {
    ctx.fillStyle = meta.challenge.won ? '#c9f59a' : 'rgba(255,255,255,0.85)';
    ctx.fillText(meta.challenge.won ? `beat a friend's ${meta.challenge.m} m` : `friend's tree: ${meta.challenge.m} m`, Wc - 60, meta.daily ? 202 : 164);
  }
  if (meta.newBest) {
    ctx.fillStyle = '#ffd76a'; roundRect(ctx, Wc - 260, 186, 200, 48, 24); ctx.fill();
    ctx.fillStyle = '#4a2a00'; ctx.textAlign = 'center'; ctx.font = '900 24px system-ui, sans-serif';
    ctx.fillText('NEW BEST', Wc - 160, 218);
  }

  // footer: git-flavoured summary
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, 40, Hc - 128, Wc - 80, 92, 22); ctx.fill();
  ctx.font = '700 28px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(`tree ${sum.hash}`, 70, Hc - 72);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`· ${sum.commits} commits · ${sum.merges} merges · best ×${sum.maxMult}`, 70 + ctx.measureText(`tree ${sum.hash} `).width, Hc - 72);
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`${meta.url || 'Forkwood'}${meta.seed != null ? `  ·  course #${meta.seed}` : ''}`, 70, Hc - 46, Wc - 140);
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
