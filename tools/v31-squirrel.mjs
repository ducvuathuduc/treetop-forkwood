// V3.1: capture the Acorn Squirrel's beats (peek, run, throw, exit) on meadow. usage: node tools/v31-squirrel.mjs outDir
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8491, OUT = process.argv[2];
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:${PORT}/?gfx=gl&unlock=all&world=meadow&bot=1&seed=${process.env.SEED || 7}`);
await p.waitForFunction(() => window.forkwood && window.forkwood.gfx, null, { timeout: 30000 });
await p.waitForTimeout(2500);
await p.evaluate(() => { window.forkwood.save.tutorial = true; window.forkwood.save.stats.runs = 9; window.forkwood.start(); window.forkwood.setAutoplay(true); window.forkwood.fastTo(+(new URLSearchParams(location.search).get('m') || 30)); });
for (let k = 0; k < 8; k++) {
  const y = await p.evaluate(() => { const s = window.forkwood.sim; const c = s.traps.find((t) => t.kind === 'cone' && t.st === 'perch'); return c ? c.y : null; });
  if (y != null) { await p.evaluate((y) => window.forkwood.fastTo(-y / 30 - 16), y); break; }
  await p.evaluate(() => window.forkwood.fastTo(Math.round(-window.forkwood.sim.cy / 30) + 40));
}
const shots = { perch: 0, track: 0, lock: 0, dropped: 0 };
const t0 = Date.now();
while (Date.now() - t0 < 80000 && Object.values(shots).some((v) => !v)) {
  const st = await p.evaluate(() => { const s = window.forkwood.sim; if (!s) return null; const c = s.traps.find((t) => t.kind === 'cone' && (t.st !== 'perch' || (s.cy - t.y < 420 && s.cy - t.y > 120)) && t.st !== 'done'); return c ? { st: c.st, t: c.t, dead: s.dead } : { dead: s.dead }; });
  if (!st) { await p.waitForTimeout(100); continue; }
  if (st.dead) break;
  let k = st.st === 'track' ? (st.t <= 0.3 ? 'lock' : 'track') : st.st;
  if (k && shots[k] === 0) { shots[k] = 1; await p.evaluate(() => { window.__fwPause = 1; }); await p.screenshot({ path: `${OUT}/squirrel-${k}.png` }); }
  await p.waitForTimeout(40);
}
console.log('shots', JSON.stringify(shots), errs.length ? errs.slice(0, 5) : 'no errors');
await browser.close(); server.kill();
