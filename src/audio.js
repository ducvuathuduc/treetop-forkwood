// All sound is synthesised at runtime with WebAudio: no audio files.
// A soft generative score in a major-pentatonic scale whose layers and tempo
// rise with height, plus short synth SFX for every game event.

const PENTA = [0, 2, 4, 7, 9];
const ROOTS = [57, 60, 62, 64, 65, 67, 69]; // per-stage root (MIDI)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('forkwood.muted') === '1';
    this.intensity = 0;
    this.stage = 0;
    this.nextBeat = 0;
    this.beat = 0;
    this.playing = false;
    this.frostGain = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      this.music = c.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
      // simple feedback delay for a sense of space
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.27;
      const fb = c.createGain(); fb.gain.value = 0.32;
      const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
      this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._startPad();
      this._startFrost();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('forkwood.muted', m ? '1' : '0');
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // -------------------------------------------------- building blocks
  _env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  tone(freq, { type = 'triangle', t = 0, a = 0.005, dec = 0.25, vol = 0.2, dest, slide = 0, echo = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + a + dec);
    const g = c.createGain(); this._env(g, now, a, vol, dec);
    o.connect(g); g.connect(dest || this.sfx);
    if (echo) { const e = c.createGain(); e.gain.value = echo; g.connect(e); e.connect(this.delay); }
    o.start(now); o.stop(now + a + dec + 0.05);
  }

  noise({ t = 0, dec = 0.2, vol = 0.3, f0 = 3000, f1 = 300, q = 1, type = 'lowpass' } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), now + dec);
    const g = c.createGain(); this._env(g, now, 0.004, vol, dec);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(now, Math.random() * 0.5); s.stop(now + dec + 0.05);
  }

  _note(deg, oct = 0) {
    const root = ROOTS[this.stage % ROOTS.length];
    const o = Math.floor(deg / 5);
    return mtof(root + 12 * (oct + o) + PENTA[((deg % 5) + 5) % 5]);
  }

  // -------------------------------------------------- music
  _startPad() {
    const c = this.ctx;
    this.padGain = c.createGain(); this.padGain.gain.value = 0.0001;
    this.padFilter = c.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 700; this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.padGain); this.padGain.connect(this.music);
    this.padOsc = [];
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth';
      o.detune.value = (i - 1) * 9;
      const g = c.createGain(); g.gain.value = i === 2 ? 0.5 : 0.12;
      o.connect(g); g.connect(this.padFilter); o.start();
      this.padOsc.push(o);
    }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
    const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(this.padFilter.frequency); lfo.start();
    this._setPadChord();
  }

  _setPadChord() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [this._note(0, -2), this._note(2, -1), this._note(0, -1)];
    this.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(notes[i], t, 0.6));
  }

  _startFrost() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 2;
    this.frostGain = c.createGain(); this.frostGain.gain.value = 0;
    s.connect(f); f.connect(this.frostGain); this.frostGain.connect(this.sfx); s.start();
  }

  setFrost(on) {
    if (this.frostGain) this.frostGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.08);
  }

  start() {
    if (!this.ctx) return;
    this.playing = true;
    this.beat = 0;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.padGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.8);
  }

  stop() {
    this.playing = false;
    if (this.padGain) this.padGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.6);
  }

  setStage(i) {
    if (i === this.stage) return;
    this.stage = i;
    this._setPadChord();
  }

  /** called every frame: schedules the generative arpeggio ahead of time */
  update(intensity, mult) {
    if (!this.ctx || !this.playing || this.ctx.state !== 'running') return;
    this.intensity = intensity;
    const bpm = 96 + intensity * 40;
    const spb = 60 / bpm / 2; // eighth notes
    const c = this.ctx;
    while (this.nextBeat < c.currentTime + 0.12) {
      const t = this.nextBeat - c.currentTime;
      const b = this.beat++;
      // pluck arpeggio: density grows with intensity
      const pattern = [0, 2, 4, 2, 3, 1, 4, 2];
      if (b % 2 === 0 || intensity > 0.35) {
        const deg = pattern[b % 8] + (b % 16 >= 8 ? 1 : 0);
        this.tone(this._note(deg, 0), { t, dec: 0.22, vol: 0.05 + 0.03 * intensity, type: 'triangle', dest: this.music, echo: 0.4 });
      }
      // soft kick + hat layers come in as the tree climbs
      if (intensity > 0.15 && b % 4 === 0) this.tone(110, { t, dec: 0.18, vol: 0.22 * Math.min(1, intensity * 2), type: 'sine', slide: 0.4, dest: this.music });
      if (intensity > 0.45 && b % 2 === 1) this.noise({ t, dec: 0.04, vol: 0.05, f0: 9000, f1: 7000, type: 'highpass' });
      if (mult >= 4 && b % 8 === 6) this.tone(this._note(4, 1), { t, dec: 0.3, vol: 0.04, type: 'sine', dest: this.music, echo: 0.5 });
      this.nextBeat += spb;
    }
  }

  // -------------------------------------------------- sfx
  collect(chain, forked) {
    const deg = Math.min(14, chain - 1);
    this.tone(this._note(deg, 1), { dec: 0.18, vol: 0.18, type: 'triangle', echo: 0.25 });
    this.tone(this._note(deg, 2), { dec: 0.09, vol: 0.05, type: 'sine' });
    if (forked) this.tone(this._note(deg + 2, 1) * 1.003, { t: 0.03, dec: 0.12, vol: 0.06, type: 'sine' });
  }
  fork() {
    this.tone(this._note(0, 0), { dec: 0.12, vol: 0.14, type: 'square', slide: 1.5 });
    this.tone(this._note(4, 0), { t: 0.05, dec: 0.14, vol: 0.1, type: 'square', slide: 1.5 });
    this.noise({ dec: 0.12, vol: 0.08, f0: 1500, f1: 5000, type: 'bandpass', q: 3 });
  }
  merge(mult) {
    [0, 2, 4, 5 + Math.min(4, mult)].forEach((d, i) => this.tone(this._note(d, 1), { t: i * 0.055, dec: 0.35, vol: 0.14, type: 'triangle', echo: 0.4 }));
    this.tone(this._note(0, -1), { dec: 0.4, vol: 0.2, type: 'sine' });
  }
  emptyMerge() { this.tone(this._note(0, 0), { dec: 0.1, vol: 0.06, type: 'sine' }); }
  revert() {
    this.tone(this._note(4, 0), { dec: 0.35, vol: 0.16, type: 'sawtooth', slide: 0.35 });
    this.noise({ dec: 0.25, vol: 0.18, f0: 2500, f1: 200 });
  }
  hit() {
    this.tone(150, { dec: 0.3, vol: 0.35, type: 'sine', slide: 0.3 });
    this.noise({ dec: 0.22, vol: 0.3, f0: 1800, f1: 120 });
  }
  near() { this.noise({ dec: 0.16, vol: 0.12, f0: 600, f1: 4000, type: 'bandpass', q: 4 }); }
  dew() { [0, 4, 7].forEach((d, i) => this.tone(this._note(d, 2), { t: i * 0.04, dec: 0.5, vol: 0.08, type: 'sine', echo: 0.5 })); }
  shield() { this.tone(this._note(0, 0), { dec: 0.4, vol: 0.12, type: 'square', slide: 2 }); }
  shieldBreak() { this.noise({ dec: 0.3, vol: 0.2, f0: 6000, f1: 800, type: 'bandpass', q: 2 }); }
  stageUp() { [0, 1, 2, 3, 4, 5, 7].forEach((d, i) => this.tone(this._note(d, 1), { t: i * 0.07, dec: 0.5, vol: 0.09, type: 'triangle', echo: 0.5 })); }
  newBest() { [4, 5, 7, 9].forEach((d, i) => this.tone(this._note(d, 1), { t: i * 0.09, dec: 0.4, vol: 0.1, type: 'square', echo: 0.4 })); }
  death() {
    [4, 2, 0, -3].forEach((d, i) => this.tone(this._note(d, 0), { t: i * 0.16, dec: 0.5, vol: 0.12, type: 'triangle', echo: 0.4 }));
  }
  click() { this.tone(this._note(2, 1), { dec: 0.06, vol: 0.08, type: 'sine' }); }
}
