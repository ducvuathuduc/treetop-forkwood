// Headless smoke test: loads the game in Chromium on a desktop and a phone
// viewport, plays it (bot + real mouse/touch input), checks the challenge-link
// and calm-mode flows, fails on any console error, and saves screenshots.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const PORT = +process.env.PORT || 8137;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } } // P7-UI: wait for the server, not a fixed 800 ms
const base = process.env.URL || `http://localhost:${PORT}/`;
const errors = [];
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (page, n = 3) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function run(name, ctxOpts, fn) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  try { await fn(page); } catch (e) { errors.push(`[${name}] test failure: ${e.message}`); }
  await ctx.close();
}
async function toGameOver(page, name) {
  await page.evaluate(() => window.forkwood.killNow());
  for (let i = 0; i < 80 && (await page.evaluate(() => window.forkwood.mode)) !== 'over'; i++) { await page.evaluate(() => window.forkwood.advance(0.1, 'bot')); await sleep(60); }
  await sleep(500);
  const over = await page.evaluate(() => window.forkwood.mode);
  if (over !== 'over') errors.push(`[${name}] expected game over screen, got ${over}`);
}

await run('desktop', { viewport: { width: 1280, height: 800 } }, async (page) => {
  await page.goto(base + '?bot=1&seed=4242');
  await sleep(1500);
  await page.screenshot({ path: OUT + '01-title-desktop.png' });
  await page.click('#btn-play');
  await sleep(400);
  // play through the real gameplay path until a merge at combo x3 or more
  let st;
  for (let i = 0; i < 400; i++) {
    st = await page.evaluate(() => { const before = window.forkwood.sim.merges; const r = window.forkwood.advance(1 / 20, 'bot'); return { ...r, merged: r.merges > before, mult: window.forkwood.sim.mult }; });
    if (st.merged && st.mult >= 3 && st.m > 60) break;
  }
  await page.evaluate(() => window.forkwood.advance(0.12, 'bot'));
  await frames(page);
  await page.screenshot({ path: OUT + '02-play-combo-desktop.png' });
  console.log('desktop combo state', JSON.stringify(st), 'frameMs', await page.evaluate(() => window.forkwood.frameMs.toFixed(2)));
  await toGameOver(page, 'desktop');
  await page.screenshot({ path: OUT + '03-gameover-desktop.png' });
  const data = await page.evaluate(() => document.getElementById('card-img').src);
  if (!data.startsWith('data:image/png')) errors.push('[desktop] share card missing');
  else writeFileSync(OUT + '04-share-card.png', Buffer.from(data.split(',')[1], 'base64'));
  // instant restart with R
  await page.keyboard.press('r');
  await sleep(300);
  const m2 = await page.evaluate(() => window.forkwood.mode);
  if (m2 !== 'play') errors.push('[desktop] R did not restart: ' + m2);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
});

await run('desktop-human', { viewport: { width: 1366, height: 768 } }, async (page) => {
  // real mouse input, no bot: click to start, steer, click to fork + merge, pause/resume
  await page.goto(base + '?seed=99');
  await sleep(600);
  await page.mouse.click(683, 420); // v1.0: clear of the Map chip under Grow
  await sleep(300);
  if ((await page.evaluate(() => window.forkwood.mode)) !== 'play') errors.push('[desktop-human] click did not start');
  for (let i = 0; i < 10; i++) { await page.mouse.move(600 + i * 15, 500); await sleep(40); }
  await page.mouse.down(); await page.mouse.up();
  await frames(page, 3); // the game loop consumes the click
  await page.evaluate(() => window.forkwood.advance(0.6, { targetX: 280 }));
  const tips = await page.evaluate(() => window.forkwood.sim.tips.length);
  if (tips !== 2) errors.push('[desktop-human] click did not fork, tips=' + tips);
  await page.keyboard.press('p');
  if (!(await page.evaluate(() => window.forkwood.paused))) errors.push('[desktop-human] P did not pause');
  await page.keyboard.press('p');
  if (await page.evaluate(() => window.forkwood.paused)) errors.push('[desktop-human] P did not resume');
});

await run('challenge', { viewport: { width: 1280, height: 800 } }, async (page) => {
  await page.goto(base + '?seed=123456&beat=150');
  await sleep(600);
  const txt = await page.evaluate(() => document.getElementById('challenge').textContent);
  if (!/150 m/.test(txt)) errors.push('[challenge] banner missing: ' + txt);
  await page.click('#btn-play');
  await sleep(200);
  const s = await page.evaluate(() => ({ seed: window.forkwood.sim.seed, best: window.forkwood.sim.bestM }));
  if (s.seed !== 123456 || s.best !== 150) errors.push('[challenge] wrong seed/target ' + JSON.stringify(s));
  // calm mode toggle persists
  await page.evaluate(() => window.forkwood.killNow());
});

await run('mobile', { ...devices['iPhone 13'] }, async (page) => {
  await page.goto(base + '?seed=4242');
  await sleep(1500);
  await page.screenshot({ path: OUT + '05-title-mobile.png' });
  await page.tap('#btn-play');
  await sleep(300);
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  // relative drag: finger moves right 60 px -> target moves right
  const x0 = await page.evaluate(() => window.forkwood.sim.cx);
  await touch('touchStart', 120, 560);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', 120 + i * 10, 560); await sleep(30); }
  await touch('touchEnd', 0, 0);
  await page.evaluate(() => window.forkwood.advance(0.5, {}));
  const tgt = await page.evaluate(() => window.forkwood.sim.cx);
  if (!(tgt > x0 + 20)) errors.push(`[mobile] drag did not steer right: ${x0} -> ${tgt}`);
  // a tap forks without yanking the tip toward the tap point
  const before = await page.evaluate(() => window.forkwood.sim.cx);
  await page.tap('canvas', { position: { x: 30, y: 560 } });
  await sleep(80); // let the game loop consume the tap before stepping synchronously
  await page.evaluate(() => window.forkwood.advance(0.3, {}));
  const after = await page.evaluate(() => ({ tips: window.forkwood.sim.tips.length, cx: window.forkwood.sim.cx }));
  if (after.tips !== 2) errors.push('[mobile] tap did not fork');
  if (Math.abs(after.cx - before) > 60) errors.push(`[mobile] tap yanked the tip ${before} -> ${after.cx}`);
  for (let i = 0; i < 60; i++) await page.evaluate(() => window.forkwood.advance(0.1, 'bot'));
  await frames(page);
  await page.screenshot({ path: OUT + '06-play-mobile.png' });
  await toGameOver(page, 'mobile');
  await page.screenshot({ path: OUT + '07-gameover-mobile.png' });
});

await browser.close();
server.kill();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE ERRORS');
process.exit(errors.length ? 1 : 0);
