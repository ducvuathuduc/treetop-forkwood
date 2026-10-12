// Forkwood V3.2 "Git you can hear": the music follows the branches.
// Loaded with the mixer (after first paint / first tap) and installed onto Sound.prototype.
//
//   stems ─ musicIn ─┬─ lowLP (trunk: bass stays centred) ─────────────────────────┐
//                    └─ hiHP ─┬─ v0 gain ─ pan0 ◄─ inj0 (branch synth voice) ─────┤
//                             ├─ dly1 ─ v1 gain ─ pan1 ◄─ inj1 ─────────────────────┼─ musicBus ─ duck ─ musicLP ─ master
//                             └─ dly2 ─ v2 gain ─ pan2 ◄─ inj2 ─────────────────────┘
//   sfx bus ─ sfxLP ─ master          (heartbeat + shimmer play on the sfx bus)
//   master ─ compressor ─ limiter ─ out
//
// Fork: the upper band of the music splits into one voice per tip, each panned to its tip's
// x (StereoPanner), the copies offset a few ms (chorus) so they read as two players; a
// two-note branch figure splits from unison. Merge: pans converge with the tips and the
// branch voices glide into a resolved chord that swells and fades. Revert: the cut branch
// drops away. Low sap (< 25%): the whole mix low-passes down with sap and a soft heartbeat
// speeds up as it falls; catching sunlight throws the filter open with a bright shimmer.
// Golden hour: every stem comes in and the music lifts a whole tone (stems + tonal sfx +
// branch voices), then settles back down when it ends.
//
// CPU: every routing node is built once; per frame only AudioParams are touched, and only
// when the value moved. Nodes are made per musical event (a fork, a merge, a heartbeat)
// never per frame. Lite mode (quality low or the lowest auto tier) drops the chorus LFO and
// the branch synth and keeps only the panning, filter and heartbeat.
import { W, FORK_SPREAD } from './sim.js';
import { WORLD_SHIFT } from './audio-mixer.js';

export const LOW_SAP = 0.25;      // sap fraction where the mix starts to close in
export const LIFT_SEMIS = 2;      // golden hour key lift (a whole tone)
export const MAX_GIT_VOICES = 3;  // stem copies (sim forks to 2 tips; more tips are distributed)
const XOVER = 220;                // Hz: below stays centred (the trunk), above follows the tips
const LP_OPEN = 16000, LP_SHUT = 360, SFX_SHUT = 3600;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** exponential lerp between two frequencies, k = 0..1 */
const elerp = (lo, hi, k) => lo * Math.pow(hi / lo, clamp(k, 0, 1));

/** Pan for each git voice given the tips (pure: used by the game and the tests). */
export function voicePans(tips, cx = W / 2, voices = MAX_GIT_VOICES) {
  const n = tips.length;
  const centre = clamp((cx - W / 2) / (W / 2), -1, 1) * 0.35;
  const panOf = (x) => clamp(centre + 0.65 * (x - cx) / FORK_SPREAD, -0.9, 0.9);
  if (n <= 1) return { gains: [1, 0, 0].slice(0, voices), pans: [n ? clamp((tips[0].x - W / 2) / (W / 2), -1, 1) * 0.35 : 0, 0, 0].slice(0, voices) };
  const V = Math.min(n, voices), g = 1 / Math.sqrt(V), gains = [], pans = [];
  for (let i = 0; i < voices; i++) {
    if (i >= V) { gains.push(0); pans.push(0); continue; }
    const t = tips[Math.round(i * (n - 1) / (V - 1))];
    gains.push(g); pans.push(panOf(t.x));
  }
  return { gains, pans };
}

/** Heartbeat tempo (bpm) and level for a sap fraction; null above LOW_SAP. */
export function heartbeat(f) {
  if (!(f < LOW_SAP) || f <= 0) return null;
  const k = 1 - clamp(f / LOW_SAP, 0, 1); // 0 at the threshold → 1 empty
  return { bpm: 62 + 78 * k, vol: 0.35 + 0.5 * k };
}

