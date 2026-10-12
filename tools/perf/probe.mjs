// Dev probe: open the game in headless Chromium (swiftshader GL) and evaluate a JS snippet.
// URL=... W=390 H=844 DPR=3 WAIT=5000 node tools/perf/probe.mjs "<async js expression>"
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +(process.env.W || 390), height: +(process.env.H || 844) }, deviceScaleFactor: +(process.env.DPR || 3) });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
await p.goto(process.env.URL || 'http://localhost:8400/?gfx=gl&seed=4242');
await p.waitForTimeout(+(process.env.WAIT || 5000));
const code = process.argv[2] || 'JSON.stringify(window.forkwood.perf)';
console.log(await p.evaluate(`(async () => { return ${code}; })()`));
if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT, type: 'jpeg', quality: 80 });
await b.close();
