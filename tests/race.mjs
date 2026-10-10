// P6-RACE: live 2-player race in headless Chromium.
//  1. local transport (BroadcastChannel, two tabs of one context): lobby -> countdown -> race
//     -> live rival state -> finish -> rematch, and the race code stays off the first load
//  2. dead transport: the 8 s connect timeout falls back to the async duel link
//  3. REAL PeerJS 1.5.5 over the free PeerJS cloud broker between two separate browser
//     contexts (WebRTC data channel), incl. disconnect handling. Skipped (not failed) only
//     when the broker / CDN cannot be reached from this machine; set RACE_REAL=require to fail instead.
// Screenshots at 390x844 go to tests/out/race-*.png. Fails on any console error or warning.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const PORT = 8461;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const base = `http://localhost:${PORT}/`;
const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false };

// the sandbox reaches the internet through an HTTP proxy; keep localhost direct
const px = process.env.HTTPS_PROXY || process.env.https_proxy;
let proxy;
if (px) { const u = new URL(px); proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined, bypass: '<-loopback>,localhost,127.0.0.1' }; }
// mDNS host candidates do not resolve inside the sandbox; plain host candidates work between two local contexts
const browser = await chromium.launch({ ...(proxy ? { proxy } : {}), args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });

function watch(p, name, errs) {
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${name}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', (e) => errs.push(`[${name}] pageerror: ${e.message}`));
}
const state = (p) => p.evaluate(() => (window.forkwood.race ? window.forkwood.race.state : 'none'));
async function waitState(p, want, ms = 15000) {
  const t0 = Date.now(); let s;
  while (Date.now() - t0 < ms) { s = await state(p); if ((Array.isArray(want) ? want : [want]).includes(s)) return s; await sleep(150); }
  return s;
}

