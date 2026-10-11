// P8-FX perf + first-load: frameMs (window.forkwood.frameMs, draw+sim cost per frame) in
// normal play at several heights, then a stress phase with every boost active and hits,
// near-misses, seed collects and crow steals injected through sim.events every 250 ms.
// Also records bytes loaded on the title screen (first load) and console errors.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const PORT = +(process.env.PORT || 8782);
const dir = process.env.DIR || new URL('..', import.meta.url).pathname;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: dir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [], bytes = { n: 0, list: [] };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', async (r) => { try { const b = await r.body(); bytes.n += b.length; bytes.list.push([r.url().replace(/.*:\d+\//, ''), b.length]); } catch {} });
await page.goto(`http://localhost:${PORT}/?seed=4242`);
await sleep(2500);
console.log('first-load bytes (title, 2.5s):', bytes.n, 'fx-crow loaded:', bytes.list.some((x) => x[0].includes('fx-crow')));
await page.click('#btn-play');
const measure = () => page.evaluate(() => new Promise((res) => { const d = []; const f = () => { d.push(window.forkwood.frameMs); if (d.length < 150) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }));
const stat = (d) => { d = d.slice(10).sort((a, b) => a - b); return `median ${d[d.length >> 1].toFixed(2)} p95 ${d[Math.floor(d.length * 0.95)].toFixed(2)} ms`; };
for (const h of (process.env.H || '150,400,700,1100').split(',').map(Number)) {
  await page.evaluate((m) => window.forkwood.fastTo(m), h);
  await page.evaluate(() => window.forkwood.setAutoplay(true));
  await sleep(500);
  console.log(h, 'm play frameMs', stat(await measure()));
}
if (!process.env.NOSTRESS) {
  await page.evaluate(() => {
    const s = window.forkwood.sim; s.sap = 90;
    const inj = window.__inj = [];
    const arr = []; const P = new Proxy(arr, { set(t, k, v) { t[k] = v; if (k === 'length' && v === 0 && inj.length) t.push(...inj.splice(0)); return true; } });
    s.events = P;
    setInterval(() => {
      const s = window.forkwood.sim; s.pu.rush = 3; s.pu.ink = 3; s.pu.pollen = 3; s.shield = true; s.sap = Math.max(s.sap, 60);
      inj.push({ type: 'hit', x: s.cx, y: s.cy, dmg: 26, src: 'pulse' }, { type: 'near', x: s.cx, y: s.cy, n: 3 }, { type: 'collect', x: s.cx + 30, y: s.cy - 40, chain: 4, pts: 40 }, { type: 'crowsteal', x: s.cx, y: s.cy, lost: 4, sap: 16 });
    }, 250);
  });
  await sleep(600);
  console.log('stress (all boosts + 16 events/s) frameMs', stat(await measure()));
  await page.screenshot({ path: (process.env.OUT || '/workspace/projects/753c5840-43d8-471e-8fd9-492611032636/work/fw8-shots/') + 'fx-ingame-stress.png' });
}
console.log('errors', JSON.stringify(errors));
await browser.close(); server.kill();
process.exit(errors.length ? 1 : 0);
