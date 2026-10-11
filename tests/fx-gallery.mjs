// P8-FX: screenshots of every trap's telegraph / attack / hit from gallery.html at 390x844,
// plus the all-traps grid. 0 console errors required. Usage: see README test section.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const PORT = +(process.env.PORT || 8781);
const base = process.env.URL || `http://localhost:${PORT}/`;
const out = process.env.OUT || '/workspace/projects/753c5840-43d8-471e-8fd9-492611032636/work/fw8-shots/';
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: +(process.env.DPR || 2) });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const ids = (process.env.IDS || 'twig,pulse,door,gust,sap,lure,twins,tide,crow,boosts').split(',');
for (const id of ids) {
  await page.goto(`${base}gallery.html?trap=${id}${process.env.STATE ? '&state=' + process.env.STATE : ''}`);
  await sleep(1900);
  await page.screenshot({ path: `${out}fx-${id}${process.env.STATE ? '-' + process.env.STATE : ''}.png` });
  console.log('shot', id);
}
if (!process.env.IDS) {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`${base}gallery.html`); await sleep(2200);
  await page.screenshot({ path: `${out}fx-grid.png`, fullPage: true });
}
console.log('errors', JSON.stringify(errors));
await browser.close(); server.kill();
process.exit(errors.length ? 1 : 0);
