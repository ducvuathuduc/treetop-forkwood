// Procedural canvas renderer. Everything is drawn from code: no image assets.
import { W, PX_PER_M, STAGES, SKY_STOPS, FORK_SPREAD, SAP_MAX, heightM, stageIndexFor } from './sim.js';

const TOP_M = 1100;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- colour utils
const hexCache = new Map();
export function rgb(hex) {
  let c = hexCache.get(hex);
  if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; hexCache.set(hex, c); }
  return c;
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
}
export function stageBlend(m) {
  const i = stageIndexFor(m);
  const a = STAGES[i], b = STAGES[Math.min(STAGES.length - 1, i + 1)];
  const t = b === a ? 0 : Math.min(1, Math.max(0, (m - a.m) / (b.m - a.m)));
  return { a, b, t, i };
}
const hash = (n) => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function skyGradient(ctx, y0 = 0, y1 = -TOP_M * PX_PER_M) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [m, c] of SKY_STOPS) g.addColorStop(Math.min(1, m / TOP_M), c);
  return g;
}

// ---------------------------------------------------------------- tree drawing
function findIndexBelow(pts, y) {
  // pts are ordered with y non-increasing; first index whose y <= y
  let lo = 0, hi = pts.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].y > y) lo = mid + 1; else hi = mid; }
  return lo;
}

function widthAt(p, pt, now, isMain) {
  const age = Math.max(0, now - pt.t);
  return 2.4 + Math.min(24, 2.1 * Math.sqrt(age));
}

/**
 * Draws every path of the tree. range = [topY, bottomY] world culling bounds,
 * px = world units per screen pixel (for decimation when zoomed far out).
 */
export function drawTree(ctx, s, now, topY, botY, px, opts = {}) {
  const step = Math.max(1, Math.floor(px * 1.6));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order = s.paths.slice().sort((a, b) => (a.id === 0 ? 1 : 0) - (b.id === 0 ? 1 : 0));
  // passes: outline, bark, highlight
  for (let pass = 0; pass < 3; pass++) {
    for (const p of order) {
      if (p.state === 'gone' || p.pts.length < 2) continue;
      const isMain = p.id === 0 || p.parent === -1;
      const pts = p.pts;
      let i0 = Math.max(0, findIndexBelow(pts, botY + 40) - 1);
      let i1 = Math.min(pts.length - 1, findIndexBelow(pts, topY - 40) + 1);
      if (i1 <= i0) continue;
      const rev = p.state === 'reverting';
      let bucket = -1;
      ctx.beginPath();
      for (let i = i0; i < i1; i += step) {
        const a = pts[i], b = pts[Math.min(i1, i + step)];
        let w = widthAt(p, a, now, isMain);
        if (pass === 0) w += 3.2 * Math.max(1, px * 0.8);
        else if (pass === 2) w *= 0.32;
        const bk = Math.round(w * 2);
        if (bk !== bucket) {
          if (bucket >= 0) ctx.stroke();
          bucket = bk;
          ctx.beginPath();
          ctx.lineWidth = Math.max(px * 1.1, w);
          ctx.strokeStyle = pass === 0 ? (rev ? 'rgba(90,20,30,0.6)' : '#2d1b12') : pass === 1 ? (rev ? 'rgba(200,80,90,0.55)' : '#6a4329') : (rev ? 'rgba(255,190,190,0.3)' : 'rgba(176,122,78,0.75)');
          ctx.moveTo(a.x - (pass === 2 ? w * 0.6 : 0), a.y);
        }
        const off = pass === 2 ? widthAt(p, a, now, isMain) * 0.18 : 0;
        ctx.lineTo(b.x - off, b.y);
      }
      if (bucket >= 0) ctx.stroke();
    }
  }
  // fresh green growth near each live tip
  for (const p of s.paths) {
    if (p.state !== 'live' || p.pts.length < 2) continue;
    const pts = p.pts;
    const n = pts.length;
    const k0 = Math.max(0, n - 26);
    for (let i = k0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const f = (i - k0) / (n - k0);
      ctx.strokeStyle = `rgba(150,214,98,${(0.15 + f * 0.85).toFixed(3)})`;
      ctx.lineWidth = widthAt(p, a, now, true) * 0.9;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  // leaves + commit dots
  for (const p of s.paths) {
    if (p.state === 'gone' || p.commits.length === 0) continue;
    const rev = p.state === 'reverting';
    for (const c of p.commits) {
      const pt = p.pts[Math.min(c.i, p.pts.length - 1)];
      if (!pt || pt.y < topY - 60 || pt.y > botY + 60) continue;
      const grow = Math.min(1, (now - c.born) / 0.35);
      const pop = grow < 1 ? easeBack(grow) : 1;
      const m = -pt.y / PX_PER_M;
      const st = STAGES[stageIndexFor(m)];
      if (!rev && px < 3) drawLeaves(ctx, pt.x, pt.y, c.i, now, pop, st.leaf, c.kind, px);
      const r = (c.kind === 'merge' ? 7.5 : c.kind === 'fork' ? 5.5 : 4.2) * pop * Math.max(1, px * 0.7);
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 2.2, 0, TAU);
      ctx.fillStyle = rev ? 'rgba(80,10,20,0.7)' : '#24160e'; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, TAU);
      ctx.fillStyle = rev ? '#ff8a8a' : c.kind === 'merge' ? '#ffd76a' : c.kind === 'fork' ? '#9fe8ff' : '#fbf6e9';
      ctx.fill();
    }
  }
  // scars
  for (const sc of s.scars) {
    if (sc.y < topY - 20 || sc.y > botY + 20) continue;
    ctx.strokeStyle = 'rgba(30,10,5,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sc.x - 5, sc.y - 4); ctx.lineTo(sc.x + 5, sc.y + 4); ctx.moveTo(sc.x + 5, sc.y - 4); ctx.lineTo(sc.x - 5, sc.y + 4); ctx.stroke();
  }
}

