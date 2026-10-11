// Quest map, modes, stakes and level flow in headless Chromium: the map opens
// from the title, levels lock and unlock, a level is played to its finish
// ribbon and awards stars, the over screen offers the next level, Sprint shows
// its clock, Looking-glass mirrors steering, phone layouts do not overflow,
// no console errors. Screenshots go to tests/out/.
// usage: node tests/quest-ui.mjs   (URL=... to test a deployed copy)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const PORT = +process.env.PORT || 8151;
const ROOT = new URL('..', import.meta.url).pathname;
const server = process.env.URL ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } } // P7-UI: wait for the server, not a fixed 800 ms
const base = process.env.URL || `http://localhost:${PORT}/`;
const OUT = ROOT + 'tests/out/';
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const px = process.env.URL && (process.env.HTTPS_PROXY || process.env.https_proxy);
let proxy;
if (px) { const u = new URL(px); proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined }; }
const browser = await chromium.launch(proxy ? { proxy } : {});
const allErrs = [];
const DESK = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SMALL = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function open(opts, query = '') {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('fw-keep')) { localStorage.clear(); sessionStorage.setItem('fw-keep', '1'); } } catch { /* */ } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') allErrs.push(m.text()); });
  p.on('pageerror', (e) => allErrs.push(e.message));
  await p.goto(base + query);
  await p.waitForTimeout(1700);
  return { ctx, p };
}
const fw = (p, fn, arg) => p.evaluate(fn, arg);
async function finishRun(p, maxSec = 120) {
  // play with the expert bot through the real gameplay path, then wait for the card
  await fw(p, () => window.forkwood.setBotSkill(0.95));
  for (let i = 0; i < maxSec / 10; i++) {
    const st = await fw(p, () => { window.forkwood.advance(10, 'bot'); return { mode: window.forkwood.mode, dead: window.forkwood.sim.dead }; });
    if (st.dead) break;
  }
  for (let i = 0; i < 40 && (await fw(p, () => window.forkwood.mode)) !== 'over'; i++) await p.waitForTimeout(150);
  await p.waitForTimeout(1600);
}
async function overflow(p) {
  return fw(p, () => {
    const bad = [];
    for (const el of document.querySelectorAll('#questmap.show *, #over.show *, #title.show *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('.rw-stamps')) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right));
    }
    return bad.slice(0, 5);
  });
}

// ---------------------------------------------------------------- desktop: map, level, next
{
  const { p } = await open(DESK);
  ok(await p.isVisible('#btn-quest'), 'title shows the Quest map button on first visit');
  ok(await p.isHidden('#btn-stake'), 'stake chip hidden until a second stake is open');
  await p.screenshot({ path: OUT + 'q01-title-desktop.png' });
  await p.click('#btn-quest');
  await p.waitForTimeout(600);
  ok(await p.isVisible('#questmap'), 'quest map opens');
  const locks = await fw(p, () => [...document.querySelectorAll('.lnode')].map((n) => n.classList.contains('locked')));
  ok(locks.length === 20 && !locks[0] && locks.slice(1).every(Boolean), `only 1-1 is open at first (${locks.map((l, i) => l ? '' : i).filter((x) => x !== '').join(',')} open)`);
  await p.click('[data-lvl="1-1"]');
  await p.waitForTimeout(500);
  ok(await p.isVisible('.lvl-sheet'), 'level sheet shows goals');
  await p.screenshot({ path: OUT + 'q02-map-desktop.png' });
  await p.click('[data-play-lvl="1-1"]');
  await p.waitForTimeout(400);
  const r = await fw(p, () => ({ mode: window.forkwood.mode, lvl: window.forkwood.run.level, fin: window.forkwood.sim.finishM }));
  ok(r.mode === 'play' && r.lvl === '1-1' && r.fin > 50, `level 1-1 starts with a finish at ${r.fin} m`);
  await fw(p, () => window.forkwood.advance(6, 'bot'));
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + 'q03-level-play-desktop.png' });
  await finishRun(p);
  const o = await fw(p, () => ({ mode: window.forkwood.mode, won: window.forkwood.sim.won, stars: window.forkwood.save.quest.stars['1-1'] || 0, next: !document.getElementById('btn-next').hidden, kicker: document.getElementById('over-kicker').textContent }));
  ok(o.mode === 'over' && o.won && o.stars >= 1, `1-1 cleared with ${o.stars} star(s): "${o.kicker}"`);
  ok(o.next, 'over screen offers the next level');
  await p.screenshot({ path: OUT + 'q04-level-clear-desktop.png' });
  await p.click('#btn-next');
  await p.waitForTimeout(400);
  ok((await fw(p, () => window.forkwood.run.level)) === '1-2', 'Next plays level 1-2');
  // persistence
  await p.reload(); await p.waitForTimeout(1500);
  ok((await fw(p, () => window.forkwood.save.quest.stars['1-1'] || 0)) >= 1, 'stars survive a reload');
  // modes tab, unlock via progress injection
  await fw(p, () => { const S = window.forkwood.save; S.best.height = 700; S.stats.runs = 12; for (const id of ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2']) { S.quest.stars[id] = 3; S.quest.marks[id] = 7; } S.quest.stars['2-3'] = 1; S.quest.marks['2-3'] = 1; });
  await fw(p, () => window.forkwood.reloadSave && 0);
  await fw(p, () => { localStorage.setItem('forkwood.save.v2', JSON.stringify(window.forkwood.save)); });
  await p.reload(); await p.waitForTimeout(1500);
  ok(await p.isVisible('#btn-stake'), 'stake chip appears once Oak is open');
  await p.screenshot({ path: OUT + 'q05-title-stakes-desktop.png' });
  await p.click('#btn-quest'); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + 'q06-map-progress-desktop.png' });
  await p.click('[data-qtab="modes"]'); await p.waitForTimeout(500);
  const modes = await fw(p, () => [...document.querySelectorAll('.mode')].map((m) => !m.classList.contains('locked')));
  ok(modes.filter(Boolean).length >= 5, `modes unlocked by progress: ${modes.filter(Boolean).length}/7`);
  await p.screenshot({ path: OUT + 'q07-modes-desktop.png' });
  // sprint shows a clock and ends on time
  await p.click('[data-play-mode="sprint"]'); await p.waitForTimeout(300);
  await fw(p, () => window.forkwood.advance(8, 'bot'));
  await p.waitForTimeout(200);
  ok((await fw(p, () => window.forkwood.sim.R.timeLimit)) === 60, 'sprint runs with a 60 s clock');
  await p.screenshot({ path: OUT + 'q08-sprint-desktop.png' });
  // mirror: steering right goes left
  await fw(p, () => window.forkwood.startMode('mirror'));
  await p.waitForTimeout(300);
  await p.mouse.move(1100, 400); await p.waitForTimeout(600);
  const cx = await fw(p, () => window.forkwood.sim.cx);
  ok(cx < 280, `looking-glass: mouse on the right steers left (cx ${Math.round(cx)})`);
  // storm crown level with storm
  await fw(p, () => window.forkwood.startLevel('4-1'));
  await fw(p, () => window.forkwood.advance(7, 'bot'));
  await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + 'q09-level-storm-desktop.png' });
  await fw(p, () => window.forkwood.startLevel('5-2'));
  await fw(p, () => window.forkwood.advance(9, 'bot'));
  await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + 'q10-level-starlight-desktop.png' });
  await p.context().close();
}

