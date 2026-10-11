// P8-MAPS: one postage stamp per map for the game-over postcard (share.js):
// a little layered-silhouette scene (motif), the map's colours, a perforated
// edge, the height as its value, and a circular postmark naming the place,
// country, date and grower level. Loaded lazily by share.js.
import { roundRect, FONT } from './render.js';

const TAU = Math.PI * 2;
const f = (w, px, fam = 'ui') => `${w} ${px}px ${FONT[fam]}`;
const hx = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 1) => { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

/** Text along a circle (postmark ring). */
function arcText(ctx, text, cx, cy, r, start, sweep) {
  const chars = [...text];
  const step = sweep / Math.max(1, chars.length - 1);
  chars.forEach((ch, i) => { const a = start + i * step; ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + Math.PI / 2); ctx.fillText(ch, 0, 0); ctx.restore(); });
}

/** The stamp's little scene, drawn into the inner rect (x, y, w, h). */
export function drawMotif(g, st, x, y, w, h) {
  const I = st.ink, A = st.accent;
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, st.bg[0]); sky.addColorStop(1, st.bg[1]);
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  const cx = x + w / 2, by = y + h;
  const soft = rgba(I, 0.35), mid = rgba(I, 0.6);
  const sun = (u, v, r, c = '#fff6e0') => { g.fillStyle = rgba(c.length === 7 ? c : '#fff6e0', 0.9); g.beginPath(); g.arc(x + w * u, y + h * v, r, 0, TAU); g.fill(); };
  switch (st.motif) {
    case 'karst': {
      sun(0.26, 0.24, w * 0.11, A);
      const tower = (u, ww, hh, col) => { g.fillStyle = col; g.beginPath(); const X = x + w * u; g.moveTo(X - ww, by); g.bezierCurveTo(X - ww * 1.1, by - hh * 0.6, X - ww * 0.7, by - hh, X, by - hh); g.bezierCurveTo(X + ww * 0.8, by - hh, X + ww * 1.05, by - hh * 0.55, X + ww, by); g.fill(); };
      tower(0.2, w * 0.13, h * 0.62, soft); tower(0.82, w * 0.12, h * 0.55, soft); tower(0.5, w * 0.16, h * 0.78, mid); tower(0.08, w * 0.1, h * 0.4, I); tower(0.95, w * 0.1, h * 0.45, I);
      g.fillStyle = rgba('#ffffff', 0.35); g.fillRect(x, by - h * 0.16, w, h * 0.16);
      // sampan with a nón lá rower
      g.fillStyle = I; const bx = x + w * 0.52, byy = by - h * 0.1;
      g.beginPath(); g.moveTo(bx - w * 0.18, byy); g.quadraticCurveTo(bx, byy + h * 0.06, bx + w * 0.18, byy); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(bx - w * 0.05, byy - h * 0.035); g.lineTo(bx + w * 0.05, byy - h * 0.035); g.lineTo(bx, byy - h * 0.085); g.closePath(); g.fill();
      g.fillRect(bx - 2, byy - h * 0.04, 4, h * 0.04);
      g.strokeStyle = I; g.lineWidth = 2.5; g.beginPath(); g.moveTo(bx + w * 0.02, byy - h * 0.03); g.lineTo(bx + w * 0.16, byy + h * 0.05); g.stroke();
      break;
    }
    case 'bamboo': {
      sun(0.5, 0.3, w * 0.2, A);
      // a small torii in the distance
      g.fillStyle = A; const tx = cx, ty = y + h * 0.62, tw = w * 0.26;
      g.fillRect(tx - tw / 2 - 6, ty - h * 0.15, tw + 12, 7); g.fillRect(tx - tw / 2, ty - h * 0.115, tw, 5);
      g.fillRect(tx - tw * 0.36, ty - h * 0.15, 6, h * 0.17); g.fillRect(tx + tw * 0.36 - 6, ty - h * 0.15, 6, h * 0.17);
      for (const [u, ww, col] of [[0.1, 10, soft], [0.3, 8, soft], [0.72, 9, soft], [0.9, 8, soft], [0.04, 15, I], [0.2, 13, I], [0.82, 14, I], [0.97, 12, I]]) {
        g.fillStyle = col; const X = x + w * u; g.fillRect(X - ww / 2, y, ww, h);
        g.fillStyle = st.bg[1]; for (let n = 0; n < 5; n++) g.fillRect(X - ww / 2, y + h * (0.12 + n * 0.2 + u * 0.05), ww, 2);
        g.fillStyle = col;
        for (let n = 0; n < 3; n++) { const yy = y + h * (0.2 + n * 0.28 + u * 0.1), sg = u < 0.5 ? 1 : -1; g.save(); g.translate(X, yy); g.rotate(sg * 0.5); g.beginPath(); g.ellipse(sg * 16, 0, 16, 3.5, 0, 0, TAU); g.fill(); g.restore(); }
      }
      break;
    }
    case 'redwood': {
      const BARK = '#8a3a22', BARK2 = '#b4573a';
      // god rays through the canopy
      g.fillStyle = 'rgba(255,248,224,0.4)';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x + w * (0.5 + i * 0.1), y); g.lineTo(x + w * (0.56 + i * 0.1), y); g.lineTo(x + w * (0.3 + i * 0.16), by); g.lineTo(x + w * (0.18 + i * 0.16), by); g.fill(); }
      // far trunks in the fog
      for (const [u, ww] of [[0.36, 0.05], [0.62, 0.045], [0.78, 0.04]]) { g.fillStyle = soft; const X = x + w * u, W2 = w * ww / 2; g.beginPath(); g.moveTo(X - W2 * 1.3, by); g.lineTo(X - W2 * 0.8, y + h * 0.2); g.lineTo(X + W2 * 0.8, y + h * 0.2); g.lineTo(X + W2 * 1.3, by); g.fill(); }
      // two giant red trunks with bark grooves
      for (const [u, ww] of [[0.14, 0.24], [0.9, 0.2]]) {
        const X = x + w * u, W2 = w * ww / 2;
        g.fillStyle = BARK; g.beginPath(); g.moveTo(X - W2 * 1.5, by); g.lineTo(X - W2, y); g.lineTo(X + W2, y); g.lineTo(X + W2 * 1.5, by); g.fill();
        g.strokeStyle = BARK2; g.lineWidth = 2.5; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(X + k * W2 * 0.35, y); g.lineTo(X + k * W2 * 0.5, by); g.stroke(); }
      }
      // canopy: dark feathery crowns across the top
      g.fillStyle = I;
      for (let i = 0; i < 9; i++) { const X = x + w * (i / 8), R = w * (0.1 + 0.05 * Math.sin(i * 2.3)); g.beginPath(); g.ellipse(X, y + h * 0.04, R * 1.2, R * 0.7, 0, 0, TAU); g.fill(); }
      for (let i = 0; i < 6; i++) { const X = x + w * (0.08 + i * 0.17); g.beginPath(); g.moveTo(X - 18, y + h * 0.1); g.lineTo(X, y + h * (0.2 + 0.04 * (i % 2))); g.lineTo(X + 18, y + h * 0.1); g.fill(); }
      // sword ferns
      g.fillStyle = A;
      for (let i = 0; i < 9; i++) { const X = x + w * (0.02 + i * 0.12); for (const a of [-0.9, -0.4, 0.4, 0.9]) { g.save(); g.translate(X, by); g.rotate(a - Math.PI / 2); g.beginPath(); g.ellipse(18, 0, 18, 3.5, 0, 0, TAU); g.fill(); g.restore(); } }
      // a tiny hiker for scale
      g.fillStyle = I; const hx0 = x + w * 0.52, hy = by - 14; g.beginPath(); g.arc(hx0, hy - 18, 3.5, 0, TAU); g.fill(); g.fillRect(hx0 - 2.5, hy - 14, 5, 13);
      break;
    }
    case 'gingerbread': {
      g.fillStyle = 'rgba(255,240,214,0.9)'; g.beginPath(); g.arc(x + w * 0.24, y + h * 0.2, w * 0.08, 0, TAU); g.fill();
      g.fillStyle = st.bg[0]; g.beginPath(); g.arc(x + w * 0.27, y + h * 0.18, w * 0.07, 0, TAU); g.fill();
      const fir = (u, s2, col) => { g.fillStyle = col; const X = x + w * u; for (let k = 0; k < 3; k++) { const yy = by - h * (0.12 + k * 0.2) * s2; g.beginPath(); g.moveTo(X, yy - h * 0.3 * s2); g.lineTo(X + w * 0.14 * s2, yy); g.lineTo(X - w * 0.14 * s2, yy); g.fill(); } g.fillRect(X - 3, by - h * 0.12 * s2, 6, h * 0.12 * s2); };
      fir(0.12, 1.1, I); fir(0.9, 1.15, I); fir(0.28, 0.7, soft); fir(0.74, 0.75, soft);
      // the gingerbread house
      const hx0 = cx, hy = by - h * 0.1, hw = w * 0.34, hh = h * 0.22;
      g.fillStyle = '#a0632e'; g.fillRect(hx0 - hw / 2, hy - hh, hw, hh);
      g.fillStyle = '#7a4520'; g.beginPath(); g.moveTo(hx0 - hw * 0.62, hy - hh); g.lineTo(hx0, hy - hh - h * 0.2); g.lineTo(hx0 + hw * 0.62, hy - hh); g.fill();
      g.fillStyle = '#fff6ec'; for (let i = 0; i < 7; i++) { const t = i / 6; g.beginPath(); g.arc(hx0 - hw * 0.62 + t * hw * 1.24, hy - hh + 2, 6, 0, Math.PI); g.fill(); }
      g.fillStyle = '#ffd27a'; g.fillRect(hx0 - hw * 0.34, hy - hh * 0.72, hw * 0.2, hh * 0.3); g.fillRect(hx0 + hw * 0.14, hy - hh * 0.72, hw * 0.2, hh * 0.3);
      g.fillStyle = '#4a2a14'; g.beginPath(); g.moveTo(hx0 - hw * 0.1, hy); g.lineTo(hx0 - hw * 0.1, hy - hh * 0.45); g.arc(hx0, hy - hh * 0.45, hw * 0.1, Math.PI, TAU); g.lineTo(hx0 + hw * 0.1, hy); g.fill();
      for (let i = 0; i < 6; i++) { g.fillStyle = [A, '#fff6ec', '#7fd6c4'][i % 3]; g.beginPath(); g.arc(hx0 - hw * 0.38 + i * hw * 0.15, hy - hh - h * 0.06 + (i % 2) * 8, 4.5, 0, TAU); g.fill(); }
      // breadcrumbs leading in
      g.fillStyle = '#f0c27e'; for (let i = 0; i < 6; i++) g.fillRect(x + w * (0.1 + i * 0.06), by - 8 - (i % 2) * 3, 5, 4);
      break;
    }
    case 'morpho': {
      sun(0.22, 0.18, w * 0.09);
      g.fillStyle = soft;
      const leaf = (X, Y, L, a, col) => { g.save(); g.translate(X, Y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(L * 0.4, -L * 0.45, L, -L * 0.2, L, 0); g.bezierCurveTo(L, L * 0.2, L * 0.4, L * 0.45, 0, 0); g.fill(); g.restore(); };
      leaf(x, by - h * 0.1, w * 0.6, -0.7, soft); leaf(x + w, by - h * 0.25, w * 0.55, Math.PI + 0.6, soft);
      leaf(x - 8, by, w * 0.55, -0.35, I); leaf(x + w + 8, by - h * 0.05, w * 0.55, Math.PI + 0.3, I); leaf(x + w * 0.3, by + 6, w * 0.4, -1.2, I);
      // the blue morpho
      const mx = cx, my = y + h * 0.42, s2 = w * 0.0042;
      g.save(); g.translate(mx, my); g.rotate(-0.12); g.scale(s2 * 60, s2 * 60);
      for (const sg of [-1, 1]) {
        g.save(); g.scale(sg, 1);
        const gr = g.createLinearGradient(0, -1, 1.2, 0.6); gr.addColorStop(0, '#9ad8ff'); gr.addColorStop(0.5, A); gr.addColorStop(1, '#0a2a6a');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0.05, -0.1); g.bezierCurveTo(0.4, -1.0, 1.25, -0.95, 1.1, -0.2); g.bezierCurveTo(1.0, 0.1, 0.4, 0.1, 0.05, 0.05); g.fill();
        g.beginPath(); g.moveTo(0.05, 0.05); g.bezierCurveTo(0.6, 0.1, 0.95, 0.5, 0.6, 0.85); g.bezierCurveTo(0.35, 1.0, 0.1, 0.6, 0.05, 0.2); g.fill();
        g.strokeStyle = I; g.lineWidth = 0.07; g.beginPath(); g.moveTo(1.1, -0.2); g.bezierCurveTo(1.25, -0.95, 0.4, -1.0, 0.05, -0.1); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0.9, -0.45, 0.06, 0, TAU); g.arc(0.78, -0.3, 0.04, 0, TAU); g.fill();
        g.restore();
      }
      g.fillStyle = I; g.beginPath(); g.ellipse(0, 0.25, 0.06, 0.5, 0, 0, TAU); g.fill();
      g.strokeStyle = I; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0, -0.2); g.quadraticCurveTo(-0.15, -0.6, -0.25, -0.75); g.moveTo(0, -0.2); g.quadraticCurveTo(0.15, -0.6, 0.25, -0.75); g.stroke();
      g.restore();
      break;
    }
    case 'beanstalk': {
      sun(0.16, 0.12, w * 0.07);
      // castle on a cloud
      const cyc = y + h * 0.34;
      g.fillStyle = rgba('#ffffff', 0.95); for (const [u, r] of [[0.25, 26], [0.4, 34], [0.56, 30], [0.7, 22], [0.33, 22], [0.62, 22]]) { g.beginPath(); g.arc(x + w * u, cyc + 14 - r * 0.3, r, 0, TAU); g.fill(); }
      g.fillStyle = '#c9b8e6'; const kx = x + w * 0.42;
      g.fillRect(kx - 26, cyc - 34, 52, 30); g.fillRect(kx - 36, cyc - 52, 14, 48); g.fillRect(kx + 22, cyc - 52, 14, 48); g.fillRect(kx - 7, cyc - 64, 14, 30);
      for (const X of [kx - 36, kx + 22, kx - 7]) { g.beginPath(); g.moveTo(X - 3, X === kx - 7 ? cyc - 64 : cyc - 52); g.lineTo(X + 7, (X === kx - 7 ? cyc - 64 : cyc - 52) - 16); g.lineTo(X + 17, X === kx - 7 ? cyc - 64 : cyc - 52); g.fill(); }
      // the beanstalk spiralling up
      g.strokeStyle = I; g.lineCap = 'round'; g.lineWidth = 9;
      g.beginPath(); g.moveTo(x + w * 0.42, by + 4); g.bezierCurveTo(x + w * 0.85, by - h * 0.25, x + w * 0.1, by - h * 0.42, x + w * 0.52, cyc + 24); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(x + w * 0.38, by - 2); g.bezierCurveTo(x + w * 0.7, by - h * 0.3, x + w * 0.2, by - h * 0.4, x + w * 0.48, cyc + 30); g.stroke();
      g.fillStyle = I;
      for (const [u, v, r, a] of [[0.68, 0.78, 16, 0.6], [0.28, 0.6, 14, -0.7], [0.62, 0.5, 12, 0.5], [0.36, 0.42, 10, -0.5]]) {
        g.save(); g.translate(x + w * u, y + h * v); g.rotate(a); g.beginPath(); g.moveTo(0, r); g.bezierCurveTo(-r * 1.4, r * 0.1, -r * 0.7, -r * 1.1, 0, -r * 0.45); g.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.4, r * 0.1, 0, r); g.fill(); g.restore();
      }
      g.fillStyle = A; g.beginPath(); g.ellipse(x + w * 0.2, by - 16, 9, 12, 0, 0, TAU); g.fill(); // golden egg
      break;
    }
    default: { // oak: the classic Forkwood climb
      sun(0.52, 0.17, w * 0.09);
      g.fillStyle = soft; g.beginPath(); g.moveTo(x, by); for (let i = 0; i <= 10; i++) g.lineTo(x + w * i / 10, by - h * (0.3 + 0.06 * Math.sin(i * 1.3))); g.lineTo(x + w, by); g.fill();
      g.fillStyle = I; g.fillRect(x + w * 0.27, by - h * 0.42, 9, h * 0.42);
      g.beginPath(); for (const [u, v, r] of [[0.28, 0.5, 30], [0.18, 0.56, 22], [0.38, 0.56, 24], [0.28, 0.4, 22]]) { g.moveTo(x + w * u + r, y + h * v); g.arc(x + w * u, y + h * v, r, 0, TAU); } g.fill();
      g.fillStyle = I; g.beginPath(); g.moveTo(x, by); for (let i = 0; i <= 10; i++) g.lineTo(x + w * i / 10, by - h * (0.12 + 0.03 * Math.sin(i * 2.1))); g.lineTo(x + w, by); g.fill();
      // the mint vine climbing with a glow
      g.strokeStyle = A; g.lineWidth = 5; g.lineCap = 'round'; g.shadowColor = A; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(x + w * 0.62, by - 4); g.bezierCurveTo(x + w * 0.8, by - h * 0.35, x + w * 0.5, by - h * 0.5, x + w * 0.66, y + h * 0.18); g.stroke();
      g.beginPath(); g.moveTo(x + w * 0.68, by - h * 0.42); g.quadraticCurveTo(x + w * 0.82, by - h * 0.5, x + w * 0.86, by - h * 0.62); g.stroke();
      g.shadowBlur = 0; g.fillStyle = '#ffc94d'; g.beginPath(); g.arc(x + w * 0.66, y + h * 0.18, 6, 0, TAU); g.fill();
    }
  }
}

