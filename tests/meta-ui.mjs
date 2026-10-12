// Meta layer in headless Chromium: first run stays untouched, rewards after a
// real run, gift, shop buy/equip, charms in play (and off on the daily tree),
// persistence across reloads, migration from the first build's save, a corrupt
// save, phone layouts, frame time, console errors.
// usage: node tests/meta-ui.mjs   (URL=... to test a deployed copy)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const PORT = +process.env.PORT || 8147;
const ROOT = new URL('..', import.meta.url).pathname;
const server = process.env.URL ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } } // P7-UI: wait for the server, not a fixed 800 ms
const base = process.env.URL || `http://localhost:${PORT}/`;
async function waitOver(p, ms = 7000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(() => window.forkwood.mode) === 'over') break; await p.waitForTimeout(150); } await p.waitForTimeout(900); }
const OUT = ROOT + 'tests/out/';
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const px = process.env.URL && (process.env.HTTPS_PROXY || process.env.https_proxy);
let proxy;
if (px) { const u = new URL(px); proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined }; }
const browser = await chromium.launch(proxy ? { proxy } : {});
const allErrs = [];

async function open(opts, init) {
  const ctx = await browser.newContext(opts);
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') allErrs.push(m.text()); });
  p.on('pageerror', (e) => allErrs.push(e.message));
  await p.goto(base);
  await p.waitForTimeout(1700);
  return { ctx, p };
}
const fw = (p, fn, arg) => p.evaluate(fn, arg);
async function playRun(p, sec = 30, daily = false) {
  await fw(p, (d) => window.forkwood.start(d), daily);
  await fw(p, (s) => window.forkwood.advance(s, 'bot'), sec);
  await fw(p, () => window.forkwood.killNow());
  await p.waitForTimeout(2600);
  for (let i = 0; i < 20 && (await fw(p, () => window.forkwood.mode)) !== 'over'; i++) await p.waitForTimeout(250);
}

// 1. first visit: nothing extra on the title, the print pull lifts away
const { ctx, p } = await open({ viewport: { width: 1280, height: 800 } });
ok(await p.isVisible('#tabbar') && await p.isVisible('#btn-race'), 'first visit: tab bar and Live race are there from the start (Forkwood 1.0: nothing hidden)');
ok(await fw(p, () => getComputedStyle(document.getElementById('press')).display === 'none'), 'print-pull intro is gone after load');
await p.screenshot({ path: OUT + 'meta-01-first-title.png' });

// 2. a real (non-bot) run: rewards, level up, persistence
await playRun(p, 34);
ok(await fw(p, () => window.forkwood.mode) === 'over', 'run ended on the game-over card');
ok(await p.isVisible('#rewards'), 'rewards block shows on game over');
await p.waitForTimeout(1800);
const rw = await fw(p, () => ({ n: +document.getElementById('rw-acorns').textContent, stamps: document.querySelectorAll('#rw-stamps li').length, wallet: document.getElementById('acorn-n').textContent, S: window.forkwood.save }));
ok(rw.n > 0 && rw.S.stats.runs === 1, `acorns earned (${rw.n}) and the run is counted`);
ok(rw.stamps >= 1, `stamps for level-ups / badges (${rw.stamps})`);
ok(+rw.wallet.replace(/,/g, '') === rw.S.acorns, `wallet chip matches the save (${rw.wallet})`);
const stored = await fw(p, () => JSON.parse(localStorage.getItem('forkwood.save.v2')));
ok(stored && stored.stats.runs === 1 && stored.acorns === rw.S.acorns, 'save written to localStorage');
await p.screenshot({ path: OUT + 'meta-02-gameover-rewards.png' });

