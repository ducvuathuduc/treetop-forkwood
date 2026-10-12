// v2 ENGINE budget + fallback test (headless Chromium with SwiftShader WebGL):
//  - phone 390x844 DPR3 on every world: WebGL layer active, <= 25 draw calls, <= 300 particles,
//    texture memory < 64 MB, no console errors; ?debug overlay renders
//  - ?gfx=2d and ?glfail=1 run the Canvas2D renderer; a lost WebGL context falls back to Canvas2D
//  - missing registry ids draw a placeholder instead of throwing
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8161;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const base = `http://localhost:${PORT}/`;
const fails = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(q, vw = 390, vh = 844, dpr = 3) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + q);
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => window.forkwood && window.forkwood.perf && (window.forkwood.perf.renderer !== 'canvas2d' || window.forkwood.perf.glWhy || !document.getElementById('game-gl') && performance.now() > 6000))) break; await sleep(250); }
  return { ctx, p, errs };
}
const W = (process.env.WORLDS || 'meadow,starry,fresco,ukiyo,lilies,gilded,lacquer').split(',');
for (const w of W) {
  const { ctx, p, errs } = await page(`?gfx=gl&world=${w}&bot=1&seed=4242&debug=1`);
  await p.evaluate(() => { window.forkwood.start(); window.forkwood.setAutoplay(true); window.forkwood.fastTo(120); });
  await sleep(2500);
  // max over a few samples while playing
  let worst = { drawCalls: 0, particles: 0, texMB: 0 }, P = null;
  for (let i = 0; i < 6; i++) { P = await p.evaluate(() => window.forkwood.perf); for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], P[k] || 0); await sleep(300); }
  console.log(w, JSON.stringify({ renderer: P.renderer, ...worst }));
  if (P.renderer !== 'webgl') fails.push(`${w}: renderer ${P.renderer} (${P.glWhy})`);
  if (worst.drawCalls > 25) fails.push(`${w}: ${worst.drawCalls} draw calls > 25`);
  if (worst.particles > 300) fails.push(`${w}: ${worst.particles} particles > 300`);
  if (worst.texMB >= 64) fails.push(`${w}: ${worst.texMB} MB textures >= 64`);
  if (!(await p.evaluate(() => (document.getElementById('fw-debug') || {}).textContent || '')).includes('draw calls')) fails.push(`${w}: ?debug overlay missing`);
  if (w === W[0]) {
    const ok = await p.evaluate(() => { const g = window.forkwood.gfx; const t = g.sprite('nonexistent.trap.mystery'); const t2 = g.sprite('pickup.sun'); return !!t && !!t2; });
    if (!ok) fails.push('placeholder sprite lookup failed');
    // lose the WebGL context: the Canvas2D renderer must take over and keep drawing
    await p.evaluate(() => { const ext = window.forkwood.gfx.r.gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); });
    await sleep(800);
    const after = await p.evaluate(() => ({ r: window.forkwood.perf.renderer, mode: window.forkwood.mode }));
    if (after.r !== 'canvas2d') fails.push(`context loss did not fall back: ${JSON.stringify(after)}`);
    const px = await p.evaluate(() => { const c = document.getElementById('game'); const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return d[3]; });
    if (px !== 255) fails.push(`after fallback the 2D canvas is not painting (alpha ${px})`);
  }
  if (errs.length) fails.push(`${w}: console errors ${JSON.stringify(errs.slice(0, 3))}`);
  await ctx.close();
}
for (const q of ['?gfx=2d&seed=4242', '?gfx=gl&glfail=1&seed=4242']) {
  const { ctx, p, errs } = await page(q);
  await sleep(1500);
  const P = await p.evaluate(() => window.forkwood.perf);
  console.log(q, P.renderer, P.glWhy || '');
  if (P.renderer !== 'canvas2d') fails.push(`${q}: expected canvas2d, got ${P.renderer}`);
  if (errs.length) fails.push(`${q}: console errors ${JSON.stringify(errs.slice(0, 3))}`);
  await ctx.close();
}
await browser.close(); server.kill();
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'engine budget + fallback OK');
process.exit(fails.length ? 1 : 0);