/** Music and sfx low-pass cutoffs for a sap fraction plus the sunlight "open" boost (0..1). */
export function sapCutoffs(f, open = 0) {
  const k = clamp(f / LOW_SAP, 0, 1), o = clamp(open, 0, 1);
  const k2 = k + (1 - k) * o; // sunlight lifts the cutoff toward fully open
  return { music: f >= LOW_SAP ? LP_OPEN : elerp(LP_SHUT, LP_OPEN, k2 * k2 * (3 - 2 * k2) * 0.85 + k2 * 0.15), sfx: f >= LOW_SAP ? LP_OPEN : elerp(SFX_SHUT, LP_OPEN, k2) };
}

class Git {
  /** True when the quality setting asks for the lighter audio graph. */
  _gitLite() {
    let mode = null;
    try { mode = typeof window !== 'undefined' && window.forkwood && window.forkwood.quality ? window.forkwood.quality.mode : null; } catch { /* hooks not up */ }
    return !!this.lowMemory || mode === 'low';
  }

  /** Build the routing once (after the context exists). Safe to call again; never throws. */
  _gitBuild() {
    if (this._git !== undefined || !this.ctx) return this._git;
    try {
      const c = this.ctx, lite = this._gitLite();
      const G = { lite, voices: [], pans: [], gains: [], n: 1, open: 0, hbNext: 0, sapF: 1, lpF: LP_OPEN, sfxF: LP_OPEN, synth: null, lift: 0 };
      G.musicIn = c.createGain();
      G.lowLP = c.createBiquadFilter(); G.lowLP.type = 'lowpass'; G.lowLP.frequency.value = XOVER; G.lowLP.Q.value = 0.5;
      G.hiHP = c.createBiquadFilter(); G.hiHP.type = 'highpass'; G.hiHP.frequency.value = XOVER; G.hiHP.Q.value = 0.5;
      G.musicIn.connect(G.lowLP); G.lowLP.connect(this.musicBus);
      G.musicIn.connect(G.hiHP);
      const canPan = typeof c.createStereoPanner === 'function';
      for (let i = 0; i < MAX_GIT_VOICES; i++) {
        const g = c.createGain(); g.gain.value = i ? 0 : 1;
        let src = G.hiHP, dly = null;
        if (i && typeof c.createDelay === 'function') { dly = c.createDelay(0.05); dly.delayTime.value = i === 1 ? 0.013 : 0.021; G.hiHP.connect(dly); src = dly; }
        src.connect(g);
        const pan = canPan ? c.createStereoPanner() : c.createGain();
        const inj = c.createGain(); inj.gain.value = 1;
        g.connect(pan); inj.connect(pan); pan.connect(this.musicBus);
        G.voices.push({ g, pan, inj, dly });
        G.pans.push(0); G.gains.push(i ? 0 : 1);
      }
      G.canPan = canPan;
      if (!lite && G.voices[1].dly) {
        // one shared slow LFO wobbles the copies' delay (± 2.5 ms): two players, not a comb
        G.lfo = c.createOscillator(); G.lfo.frequency.value = 0.23;
        G.lfoA = c.createGain(); G.lfoA.gain.value = 0.0025; G.lfoB = c.createGain(); G.lfoB.gain.value = -0.0025;
        G.lfo.connect(G.lfoA); G.lfo.connect(G.lfoB); G.lfoA.connect(G.voices[1].dly.delayTime); G.lfoB.connect(G.voices[2].dly.delayTime);
        G.lfo.start();
      }
      // sfx low-pass (low sap closes the whole mix a little, never below 3.6 kHz: warnings stay clear)
      G.sfxLP = c.createBiquadFilter(); G.sfxLP.type = 'lowpass'; G.sfxLP.frequency.value = LP_OPEN; G.sfxLP.Q.value = 0.5;
      this.sfx.disconnect(); this.sfx.connect(G.sfxLP); G.sfxLP.connect(this.master);
      // heartbeat + shimmer, rendered once into buffers
      G.hbBuf = renderHeartbeat(c);
      G.shimBuf = renderShimmer(c);
      G.hbGain = c.createGain(); G.hbGain.gain.value = 0.5; G.hbGain.connect(this.sfx);
      this._git = G;
    } catch (err) {
      this._git = null; // missing node type (old browser / test mock): the mixer runs as before
    }
    return this._git;
  }

