// P6 seasons: pure checks with injected local dates (edges included), then the title
// cards and the fairness rule in a real browser with ?season=<local ISO time>.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { active, applyRules, isFair, untilText, tetWindow, twinStorms, themeFor } from '../src/seasons.js';
import { createSim, step, RULES, STORMS } from '../src/sim.js';
import { rulesFor } from '../src/modes.js';

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const D = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0); // local clock, month 1-12
const ids = (d) => active(d).list.map((s) => s.id).sort().join(',');
const has = (d, id) => active(d).list.some((s) => s.id === id);

// ---------------- time of day (edges: 04:59 / 05:00 / 06:59 / 07:00 / 18:59 / 19:00)
ok(has(D(2026, 6, 10, 4, 59), 'night'), 'night at 04:59');
ok(!has(D(2026, 6, 10, 5, 0), 'night') && has(D(2026, 6, 10, 5, 0), 'dawn'), 'dawn (not night) at 05:00');
ok(has(D(2026, 6, 10, 6, 59), 'dawn'), 'dawn at 06:59');
ok(!has(D(2026, 6, 10, 7, 0), 'dawn') && !has(D(2026, 6, 10, 7, 0), 'night'), 'neither at 07:00');
ok(!has(D(2026, 6, 10, 18, 59), 'night'), 'no night at 18:59');
ok(has(D(2026, 6, 10, 19, 0), 'night'), 'night at 19:00');
ok(has(D(2026, 6, 10, 0, 0), 'night'), 'night at midnight');
// until: next 05:00 / 07:00
const nUntil = active(D(2026, 6, 10, 22, 0)).list.find((s) => s.id === 'night').until;
ok(+nUntil === +D(2026, 6, 11, 5, 0), 'night 22:00 open until tomorrow 05:00');
ok(+active(D(2026, 6, 10, 3, 0)).list.find((s) => s.id === 'night').until === +D(2026, 6, 10, 5, 0), 'night 03:00 until 05:00 same day');
ok(+active(D(2026, 6, 10, 5, 30)).list.find((s) => s.id === 'dawn').until === +D(2026, 6, 10, 7, 0), 'dawn until 07:00');
// month rollover for night (31 Dec 23:00 -> 1 Jan 05:00)
ok(+active(D(2026, 12, 31, 23, 0)).list.find((s) => s.id === 'night').until === +D(2027, 1, 1, 5, 0), 'night until crosses the year');

// ---------------- seasons (edges: 31 Aug / 1 Sep / 30 Nov / 1 Dec / 28-29 Feb / 1 Mar)
ok(!has(D(2026, 8, 31, 23, 59), 'autumn') && has(D(2026, 9, 1, 0, 0), 'autumn'), 'autumn starts 1 Sep');
ok(has(D(2026, 11, 30, 23, 59), 'autumn') && !has(D(2026, 12, 1, 0, 0), 'autumn'), 'autumn ends 1 Dec');
ok(has(D(2026, 12, 1, 0, 0), 'winter'), 'winter starts 1 Dec');
ok(+active(D(2026, 12, 15)).list.find((s) => s.id === 'winter').until === +D(2027, 3, 1, 0, 0), 'December winter until 1 Mar next year');
ok(has(D(2028, 2, 29, 23, 59), 'winter') && !has(D(2028, 3, 1, 0, 0), 'winter'), 'winter ends 1 Mar (leap year)');
ok(+active(D(2027, 1, 15)).list.find((s) => s.id === 'winter').until === +D(2027, 3, 1), 'January winter until 1 Mar');
ok(!has(D(2026, 6, 10), 'winter') && !has(D(2026, 6, 10), 'autumn'), 'June: no season');
ok(+active(D(2026, 10, 11)).list.find((s) => s.id === 'autumn').until === +D(2026, 12, 1), 'autumn until 1 Dec');

