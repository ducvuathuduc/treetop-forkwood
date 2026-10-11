// Pass 5 browser checks: first-launch story → first run (no menu), returning
// players go to the title, replay from the title, reduced motion, the Grove
// tabs, the duel link round trip between two devices, and phone layout.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { BEATS, BEAT_MS } from '../src/intro.js';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const PORT = 8190 + Math.floor(Math.random() * 300);
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = process.env.URL ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } } // P7-UI: wait for the server, not a fixed 800 ms
const base = process.env.URL || `http://localhost:${PORT}/`;
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const browser = await chromium.launch();
const errs = [];
async function ctxPage(opts, name) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${name}] ${m.text()}`); });
  p.on('pageerror', (e) => errs.push(`[${name}] pageerror ${e.message}`));
  return { ctx, p };
}
const fw = (p, fn, arg) => p.evaluate(fn, arg);

ok(BEATS.length >= 3 && BEATS.length * BEAT_MS <= 30000, `story is ${BEATS.length} beats, ${(BEATS.length * BEAT_MS / 1000).toFixed(1)} s if left alone (≤ 30 s)`);

// 1. first launch: story, tap to advance, skip → straight into the tutorial run
{
  const { ctx, p } = await ctxPage({ viewport: { width: 1280, height: 800 } }, 'first');
  await p.goto(base + '?intro=1'); await p.waitForTimeout(1200);
  ok(await p.isVisible('#intro'), 'first launch shows the story');
  ok(!(await p.isVisible('#title .title-card')) && !(await p.isVisible('#metabar')), 'no menu behind the story');
  const t1 = await p.textContent('.intro-text');
  await p.mouse.click(640, 400); await p.waitForTimeout(500);
  const t2 = await p.textContent('.intro-text');
  ok(t1 !== t2 && t2 === BEATS[1].text, 'a tap advances to the next beat');
  const loaded = await fw(p, () => [...document.querySelectorAll('#intro .plate img')].filter((i) => i.complete && i.naturalWidth > 0).length);
  ok(loaded >= 2, `story plates load (${loaded}/${BEATS.length})`);
  await p.screenshot({ path: OUT + 'intro-01-desktop.png' });
  await p.click('.intro-skip'); await p.waitForTimeout(900);
  const st = await fw(p, () => ({ mode: window.forkwood.mode, coach: window.forkwood.coach, seen: window.forkwood.save.ret.introSeen, saved: JSON.parse(localStorage.getItem('forkwood.save.v2')).ret.introSeen, end: window.forkwood.introEnd }));
  ok(st.mode === 'play' && st.coach === 'steer', `skip flows straight into the first run with the coach (mode ${st.mode}, coach ${st.coach})`);
  ok(st.seen && st.saved && st.end === 'skip', 'story marked as seen and saved');
  ok(!(await p.isVisible('#intro')), 'story overlay removed');
  // first death → result card → menu
  await fw(p, () => { window.forkwood.killNow(); });
  for (let i = 0; i < 60 && (await fw(p, () => window.forkwood.mode)) !== 'over'; i++) { await fw(p, () => window.forkwood.advance(0.1, 'bot')); await p.waitForTimeout(50); }
  await p.waitForTimeout(400);
  ok((await fw(p, () => window.forkwood.mode)) === 'over', 'first death shows the result card');
  await p.click('#btn-menu'); await p.waitForTimeout(500);
  ok((await fw(p, () => window.forkwood.mode)) === 'title' && await p.isVisible('#title .title-card') && await p.isVisible('#metabar'), 'then the main menu, with the wallet and the Grove chip');
  // returning: reload goes to the title, no story
  await p.goto(base + '?intro=1'); await p.waitForTimeout(1200);
  ok(!(await p.isVisible('#intro')) && (await fw(p, () => window.forkwood.mode)) === 'title', 'returning player goes to the menu, not the story');
  // replay from the title, Escape returns to the title
  await p.click('#btn-story'); await p.waitForTimeout(700);
  ok(await p.isVisible('#intro'), 'Story button replays the story');
  await p.keyboard.press('Escape'); await p.waitForTimeout(700);
  ok(!(await p.isVisible('#intro')) && (await fw(p, () => window.forkwood.mode)) === 'title' && await p.isVisible('#title .title-card'), 'Escape skips the replay back to the menu');
  await ctx.close();
}

// 2. old v0.6 player (runs, no retention block): no story, migration kept
{
  const { ctx, p } = await ctxPage({ viewport: { width: 1280, height: 800 } }, 'old');
  await p.goto(base); await p.waitForTimeout(300);
  await fw(p, () => { const S = window.forkwood.meta.freshSave(); delete S.ret; S.stats.runs = 9; S.acorns = 321; localStorage.setItem('forkwood.save.v2', JSON.stringify(S)); });
  await p.goto(base + '?intro=1'); await p.waitForTimeout(1200);
  const s = await fw(p, () => ({ mode: window.forkwood.mode, acorns: window.forkwood.save.acorns, ret: !!window.forkwood.save.ret, intro: !!document.getElementById('intro') }));
  ok(!s.intro && s.mode === 'title' && s.acorns === 321 && s.ret, 'a v0.6 save skips the story, keeps its acorns and gains the new block');
  await ctx.close();
}

// 3. reduced motion: calm story (no slow zoom)
{
  const { ctx, p } = await ctxPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, 'calm');
  await p.goto(base + '?intro=1'); await p.waitForTimeout(1000);
  const a = await fw(p, () => ({ calm: document.getElementById('intro').classList.contains('calm'), anim: getComputedStyle(document.querySelector('#intro .plate.on img')).animationName }));
  ok(a.calm && a.anim === 'none', `reduced motion: calm story, no zoom (animation ${a.anim})`);
  await ctx.close();
}

// 4. Grove tabs and duel round trip between two devices
let code = null;
{
  const { ctx, p } = await ctxPage({ viewport: { width: 1280, height: 800 } }, 'sender');
  await p.goto(base + '?seed=777'); await p.waitForTimeout(300);
  await fw(p, () => { const S = window.forkwood.meta.freshSave(); S.stats.runs = 3; S.ret.introSeen = true; S.ret.name = 'Ana'; localStorage.setItem('forkwood.save.v2', JSON.stringify(S)); });
  await p.goto(base); await p.waitForTimeout(1200);
  await fw(p, () => window.forkwood.gui.show('streak')); await p.waitForTimeout(800);
  for (const t of ['streak', 'season', 'league', 'duels', 'profile']) {
    await fw(p, (t) => window.forkwood.gui.show(t), t); await p.waitForTimeout(300);
    const html = await fw(p, () => document.querySelector('#grove .grove-body').innerHTML.length);
    ok(html > 200, `Grove ${t} tab renders (${html} chars)`);
  }
  await fw(p, () => window.forkwood.gui.show('league')); await p.waitForTimeout(300);
  ok((await p.textContent('#grove .honest')).includes('not live players'), 'league says its rivals are simulated');
  await fw(p, () => window.forkwood.gui.hide());
  await fw(p, () => { window.forkwood.start(); window.forkwood.advance(20, 'bot'); window.forkwood.killNow(); });
  for (let i = 0; i < 60 && (await fw(p, () => window.forkwood.mode)) !== 'over'; i++) { await fw(p, () => window.forkwood.advance(0.1, 'bot')); await p.waitForTimeout(50); }
  await p.waitForTimeout(400);
  const url = await fw(p, () => window.forkwood.duelUrl());
  code = new URL(url).searchParams.get('duel');
  const sent = await fw(p, () => window.forkwood.save.ret.duels.sent.length);
  ok(code && sent === 1, 'Duel button makes a duel link and remembers it');
  const d = await fw(p, (c) => window.forkwood.retention.decodeDuel(c), code);
  const sim = await fw(p, () => ({ seed: window.forkwood.sim.seed, h: window.forkwood.summary().height }));
  ok(d && d.seed === sim.seed && d.h === sim.h && d.n === 'Ana', 'the link carries the course, height and name');
  // device B races it
  const B = await ctxPage({ ...devices['iPhone 13'] }, 'racer');
  await B.p.goto(base); await B.p.waitForTimeout(300);
  await fw(B.p, () => { const S = window.forkwood.meta.freshSave(); S.stats.runs = 2; S.ret.introSeen = true; S.ret.name = 'Bo'; localStorage.setItem('forkwood.save.v2', JSON.stringify(S)); });
  await B.p.goto(base + '?duel=' + code); await B.p.waitForTimeout(1300);
  ok((await B.p.textContent('#challenge')).includes('Ana challenged you to a duel'), 'recipient sees who challenged them and the target');
  await B.p.screenshot({ path: OUT + 'duel-01-invite-phone.png' });
  await B.p.tap('#btn-play'); await B.p.waitForTimeout(300);
  const st = await fw(B.p, () => ({ seed: window.forkwood.sim.seed, pure: window.forkwood.sim.pure, charm: window.forkwood.sim.charm }));
  ok(st.seed === d.seed && !st.charm, 'recipient grows the same course, with no charm');
  await fw(B.p, () => window.forkwood.advance(6, 'bot'));
  await fw(B.p, () => { window.forkwood.sim.sap = 999; window.forkwood.advance(10, 'bot'); });
  await B.p.screenshot({ path: OUT + 'duel-02-rival-tip-phone.png' });
  await fw(B.p, () => window.forkwood.killNow());
  for (let i = 0; i < 60 && (await fw(B.p, () => window.forkwood.mode)) !== 'over'; i++) { await fw(B.p, () => window.forkwood.advance(0.1, 'bot')); await B.p.waitForTimeout(50); }
  await B.p.waitForTimeout(500);
  const done = await fw(B.p, () => window.forkwood.save.ret.duels.done);
  ok(done.length === 1 && done[0].as === 'racer', 'racing the duel settles it on the racer\u2019s device');
  const stamps = await B.p.textContent('#rw-stamps');
  ok(/Duel (won|played)/.test(stamps), 'the result card stamps the duel');
  const answer = await fw(B.p, () => window.forkwood.duelUrl());
  const ad = await fw(B.p, (c) => window.forkwood.retention.decodeDuel(new URL(c).searchParams.get('duel')), answer);
  ok(ad && ad.r === d.id && ad.rh === d.h, 'the answer link points back at the original duel');
  await B.ctx.close();
  // device A opens the answer
  const a0 = await fw(p, () => window.forkwood.save.acorns);
  await p.goto(answer); await p.waitForTimeout(1500);
  const a1 = await fw(p, () => ({ acorns: window.forkwood.save.acorns, sent: window.forkwood.save.ret.duels.sent[0] }));
  ok(a1.sent.res && a1.acorns > a0, `opening the answer settles the sender's duel (${a1.sent.res}, +${a1.acorns - a0})`);
  await p.goto(answer); await p.waitForTimeout(1200);
  const a2 = await fw(p, () => window.forkwood.save.acorns);
  ok(a2 === a1.acorns, 'opening it again pays nothing more');
  await ctx.close();
}

