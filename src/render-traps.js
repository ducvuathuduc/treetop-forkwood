// Forkwood pass 6: drawing for the ten traps (src/traps.js). Called from
// render.js (blocks marked P6-TRAPS). World-space coordinates.
import { rowSolids, pulseState, doorState, gustState, twinsXs, TRAPS, PULSE, DOOR, CROW_WARN } from './traps.js';

const W = 560, TAU = Math.PI * 2;
const INK = '#1e1a16', PAPER = '#f4ecd8', OCHRE = '#f2b33d', CORAL = '#e2603f';
const FONT = '"Bricolage", "Avenir Next", "Segoe UI", sans-serif';
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vis = (tr, topY, botY) => {
  const lo = tr.y0 ?? tr.y, hi = tr.y1 ?? tr.y;
  return lo > topY - 80 && hi < botY + 80;
};

function thornRow(R, ctx, y, solids, seed) {
  if (solids.length) R.drawBramble(ctx, { y, solids, gaps: [], kind: 'gate', seed });
}
function spikes(ctx, a, b, y, k, color) {
  // growing spikes for a warning: k in 0..1
  ctx.lineJoin = 'round';
  for (let x = a + 8; x < b - 4; x += 15) {
    const up = (Math.floor(x / 15) % 2) ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(x - 4.5, y); ctx.lineTo(x + 1, y + up * 14 * k); ctx.lineTo(x + 4.5, y); ctx.closePath();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fillStyle = color; ctx.fill();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(a + 4, y); ctx.lineTo(b - 4, y); ctx.stroke();
  ctx.strokeStyle = '#8a6448'; ctx.lineWidth = 3; ctx.stroke();
}
function label(ctx, x, y, text) {
  ctx.font = `800 17px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 22;
  ctx.fillStyle = INK; roundRect(ctx, x - w / 2, y - 15, w, 30, 15); ctx.fill();
  ctx.fillStyle = OCHRE; ctx.fillText(text, x, y + 1);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function crowShape(ctx, x, y, s, flap) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, 0, 16, 9, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(14, -6, 7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(19, -7); ctx.lineTo(29, -4); ctx.lineTo(19, -2); ctx.closePath(); ctx.fillStyle = OCHRE; ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-22, -16 - flap * 10); ctx.lineTo(6, -6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-28, 6); ctx.lineTo(-14, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(16, -7, 1.8, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Under the tree: every trap body plus the golden halo of lure motes. */
export function drawTraps(R, ctx, s, now, topY, botY, calm) {
  if (!s.traps || !s.traps.length) return;
  for (const o of s.motes) if (o.lure && !o.taken && o.y > topY - 30 && o.y < botY + 30) {
    ctx.fillStyle = `rgba(255,214,90,${(0.28 + 0.12 * Math.sin(now * 6 + o.ph)).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(o.x, o.y, 22, 0, TAU); ctx.fill();
  }
  for (const tr of s.traps) {
    if (!vis(tr, topY, botY)) continue;
    switch (tr.kind) {
      case 'twig': {
        const w = tr.x1 - tr.x0, h = tr.y0 - tr.y1, k = Math.min(1, tr.t / 0.6);
        if (tr.snapped) { ctx.globalAlpha = Math.max(0, 1 - (s.t - (tr.snapT || 0)) * 1.5); }
        ctx.fillStyle = 'rgba(138,106,68,0.22)'; ctx.fillRect(tr.x0, tr.y1, w, h);
        ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.strokeRect(tr.x0, tr.y1, w, h); ctx.setLineDash([]);
        // the crack: a zig-zag that widens and reddens while a tip lingers
        ctx.strokeStyle = k > 0 ? `rgb(${Math.round(30 + 196 * k)},${Math.round(26 + 70 * (1 - k))},22)` : INK;
        ctx.lineWidth = 3 + k * 5; ctx.beginPath();
        const cx = (tr.x0 + tr.x1) / 2;
        for (let i = 0; i <= 10; i++) { const yy = tr.y0 - (h * i) / 10, xx = cx + (i % 2 ? 1 : -1) * w * 0.22 * (1 + k * 0.4); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke(); ctx.globalAlpha = 1;
        break;
      }
      case 'sap': {
        const w = tr.x1 - tr.x0, h = tr.y0 - tr.y1;
        ctx.fillStyle = `rgba(120,70,140,${tr.on ? (0.36 + 0.1 * Math.sin(now * 12)).toFixed(3) : '0.26'})`;
        roundRect(ctx, tr.x0, tr.y1, w, h, 22); ctx.fill();
        ctx.strokeStyle = 'rgba(72,36,90,0.85)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(72,36,90,0.7)';
        for (let i = 0; i < 6; i++) { const x = tr.x0 + 14 + hash(i + tr.x0) * (w - 28), y = tr.y1 + ((now * 40 + hash(i * 3) * h) % h); ctx.beginPath(); ctx.ellipse(x, y, 3, 5, 0, 0, TAU); ctx.fill(); }
        break;
      }
      case 'pulse': {
        const seed = tr.y * 0.01;
        for (const g of tr.segs) {
          const st = pulseState(tr, g[2], tr.clock);
          if (st === 'out') thornRow(R, ctx, tr.y, [[g[0], g[1]]], seed + g[0]);
          else if (st === 'warn') {
            const u = ((tr.clock / tr.period + g[2] * 0.5) % 1 + 1) % 1, k = (u - (1 - PULSE.warn)) / PULSE.warn;
            spikes(ctx, g[0], g[1], tr.y, 0.25 + 0.75 * k, Math.sin(now * 20) > 0 || calm ? CORAL : '#ffd0a0');
          } else {
            ctx.strokeStyle = 'rgba(30,26,22,0.45)'; ctx.lineWidth = 3; ctx.setLineDash([3, 10]);
            ctx.beginPath(); ctx.moveTo(g[0] + 6, tr.y); ctx.lineTo(g[1] - 6, tr.y); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        break;
      }
      case 'door': {
        const st = doorState(tr, tr.clock);
        thornRow(R, ctx, tr.y, rowSolids(tr, tr.clock), tr.y * 0.01);
        const [a, b] = tr.door;
        if (st !== 'shut') {
          // door leaves: swing in while warning
          const u = ((tr.clock / tr.period) % 1 + 1) % 1;
          const k = st === 'warn' ? (u - DOOR.open) / DOOR.warn : 0;
          const leaf = (b - a) / 2 * k;
          ctx.fillStyle = st === 'warn' && (Math.sin(now * 18) > 0 || calm) ? CORAL : '#8a6448';
          ctx.strokeStyle = INK; ctx.lineWidth = 3;
          for (const [x, d] of [[a, 1], [b, -1]]) { ctx.beginPath(); ctx.rect(d > 0 ? x : x - leaf - 6, tr.y - 7, leaf + 6, 14); ctx.fill(); ctx.stroke(); }
        }
        // the side squeeze never shuts: two little inked arrows
        const sx = (tr.sq[0] + tr.sq[1]) / 2;
        ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, tr.y + 34); ctx.lineTo(sx, tr.y + 14); ctx.moveTo(sx - 7, tr.y + 21); ctx.lineTo(sx, tr.y + 14); ctx.lineTo(sx + 7, tr.y + 21); ctx.stroke();
        break;
      }
      case 'cap': thornRow(R, ctx, tr.y, [[tr.x0, tr.x1]], tr.y * 0.01); break;
      case 'wall': case 'hedge': {
        const w = tr.x1 - tr.x0, h = tr.y0 - tr.y1;
        ctx.fillStyle = tr.kind === 'wall' ? '#5b4030' : '#4f6b33'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        roundRect(ctx, tr.x0, tr.y1, w, h, Math.min(10, w / 2)); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8dcc0';
        for (let y = tr.y1 + 10; y < tr.y0 - 6; y += 22) for (const side of [-1, 1]) {
          const x = side < 0 ? tr.x0 : tr.x1; if (x <= 1 || x >= W - 1) continue;
          ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + side * 11, y); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        if (tr.kind === 'wall') {
          // dead-end mark inside the pocket
          const px = tr.x0 < W / 2 ? tr.x0 / 2 : (tr.x1 + W) / 2, py = tr.y1 + 46;
          ctx.strokeStyle = CORAL; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(px - 12, py - 12); ctx.lineTo(px + 12, py + 12); ctx.moveTo(px + 12, py - 12); ctx.lineTo(px - 12, py + 12); ctx.stroke();
        }
        break;
      }
      case 'gust': {
        const g = gustState(tr), dir = tr.dir;
        if (g.st === 'calm') break;
        const n = g.st === 'warn' ? 14 : 26, a = g.st === 'warn' ? 0.55 : 0.85;
        ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const y = tr.y0 - hash(i * 3.3 + tr.y0) * (tr.y0 - tr.y1);
          const sp = (g.st === 'warn' ? 300 : 520) + hash(i) * 200;
          const x = ((hash(i * 7.7) * (W + 200) + dir * now * sp) % (W + 200) + W + 200) % (W + 200) - 100;
          // a leaf and its streak
          ctx.strokeStyle = `rgba(255,250,236,${a})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dir * (40 + hash(i * 1.9) * 50), y + 3); ctx.stroke();
          ctx.fillStyle = g.st === 'warn' ? OCHRE : '#86d66b';
          ctx.beginPath(); ctx.ellipse(x, y, 6, 3, dir * 0.5 + now * 8 + i, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'twins': {
        const [a, b] = twinsXs(tr);
        for (const x of [a, b]) R.drawBeetle(ctx, { x, y: tr.y, vx: x < tr.x ? -1 : 1, ph: tr.clock * 10, r: tr.r }, now);
        break;
      }
      case 'tide': {
        if (tr.top == null) break;
        const top = tr.top, close = !tr.done && top - s.cy < 120;
        ctx.fillStyle = close ? 'rgba(122,26,20,0.82)' : 'rgba(60,40,30,0.78)';
        ctx.beginPath(); ctx.moveTo(-200, botY + 200); ctx.lineTo(-200, top + 10);
        for (let x = -200; x <= W + 200; x += 24) ctx.lineTo(x + 12, top - 18 - 6 * Math.sin(now * 6 + x)), ctx.lineTo(x + 24, top + 6);
        ctx.lineTo(W + 200, botY + 200); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
        break;
      }
      case 'crow': {
        const flap = Math.sin(now * (tr.st === 'perch' ? 2 : 16));
        if (tr.st === 'perch') {
          const x = tr.side < 0 ? 34 : W - 34;
          ctx.strokeStyle = '#5b4030'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(tr.side < 0 ? 0 : W, tr.y + 14); ctx.lineTo(x + tr.side * -10, tr.y + 14); ctx.stroke();
          ctx.save(); if (tr.side > 0) { ctx.translate(2 * x, 0); ctx.scale(-1, 1); } crowShape(ctx, x, tr.y, 1.1, flap * 0.2); ctx.restore();
        } else if (tr.st === 'warn') {
          const k = 1 - tr.t / CROW_WARN, cx = tr.x + Math.cos(now * 5) * 60, cy = (tr.yy ?? s.cy) - 120 + k * 60;
          crowShape(ctx, cx, cy, 1.2, flap);
          ctx.strokeStyle = CORAL; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(tr.x, (tr.yy ?? s.cy) - 120, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k)); ctx.stroke();
        } else if (tr.t < 2) {
          const x = (tr.x ?? W / 2) + tr.t * 320 * (tr.side || 1), y = (tr.yy ?? tr.y) - 120 - tr.t * 200;
          crowShape(ctx, x, y, 1.1, flap);
        }
        break;
      }
      case 'label': {
        if (calm && s.cy < tr.y - 400) break;
        label(ctx, W / 2, tr.y - 10, TRAPS[tr.id].name);
        break;
      }
    }
  }
}