// 3. menu: gift, shop, buy and wear
await p.click('#btn-menu');
await p.waitForTimeout(600);
ok(await p.isVisible('#tabbar') && await p.isVisible('#metabar'), 'after the first run the title shows the wallet and the 5-tab bar');
// pass 5: finishing a run counts for the streak, so the first run already opened today's gift
const gs = await fw(p, () => ({ st: window.forkwood.save.streak, last: window.forkwood.save.streak.last }));
ok(gs.st.count === 1 && await p.isHidden('#btn-gift'), `the first run opened day 1 of the gift streak (streak ${gs.st.count})`);
const before = await fw(p, () => window.forkwood.save.acorns);
const again = await fw(p, () => window.forkwood.ui.claim());
const afterGift = await fw(p, () => window.forkwood.save.acorns);
ok(afterGift === before, `daily gift cannot be claimed twice (+${afterGift - before})`);
await p.screenshot({ path: OUT + 'meta-03-title-after.png' });
await fw(p, () => { window.forkwood.save.acorns += 3000; });
await fw(p, () => window.forkwood.ui.show('shop')); // META-V2: the v1 cosmetics book is the Grove's classic wardrobe
await p.waitForTimeout(500);
ok(await p.isVisible('#meta') && await p.isHidden('#title'), 'shop opens over the title');
ok((await p.$$('#meta-body canvas.pv')).length >= 5, 'skin previews are drawn');
await p.screenshot({ path: OUT + 'meta-04-shop.png' });
await p.click('#meta-body [data-slot="sky"]');
await p.click('#meta-body [data-buy="sky.ukiyo"]');
await p.waitForTimeout(300);
await p.click('#meta-body [data-slot="bark"]');
await p.click('#meta-body [data-buy="bark.cherry"]');
await p.click('#meta-body [data-slot="bud"]');
await p.click('#meta-body [data-buy="bud.acorn"]');
await p.click('#meta-body [data-slot="leaf"]');
await p.click('#meta-body [data-buy="leaf.maple"]');
await p.click('#meta-body [data-slot="card"]');
await p.click('#meta-body [data-buy="card.stamp"]');
const S1 = await fw(p, () => window.forkwood.save);
ok(['sky.ukiyo', 'bark.cherry', 'bud.acorn', 'leaf.maple', 'card.stamp'].every((id) => S1.owned.includes(id)) && S1.loadout.sky === 'sky.ukiyo' && S1.loadout.bark === 'bark.cherry', 'bought skins are owned and worn');
await p.screenshot({ path: OUT + 'meta-05-shop-card.png' });
for (const t of ['goals', 'charms', 'badges', 'profile']) {
  await p.click(`#meta .tabs [data-tab="${t}"]`); await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + `meta-06-${t}.png` });
}
// charms: unlocked by the level-up of the first run
const lv = await fw(p, () => window.forkwood.save.level);
ok(lv >= 2, `level ${lv} after the first run`);
await p.click('#meta .tabs [data-tab="charms"]');
if (await p.$('[data-charm-eq="ward"]')) await p.click('[data-charm-eq="ward"]');
ok(await fw(p, () => window.forkwood.save.charm) === 'ward', 'Bark Ward equipped');
await p.keyboard.press('Escape');
for (let i = 0; i < 10 && !(await p.isHidden('#meta')); i++) await p.waitForTimeout(150);
await p.waitForTimeout(250);
ok(await p.isHidden('#meta') && await p.isVisible('#title'), 'Esc closes the book and brings the title back');

// 4. charm in play, skins in play, frame time
await fw(p, () => window.forkwood.start(false));
await fw(p, () => window.forkwood.advance(6, 'bot'));
const c1 = await fw(p, () => { const s = window.forkwood.sim; s.charge = 9; s.shield = false; return s.charm; });
ok(c1 === 'ward', 'equipped charm is in the run');
await p.keyboard.press('e');
await p.waitForTimeout(200);
const c2 = await fw(p, () => ({ uses: window.forkwood.sim.charmUses, shield: window.forkwood.sim.shield, charge: window.forkwood.sim.charge }));
ok(c2.uses === 1 && c2.shield && c2.charge === 0, 'E fires the charm: shield up, charge spent');
await fw(p, () => { window.forkwood.sim.charge = 9; });
await p.waitForTimeout(150);
const cz = await fw(p, () => window.forkwood.layout.charm);
ok(!!cz, 'charm badge is laid out on the HUD');
const tipsBefore = await fw(p, () => window.forkwood.sim.tips.length);
if (cz) { await p.mouse.click(cz.x, cz.y); await p.waitForTimeout(200); }
ok(await fw(p, () => window.forkwood.sim.charmUses) === 2 && await fw(p, () => window.forkwood.sim.tips.length) === tipsBefore, 'clicking the charm badge fires it and does not fork or merge');
await p.waitForTimeout(1500);
const fm = await fw(p, () => window.forkwood.frameMs);
// v1.0.1: frameMs now also counts the synchronous raster of the back-layer buffer, which headless
// (software-raster) Chromium does on the main thread; whole-frame timing lives in the perf profiler.
ok(fm < 40, `frame time with skins + charm HUD ${fm.toFixed(2)} ms (incl. back-layer raster)`);
await fw(p, () => { window.forkwood.fastForward(30, 0.95); });
await p.waitForTimeout(500);
await p.screenshot({ path: OUT + 'meta-07-play-skins.png' });
await fw(p, () => window.forkwood.killNow());
await waitOver(p); // v1.0: wait for the result card, not a fixed time (slow headless frames)
await p.screenshot({ path: OUT + 'meta-08-over-skins.png' });
const card = await fw(p, () => document.getElementById('card-img').src);
fs.writeFileSync(OUT + 'meta-09-card-stamp.png', Buffer.from(card.split(',')[1], 'base64'));
// daily tree is pure
await fw(p, () => window.forkwood.start(true));
ok(await fw(p, () => window.forkwood.sim.charm) === null && await fw(p, () => window.forkwood.sim.pure), 'daily tree runs with no charm');
await fw(p, () => window.forkwood.killNow());
await waitOver(p);