// ---------------- Tết table (2026-02-17, 2027-02-06, 2028-01-26; window -7 .. +7 days)
ok(!has(D(2026, 2, 9, 23, 59), 'tet') && has(D(2026, 2, 10, 0, 0), 'tet'), 'Tết 2026 opens 10 Feb');
ok(has(D(2026, 2, 24, 23, 59), 'tet') && !has(D(2026, 2, 25, 0, 0), 'tet'), 'Tết 2026 closes 25 Feb');
ok(has(D(2027, 1, 30), 'tet') && !has(D(2027, 1, 29, 23, 59), 'tet') && has(D(2027, 2, 13, 23), 'tet') && !has(D(2027, 2, 14), 'tet'), 'Tết 2027 window 30 Jan..13 Feb');
ok(has(D(2028, 1, 19), 'tet') && has(D(2028, 2, 2, 23), 'tet') && !has(D(2028, 2, 3), 'tet') && !has(D(2028, 1, 18, 23), 'tet'), 'Tết 2028 window 19 Jan..2 Feb');
ok(!has(D(2029, 2, 13), 'tet') && tetWindow(D(2029, 2, 13)) === null, 'no Tết outside the table');
ok(+active(D(2027, 2, 6)).list.find((s) => s.id === 'tet').until === +D(2027, 2, 14), 'Tết 2027 until 14 Feb');
ok(has(D(2027, 2, 6), 'winter') && has(D(2027, 2, 6), 'tet'), 'Tết and winter can stack');

// ---------------- weekend (Sat 00:00 .. Mon 00:00); 2026-10-10 is a Saturday
ok(!has(D(2026, 10, 9, 23, 59), 'storm') && has(D(2026, 10, 10, 0, 0), 'storm'), 'twin storm opens Saturday 00:00');
ok(has(D(2026, 10, 11, 23, 59), 'storm') && !has(D(2026, 10, 12, 0, 0), 'storm'), 'twin storm closes Monday 00:00');
ok(+active(D(2026, 10, 10, 9)).list.find((s) => s.id === 'storm').until === +D(2026, 10, 12), 'Saturday storm until Monday');
ok(+active(D(2026, 10, 11, 9)).list.find((s) => s.id === 'storm').until === +D(2026, 10, 12), 'Sunday storm until Monday');

// ---------------- determinism, theme, bad input
ok(JSON.stringify(active(D(2027, 2, 6, 20))) === JSON.stringify(active(D(2027, 2, 6, 20))), 'deterministic');
ok(ids(D(2027, 2, 6, 20)) === 'night,storm,tet,winter', 'Sat 6 Feb 2027 20:00 = night+winter+tet+storm: ' + ids(D(2027, 2, 6, 20)));
const th = active(D(2026, 10, 10, 20)).theme;
ok(th.tint && th.tint.color === '#141b3a' && th.particles.includes('fireflies') && th.particles.includes('leaves'), 'night tint wins, particles merge');
ok(th.palette && typeof th.palette.skyTop === 'string', 'palette object');
ok(th.backdrop && th.backdrop.tint === '#141b3a' && th.backdrop.zones.meadow && th.backdrop.zones.meadow.mid === '#c8762f', 'backdrop.setTheme shape {tint, amount, zones}');
ok(active(D(2026, 6, 10, 12)).theme.backdrop === null, 'no season -> backdrop.setTheme(null)');
ok(themeFor([]).tint === null && active(new Date('nope')).list.length === 0, 'empty theme / invalid date');

// ---------------- modifiers and fairness
const list = (d) => active(d).list;
const dawnSat = list(D(2026, 10, 10, 6)); // dawn + autumn + storm
const r1 = applyRules(rulesFor({ mode: 'classic', stake: 'sapling' }), dawnSat);
ok(Math.abs(r1.score - 1.5 * 1.25) < 1e-9, 'dawn ×1.5 and storm ×1.25 stack: ' + r1.score);
ok(r1.windK === 1.6 && r1.storms && r1.storms.length > STORMS.length, 'autumn wind + twin storms');
const r2 = applyRules(rulesFor({ mode: 'hardcore' }), dawnSat);
ok(Math.abs(r2.score - 2 * 1.875) < 1e-9, 'stacks on mode multiplier');
const fairR = applyRules({}, dawnSat, { fair: true });
ok(Object.keys(fairR).length === 0, 'fair: no modifiers at all');
for (const ctx of [{ daily: true }, { mode: 'weekly' }, { mode: 'race' }, { race: true }, { level: true }, { challenge: true }, { duel: true }])
  ok(isFair(ctx), 'fair ctx ' + JSON.stringify(ctx));