  /** Where the music stems connect (the git split when it exists). */
  _musicDest() { return (this._git && this._git.musicIn) || this.musicBus; }

  /** Low sap: f = sap fraction. Called every frame by main.js. */
  setLowSap(f) {
    const G = this._git;
    if (!G) { // before the mixer loads: the v1 behaviour, retuned to the 25% threshold
      if (!this.musicLP || !this.ctx) return;
      const k = clamp(f / LOW_SAP, 0, 1);
      this.musicLP.frequency.setTargetAtTime(elerp(LP_SHUT, LP_OPEN, k), this.ctx.currentTime, 0.15);
      return;
    }
    G.sapF = f;
    this._gitFilters(0.12);
  }

  _gitFilters(tc) {
    const G = this._git, c = this.ctx;
    if (!G || !c) return;
    const { music, sfx } = sapCutoffs(G.sapF, G.open);
    const t = c.currentTime;
    if (Math.abs(Math.log(music / G.lpF)) > 0.02) { G.lpF = music; this.musicLP.frequency.setTargetAtTime(music, t, tc); }
    if (Math.abs(Math.log(sfx / G.sfxF)) > 0.02) { G.sfxF = sfx; G.sfxLP.frequency.setTargetAtTime(sfx, t, tc); }
  }

  /** The run's sim (main.js exposes it on window.forkwood; tests and renders set _simRef). */
  _gitSim() {
    if (this._simRef) return this._simRef();
    try { return typeof window !== 'undefined' && window.forkwood ? window.forkwood.sim : null; } catch { return null; }
  }

  /** Per frame (from update): follow the tips, decay the sunlight boost, schedule heartbeats. */
  _gitTick() {
    const G = this._git, c = this.ctx;
    if (!G || !c || c.state !== 'running') return;
    const now = c.currentTime, dt = G.lastT ? clamp(now - G.lastT, 0, 0.1) : 0;
    G.lastT = now;
    const sim = this.playing && !this.menu ? this._gitSim() : null;
    const live = sim && !sim.dead && sim.tips && sim.tips.length;
    const { gains, pans } = live ? voicePans(sim.tips, sim.cx) : voicePans([]);
    const n = live ? sim.tips.length : 1;
    if (n !== G.n) { G.n = n; if (n === 1 && G.synth && !G.synth.resolving) this._gitRelease(0.35); }
    for (let i = 0; i < MAX_GIT_VOICES; i++) {
      const v = G.voices[i];
      if (Math.abs(gains[i] - G.gains[i]) > 0.01) { G.gains[i] = gains[i]; v.g.gain.setTargetAtTime(gains[i], now, gains[i] > G.gains[i] ? 0.03 : 0.12); }
      if (G.canPan && Math.abs(pans[i] - G.pans[i]) > 0.015) { G.pans[i] = pans[i]; v.pan.pan.setTargetAtTime(pans[i], now, 0.06); }
    }
    // sunlight boost decays back to the sap filter
    if (G.open > 0) { G.open = Math.max(0, G.open - dt * 1.4); this._gitFilters(G.open > 0 ? 0.08 : 0.2); }
    // heartbeat: one buffer source per beat, scheduled a little ahead
    const hb = this.playing && !this.menu && sim && !sim.dead ? heartbeat(G.sapF) : null;
    if (!hb) { G.hbNext = 0; return; }
    if (G.hbNext < now - 0.3 || !G.hbNext) G.hbNext = now + 0.05;
    G.hbGain.gain.setTargetAtTime(hb.vol, now, 0.2);
    while (G.hbNext < now + 0.12) {
      const s = c.createBufferSource(); s.buffer = G.hbBuf; s.connect(G.hbGain); s.start(G.hbNext);
      G.hbNext += 60 / hb.bpm;
    }
  }

