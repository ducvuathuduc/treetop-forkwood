// v3 HOME: screenshots of each home layout (a|b|c) and each font pairing (1|2|3), phone + desktop.
// usage: node tests/home-shots.mjs [outDir] [filter]
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8391;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] || new URL('../../shots-home/', import.meta.url).pathname;
const FILTER = process.argv[3] || '';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const VP = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true }, desk: { viewport: { width: 1920, height: 1080 } } };
const errs = [];
async function shot(name, vp, q, world = 'starry', after) {
  if (FILTER && !name.includes(FILTER)) return;
  const ctx = await browser.newContext({ ...VP[vp] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await p.goto(`http://localhost:${PORT}/?gfx=${name.includes('play') ? '2d' : 'gl'}&unlock=all&${q}`);
  await p.waitForTimeout(700);
  await p.evaluate((w) => { const S = window.forkwood.save; S.stats.runs = 9; S.level = 6; S.acorns = 705; S.econ.gems = 4; S.store.firstDay = '2026-01-01'; if (location.search.includes('allmaps')) S.econ.maps = ['arashiyama', 'redwoods', 'blackforest', 'amazon', 'beanstalk']; if (window.forkwood.hub) { window.forkwood.hub.chooseWorld(w); window.forkwood.ui.refreshBar('title'); window.forkwood.hub.refresh('title'); window.forkwood.hub.home.render(true); } }, world);
  await p.waitForTimeout(after || 6500);
  await p.waitForFunction(() => !document.querySelector('#title.fresh'), null, { timeout: 30000 }).catch(() => {});
  if (name.includes('play')) { await p.click('#btn-play'); await p.waitForTimeout(6000); }
  await p.screenshot({ timeout: 90000, path: `${OUT}/${name}.png` });
  await ctx.close();
}
for (const h of ['a', 'b', 'c']) for (const vp of ['phone', 'desk']) await shot(`home-${h}-${vp}`, vp, `home=${h}&font=1`);
for (const f of ['1', '2', '3']) for (const vp of ['phone', 'desk']) await shot(`font-${f}-${vp}`, vp, `home=c&font=${f}&allmaps`, 'lacquer');
for (const f of ['1', '2', '3']) await shot(`font-${f}-play-phone`, 'phone', `home=c&font=${f}`, 'lacquer');
await browser.close(); server.kill();
console.log(errs.length ? 'page errors:\n' + errs.join('\n') : 'no page errors');
