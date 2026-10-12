// Screenshots of every world (play at a given height) for phone and desktop.
// PORT=8199 OUT=../shots-engine TAG=temp H=150 node tools/perf/world-shots.mjs [worlds...]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = process.env.PORT || 8199, OUT = process.env.OUT || '../shots-engine', TAG = process.env.TAG || 'temp', H = +(process.env.H || 150);
const worlds = process.argv.slice(2).length ? process.argv.slice(2) : ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer'];
const sizes = (process.env.SIZES || 'phone,desk').split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
for (const w of worlds) for (const sz of sizes) {
  const [vw, vh, dpr] = sz === 'phone' ? [390, 844, 3] : [1920, 1080, 1];
  const p = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  p.on('pageerror', (e) => errs.push(`${w}/${sz}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${w}/${sz}: ${m.text()}`); });
  await p.goto(`http://localhost:${PORT}/?gfx=gl&world=${w}&bot=1&seed=4242`);
  await p.waitForTimeout(3500);
  await p.evaluate((h) => { window.forkwood.start(); window.forkwood.setAutoplay(true); window.forkwood.fastTo(h); }, H);
  await p.waitForTimeout(2500);
  const perf = await p.evaluate(() => window.forkwood.perf);
  await p.screenshot({ path: `${OUT}/${TAG}-${w}-${sz}-${H}m.jpg`, type: 'jpeg', quality: 80 });
  console.log(w, sz, JSON.stringify({ r: perf.renderer, dc: perf.drawCalls, tex: perf.texMB, parts: perf.particles }));
  await p.close();
}
console.log('errors', JSON.stringify(errs));
await b.close();
