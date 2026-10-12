// V2-INT regression: trap contacts on the WebGL path (meadow + fresco, desktop + phone).
//  - no hit/flash/ring shape on the 2D overlay larger than a sane on-screen size (the owner's 250 px coral disc)
//  - no GL sprite in the world layer wider than 60% of the screen apart from the vine ribbons/ground
//  - no draw falls back to a generic placeholder slot for an fx.* / hazard id (missing texture)
//  - the frame loop survives a contact (draw errors are contained)
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8171;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const CASES = (process.env.CASES || 'meadow:1280:720,fresco:390:844').split(',').map((c) => { const [w, a, b] = c.split(':'); return [w, +a, +b]; });
for (const [world, vw, vh] of CASES) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    window.__big = []; window.__stems = 0;
    const P = CanvasRenderingContext2D.prototype, arc = P.arc, fill = P.fill, stroke = P.stroke, bp = P.beginPath;
    const tag = () => new Error().stack.split('\n').slice(2, 4).join(' | ');
    P.beginPath = function () { this.__r = 0; return bp.call(this); };
    P.arc = function (x, y, r, ...a) { this.__r = Math.max(this.__r || 0, Math.abs(r * this.getTransform().a)); return arc.call(this, x, y, r, ...a); };
    const big = (c) => c.canvas && c.canvas.id === 'game' && window.forkwood && window.forkwood.mode === 'play';
    P.fill = function (...a) { if (big(this) && this.__r > 120 && window.__big.length < 10) window.__big.push(`fill r=${Math.round(this.__r)} ${this.fillStyle} ${tag()}`); return fill.apply(this, a); };
    P.stroke = function (...a) { if (big(this)) { const lw = this.lineWidth * Math.abs(this.getTransform().a); if (lw > 60 && !/rgba\(26, 18, 22, 0\.1|rgba\(240, 120, 90, 0\.(0|1)/.test(String(this.strokeStyle)) && window.__big.length < 10) window.__big.push(`stroke lw=${Math.round(lw)} r=${Math.round(this.__r || 0)} ${this.strokeStyle} ${tag()}`); } return stroke.apply(this, a); };
  });
  const p = await ctx.newPage(); const errs = [];
  p.on('crash', () => console.log('PAGE CRASH', world, vw));
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /draw step failed|frame draw failed/.test(m.text()))) errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/?gfx=gl&world=${world}&seed=4242`);
  await sleep(3000);
  await p.evaluate(() => { const F = window.forkwood; F.save.tutorial = true; F.start(); });
  let hits = 0, glBig = [], stemsAfterArt = 0;
  for (let round = 0; round < 60 && hits < 3; round++) {
    const r = await p.evaluate(() => { const F = window.forkwood, s = F.sim, h0 = s.hits || 0;
      for (let i = 0; i < 240 && F.mode === 'play' && !s.dead; i++) {
        s.sap = Math.max(s.sap, 70);
        let tx = 280, best = -1e9;
        for (const b of s.brambles) if (b.y < s.cy + 10 && b.y > s.cy - 400 && b.solids.length && b.y > best) { best = b.y; tx = (b.solids[0][0] + b.solids[0][1]) / 2; }
        for (const c of s.columns) if (c.y0 > s.cy - 400 && c.y1 < s.cy + 50 && c.y0 > best) { best = c.y0; tx = c.x; }
        F.advance(1 / 60, { targetX: tx });
        if ((s.hits || 0) > h0) { // keep this tick's events for the next rendered frame (advance() runs off the rAF loop)
          const arr = s.events.slice(); let keep = 1;
          s.events = new Proxy(arr, { set(t, k, v) { if (k === 'length' && v === 0 && keep > 0) { keep--; return true; } t[k] = v; return true; } });
          setTimeout(() => { s.events = []; }, 60); break;
        }
      }
      return { hits: s.hits || 0, mode: F.mode };
    });
    if (r.mode !== 'play') break;
    if (r.hits > hits) {
      hits = r.hits;
      for (let k = 0; k < 4; k++) {
        await sleep(70);
        const g = await p.evaluate(() => { const g = window.forkwood.gfx, out = []; if (!g) return out;
          const skip = new Set([g.vine && g.vine.mesh, g.vineGlow && g.vineGlow.mesh, g.ground]);
          const walk = (o) => { if (!o.visible || o.alpha < 0.05 || skip.has(o)) return; if (o.texture && o.constructor.name === 'Sprite') { const b = o.getBounds(); if (b.width > innerWidth * 0.6 && b.width < innerWidth * 2) out.push(Math.round(b.width) + 'px tint ' + (o.tint >>> 0).toString(16)); } (o.children || []).forEach(walk); };
          walk(g.world); return out; });
        glBig.push(...g);
      }
      await p.screenshot({ path: new URL(`./out/hitfx-${world}-${vw}-${hits}.png`, import.meta.url).pathname, timeout: 15000 }).catch(() => {});
    }
  }
  const slots = await p.evaluate(() => { const g = window.forkwood.gfx; return g ? [...g.slotOf.keys()].filter((id) => /^fx\.|hazard|trap\.briar/.test(id)) : []; });
  const alive = await p.evaluate(async () => { window.forkwood.resetPerf(); await new Promise((r) => setTimeout(r, 1500)); return window.forkwood.perf.p50 > 0; }); // the game's rAF loop still records frames
  stemsAfterArt = await p.evaluate(() => window.__stems);
  const big = await p.evaluate(() => window.__big);
  console.log(world, vw, JSON.stringify({ hits, big: big.length, glBig: glBig.length, slots, stems: stemsAfterArt, alive }));
  if (hits < 1) fails.push(`${world}: drove no trap contact`);
  if (big.length) fails.push(`${world} ${vw}: oversized 2D hit/flash shapes: ${big.slice(0, 3).join(' || ')}`);
  if (glBig.length) fails.push(`${world} ${vw}: oversized GL sprites: ${glBig.slice(0, 3).join(', ')}`);
  if (slots.length) fails.push(`${world}: missing textures drawn as placeholders: ${slots.join(',')}`);
  if (!alive) fails.push(`${world}: game loop stopped after a contact`);
  if (errs.length) fails.push(`${world}: errors ${JSON.stringify(errs.slice(0, 3))}`);
  await ctx.close();
}
await browser.close(); server.kill();
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'hit FX sizes + painted hazards OK');
process.exit(fails.length ? 1 : 0);
