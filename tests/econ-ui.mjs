// P8-ECON browser check: shop sections (boosts, upgrades, pods, gem nest), word hunt,
// a boost armed into a run, the second-chance prompt, 0 console errors.
// Screenshots at 390x844 go to SHOTS (default tests/out/).
// Run: URL=http://localhost:<port>/ PW=<playwright> node tests/econ-ui.mjs  (serve the repo root first)
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const URL = process.env.URL || 'http://localhost:8080/';
const OUT = process.env.SHOTS || new globalThis.URL('./out/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, msg) => { if (c) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };
const errors = [];
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR || 1), hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const M = await import('/src/meta.js'); const E = await import('/src/economy.js');
    const S = M.freshSave(); S.stats.runs = 12; S.tutorial = true; S.ret.introSeen = true; S.acorns = 2140; S.earned = 4000; S.level = 5;
    S.goals = M.levelGoals(5);
    E.ensureEcon(S); S.econ.gems = 9; S.econ.gemsEarned = 14; S.econ.boosts = { sprout: 2, ink: 1, pollen: 1 }; S.econ.up = { pollen: 3, ink: 1, rush: 2 };
    const today = new Date().toISOString().slice(0, 10); S.econ.word = { day: today, got: 2, done: false, streak: 2, last: new Date(Date.now() - 864e5).toISOString().slice(0, 10) };
    S.econ.log = [{ n: 1, why: 'all daily challenges' }, { n: 2, why: 'season tier 5' }];
    localStorage.setItem(M.SAVE_KEY, JSON.stringify(S));
    localStorage.setItem('forkwood.intro.v1', '1');
  });
  await page.reload(); await page.waitForTimeout(1400);
  const hasGem = await page.evaluate(() => !!document.querySelector('#gem-n') && document.querySelector('#gem-n').textContent);
  ok(hasGem === '9', `gem chip shows the gem balance (${hasGem})`);
  await page.click('#btn-wallet'); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => document.getElementById('room').classList.contains('show') && document.getElementById('room').dataset.room === 'shop'), 'META-V2: the acorn chip (+) opens the new shop room');
  await page.evaluate(() => { window.forkwood.hub.closeRoom(); window.forkwood.ui.showShop('skins'); }); await page.waitForTimeout(400); // the v1 econ book (boosts, upgrades, pods) stays reachable from the Grove
  await page.screenshot({ path: OUT + 'econ-shop-skins.png' });
  for (const sec of ['boosts', 'upgrades', 'pods', 'gems']) {
    await page.click(`[data-eco="${sec}"]`); await page.waitForTimeout(300);
    const n = await page.evaluate(() => document.querySelectorAll('#meta-body .charm.eco, #meta-body .pod-card').length);
    ok(n > 0, `shop section ${sec} renders (${n} rows)`);
    await page.screenshot({ path: OUT + `econ-shop-${sec}.png` });
  }
  // pod odds are on the page
  await page.click('[data-eco="pods"]'); await page.waitForTimeout(200);
  const odds = await page.evaluate(() => [...document.querySelectorAll('details.odds[open] td + td')].map((t) => parseFloat(t.textContent)).reduce((a, b) => a + b, 0)); // V2-MECH: the pod table has 8 rows (Ride Token)
  ok(Math.abs(odds - 100) < 1e-6, `seed pod odds shown in full and add up to 100% (${odds})`);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('forkwood.save.v2')).acorns);
  await page.click('#meta [data-pod]'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('forkwood.save.v2')));
  ok(after.econ.pods === 1 && after.spent >= 300, `buying a seed pod spends acorns and opens it (${before} -> ${after.acorns})`);
  await page.screenshot({ path: OUT + 'econ-pod-open.png' });
  // arm a boost
  await page.click('[data-eco="boosts"]'); await page.waitForTimeout(200);
  await page.click('[data-boost-arm="sprout"]'); await page.waitForTimeout(200);
  const arm = await page.evaluate(() => JSON.parse(localStorage.getItem('forkwood.save.v2')).econ.armed);
  ok(arm.includes('sprout'), 'arming a boost saves it for the next run');
  await page.screenshot({ path: OUT + 'econ-boost-armed.png' });
  // goals tab: word hunt
  await page.click('#meta .tabs [data-tab="goals"]'); await page.waitForTimeout(300);
  const letters = await page.evaluate(() => document.querySelectorAll('.word-card .letters li').length);
  ok(letters >= 5, `word hunt card shows today's word (${letters} letters)`);
  await page.evaluate(() => document.querySelector('.word-card').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: OUT + 'econ-word-hunt.png' });
  await page.click('#btn-meta-close'); await page.waitForTimeout(300);
  // a free-play run uses the armed head start, then a second chance
  await page.click('#btn-play'); await page.waitForTimeout(500);
  const rush = await page.evaluate(() => ({ rush: window.forkwood.sim.pu.rush, econ: !!window.forkwood.sim.econ, armed: JSON.parse(localStorage.getItem('forkwood.save.v2')).econ.armed.length }));
  ok(rush.econ && rush.rush > 5 && rush.armed === 0, `the armed head start fires at the start of the run (rush ${rush.rush.toFixed(1)} s) and is used up`);
  const dry = () => page.evaluate(() => { const s = window.forkwood.sim; s.pu.rush = 0; s.invuln = 0; s.sap = -1; window.forkwood.advance(0.05); s.deathT = 0.6; });
  await dry(); await page.waitForTimeout(600);
  const shown = await page.evaluate(() => document.getElementById('revive').classList.contains('show'));
  ok(shown, 'running dry on a free-play run offers a second chance');
  await page.screenshot({ path: OUT + 'econ-second-chance.png' });
  await page.click('#rv-yes'); await page.waitForTimeout(400);
  const alive = await page.evaluate(() => ({ dead: window.forkwood.sim.dead, sap: window.forkwood.sim.sap, gems: JSON.parse(localStorage.getItem('forkwood.save.v2')).econ.gems, mode: window.forkwood.mode }));
  ok(!alive.dead && alive.sap > 50 && alive.mode === 'play', `second chance brings the tree back (sap ${Math.round(alive.sap)}, gems left ${alive.gems})`);
  // decline the next one: the game-over card appears
  await page.evaluate(() => window.forkwood.advance(1.5));
  await dry(); await page.waitForTimeout(600);
  const cost2 = await page.evaluate(() => document.getElementById('rv-cost').textContent.trim());
  ok(cost2 === '2', `the second one costs 2 gems (${cost2})`);
  await page.click('#rv-no'); await page.evaluate(() => { window.forkwood.sim.deathT = 1.2; }); await page.waitForTimeout(1500);
  ok(await page.evaluate(() => window.forkwood.mode) === 'over', 'declining shows the game-over card');
  await page.screenshot({ path: OUT + 'econ-over.png' });
  await ctx.close();
} catch (e) { errors.push('browser failure: ' + e.message); }
await browser.close();
ok(errors.length === 0, `0 console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(fails ? `\n${fails} FAILED` : '\necon UI OK');
process.exit(fails ? 1 : 0);
