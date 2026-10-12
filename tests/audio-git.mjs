// V3.2 "Git you can hear" (node, no browser): node-graph assertions for the branch voices,
// low-sap filter + heartbeat, sunlight shimmer, golden hour lift, mute/limiter routing,
// lite (low quality) mode and the no-per-frame-node rule. Web Audio is mocked with a mock
// that records every connection. The audible renders live in tools/audio/render-git.mjs.
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails.push(m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ------------------------------------------------------------------ recording Web Audio mock
let made = 0;
const sources = [];
class Param {
  constructor(owner, name, v = 0) { this.owner = owner; this.name = name; this._v = v; this.target = v; this.ramps = []; }
  get value() { return this._v; }
  set value(v) { this._v = v; this.target = v; } // a direct set is also the resting target
  setTargetAtTime(v) { this.target = v; this._v = v; return this; }
  setValueAtTime(v) { this._v = v; return this; }
  linearRampToValueAtTime(v, t) { this.target = v; this.ramps.push([v, t]); return this; }
  exponentialRampToValueAtTime(v) { this.target = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  constructor(kind) { this.kind = kind; this.outs = []; made++; }
  connect(n) { this.outs.push(n); return n; }
  disconnect() { this.outs = []; }
}
class Buf {
  constructor(ch, n, sr) { this.numberOfChannels = ch; this.length = n; this.sampleRate = sr; this.duration = n / sr; this.d = Array.from({ length: ch }, () => new Float32Array(n)); }
  getChannelData(c) { return this.d[c]; }
}
const P = (n, ...names) => { for (const k of names) n[k] = new Param(n, k, k === 'gain' ? 1 : 0); return n; };
class Ctx {
  constructor(o = {}) { this.sampleRate = o.sampleRate || 48000; this.currentTime = 0; this.state = 'running'; this.destination = new Node('dest'); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return P(new Node('gain'), 'gain'); }
  createBiquadFilter() { const n = P(new Node('biquad'), 'frequency', 'Q'); n.frequency.value = 350; return n; }
  createDynamicsCompressor() { return P(new Node('comp'), 'threshold', 'knee', 'ratio', 'attack', 'release'); }
  createConvolver() { return new Node('convolver'); }
  createStereoPanner() { return P(new Node('panner'), 'pan'); }
  createDelay() { return P(new Node('delay'), 'delayTime'); }
  createBuffer(ch, n, sr) { return new Buf(ch, n, sr); }
  createOscillator() { const n = P(new Node('osc'), 'frequency', 'detune'); n.started = false; n.start = () => { n.started = true; }; n.stop = () => { n.stopped = true; }; return n; }
  createBufferSource() {
    const n = P(new Node('source'), 'playbackRate'); n.playbackRate.value = 1; n.loop = false;
    n.start = (t, o, d) => { n.started = { t, o, d }; sources.push(n); };
    n.stop = () => { n.stopped = true; };
    return n;
  }
  decodeAudioData(ab, okCb) {
    const b = new Buf(1, Math.round((ab.__dur || 1) * this.sampleRate), this.sampleRate);
    setTimeout(() => okCb && okCb(b), 0);
    return Promise.resolve(b);
  }
}
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const listeners = {};
globalThis.window = { AudioContext: Ctx, addEventListener: (e, h) => { (listeners[e] ||= []).push(h); }, removeEventListener() {} };
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/v2/common/audio/audio.json'), 'utf8'));
globalThis.fetch = async (url) => {
  const p = path.join(ROOT, url);
  if (!existsSync(p)) return { ok: false };
  if (url.endsWith('.json')) return { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) };
  let dur = 1;
  for (const s of Object.values(manifest.sprites)) if (s.ogg === url || s.m4a === url) dur = s.dur;
  for (const m of Object.values(manifest.music)) for (const s of Object.values(m.stems)) if (s.ogg === url || s.m4a === url) dur = m.loopEnd + m.loopStart;
  const ab = new ArrayBuffer(8); ab.__dur = dur;
  const orig = ab.slice.bind(ab); ab.slice = (...a) => { const c = orig(...a); c.__dur = dur; return c; };
  return { ok: true, arrayBuffer: async () => ab };
};
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
/** is there a connection path from node a to node b? */
function reaches(a, b, seen = new Set()) {
  if (a === b) return true;
  if (!a || seen.has(a)) return false;
  seen.add(a);
  return (a.outs || []).some((n) => reaches(n, b, seen));
}

const A = await import('../src/audio.js');
const MX = await import('../src/audio-mixer.js');
const GIT = await import('../src/audio-git.js');
const { W, FORK_SPREAD } = await import('../src/sim.js');

// ------------------------------------------------------------------ pure helpers
let vp = GIT.voicePans([{ x: W / 2 }], W / 2);
ok(vp.gains[0] === 1 && vp.gains[1] === 0 && near(vp.pans[0], 0), 'one tip at centre: a single centred voice');
vp = GIT.voicePans([{ x: W / 2 - FORK_SPREAD }, { x: W / 2 + FORK_SPREAD }], W / 2);
ok(near(vp.gains[0], Math.SQRT1_2) && near(vp.gains[1], Math.SQRT1_2) && vp.gains[2] === 0, 'two tips: two voices at equal power (1/√2 each)');
ok(vp.pans[0] < -0.5 && vp.pans[1] > 0.5 && near(vp.pans[0], -vp.pans[1]), `two tips: voices panned left/right to the tips (${vp.pans.map((p) => p.toFixed(2))})`);
vp = GIT.voicePans([{ x: 100 }, { x: 150 }], 125);
ok(vp.pans[0] < vp.pans[1] && (vp.pans[0] + vp.pans[1]) / 2 < -0.1, 'forked pair on the left: both voices sit left, still split');
vp = GIT.voicePans([{ x: 80 }, { x: 280 }, { x: 480 }], 280);
ok(vp.gains.every((g) => near(g, 1 / Math.sqrt(3))) && vp.pans[0] < -0.8 && near(vp.pans[1], 0) && vp.pans[2] > 0.8, 'three tips: voices distributed left / centre / right');
vp = GIT.voicePans([{ x: 0 }, { x: 100 }, { x: 200 }, { x: 300 }, { x: 400 }], 200);
ok(vp.gains.filter((g) => g > 0).length === 3 && vp.pans[0] <= -0.89 && vp.pans[2] >= 0.89, 'five tips: folded onto the three voices, outermost tips at the edges');
const hb30 = GIT.heartbeat(0.3), hb20 = GIT.heartbeat(0.2), hb5 = GIT.heartbeat(0.05);
ok(hb30 === null && hb20 && hb5 && hb5.bpm > hb20.bpm && hb5.vol > hb20.vol, `heartbeat only below 25% sap and faster as it falls (${hb20.bpm.toFixed(0)} → ${hb5.bpm.toFixed(0)} bpm)`);
const c40 = GIT.sapCutoffs(0.4), c20 = GIT.sapCutoffs(0.2), c05 = GIT.sapCutoffs(0.05), c05o = GIT.sapCutoffs(0.05, 1);
ok(c40.music === 16000 && c20.music < c40.music && c05.music < c20.music && c05.music < 1200, `music low-pass sweeps down with sap (${c20.music.toFixed(0)} → ${c05.music.toFixed(0)} Hz)`);
ok(c05.sfx >= 3600 && c05.sfx < 16000, 'sfx low-pass closes gently and never below 3.6 kHz (warnings stay clear)');
ok(c05o.music > 15000, 'sunlight boost opens the filter fully');
const anc = { t: 1, pos: 2, r0: 1, r1: 1.5, d: 2 };
ok(near(MX.stemPos(anc, 0.5), 2) && near(MX.stemPos(anc, 3), 2 + 2.5) && near(MX.stemPos(anc, 4), 4.5 + 1.5) && near(MX.stemRate(anc, 2), 1.25), 'stem playhead anchor integrates a linear rate ramp exactly');

// ------------------------------------------------------------------ graph
const s = new A.Sound();
listeners.touchend[0]();
await tick(80);
await tick(40);
const G = s._git;
ok(s.ctx && G && G.musicIn, 'git graph built when the mixer loads (after the first tap)');
ok(reaches(s.master, s.limiter) && reaches(s.limiter, s.ctx.destination) && s.limiter.ratio.value >= 20, 'master → compressor → limiter → output (no clipping)');
ok(G.musicIn.outs.includes(G.lowLP) && G.lowLP.outs.includes(s.musicBus), 'trunk band (< 220 Hz) stays centred into the music bus');
ok(G.voices.length === 3 && G.voices.every((v) => v.pan.kind === 'panner' && v.pan.outs.includes(s.musicBus) && reaches(G.hiHP, v.pan) && v.inj.outs.includes(v.pan)), 'upper band → 3 reusable voice gain → StereoPanner chains (+ synth inject) → music bus');
ok(G.voices[1].dly && G.voices[2].dly && G.lfo && G.lfo.started, 'copies offset a few ms with one shared chorus LFO (normal quality)');
ok(reaches(s.musicBus, s.duckGain) && reaches(s.duckGain, s.musicLP) && reaches(s.musicLP, s.master), 'music bus (volume) → duck → low-pass → master');
ok(s.sfx.outs.includes(G.sfxLP) && G.sfxLP.outs.includes(s.master) && reaches(G.hbGain, s.master) && reaches(G.hbGain, s.sfx), 'sfx bus → sfx low-pass → master; heartbeat rides the sfx bus (volume + mute apply)');

s.start();
for (const k of ['chase', 'boss']) await s._stem('meadow', k);
await tick(60);
ok(s.stems && s.stems.src.calm && s.stems.gain.calm.outs.includes(G.musicIn), 'music stems feed the git split (musicIn)');

// fake sim driven like main.js: onEvents → setLowSap → update
const sim = { tips: [{ x: W / 2 }], cx: W / 2, dead: false, sap: 100 };
s._simRef = () => sim;
const frame = (evs = [], sapF = 1, dt = 1 / 60) => { s.ctx.currentTime += dt; s.onEvents(evs); s.setLowSap(sapF); s.update(0.3, 1); };
for (let i = 0; i < 5; i++) frame();
ok(near(G.voices[0].g.gain.target, 1) && G.voices[1].g.gain.value === 0, 'unforked: one voice carries the music');

// no per-frame node creation
let before = made;
for (let i = 0; i < 120; i++) { sim.cx = W / 2 + Math.sin(i / 10) * 120; sim.tips[0].x = sim.cx; frame(); }
ok(made === before, `120 steady frames (tip moving) create no audio nodes (${made - before})`);

// fork
const oscBefore = made;
sim.tips = [{ x: sim.cx }, { x: sim.cx }];
frame([{ type: 'fork', x: sim.cx }]);
ok(G.synth && G.synth.osc.length === 2 && made - oscBefore <= 6, `fork: a two-note branch figure (2 oscillators, ${made - oscBefore} nodes, once)`);
ok(G.synth.osc.every((o, i) => o.outs[0].outs.includes(G.voices[i].inj)), 'each branch note goes to its own tip panner');
sim.cx = 180; sim.tips = [{ x: 180 - FORK_SPREAD }, { x: 180 + FORK_SPREAD }];
before = made;
for (let i = 0; i < 30; i++) frame();
ok(made === before, 'forked frames create no nodes');
ok(near(G.voices[0].g.gain.target, Math.SQRT1_2) && near(G.voices[1].g.gain.target, Math.SQRT1_2), 'forked: the music splits into two equal-power voices');
const pL = G.voices[0].pan.pan.target, pR = G.voices[1].pan.pan.target;
ok(pL < -0.6 && pR > 0 && pL < pR, `voices follow each tip's x (L ${pL.toFixed(2)}, R ${pR.toFixed(2)})`);
sim.cx = 400; sim.tips = [{ x: 400 - FORK_SPREAD }, { x: 400 + FORK_SPREAD }];
frame();
ok(G.voices[0].pan.pan.target > pL && G.voices[1].pan.pan.target > pR, 'steering right moves both voices right');

// merge
sim.tips = [{ x: 400 }];
const swellBefore = made;
frame([{ type: 'merge', x: 400, mult: 4 }]);
ok(G.synth && G.synth.resolving && G.synth.osc.length === 4, 'merge: branch voices resolve into a chord (+ the 9th at ×4)');
ok(near(G.voices[1].g.gain.target, 0, 1e-3) || G.voices[1].g.gain.target < 0.02, 'merge: the second voice folds back into one');
ok(made - swellBefore < 12, `merge swell builds a handful of nodes once (${made - swellBefore})`);
const chordHz = G.synth.osc.map((o) => o.frequency.target || o.frequency.value);
ok(chordHz.every((f, i) => i === 0 || f > chordHz[i - 1] * 0.99), 'resolved chord tones climb root → third → fifth');

// revert releases the branch with a bend
sim.tips = [{ x: 300 }, { x: 300 }];
frame([{ type: 'fork', x: 300 }]);
const rev = G.synth;
sim.tips = [{ x: 300 }];
frame([{ type: 'revert', x: 300 }]);
ok(!G.synth && rev.osc.every((o) => o.stopped), 'revert: the cut branch drops away (voices stopped)');

// low sap → heartbeat, sunlight
sources.length = 0;
for (let i = 0; i < 60; i++) frame([], 0.4);
ok(!sources.some((x) => x.buffer === G.hbBuf) && s.musicLP.frequency.target === 16000, 'sap 40%: open mix, no heartbeat');
for (let i = 0; i < 120; i++) frame([], 0.2);
const beats20 = sources.filter((x) => x.buffer === G.hbBuf).length;
sources.length = 0;
for (let i = 0; i < 120; i++) frame([], 0.04);
const beats4 = sources.filter((x) => x.buffer === G.hbBuf).length;
ok(beats20 >= 1 && beats4 > beats20, `heartbeat under 25% sap, faster as it falls (${beats20} → ${beats4} beats / 2 s)`);
const lpLow = s.musicLP.frequency.target;
ok(lpLow < 1000 && G.sfxLP.frequency.target < 6000, `low sap closes the mix (music ${lpLow.toFixed(0)} Hz, sfx ${G.sfxLP.frequency.target.toFixed(0)} Hz)`);
sources.length = 0;
frame([{ type: 'collect', chain: 2, x: 0, y: 0 }], 0.06);
ok(s.musicLP.frequency.target > 12000 && sources.some((x) => x.buffer === G.shimBuf), 'sunlight while low: filter thrown open + bright shimmer');
for (let i = 0; i < 90; i++) frame([], 0.06);
ok(s.musicLP.frequency.target < 2000, 'the sunlight boost settles back to the sap filter');
frame([], 0.6); sources.length = 0;
frame([{ type: 'collect', chain: 1 }], 0.6);
ok(!sources.some((x) => x.buffer === G.shimBuf), 'no shimmer when sap is healthy');
sim.dead = true; sources.length = 0;
frame([{ type: 'death' }], 0.0);
for (let i = 0; i < 30; i++) frame([], 1);
ok(!sources.some((x) => x.buffer === G.hbBuf), 'death stops the heartbeat');
sim.dead = false;

// golden hour
s.setLowSap(1);
await tick(30);
const tonal = Object.entries(manifest.clips).find(([, c]) => c.tonal)[0];
s._last.clear(); s.voices = 0; sources.length = 0; s.play(tonal);
const rate0 = sources.at(-1).playbackRate.value;
frame([{ type: 'golden' }], 1);
await tick(40);
const lift = Math.pow(2, 2 / 12);
ok(s.keyLift === 2 && s.goldenFull, 'golden: key lift +2 semitones, full-stem flag');
ok(Object.values(s.stems.src).every((x) => x.playbackRate.target === lift || near(x.playbackRate.value, lift, 0.02)), 'golden: every stem ramps up a whole tone together');
ok(s.stems.gain.chase && s.stems.gain.chase.gain.target === 1 && s.stems.gain.boss && s.stems.gain.boss.gain.target >= 0.79, 'golden: the full stem (chase + boss layers) comes in');
s._last.clear(); s.voices = 0; s.play(tonal);
ok(near(sources.at(-1).playbackRate.value / rate0, lift, 1e-6), 'golden: tonal sfx follow the lift (stay in key)');
frame([{ type: 'goldenend' }], 1);
ok(s.keyLift === 0 && !s.goldenFull && Object.values(s.stems.src).every((x) => x.playbackRate.target === 1), 'golden end: rate settles back, layers return to the level');

// mute: everything above routes through master
s.setMuted(true);
ok(s.master.gain.value === 0 && reaches(G.voices[0].pan, s.master) && reaches(G.hbGain, s.master), 'mute zeroes the master that every new path flows through');
s.setMuted(false);

// stop (back to menu) mid-golden resets the lift and pans
frame([{ type: 'golden' }], 1);
s.stop();
frame([], 1);
ok(s.keyLift === 0 && near(G.voices[0].g.gain.target, 1), 'stop() mid-golden: lift off, single centred voice');

// ------------------------------------------------------------------ lite (quality low / lowest tier)
window.forkwood = { quality: { mode: 'low' } };
const s3 = new A.Sound();
s3.unlock();
await tick(80);
ok(s3._git && s3._git.lite && !s3._git.lfo, 'lite mode: no chorus LFO');
s3._simRef = () => sim;
s3.start(); await tick(20);
const mk = made;
sim.cx = 280; sim.tips = [{ x: 200 }, { x: 360 }];
s3.ctx.currentTime += 0.02; s3.onEvents([{ type: 'fork' }]); s3.setLowSap(1); s3.update(0, 1);
ok(made === mk && !s3._git.synth, 'lite mode: fork makes no synth nodes, just pans the voices');
ok(s3._git.voices[0].pan.pan.target < 0 && s3._git.voices[1].pan.pan.target > 0, 'lite mode: voices still follow the tips');
delete window.forkwood;

// ------------------------------------------------------------------ no StereoPanner (old Safari) / partial mocks
class OldCtx extends Ctx {}
OldCtx.prototype.createStereoPanner = undefined;
window.AudioContext = OldCtx;
const s4 = new A.Sound();
s4.unlock(); await tick(80);
ok(s4._git && !s4._git.canPan, 'without StereoPanner the graph still builds (centred voices, filter + heartbeat work)');
s4._simRef = () => sim; s4.start(); s4.setLowSap(0.1); s4.ctx.currentTime += 0.02; s4.update(0, 1);
ok(s4.musicLP.frequency.target < 3000, 'without StereoPanner low sap still closes the mix');

console.log(fails.length ? `\n${fails.length} audio-git check(s) FAILED` : '\naudio-git checks OK');
process.exit(fails.length ? 1 : 0);
