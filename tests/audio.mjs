// AUDIO v2 checks (node, no browser): assets and budgets, the manifest against
// work/v2/SOUNDS.md, the mixer graph (buses, ducking, intensity cross-fade, world
// retune), sim-event mapping, persisted settings and the loop seal. Web Audio is mocked.
import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails.push(m); };

// ------------------------------------------------------------------ Web Audio mock
const played = [];
class Param {
  constructor(v = 0) { this.value = v; this.target = v; }
  setTargetAtTime(v) { this.target = v; this.value = v; return this; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node { connect(n) { return n; } disconnect() {} }
class Buf {
  constructor(ch, n, sr) { this.numberOfChannels = ch; this.length = n; this.sampleRate = sr; this.duration = n / sr; this.d = Array.from({ length: ch }, () => new Float32Array(n)); }
  getChannelData(c) { return this.d[c]; }
}
class Ctx {
  constructor(o = {}) { this.sampleRate = o.sampleRate || 48000; this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { const n = new Node(); n.gain = new Param(1); return n; }
  createBiquadFilter() { const n = new Node(); n.frequency = new Param(350); n.Q = new Param(1); return n; }
  createDynamicsCompressor() { const n = new Node(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0); return n; }
  createConvolver() { return new Node(); }
  createStereoPanner() { const n = new Node(); n.pan = new Param(0); return n; }
  createBuffer(ch, n, sr) { return new Buf(ch, n, sr); }
  createOscillator() { const n = new Node(); n.frequency = new Param(440); n.detune = new Param(0); n.start = () => {}; n.stop = () => {}; return n; }
  createBufferSource() {
    const ctx = this, n = new Node();
    n.playbackRate = new Param(1); n.loop = false;
    n.start = (t, o, d) => { n.started = { t, o, d }; played.push({ buf: n.buffer, t, o, d, rate: n.playbackRate.value, loop: n.loop, node: n }); };
    n.stop = () => { n.stopped = true; };
    return n;
  }
  decodeAudioData(ab, okCb) {
    // fake decode: stereo music / mono sprite with a duration we know from the manifest
    const name = ab.__name || '';
    const b = new Buf(name.includes('music') && name.includes('calm') ? 2 : 1, Math.round((ab.__dur || 1) * this.sampleRate), this.sampleRate);
    setTimeout(() => okCb && okCb(b), 0);
    return Promise.resolve(b);
  }
}
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const listeners = {};
globalThis.window = { AudioContext: Ctx, addEventListener: (e, h) => { (listeners[e] ||= []).push(h); }, removeEventListener: (e, h) => { listeners[e] = (listeners[e] || []).filter((x) => x !== h); } };
const fetched = [];
let manifest;
globalThis.fetch = async (url) => {
  const p = path.join(ROOT, url);
  fetched.push(url);
  if (!existsSync(p)) return { ok: false };
  if (url.endsWith('.json')) return { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) };
  // tag the fake bytes with the asset's duration for the mock decoder
  let dur = 1;
  for (const s of Object.values(manifest.sprites)) if (s.ogg === url || s.m4a === url) dur = s.dur;
  for (const m of Object.values(manifest.music)) for (const s of Object.values(m.stems)) if (s.ogg === url || s.m4a === url) dur = m.loopEnd + m.loopStart;
  const ab = new ArrayBuffer(8); ab.__name = url; ab.__dur = dur;
  const orig = ab.slice.bind(ab); ab.slice = (...a) => { const c = orig(...a); c.__name = url; c.__dur = dur; return c; };
  return { ok: true, arrayBuffer: async () => ab };
};
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ 1. assets + budgets
const MAN = path.join(ROOT, 'assets/v2/common/audio/audio.json');
ok(existsSync(MAN), 'manifest assets/v2/common/audio/audio.json exists');
manifest = JSON.parse(readFileSync(MAN, 'utf8'));
const WORLDS = ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer'];
let allFiles = true, maxCalm = 0;
for (const w of WORLDS) {
  const m = manifest.music[w];
  ok(!!m, `music for ${w}`);
  if (!m) continue;
  for (const stem of ['calm', 'chase', 'boss']) for (const f of ['ogg', 'm4a']) {
    const p = path.join(ROOT, m.stems[stem][f]);
    if (!existsSync(p)) { allFiles = false; continue; }
    if (stem === 'calm') maxCalm = Math.max(maxCalm, statSync(p).size);
  }
  ok(Math.abs(m.loopEnd - m.loopStart - m.loop) < 1e-3 && m.loopStart > 0, `${w}: loop points carry wrap-around context (${m.loop.toFixed(2)} s loop)`);
}
ok(allFiles, '7 worlds × calm/chase/boss × ogg+m4a music files exist');
ok(maxCalm <= 250 * 1024, `every calm loop ≤ 250 KB in both formats (largest ${(maxCalm / 1024).toFixed(0)} KB)`);
let spriteBytes = 0, clipsInside = true;
for (const [g, s] of Object.entries(manifest.sprites)) {
  for (const f of ['ogg', 'm4a']) ok(existsSync(path.join(ROOT, s[f])), `sprite ${g}.${f} exists`);
  if (g === 'ui' || g === 'play') spriteBytes += statSync(path.join(ROOT, s.ogg)).size;
}
for (const [id, c] of Object.entries(manifest.clips)) if (c.o < 0.03 || c.o + c.d > manifest.sprites[c.g].dur + 1e-3) { clipsInside = false; console.log('  outside:', id); }
ok(clipsInside, 'every clip lies inside its sprite, after the leading gap');
ok(spriteBytes < 360 * 1024, `shared sprites (ui+play) ${(spriteBytes / 1024).toFixed(0)} KB < 360 KB, loaded after first paint`);

// ------------------------------------------------------------------ 2. SOUNDS.md ↔ manifest
const SOUNDS = path.join(ROOT, '..', 'SOUNDS.md');
const doc = existsSync(SOUNDS) ? readFileSync(SOUNDS, 'utf8') : '';
const docIds = new Set([...doc.matchAll(/^\| `([a-z0-9.]+)` \|/gm)].map((m) => m[1]));
const manIds = new Set(Object.keys(manifest.clips));
ok(docIds.size > 0 && [...docIds].every((i) => manIds.has(i)) && [...manIds].every((i) => docIds.has(i)), `SOUNDS.md lists exactly the ${manIds.size} shipped cues (doc ${docIds.size})`);
for (const need of ['ui.click', 'reward.claim', 'currency.fly', 'ring.offer', 'trap.warn', 'boss.windup', 'setpiece.title', 'vehicle.goose.mount', 'pickup.lantern', 'skill.owl'])
  ok(manIds.has(need), `cue ${need} present`);
for (const w of WORLDS) {
  const traps = new Set([...manIds].filter((i) => i.startsWith(`${w}.trap.`)).map((i) => i.split('.')[2]));
  const boss = ['enter', 'a1', 'a2', 'a3', 'hurt', 'defeat'].every((k) => manIds.has(`${w}.boss.${k}`));
  ok(traps.size >= 4 && boss, `${w}: ${traps.size} own traps (tell+fire) and a full boss set`);
}

// ------------------------------------------------------------------ 3. mixer behaviour
const A = await import('../src/audio.js');
const MX = await import('../src/audio-mixer.js');
const s = new A.Sound();
ok(A.Sound.current === s && typeof A.play === 'function' && typeof A.music === 'function' && typeof A.duck === 'function', 'contract API: play(id), music(worldId), duck() exported');
ok((listeners.touchend || []).length > 0 && (listeners.click || []).length > 0, 'unlock listeners installed for touchend/click (iOS)');
ok(statSync(path.join(ROOT, 'src/audio.js')).size < 40 * 1024, `first-load audio.js stays small (${(statSync(path.join(ROOT, 'src/audio.js')).size / 1024).toFixed(1)} KB; the mixer loads after first paint)`);
listeners.touchend[0]();
await tick(80);
ok(s.ctx && s.ctx.state === 'running', 'first tap creates and runs the AudioContext');
ok(s.ctx.sampleRate === 32000, '32 kHz context (assets are band-limited to 12.5 kHz)');
await tick(30);
ok(s.sprites.ui && s.sprites.play, 'ui + play sprites decoded after the tap');
ok(!!s.buf, 'debug flag `sprite decoded` stays truthy');

// every cue plays from its sprite once its group is loaded
for (const g of ['traps', ...WORLDS]) await s._sprite(g);
let allPlay = true;
for (const id of manIds) { s._last.clear(); s.voices = 0; if (!s.play(id)) { allPlay = false; console.log('  no play:', id); } }
ok(allPlay, `all ${manIds.size} cues play from their sprite`);
ok(s.play('no.such.sound') === false, 'unknown id falls back quietly (no throw)');

// world retune for tonal cues
s.world = 'gilded'; played.length = 0; s._last.clear(); s.voices = 0;
s.play('core.collect');
ok(Math.abs(played.at(-1).rate - Math.pow(2, 4 / 12)) < 1e-6, 'tonal cues retune to the world key (gilded: +4 semitones)');
s._last.clear(); s.play('core.collect', { step: 5 });
ok(Math.abs(played.at(-1).rate - Math.pow(2, 16 / 12)) < 1e-6, 'chain steps climb the pentatonic (step 5 = +1 octave)');
s._last.clear(); s.play('core.hit');
ok(played.at(-1).rate === 1, 'atonal cues are never retuned');
s.world = 'meadow';

// ducking
s._duckUntil = 0; s.duck(0.6, 0.5);
ok(Math.abs(s.duckGain.gain.value - 1) < 1e-9 && s._duckLvl === 0.4, 'duck() dips the music bus to 40% and schedules the recovery');
s._duckUntil = 0; s._last.clear(); s.play('ring.offer');
ok(s._duckLvl < 0.5, 'ring draft cue ducks the music automatically');

// music: lazy calm, then intensity cross-fade
fetched.length = 0;
s.start();
await tick(40);
ok(s.stems && s.stems.world === 'meadow' && s.stems.src.calm && s.stems.src.calm.loop, 'start() plays the meadow calm loop (looping)');
ok(s.stems.src.calm.loopStart === manifest.music.meadow.loopStart && s.stems.src.calm.loopEnd === manifest.music.meadow.loopEnd, 'loop points come from the manifest');
ok(fetched.some((u) => u.includes('music-meadow-calm')) && !fetched.some((u) => u.includes('music-starry')), 'only the current world is fetched');
s.handleEvent({ type: 'setpiece.start', kind: 'chase' });
await tick(40);
ok(s.level === 'chase' && s.stems.gain.chase && s.stems.gain.chase.gain.target === 1 && (!s.stems.gain.boss || s.stems.gain.boss.gain.target < 0.01), 'setpiece.start chase fades the chase stem in');
s.handleEvent({ type: 'setpiece.start', kind: 'boss' });
await tick(40);
ok(s.level === 'boss' && s.stems.gain.boss.gain.target === 1, 'boss set piece adds the boss stem');
const chaseOff = s.stems.src.chase.started.o, calmOff = s.stems.src.calm.started.o;
ok(chaseOff >= manifest.music.meadow.loopStart && calmOff >= manifest.music.meadow.loopStart, 'late stems start in phase with the running loop');
s.handleEvent({ type: 'setpiece.end', kind: 'boss' });
ok(s.level === 'calm' && s.stems.gain.chase.gain.target < 0.01 && s.stems.gain.boss.gain.target < 0.01, 'setpiece.end returns to calm');
s.music('lacquer');
await tick(40);
ok(s.stems.world === 'lacquer' && !s.sprites.meadow, 'switching world cross-fades music and evicts the old world');

// sim events
const ids = (evs, o) => { played.length = 0; s._last.clear(); s.voices = 0; s.onEvents(evs, o); return played.map((p) => Object.entries(manifest.clips).find(([, c]) => Math.abs(c.o - p.o) < 1e-6 && s.sprites[c.g] === p.buf)?.[0]).filter(Boolean); };
let r = ids([{ type: 'trapWarn', trap: 'lantern', t: 1.2 }]);
ok(r.includes('trap.warn') && r.includes('lacquer.trap.lantern.tell'), `trapWarn → shared warning + world tell (${r})`);
r = ids([{ type: 'trapWarn', trap: 'crow', t: 0.3 }]);
ok(r.includes('trap.warn.close') && r.includes('trap.crow.caw'), `late trapWarn → close warning + generic tell (${r})`);
r = ids([{ type: 'trapHit', trap: 'firecracker' }]);
ok(r.includes('lacquer.trap.firecracker.fire'), 'trapHit → world fire cue');
r = ids([{ type: 'vehicle.mount', ride: 'crane' }, { type: 'vehicle.action', ride: 'crane' }, { type: 'vehicle.dismount', ride: 'crane', src: 'hit' }]);
ok(r.join() === 'vehicle.crane.mount,vehicle.crane.action,vehicle.crane.eject', `ride events (${r})`);
r = ids([{ type: 'ring.offer' }, { type: 'ring.pick', id: 'deep', lv: 2 }, { type: 'skill.fire', id: 'owl' }, { type: 'pickup.prism' }]);
ok(r.join() === 'ring.offer,ring.levelup,skill.owl,pickup.prism', `ring / skill / pickup events (${r})`);
r = ids([{ type: 'boss.phase', attack: 2, windup: true }, { type: 'boss.phase', attack: 2 }]);
ok(r.join() === 'boss.windup,lacquer.boss.a2', `boss.phase → windup then world attack (${r})`);
r = ids([{ type: 'fork' }, { type: 'merge', mult: 3 }]);
ok(r.length === 0, 'v1 events are left to main.js by default (no double play)');
r = ids([{ type: 'fork' }, { type: 'collect', chain: 3 }], { all: true });
ok(r.join() === 'core.fork,core.collect', `{all:true} voices v1 events too (${r})`);
// MECH-shaped events (wt-mech, 2026-10-11): skins, boss ids, aliases, overwritten setpiece type
r = ids([{ type: 'trapWarn', trap: 'pendulum', skin: 'lacquer.trap.lanternswing', t: 1.1 }]);
ok(r.includes('trap.warn') && r.includes('lacquer.trap.dragon.tell'), `world skin picks the signature tell via TRAP_ALIAS (${r})`);
r = ids([{ type: 'trapWarn', trap: 'door', skin: 'lacquer.trap.shutters', t: 1.1 }]);
ok(r.join() === 'trap.warn', `a world trap without a signature cue still gets the shared warning (${r})`);
r = ids([{ type: 'trapWarn', trap: 'boss:dragon:ring', boss: true, t: 1.2 }, { type: 'boss.attack', boss: 'dragon', attack: 'ring' }, { type: 'boss.foil', boss: 'dragon', attack: 'ring' }]);
ok(r.join() === 'boss.windup,lacquer.boss.a3,lacquer.boss.hurt', `boss telegraph / attack / foil (${r})`);
r = ids([{ type: 'pickup.bubble', x: 0 }, { type: 'pickup.bubble.pop' }, { type: 'vehicle.mount', ride: 'rail' }, { type: 'vehicle.dismount', ride: 'rail', why: 'time' }]);
ok(r.join() === 'pickup.dew,pickup.dew.pop,vehicle.beanstalk.mount,vehicle.end', `pickup / ride aliases (${r})`);
r = ids([{ type: 'boss', id: 'lacquer.boss.dragon', name: 'THE LANTERN DRAGON', loop: 0 }]);
ok(s.level === 'boss' && r.includes('setpiece.title') && r.includes('setpiece.boss'), `setpiece.start whose type field was overwritten is still recognised (${r})`);
r = ids([{ type: 'boss', id: 'lacquer.boss.dragon', perfect: true, hits: 0 }]);
ok(s.level === 'calm' && r.includes('setpiece.clear') && r.includes('lacquer.boss.defeat'), `…and so is its setpiece.end (${r})`);
let threw = false;
try { s.onEvents([{ type: 'weird' }, null, { type: 'trapWarn' }, { type: 'boss.phase' }]); } catch { threw = true; }
ok(!threw, 'odd or partial events never throw');

// composite reward cues
r = ids([{ type: 'chest', tier: 2 }]);
ok(r.join() === 'reward.chest.ratchet,reward.chest.open,reward.chest.stamp', 'chest reveal sequence');
played.length = 0; s._last.clear(); s.voices = 0; s.currencyFly(6);
ok(played.length === 8, 'currency fly = swish + one tick per acorn + landing pop');

// legacy methods route to v2 cues
played.length = 0; s._last.clear(); s.voices = 0;
s.fork(); s.merge(3); s.click(); s.buy();
ok(played.length === 4, 'v1 methods (fork, merge, click, buy) now play v2 sprite cues');

// settings persistence
s.setVolume('music', 0.3); s.setVolume('sfx', 0.7); s.setMuted(true);
const saved = JSON.parse(store['forkwood.audio']);
ok(saved.music === 0.3 && saved.sfx === 0.7 && saved.muted === true && store['forkwood.muted'] === '1', 'volumes and mute persist to localStorage');
ok(s.master.gain.value === 0, 'mute silences the master bus');
const s2 = new A.Sound();
ok(s2.settings.music === 0.3 && s2.muted === true, 'a new session restores the saved settings');
s.setMuted(false); s.setVolume('music', 0.6); s.setVolume('sfx', 0.9);

// loop seal
const b = new Buf(1, 1000, 1000);
const d = b.getChannelData(0);
for (let i = 0; i < 1000; i++) d[i] = Math.sin(i / 7);
d[899] = 5; // a codec glitch right before loopEnd
MX.sealLoop(b, 0.1, 0.9, 20);
ok(Math.abs(d[899] - d[99]) < 1e-6, 'sealLoop makes the sample before loopEnd continue into loopStart');

console.log(fails.length ? `\n${fails.length} audio check(s) FAILED` : '\naudio checks OK');
process.exit(fails.length ? 1 : 0);
