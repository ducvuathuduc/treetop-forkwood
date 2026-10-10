// Extra release checks in headless Chromium:
//  - reduced-motion turns calm mode on (no shake), and the CSS stops animating
//  - a tap on a phone unlocks WebAudio and the sound sprite decodes
//  - first load stays small and makes no requests to other origins
//  - no console errors or warnings
// usage: node tests/extra.mjs   (URL=... to test a deployed copy)
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const PORT = 8139;
const server = process.env.URL ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const base = process.env.URL || `http://localhost:${PORT}/`;
const origin = new URL(base).origin;
const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails.push(msg); };
// honour an outbound proxy when testing a deployed URL from a sandbox
const px = process.env.URL && (process.env.HTTPS_PROXY || process.env.https_proxy);
let proxy;
if (px) { const u = new URL(px); proxy = { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined }; }
const browser = await chromium.launch(proxy ? { proxy } : {});

async function page(opts) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  const errs = [], foreign = [];
  let bytes = 0;
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url()); });
  p.on('response', async (r) => { try { const b = await r.body(); bytes += b.length; } catch { /* redirects */ } });
  return { ctx, p, errs, foreign, bytes: () => bytes };
}

// 1. reduced motion
{
  const { ctx, p, errs } = await page({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await p.goto(base); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => window.forkwood.calm), 'prefers-reduced-motion switches calm mode on');
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.title-card > *')).animationName);
  ok(anim === 'none', `title animations are off under reduced motion (animation: ${anim})`);
  await p.evaluate(() => { window.forkwood.start(); window.forkwood.advance(8, 'bot'); });
  const tr = await p.evaluate(() => window.forkwood.cam.trauma);
  ok(tr === 0, `no camera shake in calm mode (trauma ${tr})`);
  ok(errs.length === 0, 'no console errors (reduced motion) ' + errs.join(' | '));
  await ctx.close();
}
// 2. phone: tap unlocks audio, sprite decodes, payload size, origins
{
  const { ctx, p, errs, foreign, bytes } = await page({ ...devices['iPhone 13'] });
  await p.goto(base); await p.waitForTimeout(1500);
  const kb = bytes() / 1024;
  ok(kb < 700, `first load transfer ${kb.toFixed(0)} KB uncompressed (budget 700 KB: pass 5 adds ~170 KB of painted art; other plates and the story load on demand)`);
  ok(foreign.length === 0, 'no requests to other origins ' + foreign.join(' '));
  const before = await p.evaluate(() => window.forkwood.audio.state);
  await p.tap('#btn-play');
  await p.waitForTimeout(900);
  const a = await p.evaluate(() => window.forkwood.audio);
  ok(a.state === 'running', `tap unlocks WebAudio (before: ${before}, after: ${a.state})`);
  ok(a.sprite, 'CC0 sound sprite decoded');
  ok(a.zzfx >= 10, `ZzFX meta sounds rendered after the first tap (${a.zzfx})`);
  ok(await p.evaluate(() => document.fonts.check('800 20px "Fraunces Display"') && document.fonts.check('600 14px "Bricolage"')), 'custom fonts loaded');
  ok(errs.length === 0, 'no console errors (phone) ' + errs.join(' | '));
  await ctx.close();
}
await browser.close();
if (server) server.kill();
console.log(fails.length ? `\n${fails.length} check(s) FAILED` : '\nextra checks OK');
process.exit(fails.length ? 1 : 0);
