// Forkwood v2 ENGINE perf harness: CPU-throttled headless Chromium (SwiftShader WebGL, no GPU),
// rAF-interval fps/p50/p95 per scenario plus the engine's own telemetry (draw calls, texture MB,
// particles, renderer in use). Usage:
//   GFX=gl|2d VW=390 VH=844 DPR=3 THR=4 PORT=8931 TAG=x node tools/perf/v2-perf.mjs
// Appends one JSON line per run to work/v2/perf-engine.jsonl (relative to the repo: ../perf-engine.jsonl).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { appendFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ROOT = process.env.DIR || new URL('../..', import.meta.url).pathname;
const LOG = new URL('../../../perf-engine.jsonl', import.meta.url).pathname;
const PORT = +(process.env.PORT || 8931);
const THR = +(process.env.THR || 4), VW = +(process.env.VW || 390), VH = +(process.env.VH || 844), DPR = +(process.env.DPR || 3);
const GFX = process.env.GFX || 'gl', WORLD = process.env.WORLD || 'starry', MS = +(process.env.MS || 3000);
const SCEN = (process.env.SCEN || 'title,modal,play100,play400').split(',');
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = [], errs = [];
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: VW < 800, hasTouch: VW < 800 });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/?seed=4242&world=${WORLD}&gfx=${GFX}`);
await sleep(+(process.env.WARM || 5000));
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
const measure = (ms = MS) => p.evaluate((ms) => new Promise((res) => {
  const iv = []; let last = performance.now(); const t0 = last;
  const f = (t) => { iv.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ iv, perf: window.forkwood.perf || null, q: window.forkwood.quality }); };
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(f); });
}), ms);
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
function rec(name, r) {
  const iv = r.iv.length > 6 ? r.iv.slice(3) : r.iv;
  const fps = 1000 / (iv.reduce((a, b) => a + b, 0) / iv.length);
  const P = r.perf || {};
  const row = { name, n: iv.length, fps: +fps.toFixed(1), p50: +pct(iv, 0.5).toFixed(1), p95: +pct(iv, 0.95).toFixed(1), renderer: P.renderer, drawCalls: P.drawCalls, texMB: P.texMB, particles: P.particles, renderMs: P.renderMs != null ? +P.renderMs.toFixed(2) : null, tier: r.q ? r.q.tier : null, dpr: r.q ? r.q.dpr : null };
  out.push(row); console.log(JSON.stringify(row));
}
for (const sc of SCEN) {
  if (sc === 'title') { rec('title', await measure()); }
  else if (sc === 'modal') {
    await p.evaluate(() => document.getElementById('btn-maps') && document.getElementById('btn-maps').click()); await sleep(900);
    rec('modal (maps)', await measure(2000));
    await p.evaluate(() => { const x = document.querySelector('.maps-x'); if (x) x.click(); }); await p.keyboard.press('Escape'); await sleep(500);
  } else if (sc.startsWith('play')) {
    const h = +sc.slice(4);
    await p.evaluate((m) => { if (window.forkwood.mode !== 'play') window.forkwood.start(); window.forkwood.setAutoplay(true); window.forkwood.fastTo(m); }, h);
    await sleep(1200);
    rec(`play ${h} m`, await measure());
  }
}
console.log('errors', JSON.stringify(errs.slice(0, 5)));
appendFileSync(LOG, JSON.stringify({ tag: process.env.TAG || 'run', at: new Date().toISOString(), GFX, WORLD, THR, VW, VH, DPR, rows: out, errs: errs.slice(0, 5) }) + '\n');
await browser.close(); server.kill();