/** Full race between two pages: host creates, guest opens the link, both ready, race, finish, rematch. */
async function raceFlow(tag, host, guest, hostUrl, extra) {
  await host.goto(hostUrl); await sleep(900);
  const lazy = await host.evaluate(() => performance.getEntriesByType('resource').filter((r) => /race|peerjs/.test(r.name)).map((r) => r.name));
  ok(lazy.length === 0, `[${tag}] race code and PeerJS are not part of the first load (${lazy.join(', ') || 'none'})`);
  await host.click('#btn-race');
  const hs = await waitState(host, ['waiting', 'failed'], 12000);
  if (hs !== 'waiting') return { skipped: await host.evaluate(() => window.forkwood.race.session.why) };
  ok(true, `[${tag}] host room open (state ${hs})`);
  const link = await host.inputValue('#rc-url');
  ok(/\?race=forkwood-[a-z0-9]{6}-[a-z0-9]+$/.test(link), `[${tag}] shareable link ${link}`);
  await host.screenshot({ path: OUT + `race-${tag}-1-room.png` });
  await guest.goto(link + extra);
  const gs = await waitState(guest, 'lobby', 15000), hl = await waitState(host, 'lobby', 8000);
  ok(gs === 'lobby' && hl === 'lobby', `[${tag}] both players see the lobby (host ${hl}, guest ${gs})`);
  if (gs !== 'lobby' || hl !== 'lobby') return {};
  await sleep(300);
  await guest.screenshot({ path: OUT + `race-${tag}-2-lobby.png` });
  const names = await host.evaluate(() => document.querySelectorAll('#race .rc-player').length);
  ok(names === 2, `[${tag}] lobby shows both growers`);
  await guest.click('#rc-ready');
  await sleep(200);
  ok((await state(host)) === 'lobby', `[${tag}] one ready player does not start the race`);
  await host.click('#rc-ready');
  const c1 = await waitState(host, 'countdown', 4000), c2 = await waitState(guest, 'countdown', 4000);
  ok(c1 === 'countdown' && c2 === 'countdown', `[${tag}] countdown starts on both (${c1}, ${c2})`);
  await sleep(1100);
  await host.screenshot({ path: OUT + `race-${tag}-3-countdown.png` });
  const r1 = await waitState(host, 'racing', 8000), r2 = await waitState(guest, 'racing', 8000);
  ok(r1 === 'racing' && r2 === 'racing', `[${tag}] race starts after 3-2-1 (${r1}, ${r2})`);
  const seeds = await Promise.all([host, guest].map((p) => p.evaluate(() => ({ seed: window.forkwood.sim.seed, mode: window.forkwood.run.mode, play: window.forkwood.mode, limit: window.forkwood.sim.R.timeLimit }))));
  ok(seeds[0].seed === seeds[1].seed && seeds[0].mode === 'race' && seeds[0].play === 'play', `[${tag}] same seed on both (${seeds[0].seed} / ${seeds[1].seed}), race rules ${seeds[0].limit} s`);
  // P6 wiring: race runs keep the difficulty director and season gameplay modifiers off
  const fair = await Promise.all([host, guest].map((p) => p.evaluate(() => { const f = window.forkwood, R = f.sim.R; return { dir: f.dirMode, director: f.director, seasonsOn: f.seasons.list.length, run: f.seasons.run.length, mods: !!(R.fireflies || R.slip || R.envelopes || (R.windK != null && R.windK !== 1)), rmode: R.mode }; })));
  ok(fair.every((f) => f.dir === 'race' && f.director === null), `[${tag}] director off in races (dirMode ${fair.map((f) => f.dir)}, director ${JSON.stringify(fair.map((f) => f.director))})`);
  ok(fair.every((f) => f.run === 0 && !f.mods), `[${tag}] season gameplay modifiers off in races (${fair[0].seasonsOn} season(s) open, ${fair[0].run} applied)`);
  await sleep(3500);
  const live = await Promise.all([host, guest].map((p) => p.evaluate(() => { const s = window.forkwood.race.session; return { me: window.forkwood.race.myM, opp: s.opp.m, trail: s.opp.trail.length, hud: document.getElementById('race-hud').textContent }; })));
  ok(live[0].opp > 0 && live[1].opp > 0 && live[0].trail > 5 && live[1].trail > 5, `[${tag}] each sees the rival climbing in real time (host sees ${live[0].opp} m / ${live[0].trail} samples, guest sees ${live[1].opp} m)`);
  ok(Math.abs(live[0].opp - live[1].me) < 25, `[${tag}] rival height tracks the other player (host sees ${live[0].opp}, guest is at ${live[1].me.toFixed(1)})`);
  ok(/m/.test(live[0].hud), `[${tag}] race HUD shows heights: "${live[0].hud}"`);
  await guest.screenshot({ path: OUT + `race-${tag}-4-inrace.png` });
  // host runs out of sap first, guest keeps growing
  await host.evaluate(() => window.forkwood.killNow());
  const e1 = await waitState(host, 'ended', 20000);
  ok(e1 === 'ended', `[${tag}] host's tree done, waiting for the guest (${e1})`);
  await sleep(600);
  await host.screenshot({ path: OUT + `race-${tag}-5-waiting.png` });
  await guest.evaluate(() => window.forkwood.killNow());
  const d1 = await waitState(host, 'done', 20000), d2 = await waitState(guest, 'done', 20000);
  ok(d1 === 'done' && d2 === 'done', `[${tag}] finish screen on both (${d1}, ${d2})`);
  const res = await Promise.all([host, guest].map((p) => p.evaluate(() => { const s = window.forkwood.race.session; return { r: s.result, mine: s.mine.h, theirs: s.opp.end && s.opp.end.h, head: document.querySelector('.rc-result').textContent }; })));
  ok(res[0].mine === res[1].theirs && res[1].mine === res[0].theirs, `[${tag}] both agree on heights (host ${res[0].mine} m, guest ${res[1].mine} m)`);
  ok((res[0].r === 'win' && res[1].r === 'lose') || (res[0].r === 'lose' && res[1].r === 'win') || (res[0].r === 'tie' && res[1].r === 'tie'), `[${tag}] one winner: host "${res[0].head}", guest "${res[1].head}"`);
  await sleep(300);
  await host.screenshot({ path: OUT + `race-${tag}-6-finish.png` });
  // rematch: a new seed, the same room
  await host.click('#rc-again'); await sleep(200); await guest.click('#rc-again');
  const m1 = await waitState(host, 'racing', 10000), m2 = await waitState(guest, 'racing', 10000);
  const s2 = await Promise.all([host, guest].map((p) => p.evaluate(() => ({ seed: window.forkwood.sim.seed, round: window.forkwood.race.session.round }))));
  ok(m1 === 'racing' && m2 === 'racing' && s2[0].seed === s2[1].seed && s2[0].seed !== seeds[0].seed && s2[0].round === 1, `[${tag}] rematch: round ${s2[0].round}, new shared seed ${s2[0].seed}`);
  return { ok: true };
}