function drawLeaves(ctx, x, y, seed, now, pop, color, kind, px) {
  const n = kind === 'merge' ? 5 : 2;
  for (let j = 0; j < n; j++) {
    const side = j % 2 === 0 ? 1 : -1;
    const h = hash(seed * 13 + j);
    const ang = side * (0.7 + h * 0.6) - Math.PI / 2 + Math.sin(now * 1.6 + seed * 0.3 + j) * 0.08;
    const len = (13 + h * 9) * pop * (kind === 'merge' ? 1.25 : 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
    ctx.fillStyle = kind === 'merge' && j >= 2 ? '#ffe3f0' : color;
    ctx.fill();
    if (px < 1.5) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(len * 0.85, 0); ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- renderer
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.cw = 0; this.ch = 0;
    this.sky = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    this.dpr = dpr; this.cw = cw; this.ch = ch;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.sky = skyGradient(this.ctx);
  }

  /** world scale that fits the playfield */
  baseScale() { return Math.min(this.ch / 780, this.cw / (W + 30)); }

  draw(s, cam, fx, ui) {
    const ctx = this.ctx, dpr = this.dpr, cw = this.cw, ch = this.ch;
    const sc = cam.scale;
    const shx = cam.shake && !ui.calm ? (Math.random() - 0.5) * cam.shake : 0;
    const shy = cam.shake && !ui.calm ? (Math.random() - 0.5) * cam.shake : 0;
    const ox = cw / 2 - cam.x * sc + shx, oy = ch * cam.anchor - cam.y * sc + shy;
    const topY = (0 - oy) / sc, botY = (ch - oy) / sc;
    const leftX = (0 - ox) / sc, rightX = (cw - ox) / sc;
    const now = s.t;
    const camM = Math.max(0, -cam.y / PX_PER_M);
    const sb = stageBlend(camM);
    const px = 1 / sc;

    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    // sky
    ctx.fillStyle = this.sky;
    ctx.fillRect(leftX - 10, topY - 10, rightX - leftX + 20, botY - topY + 20);

    // screen-space glow + stars
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // depth: the top of the screen leans toward the next stage's sky
    const nxt = STAGES[Math.min(STAGES.length - 1, sb.i + 1)];
    const ng = ctx.createLinearGradient(0, 0, 0, ch * 0.8);
    const nc = rgb(nxt.sky === sb.a.sky ? '#0a0c28' : nxt.sky);
    ng.addColorStop(0, `rgba(${nc[0]},${nc[1]},${nc[2]},0.5)`);
    ng.addColorStop(1, `rgba(${nc[0]},${nc[1]},${nc[2]},0)`);
    ctx.fillStyle = ng; ctx.fillRect(0, 0, cw, ch);
    const night = Math.min(1, Math.max(0, (camM - 520) / 300));
    if (night > 0) {
      for (let i = 0; i < 90; i++) {
        const x = hash(i) * cw, y = ((hash(i + 99) * ch * 1.5 + (cam.y * sc) * 0.05) % (ch * 1.5) + ch * 1.5) % (ch * 1.5) - ch * 0.25;
        const tw = 0.5 + 0.5 * Math.sin(now * 2 + i);
        ctx.fillStyle = `rgba(255,255,240,${(night * (0.35 + 0.65 * tw) * hash(i + 7)).toFixed(3)})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
    const sunA = 0.32 * (1 - night * 0.7);
    const sg = ctx.createRadialGradient(cw * 0.82, ch * 0.08, 0, cw * 0.82, ch * 0.08, Math.max(cw, ch) * 0.7);
    sg.addColorStop(0, `rgba(255,248,220,${sunA.toFixed(3)})`);
    sg.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, cw, ch);

    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);
    this.drawBackdrop(ctx, cam, topY, botY, leftX, rightX, now, camM, sb);
    if (leftX < -40) this.drawCanopyFrame(ctx, cam, topY, botY, leftX, rightX, now, sb);
    this.drawGround(ctx, leftX, rightX, botY);

    // wind bands
    for (const w of s.winds) this.drawWind(ctx, w, now, topY, botY);
    // best line
    if (ui.bestM > 3) this.drawBestLine(ctx, -ui.bestM * PX_PER_M, topY, botY, s.newBest, now, ui.bestLabel);
    for (const f of s.frosts) this.drawFrost(ctx, f, now);
    for (const b of s.brambles) if (b.y > topY - 40 && b.y < botY + 40) this.drawBramble(ctx, b);
    if (ui.hints) for (const h of s.hints) this.drawHint(ctx, h, s, now);

    drawTree(ctx, s, now, topY, botY, px);

    if (!ui.reveal) {
      for (const o of s.motes) if (o.y > topY - 30 && o.y < botY + 30) this.drawMote(ctx, o, now);
      for (const b of s.beetles) if (b.y > topY - 30 && b.y < botY + 30) this.drawBeetle(ctx, b, now);
      this.drawTips(ctx, s, now);
      if (ui.coach && ui.coach.cue) this.drawTapCue(ctx, s, now);
    }
    this.drawParticles(ctx, fx, px);

    // playfield edges
    if (leftX < -2) {
      ctx.fillStyle = 'rgba(25,30,70,0.13)';
      ctx.fillRect(leftX - 10, topY - 10, -leftX + 10, botY - topY + 20);
      ctx.fillRect(W, topY - 10, rightX - W + 10, botY - topY + 20);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(-1.5 * px, topY, 1.5 * px, botY - topY);
      ctx.fillRect(W, topY, 1.5 * px, botY - topY);
    }

    // screen space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.inFrost && !ui.reveal) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      g.addColorStop(0, 'rgba(200,235,255,0)'); g.addColorStop(1, 'rgba(200,235,255,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
    if (fx.flash > 0) { ctx.fillStyle = `rgba(${fx.flashColor},${(fx.flash * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.62);
    vg.addColorStop(0, 'rgba(40,20,50,0)'); vg.addColorStop(1, 'rgba(40,20,50,0.14)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
    if (ui.hud) this.drawHud(ctx, s, fx, ui, now);
  }

  drawBackdrop(ctx, cam, topY, botY, leftX, rightX, now, camM, sb) {
    // distant trunks (parallax 0.35)
    const p = 0.35, tile = 1400;
    const shift = cam.y * (1 - p);
    const t0 = Math.floor((topY - shift) / tile) - 1, t1 = Math.floor((botY - shift) / tile) + 1;
    const col = mix(sb.a.sky, '#1d2440', 0.35);
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = col;
    for (let t = t0; t <= t1; t++) {
      for (let k = 0; k < 6; k++) {
        const hx = hash(k * 31.7 + 3);
        const x = -380 + hx * (W + 760);
        const w = 16 + hash(k * 7.3) * 26;
        const y0 = t * tile + shift, y1 = y0 + tile;
        const wob = Math.sin(t * 1.3 + k) * 26;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y1); ctx.quadraticCurveTo(x - w / 2 + wob, (y0 + y1) / 2, x - w / 2, y0);
        ctx.lineTo(x + w / 2, y0); ctx.quadraticCurveTo(x + w / 2 + wob, (y0 + y1) / 2, x + w / 2, y1);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // clouds (parallax 0.55)
    const cp = 0.55, ct = 520;
    const cshift = cam.y * (1 - cp);
    const c0 = Math.floor((topY - cshift) / ct) - 1, c1 = Math.floor((botY - cshift) / ct) + 1;
    const cloudA = Math.min(0.85, 0.25 + camM / 500);
    for (let c = c0; c <= c1; c++) {
      if (c > -1) continue;
      const n = 2;
      for (let k = 0; k < n; k++) {
        const h = hash(c * 17.3 + k * 5.1);
        const x = -300 + ((h * (W + 600) + now * (6 + h * 10)) % (W + 600));
        const y = c * ct + cshift + hash(c + k * 9) * ct;
        const r = 40 + h * 50;
        ctx.fillStyle = `rgba(255,255,255,${(cloudA * 0.55).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU); ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.75, 0, TAU); ctx.arc(x - r * 0.9, y + r * 0.25, r * 0.65, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawGround(ctx, leftX, rightX, botY) {
    if (botY < -260) return;
    // hills
    ctx.fillStyle = '#9fc37f';
    ctx.beginPath(); ctx.moveTo(leftX - 20, 10);
    for (let x = leftX - 20; x <= rightX + 20; x += 20) ctx.lineTo(x, -60 - 40 * Math.sin(x * 0.006) - 22 * Math.sin(x * 0.017 + 1));
    ctx.lineTo(rightX + 20, 10); ctx.fill();
    ctx.fillStyle = '#7fb062';
    ctx.beginPath(); ctx.moveTo(leftX - 20, 10);
    for (let x = leftX - 20; x <= rightX + 20; x += 20) ctx.lineTo(x, -18 - 16 * Math.sin(x * 0.011 + 2));
    ctx.lineTo(rightX + 20, 10); ctx.fill();
    ctx.fillStyle = '#5a3d2a';
    ctx.fillRect(leftX - 20, 0, rightX - leftX + 40, Math.max(0, botY) + 40);
    ctx.fillStyle = '#6e9c48';
    ctx.fillRect(leftX - 20, -4, rightX - leftX + 40, 10);
    // grass tufts
    ctx.strokeStyle = '#5f9140'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = Math.floor(leftX / 14) * 14; x < rightX; x += 14) {
      const h = 6 + hash(x) * 8;
      ctx.moveTo(x, 0); ctx.lineTo(x + 2, -h);
    }
    ctx.stroke();
    // a few pebbles in the soil
    ctx.fillStyle = '#7a5640';
    for (let i = 0; i < 26; i++) {
      const x = leftX + hash(i * 3.1) * (rightX - leftX), y = 18 + hash(i * 1.7) * 160;
      ctx.beginPath(); ctx.ellipse(x, y, 5 + hash(i) * 6, 3 + hash(i + 2) * 3, 0, 0, TAU); ctx.fill();
    }
  }

  drawWind(ctx, w, now, topY, botY) {
    if (w.y1 > botY || w.y0 < topY) return;
    const dir = Math.sign(w.force);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const y = w.y0 - hash(i * 3.3 + w.y0) * (w.y0 - w.y1);
      const sp = 260 + hash(i) * 200;
      const x = ((hash(i * 7.7) * (W + 200) + dir * now * sp) % (W + 200) + W + 200) % (W + 200) - 100;
      const len = 30 + hash(i * 1.9) * 50;
      ctx.moveTo(x, y); ctx.lineTo(x - dir * len, y);
    }
    ctx.stroke();
    // chevrons at the band edge, so the gust is readable before you enter it
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dir > 0 ? '» » »' : '« « «', W / 2, w.y0 + 26);
  }

  drawCanopyFrame(ctx, cam, topY, botY, leftX, rightX, now, sb) {
    // leafy canopy framing the playfield on wide screens: you are climbing
    // inside a giant tree. Parallax 0.85, tinted to the current stage.
    const p = 0.85, tile = 230;
    const shift = cam.y * (1 - p);
    const t0 = Math.floor((topY - shift) / tile) - 1, t1 = Math.floor((botY - shift) / tile) + 1;
    // opaque colours pre-blended with the sky, so overlapping leaves never show seams
    const L = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    const sky = L(rgb(sb.a.sky), rgb(sb.b.sky), sb.t), night = rgb('#1d2440'), leaf = rgb(sb.a.leaf);
    const deep = css(L(L(leaf, night, 0.5), sky, 0.45)), mid = css(L(L(leaf, night, 0.25), sky, 0.4));
    for (const side of [-1, 1]) {
      const edge = side < 0 ? -18 : W + 18;
      const far = side < 0 ? leftX : rightX;
      const span = Math.abs(far - edge);
      if (span < 20) continue;
      for (let t = t0; t <= t1; t++) {
        for (let k = 0; k < 3; k++) {
          const h = hash(t * 13.7 + k * 3.1 + (side > 0 ? 71 : 0));
          const y = t * tile + shift + k * (tile / 3) + h * 40;
          const x = edge + side * (10 + hash(t * 5.3 + k + side) * Math.min(span, 260) * 0.9);
          const r = 34 + h * 46;
          const sway = Math.sin(now * 0.8 + t + k) * 3;
          ctx.fillStyle = k === 1 ? mid : deep;
          ctx.beginPath(); ctx.ellipse(x + sway, y, r, r * 0.62, h * 2, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x + side * r * 0.7 + sway, y + r * 0.3, r * 0.8, r * 0.5, -h, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x - side * r * 0.5 + sway, y - r * 0.35, r * 0.6, r * 0.42, h, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  drawTapCue(ctx, s, now) {
    // pulsing rings on the tip(s) while the coach waits for a tap
    const k = (now * 1.6) % 1;
    for (const tip of s.tips) {
      ctx.strokeStyle = `rgba(255,243,196,${(0.9 * (1 - k)).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tip.x, s.cy, 16 + k * 34, 0, TAU); ctx.stroke();
    }
  }

  drawCoach(ctx, c, cw, y, now) {
    const small = cw < 520;
    const w = Math.min(cw - 28, 470), h = small ? 66 : 72, x = (cw - w) / 2;
    const pulse = c.urgent ? 1 + Math.sin(now * 9) * 0.03 : 1;
    ctx.save();
    ctx.translate(cw / 2, y + h / 2); ctx.scale(pulse, pulse); ctx.translate(-cw / 2, -(y + h / 2));
    ctx.fillStyle = c.good ? 'rgba(74,42,0,0.78)' : 'rgba(24,26,58,0.74)';
    roundRect(ctx, x, y, w, h, 20); ctx.fill();
    ctx.strokeStyle = c.urgent ? '#ffd76a' : c.good ? '#ffd76a' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = c.urgent ? 3 : 1.5;
    roundRect(ctx, x, y, w, h, 20); ctx.stroke();
    // step pips (1-3)
    for (let i = 1; i <= 3; i++) {
      ctx.fillStyle = i < c.n || c.n > 3 ? '#c9f59a' : i === c.n ? '#fff3c4' : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(x + 22, y + h / 2 + (i - 2) * 15, 4.5, 0, TAU); ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = c.good ? '#ffd76a' : '#ffffff';
    ctx.font = `900 ${small ? 21 : 24}px system-ui, sans-serif`;
    ctx.fillText(c.title, x + 42, y + (small ? 30 : 33));
    ctx.font = `700 ${small ? 13 : 15}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff3c4';
    ctx.fillText(c.sub, x + 42, y + (small ? 52 : 57), w - 54);
    ctx.restore();
  }

  drawLadder(ctx, s, ui, now) {
    // progress from Twig to Starlight; the Treetop is the goal flag
    const cw = this.cw, ch = this.ch;
    const wide = (cw - W * this.baseScale()) / 2 >= 150;
    const x = wide ? cw - 46 : cw - 12;
    const y0 = wide ? ch - 70 : ch * 0.62, y1 = wide ? 92 : 112;
    const n = STAGES.length - 1;
    const pos = (m) => {
      const i = stageIndexFor(m);
      if (i >= n) return 1;
      return (i + Math.min(1, (m - STAGES[i].m) / (STAGES[i + 1].m - STAGES[i].m))) / n;
    };
    const Y = (f) => y0 + (y1 - y0) * f;
    const m = heightM(s), f = pos(m);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,20,40,0.32)'; ctx.lineWidth = wide ? 8 : 6;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#86d66b'); g.addColorStop(0.66, '#f59ac0'); g.addColorStop(1, '#eaf2ff');
    ctx.strokeStyle = g; ctx.lineWidth = wide ? 4 : 3;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, Y(f)); ctx.stroke();
    ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i <= n; i++) {
      const yy = Y(i / n), goal = STAGES[i].name === 'Treetop';
      const reached = s.stageIdx >= i;
      ctx.fillStyle = reached ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.arc(x, yy, goal ? 5 : 3, 0, TAU); ctx.fill();
      if (wide) {
        ctx.fillStyle = goal ? '#ffd76a' : reached ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
        ctx.fillText(goal ? 'TREETOP ⚑' : STAGES[i].name.toUpperCase(), x - 12, yy + 4);
      } else if (goal) {
        ctx.fillStyle = '#ffd76a'; ctx.fillText('⚑', x - 7, yy + 4);
      }
    }
    if (ui.bestM > 3) {
      const yb = Y(pos(ui.bestM));
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 8, yb); ctx.lineTo(x + 8, yb); ctx.stroke();
    }
    const yy = Y(f);
    const gg = ctx.createRadialGradient(x, yy, 0, x, yy, 14);
    gg.addColorStop(0, 'rgba(220,255,190,0.95)'); gg.addColorStop(1, 'rgba(220,255,190,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, yy, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4c9a33'; ctx.beginPath(); ctx.arc(x, yy, 4.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawBestLine(ctx, y, topY, botY, passed, now, label = 'BEST') {
    if (y < topY - 20 || y > botY + 20) return;
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -now * 30;
    ctx.strokeStyle = passed ? 'rgba(255,215,106,0.35)' : 'rgba(255,215,106,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(60,40,0,0.5)';
    ctx.fillText(label, W - 9, y - 7);
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(label, W - 10, y - 8);
    ctx.restore();
  }

  drawFrost(ctx, f, now) {
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, 'rgba(225,245,255,0.85)');
    g.addColorStop(0.6, 'rgba(190,225,255,0.55)');
    g.addColorStop(1, 'rgba(190,225,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = f.ph + i * 1.7, rr = f.r * (0.2 + 0.5 * hash(i + f.r));
      const x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a * 1.3) * rr;
      const sz = 4 + hash(i * 2 + f.r) * 5;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const b = k * Math.PI / 3 + now * 0.5; ctx.moveTo(x - Math.cos(b) * sz, y - Math.sin(b) * sz); ctx.lineTo(x + Math.cos(b) * sz, y + Math.sin(b) * sz); }
      ctx.stroke();
    }
  }

  drawBramble(ctx, b) {
    for (const [a, c] of b.solids) {
      const len = c - a;
      if (len < 2) continue;
      // soft light rim keeps the vine readable on dark night skies
      ctx.strokeStyle = 'rgba(255,250,235,0.28)'; ctx.lineWidth = 17; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a, b.y); ctx.lineTo(c, b.y); ctx.stroke();
      // vine body
      ctx.strokeStyle = '#3a2a1f'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(a, b.y);
      for (let x = a; x <= c; x += 10) ctx.lineTo(x, b.y + Math.sin(x * 0.09 + b.seed) * 3);
      ctx.stroke();
      ctx.strokeStyle = '#5d4a2c'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(a, b.y - 1);
      for (let x = a; x <= c; x += 10) ctx.lineTo(x, b.y - 1 + Math.sin(x * 0.09 + b.seed) * 3);
      ctx.stroke();
      // thorns
      ctx.fillStyle = '#d9cfb8';
      for (let x = a + 8; x < c - 4; x += 15) {
        const up = (Math.floor(x / 15) % 2) ? -1 : 1;
        const y = b.y + Math.sin(x * 0.09 + b.seed) * 3;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 1, y + up * 11); ctx.lineTo(x + 4, y); ctx.fill();
      }
      // red berries for a little colour
      ctx.fillStyle = '#c8344a';
      for (let x = a + 20; x < c - 10; x += 47) { ctx.beginPath(); ctx.arc(x, b.y - 7, 3.2, 0, TAU); ctx.fill(); }
    }
  }

  drawHint(ctx, h, s, now) {
    const dy = h.y - s.cy;
    if (dy < -600 || dy > 500) return;
    const a = Math.max(0, Math.min(1, 1.25 - Math.abs(dy + 250) / 300));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(30,25,50,0.75)';
    const bob = Math.sin(now * 3) * 3;
    ctx.strokeText(h.text, W / 2, h.y + bob);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(h.text, W / 2, h.y + bob);
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeText(h.sub, W / 2, h.y + 24 + bob);
    ctx.fillStyle = '#fff6d8';
    ctx.fillText(h.sub, W / 2, h.y + 24 + bob);
    ctx.restore();
  }

  drawMote(ctx, o, now) {
    const pulse = 1 + Math.sin(now * 5 + o.ph) * 0.08;
    if (o.kind === 'sun') {
      const r = o.r * pulse;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.4);
      g.addColorStop(0, 'rgba(255,240,150,0.9)'); g.addColorStop(0.35, 'rgba(255,214,90,0.45)'); g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,140,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = now * 1.2 + o.ph + i * TAU / 6; ctx.moveTo(o.x + Math.cos(a) * r * 1.1, o.y + Math.sin(a) * r * 1.1); ctx.lineTo(o.x + Math.cos(a) * r * 1.6, o.y + Math.sin(a) * r * 1.6); }
      ctx.stroke();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.72, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(190,110,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(o.x - r * 0.2, o.y - r * 0.2, r * 0.25, 0, TAU); ctx.fill();
    } else if (o.kind === 'dew') {
      const r = o.r * pulse;
      ctx.fillStyle = 'rgba(140,210,255,0.3)'; ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7cc8ff';
      ctx.beginPath(); ctx.moveTo(o.x, o.y - r * 1.4); ctx.quadraticCurveTo(o.x + r, o.y, o.x, o.y + r * 0.9); ctx.quadraticCurveTo(o.x - r, o.y, o.x, o.y - r * 1.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(o.x - r * 0.25, o.y, r * 0.15, r * 0.3, 0, 0, TAU); ctx.fill();
    } else {
      const r = o.r * pulse;
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = now + i * TAU / 6; const x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,179,71,0.35)'; ctx.fill();
      ctx.fillStyle = '#7a4a1a'; ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.38, 0, TAU); ctx.fill();
    }
  }

  drawBeetle(ctx, b, now) {
    const dir = b.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(dir, 1);
    // legs
    ctx.strokeStyle = '#1b1320'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const lx = -6 + i * 6, sw = Math.sin(b.ph + i * 2) * 3;
      ctx.moveTo(lx, -6); ctx.lineTo(lx + sw - 2, -15);
      ctx.moveTo(lx, 6); ctx.lineTo(lx - sw - 2, 15);
    }
    ctx.stroke();
    // body (with a pale halo so it reads at night)
    ctx.fillStyle = 'rgba(255,250,235,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1d3a';
    ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(-12, -10, 10, 10);
    g.addColorStop(0, '#7d4bd1'); g.addColorStop(0.5, '#2f8f86'); g.addColorStop(1, '#3b2370');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-2, 0, 12.5, 9.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-5, -4, 4, 2, -0.3, 0, TAU); ctx.fill();
    // head + eyes + antennae
    ctx.fillStyle = '#1b1320';
    ctx.beginPath(); ctx.arc(12, 0, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffdf6b';
    ctx.beginPath(); ctx.arc(14, -2.5, 1.5, 0, TAU); ctx.arc(14, 2.5, 1.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1b1320'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(16, -2); ctx.quadraticCurveTo(22, -6, 23, -10 + Math.sin(now * 8) * 1.5); ctx.moveTo(16, 2); ctx.quadraticCurveTo(22, 6, 23, 10 - Math.sin(now * 8) * 1.5); ctx.stroke();
    ctx.restore();
  }

  drawTips(ctx, s, now) {
    const blink = s.invuln > 0 && Math.floor(now * 14) % 2 === 0;
    if (s.tips.length === 2) {
      // a faint arc between the two tips shows they are one branch pair
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(s.tips[0].x, s.cy); ctx.quadraticCurveTo(s.cx, s.cy - 34, s.tips[1].x, s.cy); ctx.stroke();
      ctx.setLineDash([]);
      const staged = s.tips[0].staged + s.tips[1].staged;
      if (staged > 0) {
        ctx.font = '800 16px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(20,20,40,0.45)'; ctx.fillText(`+${staged}`, s.cx + 1, s.cy - 33);
        ctx.fillStyle = '#ffe9a8'; ctx.fillText(`+${staged}`, s.cx, s.cy - 34);
      }
    }
    for (const tip of s.tips) {
      const x = tip.x, y = s.cy;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
      g.addColorStop(0, 'rgba(220,255,190,0.85)'); g.addColorStop(1, 'rgba(220,255,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.fill();
      if (blink) continue;
      const sq = 1 + Math.sin(now * 12) * 0.06;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.heading);
      ctx.fillStyle = '#4c9a33';
      ctx.beginPath(); ctx.ellipse(0, -2, 7 / sq, 11 * sq, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b8f28a';
      ctx.beginPath(); ctx.ellipse(-1.5, -4, 3.5 / sq, 6.5 * sq, 0, 0, TAU); ctx.fill();
      ctx.restore();
      if (s.shield) {
        ctx.strokeStyle = `rgba(255,179,71,${(0.6 + 0.3 * Math.sin(now * 6)).toFixed(3)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 19, 0, TAU); ctx.stroke();
      }
    }
  }

  drawParticles(ctx, fx, px) {
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'leaf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = 3 * a + px;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - a) + 6, 0, TAU); ctx.stroke();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of fx.floaters) {
      const a = Math.min(1, f.life / 0.35);
      const k = 1 - f.life / f.max;
      const sc = k < 0.15 ? easeBack(k / 0.15) : 1;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(sc, sc);
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(30,20,40,0.55)'; ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, s, fx, ui, now) {
    const cw = this.cw;
    const small = cw < 520;
    const m = Math.floor(heightM(s));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // height
    ctx.font = `900 ${small ? 34 : 42}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20,20,40,0.35)'; ctx.fillText(`${m} m`, 18, (small ? 50 : 58) + 2);
    ctx.fillStyle = '#ffffff'; ctx.fillText(`${m} m`, 16, small ? 50 : 58);
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(STAGES[s.stageIdx].name.toUpperCase() + (ui.daily ? '  ·  DAILY' : ''), 18, small ? 70 : 80);
    // score + multiplier
    ctx.font = `800 ${small ? 17 : 20}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff6d8';
    const sc = Math.floor(fx.shownScore).toLocaleString('en-US');
    ctx.fillText(sc, 18, small ? 94 : 108);
    const multX = 18 + ctx.measureText(sc).width + 10;
    if (s.mult > 1) {
      const pulse = 1 + fx.multPulse * 0.5;
      ctx.save(); ctx.translate(multX + 18, (small ? 88 : 101)); ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffd76a'; roundRect(ctx, -18, -12, 36, 22, 11); ctx.fill();
      ctx.fillStyle = '#4a2a00'; ctx.font = '900 14px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`×${s.mult}`, 0, 4);
      ctx.restore(); ctx.textAlign = 'left';
    }
    // sap bar
    const bw = Math.min(220, cw * 0.42), bh = 12, bx = (cw - bw) / 2, by = small ? 86 : 22;
    const f = s.sap / SAP_MAX;
    const low = f < 0.28;
    ctx.fillStyle = 'rgba(20,20,40,0.35)'; roundRect(ctx, bx - 3, by - 3, bw + 6, bh + 6, 9); ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, low ? '#ff6a5a' : '#64c94b'); g.addColorStop(1, low ? '#ffb15a' : '#c6f06a');
    ctx.fillStyle = g;
    const wob = low ? (Math.sin(now * 18) * 0.5 + 0.5) * 0.25 + 0.75 : 1;
    ctx.globalAlpha = wob;
    roundRect(ctx, bx, by, Math.max(0, bw * fx.shownSap / SAP_MAX), bh, 6); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '800 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.textAlign = 'center';
    ctx.fillText(low ? 'SAP LOW · GRAB SUNLIGHT' : 'SAP', cw / 2, by + bh + 13);
    ctx.textAlign = 'left';
    this.drawLadder(ctx, s, ui, now);
    // coach card sits in its own slot under the HUD; the stage banner always
    // goes below it, so the two can never overlap (they used to collide at 40 m)
    const coachY = small ? 124 : Math.max(118, this.ch * 0.15);
    const coachH = small ? 66 : 72;
    this.layout = { coach: null, banner: null };
    if (ui.coach) { this.drawCoach(ctx, ui.coach, cw, coachY, now); this.layout.coach = { y0: coachY, y1: coachY + coachH }; }
    if (fx.banner) {
      const b = fx.banner, k = b.t / b.max;
      const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
      const big = (b.small ? 0.72 : 1) * (b.gold ? 1.15 : 1) * (small ? 40 : 56);
      const baseY = ui.coach ? coachY + coachH + 24 + big : Math.max(coachY + big * 0.8, this.ch * 0.3);
      const y = baseY - (1 - easeOut(Math.min(1, k / 0.15))) * 20;
      const pop = k < 0.15 ? easeBack(k / 0.15) : 1;
      this.layout.banner = { y0: baseY - big * 0.8, y1: baseY + 34 };
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(cw / 2, y); ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(Math.min(big, (cw - 24) / Math.max(4, b.text.length) * 1.6))}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(20,20,40,0.35)'; ctx.fillText(b.text, 2, 3);
      ctx.fillStyle = b.gold ? '#ffd76a' : '#ffffff'; ctx.fillText(b.text, 0, 0);
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,25,50,0.55)'; ctx.strokeText(b.sub, 0, 28);
      ctx.fillStyle = '#fff3c4'; ctx.fillText(b.sub, 0, 28);
      ctx.restore();
      ctx.textAlign = 'left';
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bounding box of every visible branch, for the end-of-run zoom out and share card. */
export function treeBounds(s) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of s.paths) {
    if (p.state === 'gone') continue;
    for (const q of p.pts) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
  }
  return { x0: x0 - 30, x1: x1 + 30, y0: y0 - 50, y1: Math.max(y1, 0) + 10 };
}
