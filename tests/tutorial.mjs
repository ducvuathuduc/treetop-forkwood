// First-run coach test: plays the real gameplay path with scripted input and
// checks steer -> fork (with slow-mo) -> merge -> praise, plus that the coach
// card and the stage banner never overlap on desktop or phone.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8139;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } } // P7-UI: wait for the server, not a fixed 800 ms
const browser = await chromium.launch();
const fails = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { ...devices['iPhone 13'] }], ['small-phone', { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fails.push(`[${name}] pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') fails.push(`[${name}] console ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?seed=4242`);
  await sleep(500);
  await page.evaluate(() => window.forkwood.start(false));
  const adv = (sec, inp) => page.evaluate(([s, i]) => window.forkwood.advance(s, i), [sec, inp]);
  const C = { targetX: 280 };
  let st = await adv(0.1, C);
  if (st.coach !== 'steer') fails.push(`[${name}] expected steer, got ${st.coach}`);
  // wait (without forking) until the coach slows time before the split gate
  let slowed = false;
  for (let i = 0; i < 200 && !slowed; i++) { st = await adv(0.1, C); if (st.coach === 'fork' && st.timeScale < 0.5) slowed = true; }
  if (!slowed) fails.push(`[${name}] no slow-mo before the split gate (coach ${st.coach})`);
  st = await adv(0.05, { ...C, toggle: true });
  if (st.coach !== 'merge' || st.tips !== 2) fails.push(`[${name}] fork did not advance coach: ${JSON.stringify(st)}`);
  // ride the twin trail, then merge
  st = await adv(2.6, C);
  st = await adv(0.05, { ...C, toggle: true });
  st = await adv(0.4, C);
  if (st.coach !== 'praise' || st.merges < 1) fails.push(`[${name}] merge did not complete tutorial: ${JSON.stringify(st)}`);
  // run into the Sapling banner while the coach is still up; check layout every frame
  let overlap = 0, both = 0;
  for (let i = 0; i < 80; i++) {
    await adv(1 / 30, C);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const L = await page.evaluate(() => window.forkwood.layout);
    if (L && L.coach && L.banner) { both++; if (L.banner.y0 < L.coach.y1 && L.banner.y1 > L.coach.y0) overlap++; }
  }
  console.log(name, 'frames with coach+banner', both, 'overlapping', overlap);
  if (overlap) fails.push(`[${name}] coach and stage banner overlap in ${overlap} frames`);
  await ctx.close();
}
await browser.close(); server.kill();
console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'tutorial OK');
process.exit(fails.length ? 1 : 0);
