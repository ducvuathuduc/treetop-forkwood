// V3.2 "Git you can hear": render three short listening clips through the REAL audio code
// (src/audio.js + mixer + git layer, real meadow stems and sprites) in an OfflineAudioContext
// inside headless Chromium, driven by a scripted fake sim exactly the way main.js drives it
// (legacy cue methods, onEvents, setLowSap, update, once per 16 ms frame).
//   node tools/audio/render-git.mjs [outDir]
// Writes fork-merge / lowsap-sunlight / golden-hour as .wav + .mp3 and prints/asserts
// simple measurements (stereo balance, brightness, peak) so a deaf sandbox can still check.
import { createRequire } from 'module';
import { spawn, execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '..', 'v32-audio-clips'));
mkdirSync(OUT, { recursive: true });
const PORT = +process.env.PORT || 8173;
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
const errors = [];
page.on('crash', () => errors.push('CRASH')); page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${PORT}/README.md`);

/** In-page: build a Sound on an OfflineAudioContext, run a script, return the PCM. */
async function render(name, sec, script) {
  const res = await page.evaluate(async ({ sec, script }) => {
    const A = await import('/src/audio.js');
    const SR = 32000;
    localStorage.clear();
    const s = new A.Sound();
    let ctx;
    s._makeCtx = () => { ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(SR * sec), sampleRate: SR }); Object.defineProperty(ctx, 'state', { get: () => 'running' }); return ctx; };
    s.unlock();
    await s._mixer();
    await s._manifest();
    for (const g of ['ui', 'play']) await s._sprite(g);
    for (const k of ['calm', 'chase', 'boss']) await s._stem('meadow', k);
    await new Promise((r) => setTimeout(r, 50));
    const W = 560, SPREAD = 78;
    const sim = { tips: [{ x: W / 2 }], cx: W / 2, dead: false };
    s._simRef = () => sim;
    s.world = 'meadow';
    s.start();
    // the script: a list of [time, action] plus a per-frame state function (see below)
    const S = new Function('return ' + script)();
    const frameDt = 512 / SR;
    const nFrames = Math.floor(sec / frameDt) - 1;
    const st = { sap: 1, spread: 0, forked: false, cx: W / 2 };
    const done = new Set();
    const legacy = { fork: () => s.fork(), merge: (e) => s.merge(e.mult), collect: (e) => s.collect(e.chain, e.forked), golden: () => s.goldenStart(), goldenend: () => s.goldenEnd(), revert: () => s.revert() };
    const log = [];
    for (let k = 1; k <= nFrames; k++) {
      const t = k * frameDt;
      ctx.suspend(t).then(() => {
        const evs = [];
        for (let i = 0; i < S.events.length; i++) if (!done.has(i) && S.events[i][0] <= t) { done.add(i); evs.push(S.events[i][1]); }
        S.state(t, st);
        // spread animates like the sim (towards FORK_SPREAD while forked)
        st.spread += ((st.forked ? SPREAD : 0) - st.spread) * Math.min(1, frameDt * 9);
        sim.cx = st.cx;
        sim.tips = st.forked || st.spread > 4 ? [{ x: st.cx - st.spread }, { x: st.cx + st.spread }] : [{ x: st.cx }];
        for (const e of evs) { if (e.type === 'fork') { st.forked = true; sim.tips = [{ x: st.cx }, { x: st.cx }]; } if (e.type === 'merge' || e.type === 'revert') { st.forked = false; st.spread = 0; sim.tips = [{ x: st.cx }]; } }
        for (const e of evs) if (legacy[e.type]) legacy[e.type](e);
        s.onEvents(evs);
        s.setLowSap(st.sap);
        s.update(0.35, 2);
        if (k % 31 === 0) log.push({ t: +t.toFixed(2), pans: s._git.pans.map((p) => +p.toFixed(2)), lp: Math.round(s._git.lpF), lift: s._git.lift, rate: s.stems && s.stems.src.calm ? +s.stems.src.calm.playbackRate.value.toFixed(3) : null, stems: s.stems ? Object.keys(s.stems.src).map((k) => k + ':' + s.stems.gain[k].gain.value.toFixed(2)).join(' ') : '' });
        ctx.resume();
      });
    }
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    // measurements per 0.5 s window: rms L/R, brightness (rms of first difference / rms)
    const win = SR / 2, m = [];
    for (let i = 0; i + win <= L.length; i += win) {
      let l = 0, r = 0, dl = 0, pk = 0, lo = 0, lp = 0;
      for (let j = i; j < i + win; j++) {
        l += L[j] * L[j]; r += R[j] * R[j];
        const mid = (L[j] + R[j]) / 2, d = mid - ((L[j - 1] || 0) + (R[j - 1] || 0)) / 2; dl += d * d;
        lp += (mid - lp) * 0.012; lo += lp * lp; // ~60 Hz one-pole: sub energy (heartbeat)
        pk = Math.max(pk, Math.abs(L[j]), Math.abs(R[j]));
      }
      const rms = Math.sqrt((l + r) / 2 / win);
      m.push({ t: i / SR, rmsL: Math.sqrt(l / win), rmsR: Math.sqrt(r / win), bal: (Math.sqrt(r / win) - Math.sqrt(l / win)) / (rms + 1e-9), bright: Math.sqrt(dl / win) / (rms + 1e-9), sub: Math.sqrt(lo / win), peak: pk });
    }
    // 16-bit stereo WAV
    const n = L.length, ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
    let peak = 0;
    for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(ab);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { wav: btoa(bin), m, peak, log };
  }, { sec, script });
  const wav = path.join(OUT, `${name}.wav`), mp3 = path.join(OUT, `${name}.mp3`);
  writeFileSync(wav, Buffer.from(res.wav, 'base64'));
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', mp3]); } catch (e) { console.log('mp3 encode failed:', e.message); }
  return { ...res, wav, mp3 };
}

const fails = [];
const ok = (c, msg) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fails.push(msg); };
const avg = (m, a, b, k) => { const xs = m.filter((x) => x.t >= a && x.t < b).map((x) => x[k]); return xs.reduce((p, q) => p + q, 0) / Math.max(1, xs.length); };

// 1. fork → steer left/right → merge (×3), 11 s
const c1 = await render('1-fork-merge', 11, `({
  events: [[2.0, { type: 'fork' }], [8.0, { type: 'merge', mult: 3 }]],
  state(t, st) { st.cx = t < 2.6 ? 280 : t < 7.4 ? 280 + Math.sin((t - 2.6) / 4.8 * Math.PI * 2) * 170 : 280; if (t > 7.4 && t < 8) st.forked = false; }
})`);
// 2. sap falls 40% → 3%, then three sunlight catches lift it back, 13 s
const c2 = await render('2-lowsap-sunlight', 13, `({
  events: [[8.6, { type: 'collect', chain: 1 }], [9.1, { type: 'collect', chain: 2 }], [9.55, { type: 'collect', chain: 3 }], [10.0, { type: 'collect', chain: 4 }]],
  state(t, st) { st.sap = t < 8.6 ? Math.max(0.03, 0.4 - t * 0.047) : Math.min(0.32, 0.03 + (t - 8.6) * 0.09); }
})`);
// 3. golden hour: a ×8 merge starts it at 3 s, it ends at 9 s, settle to 14 s
const c3 = await render('3-golden-hour', 14, `({
  events: [[1.0, { type: 'fork' }], [3.0, { type: 'merge', mult: 8 }], [3.0, { type: 'golden' }], [9.0, { type: 'goldenend' }]],
  state(t, st) { if (t > 2.5 && t < 3) st.forked = false; }
})`);

// control for clip 3: the same timeline without golden hour (A/B for the measurement and for listening)
const c3c = await render('3b-golden-control-no-lift', 14, `({
  events: [[1.0, { type: 'fork' }], [3.0, { type: 'merge', mult: 8 }]],
  state(t, st) { if (t > 2.5 && t < 3) st.forked = false; }
})`);
for (const [n, c] of [['fork-merge', c1], ['lowsap-sunlight', c2], ['golden-hour', c3]]) {
  ok(c.peak < 1.0, `${n}: no clipping (peak ${c.peak.toFixed(3)} = ${(20 * Math.log10(c.peak)).toFixed(1)} dBFS)`);
  ok(avg(c.m, 1, 99, 'rmsL') > 0.01, `${n}: audible music (rms ${avg(c.m, 1, 99, 'rmsL').toFixed(3)})`);
}
const balLeft = Math.min(...c1.m.filter((x) => x.t >= 5.5 && x.t < 7).map((x) => x.bal)), balRight = Math.max(...c1.m.filter((x) => x.t >= 3 && x.t < 4.8).map((x) => x.bal));
const balPre = avg(c1.m, 0.5, 2, 'bal');
ok(balRight > balPre + 0.03 && balLeft < balPre - 0.03, `fork-merge: the stereo image follows the tips (pre ${balPre.toFixed(3)}, right ${balRight.toFixed(3)}, left ${balLeft.toFixed(3)})`);
ok(avg(c1.m, 8, 9, 'rmsL') > avg(c1.m, 6.5, 7.5, 'rmsL') * 0.95, `fork-merge: merge swell (${avg(c1.m, 6.5, 7.5, 'rmsL').toFixed(3)} → ${avg(c1.m, 8, 9, 'rmsL').toFixed(3)})`);
const b40 = avg(c2.m, 0.5, 2.5, 'bright'), b3 = avg(c2.m, 7, 8.5, 'bright'), bSun = avg(c2.m, 8.6, 10.5, 'bright');
ok(b3 < b40 * 0.8, `lowsap: the mix darkens as sap falls (brightness ${b40.toFixed(3)} → ${b3.toFixed(3)})`);
ok(bSun > b3 * 1.3, `lowsap: sunlight opens it with a shimmer (→ ${bSun.toFixed(3)})`);
ok(avg(c2.m, 7, 8.5, 'sub') > avg(c2.m, 0.5, 2.5, 'sub'), `lowsap: heartbeat sub energy under 25% (${avg(c2.m, 0.5, 2.5, 'sub').toFixed(4)} → ${avg(c2.m, 7, 8.5, 'sub').toFixed(4)})`);
const r3 = c3.log.filter((x) => x.t > 4 && x.t < 8.8).map((x) => x.rate), r3e = c3.log.filter((x) => x.t > 12).map((x) => x.rate);
ok(r3.length && r3.every((r) => Math.abs(r - Math.pow(2, 2 / 12)) < 0.01) && r3e.every((r) => Math.abs(r - 1) < 0.01), `golden: stems lifted a whole tone during golden hour, back after (${r3[0]} → ${r3e[0]})`);
const g3 = (avg(c3.m, 4, 8.5, 'rmsL') + avg(c3.m, 4, 8.5, 'rmsR')) / 2, g3c = (avg(c3c.m, 4, 8.5, 'rmsL') + avg(c3c.m, 4, 8.5, 'rmsR')) / 2;
ok(g3 > g3c * 1.1, `golden: the full stem is fuller than the same bars without golden hour (rms ${g3c.toFixed(3)} → ${g3.toFixed(3)}, ${(20 * Math.log10(g3 / g3c)).toFixed(1)} dB)`);
ok(errors.length === 0, `no page errors (${errors.join(' | ')})`);
writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify({ c1: { m: c1.m, log: c1.log }, c2: { m: c2.m, log: c2.log }, c3: { m: c3.m, log: c3.log } }, null, 1));
console.log([c1, c2, c3].map((c) => c.mp3).join('\n'));
await browser.close();
server.kill();
console.log(fails.length ? `\n${fails.length} render check(s) FAILED` : '\nrender checks OK');
process.exit(fails.length ? 1 : 0);
