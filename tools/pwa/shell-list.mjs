// 1.0 PWA: list the same-origin files a phone fetches on a cold first load of Home (index, css, core JS,
// fonts, first-world art). Writes tools/pwa/shell.json, which tools/pwa/build-sw.mjs bakes into sw.js.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ROOT = new URL('../..', import.meta.url).pathname, PORT = +(process.env.PORT || 8941);
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const b = await chromium.launch();
const seen = new Set();
for (const vp of [{ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, { width: 1440, height: 900 }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, ...vp });
  const p = await ctx.newPage();
  p.on('request', (r) => { const u = new URL(r.url()); if (u.host === `localhost:${PORT}`) seen.add(u.pathname.replace(/^\//, '') || './'); });
  await p.goto(`http://localhost:${PORT}/?nosw`); await p.waitForTimeout(7000); await ctx.close();
}
await b.close(); server.kill();
const list = [...seen].filter((x) => !/^(tests|tools|art-src|docs)\//.test(x) && !/\.md$/.test(x)).map((x) => (x === 'index.html' ? './' : x)).sort();
writeFileSync(new URL('./shell.json', import.meta.url), JSON.stringify([...new Set(['./', ...list])], null, 1));
console.log(list.length, 'files');
