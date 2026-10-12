// First-load bytes on the WebGL path (iPhone-sized viewport): raw and gzip-estimated (what GitHub
// Pages transfers for text: JS/CSS/HTML/JSON; images and fonts counted as-is). PORT=8199 node tools/perf/first-load.mjs [query]
import { createRequire } from 'module';
import { gzipSync } from 'zlib';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const q = process.argv[2] || '?gfx=gl';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const rows = [];
p.on('response', async (r) => { try { const body = await r.body(); const ct = r.headers()['content-type'] || ''; const text = /javascript|css|html|json|svg/.test(ct) || /\.(m?js|css|html|json)$/.test(r.url()); rows.push({ url: r.url().replace(/^https?:\/\/[^/]+\//, ''), raw: body.length, gz: text ? gzipSync(body, { level: 9 }).length : body.length }); } catch { /* redirect */ } });
await p.goto(`http://localhost:${process.env.PORT || 8199}/${q}`);
await p.waitForTimeout(+(process.env.WAIT || 9000));
// count every resource the page fetched, sized from disk (response bodies of big modules can be missed)
import('fs').then(() => {});
const { readFileSync, existsSync } = await import('fs');
const ROOT = new URL('../..', import.meta.url).pathname;
const urls = await p.evaluate(() => [location.pathname, ...performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname)]);
rows.length = 0;
for (const u of new Set(urls)) {
  const f = ROOT + decodeURIComponent(u.replace(/^\//, '')) + (u.endsWith('/') ? 'index.html' : '');
  if (!existsSync(f)) continue;
  const body = readFileSync(f); const text = /\.(m?js|css|html|json|svg)$/.test(f);
  rows.push({ url: u, raw: body.length, gz: text ? gzipSync(body, { level: 9 }).length : body.length });
}
const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
rows.sort((a, b) => b.gz - a.gz);
console.log(JSON.stringify({ q, renderer: await p.evaluate(() => window.forkwood.perf.renderer), files: rows.length, rawKB: Math.round(sum('raw') / 1024), gzKB: Math.round(sum('gz') / 1024), top: rows.slice(0, 12).map((r) => `${r.url} ${Math.round(r.gz / 1024)}KB`) }, null, 1));
await b.close();
