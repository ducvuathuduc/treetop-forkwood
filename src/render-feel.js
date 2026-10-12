// Forkwood v3 GAME FEEL presentation (Canvas2D overlay, above the WebGL world).
// Draws only what the feel layer (src/feel.js) puts in the sim: signature-current ribbons,
// gold-seed lanes, the boss finisher target, the last-gasp target, the flow ribbon and
// sparkle chains (world space); the combo meter, flow brighten, danger edges, the gasp
// vignette and the quick-retry line (screen space). No filters, no extra GL draw calls.
import { W } from './sim.js';
import { SIGS } from './feel.js';

const TAU = Math.PI * 2;
const FONT = (w, px) => `${w} ${px}px "Nunito", ui-rounded, system-ui, sans-serif`;
const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a.toFixed(3)})`; };

function curve(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2; ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my); }
  const l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
}

/** World space (ctx already in world transform). */
export function drawFeelWorld(ctx, s, now, topY, botY, fx, calm) {
  const F = s.feelS;
  if (!F) return;
  // signature currents
  for (const sg of F.sigs) {
    if (sg.done && sg.y1 > botY) continue;
    if (sg.y1 > botY + 40 || sg.y0 + 200 < topY) continue;
    const D = SIGS[sg.world] || SIGS.meadow, col = D.col;
    const pts = sg.nodes;
    const ahead = pts.filter((o) => !o.taken);
    const live = sg.started && !sg.done;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // soft current body
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, live ? 0.16 : 0.1); ctx.lineWidth = 40; curve(ctx, pts); ctx.stroke();
    ctx.strokeStyle = rgba(col, live ? 0.28 : 0.18); ctx.lineWidth = 14; curve(ctx, pts); ctx.stroke();
    // flowing core (dashes move up the current: it reads as a stream you can ride)
    ctx.setLineDash([10, 16]); ctx.lineDashOffset = -now * 70;
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 2.5; curve(ctx, pts); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    // per-world signature marks
    for (let i = 0; i < pts.length; i++) {
      const o = pts[i]; if (o.y < topY - 30 || o.y > botY + 30) continue;
      const a = o.taken ? 0.25 : 0.85, ph = now * 2 + i;
      ctx.strokeStyle = rgba(col, a); ctx.fillStyle = rgba(col, a * 0.35); ctx.lineWidth = 2;
      switch (sg.world) {
        case 'starry': ctx.beginPath(); for (let k = 0; k < 18; k++) { const t = k / 17, r = 6 + t * 16, an = ph + t * TAU * 1.3; const x = o.x + Math.cos(an) * r, y = o.y + Math.sin(an) * r * 0.8; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); break;
        case 'ukiyo': ctx.beginPath(); ctx.arc(o.x - 6, o.y + 6, 18, Math.PI * 1.05, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(o.x + 10, o.y + 2, 6, Math.PI, TAU); ctx.stroke(); break;
        case 'lilies': ctx.beginPath(); ctx.ellipse(o.x, o.y + 4, 22, 13, 0.2, 0.3, TAU - 0.1); ctx.lineTo(o.x, o.y + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'fresco': ctx.fillRect(o.x - 24, o.y + 12, 48, 5); ctx.strokeRect(o.x - 24, o.y + 12, 48, 5); ctx.beginPath(); ctx.moveTo(o.x - 20, o.y + 17); ctx.lineTo(o.x - 20, o.y + 40); ctx.moveTo(o.x + 20, o.y + 17); ctx.lineTo(o.x + 20, o.y + 40); ctx.stroke(); break;
        case 'gilded': ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.moveTo(o.x - 8, o.y - 70); ctx.lineTo(o.x + 8, o.y - 70); ctx.lineTo(o.x + 16, o.y + 10); ctx.lineTo(o.x - 16, o.y + 10); ctx.closePath(); ctx.fillStyle = rgba(col, a * 0.2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(Math.PI / 4); ctx.strokeRect(-6, -6, 12, 12); ctx.restore(); break;
        case 'lacquer': { const by = o.y + 2 + Math.sin(ph) * 3; ctx.beginPath(); ctx.ellipse(o.x, by, 9, 12, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(o.x, by - 12); ctx.lineTo(o.x, by - 20); ctx.stroke(); if (!o.taken) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ffb27a', 0.25); ctx.beginPath(); ctx.arc(o.x, by, 22, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; } break; }
        default: ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(o.x - 26, o.y + k * 8 + Math.sin(ph + k) * 3); ctx.quadraticCurveTo(o.x, o.y + k * 8 - 6, o.x + 26, o.y + k * 8 + Math.sin(ph + k + 1) * 3); } ctx.stroke();
      }
    }
    // entry gate label
    if (!sg.started && sg.y0 > topY && sg.y0 < botY) {
      ctx.font = FONT(800, 15); ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,11,28,0.5)'; ctx.fillText(D.name, pts[0].x, sg.y0 + 1.5);
      ctx.fillStyle = col; ctx.fillText(D.name, pts[0].x, sg.y0);
    }
    if (live && ahead.length) { // a soft arrow on the next node: where to draw next
      const o = ahead[0]; const p = 0.5 + 0.5 * Math.sin(now * 8);
      ctx.strokeStyle = rgba('#ffffff', 0.5 + 0.4 * p); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(o.x, o.y, 18 + p * 5, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // gold seeds (the points lane of a split gate) and the finisher / gasp targets
  for (const o of s.motes) {
    if (o.taken || o.y < topY - 40 || o.y > botY + 40) continue;
    if (o.gold) {
      const p = 0.5 + 0.5 * Math.sin(now * 5 + o.x);
      ctx.strokeStyle = `rgba(255,214,90,${(0.6 + 0.4 * p).toFixed(3)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(o.x, o.y, 17 + p * 3, 0, TAU); ctx.stroke();
      ctx.font = FONT(800, 11); ctx.textAlign = 'center'; ctx.fillStyle = '#ffe08a'; ctx.fillText('×3', o.x, o.y - 22);
    }
    if (o.fin) {
      const p = 0.5 + 0.5 * Math.sin(now * 7);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) { ctx.strokeStyle = `rgba(255,${200 - k * 40},120,${(0.7 - k * 0.2).toFixed(3)})`; ctx.lineWidth = 4 - k; ctx.beginPath(); ctx.arc(o.x, o.y, 30 + k * 12 + p * 6, 0, TAU); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + now; ctx.beginPath(); ctx.moveTo(o.x + Math.cos(an) * 40, o.y + Math.sin(an) * 40); ctx.lineTo(o.x + Math.cos(an) * 56, o.y + Math.sin(an) * 56); ctx.stroke(); }
      ctx.font = FONT(900, 15); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(8,11,28,0.55)'; ctx.fillText('FINISHER', o.x, o.y - 62 + 1.5); ctx.fillStyle = '#ffe08a'; ctx.fillText('FINISHER', o.x, o.y - 62);
    }
    if (o.gasp && F.gasp > 0) {
      const p = 0.5 + 0.5 * Math.sin(now * 14);
      ctx.strokeStyle = `rgba(255,240,170,${(0.6 + 0.4 * p).toFixed(3)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(o.x, o.y, 22 + p * 6, 0, TAU); ctx.stroke();
      ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(s.cx, s.cy - 14); ctx.lineTo(o.x, o.y + 20); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // flow ribbon: the last stretch of the live branch glows
  if (F.flow || F.tier >= 3) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const k = F.flow ? 1 : 0.5;
    for (const tip of s.tips) {
      const p = s.paths[tip.path]; if (!p) continue;
      const pts = p.pts.slice(-26);
      if (pts.length < 3) continue;
      const g = ctx.createLinearGradient(0, pts[pts.length - 1].y, 0, pts[0].y);
      g.addColorStop(0, `rgba(190,255,214,${(0.55 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(190,255,214,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 16; curve(ctx, pts); ctx.stroke();
      ctx.lineWidth = 5; curve(ctx, pts); ctx.stroke();
    }
    ctx.restore();
  }
  // sparkle chain: collected sunlight in one combo is joined by a fading thread
  const ch = fx.chainPts;
  if (ch && ch.length > 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 1; i < ch.length; i++) {
      const a = ch[i - 1], b = ch[i]; const age = Math.max(a.age, b.age); if (age > 0.9) continue;
      ctx.strokeStyle = `rgba(255,232,150,${((1 - age / 0.9) * 0.7).toFixed(3)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }
}

/** Screen space, under the HUD. */
export function drawFeelScreen(ctx, cw, ch, s, fx, ui, now) {
  const F = s.feelS;
  if (!F || ui.reveal) return;
  // flow: the painted world brightens a touch (screen blend, only while in flow)
  const fl = fx.flowK || 0;
  if (fl > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(cw / 2, ch * 0.62, 0, cw / 2, ch * 0.62, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, `rgba(255,236,190,${(0.13 * fl).toFixed(3)})`); g.addColorStop(1, `rgba(190,255,214,${(0.05 * fl).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); ctx.restore();
  }
  // danger: a coral edge on the side a warned hazard is coming from
  const dg = fx.danger;
  if (dg && dg.a > 0.02 && !ui.calm) {
    const a = dg.a * 0.5, wv = Math.min(cw, ch) * 0.22;
    const side = dg.side; // -1 left, 1 right, 0 ahead
    let g;
    if (side < 0) { g = ctx.createLinearGradient(0, 0, wv, 0); g.addColorStop(0, `rgba(240,120,90,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(240,120,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, wv, ch); }
    else if (side > 0) { g = ctx.createLinearGradient(cw, 0, cw - wv, 0); g.addColorStop(0, `rgba(240,120,90,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(240,120,90,0)'); ctx.fillStyle = g; ctx.fillRect(cw - wv, 0, wv, ch); }
    else { g = ctx.createLinearGradient(0, 0, 0, wv); g.addColorStop(0, `rgba(240,120,90,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(240,120,90,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, wv); }
  }
  // last gasp: the world closes in; one sunlight brings it back
  if (F.gasp > 0) {
    const p = Math.pow(Math.max(0, Math.sin(now * 9)), 4);
    const g = ctx.createRadialGradient(cw / 2, ch * 0.6, Math.min(cw, ch) * 0.2, cw / 2, ch * 0.6, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, 'rgba(20,8,10,0)'); g.addColorStop(1, `rgba(20,8,10,${(0.55 + 0.15 * p).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    ctx.font = FONT(900, cw < 520 ? 22 : 28); ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,11,28,0.6)'; ctx.fillText('LAST GASP · CATCH SUNLIGHT', cw / 2, ch * 0.3 + 2);
    ctx.fillStyle = `rgba(255,236,170,${(0.8 + 0.2 * p).toFixed(3)})`; ctx.fillText('LAST GASP · CATCH SUNLIGHT', cw / 2, ch * 0.3);
  }
  // quick retry after a death: one tap, no card in the way
  if (s.dead && ui.quickRetry && !s.won) {
    const a = Math.min(1, (s.deathT - 0.3) / 0.25);
    if (a > 0) {
      const d = F.death;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
      const y = ch * 0.78;
      ctx.fillStyle = 'rgba(8,11,28,0.55)'; const bw = Math.min(cw - 24, 440); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cw / 2 - bw / 2, y - 46, bw, 76, 16) : ctx.rect(cw / 2 - bw / 2, y - 46, bw, 76); ctx.fill();
      if (d) { ctx.font = FONT(800, 17); ctx.fillStyle = '#ffb39e'; ctx.fillText(d.cause.toUpperCase(), cw / 2, y - 20); ctx.font = FONT(600, 13); ctx.fillStyle = 'rgba(255,246,230,0.85)'; ctx.fillText(d.tip, cw / 2, y); }
      const p = 0.5 + 0.5 * Math.sin(now * 5);
      ctx.font = FONT(900, 16); ctx.fillStyle = `rgba(184,255,214,${(0.75 + 0.25 * p).toFixed(3)})`; ctx.fillText(ui.touch ? 'TAP TO GROW AGAIN' : 'CLICK · SPACE · R  TO GROW AGAIN', cw / 2, y + 22);
      ctx.restore();
    }
  }
}

/** HUD: the combo meter (only while a combo is alive). */
export function drawFeelHud(ctx, cw, ch, s, fx, now) {
  const F = s.feelS;
  if (!F || s.dead) return;
  const small = cw < 520;
  const k = fx.comboShow || 0;
  if (k < 0.02) return;
  const x = small ? cw - 64 : cw / 2, y = small ? 96 : 66;
  const TIERS = [10, 24, 42, 64, 90];
  const lo = F.tier ? TIERS[F.tier - 1] : 0, hi = TIERS[Math.min(4, F.tier)];
  const prog = F.tier >= 5 ? 1 : Math.max(0, Math.min(1, (F.combo - lo) / (hi - lo)));
  const pulse = 1 + (fx.tierPulse || 0) * 0.35;
  ctx.save(); ctx.globalAlpha = k; ctx.translate(x, y); ctx.scale(pulse, pulse);
  const col = F.flow ? '#b8ffd6' : F.tier >= 4 ? '#ffd76a' : F.tier >= 2 ? '#ffe9a8' : '#fff6e6';
  // ring: progress to the next tier
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(8,11,28,0.45)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
  // window: how long the chain holds
  const win = Math.max(0, Math.min(1, F.comboT / 2.4));
  ctx.strokeStyle = 'rgba(255,246,230,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 29, -Math.PI / 2, -Math.PI / 2 + TAU * win); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = FONT(900, 17); ctx.fillStyle = 'rgba(8,11,28,0.5)'; ctx.fillText(String(Math.floor(F.combo)), 0, 7); ctx.fillStyle = col; ctx.fillText(String(Math.floor(F.combo)), 0, 5.5);
  ctx.font = FONT(800, 11); ctx.fillStyle = col;
  ctx.fillText(F.tier ? `COMBO ×${(1 + 0.15 * F.tier).toFixed(2)}` : 'COMBO', 0, 46);
  if (F.flow) { ctx.font = FONT(900, 11); ctx.fillStyle = '#b8ffd6'; ctx.fillText('FLOW', 0, -34); }
  ctx.restore();
}

/** Presentation state that eases toward the sim (called once per frame from main). */
export function updateFeelFx(fx, s, dt) {
  const F = s && s.feelS;
  fx.flowK = (fx.flowK || 0) + (((F && F.flow) ? 1 : 0) - (fx.flowK || 0)) * Math.min(1, dt * 2.5);
  fx.comboShow = (fx.comboShow || 0) + (((F && F.combo >= 3 && !s.dead) ? 1 : 0) - (fx.comboShow || 0)) * Math.min(1, dt * 6);
  fx.tierPulse = Math.max(0, (fx.tierPulse || 0) - dt * 3);
  if (fx.danger) fx.danger.a = Math.max(0, fx.danger.a - dt * 1.4);
  if (fx.chainPts) { for (const p of fx.chainPts) p.age += dt; while (fx.chainPts.length && fx.chainPts[0].age > 1) fx.chainPts.shift(); }
}
export { W };