/** A perforated postage stamp for the map, with the climb's height as its value. */
export function drawStamp(ctx, map, cx, cy, W, H, o = {}) {
  const st = map.stamp, paperS = '#fbf8f1';
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = paperS; g.fillRect(0, 0, W, H);
  const pad = 16, ix = pad, iy = pad, iw = W - pad * 2, ih = H - pad * 2 - 46;
  g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip(); drawMotif(g, st, ix, iy, iw, ih); g.restore();
  g.strokeStyle = rgba(st.ink, 0.85); g.lineWidth = 2; g.strokeRect(ix + 1, iy + 1, iw - 2, ih - 2);
  // value: the height reached
  const val = `${o.height != null ? o.height : 0}`;
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.font = f(700, 30, 'display'); const vw = g.measureText(val).width;
  const bx = ix + iw - vw - 40;
  g.fillStyle = rgba('#ffffff', 0.82); roundRect(g, bx, iy + 6, vw + 34, 38, 8); g.fill();
  g.fillStyle = st.ink; g.fillText(val, bx + 7, iy + 36); g.font = f(700, 14); g.fillText('m', bx + 10 + vw, iy + 36);
  // bottom band: country word + map name
  g.fillStyle = st.ink; g.textAlign = 'center';
  g.font = f(800, 20); g.fillText(st.word.split('').join('\u2009'), W / 2, H - pad - 22, iw);
  g.font = f(600, 13); g.fillStyle = rgba(st.ink, 0.7); g.fillText(map.name.toUpperCase(), W / 2, H - pad - 4, iw);
  // perforations: knock half-circles out of every edge
  g.globalCompositeOperation = 'destination-out';
  const r = 7, step = 20;
  for (let x = step / 2; x < W; x += step) { g.beginPath(); g.arc(x, 0, r, 0, TAU); g.arc(x, H, r, 0, TAU); g.fill(); }
  for (let y = step / 2; y < H; y += step) { g.beginPath(); g.arc(0, y, r, 0, TAU); g.arc(W, y, r, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.rot || 0);
  ctx.shadowColor = 'rgba(8,11,28,0.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.drawImage(c, -W / 2, -H / 2);
  ctx.restore();
}

/** Circular postmark + wavy cancel lines: map, country, date, grower level. */
export function drawPostmark(ctx, map, x, y, R, ink, meta) {
  ctx.save();
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.globalAlpha = 0.62;
  ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R - 28, 0, TAU); ctx.stroke();
  ctx.font = f(800, Math.round(R * 0.16)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const txt = map.stamp.postmark;
  const sw = Math.min(TAU * 0.86, (ctx.measureText(txt).width * 1.12) / (R - 14));
  arcText(ctx, txt, x, y, R - 14, -Math.PI / 2 - sw / 2, sw);
  const d = new Date();
  const date = `${d.getDate()} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()]} ${d.getFullYear()}`;
  ctx.font = f(800, Math.round(R * 0.2)); ctx.fillText(date, x, y - 7);
  ctx.font = f(700, Math.round(R * 0.15)); ctx.fillText(`LV ${meta.level || 1} · #${meta.printNo || 1}`, x, y + 14);
  // wavy cancellation lines running right, across the stamp
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const yy = y - 36 + i * 19;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) { const xx = x + R + 6 + k * 7; const v = yy + Math.sin(k * 0.75 + i) * 5; k ? ctx.lineTo(xx, v) : ctx.moveTo(xx, v); }
    ctx.stroke();
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