ok(!isFair({ mode: 'classic' }) && !isFair({ mode: 'zen' }), 'free play is not fair-locked');
const tw = twinStorms(STORMS);
ok(tw.every((s, i) => i === 0 || s.m >= tw[i - 1].m + tw[i - 1].len), 'twin storms never overlap');
const ws = applyRules({}, list(D(2026, 12, 20, 12)));
ok(ws.slip === 0.45, 'winter slip');
const nt = applyRules({}, list(D(2026, 6, 10, 21)));
ok(nt.fireflies === 1 && nt.score === undefined, 'night fireflies, no score change');
const tt = applyRules({}, list(D(2027, 2, 6, 12)));
ok(tt.envelopes === 1, 'Tết envelopes');

// ---------------- sim hooks: course unchanged, fireflies/envelopes appear, slip slows turning
const course = (rules) => { const s = createSim({ seed: 77, rules }); for (let i = 0; i < 600; i++) step(s, 1 / 60, { dir: 0 }); return s.chunkLog.map((c) => c.id).join(','); };
ok(course({}) === course({ fireflies: 1, envelopes: 1 }), 'fireflies/envelopes never shift the course');
{ const s = createSim({ seed: 77, rules: { fireflies: 1, envelopes: 1 } }); for (let i = 0; i < 1200; i++) step(s, 1 / 60, { dir: 0 }); s.motes.length; const all = s; ok(all.motes.some((o) => o.ff) || all.commits > 0, 'firefly motes spawn'); }
{ const a = createSim({ seed: 3 }), b = createSim({ seed: 3, rules: { slip: 0.45 } }); step(a, 1 / 60, { dir: 1 }); step(b, 1 / 60, { dir: 1 }); ok(b.heading < a.heading && b.heading > 0, 'slip slows the turn'); }
ok(RULES.slip === 0 && RULES.windK === 1 && RULES.fireflies === 0 && RULES.envelopes === 0, 'default rules are no-ops');

// ---------------- countdown text
ok(untilText(D(2026, 6, 11, 5), D(2026, 6, 10, 22, 0)) === 'open until Thu 05:00 · 7 h left', untilText(D(2026, 6, 11, 5), D(2026, 6, 10, 22, 0)));
ok(untilText(D(2026, 6, 10, 7), D(2026, 6, 10, 6, 30)) === 'open until 07:00 · 30 m left', untilText(D(2026, 6, 10, 7), D(2026, 6, 10, 6, 30)));
ok(untilText(D(2026, 12, 1), D(2026, 10, 11, 2)) === 'open until 1 Dec · 51 d left', untilText(D(2026, 12, 1), D(2026, 10, 11, 2)));
ok(/^open until 12 Oct · 21 h 59 m left$/.test(untilText(D(2026, 10, 12), D(2026, 10, 11, 2, 1))), untilText(D(2026, 10, 12), D(2026, 10, 11, 2, 1)));

console.log(`seasons pure: ${n - fails}/${n} OK`);

