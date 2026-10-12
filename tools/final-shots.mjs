// Forkwood 1.0 screenshot pass: gate, prologue, how-to, home, each episode, play on each map, results.
//   PORT=8311 OUT=../shots VP=p,d PARTS=home,gate,eps,play,over node tools/final-shots.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +(process.env.PORT || 8311), OUT = process.env.OUT || '/tmp/final-shots';
const PARTS = (process.env.PARTS || 'home,gate,eps,play,over').split(',');
const VPS = { p: { width: 390, height: 844, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true }, d: { width: 1440, height: 900, deviceScaleFactor: 1 } };
const VP = (process.env.VP || 'p,d').split(',');
const WORLDS = (process.env.WORLDS || 'meadow,starry,fresco,ukiyo,lilies,gilded,lacquer').split(',');
const EPS = (process.env.EPS || 'meadow,starry,fresco,ukiyo,lilies,gilded,lacquer').split(',');
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const base = `http://localhost:${PORT}/`;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(vp, url) {
  const ctx = await b.newContext({ viewport: { width: VPS[vp].width, height: VPS[vp].height }, deviceScaleFactor: VPS[vp].deviceScaleFactor, isMobile: !!VPS[vp].isMobile, hasTouch: !!VPS[vp].hasTouch });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${vp} ${url}: pageerror ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${vp} ${url}: ${m.type()} ${m.text()}`); });
  await p.goto(base + url);
  for (let i = 0; i < 40; i++) { if (await p.evaluate(() => !!(window.forkwood && window.forkwood.hub))) break; await sleep(250); }
  return { ctx, p };
}
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82, timeout: 120000 });

for (const vp of VP) {
  if (PARTS.includes('home')) {
    const { ctx, p } = await page(vp, '?seed=4242');
    await sleep(4500); await shot(p, `home-${vp}`);
    await p.click('#btn-howto'); await sleep(900); await shot(p, `howto1-${vp}`);
    await p.click('.ht-next'); await sleep(500); await shot(p, `howto2-${vp}`);
    await p.keyboard.press('Escape'); await sleep(400);
    await p.click('#btn-episodes'); await sleep(1500); await shot(p, `gallery-${vp}`);
    await ctx.close();
  }
  if (PARTS.includes('gate')) {
    const { ctx, p } = await page(vp, '?intro=1&introhold=1');
    await sleep(1500); await shot(p, `gate-${vp}`);
    await p.click('.fw-begin', { force: true }); await sleep(2200); await shot(p, `prologue1-${vp}`);
    for (let k = 0; k < 6; k++) { await p.mouse.click(30, 300); await sleep(1300); }
    await sleep(1500); await shot(p, `prologue-end-${vp}`);
    await p.click('.mg-grow').catch(() => {}); await sleep(1200); await shot(p, `howto-first-${vp}`);
    for (let k = 0; k < 4; k++) { await p.click('.ht-next').catch(() => {}); await sleep(450); }
    await sleep(2500); await shot(p, `first-run-${vp}`);
    await ctx.close();
  }
  if (PARTS.includes('eps')) {
    const { ctx, p } = await page(vp, '?introhold=1');
    await sleep(1500);
    for (const w of EPS) {
      await p.evaluate((id) => import('./src/episodes.js').then((m) => { window.__epDone = false; m.playEpisode(id, {}).then(() => { window.__epDone = true; }); }), w);
      await sleep(900); await shot(p, `ep-${w}-card-${vp}`);
      await sleep(1400);
      await p.mouse.click(20, 200); await sleep(400); await p.mouse.click(20, 200); await sleep(2600);
      await shot(p, `ep-${w}-${vp}`);
      await p.keyboard.press('Escape'); await sleep(700);
    }
    await ctx.close();
  }
  if (PARTS.includes('play') || PARTS.includes('over')) {
    for (const w of WORLDS) {
      const { ctx, p } = await page(vp, `?world=${w}&bot=1&seed=4242`);
      await sleep(1200);
      await p.evaluate(() => { window.forkwood.start(); window.forkwood.setAutoplay(true); window.forkwood.fastTo(140); });
      await sleep(2500); await shot(p, `play-${w}-${vp}`);
      if (PARTS.includes('over') && (w === 'meadow' || w === 'starry' || w === 'lacquer')) {
        await p.evaluate(() => window.forkwood.killNow());
        for (let i = 0; i < 200 && (await p.evaluate(() => window.forkwood.mode)) !== 'over'; i++) { await p.evaluate(() => window.forkwood.advance(0.1, 'bot')); await sleep(20); }
        await sleep(2500); await shot(p, `over-${w}-${vp}`);
      }
      await ctx.close();
    }
  }
}
console.log('errors', errs.length, JSON.stringify(errs.slice(0, 20), null, 1));
await b.close(); server.kill();
