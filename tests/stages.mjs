// Screenshots of every stage + a long-run share card, via fastForward (written to tests/out/, not committed).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8138, OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } } // P7-UI: wait for the server, not a fixed 800 ms
const errors = [];
const browser = await chromium.launch();
const vp = process.env.VP === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } };
const page = await (await browser.newContext(vp)).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(`http://localhost:${PORT}/?bot=1&seed=777`);
await sleep(800);
await page.evaluate(() => window.forkwood.start(false));
const tag = process.env.VP || 'desktop';
for (const sec of [12, 22, 25, 30, 35, 40]) {
  const m = await page.evaluate((s) => window.forkwood.fastForward(s), sec);
  await sleep(1300);
  await page.screenshot({ path: `${OUT}stage-${tag}-${Math.round(m)}m.png` });
}
await page.evaluate(() => window.forkwood.killNow());
for (let i = 0; i < 40 && (await page.evaluate(() => window.forkwood.mode)) !== 'over'; i++) await sleep(250);
await sleep(700);
await page.screenshot({ path: `${OUT}stage-${tag}-gameover.png` });
const data = await page.evaluate(() => document.getElementById('card-img').src);
writeFileSync(`${OUT}card-long-run.png`, Buffer.from(data.split(',')[1], 'base64'));
await browser.close(); server.kill();
console.log(errors.length ? 'ERRORS ' + errors.join('\n') : 'no errors');