// ---------------- browser: title cards, fairness in real runs, 0 console errors
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = new URL('./out/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const PORT = 8600 + Math.floor(Math.random() * 300); // random: parallel worktrees serve on fixed ports
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const page = async (name, url, vp = { width: 1280, height: 800 }) => {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript(() => localStorage.setItem('forkwood.save.v2', JSON.stringify({ v: 2, tutorial: true, level: 3, stats: { runs: 5 } })));
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${name}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  await p.goto(`http://localhost:${PORT}/${url}`); await sleep(1700);
  return { p, ctx };
};
try {
  // Saturday 6 Feb 2027, 20:00 local: Firefly Night + Winter + Tết + Twin Storm
  const { p, ctx } = await page('desktop', '?seed=9&season=2027-02-06T20:00:00');
  const cards = await p.evaluate(() => [...document.querySelectorAll('#season-cards .season-card')].map((e) => ({ id: e.dataset.season, t: e.textContent, vis: e.getBoundingClientRect().height > 0 })));
  ok(cards.map((c) => c.id).sort().join(',') === 'night,storm,tet,winter', 'title shows 4 cards: ' + cards.map((c) => c.id));
  ok(cards.every((c) => c.vis && /open until .+ left/.test(c.t)), 'cards visible with countdown');
  // the season tint goes into the backdrop palette (canvas only), never a CSS layer over the HUD
  const bt = await p.evaluate(() => ({ th: window.forkwood.backdropTheme, css: !!document.getElementById('season-tint') }));
  ok(bt.th && bt.th.tint === '#141b3a' && !bt.css, 'season tint is in the backdrop palette, no CSS tint layer: ' + JSON.stringify(bt.th && bt.th.tint));
  await p.screenshot({ path: OUT + 'seasons-title-desktop.png' });
  // free play: modifiers on
  await p.evaluate(() => window.forkwood.startMode('classic'));
  const free = await p.evaluate(() => ({ R: window.forkwood.sim.R, run: window.forkwood.seasons.run.map((s) => s.id) }));
  ok(free.R.fireflies === 1 && free.R.slip === 0.45 && free.R.envelopes === 1 && Math.abs(free.R.score - 1.25) < 1e-9, 'free play gets modifiers: ' + JSON.stringify({ s: free.R.score, f: free.R.fireflies }));
  await p.evaluate(() => window.forkwood.advance(20, 'bot'));
  await p.screenshot({ path: OUT + 'seasons-play-desktop.png' });
  // daily: same for everyone
  await p.evaluate(() => window.forkwood.start(true));
  const dly = await p.evaluate(() => ({ R: window.forkwood.sim.R, run: window.forkwood.seasons.run.length }));
  ok(!dly.R.fireflies && !dly.R.slip && !dly.R.envelopes && dly.R.score === 1 && dly.R.windK === 1 && dly.run === 0, 'daily: no modifiers');
  await p.evaluate(() => window.forkwood.startMode('weekly'));
  const wk = await p.evaluate(() => window.forkwood.sim.R);
  ok(!wk.fireflies && !wk.slip && Math.abs(wk.score - 1.5) < 1e-9 && wk.storms === null, 'weekly: only its own Oak ×1.5, no seasons');
  await p.evaluate(() => window.forkwood.startLevel('1-1'));
  const lv = await p.evaluate(() => window.forkwood.sim.R);
  ok(!lv.fireflies && !lv.slip && !lv.envelopes, 'quest level: no modifiers');
  await ctx.close();
  // dawn on a phone; plus no ?season= in an automated browser -> no cards
  const ph = await page('phone', '?seed=9&season=2026-10-10T06:10:00', { width: 390, height: 844 });
  const pc = await ph.p.evaluate(() => [...document.querySelectorAll('#season-cards .season-card')].map((e) => e.dataset.season).sort().join(','));
  ok(pc === 'autumn,dawn,storm', 'phone dawn cards: ' + pc);
  await ph.p.screenshot({ path: OUT + 'seasons-title-phone.png' });
  await ph.ctx.close();
  // the title card (with 4 cards) stays on screen and clear of the dock
  for (const vp of [{ width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const f = await page('fit' + vp.width, '?seed=9&season=2027-02-06T20:00:00', vp);
    const r = await f.p.evaluate(() => { const c = document.querySelector('#title .title-card').getBoundingClientRect(); const d = document.getElementById('dock'); const lim = d.hidden ? innerHeight : d.getBoundingClientRect().top; return { ok: c.top >= 0 && c.bottom <= lim + 1 && c.left >= 0 && c.right <= innerWidth, b: c.bottom | 0, lim: lim | 0, l: c.left | 0, r: c.right | 0 }; });
    ok(r.ok, `title card fits ${vp.width}x${vp.height} (bottom ${r.b} <= ${r.lim}, x ${r.l}..${r.r})`);
    await f.ctx.close();
  }
  const none = await page('none', '?seed=9');
  ok(await none.p.evaluate(() => document.getElementById('season-cards').hidden), 'no seasons under webdriver without ?season=');
  await none.ctx.close();
} catch (e) { errors.push('test failure: ' + e.message); }
await browser.close(); server.kill();
for (const e of errors) { fails++; console.log('ERR', e); }
console.log(fails ? `FAIL seasons: ${fails} problem(s)` : `seasons OK (${n} checks, 0 console errors)`);
process.exit(fails ? 1 : 0);