// 5. reload keeps everything
await p.reload(); await p.waitForTimeout(1500);
const S2 = await fw(p, () => window.forkwood.save);
ok(S2.owned.includes('bark.cherry') && S2.loadout.bark === 'bark.cherry' && S2.stats.runs === 3 && S2.charm === 'ward', `progress survives a reload (${JSON.stringify({ cherry: S2.owned.includes('bark.cherry'), bark: S2.loadout.bark, runs: S2.stats.runs, charm: S2.charm })})`);
await ctx.close();

// 6. migration from the first public build
{
  const { ctx: c2x, p: q } = await open({ viewport: { width: 1280, height: 800 } }, () => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      localStorage.setItem('forkwood.best', JSON.stringify({ score: 21000, height: 455 }));
      localStorage.setItem('forkwood.stats', JSON.stringify({ runs: 12, meters: 3900, merges: 80, treetops: 1, bestMult: 8 }));
      localStorage.setItem('forkwood.tutorial', 'true');
      sessionStorage.setItem('seeded', '1');
    }
  });
  const S = await fw(q, () => window.forkwood.save);
  ok(S.best.height === 455 && S.stats.runs === 12 && S.tutorial && S.acorns >= 156 && S.ach.treetop, 'old save migrated: best, runs, tutorial, acorns for metres, retro badges');
  await q.waitForTimeout(800);
  ok(/Welcome back/.test(await q.textContent('#toasts')), 'welcome-back toast explains the acorns');
  ok(await q.isVisible('#tabbar'), 'returning players see the tab bar at once');
  await q.screenshot({ path: OUT + 'meta-10-migrated.png' });
  await c2x.close();
}
// 7. corrupt save
{
  const { ctx: c3, p: q } = await open({ viewport: { width: 1280, height: 800 } }, () => { localStorage.setItem('forkwood.save.v2', '{not json'); });
  ok(await fw(q, () => window.forkwood.mode === 'title' && window.forkwood.save.v === 2), 'a corrupt save loads as a fresh one, no crash');
  await c3.close();
}
// 8. phones: book fits, no horizontal overflow, game over fits
for (const [name, dev] of [['iphone13', devices['iPhone 13']], ['small', { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const { ctx: c4, p: q } = await open(dev, () => {
    if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('forkwood.stats', JSON.stringify({ runs: 3, meters: 900 })); localStorage.setItem('forkwood.tutorial', 'true'); sessionStorage.setItem('seeded', '1'); }
  });
  await q.screenshot({ path: OUT + `meta-11-${name}-title.png` });
  const overlapDock = await fw(q, () => { const a = document.getElementById('btn-play').getBoundingClientRect(), b = document.getElementById('tabbar').getBoundingClientRect(); if (b.width < b.height) return a.left < b.right - 2 ? Math.round(b.right - a.left) : 0; return a.bottom > b.top + 2 ? Math.round(a.bottom - b.top) : 0; });
  ok(overlapDock === 0, `${name}: PLAY and the tab bar do not overlap (${overlapDock}px)`);
  await fw(q, () => window.forkwood.ui.show('goals')); await q.waitForTimeout(500);
  const ov = await fw(q, () => { const b = document.getElementById('meta-body'); return b.scrollWidth - b.clientWidth; });
  ok(ov <= 1, `${name}: book has no sideways overflow (${ov}px)`);
  await q.screenshot({ path: OUT + `meta-12-${name}-goals.png` });
  await q.tap('#meta .tabs [data-tab="shop"]'); await q.waitForTimeout(400);
  await q.screenshot({ path: OUT + `meta-13-${name}-shop.png` });
  await q.tap('#btn-meta-close'); await q.waitForTimeout(300);
  await playRun(q, 20);
  await q.waitForTimeout(1500);
  await q.screenshot({ path: OUT + `meta-14-${name}-over.png` });
  const again = await fw(q, () => { const r = document.getElementById('btn-again').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
  ok(again, `${name}: "Grow again" is on screen at game over`);
  await c4.close();
}

ok(allErrs.length === 0, 'no console errors or warnings ' + allErrs.slice(0, 5).join(' | '));
await browser.close();
if (server) server.kill();
if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
console.log('\nmeta UI checks OK');
