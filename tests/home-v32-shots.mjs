// V3.2 HOME: the home (layout c) at the four review viewports, plus a clipping audit:
// every visible text box inside #title / .metabar / .tabbar must not be clipped by an ancestor
// with overflow hidden, and interactive boxes must not overlap each other.
// usage: node tests/home-v32-shots.mjs [outDir] [tag]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8393;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] || new URL('../../shots-v32-home/', import.meta.url).pathname;
const TAG = process.argv[3] || 'v32';
const Q = process.env.Q || '';
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const VPS = {
  'd1920': { viewport: { width: 1920, height: 1080 } },
  'd1366': { viewport: { width: 1366, height: 768 } },
  'p390': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  'p360': { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const errs = []; let bad = 0;
const ONLY = process.env.VP || '';
for (const [name, vp] of Object.entries(VPS)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  const ctx = await browser.newContext(vp);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await p.goto(`http://localhost:${PORT}/?gfx=gl&home=c${Q}`);
  await p.waitForTimeout(800);
  await p.evaluate(() => { const S = window.forkwood.save; S.stats.runs = 9; S.level = 6; S.acorns = 705; S.store.firstDay = '2026-01-01'; if (window.forkwood.hub) { window.forkwood.ui.refreshBar('title'); window.forkwood.hub.refresh('title'); window.forkwood.hub.home.render(true); } });
  // CONTEST=1 previews contest mode (the gameplay stream hides Shop/Pass/League): only the menu look is checked here
  if (process.env.CONTEST) await p.evaluate(() => { for (const k of ['shop', 'pass', 'league']) { const b = document.querySelector(`#tabbar [data-hub="${k}"]`); if (b) b.hidden = true; } });
  await p.waitForTimeout(+process.env.WAIT || 4500);
  await p.waitForFunction(() => !document.querySelector('#title.fresh'), null, { timeout: 20000 }).catch(() => {});
  const audit = await p.evaluate(() => {
    const out = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && !el.closest('[hidden]'); };
    const roots = [...document.querySelectorAll('#title, .metabar, #tabbar')].filter(vis);
    const W = innerWidth, H = innerHeight;
    // 1. text clipped: scrollWidth > clientWidth on text-bearing leaves, or off-screen
    for (const root of roots) for (const el of root.querySelectorAll('*')) {
      if (!vis(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || el.matches('.qn.new') || parseFloat(getComputedStyle(el).fontSize) < 1) continue; // .qn.new is a deliberate dot
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible') out.push(`clip-x ${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
      if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.push(`offscreen ${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 30)}"`);
    }
    // 2. overlapping interactive elements
    const btns = roots.flatMap((r) => [...r.querySelectorAll('button, a, [role=tab]')]).filter(vis).filter((b) => !b.parentElement.closest('button'));
    for (const b of btns) { const r = b.getBoundingClientRect(); if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.push(`offscreen button ${b.id || b.className}`); }
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].getBoundingClientRect(), b = btns[j].getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 4 && oy > 4) out.push(`overlap ${btns[i].id || btns[i].className} × ${btns[j].id || btns[j].className} (${Math.round(ox)}×${Math.round(oy)})`);
    }
    return out;
  });
  await p.screenshot({ timeout: 90000, path: `${OUT}/${TAG}-${name}.png` });
  console.log(name, audit.length ? '\n  ' + audit.join('\n  ') : 'clean');
  bad += audit.length;
  await ctx.close();
}
await browser.close(); server.kill();
console.log(errs.length ? 'page errors:\n' + errs.join('\n') : 'no page errors');
process.exit(bad || errs.length ? 1 : 0);