// ---------------------------------------------------------------- phones
for (const [tag, vp] of [['phone', PHONE], ['small', SMALL]]) {
  const { p } = await open(vp);
  await fw(p, () => { const S = window.forkwood.save; S.stats.runs = 4; S.best.height = 420; for (const id of ['1-1', '1-2', '1-3']) { S.quest.stars[id] = 2 + (id === '1-2'); S.quest.marks[id] = 3; } localStorage.setItem('forkwood.save.v2', JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(1600);
  await p.screenshot({ path: OUT + `q11-title-${tag}.png` });
  { const o = await overflow(p); ok(o.length === 0, `${tag}: title fits the screen ${JSON.stringify(o)}`); }
  await p.tap('#btn-quest'); await p.waitForTimeout(500);
  await p.tap('[data-lvl="1-4"]'); await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + `q12-map-${tag}.png` });
  ok((await overflow(p)).length === 0, `${tag}: map fits the screen ${JSON.stringify(await overflow(p))}`);
  await p.tap('[data-qtab="modes"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + `q13-modes-${tag}.png` });
  await p.tap('[data-qtab="map"]'); await p.waitForTimeout(300);
  await p.tap('[data-lvl="1-4"]'); await p.waitForTimeout(300);
  if (!(await p.isVisible('[data-play-lvl="1-4"]'))) await p.tap('[data-lvl="1-4"]');
  await p.tap('[data-play-lvl="1-4"]'); await p.waitForTimeout(300);
  await fw(p, () => window.forkwood.advance(9, 'bot'));
  await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + `q14-level-play-${tag}.png` });
  await finishRun(p);
  await p.screenshot({ path: OUT + `q15-level-over-${tag}.png` });
  { const o = await overflow(p); ok(o.length === 0, `${tag}: level over screen fits ${JSON.stringify(o)}`); }
  // sprint HUD on phone (clock + label must not collide with the score)
  await fw(p, () => window.forkwood.startMode('sprint'));
  await fw(p, () => window.forkwood.advance(52, 'bot'));
  await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + `q16-sprint-${tag}.png` });
  await p.context().close();
}

// ---------------------------------------------------------------- links
{
  const { p } = await open(DESK, '?lvl=1-2&beat=2500');
  const t = await p.textContent('#challenge');
  ok(/quest level 1-2/.test(t) && (await p.textContent('#btn-play-label')) === 'Take the challenge', 'level challenge link shows on the title');
  await p.click('#btn-play'); await p.waitForTimeout(300);
  ok((await fw(p, () => window.forkwood.run.level)) === '1-2', 'level challenge link plays that level');
  await p.context().close();
  const w = await open(DESK, '?week=2026-W41&beat=300');
  await w.p.click('#btn-play'); await w.p.waitForTimeout(300);
  const wr = await fw(w.p, () => ({ m: window.forkwood.run.mode, wk: window.forkwood.run.week, pure: window.forkwood.sim.pure, h: window.forkwood.sim.R.hazard }));
  ok(wr.m === 'weekly' && wr.wk === '2026-W41' && wr.pure && wr.h === 0.25, 'weekly link plays that week on Oak with no charms');
  await w.p.context().close();
}

await browser.close();
if (server) server.kill();
const errs = allErrs.filter((e) => !/favicon/.test(e));
ok(errs.length === 0, `no console errors (${errs.length})${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(fails.length ? `\n${fails.length} FAILED` : '\nquest UI OK');
process.exit(fails.length ? 1 : 0);
