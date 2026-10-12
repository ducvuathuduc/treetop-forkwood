// V2-INT visual QA: menus, every world in play at 3 heights, a ride, a ring draft, a boss, game over/revive.
// PORT=8400 OUT=../shots-int ONLY=worlds,menus,special SIZES=phone,desk node tools/qa-shots.mjs [worlds...]
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = process.env.PORT || 8400, OUT = process.env.OUT || '../shots-int';
mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || 'menus,worlds,special').split(',');
const SIZES = (process.env.SIZES || 'phone,desk').split(',');
const HEIGHTS = (process.env.HEIGHTS || '60,520,1100').split(',').map(Number);
const worlds = process.argv.slice(2).length ? process.argv.slice(2) : ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer'];
const VP = { phone: [390, 844, 3], desk: [1920, 1080, 1] };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
const veteran = (unlock) => () => { const S = window.forkwood.save; S.tutorial = true; S.stats.runs = Math.max(S.stats.runs, 14); S.level = Math.max(S.level || 1, 9); S.acorns = 4820; if (S.econ) S.econ.gems = 37; if (S.ret) S.ret.introSeen = true; window.forkwood.reloadSave && window.forkwood.reloadSave(); };
async function open(sz, q = '') {
  const [w, h, d] = VP[sz];
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d });
  await ctx.addInitScript(() => localStorage.setItem('forkwood.save.v2', JSON.stringify({ v: 2, tutorial: true, level: 9, acorns: 4820, stats: { runs: 14 }, ret: { introSeen: true } })));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${sz}${q}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${sz}${q}: ${m.text()}`); });
  await p.goto(`http://localhost:${PORT}/?gfx=gl&seed=4242&unlock=all${q}`);
  await p.waitForTimeout(3500);
  return { p, ctx };
}
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 78 }); console.log('shot', name); };
const settle = (p, ms = 1800) => p.waitForTimeout(ms);
async function run(p, world, h) {
  await p.evaluate(async ([w, h]) => {
    const F = window.forkwood; F.start(); F.setAutoplay(true);
    F.fastTo(h);
  }, [world, h]);
}

if (ONLY.includes('menus')) for (const sz of SIZES) {
  const { p, ctx } = await open(sz);
  await shot(p, `home-${sz}`);
  for (const room of ['gallery', 'shop', 'grove', 'pass', 'league']) {
    await p.evaluate((r) => window.forkwood.hub.openRoom(r), room); await settle(p, 1500);
    await shot(p, `${room}-${sz}`);
    await p.evaluate(() => window.forkwood.hub.closeRoom()); await settle(p, 600);
  }
  await ctx.close();
}
if (ONLY.includes('worlds')) for (const w of worlds) for (const sz of SIZES) {
  const { p, ctx } = await open(sz, `&world=${w}`);
  for (const h of HEIGHTS) {
    await run(p, w, h); await settle(p, 2200);
    await shot(p, `play-${w}-${h}m-${sz}`);
    await p.evaluate(() => window.forkwood.killNow()); await settle(p, 400);
  }
  await ctx.close();
}
if (ONLY.includes('special')) for (const sz of SIZES) {
  // ride mount
  { const { p, ctx } = await open(sz, '&world=meadow');
    await run(p, 'meadow', 150);
    await p.evaluate(async () => { const R = await import('./src/rides.js'); const s = window.forkwood.sim; R.addRideKnot(s, s.cx, s.cy - 30, 'hummingbird'); window.forkwood.advance(0.8, 'bot'); });
    await settle(p, 900); await shot(p, `ride-${sz}`); await ctx.close(); }
  // ring draft (first gate at 40 m, free play)
  { const { p, ctx } = await open(sz, '&world=starry');
    await p.evaluate(() => { const F = window.forkwood; F.start(); F.setAutoplay(true); F.fastTo(30); });
    for (let i = 0; i < 20; i++) { const on = await p.evaluate(() => { const s = window.forkwood.sim; return !!(s.ringGates && Object.values(s.ringGates).some((g) => g && g.shown && !g.done)) || window.forkwood.timeScale < 0.9; }); if (on) break; await p.evaluate(() => window.forkwood.advance(0.25, 'bot')); }
    await settle(p, 300); await shot(p, `ring-${sz}`); await ctx.close(); }
  // boss
  for (const w of ['lacquer', 'gilded']) { const { p, ctx } = await open(sz, `&world=${w}`);
    await run(p, w, 905); await p.evaluate(() => window.forkwood.advance(3, 'bot')); await settle(p, 1500);
    await shot(p, `boss-${w}-${sz}`); await ctx.close(); }
  // game over / revive
  { const { p, ctx } = await open(sz, '&world=fresco&ads=dev');
    await run(p, 'fresco', 200); await p.evaluate(() => window.forkwood.killNow());
    for (let i = 0; i < 30 && (await p.evaluate(() => window.forkwood.mode)) !== 'over'; i++) await settle(p, 250);
    await settle(p, 1200); await shot(p, `over-${sz}`); await ctx.close(); }
}
console.log('errors', JSON.stringify(errs.slice(0, 20)));
await b.close();
