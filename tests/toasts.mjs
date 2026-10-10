// Toasts (gift, badges, purchases) must never sit on a button, on the title or the game-over card.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8143;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
for (const [name, opts] of [['iphone13', devices['iPhone 13']], ['small', { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => localStorage.setItem('forkwood.save.v2', JSON.stringify({ v: 2, tutorial: true, level: 3, stats: { runs: 5 } })));
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/?seed=5`); await sleep(1500);
  for (const state of ['title', 'over']) {
    if (state === 'over') { await p.evaluate(() => window.forkwood.start(false)); await p.evaluate(() => window.forkwood.advance(8, 'bot')); await p.evaluate(() => window.forkwood.killNow()); for (let i = 0; i < 30 && (await p.evaluate(() => window.forkwood.mode)) !== 'over'; i++) await sleep(250); await sleep(900); }
    await p.evaluate(() => { const u = window.forkwood.ui; u.toast('Day 3 gift: +30 acorns and a frost guard', 'gift'); u.toast('Badge: Weathered +50', 'badge'); u.toast('Badge: Kindred grafts +40', 'badge'); });
    await sleep(600);
    const o = await p.evaluate(() => {
      const ts = [...document.querySelectorAll('.toast')].map((e) => e.getBoundingClientRect());
      const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && e.offsetParent !== null; };
      const targets = [...document.querySelectorAll('button, a.btn, .dock, #metabar')].filter(vis).filter((e) => !e.closest('#toasts'));
      let worst = 0, who = '';
      for (const t of ts) for (const e of targets) { const r = e.getBoundingClientRect(); const ox = Math.min(t.right, r.right) - Math.max(t.left, r.left), oy = Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top); if (ox > 0 && oy > 0 && ox * oy > worst) { worst = ox * oy; who = (e.id || e.className || e.textContent).toString().slice(0, 30); } }
      return { n: ts.length, worst: Math.round(worst), who, top: ts.length ? Math.round(ts[0].top) : 0 };
    });
    await p.screenshot({ path: new URL(`./out/toast-${name}-${state}.png`, import.meta.url).pathname });
    res.push({ name, state, ...o });
    await sleep(3800);
  }
  await ctx.close();
}
console.table(res);
await browser.close(); server.kill();
const bad = res.filter((r) => r.worst > 0);
console.log(bad.length ? `FAIL toasts overlap buttons: ${bad.map((b) => b.name + '/' + b.state + ':' + b.who).join(', ')}` : 'toasts clear of buttons OK');
process.exit(bad.length ? 1 : 0);