// 5. phones: the metabar (with the Grove chip) fits, the Grove book fits
for (const [name, opts] of [['iphone13', { ...devices['iPhone 13'] }], ['small', { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const { ctx, p } = await ctxPage(opts, name);
  await p.goto(base); await p.waitForTimeout(300);
  await fw(p, () => { const S = window.forkwood.meta.freshSave(); S.stats.runs = 4; S.acorns = 12345; S.ret.introSeen = true; S.streak.count = 12; localStorage.setItem('forkwood.save.v2', JSON.stringify(S)); });
  await p.goto(base); await p.waitForTimeout(1200);
  const m = await fw(p, () => { const r = [...document.querySelectorAll('#metabar > button:not([hidden])')].map((b) => b.getBoundingClientRect()); const mute = document.getElementById('btn-mute').getBoundingClientRect(); return { right: Math.max(...r.map((x) => x.right)), w: innerWidth, overlap: r.some((x) => x.right > mute.left - 2 && x.top < mute.bottom) }; });
  ok(m.right <= m.w && !m.overlap, `${name}: metabar fits beside the mute button (right ${m.right.toFixed(0)} / ${m.w})`);
  await fw(p, () => window.forkwood.gui.show('profile')); await p.waitForTimeout(700);
  const g = await fw(p, () => { const b = document.querySelector('#grove .grove-panel').getBoundingClientRect(); const body = document.querySelector('#grove .grove-body'); return { w: b.width, vw: innerWidth, ov: body.scrollWidth - body.clientWidth }; });
  ok(g.w <= g.vw && g.ov <= 1, `${name}: Grove fits the screen (panel ${g.w.toFixed(0)} / ${g.vw}, sideways ${g.ov}px)`);
  await p.screenshot({ path: OUT + `grove-${name}-profile.png` });
  await ctx.close();
}

ok(errs.length === 0, 'no console errors or warnings ' + errs.slice(0, 5).join(' | '));
console.log(fails ? `\n${fails} FAILED` : '\nintro, grove and duel checks OK');
await browser.close();
if (server) server.kill();
process.exit(fails ? 1 : 0);
