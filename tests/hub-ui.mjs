// META v2 hub + rooms + store sheets in headless Chromium.
// usage: node tests/hub-ui.mjs
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8157;
const ROOT = new URL('..', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const base = `http://localhost:${PORT}/`;
const fails = [], errs = [];
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const browser = await chromium.launch();
const ev = (p, fn, a) => p.evaluate(fn, a);
async function open(viewport, q = '') {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + (q ? q + '&unlock=0' : '?unlock=0')); // V3.2: maps open by default; this suite tests the paid unlock await p.waitForTimeout(1500);
  return { ctx, p };
}
const veteran = (p) => ev(p, () => { const S = window.forkwood.save; S.stats.runs = 9; S.level = 6; S.acorns = 5000; S.econ.gems = 30; S.store.firstDay = '2026-01-01'; window.forkwood.ui.refreshBar('title'); window.forkwood.hub.refresh('title'); });

// 1. first visit: only PLAY
{
  const { ctx, p } = await open({ width: 390, height: 844 });
  ok(await p.isVisible('#btn-play') && await p.isVisible('#tabbar'), 'first visit: giant PLAY and the tab bar (Forkwood 1.0: nothing hidden)');
  ok(await p.isVisible('#btn-daily') && await p.isVisible('#btn-quest') && await p.isVisible('#btn-race') && await p.isVisible('#btn-episodes') && await p.isVisible('#btn-howto'), 'first visit: Daily, Quests, Story, Live race and How to play all on the rails');
  ok(await p.isVisible('#home-pick .wbranch') && (await p.$$('#home-pick .fruit')).length === 7, 'v3.2 home: the world branch with 7 world medallions'); // V3.2: the world tree became a branch dock above PLAY
  const label = await p.textContent('#home-world b');
  ok(label === 'Golden Hour Meadow' && (await p.textContent('#home-world [lang=vi]')) === 'Đồng cỏ hoàng hôn', `world name with Vietnamese name (${label})`);
  await p.waitForTimeout(2200);
  ok(await ev(p, () => !!document.querySelector('#home-pick .fruit.on') && window.forkwood.mode === 'title'), 'selected world fruit marked, live demo running behind the menu');
  const play = await ev(p, () => { const r = document.getElementById('btn-play').getBoundingClientRect(); return { b: r.bottom, h: r.height, w: r.width }; });
  ok(play.b > 844 * 0.6 && play.b <= 844 && play.h >= 60, `PLAY sits in the thumb zone (bottom ${Math.round(play.b)}, ${Math.round(play.w)}×${Math.round(play.h)})`);
  ok(await ev(p, () => window.forkwood.hub.room === null && !document.getElementById('sheet').classList.contains('show')), 'no offer popup in the first session');
  await ctx.close();
}
// 2. veteran home: tabs, rails, dots, rooms
{
  const { ctx, p } = await open({ width: 390, height: 844 });
  await veteran(p); await p.waitForTimeout(300);
  ok(await p.isVisible('#tabbar'), 'tab bar after the first runs');
  ok((await ev(p, () => [...document.querySelectorAll('#tabbar [data-hub]')].map((b) => b.textContent.trim().toUpperCase()).join(' · '))) === 'SHOP · GROVE · PLAY · PASS · LEAGUE', '5 fixed tabs in order');
  const rails = await ev(p, () => ['rail-l', 'rail-r'].map((id) => [...document.getElementById(id).children].filter((c) => !c.hidden).length));
  ok(rails[0] <= 4 && rails[1] <= 4 && rails[0] >= 1 && rails[1] >= 1, `≤3 side buttons each side (left ${rails[0]}, right ${rails[1]})`);
  ok(await ev(p, () => document.querySelector('#tabbar [data-hub="shop"]').classList.contains('dot')), 'red dot on SHOP while the daily freebie is claimable');
  await p.click('#tabbar [data-hub="shop"]'); await p.waitForTimeout(1200);
  ok(await ev(p, () => [...document.querySelectorAll('#room [data-sec]')].map((s) => s.dataset.sec).join()) === 'offers,free,gems,acorns,skins,pods', 'shop sections in the approved order');
  ok(await ev(p, () => [...document.querySelectorAll('#room .pod-card .odds')].every((t) => t.rows.length >= 6)), 'pod odds printed on the pod card itself');
  ok(await ev(p, () => [...document.querySelectorAll('#room .gem-card .rate')].every((r) => /1 gem ≈/.test(r.textContent))), 'exchange rate on every gem card');
  const g0 = await ev(p, () => window.forkwood.save.acorns + window.forkwood.save.econ.gems);
  await p.click('#room [data-act="free"]'); await p.waitForTimeout(800);
  ok(await ev(p, (g) => window.forkwood.save.acorns + window.forkwood.save.econ.gems !== g || window.forkwood.save.econ.boosts.pollen > 1 || window.forkwood.save.econ.boosts.bark > 0 || window.forkwood.save.econ.pods > 0, g0), 'claim the daily freebie (one tap, no confirm)');
  ok(!(await ev(p, () => document.querySelector('#tabbar [data-hub="shop"]').classList.contains('dot'))), 'SHOP dot clears once claimed');
  const gemsBefore = await ev(p, () => window.forkwood.save.econ.gems);
  await p.click('#room [data-buy="gems_115"]'); await p.waitForTimeout(600);
  ok(await p.isVisible('#sheet .age-row'), 'first purchase asks the age question (parental-consent placeholder)');
  await p.click('#sheet [data-age="16plus"]'); await p.waitForTimeout(700);
  const soon = await ev(p, () => document.querySelector('#sheet .sheet-card').textContent);
  ok(/Coming soon/.test(soon) && /\$9\.99/.test(soon), 'coming-soon sheet shows the real price');
  ok(await ev(p, (g) => window.forkwood.save.store.interest.gems_115 === 1 && window.forkwood.save.econ.gems === g, gemsBefore), 'interest counted, nothing charged or granted');
  await p.mouse.click(8, 8); await p.waitForTimeout(400);
  ok(await p.isHidden('#sheet .sheet-card'), 'sheet closes on a tap outside');
  await p.click('#tabbar [data-hub="grove"]'); await p.waitForTimeout(900);
  ok(await ev(p, () => document.querySelectorAll('#room .critter').length === 8 && document.querySelectorAll('#room .tile.up').length >= 5), 'Grove: 8 critters, 5+ upgrades (MECH adds Wild Kit + Rides), skills and vine wardrobe');
  await p.click('#tabbar [data-hub="pass"]'); await p.waitForTimeout(900);
  ok(await ev(p, () => document.querySelectorAll('#room .tiers .tier').length === 30), 'Season Pass: 30 tiers, free + premium track');
  await p.click('#tabbar [data-hub="league"]'); await p.waitForTimeout(900);
  ok(await ev(p, () => document.querySelectorAll('#room .lg-row').length === 10 && !!document.querySelector('#room .lg-row.you')), 'League: 10 rows with you in them');
  await p.click('#tabbar [data-hub="play"]'); await p.waitForTimeout(500);
  ok(await p.isVisible('#title .title-card') && await p.isHidden('#room'), 'PLAY tab returns Home');
  // gallery: unlock a world with acorns
  await ev(p, () => window.forkwood.hub.openRoom('gallery', {})); await p.waitForTimeout(1200);
  ok(await ev(p, () => document.querySelectorAll('#room .gal-item').length === 7), 'gallery: 7 framed paintings');
  const before = await ev(p, () => window.forkwood.save.acorns);
  await p.evaluate(() => document.querySelector('#room [data-w="fresco"] [data-act="unlock"]').click()); await p.waitForTimeout(1200);
  ok(await ev(p, (b) => window.forkwood.save.econ.maps.includes('arashiyama') && window.forkwood.save.acorns === b - 900 && window.forkwood.save.store.world === 'fresco', before), 'unlock Fresco Cathedral for 900 acorns; it hangs on Home');
  await p.click('#tabbar [data-hub="play"]'); await p.waitForTimeout(400);
  ok((await p.textContent('#home-world b')) === 'Fresco Cathedral', 'Home shows the newly chosen world');
  // offer popup: second session after run 3
  await ev(p, () => window.forkwood.save.store.sessions = 3);
  await ev(p, () => { window.forkwood.save.store.offers.session = 0; window.forkwood.save.store.offers.last = 0; });
  await ev(p, () => window.forkwood.hub.onHome()); await p.waitForTimeout(2200);
  ok(await p.isVisible('#sheet .offer-list'), 'one offer popup back on Home (session ≥ 2, after run 3)');
  await p.click('#sheet .sheet-x'); await ev(p, () => window.forkwood.hub.onHome()); await p.waitForTimeout(2000);
  ok(await p.isHidden('#sheet .sheet-card'), 'never a second popup in the same session');
  await ctx.close();
}
// 3. layouts: no sideways overflow, everything on screen
for (const [w, h] of [[390, 844], [360, 640], [1920, 1080], [2560, 1440]]) {
  const { ctx, p } = await open({ width: w, height: h });
  await veteran(p); await p.waitForTimeout(300);
  const r = await ev(p, () => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const pl = q('#btn-play'), fr = q('#home-pick .wbranch'), tb = q('#tabbar'); return { ov: document.documentElement.scrollWidth - innerWidth, pl: [pl.left, pl.right, pl.top, pl.bottom], fr: [fr.width, fr.height], tb: [tb.left, tb.right, tb.top, tb.bottom] }; });
  const inView = r.pl[0] >= 0 && r.pl[1] <= w && r.pl[3] <= h;
  const clearTabs = r.tb[1] - r.tb[0] < r.tb[3] - r.tb[2] ? r.pl[0] >= r.tb[1] : r.pl[3] <= r.tb[2] + 1;
  ok(r.ov <= 0 && inView && clearTabs && r.fr[0] >= 280 && r.fr[1] >= 56, `${w}×${h}: PLAY on screen and clear of the tabs, world branch ${Math.round(r.fr[0])}×${Math.round(r.fr[1])}, no overflow`);
  await ev(p, () => window.forkwood.hub.openRoom('shop')); await p.waitForTimeout(1000);
  ok(await ev(p, () => document.querySelector('#room .room-body').scrollWidth <= document.querySelector('#room .room-body').clientWidth + 1), `${w}×${h}: shop has no sideways overflow`);
  await ctx.close();
}
ok(errs.length === 0, 'no console errors ' + errs.slice(0, 3).join(' | '));
await browser.close(); server.kill();
console.log(fails.length ? `\n${fails.length} hub check(s) FAILED` : '\nhub-ui: all checks passed');
process.exit(fails.length ? 1 : 0);
