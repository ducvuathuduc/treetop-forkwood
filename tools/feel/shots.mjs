// v3 game-feel frame strips: node tools/feel/shots.mjs  (PORT=8393, OUT=../shots-play)
// Plays real runs in Chromium with the bot and saves frames of each feel moment.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8393;
const OUT = process.env.OUT || new URL('../../../shots-play/', import.meta.url).pathname;
mkdirSync(OUT + 'raw', { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('../..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const VP = { width: 430, height: 820 };
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

async function open(world, seed, feel = 'v3') {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${world}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${world}: ${m.text()}`); });
  await page.goto(`http://localhost:${PORT}/?bot=1&gfx=gl&seed=${seed}&world=${world}${feel === 'v2' ? '&feel=v2' : ''}`);
  await sleep(2500);
  await page.evaluate(() => { window.forkwood.save.tutorial = true; window.forkwood.start(false); });
  await sleep(1800);
  return { ctx, page };
}
const raf = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
async function adv(page, sec) { const r = await page.evaluate((s) => window.forkwood.advance(s, 'bot'), sec); await raf(page); return r; }
async function shot(page, name) { await raf(page); await page.screenshot({ path: `${OUT}raw/${name}.png` }); }
async function until(page, fn, maxSec = 120, stepSec = 0.25) {
  for (let t = 0; t < maxSec; t += stepSec) { const ok = await page.evaluate(fn); if (ok) return true; await page.evaluate((s) => window.forkwood.advance(s, 'bot'), stepSec); if ((await page.evaluate(() => window.forkwood.mode)) !== 'play' || (await page.evaluate(() => window.forkwood.sim.dead))) return false; }
  return false;
}
const keepAlive = (page) => page.evaluate(() => { const s = window.forkwood.sim; s.sap = Math.max(s.sap, 70); });

// 1. signature currents, one strip per world
const SEEDS = { meadow: 11, starry: 12, fresco: 13, ukiyo: 14, lilies: 15, gilded: 16, lacquer: 17 };
for (const w of Object.keys(SEEDS)) {
  if (!want('sig') && !want('sig-' + w)) continue;
  const { ctx, page } = await open(w, SEEDS[w]);
  let found = false;
  for (let k = 0; k < 400 && !found; k++) {
    await keepAlive(page);
    found = await page.evaluate(() => { const F = window.forkwood.sim.feelS; return !!(F && F.sigs.some((g) => !g.done && g.y0 - window.forkwood.sim.cy > -260 && g.y0 - window.forkwood.sim.cy < 420)); });
    if (!found) await page.evaluate(() => window.forkwood.advance(0.25, 'bot'));
  }
  if (!found) { errors.push(`${w}: no signature current reached`); await ctx.close(); continue; }
  for (let i = 0; i < 6; i++) { await keepAlive(page); await shot(page, `sig-${w}-${i}`); await adv(page, 0.55); }
  await ctx.close();
}

// 2. combo + flow + gold lane + danger edge on starry (long clean run with the expert bot)
if (want('combo')) {
  const { ctx, page } = await open('starry', 31);
  await page.evaluate(() => window.forkwood.setBotSkill(0.95));
  if (await until(page, () => { const F = window.forkwood.sim.feelS; window.forkwood.sim.sap = Math.max(window.forkwood.sim.sap, 70); return F && F.tier >= 2; }, 120)) { await shot(page, 'combo-tier2'); }
  if (await until(page, () => { const F = window.forkwood.sim.feelS; window.forkwood.sim.sap = Math.max(window.forkwood.sim.sap, 70); return F && F.flow; }, 160)) { await adv(page, 0.3); await shot(page, 'flow-0'); await adv(page, 0.8); await shot(page, 'flow-1'); }
  if (await until(page, () => { const s = window.forkwood.sim; s.sap = Math.max(s.sap, 70); return s.motes.some((o) => o.gold && !o.taken && o.y < s.cy - 140 && o.y > s.cy - 420); }, 160)) { await shot(page, 'lane-gold'); }
  await ctx.close();
}

// 3. last gasp -> clutch, then a real death: quick retry line and the card with the replay
if (want('death')) {
  const { ctx, page } = await open('ukiyo', 41);
  await adv(page, 12);
  await until(page, () => { const s = window.forkwood.sim; return s.motes.some((o) => o.kind === 'sun' && !o.taken && o.y < s.cy - 120 && o.y > s.cy - 300); }, 30);
  await page.evaluate(() => { window.forkwood.sim.sap = 0.2; });
  await adv(page, 0.12); await shot(page, 'gasp-0'); await adv(page, 0.35); await shot(page, 'gasp-1');
  await until(page, () => window.forkwood.sim.feelS.gasp <= 0, 4, 0.1); await adv(page, 0.05); await shot(page, 'gasp-2');
  // now a death with no gasp left
  await page.evaluate(() => { const s = window.forkwood.sim; s.feelS.gaspCd = 99; s.sap = 0.1; });
  for (let i = 0; i < 20; i++) await page.evaluate(() => window.forkwood.advance(0.05, 'bot'));
  await sleep(700); await shot(page, 'death-quickretry');
  await sleep(2400); await shot(page, 'death-card');
  // one tap = new run: measure the time from the tap to a live run
  await page.keyboard.press('r'); const t0 = Date.now();
  for (let i = 0; i < 50; i++) { if (await page.evaluate(() => window.forkwood.mode === 'play' && !window.forkwood.sim.dead && window.forkwood.sim.t < 2)) break; await sleep(20); }
  console.log('restart ms (R on card):', Date.now() - t0);
  await adv(page, 10); await page.evaluate(() => { window.forkwood.sim.feelS.gaspCd = 99; window.forkwood.sim.sap = 0.1; });
  for (let i = 0; i < 12; i++) await page.evaluate(() => window.forkwood.advance(0.05, 'bot'));
  await sleep(600);
  const t1 = Date.now(); await page.mouse.click(215, 400);
  for (let i = 0; i < 50; i++) { if (await page.evaluate(() => window.forkwood.mode === 'play' && !window.forkwood.sim.dead && window.forkwood.sim.t < 2)) break; await sleep(20); }
  console.log('restart ms (tap during quick-retry):', Date.now() - t1, 'mode', await page.evaluate(() => window.forkwood.mode));
  await ctx.close();
}

// 4. boss finisher (fast-forward to the boss on lacquer)
if (want('boss')) {
  const { ctx, page } = await open('lacquer', 51);
  await page.evaluate(() => window.forkwood.fastTo(860));
  const got = await until(page, () => { const s = window.forkwood.sim; s.sap = Math.max(s.sap, 70); return s.motes.some((o) => o.fin && !o.taken && o.y < s.cy - 150); }, 80);
  if (got) {
    await shot(page, 'boss-fin-0');
    await page.evaluate(() => { const s = window.forkwood.sim; const o = s.motes.find((q) => q.fin && !q.taken); window.forkwood.__finX = o.x; });
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.forkwood.advance(0.25, { targetX: window.forkwood.__finX })); await raf(page); }
    await shot(page, 'boss-fin-1');
    await until(page, () => window.forkwood.sim.feelS.finishers > 0, 3, 0.05);
    await raf(page); await shot(page, 'boss-fin-2'); await adv(page, 0.4); await shot(page, 'boss-fin-3');
  } else errors.push('boss: no finisher reached');
  await ctx.close();
}

// 5. v2 vs v3 on the same seed (same moment)
if (want('compare')) {
  for (const feel of ['v2', 'v3']) {
    const { ctx, page } = await open('meadow', 61, feel);
    for (let i = 0; i < 4; i++) { await keepAlive(page); await adv(page, 6); await shot(page, `cmp-${feel}-${i}`); }
    await ctx.close();
  }
}
await browser.close(); server.kill();
console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no errors');