// ---------------------------------------------------------------- 1. local transport
{
  const errs = [];
  const ctx = await browser.newContext(PHONE);
  const host = await ctx.newPage(), guest = await ctx.newPage();
  watch(host, 'local-host', errs); watch(guest, 'local-guest', errs);
  // season pinned to Sat 6 Feb 2027 20:00 (Firefly Night + Winter + Tết + Twin Storm) so seasons are open during the race
  await raceFlow('local', host, guest, base + '?bot=1&rt=local&season=2027-02-06T20:00:00', '&bot=1&rt=local&season=2027-02-06T20:00:00');
  // guest leaves mid-race: the host's race carries on and the finish card says so
  await guest.close();
  const lostAt = Date.now();
  let lost = false;
  while (Date.now() - lostAt < 9000) { lost = await host.evaluate(() => !!window.forkwood.race.session.opp.lost); if (lost) break; await sleep(200); }
  ok(lost, `[local] host notices the guest left (${((Date.now() - lostAt) / 1000).toFixed(1)} s)`);
  ok((await state(host)) === 'racing', '[local] host keeps racing after the rival leaves');
  await host.evaluate(() => window.forkwood.killNow());
  const d = await waitState(host, 'done', 20000);
  ok(d === 'done' && (await host.evaluate(() => !!document.querySelector('#rc-fallback'))), `[local] finish card offers a duel link when the rival disconnected (${d})`);
  await host.click('#rc-cancel'); await sleep(400);
  ok((await host.evaluate(() => window.forkwood.mode)) === 'title' && (await state(host)) === 'none' || (await state(host)) === 'left', '[local] Menu leaves the race and returns to the title');
  ok(errs.length === 0, '[local] no console errors ' + errs.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 2. connection fails -> duel fallback
{
  const errs = [];
  const ctx = await browser.newContext(PHONE);
  const p = await ctx.newPage(); watch(p, 'dead', errs);
  const t0 = Date.now();
  await p.goto(base + '?bot=1&rt=dead&race=forkwood-abc234-deadroom99');
  const st = await waitState(p, 'failed', 12000);
  const secs = (Date.now() - t0) / 1000;
  ok(st === 'failed' && secs < 11, `[fallback] unreachable room fails after the ~8 s timeout (${secs.toFixed(1)} s)`);
  await p.screenshot({ path: OUT + 'race-fallback.png' });
  const seed = await p.evaluate(() => window.forkwood.race.session.seed);
  await p.click('#rc-fallback');
  await p.waitForURL(/fb=race/, { timeout: 5000 }).catch(() => {});
  ok(p.url().includes(`seed=${seed}`) && p.url().includes('fb=race'), `[fallback] falls back to the same course as an async duel (${p.url().replace(base, '/')})`);
  await sleep(1200);
  await p.click('#btn-play'); await sleep(300);
  ok((await p.evaluate(() => window.forkwood.sim.seed)) === seed, '[fallback] solo run uses the race course, ready for a Duel link');
  ok(errs.length === 0, '[fallback] no console errors ' + errs.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 3. real PeerJS, two browser contexts
{
  const errs = [];
  const cA = await browser.newContext(PHONE), cB = await browser.newContext(PHONE);
  const host = await cA.newPage(), guest = await cB.newPage();
  watch(host, 'peer-host', errs); watch(guest, 'peer-guest', errs);
  const r = await raceFlow('peer', host, guest, base + '?bot=1', '&bot=1');
  if (r.skipped) {
    const msg = `[peer] SKIPPED: PeerJS broker/CDN unreachable from this machine (${r.skipped}); the real network path is untested here`;
    if (process.env.RACE_REAL === 'require') ok(false, msg); else console.log('skip ' + msg);
  } else if (r.ok) {
    // guest's browser goes away mid-race: the host sees it within the stale window
    await cB.close();
    const t0 = Date.now(); let lost = false;
    while (Date.now() - t0 < 12000) { lost = await host.evaluate(() => !!window.forkwood.race.session.opp.lost); if (lost) break; await sleep(250); }
    ok(lost, `[peer] host detects the dropped WebRTC peer (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await host.evaluate(() => window.forkwood.killNow());
    ok((await waitState(host, 'done', 20000)) === 'done', '[peer] host still gets a finish card');
    console.log('REAL_PEERJS_VERIFIED');
  }
  ok(errs.length === 0, '[peer] no console errors ' + errs.join(' | '));
  await cA.close().catch(() => {});
}

await browser.close();
server.kill();
console.log(fails.length ? `\n${fails.length} race check(s) FAILED` : '\nrace checks OK');
process.exit(fails.length ? 1 : 0);
