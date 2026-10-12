// V3.2 gameplay screenshots: first run at the 150 m calm and the 300 m mini-boss, sap-low (wilted) vine,
// sun shaft, fork-choice gate, results card. usage: node tools/v32-play-shots.mjs outDir [phone|desk]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8493, OUT = process.argv[2] || 'shots', DEV = process.argv[3] || 'phone';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const vp = DEV === 'desk' ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errs = [];
const want = (k) => !ONLY.length || ONLY.includes(k);
const W = process.env.WORLD || 'meadow', SEED = process.env.SEED || 7;
async function page(q = '') {
  const ctx = await browser.newContext(vp);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/?gfx=gl&world=${W}&bot=1&seed=${SEED}&early=1${q}`);
  await p.waitForFunction(() => window.forkwood && window.forkwood.gfx && window.forkwood.gfx.ready, null, { timeout: 40000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const f = window.forkwood; f.save.tutorial = true; f.save.stats.runs = 2; f.save.best.height = 120; f.start(); });
  await p.waitForTimeout(600);
  return { p, ctx };
}
const frames = (p, n = 4) => p.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// hold the live loop and step the sim in-page (60 Hz, bot input, invulnerable, sap topped) until cond(sim)
async function playUntil(p, cond, maxSec = 60, keepSap = 70) {
  const ok = await p.evaluate(([c, ks, max]) => {
    const f = window.forkwood, fn = (0, eval)(c); window.__fwHold = 1;
    for (let i = 0; i < max * 60; i++) { const s = f.sim; s.invuln = Math.max(s.invuln, 0.5); if (ks) s.sap = Math.max(s.sap, ks); if (fn(s)) return true; f.advance(1 / 60, 'bot'); if (s.dead) return false; }
    return false;
  }, [cond.toString(), keepSap, maxSec]);
  return ok;
}
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

if (want('calm') || want('mini')) {
  const { p, ctx } = await page();
  if (want('calm')) {
    await p.evaluate(() => window.forkwood.fastTo(140));
    const ok = await playUntil(p, (s) => s.sp && s.sp.type === 'calm' && (s.sp.y0 - s.cy) > 260, 60);
    await frames(p, 6); await shot(p, `${DEV}-150m-calm${ok ? '' : '-MISSED'}`);
  }
  if (want('mini')) {
    await p.evaluate(() => { const s = window.forkwood.sim; if (-s.cy / 30 < 285) window.forkwood.fastTo(288); });
    const ok = await playUntil(p, (s) => s.boss && s.boss.mini && s.boss.atk && s.boss.atk.t > 0.35, 60);
    await frames(p, 3); await shot(p, `${DEV}-300m-miniboss${ok ? '' : '-MISSED'}`);
    const banner = await p.evaluate(() => { const s = window.forkwood.sim; return { m: Math.round(-s.cy / 30), boss: s.boss && s.boss.id, mini: s.boss && s.boss.mini, n: s.boss && s.boss.n }; });
    console.log('mini', JSON.stringify(banner));
  }
  await ctx.close();
}
if (want('wilt') || want('shaft') || want('choice')) {
  const { p, ctx } = await page();
  if (want('shaft')) {
    await p.evaluate(() => window.forkwood.fastTo(60));
    const ok = await playUntil(p, (s) => s.motes.some((o) => o.kind === 'sun' && !o.taken && (s.cy - o.y) / Math.max(160, s.speed) > 0.75 && (s.cy - o.y) / Math.max(160, s.speed) < 1.25 && Math.abs(o.x - s.cx) > 45), 40);
    console.log('shaft dbg', await p.evaluate(() => { const s = window.forkwood.sim; return JSON.stringify({ m: Math.round(-s.cy / 30), t: s.t.toFixed(1), sp: Math.round(s.speed), suns: s.motes.filter((o) => o.kind === 'sun' && !o.taken).slice(0, 6).map((o) => [((s.cy - o.y) / Math.max(160, s.speed)).toFixed(2), Math.round(o.x - s.cx)]) }); }));
    await frames(p, 2); await shot(p, `${DEV}-sun-shaft${ok ? '' : '-MISSED'}`);
  }
  if (want('choice')) {
    const y = await p.evaluate(() => { const s = window.forkwood.sim; for (let i = 0; i < 40; i++) { const b = s.brambles.find((q) => q.choice && q.y < s.cy - 100); if (b) return b.y; window.forkwood.fastTo(Math.round(-s.cy / 30) + 25); } return null; });
    if (y != null) {
      await p.evaluate((y) => window.forkwood.fastTo(-y / 30 - 22), y);
      const ok = await playUntil(p, (s) => s.brambles.some((b) => b.choice && s.cy - b.y > 300 && s.cy - b.y < 420), 30);
      await frames(p, 2); await shot(p, `${DEV}-fork-choice${ok ? '' : '-MISSED'}`);
    } else console.log('no choice gate found');
  }
  if (want('wilt')) {
    
    await p.evaluate(() => { if (-window.forkwood.sim.cy / 30 < 50) window.forkwood.fastTo(90); });
    await playUntil(p, (s) => s.tips.length === 2 && s.forkTime > 1.2, 20);
    await p.evaluate(() => { const s = window.forkwood.sim; s.sap = 14; });
    // keep it low (no sunlight) for ~1.6 s so the wilt eases in
    await p.evaluate(() => { window.__fwHold = 1; }); await p.waitForTimeout(2500); // the wilt eases in on wall-clock time
    await shot(p, `${DEV}-sap-low-vine`);
    await p.evaluate(() => { const s = window.forkwood.sim; s.sap = 90; });
    await p.waitForTimeout(2000); await shot(p, `${DEV}-sap-recovered-vine`);
  }
  await ctx.close();
}
if (want('results')) {
  const { p, ctx } = await page();
  await p.evaluate(() => window.forkwood.fastTo(212));
  await p.evaluate(() => window.forkwood.killNow());
  for (let i = 0; i < 80 && (await p.evaluate(() => window.forkwood.mode)) !== 'over'; i++) { await p.evaluate(() => { const f = window.forkwood; f.advance(0.1, 'bot'); if (f.sim.dead) f.sim.deathT = Math.max(f.sim.deathT, 3); }); await p.waitForTimeout(150); }
  await p.waitForTimeout(1600);
  await shot(p, `${DEV}-results`);
  const g = await p.evaluate(() => { const e = document.getElementById('over-goal'); return e ? e.innerText : null; });
  console.log('goal line:', JSON.stringify(g), await p.evaluate(() => window.forkwood.mode));
  await ctx.close();
}
console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs.slice(0, 8)) : 'no errors');
await browser.close(); server.kill();
