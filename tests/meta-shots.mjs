// Screenshots of the out-of-run screens for review (META v2).
// usage: node tests/meta-shots.mjs [outDir]   (default ../shots-meta next to the worktree)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8163;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] || new URL('../../shots-meta/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const browser = await chromium.launch();
const errs = [];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const sizes = (process.env.SIZES || '390x844,1920x1080,2560x1440').split(',').map((s) => s.split('x').map(Number));
async function veteran(p) {
  await p.evaluate(() => { const S = window.forkwood.save; S.stats.runs = 9; S.level = 6; S.acorns = 4820; S.econ.gems = 37; S.best = { score: 18420, height: 412 }; S.ret.season.xp = 760; S.ret.season.tier = 9; S.ret.league.xp = 240; S.econ.maps.push('arashiyama'); S.store.firstDay = '2026-10-01'; S.store.passSeen = 7; window.forkwood.ui.refreshBar('title'); window.forkwood.hub.refresh('title'); });
}
const settle = (p, ms = 900) => p.waitForTimeout(ms);
for (const [w, h] of sizes) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 800 ? 2 : 1, hasTouch: w < 800, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text()}`); });
  const shot = async (name) => { if (only && !only.includes(name)) return; await p.screenshot({ path: `${OUT}${name}-${tag}.png` }); console.log('shot', name, tag); };
  await p.goto(`http://localhost:${PORT}/?season=2026-10-11T10:00:00`); await settle(p, 2600);
  await shot('01-home-first-visit');
  await veteran(p); await settle(p, 1200);
  await shot('02-home');
  await p.evaluate(() => window.forkwood.hub.openRoom('gallery')); await settle(p, 1500); await shot('03-gallery');
  await p.evaluate(() => { const g = document.querySelector('.gallery'); const it = g.querySelector('[data-w="ukiyo"]'); g.scrollLeft = it.offsetLeft - (g.clientWidth - it.clientWidth) / 2; }); await settle(p, 900); await shot('04-gallery-locked');
  await p.evaluate(() => window.forkwood.hub.openRoom('shop')); await settle(p, 1200); await shot('05-shop-offers');
  for (const sec of ['free', 'gems', 'skins', 'pods']) { await p.evaluate((s) => window.forkwood.hub.openRoom('shop', { section: s }), sec); await settle(p, 1100); await shot(`06-shop-${sec}`); }
  await p.evaluate(() => window.forkwood.hub.openRoom('grove')); await settle(p, 1100); await shot('07-grove');
  await p.evaluate(() => window.forkwood.hub.openRoom('pass')); await settle(p, 1100); await shot('08-pass');
  await p.evaluate(() => window.forkwood.hub.openRoom('league')); await settle(p, 1100); await shot('09-league');
  await p.evaluate(() => window.forkwood.hub.closeRoom()); await settle(p, 600);
  await p.evaluate(async () => { await window.forkwood.hub.loadStore(); window.forkwood.hub.showOffer(window.forkwood.store.PRODUCT.starter_sprout, false); }); await settle(p, 900); await shot('10-offer');
  await p.evaluate(() => window.forkwood.hub.api.closeSheet()); await settle(p, 300);
  await p.evaluate(() => window.forkwood.hub.api.oddsSheet('golden')); await settle(p, 700); await shot('11-odds');
  await p.evaluate(() => window.forkwood.hub.api.closeSheet());
  await p.evaluate(() => window.forkwood.hub.api.comingSoon(window.forkwood.store.PRODUCT.gems_115)); await settle(p, 700); await shot('12-coming-soon');
  await p.evaluate(() => window.forkwood.hub.api.closeSheet());
  // revive with gems + ad (dev ads)
  await p.goto(`http://localhost:${PORT}/?ads=dev&season=2026-10-11T10:00:00`); await settle(p, 2000); await veteran(p);
  await p.evaluate(() => { window.forkwood.start(); window.forkwood.save.tutorial = true; });
  await p.evaluate(() => { window.forkwood.start(); window.forkwood.advance(6, 'bot'); window.forkwood.killNow(); });
  for (let i = 0; i < 30 && !(await p.evaluate(() => document.getElementById('revive').classList.contains('show'))); i++) await p.waitForTimeout(150);
  await settle(p, 500); await shot('13-revive');
  await p.evaluate(() => document.getElementById('rv-no').click());
  for (let i = 0; i < 40 && (await p.evaluate(() => window.forkwood.mode)) !== 'over'; i++) await p.waitForTimeout(150);
  await settle(p, 1800); await shot('14-game-over');
  await ctx.close();
}
await browser.close(); server.kill();
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
