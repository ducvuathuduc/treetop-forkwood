// V3.2 living backdrops: frame sequences of every world for motion review.
// The run is paused (sim frozen, #pause hidden) and the living shader clock is stepped
// exactly 1/FPS per frame, so the frames show only the backdrop's own motion.
//   PORT=8233 OUT=/tmp/v32/live WORLDS=starry,meadow H=60 FRAMES=3 STEP=0.8 node tools/v32-living-shots.mjs
//   (FRAMES=48 STEP=0.0833 -> a 4 s clip at 12 fps; Q=living=0 shoots the static A/B)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +(process.env.PORT || 8233), OUT = process.env.OUT || '/tmp/v32/live';
const WORLDS = (process.env.WORLDS || 'meadow,starry,fresco,ukiyo,lilies,gilded,lacquer').split(',');
const HS = (process.env.H || '60').split(',').map(Number);
const FRAMES = +(process.env.FRAMES || 3), STEP = +(process.env.STEP || 0.8), T0 = +(process.env.T0 || 3);
const [VW, VH, DPR] = (process.env.SIZE || '390x844x2').split('x').map(Number);
const Q = process.env.Q ? '&' + process.env.Q : '';
const TAG = process.env.TAG || 'live';
mkdirSync(OUT, { recursive: true });
let server = null;
if (!process.env.NOSERVE) {
  server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
}
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
for (const w of WORLDS) for (const H of HS) {
  const p = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
  p.on('pageerror', (e) => errs.push(`${w}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${w}: ${m.text()}`); });
  await p.goto(`http://localhost:${PORT}/?gfx=gl&world=${w}&bot=1&seed=4242&quality=high${Q}`);
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => window.forkwood && window.forkwood.gfx && window.forkwood.gfx.ready)) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(1500);
  await p.evaluate((h) => { window.forkwood.start(); window.forkwood.setAutoplay(true); window.forkwood.fastTo(h); }, H);
  await p.waitForTimeout(1200);
  for (let i = 0; i < 80; i++) { // every plate of the current zone decoded and faded in
    if (await p.evaluate(() => { const g = window.forkwood.gfx; return g.layers.length && g.layers.every((L) => !L.root.visible || (L.tex && L.root.alpha > 0.999)); })) break;
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(600);
  await p.keyboard.press('p');
  await p.addStyleTag({ content: '#pause{display:none!important}' + (process.env.BACK ? '#game{visibility:hidden!important}' : '') });
  if (process.env.BACK) await p.evaluate(() => { window.forkwood.gfx.rollC.visible = false; }); // backdrop only (no vine/HUD)
  await p.waitForTimeout(400);
  const perf = await p.evaluate(() => { const g = window.forkwood.gfx; return { r: window.forkwood.perf.renderer, dc: window.forkwood.perf.drawCalls, tex: window.forkwood.perf.texMB, living: !!(g && g.living), ms: g && g.stats && g.stats.renderMs }; });
  for (let f = 0; f < FRAMES; f++) {
    await p.evaluate((t) => { const g = window.forkwood.gfx; if (g.living) g.living.clock = t; }, T0 + f * STEP);
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.screenshot({ path: `${OUT}/${TAG}-${w}-${H}m-${String(f).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 88, timeout: 120000 });
  }
  console.log(w, H, JSON.stringify(perf));
  await p.close();
}
console.log('errors', JSON.stringify(errs.slice(0, 8)));
await b.close();
if (server) server.kill();
