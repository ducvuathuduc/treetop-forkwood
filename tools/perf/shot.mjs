// quick screenshot helper: node tools/perf/shot.mjs <query> <w> <h> <dpr> <out.png> [waitMs] [js]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const [q, w, h, dpr, out, wait = 2500, js = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('console', m.type(), m.text()); });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${process.env.PORT || 8199}/${q}`);
await p.waitForTimeout(+wait);
if (js) { console.log('js=>', JSON.stringify(await p.evaluate(js))); await p.waitForTimeout(800); }
console.log(JSON.stringify(await p.evaluate(() => window.forkwood && window.forkwood.perf)));
await p.screenshot({ path: out });
await b.close();
