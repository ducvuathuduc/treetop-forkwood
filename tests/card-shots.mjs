// V3.2-CARD: sample postcards from different run shapes and worlds (both sizes, EN + VI),
// plus the commit graph/poet sanity checks. Usage: node tests/card-shots.mjs [outDir]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const PORT = +process.env.PORT || 8163;
const OUT = process.argv[2] || new URL('./out/cards/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const browser = await chromium.launch();
// shapes: [name, world, seed, seconds of fast-forward, bot skill, lang, newBest]
const SHAPES = (process.env.SHAPES ? JSON.parse(process.env.SHAPES) : [
  ['short-meadow', 'meadow', 11, 6, 0.55, 'en', false],
  ['mid-starry-vi', 'starry', 4242, 38, 0.7, 'vi', true],
  ['pruned-lilies', 'lilies', 909, 60, 0.35, 'en', false],
  ['long-lacquer', 'lacquer', 777, 95, 0.9, 'en', true],
  ['storm-ukiyo-vi', 'ukiyo', 31337, 70, 0.8, 'vi', false],
]);
const report = [];
for (const [name, world, seed, secs, skill, lang, newBest] of SHAPES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || /card/.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.addInitScript((l) => { try { localStorage.setItem('forkwood.lang', l); } catch {} }, lang);
  await page.goto(`http://localhost:${PORT}/?bot=1&seed=${seed}&world=${world}`);
  await sleep(1200);
  await page.evaluate(() => window.forkwood.start());
  await sleep(300);
  // play the first stretch through the real path (forks, merges, hits), then fast-forward with the bot
  await page.evaluate(([sec, sk]) => {
    window.forkwood.setBotSkill(sk);
    const real = sk < 0.75 ? sec : Math.min(sec, 20);
    for (let i = 0; i < real * 4; i++) { window.forkwood.advance(0.25, 'bot'); if (window.forkwood.sim.dead) break; }
    if (sec > real && !window.forkwood.sim.dead) window.forkwood.fastForward(sec - real, sk);
  }, [secs, skill]);
  await page.evaluate(() => window.forkwood.killNow());
  for (let i = 0; i < 80 && (await page.evaluate(() => window.forkwood.mode)) !== 'over'; i++) { await page.evaluate(() => window.forkwood.advance(0.1, 'bot')); await sleep(40); }
  for (let i = 0; i < 40 && !(await page.evaluate(() => (document.getElementById('card-img').src || '').startsWith('data:image/png'))); i++) await sleep(150); // stamps chunk + painting
  const res = await page.evaluate(async ([world, seed, newBest, lang]) => {
    const SH = await import('/src/share.js');
    await SH.loadStamps(); await SH.preloadPainting(world);
    const s = window.forkwood.sim, sum = window.forkwood.summary();
    const meta = { world, seed, newBest, url: 'ducvuathuduc.github.io/forkwood', lang };
    const st = SH.cardStory(s, sum, meta);
    const cards = SH.renderCards(s, sum, meta);
    const other = SH.renderCard(s, sum, { ...meta, lang: lang === 'vi' ? 'en' : 'vi' });
    const img = document.getElementById('card-img');
    return {
      sum: { height: sum.height, forks: sum.forks, merges: sum.merges, reverts: sum.reverts, end: sum.end, hash: sum.hash },
      hist: { branches: st.H.branches.length, forks: st.H.forks, merges: st.H.merges, deaths: st.H.deaths.length, sun: st.H.sun, top: Math.round(st.H.top), storms: st.H.storms.length },
      poem: st.poem.text, name: st.poem.name,
      portrait: cards.portrait.toDataURL('image/png'), wide: cards.wide.toDataURL('image/png'), other: other.toDataURL('image/png'),
      ingame: img && img.src.startsWith('data:image/png') ? img.src : null,
      size: [cards.portrait.width, cards.portrait.height, cards.wide.width, cards.wide.height],
    };
  }, [world, seed, newBest, lang]);
  for (const k of ['portrait', 'wide', 'other']) writeFileSync(`${OUT}${name}-${k}.png`, Buffer.from(res[k].split(',')[1], 'base64'));
  if (res.ingame) writeFileSync(`${OUT}${name}-ingame.png`, Buffer.from(res.ingame.split(',')[1], 'base64')); else errors.push(`[${name}] in-game card missing`);
  if (res.size.join() !== '1080,1350,1200,630') errors.push(`[${name}] bad sizes ${res.size}`);
  if (res.hist.forks !== res.sum.forks) errors.push(`[${name}] graph forks ${res.hist.forks} != sim ${res.sum.forks}`);
  if (res.hist.merges !== res.sum.merges) errors.push(`[${name}] graph merges ${res.hist.merges} != sim ${res.sum.merges}`);
  if (res.hist.deaths !== res.sum.reverts) errors.push(`[${name}] graph deaths ${res.hist.deaths} != sim reverts ${res.sum.reverts}`);
  delete res.portrait; delete res.wide; delete res.other; delete res.ingame;
  report.push({ name, world, lang, ...res });
  console.log(name, JSON.stringify(res));
  await ctx.close();
}
await browser.close();
server.kill();
writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
if (errors.length) { console.error('ERRORS\n' + errors.join('\n')); process.exit(1); }
console.log('card-shots OK ->', OUT);