  /** Sim events for the music layer (called by onEvents for every event, v1 ones included). */
  _gitEvent(e) {
    const G = this._git;
    if (!G || !this.ctx || !e) return;
    switch (e.type) {
      case 'fork': return this._gitFork();
      case 'merge': return this._gitResolve(e.mult || 1);
      case 'revert': return this._gitRelease(0.25, -2);
      case 'collect': if (G.sapF < LOW_SAP) this._gitSunlight(e.chain || 1); return;
      case 'golden': return this._gitLift(true);
      case 'goldenend': return this._gitLift(false);
      case 'death': case 'finish': this._gitRelease(0.6); this._gitLift(false); G.hbNext = 0; return;
      default:
    }
  }

  _root() { return 60 + (WORLD_SHIFT[this.world] || 0) + (this._git ? this._git.lift : 0); }

  /** Branch figure: one note splits into two that drift apart, one per tip panner. */
  _gitFork() {
    const G = this._git;
    if (G.lite || this.muted) return;
    this._gitRelease(0.08);
    const c = this.ctx, t = c.currentTime + 0.01, r = this._root();
    const osc = [], env = [];
    const to = [r + 7, r + 16]; // fifth below the octave / third above it (inside the pentatonic)
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(mtof(r + 12), t);
      o.frequency.setTargetAtTime(mtof(to[i]), t + 0.06, 0.09);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.setTargetAtTime(0.016, t + 0.05, 0.35); // settles into a soft held interval
      o.connect(g); g.connect(G.voices[i].inj); o.start(t);
      osc.push(o); env.push(g);
    }
    G.synth = { osc, env, notes: to, t0: t };
    G.synth.auto = setTimeout(() => { if (G.synth && G.synth.osc === osc) this._gitRelease(1.2); }, 14000);
  }

  /** Merge: the branch voices glide into a resolved chord and swell, then fade. */
  _gitResolve(mult) {
    const G = this._git, c = this.ctx;
    if (G.lite || this.muted) { this._gitRelease(0.2); return; }
    const t = c.currentTime + 0.01, r = this._root();
    const chord = [r + 12, r + 16, r + 19].concat(mult >= 4 ? [r + 23] : []);
    const prev = G.synth;
    if (prev && prev.auto) clearTimeout(prev.auto);
    const osc = [], env = [];
    chord.forEach((m, i) => {
      let o, g;
      if (prev && prev.osc[i]) { o = prev.osc[i]; g = prev.env[i]; o.frequency.cancelScheduledValues(t); o.frequency.setTargetAtTime(mtof(m), t, 0.05); g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); }
      else {
        o = c.createOscillator(); o.type = i === 3 ? 'sine' : 'triangle'; o.frequency.setValueAtTime(mtof(m), t);
        g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
        o.connect(g); g.connect(G.voices[0].inj); o.start(t);
      }
      const peak = (i === 3 ? 0.03 : 0.055) * (1 + Math.min(4, mult) * 0.06);
      g.gain.linearRampToValueAtTime(peak, t + 0.16);
      g.gain.setTargetAtTime(0.0001, t + 0.3, 0.45);
      o.stop(t + 2.6);
      osc.push(o); env.push(g);
    });
    // the trunk under the chord: a low root swell, centred
    const b = c.createOscillator(); b.type = 'sine'; b.frequency.setValueAtTime(mtof(r - 12), t);
    const bg = c.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.09, t + 0.14); bg.gain.setTargetAtTime(0.0001, t + 0.3, 0.4);
    b.connect(bg); bg.connect(G.musicIn); b.start(t); b.stop(t + 2.2);
    G.synth = { osc, env, resolving: true };
    setTimeout(() => { if (G.synth && G.synth.osc === osc) G.synth = null; }, 2700);
  }

  /** Fade the branch voices (bend: semitones to drop as they go, for a revert). */
  _gitRelease(sec = 0.3, bend = 0) {
    const G = this._git, S = G && G.synth;
    if (!S) return;
    G.synth = null;
    if (S.auto) clearTimeout(S.auto);
    const t = this.ctx.currentTime;
    S.env.forEach((g) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.setTargetAtTime(0.0001, t, sec / 3); });
    S.osc.forEach((o) => { if (bend) o.frequency.setTargetAtTime(o.frequency.value * Math.pow(2, bend / 12), t, sec / 2); try { o.stop(t + sec + 0.1); } catch { /* stopped */ } });
  }

  /** Sunlight caught while low: throw the filter open and add a bright shimmer. */
  _gitSunlight(chain) {
    const G = this._git, c = this.ctx;
    G.open = 1;
    this._gitFilters(0.03);
    if (this.muted) return;
    const s = c.createBufferSource(); s.buffer = G.shimBuf;
    s.playbackRate.value = Math.pow(2, ((WORLD_SHIFT[this.world] || 0) + G.lift + [0, 2, 4, 7, 9][Math.min(4, chain - 1)]) / 12);
    const g = c.createGain(); g.gain.value = 0.55;
    s.connect(g); g.connect(this.sfx);
    if (this.verbIn) { const v = c.createGain(); v.gain.value = 0.35; g.connect(v); v.connect(this.verbIn); }
    s.start(c.currentTime + 0.005);
    s.onended = () => { try { g.disconnect(); } catch { /* gone */ } };
  }

  /** Golden hour: all stems in + a whole-tone lift; off settles back. */
  _gitLift(on) {
    const G = this._git;
    if (!G || !!G.lift === on) return;
    G.lift = on ? LIFT_SEMIS : 0;
    this.keyLift = G.lift;
    this.goldenFull = on;
    G.musicIn.gain.setTargetAtTime(on ? 1.19 : 1, this.ctx.currentTime, on ? 0.15 : 0.8); // +1.5 dB lift (the limiter guards)
    const st = this.stems;
    if (st && this._setStemRate) this._setStemRate(st, Math.pow(2, G.lift / 12), on ? 0.45 : 1.8);
    if (this._levels) this._levels();
    if (on && !this.muted && G.shimBuf) {
      // the "wow": a bright cascade over the lift
      const c = this.ctx;
      for (let i = 0; i < 2; i++) {
        const s = c.createBufferSource(); s.buffer = G.shimBuf;
        s.playbackRate.value = Math.pow(2, ((WORLD_SHIFT[this.world] || 0) + G.lift + i * 7) / 12);
        const g = c.createGain(); g.gain.value = 0.4;
        s.connect(g); g.connect(this.sfx);
        if (this.verbIn) { const v = c.createGain(); v.gain.value = 0.5; g.connect(v); v.connect(this.verbIn); }
        s.start(c.currentTime + 0.05 + i * 0.22);
      }
    }
  }
}

