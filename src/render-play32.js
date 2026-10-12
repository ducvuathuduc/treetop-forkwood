// Forkwood V3.2 GAMEPLAY presentation (Canvas2D overlay, world space, above the WebGL world):
//  - sunlight telegraph: a faint vertical light shaft down the column of an upcoming sunlight,
//    1.5 s .. 0.25 s before the tip reaches its row (weaker and shorter on the Ancient stake)
//  - fork-choice gates: the RICH lane glows warm with a sun count + thorn mark, the SAFE lane cool
//  - sliding-thorn direction arrows, 1.6x bigger with a glowing outline; the first few pulse
// No filters, no per-frame allocations beyond a couple of gradients.
const TAU = Math.PI * 2;
export const SHAFT = {
  t0: 1.5, t1: 0.25, peak: 1.0, max: 2, a: 0.2, w: 30,             // regular stakes
  ancient: { t0: 1.05, t1: 0.3, peak: 0.8, max: 1, a: 0.11, w: 22 }, // Ancient: weaker, later, one at a time
};
export const ARROW_K = 1.6, ARROW_TEACH = 3;

/** World-space overlay; call with the world transform set. ui.stake: 'ancient' dims the shafts. */
export function drawPlay32World(ctx, s, now, topY, botY, ui = {}) {
  if (ui.reveal) return;
  drawShafts(ctx, s, now, topY, botY, ui);
  drawChoices(ctx, s, now, topY, botY);
}

