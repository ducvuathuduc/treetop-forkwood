// V3.1: in-play + home screenshots. usage: node tools/v31-shots.mjs outDir [worlds] [what=start,mid,home]
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8471;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2];
const WORLDS = (process.argv[3] || 'meadow,starry').split(',');
const WHAT = (process.argv[4] || 'start,mid,home').split(',');
const VPS = (process.env.VPS || 'desk').split(',');
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VP = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }, desk: { viewport: { width: 1920, height: 1080 } } };
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const vp of VPS) for (const w of WORLDS) {
  const ctx = await browser.newContext(VP[vp]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(w + ': ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(w + ' console: ' + m.text()); });
  await p.goto(`http://localhost:${PORT}/?gfx=gl&unlock=all&world=${w}&bot=1&seed=4242`);
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => window.forkwood && window.forkwood.perf && window.forkwood.perf.renderer !== 'canvas2d')) break; await sleep(250); }
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => { const g = window.forkwood.gfx; return g && g.layers && g.layers.length && g.layers.every((L) => L.tex || L.lazy || L.zones); })) break; await sleep(250); }
  if (WHAT.includes('home')) { await sleep(5000); await p.screenshot({ path: `${OUT}/home-${w}-${vp}.png`, timeout: 90000 }); }
  if (WHAT.includes('start') || WHAT.includes('mid')) {
    await p.evaluate(() => { window.forkwood.start(); window.forkwood.setAutoplay(true); });
    await sleep(+process.env.START_MS || 2600);
    if (WHAT.includes('start')) await p.screenshot({ path: `${OUT}/start-${w}-${vp}.png`, timeout: 90000 });
    if (WHAT.includes('mid')) { await p.evaluate((m) => window.forkwood.fastTo(m), +process.env.MID_M || 150); await sleep(3500); await p.screenshot({ path: `${OUT}/mid-${w}-${vp}.png`, timeout: 90000 }); }
  }
  await ctx.close();
}
await browser.close(); server.kill();
console.log(errs.length ? 'errors:\n' + errs.slice(0, 20).join('\n') : 'no page errors');
