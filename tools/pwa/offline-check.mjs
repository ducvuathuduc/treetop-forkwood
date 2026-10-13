// 1.0 PWA check: first visit installs the service worker, then an offline reload still boots the game.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ROOT = new URL('../..', import.meta.url).pathname, PORT = +(process.env.PORT || 8942);
// serve under a subpath like GitHub Pages: http://localhost:PORT/treetop-forkwood/
const server = spawn('python3', ['-c', `import http.server,functools,os,sys
os.chdir(${JSON.stringify(ROOT)}); os.makedirs('/tmp/fwsub',exist_ok=True)
p='/tmp/fwsub/treetop-forkwood'
os.path.islink(p) or os.symlink(${JSON.stringify(ROOT.replace(/\/$/, ''))},p)
http.server.test(functools.partial(http.server.SimpleHTTPRequestHandler,directory='/tmp/fwsub'),port=${PORT},bind='127.0.0.1')`], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const base = `http://127.0.0.1:${PORT}/treetop-forkwood/`;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(base);
const scope = await p.evaluate(() => new Promise((res) => { const t = setTimeout(() => res('timeout'), 20000); navigator.serviceWorker.ready.then((r) => { clearTimeout(t); res(r.scope); }); }));
await p.waitForTimeout(2500);
const manifest = await p.evaluate(() => fetch(document.querySelector('link[rel=manifest]').href).then((r) => r.json()).then((j) => j.name + '|' + j.display + '|' + j.icons.length));
const nCached = await p.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n; });
await ctx.setOffline(true);
await p.reload(); await p.waitForTimeout(5000);
const ok = await p.evaluate(() => !!(window.forkwood && document.getElementById('btn-play') && document.fonts.check('16px "FW UI"')));
const ctl = await p.evaluate(() => !!navigator.serviceWorker.controller);
console.log(JSON.stringify({ scope, manifest, nCached, offlineBoot: ok, controlled: ctl, errs: errs.slice(0, 5) }));
await p.screenshot({ path: '/tmp/fw-offline.png' });
await b.close(); server.kill();
