// Procedural canvas renderer. Art direction: a pressed-leaf woodblock print.
// Background layers are flat and soft (no outlines); everything you play with
// carries the same warm ink outline, so the gameplay layer always reads first.
// The sky is posterised into stepped bands, and a paper grain sits on top.
import { W, PX_PER_M, STAGES, SKY_STOPS, SAP_MAX, heightM, stageIndexFor } from './sim.js';

const TAU = Math.PI * 2;
export const INK = '#1e1a16';
export const PAPER = '#f4ecd8';
export const OCHRE = '#f2b33d';
export const CORAL = '#e2603f';
export const MOSS = '#6f9a4a';
export const FONT = {
  display: '"Fraunces Display", "Iowan Old Style", Georgia, serif',
  ui: '"Bricolage", "Avenir Next", "Segoe UI", sans-serif',
  mono: '"JB Mono", ui-monospace, "SF Mono", Menlo, monospace',
};
const f = (w, px, fam = 'ui') => `${w} ${Math.round(px)}px ${FONT[fam]}`;

// ---------------------------------------------------------------- colour utils
const hexCache = new Map();
export function rgb(hex) {
  let c = hexCache.get(hex);
  if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; hexCache.set(hex, c); }
  return c;
}
const lerp3 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`);
export function mix(a, b, t) { return css(lerp3(rgb(a), rgb(b), t)); }
export function stageBlend(m) {
  const i = stageIndexFor(m);
  const a = STAGES[i], b = STAGES[Math.min(STAGES.length - 1, i + 1)];
  const t = b === a ? 0 : Math.min(1, Math.max(0, (m - a.m) / (b.m - a.m)));
  return { a, b, t, i };
}
export function skyAt(m) {
  if (m <= SKY_STOPS[0][0]) return rgb(SKY_STOPS[0][1]);
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const [m0, c0] = SKY_STOPS[i], [m1, c1] = SKY_STOPS[i + 1];
    if (m <= m1) return lerp3(rgb(c0), rgb(c1), (m - m0) / (m1 - m0));
  }
  return rgb(SKY_STOPS[SKY_STOPS.length - 1][1]);
}
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// smooth 1D noise in [-1,1] for camera shake (sum of incommensurate sines)
const snoise = (t, k) => (Math.sin(t * 1.7 + k) * 0.5 + Math.sin(t * 3.1 + k * 2.3) * 0.3 + Math.sin(t * 5.3 + k * 4.1) * 0.2);

// ---------------------------------------------------------------- shapes
function leafPath(ctx, x, y, len, ang, wide = 0.42) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
  const [ax, ay] = P(len * 0.5, -len * wide), [bx, by] = P(len, 0), [cx, cy] = P(len * 0.5, len * wide);
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(ax, ay, bx, by);
  ctx.quadraticCurveTo(cx, cy, x, y);
}

function blossom(ctx, x, y, r, rot, petal, px) {
  // five-petal flower with an ink outline (full-bloom marker)
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) { const a = rot + k * TAU / 5; ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); ctx.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, r * 0.62 + 1.6 * px, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = petal;
  ctx.beginPath();
  for (let k = 0; k < 5; k++) { const a = rot + k * TAU / 5; ctx.moveTo(x + Math.cos(a) * r * 0.9 + r * 0.62, y + Math.sin(a) * r * 0.9); ctx.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, r * 0.62, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r * 0.42 + 1.4 * px, 0, TAU); ctx.fill();
  ctx.fillStyle = OCHRE; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
}

export function flagPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s); ctx.lineTo(x, y - s);
  ctx.lineTo(x + s * 1.1, y - s * 0.62); ctx.lineTo(x, y - s * 0.22);
}

// ---------------------------------------------------------------- tree drawing
function findIndexBelow(pts, y) {
  let lo = 0, hi = pts.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].y > y) lo = mid + 1; else hi = mid; }
  return lo;
}

function widthAt(p, pt, now) {
  const age = Math.max(0, now - pt.t);
  return 2.6 + Math.min(24, 2.1 * Math.sqrt(age));
}

/** Draws every path of the tree between world rows topY..botY. px = world units per screen pixel. */
export function drawTree(ctx, s, now, topY, botY, px) {
  const step = Math.max(1, Math.floor(px * 1.6));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order = s.paths.slice().sort((a, b) => (a.id === 0 ? 1 : 0) - (b.id === 0 ? 1 : 0));
  // passes: ink outline, bark, light edge
  for (let pass = 0; pass < 3; pass++) {
    for (const p of order) {
      if (p.state === 'gone' || p.pts.length < 2) continue;
      const pts = p.pts;
      const i0 = Math.max(0, findIndexBelow(pts, botY + 40) - 1);
      const i1 = Math.min(pts.length - 1, findIndexBelow(pts, topY - 40) + 1);
      if (i1 <= i0) continue;
      const rev = p.state === 'reverting';
      let bucket = -1;
      ctx.beginPath();
      for (let i = i0; i < i1; i += step) {
        const a = pts[i], b = pts[Math.min(i1, i + step)];
        let w = widthAt(p, a, now);
        if (pass === 0) w += 3.4 * Math.max(1, px * 0.8);
        else if (pass === 2) w *= 0.28;
        const bk = Math.round(w * 2);
        if (bk !== bucket) {
          if (bucket >= 0) ctx.stroke();
          bucket = bk;
          ctx.beginPath();
          ctx.lineWidth = Math.max(px * 1.1, w);
          ctx.strokeStyle = pass === 0 ? (rev ? '#5a1820' : INK) : pass === 1 ? (rev ? CORAL : '#6b4429') : (rev ? 'rgba(255,214,200,0.5)' : '#a8744a');
          ctx.moveTo(a.x - (pass === 2 ? widthAt(p, a, now) * 0.2 : 0), a.y);
        }
        ctx.lineTo(b.x - (pass === 2 ? widthAt(p, b, now) * 0.2 : 0), b.y);
      }
      if (bucket >= 0) ctx.stroke();
    }
  }
  // fresh green growth near each live tip
  for (const p of s.paths) {
    if (p.state !== 'live' || p.pts.length < 2) continue;
    const pts = p.pts, n = pts.length, k0 = Math.max(0, n - 22);
    for (let i = k0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const t = (i - k0) / (n - k0);
      ctx.strokeStyle = t < 0.33 ? '#7d8f3a' : t < 0.66 ? '#8fb14a' : '#a9cf5a';
      ctx.lineWidth = widthAt(p, a, now) * 0.86;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  // leaves, blossoms and commit dots
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
      if (c.kind === 'bloom') {
        if (!rev) {
          const g2 = Math.min(1, (now - c.born) / 0.5);
          const pb = g2 < 1 ? easeBack(g2) : 1;
          for (let k = 0; k < 3; k++) {
            const h = hash(c.i * 3 + k);
            blossom(ctx, pt.x + (k - 1) * 15 * pb, pt.y - 6 - (k % 2) * 12 * pb, (7 + h * 3) * pb * Math.max(1, px * 0.7), now * 0.3 + h * 6, k === 1 ? '#fff4ec' : '#f7b6c8', px);
          }
        }
        continue;
      }
      if (!rev && px < 3) drawLeaves(ctx, pt.x, pt.y, c.i, now, pop, st.leaf, c.kind, px);
      const r = (c.kind === 'merge' ? 7.5 : c.kind === 'fork' ? 5.5 : 4.2) * pop * Math.max(1, px * 0.7);
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 2.2 * Math.max(1, px * 0.7), 0, TAU);
      ctx.fillStyle = rev ? '#5a1820' : INK; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, TAU);
      ctx.fillStyle = rev ? '#ff9a86' : c.kind === 'merge' ? OCHRE : c.kind === 'fork' ? '#8fd0e6' : PAPER;
      ctx.fill();
    }
  }
  // scars where a single tip got hit
  ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
  for (const sc of s.scars) {
    if (sc.y < topY - 20 || sc.y > botY + 20) continue;
    ctx.beginPath(); ctx.moveTo(sc.x - 5, sc.y - 4); ctx.lineTo(sc.x + 5, sc.y + 4); ctx.moveTo(sc.x + 5, sc.y - 4); ctx.lineTo(sc.x - 5, sc.y + 4); ctx.stroke();
  }
}

function drawLeaves(ctx, x, y, seed, now, pop, color, kind, px) {
  const n = kind === 'merge' ? 4 : 2;
  const dark = mix(color, '#1e1a16', 0.28);
  for (let j = 0; j < n; j++) {
    const side = j % 2 === 0 ? 1 : -1;
    const h = hash(seed * 13 + j);
    const ang = side * (0.7 + h * 0.6) - Math.PI / 2 + Math.sin(now * 1.6 + seed * 0.3 + j) * 0.08;
    const len = (14 + h * 9) * pop * (kind === 'merge' ? 1.2 : 1);
    ctx.beginPath(); leafPath(ctx, x, y, len, ang);
    ctx.lineWidth = 2.6 * Math.max(1, px * 0.8); ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = j >= 2 ? '#f7d9a8' : j % 2 ? dark : color; ctx.fill();
    if (px < 1.6) {
      ctx.strokeStyle = 'rgba(30,26,22,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * 2, y + Math.sin(ang) * 2); ctx.lineTo(x + Math.cos(ang) * len * 0.8, y + Math.sin(ang) * len * 0.8); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- renderer
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.cw = 0; this.ch = 0;
    this.grain = makeGrain(this.ctx);
    this.layout = { coach: null, banner: null };
    this.sapTarget = { x: 0, y: 0 };
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
  }

  /** world scale that fits the playfield */
  baseScale() { return Math.min(this.ch / 780, this.cw / (W + 30)); }

  _world(ctx) {
    const { dpr, cw, ch } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.roll) { ctx.translate(cw / 2, ch / 2); ctx.rotate(this.roll); ctx.translate(-cw / 2, -ch / 2); }
    ctx.translate(this.ox, this.oy); ctx.scale(this.sc, this.sc);
  }
  _screen(ctx) { ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
  toScreen(x, y) { return { x: this.ox + x * this.sc, y: this.oy + y * this.sc }; }

  draw(s, cam, fx, ui) {
    const ctx = this.ctx, cw = this.cw, ch = this.ch;
    const sc = cam.scale;
    // trauma shake: offset and a little roll, both from smooth noise
    const tr = ui.calm ? 0 : Math.min(1, cam.trauma || 0);
    const k = tr * tr, tt = performance.now() / 1000 * 9;
    const shx = 22 * k * snoise(tt, 1), shy = 22 * k * snoise(tt, 7);
    this.roll = 0.035 * k * snoise(tt, 13);
    this.sc = sc;
    this.ox = cw / 2 - cam.x * sc + shx;
    this.oy = ch * cam.anchor - cam.y * sc + shy;
    const pad = 60 / sc;
    const topY = (0 - this.oy) / sc - pad, botY = (ch - this.oy) / sc + pad;
    const leftX = (0 - this.ox) / sc - pad, rightX = (cw - this.ox) / sc + pad;
    const now = s.t;
    const camM = Math.max(0, -cam.y / PX_PER_M);
    const sb = stageBlend(camM);
    const px = 1 / sc;
    const night = Math.min(1, Math.max(0, (camM - 520) / 300));
    const gold = Math.min(1, (s.golden || 0) / 0.6) * (ui.reveal ? 0 : 1);

    // ---- sky: stepped world-space bands (posterised print sky)
    this._world(ctx);
    const BAND = 180;
    const b0 = Math.floor(topY / BAND), b1 = Math.ceil(botY / BAND);
    for (let b = b0; b <= b1; b++) {
      const m = Math.max(0, -(b + 0.5) * BAND / PX_PER_M);
      ctx.fillStyle = css(skyAt(m));
      ctx.fillRect(leftX - 20, b * BAND, rightX - leftX + 40, BAND + 1);
    }
    // ---- screen-space atmosphere: the top leans toward the next stage, in steps
    this._screen(ctx);
    const nxt = STAGES[Math.min(STAGES.length - 1, sb.i + 1)];
    const nc = rgb(nxt.sky === sb.a.sky ? '#0a0c28' : nxt.sky);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = css(nc, 0.13); ctx.fillRect(0, 0, cw, ch * (0.42 - i * 0.1)); }
    if (night > 0) {
      for (let i = 0; i < 80; i++) {
        const x = hash(i) * cw, y = ((hash(i + 99) * ch * 1.5 + (cam.y * sc) * 0.05) % (ch * 1.5) + ch * 1.5) % (ch * 1.5) - ch * 0.25;
        const tw = 0.5 + 0.5 * Math.sin(now * 2 + i);
        ctx.fillStyle = `rgba(255,248,226,${(night * (0.35 + 0.65 * tw) * (0.4 + hash(i + 7) * 0.6)).toFixed(3)})`;
        const r = hash(i + 3) < 0.15 ? 2.2 : 1.3;
        ctx.fillRect(x, y, r, r);
      }
    }
    this.drawSun(ctx, cw, ch, camM, night, now);

    // ---- world
    this._world(ctx);
    this.drawBackdrop(ctx, cam, topY, botY, now, camM, sb);
    if (leftX < -40) this.drawCanopyFrame(ctx, cam, topY, botY, leftX, rightX, now, sb, night);
    this.drawGround(ctx, leftX, rightX, botY);
    for (const w of s.winds) this.drawWind(ctx, w, now, topY, botY);
    if (ui.bestM > 3) this.drawBestLine(ctx, -ui.bestM * PX_PER_M, topY, botY, s.newBest, now, ui.bestLabel);
    for (const fr of s.frosts) if (fr.y + fr.r > topY && fr.y - fr.r < botY) this.drawFrost(ctx, fr, now);
    for (const b of s.brambles) if (b.y > topY - 40 && b.y < botY + 40) this.drawBramble(ctx, b);
    drawTree(ctx, s, now, topY, botY, px);
    if (!ui.reveal) {
      for (const o of s.motes) if (o.y > topY - 30 && o.y < botY + 30) this.drawMote(ctx, o, now, gold);
      for (const b of s.beetles) if (b.y > topY - 30 && b.y < botY + 30) this.drawBeetle(ctx, b, now);
      this.drawTips(ctx, s, now, fx, gold);
      if (ui.coach && ui.coach.cue) this.drawTapCue(ctx, s, now);
    }
    this.drawParticles(ctx, fx, px);
    // playfield edges: a hairline ink rule either side
    if (leftX < -2 - pad) {
      ctx.fillStyle = 'rgba(30,26,22,0.35)';
      ctx.fillRect(-2 * px, topY, 2 * px, botY - topY);
      ctx.fillRect(W, topY, 2 * px, botY - topY);
    }

    // ---- screen space overlays
    this._screen(ctx);
    if (gold > 0) this.drawGolden(ctx, cw, ch, now, gold, s.golden);
    if (s.inFrost && !ui.reveal) {
      for (let i = 0; i < 3; i++) { ctx.strokeStyle = 'rgba(214,238,255,0.35)'; ctx.lineWidth = 26 + i * 26; ctx.strokeRect(0, 0, cw, ch); }
    }
    if (ui.hud && !s.dead && s.sap < SAP_MAX * 0.28) {
      const beat = Math.pow(Math.max(0, Math.sin(now * 7.5)), 6);
      const a = (0.18 + 0.22 * beat) * (1 - s.sap / (SAP_MAX * 0.28) * 0.6);
      for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(122,26,20,${(a * (1 - i * 0.28)).toFixed(3)})`; ctx.lineWidth = 18 + i * 22; ctx.strokeRect(0, 0, cw, ch); }
    }
    if (fx.flash > 0) { ctx.fillStyle = `rgba(${fx.flashColor},${(fx.flash * 0.3).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
    // paper grain over everything but the HUD
    ctx.globalAlpha = 1; ctx.fillStyle = this.grain; ctx.fillRect(0, 0, cw, ch);
    if (ui.hud) this.drawHud(ctx, s, fx, ui, now);
    this.drawSparks(ctx, fx);
  }

  drawSun(ctx, cw, ch, camM, night, now) {
    // flat sun that sinks as you climb; a crescent moon replaces it at night
    const sink = Math.min(1, camM / 560);
    const x = cw * 0.8, y = ch * (0.13 + sink * 0.5), r = Math.min(cw, ch) * 0.075;
    const a = 1 - night;
    if (a > 0.02) {
      const col = lerp3([255, 244, 214], [255, 196, 140], sink);
      for (let i = 3; i >= 1; i--) { ctx.fillStyle = css(col, 0.12 * a); ctx.beginPath(); ctx.arc(x, y, r * (1 + i * 0.55), 0, TAU); ctx.fill(); }
      ctx.fillStyle = css(col, a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    if (night > 0.02) {
      const mx = cw * 0.22, my = ch * 0.16, mr = r * 0.8;
      ctx.fillStyle = `rgba(250,240,214,${night.toFixed(3)})`; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      const sk = skyAt(camM);
      ctx.fillStyle = css(sk, night); ctx.beginPath(); ctx.arc(mx + mr * 0.42, my - mr * 0.18, mr * 0.9, 0, TAU); ctx.fill();
    }
  }

  drawGolden(ctx, cw, ch, now, gold, left) {
    // golden hour: warm wash, slow diagonal sunbeams, a gilt frame
    ctx.fillStyle = `rgba(255,190,70,${(0.1 * gold).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.globalAlpha = 0.1 * gold;
    ctx.fillStyle = '#fff2c2';
    const sp = 140, off = (now * 30) % sp;
    ctx.beginPath();
    for (let x = -ch - sp + off; x < cw + sp; x += sp) { ctx.moveTo(x, 0); ctx.lineTo(x + 46, 0); ctx.lineTo(x + 46 + ch * 0.6, ch); ctx.lineTo(x + ch * 0.6, ch); }
    ctx.fill();
    ctx.restore();
    const blink = left < 1.5 ? (Math.sin(now * 16) > 0 ? 1 : 0.4) : 1;
    ctx.strokeStyle = `rgba(242,179,61,${(0.85 * gold * blink).toFixed(3)})`; ctx.lineWidth = 8; ctx.strokeRect(4, 4, cw - 8, ch - 8);
    ctx.strokeStyle = `rgba(30,26,22,${(0.6 * gold).toFixed(3)})`; ctx.lineWidth = 2; ctx.strokeRect(9, 9, cw - 18, ch - 18);
  }

  drawBackdrop(ctx, cam, topY, botY, now, camM, sb) {
    // distant trunks (parallax 0.35), flat silhouettes
    const p = 0.35, tile = 1400;
    const shift = cam.y * (1 - p);
    const t0 = Math.floor((topY - shift) / tile) - 1, t1 = Math.floor((botY - shift) / tile) + 1;
    const sky = skyAt(camM);
    ctx.fillStyle = css(lerp3(sky, [29, 36, 64], 0.045));
    for (let t = t0; t <= t1; t++) {
      for (let k = 0; k < 5; k++) {
        const x = -380 + hash(k * 31.7 + 3) * (W + 760);
        const w = 16 + hash(k * 7.3) * 26;
        const y0 = t * tile + shift, y1 = y0 + tile;
        const wob = Math.sin(t * 1.3 + k) * 26;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y1); ctx.quadraticCurveTo(x - w / 2 + wob, (y0 + y1) / 2, x - w / 2, y0);
        ctx.lineTo(x + w / 2, y0); ctx.quadraticCurveTo(x + w / 2 + wob, (y0 + y1) / 2, x + w / 2, y1);
        ctx.fill();
      }
    }
    // clouds (parallax 0.55): flat, two-tone, with a soft underside
    const cp = 0.55, ct = 520;
    const cshift = cam.y * (1 - cp);
    const c0 = Math.floor((topY - cshift) / ct) - 1, c1 = Math.floor((botY - cshift) / ct) + 1;
    const cloudA = Math.min(0.92, 0.45 + camM / 500);
    const top = css(lerp3([255, 251, 240], sky, 0.12), cloudA), under = css(lerp3([255, 251, 240], sky, 0.45), cloudA);
    for (let c = c0; c <= c1; c++) {
      if (c > -1) continue;
      for (let k = 0; k < 2; k++) {
        const h = hash(c * 17.3 + k * 5.1);
        const x = -300 + ((h * (W + 600) + now * (6 + h * 10)) % (W + 600));
        const y = c * ct + cshift + hash(c + k * 9) * ct;
        const r = 34 + h * 40;
        ctx.fillStyle = under;
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 2.1, r * 0.55, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = top;
        ctx.beginPath();
        ctx.arc(x, y, r, Math.PI, 0); ctx.arc(x + r * 1.05, y + r * 0.25, r * 0.7, Math.PI, 0); ctx.arc(x - r * 1.0, y + r * 0.3, r * 0.6, Math.PI, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(x - r * 1.6, y + r * 0.28, r * 3.35, r * 0.12);
      }
    }
  }

  drawGround(ctx, leftX, rightX, botY) {
    if (botY < -300) return;
    const hill = (x) => -60 - 40 * Math.sin(x * 0.006) - 22 * Math.sin(x * 0.017 + 1);
    const near = (x) => -18 - 16 * Math.sin(x * 0.011 + 2);
    ctx.fillStyle = '#a7bf7a';
    ctx.beginPath(); ctx.moveTo(leftX - 20, 10);
    for (let x = leftX - 20; x <= rightX + 20; x += 20) ctx.lineTo(x, hill(x));
    ctx.lineTo(rightX + 20, 10); ctx.fill();
    ctx.fillStyle = MOSS;
    ctx.beginPath(); ctx.moveTo(leftX - 20, 10);
    for (let x = leftX - 20; x <= rightX + 20; x += 20) ctx.lineTo(x, near(x));
    ctx.lineTo(rightX + 20, 10); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); for (let x = leftX - 20; x <= rightX + 20; x += 20) x === leftX - 20 ? ctx.moveTo(x, near(x)) : ctx.lineTo(x, near(x)); ctx.stroke();
    ctx.fillStyle = '#4a3324';
    ctx.fillRect(leftX - 20, 0, rightX - leftX + 40, Math.max(0, botY) + 40);
    ctx.fillStyle = INK; ctx.fillRect(leftX - 20, -2, rightX - leftX + 40, 4);
    // grass blades, inked
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = Math.floor(leftX / 13) * 13; x < rightX; x += 13) { const h = 6 + hash(x) * 9; ctx.moveTo(x, -1); ctx.quadraticCurveTo(x + 1, -h * 0.6, x + 3, -h); }
    ctx.stroke();
    // strata lines and pebbles in the soil
    ctx.strokeStyle = 'rgba(30,26,22,0.4)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const y = 30 + i * 46; ctx.beginPath(); for (let x = leftX; x <= rightX; x += 30) x === leftX ? ctx.moveTo(x, y + Math.sin(x * 0.02 + i) * 4) : ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 4); ctx.stroke(); }
    ctx.fillStyle = '#6d4c35';
    for (let i = 0; i < 26; i++) {
      const x = leftX + hash(i * 3.1) * (rightX - leftX), y = 18 + hash(i * 1.7) * 160;
      ctx.beginPath(); ctx.ellipse(x, y, 5 + hash(i) * 6, 3 + hash(i + 2) * 3, 0, 0, TAU); ctx.fill();
    }
  }

  drawWind(ctx, w, now, topY, botY) {
    if (w.y1 > botY || w.y0 < topY) return;
    const dir = Math.sign(w.force);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,250,236,0.7)'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const y = w.y0 - hash(i * 3.3 + w.y0) * (w.y0 - w.y1);
      const sp = 260 + hash(i) * 200;
      const x = ((hash(i * 7.7) * (W + 200) + dir * now * sp) % (W + 200) + W + 200) % (W + 200) - 100;
      const len = 30 + hash(i * 1.9) * 50;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x - dir * len * 0.5, y - 5, x - dir * len, y);
    }
    ctx.stroke();
    // inked chevrons at the band edge, so the gust reads before you enter it
    const y = w.y0 + 22;
    for (let k = -1; k <= 1; k++) {
      const x = W / 2 + k * 30;
      ctx.beginPath(); ctx.moveTo(x - dir * 7, y - 9); ctx.lineTo(x + dir * 7, y); ctx.lineTo(x - dir * 7, y + 9);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = PAPER; ctx.lineWidth = 3.5; ctx.stroke();
    }
  }

  drawCanopyFrame(ctx, cam, topY, botY, leftX, rightX, now, sb, night) {
    // the side bands on wide screens: you are climbing inside a giant tree.
    // Flat pointed leaves in three tones with a darker vein, parallax 0.85.
    const p = 0.85, tile = 210;
    const shift = cam.y * (1 - p);
    const t0 = Math.floor((topY - shift) / tile) - 1, t1 = Math.floor((botY - shift) / tile) + 1;
    const sky = lerp3(rgb(sb.a.sky), rgb(sb.b.sky), sb.t), nightC = [24, 30, 58], leaf = lerp3(rgb(sb.a.leaf), [60, 110, 70], 0.14);
    const deep = css(lerp3(lerp3(leaf, nightC, 0.58 + night * 0.15), sky, 0.12));
    const mid = css(lerp3(lerp3(leaf, nightC, 0.36 + night * 0.25), sky, 0.1));
    const lite = css(lerp3(lerp3(leaf, nightC, 0.14 + night * 0.35), sky, 0.06));
    const vein = css(lerp3(leaf, nightC, 0.75), 0.55);
    for (const side of [-1, 1]) {
      const edge = side < 0 ? -10 : W + 10;
      const far = side < 0 ? leftX : rightX;
      const span = Math.abs(far - edge);
      if (span < 20) continue;
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = layer === 0 ? deep : layer === 1 ? mid : lite;
        for (let t = t0; t <= t1; t++) {
          for (let k = 0; k < 3; k++) {
            const h = hash(t * 13.7 + k * 3.1 + layer * 41 + (side > 0 ? 71 : 0));
            const y = t * tile + shift + k * (tile / 3) + h * 50;
            const depth = layer === 0 ? 0.95 : layer === 1 ? 0.6 : 0.28;
            const x = edge + side * (14 + hash(t * 5.3 + k + side + layer) * Math.min(span, 300) * depth);
            const len = (60 + h * 70) * (layer === 2 ? 0.8 : 1);
            const sway = Math.sin(now * 0.7 + t + k + layer) * 0.05;
            // leaves always point away from the playfield, so they never cover play
            const ang = (side < 0 ? Math.PI : 0) + side * (h - 0.5) * 1.6 + sway;
            ctx.beginPath(); leafPath(ctx, x, y, len, ang, 0.36); ctx.fill();
            if (layer > 0) {
              ctx.strokeStyle = vein; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len * 0.85, y + Math.sin(ang) * len * 0.85); ctx.stroke();
            }
          }
        }
      }
    }
  }

  drawTapCue(ctx, s, now) {
    // inked pulse rings on the tip(s) while the coach waits for a tap
    const k = (now * 1.6) % 1;
    for (const tip of s.tips) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(30,26,22,${(0.8 * (1 - k)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(tip.x, s.cy, 18 + k * 36, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(244,236,216,${(0.95 * (1 - k)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tip.x, s.cy, 15 + k * 36, 0, TAU); ctx.stroke();
    }
  }

  /** A paper card with an ink border and a hard offset shadow. */
  card(ctx, x, y, w, h, r, fill = PAPER, shadow = 4) {
    ctx.fillStyle = INK; roundRect(ctx, x + shadow, y + shadow, w, h, r); ctx.fill();
    ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; roundRect(ctx, x, y, w, h, r); ctx.stroke();
  }

  drawCoach(ctx, c, cw, y, now) {
    const small = cw < 520;
    const w = Math.min(cw - 28, 460), h = small ? 66 : 72, x = (cw - w) / 2;
    const pulse = c.urgent ? 1 + Math.sin(now * 9) * 0.025 : 1;
    ctx.save();
    ctx.translate(cw / 2, y + h / 2); ctx.scale(pulse, pulse); ctx.translate(-cw / 2, -(y + h / 2));
    this.card(ctx, x, y, w, h, 14, c.good ? OCHRE : c.urgent ? '#fbe3a4' : PAPER);
    // step pips (1-3)
    for (let i = 1; i <= 3; i++) {
      const done = i < c.n || c.n > 3, cur = i === c.n;
      ctx.beginPath(); ctx.arc(x + 22, y + h / 2 + (i - 2) * 15, 5, 0, TAU);
      ctx.fillStyle = done ? INK : cur ? CORAL : 'rgba(30,26,22,0.15)'; ctx.fill();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = f(800, small ? 21 : 24, 'display');
    ctx.fillText(c.title, x + 42, y + (small ? 30 : 33));
    ctx.font = f(600, small ? 13 : 15);
    ctx.fillStyle = 'rgba(30,26,22,0.78)';
    ctx.fillText(c.sub, x + 42, y + (small ? 52 : 57), w - 54);
    ctx.restore();
  }

  drawLadder(ctx, s, ui, now) {
    // progress from Twig to Starlight; the Treetop is the goal flag
    const cw = this.cw, ch = this.ch;
    const wide = (cw - W * this.baseScale()) / 2 >= 150;
    const x = wide ? cw - 46 : cw - 13;
    const y0 = wide ? ch - 70 : ch * 0.66, y1 = wide ? 96 : (ui.coach ? 214 : 132);
    const n = STAGES.length - 1;
    const pos = (m) => {
      const i = stageIndexFor(m);
      if (i >= n) return 1;
      return (i + Math.min(1, (m - STAGES[i].m) / (STAGES[i + 1].m - STAGES[i].m))) / n;
    };
    const Y = (fr) => y0 + (y1 - y0) * fr;
    const m = heightM(s), fr = pos(m);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = wide ? 10 : 8;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.strokeStyle = PAPER; ctx.lineWidth = wide ? 5 : 3.5;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.strokeStyle = MOSS; ctx.lineWidth = wide ? 5 : 3.5;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, Y(fr)); ctx.stroke();
    ctx.font = f(700, 11); ctx.textAlign = 'right';
    for (let i = 0; i <= n; i++) {
      const yy = Y(i / n), goal = STAGES[i].name === 'Treetop';
      const reached = s.stageIdx >= i;
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, yy, goal ? 6 : 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = reached ? (goal ? OCHRE : PAPER) : '#b9ae96'; ctx.beginPath(); ctx.arc(x, yy, goal ? 4 : 2.6, 0, TAU); ctx.fill();
      if (goal) {
        flagPath(ctx, x + (wide ? 9 : -2), yy - 9, 6);
        ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = OCHRE; ctx.fill(); ctx.stroke();
      }
      if (wide) {
        const label = STAGES[i].name.toUpperCase();
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(30,26,22,0.9)'; ctx.strokeText(label, x - 13, yy + 4);
        ctx.fillStyle = goal ? OCHRE : reached ? PAPER : 'rgba(244,236,216,0.7)';
        ctx.fillText(label, x - 13, yy + 4);
      }
    }
    if (ui.bestM > 3) {
      const yb = Y(pos(ui.bestM));
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 9, yb); ctx.lineTo(x + 9, yb); ctx.stroke();
      ctx.strokeStyle = OCHRE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 8, yb); ctx.lineTo(x + 8, yb); ctx.stroke();
    }
    // the bud marks where you are
    const yy = Y(fr);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, yy - 1, 6.5, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a9cf5a'; ctx.beginPath(); ctx.ellipse(x, yy - 1, 4, 6.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawBestLine(ctx, y, topY, botY, passed, now, label = 'BEST') {
    if (y < topY - 20 || y > botY + 20) return;
    ctx.save();
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -now * 30;
    ctx.globalAlpha = passed ? 0.4 : 1;
    ctx.strokeStyle = INK; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.strokeStyle = OCHRE; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = f(800, 13);
    const tw = ctx.measureText(label).width + 16;
    this.card(ctx, W - tw - 8, y - 26, tw, 20, 6, OCHRE, 2);
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    ctx.fillText(label, W - 8 - tw / 2, y - 11.5);
    ctx.restore();
  }

  drawFrost(ctx, fr, now) {
    // a flat pale cloud of frost with stepped rings and inked crystals
    for (let i = 3; i >= 1; i--) {
      ctx.fillStyle = `rgba(222,240,255,${(0.2 + (3 - i) * 0.17).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(fr.x, fr.y, fr.r * (0.45 + i * 0.18), 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      const a = fr.ph + i * 1.7, rr = fr.r * (0.2 + 0.5 * hash(i + fr.r));
      const x = fr.x + Math.cos(a) * rr, y = fr.y + Math.sin(a * 1.3) * rr;
      const sz = 4 + hash(i * 2 + fr.r) * 5;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const b = k * Math.PI / 3 + now * 0.5; ctx.moveTo(x - Math.cos(b) * sz, y - Math.sin(b) * sz); ctx.lineTo(x + Math.cos(b) * sz, y + Math.sin(b) * sz); }
      ctx.strokeStyle = '#3b6a8c'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }

  drawBramble(ctx, b) {
    for (const [a, c] of b.solids) {
      if (c - a < 2) continue;
      const wy = (x) => b.y + Math.sin(x * 0.09 + b.seed) * 3;
      // pale backing keeps the vine readable on night skies
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(244,236,216,0.32)'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(a, b.y); ctx.lineTo(c, b.y); ctx.stroke();
      // thorns first (so the vine overlaps their base), inked
      ctx.lineJoin = 'round';
      for (let x = a + 8; x < c - 4; x += 15) {
        const up = (Math.floor(x / 15) % 2) ? -1 : 1, y = wy(x);
        ctx.beginPath(); ctx.moveTo(x - 4.5, y); ctx.lineTo(x + 1, y + up * 13); ctx.lineTo(x + 4.5, y); ctx.closePath();
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#e8dcc0'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(a, wy(a));
      for (let x = a; x <= c; x += 10) ctx.lineTo(x, wy(x));
      ctx.lineTo(c, wy(c));
      ctx.strokeStyle = INK; ctx.lineWidth = 13; ctx.stroke();
      ctx.strokeStyle = '#5b4030'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = '#8a6448'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(a, wy(a) - 2); for (let x = a; x <= c; x += 10) ctx.lineTo(x, wy(x) - 2); ctx.stroke();
      // berries
      for (let x = a + 20; x < c - 10; x += 47) {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, b.y - 7, 4.6, 0, TAU); ctx.fill();
        ctx.fillStyle = CORAL; ctx.beginPath(); ctx.arc(x, b.y - 7, 3, 0, TAU); ctx.fill();
      }
    }
  }

  drawMote(ctx, o, now, gold) {
    const pulse = 1 + Math.sin(now * 5 + o.ph) * 0.07;
    const r = o.r * pulse;
    if (o.kind === 'sun') {
      // a flat sun stamp: halo disc, inked rays, inked disc
      ctx.fillStyle = gold > 0 ? 'rgba(255,214,110,0.45)' : 'rgba(255,236,170,0.32)';
      ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.1, 0, TAU); ctx.fill();
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = now * 0.9 + o.ph + i * TAU / 8; ctx.moveTo(o.x + Math.cos(a) * r * 1.2, o.y + Math.sin(a) * r * 1.2); ctx.lineTo(o.x + Math.cos(a) * r * 1.6, o.y + Math.sin(a) * r * 1.6); }
      ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.strokeStyle = OCHRE; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.8 + 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f6c445'; ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(o.x - r * 0.18, o.y - r * 0.18, r * 0.42, 0, TAU); ctx.fill();
    } else if (o.kind === 'dew') {
      ctx.fillStyle = 'rgba(160,214,240,0.35)'; ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.9, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x, o.y - r * 1.4); ctx.quadraticCurveTo(o.x + r, o.y, o.x, o.y + r * 0.9); ctx.quadraticCurveTo(o.x - r, o.y, o.x, o.y - r * 1.4);
      ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = '#78bfe0'; ctx.fill();
      ctx.fillStyle = '#f4fbff'; ctx.beginPath(); ctx.ellipse(o.x - r * 0.25, o.y, r * 0.15, r * 0.3, 0, 0, TAU); ctx.fill();
    } else {
      // bark chip: one-hit shield
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = now + i * TAU / 6; const x = o.x + Math.cos(a) * r, y = o.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = '#c98a4a'; ctx.fill();
      ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.x - r * 0.5, o.y - r * 0.2); ctx.lineTo(o.x + r * 0.5, o.y - r * 0.2); ctx.moveTo(o.x - r * 0.4, o.y + r * 0.25); ctx.lineTo(o.x + r * 0.3, o.y + r * 0.25); ctx.stroke();
    }
  }

  drawBeetle(ctx, b, now) {
    const dir = b.vx >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(dir, 1);
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const lx = -6 + i * 6, sw = Math.sin(b.ph + i * 2) * 3;
      ctx.moveTo(lx, -6); ctx.lineTo(lx + sw - 2, -15);
      ctx.moveTo(lx, 6); ctx.lineTo(lx - sw - 2, 15);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,236,216,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, TAU); ctx.fill();
    // head
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(12, 0, 6.5, 0, TAU); ctx.fill();
    // shell: two wing cases with spots
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-2, 0, 15, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7b3f8c'; ctx.beginPath(); ctx.ellipse(-2, 0, 12.5, 9.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a465b3'; ctx.beginPath(); ctx.ellipse(-4, -3.5, 8, 4, -0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.fillStyle = OCHRE;
    for (const [sx, sy] of [[-7, -5], [2, -5], [-7, 5], [2, 5]]) { ctx.beginPath(); ctx.arc(sx, sy, 1.9, 0, TAU); ctx.fill(); }
    ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(14.5, -2.6, 1.6, 0, TAU); ctx.arc(14.5, 2.6, 1.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(16, -2); ctx.quadraticCurveTo(22, -6, 23, -10 + Math.sin(now * 8) * 1.5); ctx.moveTo(16, 2); ctx.quadraticCurveTo(22, 6, 23, 10 - Math.sin(now * 8) * 1.5); ctx.stroke();
    ctx.restore();
  }

  drawTips(ctx, s, now, fx, gold) {
    const blink = s.invuln > 0 && Math.floor(now * 14) % 2 === 0;
    if (s.tips.length === 2) {
      // an inked dashed arc shows the pair is one fork
      ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(30,26,22,0.55)';
      ctx.beginPath(); ctx.moveTo(s.tips[0].x, s.cy); ctx.quadraticCurveTo(s.cx, s.cy - 34, s.tips[1].x, s.cy); ctx.stroke();
      ctx.setLineDash([]);
      const staged = s.tips[0].staged + s.tips[1].staged;
      if (staged > 0) {
        const t = `+${staged}`;
        ctx.font = f(800, 18, 'display'); ctx.textAlign = 'center';
        ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(t, s.cx, s.cy - 36);
        ctx.fillStyle = OCHRE; ctx.fillText(t, s.cx, s.cy - 36);
      }
    }
    const sq = fx.squash || 0;
    for (const tip of s.tips) {
      const x = tip.x, y = s.cy;
      ctx.fillStyle = gold > 0 ? 'rgba(255,214,110,0.35)' : 'rgba(232,248,200,0.3)';
      ctx.beginPath(); ctx.arc(x, y, 24 + Math.sin(now * 6) * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = gold > 0 ? 'rgba(255,214,110,0.3)' : 'rgba(232,248,200,0.25)';
      ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill();
      if (blink) continue;
      const wob = Math.sin(now * 12) * 0.05;
      const sx = 1 + sq * 0.45 - wob, sy = 1 - sq * 0.3 + wob;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.heading); ctx.scale(sx, sy);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, -2, 9.5, 13.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = gold > 0 ? '#f2c14a' : '#6faa3c'; ctx.beginPath(); ctx.ellipse(0, -2, 7, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = gold > 0 ? '#fff0b8' : '#c4e88a'; ctx.beginPath(); ctx.ellipse(-2, -5, 3, 5.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      if (s.shield) {
        ctx.setLineDash([6, 5]); ctx.lineDashOffset = -now * 20;
        ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#c98a4a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawParticles(ctx, fx, px) {
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'leaf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2);
        ctx.beginPath(); leafPath(ctx, -p.size, 0, p.size * 2, 0, 0.4);
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = p.color; ctx.fill();
        ctx.restore();
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = a; ctx.strokeStyle = INK; ctx.lineWidth = (4 * a + 1.5) * Math.max(1, px);
        const rr = p.size * easeOut(1 - a) + 6;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = p.color; ctx.lineWidth = (2.4 * a + 0.8) * Math.max(1, px);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
      } else if (p.kind === 'spark') {
        // four-point star
        const r = p.size * (0.5 + 0.5 * a);
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); ctx.lineTo(Math.cos(an + Math.PI / 4) * r * 0.32, Math.sin(an + Math.PI / 4) * r * 0.32); }
        ctx.closePath(); ctx.fillStyle = p.color; ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = a; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const fl of fx.floaters) {
      // pop in with overshoot, then shrink away (no alpha: ink + fill stay crisp)
      const k = 1 - fl.life / fl.max;
      const s = k < 0.18 ? easeBack(k / 0.18) : fl.life < 0.22 ? easeOut(fl.life / 0.22) : 1;
      if (s <= 0.02) continue;
      ctx.save(); ctx.translate(fl.x, fl.y); ctx.scale(s, s); ctx.rotate(fl.rot || 0);
      ctx.font = f(800, fl.size, fl.size >= 22 ? 'display' : 'ui');
      ctx.lineWidth = Math.max(4, fl.size * 0.24); ctx.strokeStyle = INK; ctx.strokeText(fl.text, 0, 0);
      ctx.fillStyle = fl.color; ctx.fillText(fl.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawSparks(ctx, fx) {
    // sunlight flies to the sap meter (screen space)
    const T = this.sapTarget;
    for (const sp of fx.sparks) {
      if (sp.sx == null) { const p = this.toScreen(sp.wx, sp.wy); sp.sx = p.x; sp.sy = p.y; sp.cx = p.x + (Math.random() - 0.5) * 160; sp.cy = p.y - 60 - Math.random() * 80; }
      const k = Math.min(1, sp.t / sp.max), e = easeIn(k);
      const u = 1 - e;
      const x = u * u * sp.sx + 2 * u * e * sp.cx + e * e * T.x, y = u * u * sp.sy + 2 * u * e * sp.cy + e * e * T.y;
      const r = 5.5 * (1 - k * 0.4);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, r + 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f6c445'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }

  drawHud(ctx, s, fx, ui, now) {
    const cw = this.cw;
    const small = cw < 520;
    const m = Math.floor(heightM(s));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    // height, set like a printed numeral
    const hy = small ? 52 : 60;
    ctx.font = f(800, small ? 38 : 46, 'display');
    const ht = `${m}`;
    ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(ht, 16, hy);
    ctx.fillStyle = PAPER; ctx.fillText(ht, 16, hy);
    const hw = ctx.measureText(ht).width;
    ctx.font = f(800, small ? 18 : 21, 'display');
    ctx.lineWidth = 5; ctx.strokeText('m', 22 + hw, hy); ctx.fillText('m', 22 + hw, hy);
    ctx.font = f(800, 12);
    const label = STAGES[s.stageIdx].name.toUpperCase() + (ui.daily ? '  ·  DAILY' : '');
    ctx.lineWidth = 3.5; ctx.strokeText(label, 18, hy + 19);
    ctx.fillStyle = PAPER; ctx.fillText(label, 18, hy + 19);
    // score + stamped multiplier badge
    ctx.font = f(700, small ? 17 : 19, 'mono');
    const sc = Math.floor(fx.shownScore).toLocaleString('en-US');
    const sy = hy + (small ? 42 : 46);
    ctx.lineWidth = 4.5; ctx.strokeStyle = INK; ctx.strokeText(sc, 18, sy);
    ctx.fillStyle = '#fbe3a4'; ctx.fillText(sc, 18, sy);
    if (s.mult > 1) {
      const bx = 18 + ctx.measureText(sc).width + 30;
      const pulse = 1 + fx.multPulse * 0.6;
      ctx.save(); ctx.translate(bx, sy - 6); ctx.rotate(-0.1 + fx.multPulse * 0.15); ctx.scale(pulse, pulse);
      this.card(ctx, -21, -13, 42, 25, 7, s.golden > 0 ? '#ffe08a' : OCHRE, 2.5);
      ctx.fillStyle = INK; ctx.font = f(800, 16, 'display'); ctx.textAlign = 'center';
      ctx.fillText(`×${s.mult}`, 0, 6);
      ctx.restore(); ctx.textAlign = 'left';
    }
    // sap meter: inked pill with ticks; sunlight sparks fly into it
    const bw = Math.min(230, cw * 0.44), bh = 14, bx = (cw - bw) / 2, by = small ? 88 : 22;
    const fr = s.sap / SAP_MAX;
    const low = fr < 0.28;
    const pulse = fx.sapPulse || 0;
    this.sapTarget.x = bx + Math.max(10, bw * fx.shownSap / SAP_MAX); this.sapTarget.y = by + bh / 2;
    ctx.save();
    ctx.translate(cw / 2, by + bh / 2); ctx.scale(1 + pulse * 0.06, 1 + pulse * 0.18); ctx.translate(-cw / 2, -(by + bh / 2));
    this.card(ctx, bx - 3, by - 3, bw + 6, bh + 6, 10, PAPER, 3);
    const wob = low ? (Math.sin(now * 16) > 0 ? 1 : 0.7) : 1;
    ctx.globalAlpha = wob;
    ctx.fillStyle = s.golden > 0 ? OCHRE : low ? CORAL : MOSS;
    roundRect(ctx, bx, by, Math.max(0, bw * fx.shownSap / SAP_MAX), bh, 7); ctx.fill();
    ctx.globalAlpha = 1;
    if (pulse > 0) { ctx.fillStyle = `rgba(255,250,230,${(pulse * 0.6).toFixed(3)})`; roundRect(ctx, bx, by, Math.max(0, bw * fx.shownSap / SAP_MAX), bh, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(30,26,22,0.45)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(bx + bw * i / 4, by + 3); ctx.lineTo(bx + bw * i / 4, by + bh - 3); ctx.stroke(); }
    ctx.restore();
    // a little leaf glyph on the meter
    ctx.beginPath(); leafPath(ctx, bx - 22, by + bh / 2 + 6, 17, -1.0, 0.45);
    ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = low ? CORAL : MOSS; ctx.fill();
    ctx.font = f(800, 10.5); ctx.textAlign = 'center';
    const st = s.golden > 0 ? `GOLDEN HOUR · ${Math.ceil(s.golden)}` : low ? 'SAP LOW · GRAB SUNLIGHT' : 'SAP';
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.strokeText(st, cw / 2, by + bh + 17);
    ctx.fillStyle = s.golden > 0 ? '#ffe08a' : low ? '#ffc2b0' : PAPER; ctx.fillText(st, cw / 2, by + bh + 17);
    ctx.textAlign = 'left';
    this.drawLadder(ctx, s, ui, now);
    // coach card sits in its own slot under the HUD; the stage banner always
    // goes below it, so the two can never overlap
    const coachY = small ? 128 : Math.max(118, this.ch * 0.15);
    const coachH = small ? 66 : 72;
    this.layout = { coach: null, banner: null };
    if (ui.coach) { this.drawCoach(ctx, ui.coach, cw, coachY, now); this.layout.coach = { y0: coachY, y1: coachY + coachH + 4 }; }
    if (fx.banner) {
      const b = fx.banner, k = b.t / b.max;
      const outK = k > 0.82 ? (k - 0.82) / 0.18 : 0;
      const big = (b.small ? 0.72 : 1) * (b.gold ? 1.15 : 1) * (small ? 40 : 58);
      const baseY = ui.coach ? coachY + coachH + 30 + big : Math.max(coachY + big * 0.8, this.ch * 0.3);
      const y = baseY - (1 - easeOut(Math.min(1, k / 0.12))) * 24;
      const pop = k < 0.12 ? easeBack(k / 0.12) : 1 - easeIn(outK);
      const size = Math.round(Math.min(big, (cw - 24) / Math.max(4, b.text.length) * 1.75));
      this.layout.banner = { y0: baseY - size * 0.85, y1: baseY + 38 };
      ctx.save();
      ctx.translate(cw / 2, y - outK * 30); ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop)); ctx.rotate(b.gold ? -0.03 : 0);
      ctx.textAlign = 'center';
      ctx.font = f(800, size, 'display');
      ctx.lineWidth = Math.max(6, size * 0.16); ctx.strokeStyle = INK;
      ctx.strokeText(b.text, 3, 4); ctx.fillStyle = INK; ctx.fillText(b.text, 3, 4);
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.gold ? OCHRE : PAPER; ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = f(700, 14);
        const sw = ctx.measureText(b.sub).width + 24;
        this.card(ctx, -sw / 2, 14, sw, 26, 13, b.gold ? OCHRE : PAPER, 3);
        ctx.fillStyle = INK; ctx.fillText(b.sub, 0, 32);
      }
      ctx.restore();
      ctx.textAlign = 'left';
    }
  }
}

function makeGrain(ctx) {
  // paper grain tile: sparse light and dark specks, drawn once
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = rnd();
    const v = r < 0.5 ? 20 : 250;
    img.data[i] = v; img.data[i + 1] = v - 6; img.data[i + 2] = v - 14;
    img.data[i + 3] = Math.floor(rnd() * rnd() * 34);
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, h / 2, w / 2));
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
