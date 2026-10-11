// Forkwood audio. WebAudio only, no library.
// Music is generated live: an FM "kalimba" voice playing a four-chord loop in
// the current stage's key, with bass, soft drums and a generated reverb. Its
// tempo and layers rise as you climb, it closes in (low-pass) when sap runs
// low, and it shimmers during golden hour.
// Sound effects layer synth tones over a small sprite of CC0 foley samples
// from Kenney (Impact Sounds + Interface Sounds, see CREDITS.md). If the
// sprite cannot load, every effect still plays from the synth layer alone.

const SCALE = [0, 2, 4, 7, 9];                 // major pentatonic
const ROOTS = [57, 60, 62, 64, 65, 67, 69];   // key per stage (MIDI)
const CHORDS = [0, 9, 5, 7];                  // I vi IV V, as semitone offsets
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Short synthesised effects for the meta layer, rendered once with ZzFX
// (Frank Force, MIT, vendored in src/vendor) and played through our own mixer.
// Params: volume, randomness, frequency, attack, sustain, release, shape,
// shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise,
// modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter.
const ZZ = {
  acorn: [1, 0, 1046, 0, 0.01, 0.08, 0, 1.4, 0, 0, 523, 0.03, 0, 0, 0, 0, 0, 0.6, 0.02],
  buy: [1, 0, 660, 0.01, 0.05, 0.22, 1, 1.5, 0, 0, 330, 0.06, 0.09, 0, 0, 0, 0, 0.5, 0.05],
  stamp: [1.4, 0, 120, 0, 0.02, 0.16, 4, 2.5, -6, 0, 0, 0, 0, 1.2, 0, 0, 0, 0.4, 0.04, 0, -1400],
  page: [0.5, 0, 500, 0.02, 0.02, 0.1, 4, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0.3, 0.05, 0, -2200],
  sparkle: [0.8, 0, 1568, 0, 0.04, 0.3, 0, 1.8, 0, 0, 392, 0.05, 0.07, 0, 0, 0, 0, 0.5, 0.03],
  ward: [1, 0, 180, 0, 0.03, 0.2, 1, 2, 0, 0, 90, 0.04, 0, 0.6, 0, 0, 0, 0.5, 0.05],
  sun: [1, 0, 220, 0.05, 0.25, 0.4, 0, 1, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.1],
  roots: [1.2, 0, 90, 0.05, 0.2, 0.5, 1, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.1],
  still: [1, 0, 600, 0.02, 0.3, 0.5, 0, 1, -4, 0, 0, 0, 0, 0, 8, 0, 0, 0.5, 0.1],
  charged: [0.7, 0, 784, 0, 0.03, 0.18, 0, 1.6, 0, 0, 392, 0.04, 0.06, 0, 0, 0, 0, 0.5, 0.02],
};
const SPRITE = {
  fork: [0, 0.51], merge: [0.5127, 0.58], hit: [1.0925, 0.56], revert: [1.6526, 0.39],
  bark: [2.0419, 1.03], click: [3.0709, 0.26], toggle: [3.3325, 0.39], drop: [3.7189, 0.44], soft: [4.1571, 0.43],
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = safeGet('forkwood.muted') === '1';
    this.intensity = 0;
    this.stage = 0;
    this.nextBeat = 0;
    this.beat = 0;
    this.playing = false;
    this.golden = false;
    this.buf = null;
    this.zz = {};
    this.menu = false;
    // v1.0.1 PERF: fetch the sprite when the page is idle (or on the first tap), off the first paint
    this._bytes = null;
    if (typeof window !== 'undefined') setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(() => this._sfx(), { timeout: 1500 }) : this._sfx()), 3000);
  }

  _sfx() {
    if (!this._bytes) this._bytes = typeof fetch === 'function' ? fetch('assets/audio/sfx.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : Promise.resolve(null);
    return this._bytes;
  }

  /** Must be called from a user gesture (tap, click, key). Safe to call often. */
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* iOS 16.4+: play even with the silent switch on */ }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);
      // music bus with a low-pass that closes when sap is low
      this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 16000; this.musicLP.Q.value = 0.7;
      this.music = c.createGain(); this.music.gain.value = 0.5;
      this.music.connect(this.musicLP); this.musicLP.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
      // generated stereo impulse response: a small wooden room
      this.verb = c.createConvolver();
      this.verb.buffer = this._impulse(1.9, 2.6);
      this.verbIn = c.createGain(); this.verbIn.gain.value = 1;
      const verbOut = c.createGain(); verbOut.gain.value = 0.32;
      this.verbIn.connect(this.verb); this.verb.connect(verbOut); verbOut.connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // a silent blip finishes the unlock on older iOS
      const sb = c.createBufferSource(); sb.buffer = c.createBuffer(1, 1, 22050); sb.connect(c.destination); sb.start(0);
      this._startPad();
      this._startFrost();
      // ZzFX renders the meta sounds once, after the first tap (never on page load)
      import('./vendor/zzfx.js').then(({ ZZFX }) => {
        ZZFX.sampleRate = c.sampleRate;
        for (const [k, p] of Object.entries(ZZ)) {
          try { const data = ZZFX.buildSamples(...p); const b = c.createBuffer(1, data.length, c.sampleRate); b.getChannelData(0).set(data); this.zz[k] = b; } catch { /* synth fallback */ }
        }
      }).catch(() => {});
      this._sfx().then((ab) => {
        if (!ab) return;
        const done = (b) => { this.buf = b; };
        try { const p = c.decodeAudioData(ab, done, () => {}); if (p && p.then) p.then(done).catch(() => {}); } catch { /* keep synth only */ }
      });
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setMuted(m) {
    this.muted = m;
    safeSet('forkwood.muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // -------------------------------------------------- building blocks
  _impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 90 ? i / 90 : 1);
    }
    return b;
  }

  _env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  _out(node, dest, verb) {
    node.connect(dest || this.sfx);
    if (verb) { const s = this.ctx.createGain(); s.gain.value = verb; node.connect(s); s.connect(this.verbIn); }
  }

  tone(freq, { type = 'triangle', t = 0, a = 0.005, dec = 0.25, vol = 0.2, dest, slide = 0, verb = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + a + dec);
    const g = c.createGain(); this._env(g, now, a, vol, dec);
    o.connect(g); this._out(g, dest, verb);
    o.start(now); o.stop(now + a + dec + 0.05);
  }

  /** FM kalimba / marimba voice: bright metallic attack, round wooden body. */
  kalimba(freq, { t = 0, vol = 0.12, dec = 0.9, dest, verb = 0.35, bright = 1 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const car = c.createOscillator(); car.type = 'sine'; car.frequency.setValueAtTime(freq, now);
    const mod = c.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(freq * 3.0, now);
    const mg = c.createGain();
    mg.gain.setValueAtTime(freq * 2.2 * bright, now);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.04), now + 0.09);
    mod.connect(mg); mg.connect(car.frequency);
    const g = c.createGain(); this._env(g, now, 0.003, vol, dec);
    car.connect(g); this._out(g, dest, verb);
    car.start(now); mod.start(now); car.stop(now + dec + 0.1); mod.stop(now + dec + 0.1);
  }

  noise({ t = 0, dec = 0.2, vol = 0.3, f0 = 3000, f1 = 300, q = 1, type = 'lowpass', dest, verb = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), now + dec);
    const g = c.createGain(); this._env(g, now, 0.004, vol, dec);
    s.connect(f); f.connect(g); this._out(g, dest, verb);
    s.start(now, Math.random() * 0.5); s.stop(now + dec + 0.05);
  }

  /** Play one slice of the foley sprite. Returns false when it is not loaded. */
  sample(name, { t = 0, vol = 0.6, rate = 1, verb = 0 } = {}) {
    if (!this.ctx || !this.buf || !SPRITE[name]) return false;
    const [off, dur] = SPRITE[name];
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.buf; s.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const g = c.createGain(); g.gain.value = vol;
    s.connect(g); this._out(g, this.sfx, verb);
    s.start(now, off, dur);
    return true;
  }

  /** Play a pre-rendered ZzFX effect. Returns false if it is not ready. */
  zzfx(name, { t = 0, vol = 0.35, rate = 1, verb = 0.15 } = {}) {
    const b = this.zz[name];
    if (!this.ctx || !b) return false;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(g); this._out(g, this.sfx, verb);
    s.start(c.currentTime + t);
    return true;
  }

  _key() { return ROOTS[this.stage % ROOTS.length]; }
  _note(deg, oct = 0) {
    const o = Math.floor(deg / 5);
    return mtof(this._key() + 12 * (oct + o) + SCALE[((deg % 5) + 5) % 5]);
  }

  // -------------------------------------------------- music
  _startPad() {
    const c = this.ctx;
    this.padGain = c.createGain(); this.padGain.gain.value = 0.0001;
    this.padFilter = c.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 650; this.padFilter.Q.value = 0.4;
    this.padFilter.connect(this.padGain); this.padGain.connect(this.music);
    const pv = c.createGain(); pv.gain.value = 0.5; this.padGain.connect(pv); pv.connect(this.verbIn);
    this.padOsc = [];
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = i === 3 ? 'sine' : 'triangle';
      o.detune.value = (i - 1.5) * 6;
      const g = c.createGain(); g.gain.value = i === 3 ? 0.35 : 0.16;
      o.connect(g); g.connect(this.padFilter); o.start();
      this.padOsc.push(o);
    }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(this.padFilter.frequency); lfo.start();
    this._setPadChord(0);
  }

  _setPadChord(ci) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, r = this._key() + CHORDS[ci % 4];
    const minor = CHORDS[ci % 4] === 9;
    const notes = [r - 24, r - 12 + (minor ? 3 : 4), r - 12 + 7, r - 24];
    this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(mtof(notes[i]), t, 0.35));
  }

  _startFrost() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 2;
    this.frostGain = c.createGain(); this.frostGain.gain.value = 0;
    s.connect(f); f.connect(this.frostGain); this.frostGain.connect(this.sfx); s.start();
  }

  setFrost(on) { if (this.frostGain) this.frostGain.gain.setTargetAtTime(on ? 0.1 : 0, this.ctx.currentTime, 0.08); }

  /** f = sap fraction 0..1: the music closes in below 30% */
  setLowSap(f) {
    if (!this.musicLP) return;
    const k = Math.max(0, Math.min(1, f / 0.3));
    this.musicLP.frequency.setTargetAtTime(700 + 15300 * k * k, this.ctx.currentTime, 0.15);
  }

  setGolden(on) { this.golden = !!on; }

  /** Quiet music-box loop for the title and menus (after the first tap). */
  startMenu() {
    if (!this.ctx || (this.playing && this.menu)) return;
    this.start();
    this.menu = true;
    this.padGain.gain.setTargetAtTime(0.06, this.ctx.currentTime, 1.2);
  }

  start() {
    if (!this.ctx) return;
    this.menu = false;
    this.playing = true;
    this.beat = 0;
    this.nextBeat = this.ctx.currentTime + 0.12;
    this.padGain.gain.setTargetAtTime(0.13, this.ctx.currentTime, 0.8);
    this.setLowSap(1);
  }

  stop() {
    this.playing = false;
    this.menu = false;
    this.golden = false;
    if (this.padGain) this.padGain.gain.setTargetAtTime(0.04, this.ctx.currentTime, 0.6);
  }

  setStage(i) {
    if (i === this.stage) return;
    this.stage = i;
    this._setPadChord(Math.floor(this.beat / 16));
  }

  /** called every frame: schedules the generative score a little ahead */
  update(intensity, mult) {
    if (!this.ctx || !this.playing || this.ctx.state !== 'running') return;
    this.intensity = intensity;
    if (this.menu) intensity = 0;
    const bpm = this.menu ? 70 : 92 + intensity * 34 + (this.golden ? 8 : 0);
    const spb = 60 / bpm / 2; // eighth notes
    const c = this.ctx;
    if (this.nextBeat < c.currentTime - 0.25) this.nextBeat = c.currentTime + 0.02; // after a stall, never burst-play
    while (this.nextBeat < c.currentTime + 0.14) {
      const t = this.nextBeat - c.currentTime;
      const b = this.beat++;
      const bar = Math.floor(b / 8), ci = Math.floor(b / 16) % 4;
      if (b % 16 === 0) this._setPadChord(ci);
      const root = this._key() + CHORDS[ci];
      const minor = CHORDS[ci] === 9;
      const tones = [0, minor ? 3 : 4, 7, 12, minor ? 15 : 14, 19];
      // kalimba arpeggio: sparse at the bottom, fuller as you climb
      const pat = [0, 2, 1, 3, 2, 4, 1, 5];
      const play = this.menu ? (b % 4 === 0 || (b % 8 === 3 && bar % 2 === 1)) : b % 2 === 0 || intensity > 0.3 || this.golden;
      if (play && !(b % 8 === 7 && intensity < 0.5)) {
        const st = tones[pat[(b + bar) % 8]];
        this.kalimba(mtof(root + 12 + st), { t, vol: 0.045 + 0.025 * intensity, dec: 0.7, dest: this.music, verb: 0.45, bright: 0.7 });
      }
      if (this.golden && b % 2 === 1) this.kalimba(mtof(root + 24 + tones[(b * 3) % 6]), { t, vol: 0.03, dec: 0.5, dest: this.music, verb: 0.6, bright: 1.2 });
      // bass on beats 1 and 3
      if (b % 4 === 0 && !(this.menu && b % 8)) this.tone(mtof(root - 12), { t, dec: 0.32, a: 0.01, vol: (this.menu ? 0.06 : 0.12) + 0.06 * intensity, type: 'triangle', dest: this.music });
      // soft kick, then shaker as the tree climbs
      if (intensity > 0.12 && b % 4 === 0) this.tone(95, { t, dec: 0.16, vol: 0.2 * Math.min(1, intensity * 2), type: 'sine', slide: 0.45, dest: this.music });
      if (intensity > 0.4 && b % 2 === 1) this.noise({ t, dec: 0.035, vol: 0.035, f0: 9000, f1: 6500, type: 'highpass', dest: this.music });
      if (mult >= 4 && b % 16 === 14) this.kalimba(mtof(root + 31), { t, vol: 0.03, dec: 0.9, dest: this.music, verb: 0.7 });
      this.nextBeat += spb;
    }
  }

  // -------------------------------------------------- sfx
  collect(chain, forked) {
    const deg = Math.min(14, chain - 1);
    this.kalimba(this._note(deg, 1), { vol: 0.15, dec: 0.45, verb: 0.3, bright: 1.1 });
    if (forked) this.kalimba(this._note(deg + 2, 1), { t: 0.035, vol: 0.06, dec: 0.3, verb: 0.3 });
  }
  fork() {
    this.sample('fork', { vol: 0.75 });
    this.kalimba(this._note(0, 1), { vol: 0.1, dec: 0.35 });
    this.kalimba(this._note(2, 1), { t: 0.05, vol: 0.1, dec: 0.35 });
    this.noise({ dec: 0.14, vol: 0.05, f0: 1200, f1: 5200, type: 'bandpass', q: 3 });
  }
  merge(mult) {
    this.sample('merge', { vol: 0.8, rate: 0.9 + mult * 0.03 });
    [0, 2, 4, 5 + Math.min(4, mult)].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.05, vol: 0.12, dec: 0.8, verb: 0.5 }));
    this.tone(this._note(0, -1), { dec: 0.45, vol: 0.18, type: 'sine' });
  }
  emptyMerge() { if (!this.sample('soft', { vol: 0.4 })) this.tone(this._note(0, 0), { dec: 0.1, vol: 0.06, type: 'sine' }); }
  revert() {
    this.sample('revert', { vol: 0.7 });
    this.tone(this._note(4, 0), { dec: 0.35, vol: 0.1, type: 'sawtooth', slide: 0.35 });
    this.noise({ dec: 0.2, vol: 0.1, f0: 2500, f1: 200 });
  }
  hit() {
    if (!this.sample('hit', { vol: 0.95 })) this.noise({ dec: 0.22, vol: 0.3, f0: 1800, f1: 120 });
    this.tone(140, { dec: 0.28, vol: 0.28, type: 'sine', slide: 0.35 });
  }
  near() { this.noise({ dec: 0.16, vol: 0.1, f0: 600, f1: 4200, type: 'bandpass', q: 4 }); }
  dew() {
    this.sample('drop', { vol: 0.6 });
    [0, 4, 7].forEach((d, i) => this.kalimba(this._note(d, 2), { t: 0.03 + i * 0.045, vol: 0.06, dec: 0.6, verb: 0.6 }));
  }
  shield() { if (!this.sample('bark', { vol: 0.55 })) this.tone(this._note(0, 0), { dec: 0.4, vol: 0.12, type: 'square', slide: 2 }); }
  shieldBreak() { this.sample('bark', { vol: 0.8, rate: 1.25 }); this.noise({ dec: 0.25, vol: 0.12, f0: 6000, f1: 800, type: 'bandpass', q: 2 }); }
  stageUp() { [0, 1, 2, 3, 4, 5, 7].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.06, vol: 0.08, dec: 0.7, verb: 0.5 })); }
  newBest() { [4, 5, 7, 9].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.08, vol: 0.1, dec: 0.8, verb: 0.5, bright: 1.3 })); }
  bloom(n) {
    for (let i = 0; i < 5; i++) this.kalimba(this._note(5 + i, 1), { t: i * 0.035, vol: 0.07, dec: 0.5, verb: 0.55, bright: 1.4 });
  }
  goldenStart() {
    this.setGolden(true);
    [0, 2, 4, 5, 7, 9].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.045, vol: 0.11, dec: 1.2, verb: 0.7, bright: 1.3 }));
    this.tone(this._note(0, -1), { dec: 1.4, vol: 0.16, type: 'sine', verb: 0.5 });
  }
  goldenEnd() {
    this.setGolden(false);
    [7, 4, 2].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.07, vol: 0.06, dec: 0.6, verb: 0.5 }));
  }
  sprout() {
    this.sample('soft', { vol: 0.5, rate: 0.8 });
    [0, 2, 4, 7].forEach((d, i) => this.kalimba(this._note(d, 1), { t: 0.04 + i * 0.06, vol: 0.1, dec: 0.9, verb: 0.55, bright: 1.2 }));
    this.tone(this._note(0, -1), { dec: 0.8, vol: 0.14, type: 'sine', verb: 0.4 });
  }
  death() { [4, 2, 0, -3].forEach((d, i) => this.kalimba(this._note(d, 0), { t: i * 0.15, vol: 0.12, dec: 1.1, verb: 0.6 })); }
  acorn(n) { if (!this.zzfx('acorn', { vol: 0.3, rate: 1 + Math.min(0.5, (n % 6) * 0.06) })) this.tone(this._note(7 + (n % 5), 1), { dec: 0.08, vol: 0.07, type: 'sine' }); }
  buy() { this.zzfx('buy', { vol: 0.32 }); this.sample('merge', { vol: 0.35, rate: 1.3 }); [0, 2, 4].forEach((d, i) => this.kalimba(this._note(d, 1), { t: 0.05 + i * 0.07, vol: 0.07, dec: 0.6, verb: 0.4 })); }
  equip() { this.sample('fork', { vol: 0.4, rate: 1.2 }); this.kalimba(this._note(4, 1), { vol: 0.06, dec: 0.4, verb: 0.3 }); }
  stamp() { if (!this.zzfx('stamp', { vol: 0.45 })) this.noise({ dec: 0.12, vol: 0.2, f0: 900, f1: 120 }); this.sample('bark', { vol: 0.35, rate: 1.5 }); }
  page() { if (!this.zzfx('page', { vol: 0.25 })) this.noise({ dec: 0.08, vol: 0.06, f0: 3000, f1: 800 }); }
  sparkle() { this.zzfx('sparkle', { vol: 0.28, verb: 0.4 }); [4, 7, 9, 12].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.07, vol: 0.06, dec: 0.7, verb: 0.5, bright: 1.3 })); }
  levelUp() { this.sparkle(); [0, 2, 4, 5, 7].forEach((d, i) => this.kalimba(this._note(d, 0), { t: 0.1 + i * 0.09, vol: 0.09, dec: 0.9, verb: 0.5 })); }
  charm(id) { if (!this.zzfx(id, { vol: 0.42, verb: 0.3 })) this.tone(this._note(0, 1), { dec: 0.3, vol: 0.1, slide: 1.5 }); if (id === 'ward') this.sample('bark', { vol: 0.5 }); }
  charged() { if (!this.zzfx('charged', { vol: 0.3 })) this.kalimba(this._note(7, 1), { vol: 0.07, dec: 0.4 }); }
  click() { if (!this.sample('click', { vol: 0.5 })) this.tone(this._note(2, 1), { dec: 0.06, vol: 0.08, type: 'sine' }); }
  toggle() { if (!this.sample('toggle', { vol: 0.5 })) this.click(); }
  // pass 3: power-ups, grafts, the storm
  pickup(kind) {
    if (kind === 'rush') { this.sample('fork', { vol: 0.5, rate: 0.8 }); this.noise({ dec: 0.5, vol: 0.12, f0: 400, f1: 3000, type: 'bandpass', q: 1.5 }); [0, 4, 7, 12].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.04, vol: 0.07, dec: 0.5, verb: 0.3 })); }
    else if (kind === 'ink') { if (!this.zzfx('stamp', { vol: 0.4 })) this.noise({ dec: 0.12, vol: 0.2, f0: 900, f1: 120 }); this.kalimba(this._note(7, 1), { t: 0.05, vol: 0.08, dec: 0.5 }); }
    else { if (!this.zzfx('sun', { vol: 0.35 })) this.tone(this._note(4, 1), { dec: 0.3, vol: 0.08, slide: 1.5 }); }
  }
  puEnd() { this.tone(this._note(2, 1), { dec: 0.18, vol: 0.05, type: 'sine', slide: 0.7 }); }
  graft() { this.stamp(); [0, 4, 7].forEach((d, i) => this.kalimba(this._note(d, 1), { t: 0.08 + i * 0.08, vol: 0.09, dec: 0.8, verb: 0.5 })); }
  synergy() { this.sparkle(); [7, 9, 12, 14].forEach((d, i) => this.kalimba(this._note(d, 1), { t: 0.15 + i * 0.07, vol: 0.08, dec: 0.9, verb: 0.6, bright: 1.4 })); }
  storm() { this.noise({ dec: 2.2, vol: 0.22, f0: 300, f1: 60, verb: 0.4 }); this.tone(55, { type: 'sine', dec: 1.6, vol: 0.12, slide: 0.7 }); }
  strike() { this.noise({ dec: 0.18, vol: 0.28, f0: 7000, f1: 900, type: 'bandpass', q: 0.8 }); this.noise({ t: 0.05, dec: 1.2, vol: 0.18, f0: 260, f1: 50, verb: 0.3 }); }
  stormEnd() { [0, 2, 4, 7, 9].forEach((d, i) => this.kalimba(this._note(d, 1), { t: i * 0.07, vol: 0.09, dec: 0.9, verb: 0.6 })); }
  graze(n) { [0, 2, 4].forEach((d, i) => this.kalimba(this._note(d + Math.min(4, n / 3), 1), { t: i * 0.05, vol: 0.06, dec: 0.4, verb: 0.3, bright: 1.3 })); }
  jit() { this.sample('merge', { vol: 0.45, rate: 1.25 }); this.kalimba(this._note(9, 1), { t: 0.06, vol: 0.09, dec: 0.6, verb: 0.4, bright: 1.4 }); }
  tick(i) { this.kalimba(this._note(i % 10, 1), { vol: 0.035, dec: 0.12, verb: 0.1 }); }
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