function drawShafts(ctx, s, now, topY, botY, ui) {
  if (s.dead || !s.motes.length) return;
  const P = ui.stake === 'ancient' ? SHAFT.ancient : SHAFT;
  const sp = Math.max(160, s.speed || 0);
  const pick = [];
  for (const o of s.motes) {
    if (o.taken || o.kind !== 'sun' || o.fin) continue;
    const t = (s.cy - o.y) / sp;
    if (t <= P.t1 || t > P.t0) continue;
    if (pick.some((q) => Math.abs(q.o.x - o.x) < 46)) { // same column: keep the nearest one only
      continue;
    }
    pick.push({ o, t });
    if (pick.length >= 6) break;
  }
  if (!pick.length) return;
  pick.sort((a, b) => a.t - b.t);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const { o, t } of pick.slice(0, P.max)) {
    // envelope: fades in from t0, full at peak, fades out by t1 (so it never sits on the tip)
    const env = t > P.peak ? (P.t0 - t) / (P.t0 - P.peak) : (t - P.t1) / (P.peak - P.t1);
    const a = P.a * Math.max(0, Math.min(1, env)) * (0.85 + 0.15 * Math.sin(now * 3 + o.x));
    if (a < 0.01) continue;
    const yTop = o.y - 26, yBot = s.cy + 30, w = P.w;
    const g = ctx.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, `rgba(255,236,170,${(a * 1.25).toFixed(3)})`);
    g.addColorStop(0.65, `rgba(255,226,150,${(a * 0.55).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); // a slightly flared shaft: narrow at the sun, wider where it meets the tip's row
    ctx.moveTo(o.x - w * 0.42, yTop); ctx.lineTo(o.x + w * 0.42, yTop); ctx.lineTo(o.x + w * 0.8, yBot); ctx.lineTo(o.x - w * 0.8, yBot); ctx.closePath(); ctx.fill();
    // a soft pool of light on the tip's row: "be here"
    const pr = w * 1.1, rg = ctx.createRadialGradient(o.x, s.cy - 6, 0, o.x, s.cy - 6, pr);
    rg.addColorStop(0, `rgba(255,236,170,${(a * 0.9).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(o.x, s.cy - 6, pr, pr * 0.45, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

const FONT = (w, px) => `${w} ${px}px "Nunito", ui-rounded, system-ui, sans-serif`;
function drawChoices(ctx, s, now, topY, botY) {
  for (const b of s.brambles) {
    if (!b.choice || b.y < topY - 260 || b.y > botY + 40) continue;
    const side = b.choice, rx = b.px + side * 78, sx = b.px - side * 78, past = s.cy < b.y - 30;
    const fade = past ? Math.max(0, 1 - (b.y - s.cy - 30) / 260) : 1;
    if (fade <= 0) continue;
    const top = b.y - 250, bot = b.y + 90, p = 0.5 + 0.5 * Math.sin(now * 3.2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // RICH lane: warm glow column
    let g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(255,190,80,0)'); g.addColorStop(0.5, `rgba(255,190,80,${(0.16 * fade).toFixed(3)})`); g.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = g; ctx.fillRect(rx - 52, top, 104, bot - top);
    // SAFE lane: cool green wash
    g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(120,230,170,0)'); g.addColorStop(0.5, `rgba(120,230,170,${(0.1 * fade).toFixed(3)})`); g.addColorStop(1, 'rgba(120,230,170,0)');
    ctx.fillStyle = g; ctx.fillRect(sx - 52, top, 104, bot - top);
    ctx.restore();
    if (past) continue;
    // labels under the gate: what each lane is, readable at a glance
    const ly = b.y + 104; // below the first lane sunlight (y + 50)
    tag(ctx, rx, ly, `☀×${s.motes.filter((o) => o.rich && !o.taken && Math.abs(o.x - rx) < 4 && o.y < b.y + 80 && o.y > b.y - 300).length || 5}`, '#ffd36a', 'rgba(60,30,8,0.72)', true, p);
    tag(ctx, sx, ly, 'SAFE', '#bff5d2', 'rgba(8,40,26,0.66)', false, 0);
  }
}
function tag(ctx, x, y, text, col, bg, thorn, p) {
  ctx.save();
  ctx.font = FONT(900, 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + (thorn ? 30 : 18), h = 24;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, 12) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.globalAlpha = 0.7 + 0.3 * p; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = col; ctx.fillText(text, x - (thorn ? 7 : 0), y + 1);
  if (thorn) { // a small thorn mark: risk
    const tx = x + w / 2 - 13; ctx.fillStyle = '#ff8a6a';
    ctx.beginPath(); ctx.moveTo(tx - 5, y + 6); ctx.lineTo(tx, y - 7); ctx.lineTo(tx + 5, y + 6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- sliding-thorn arrows
const seenSlides = new WeakMap(); let slideCount = 0, slideSim = null;
/** Replaces the v2 slider path rule: dotted rule + arrow heads, ARROW_K bigger, glowing, first few pulse. */
export function drawSlideArrows(ctx, b, now, s, ink, paper, ochre) {
  if (s && s !== slideSim) { slideSim = s; slideCount = 0; }
  if (!seenSlides.has(b)) seenSlides.set(b, ++slideCount);
  const teach = seenSlides.get(b) <= ARROW_TEACH, pl = teach ? 1 + 0.14 * Math.max(0, Math.sin(now * 6.5)) : 1, K = ARROW_K * pl;
  const lo = b.base - b.amp, hi = b.base + b.amp, y = b.y + 24;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // glow outline
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,226,140,${teach ? 0.42 : 0.26})`; ctx.lineWidth = 12 * K;
  for (const [x, d] of [[lo, -1], [hi, 1]]) { ctx.beginPath(); ctx.moveTo(x - d * 2 * K, y - 7 * K); ctx.lineTo(x + d * 6 * K, y); ctx.lineTo(x - d * 2 * K, y + 7 * K); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(30,26,22,0.6)'; ctx.lineWidth = 3 * ARROW_K; ctx.setLineDash([2, 10 * ARROW_K]);
  ctx.beginPath(); ctx.moveTo(lo, y); ctx.lineTo(hi, y); ctx.stroke(); ctx.setLineDash([]);
  for (const [x, d] of [[lo, -1], [hi, 1]]) {
    ctx.beginPath(); ctx.moveTo(x - d * 2 * K, y - 7 * K); ctx.lineTo(x + d * 6 * K, y); ctx.lineTo(x - d * 2 * K, y + 7 * K);
    ctx.strokeStyle = ink; ctx.lineWidth = 6 * K; ctx.stroke(); ctx.strokeStyle = paper; ctx.lineWidth = 2.5 * K; ctx.stroke();
  }
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(b.cx, y, 5 * ARROW_K, 0, TAU); ctx.fill();
  ctx.fillStyle = ochre; ctx.beginPath(); ctx.arc(b.cx, y, 3 * ARROW_K, 0, TAU); ctx.fill();
  ctx.restore();
}
