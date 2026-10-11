// P8-MAPS: map themes. For every map: select it, play a little in the real game,
// render the backdrop at each height zone, reach game over and save the postcard
// (with its unique stamp). Also shoots the title chip and the carousel.
// Fails on any console error/warning. Screenshots -> SHOTS (default tests/out/maps).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8291;
const OUT = process.env.SHOTS || new URL('./out/maps/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const base = process.env.URL || `http://localhost:${PORT}/`;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const ONLY = process.env.MAPS ? process.env.MAPS.split(',') : null;
await ctx.addInitScript(() => { try { localStorage.setItem('forkwood.maps.owned', JSON.stringify(['arashiyama', 'redwoods', 'blackforest'])); } catch (e) {} });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const bytes = {};
page.on('response', async (r) => { try { const u = new URL(r.url()); const b = (await r.body()).length; bytes[u.pathname] = b; } catch (e) {} });
try {
  await page.goto(base + '?bot=1&seed=4242');
  await sleep(1800);
  const first = Object.values(bytes).reduce((a, b) => a + b, 0);
  console.log('first load top', JSON.stringify(Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, 12)));
  console.log('first load bytes', first, 'map plates fetched at boot:', Object.keys(bytes).filter((k) => k.includes('/m-')).join(',') || 'none');
  if (Object.keys(bytes).some((k) => /\/m-(far|side)-/.test(k))) errors.push('map plates loaded at boot for classic map');
  await page.screenshot({ path: OUT + 'maps-title.png' });
  // stamp gallery: every map's stamp + postmark on paper, 2x
  const gal = await page.evaluate(async () => {
    const ST = await import('./src/stamps.js'); const { MAPS } = await import('./src/maps.js');
    const c = document.createElement('canvas'); c.width = 4 * 300 + 40; c.height = 2 * 400 + 40; const g = c.getContext('2d');
    g.fillStyle = '#f1ece2'; g.fillRect(0, 0, c.width, c.height);
    MAPS.forEach((m, i) => { const x = 20 + (i % 4) * 300 + 150, y = 20 + Math.floor(i / 4) * 400 + 190; ST.drawStamp(g, m, x + 30, y - 10, 236, 300, { height: 412 + i * 97, rot: 0.035 }); ST.drawPostmark(g, m, x - 106, y + 62, 74, m.stamp.ink, { level: 12, printNo: 34 }); });
    return c.toDataURL('image/png');
  });
  writeFileSync(OUT + 'maps-stamps.png', Buffer.from(gal.split(',')[1], 'base64'));
  if (process.env.STAMPS_ONLY) throw 'done';
  // carousel
  if (!process.env.SKIP_UI) {
  await page.click('#btn-maps');
  await sleep(900);
  await page.screenshot({ path: OUT + 'maps-select.png' });
  await page.click('.maps-next'); await sleep(900);
  await page.click('.maps-next'); await sleep(900);
  await page.screenshot({ path: OUT + 'maps-select-2.png' });
  for (let i = 0; i < 3; i++) { await page.click('.maps-next'); await sleep(450); }
  await sleep(700);
  await page.screenshot({ path: OUT + 'maps-select-locked.png' });
  const goTxt = await page.textContent('.maps-go');
  if (!/Unlock/.test(goTxt)) errors.push('expected a locked map with an Unlock button, got: ' + goTxt);
  // econ hook event
  const ev = await page.evaluate(() => new Promise((res) => { window.addEventListener('forkwood:map-unlock', (e) => res(e.detail), { once: true }); document.querySelector('.maps-go').click(); setTimeout(() => res(null), 500); }));
  if (!ev || !ev.id || !ev.cost) errors.push('map-unlock event missing: ' + JSON.stringify(ev));
  // v1.0: the event opens the glass confirm; buy the map with acorns from the save
  await sleep(300);
  const dlg = await page.evaluate(() => { const d = document.getElementById('mapbuy'); return d && d.classList.contains('show') ? { short: document.querySelector('#mapbuy .mb-yes').disabled, name: document.querySelector('#mapbuy .mb-name').textContent } : null; });
  if (!dlg) errors.push('map unlock confirm did not open');
  await page.click('#mapbuy .mb-no'); await sleep(300);
  if (ev && ev.id) {
    await page.evaluate(() => { window.forkwood.save.acorns = 9000; });
    await page.click('.maps-go'); await sleep(400);
    await page.screenshot({ path: OUT + 'maps-unlock-confirm.png' });
    await page.click('#mapbuy .mb-yes'); await sleep(400);
    const after = await page.evaluate(async (id) => { const M = await import('./src/maps.js'); return { un: M.isUnlocked(id), sel: M.selectedId(), acorns: window.forkwood.save.acorns, owned: window.forkwood.save.econ.maps.slice(), stored: JSON.parse(localStorage.getItem('forkwood.save.v2') || '{}').econ?.maps || null }; }, ev.id);
    if (!after.un || after.sel !== ev.id || after.acorns !== 9000 - ev.cost || !after.owned.includes(ev.id)) errors.push('buying a map failed: ' + JSON.stringify(after));
    else console.log('bought', ev.id, 'for', ev.cost, '->', JSON.stringify(after));
  }
  await page.click('.maps-x'); await sleep(400);
  }
  const ids = await page.evaluate(async () => (await import('./src/maps.js')).MAPS.map((m) => m.id));
  for (const id of ids) {
    if (ONLY && !ONLY.includes(id)) continue;
    await page.evaluate(async (id) => { const M = await import('./src/maps.js'); M.grantMap(id); M.select(id); }, id);
    // wait for plates
    for (let i = 0; i < 60; i++) {
      const ok = await page.evaluate(async (id) => { const A = await import('./src/art.js'); const M = await import('./src/maps.js'); const n = M.plateNames(M.MAP[id]); return n.every((x) => A.art(x)); }, id);
      if (ok) break; await sleep(100);
    }
    // zones strip: the backdrop alone at five heights
    const strip = await page.evaluate(async () => {
      const { backdrop } = await import('./src/backdrop.js');
      const W = 390, H = 844, ms = [90, 320, 620, 1000, 1500];
      const out = document.createElement('canvas'); out.width = W * 5 + 16 * 4; out.height = H;
      const o = out.getContext('2d'); o.fillStyle = '#181a20'; o.fillRect(0, 0, out.width, H);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) { // twice: the first pass streams + washes plates
        backdrop.draw(g, W, H, { m: ms[i], camPx: ms[i] * 30, playL: 0, playR: W, t: 10 + i, calm: false });
        backdrop.drawPost(g, W, H, ms[i]);
        if (k) o.drawImage(c, i * (W + 16), 0);
        await new Promise((r) => setTimeout(r, k ? 0 : 120));
      }
      return out.toDataURL('image/jpeg', 0.85);
    });
    writeFileSync(OUT + `maps-${id}-zones.jpg`, Buffer.from(strip.split(',')[1], 'base64'));
    // play
    await page.evaluate(() => { if (window.forkwood.mode !== 'title') window.forkwood.toMenu && window.forkwood.toMenu(); });
    await page.evaluate(() => window.forkwood.start(false));
    await sleep(300);
    for (let i = 0; i < 300; i++) { const r = await page.evaluate(() => window.forkwood.advance(1 / 20, 'bot')); if (r.m > 140) break; }
    await page.evaluate(() => window.forkwood.advance(0.1, 'bot'));
    await sleep(250);
    await page.screenshot({ path: OUT + `maps-${id}-play.png` });
    await page.evaluate(() => window.forkwood.killNow());
    for (let i = 0; i < 80 && (await page.evaluate(() => window.forkwood.mode)) !== 'over'; i++) { await page.evaluate(() => window.forkwood.advance(0.1, 'bot')); await sleep(40); }
    await sleep(500);
    const data = await page.evaluate(() => document.getElementById('card-img').src);
    if (!data.startsWith('data:image/png')) errors.push(`[${id}] postcard missing`);
    else writeFileSync(OUT + `maps-${id}-stamp.png`, Buffer.from(data.split(',')[1], 'base64'));
    console.log(id, 'ok');
    await page.evaluate(() => window.forkwood.toMenu ? window.forkwood.toMenu() : null);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(200);
  }
  // sizes of the map plates actually fetched
  const per = {};
  for (const [k, b] of Object.entries(bytes)) { const m = k.match(/\/m-(sky|far|side)-(\w+)\.webp$/); if (m) per[m[2]] = (per[m[2]] || 0) + b; }
  console.log('map plate bytes', JSON.stringify(per));
  for (const [k, b] of Object.entries(per)) if (b > 46080) errors.push(`map ${k} plates ${b} B > 45 KB`);
} catch (e) { if (e !== 'done') errors.push('test failure: ' + (e.stack || e.message)); }
await browser.close();
server.kill();
if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
console.log('maps: all good, 0 console errors');