/** Soft "lub-dub", 0.5 s mono. */
function renderHeartbeat(c) {
  const sr = c.sampleRate, n = Math.round(sr * 0.5), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
  const thump = (t0, f0, amp) => {
    let ph = 0;
    for (let i = Math.round(t0 * sr); i < n; i++) {
      const t = i / sr - t0, f = f0 * (0.7 + 0.3 * Math.exp(-t * 30));
      ph += 2 * Math.PI * f / sr;
      d[i] += amp * Math.sin(ph) * Math.exp(-t * 16) * Math.min(1, t * 400);
    }
  };
  thump(0, 62, 0.8); thump(0.17, 52, 0.55);
  return b;
}

/** Bright shimmer: staggered high pentatonic partials with a fast sparkle, 1 s mono. */
function renderShimmer(c) {
  const sr = c.sampleRate, n = Math.round(sr), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
  const notes = [72, 76, 79, 84, 88, 91];
  notes.forEach((m, k) => {
    const f = mtof(m), t0 = k * 0.045;
    for (let i = Math.round(t0 * sr); i < n; i++) {
      const t = i / sr - t0;
      const e = Math.exp(-t * 4.5) * Math.min(1, t * 300) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 11 * t + k));
      d[i] += 0.09 * e * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.01 * t));
    }
  });
  return b;
}

/** Copy the git layer onto Sound.prototype (idempotent). */
export function installGit(Sound) {
  if (Sound.prototype._gitInstalled) return;
  for (const k of Object.getOwnPropertyNames(Git.prototype)) {
    if (k !== 'constructor') Object.defineProperty(Sound.prototype, k, Object.getOwnPropertyDescriptor(Git.prototype, k));
  }
  Sound.prototype._gitInstalled = true;
}
