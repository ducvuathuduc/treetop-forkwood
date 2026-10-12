// Forkwood 2.0 audio mixer: loaded after first paint by src/audio.js (Sound._mixer) and
// installed onto Sound.prototype. Holds the asset loading, sprite playback, music stems,
// ducking, intensity cross-fades and the sim-event map. See work/v2/AUDIO-REPORT.md.
import { LegacySound, WORLDS } from './audio.js';
import { installGit } from './audio-git.js'; // V3.2-AUDIO: git you can hear

export const MANIFEST_URL = 'assets/v2/common/audio/audio.json';
const COMMON_DIR = 'assets/v2/common/audio/';
const SHARED = ['ui', 'play', 'traps'];
// shared tonal cues are written in C major pentatonic; retune them so they sit inside
// each world's music (semitones; minor/modal worlds use the pentatonic that fits them)
export const WORLD_SHIFT = { meadow: 2, starry: 3, fresco: 0, ukiyo: -2, lilies: 1, gilded: 4, lacquer: 5 };
const PENTA = [0, 2, 4, 7, 9];
const pentaSemis = (d) => 12 * Math.floor(d / 5) + PENTA[((d % 5) + 5) % 5];
// per-class level on the sfx bus (the files are already loudness-matched per class)
const CLASS_GAIN = { ui: 0.9, feedback: 1, fx: 1, warn: 1, tell: 1, reward: 1 };
const CLASS_VERB = { ui: 0, feedback: 0.12, fx: 0.08, warn: 0.05, tell: 0.1, reward: 0.22 };
const MAX_VOICES = 20;

/** MECH world-trap name (the `<world>.trap.<name>` skin) → AUDIO's signature trap cue for
 *  that world, when the names differ. Other world traps use their mechanic's generic cue. */
export const TRAP_ALIAS = {
  'meadow.bees': 'wasp', 'meadow.breeze': 'gust', 'meadow.thistle': 'thistle',
  'starry.crowflock': 'crowflock', 'starry.swirl': 'swirl', 'starry.cypressgate': 'cypress', 'starry.fallingstar': 'starfall',
  'fresco.plaster': 'plaster', 'fresco.censer': 'censer', 'fresco.candledrip': 'candle', 'fresco.organpipes': 'bell',
  'ukiyo.wavecrest': 'wave', 'ukiyo.spray': 'foam', 'ukiyo.seawind': 'wind', 'ukiyo.hawk': 'crane',
  'lilies.dragonflies': 'dragonfly', 'lilies.pollen': 'pollen', 'lilies.sinkpad': 'ripple', 'lilies.turtle': 'heron',
  'gilded.spirals': 'spiral', 'gilded.mosaic': 'tesserae', 'gilded.glare': 'eye', 'gilded.flakes': 'leafstorm',
  'lacquer.lanternfire': 'lantern', 'lacquer.firecracker': 'firecracker', 'lacquer.lanternswing': 'dragon', 'lacquer.egret': 'kite',
};
/** MECH ids that differ from the cue names */
export const PICKUP_ALIAS = { bubble: 'dew', twin: 'twinseed', sail: 'leafsail', 'bubble.pop': 'dew.pop', 'goldleaf.save': 'goldleaf' };
export const RIDE_ALIAS = { rail: 'beanstalk' };
export const BOSS_WORLD = { giant: 'meadow', crowking: 'starry', gargoyle: 'fresco', kitsune: 'ukiyo', heron: 'lilies', stag: 'gilded', dragon: 'lacquer' };
/** boss attack kind → cue slot: a1 sweep, a2 slam/dive/grab, a3 volley/projectiles */
export const ATTACK_SLOT = { sweep: 1, dive: 2, dive2: 2, grab: 2, plates: 2, volley: 3, orbs: 3, coins: 3, ring: 3 };
const SP_KINDS = ['calm', 'chase', 'boss'];
/** generic (v1/v12) trap → [tell, fire] sound ids */
export const GENERIC_TRAP = {
  twig: ['trap.twig.creak', 'trap.twig.snap'], pulse: [null, 'trap.pulse'], door: [null, 'trap.door'], gust: ['trap.gust', 'trap.gust'],
  sap: [null, 'trap.sap'], lure: [null, 'trap.lure'], twins: ['trap.twins', 'trap.twins'], tide: ['trap.tide', null],
  crow: ['trap.crow.caw', 'trap.crow.dive'], web: [null, 'trap.web'], pecker: ['trap.pecker', 'trap.pecker'], cone: [null, 'trap.cone'],
  hornets: ['trap.hornets', null], jaws: ['trap.jaws.quiver', 'trap.jaws'], spores: [null, 'trap.spores'], icicle: ['trap.icicle.shake', 'trap.icicle.crack'],
  seesaw: ['trap.seesaw', null], embers: [null, 'trap.embers'], bats: ['trap.bats.squeak', 'trap.bats.swoop'], candy: ['trap.candy.tick', 'trap.candy.crunch'],
  strangle: ['trap.strangle', null], pendulum: ['trap.pendulum', 'trap.pendulum'], beetle: ['hazard.beetle', null], frost: ['hazard.frost', null], wind: ['hazard.wind', null],
};
/** v1 sim events that main.js already voices through the legacy methods. onEvents()
 *  skips them unless called with {all: true} (then they map to the v2 core cues). */
export const LEGACY_EVENTS = {
  collect: 'core.collect', fork: 'core.fork', merge: 'core.merge', emptymerge: 'core.merge.empty', revert: 'core.revert', hit: 'core.hit',
  near: 'core.near', shieldbreak: 'core.shield.break', golden: 'core.golden.start', goldenend: 'core.golden.end', stage: 'core.stage',
  newbest: 'core.newbest', death: 'core.death', finish: 'core.finish', revive: 'core.revive', charged: 'core.charged', storm: 'core.storm',
  strike: 'core.strike', stormend: 'core.storm.end', straddle: 'core.straddle', splitpass: 'core.graze', puend: 'pickup.end', pickup: null,
};


class Mixer {
  /** Kick off the shared sprites and the music once the mixer is installed and a context exists. */
  _mixerReady() {
    if (this._gitBuild) this._gitBuild(); // V3.2-AUDIO: branch voices / low-sap / lift graph (before any stem attaches)
    // ui first (smallest, needed by the very next tap), then play, then the music
    const ui = this._sprite('ui');
    this._manifest().then((m) => {
      if (!m) { this._legacyMusic(); return; }
      ui.then(() => this._sprite('play'));
      if (this.wantMusic) this.music(this.world);
    });
  }

  // ------------------------------------------------------------ loading
  _url(entry) { return entry[this.fmt] || entry.ogg; }


  _fetch(url) {
    if (!this._bytes2.has(url)) {
      const p = typeof fetch === 'function' ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : Promise.resolve(null);
      this._bytes2.set(url, p);
    }
    return this._bytes2.get(url);
  }


  _decode(ab) {
    const c = this.ctx;
    if (!c || !ab) return Promise.resolve(null);
    return new Promise((res) => {
      let done = false;
      const ok = (b) => { if (!done) { done = true; res(b || null); } };
      try { const p = c.decodeAudioData(ab.slice(0), ok, () => ok(null)); if (p && p.then) p.then(ok, () => ok(null)); } catch { ok(null); }
    });
  }


  _manifest() {
    if (!this._manP) {
      this._manP = (this._manEarly || (typeof fetch === 'function' ? fetch(MANIFEST_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)))
        .then((m) => { this.man = m && m.clips ? m : null; this.v2 = !!this.man; if (!this.v2) this._legacyMusic(); return this.man; });
    }
    return this._manP;
  }


  /** v1 idle hook: prefetch the v2 manifest and sprite bytes (decode waits for the tap). */
  _sfx() {
    return this._manifest().then((m) => {
      if (m) { for (const g of ['ui', 'play']) if (m.sprites[g]) this._fetch(this._url(m.sprites[g])); return null; }
      return LegacySound.prototype._sfx.call(this);
    });
  }


  _sprite(g) {
    if (this.sprites[g]) return Promise.resolve(this.sprites[g]);
    if (!this._spriteP[g]) {
      // the shared sprites have fixed names, so their bytes start downloading in parallel
      // with the manifest instead of after it (one round trip less after the first tap)
      const early = SHARED.includes(g) ? this._fetch(`${COMMON_DIR}sfx-${g}.${this.fmt}`) : null;
      this._spriteP[g] = this._manifest().then((m) => {
        const e = m && m.sprites[g];
        if (!e || !this.ctx) { delete this._spriteP[g]; return null; }
        return (early && e[this.fmt] === `${COMMON_DIR}sfx-${g}.${this.fmt}` ? early : this._fetch(this._url(e))).then((ab) => this._decode(ab)).then((b) => {
          if (!b) { delete this._spriteP[g]; return null; }
          this.sprites[g] = b;
          return b;
        });
      });
    }
    return this._spriteP[g];
  }


  /** Drop another world's decoded assets (keeps memory to one world). */
  _evict(keep) {
    for (const w of WORLDS) if (w !== keep) { delete this.sprites[w]; delete this._spriteP[w]; }
    for (const k of Object.keys(this._stemBuf)) if (!k.startsWith(keep + ':')) delete this._stemBuf[k];
    for (const [u] of this._bytes2) if (/assets\/v2\/(meadow|starry|fresco|ukiyo|lilies|gilded|lacquer)\//.test(u) && !u.includes(`/v2/${keep}/`)) this._bytes2.delete(u);
  }


  // ------------------------------------------------------------ sfx
  /**
   * Play a sound by id. opts: rate, vol (0..1+), pan (-1..1), t (delay s), step (pentatonic
   * degree above the base pitch, for chains and counters). Returns true when it played from
   * the sprite; unknown or not-yet-loaded ids fall back to a soft synth cue and return false.
   */
  play(id, opts = {}, noFallback = false) {
    if (!this.ctx) return false;
    const c = this.man && this.man.clips[id];
    const buf = c && this.sprites[c.g];
    if (!buf) {
      if (c) this._sprite(c.g);
      if (!noFallback) this._fallback(id);
      return false;
    }
    if (this.muted || this.ctx.state !== 'running') return true;
    const now = this.ctx.currentTime;
    const last = this._last.get(id) || -1;
    if (now - last < (opts.minGap ?? 0.035) && !opts.t) return true; // never stack the same cue in one frame
    this._last.set(id, now);
    if (this.voices >= MAX_VOICES && c.c !== 'warn' && c.c !== 'reward') return true;
    let rate = opts.rate || 1;
    if (c.tonal) rate *= Math.pow(2, ((WORLD_SHIFT[this.world] || 0) + (this.keyLift || 0)) / 12); // V3.2: golden hour lift
    if (opts.step != null) rate *= Math.pow(2, pentaSemis(Math.round(opts.step)) / 12);
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = (opts.vol ?? 1) * (CLASS_GAIN[c.c] ?? 1);
    let node = g;
    s.connect(g);
    if (opts.pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); g.connect(p); node = p; }
    this._out(node, this.sfx, opts.verb ?? CLASS_VERB[c.c] ?? 0);
    const at = now + (opts.t || 0);
    s.start(at, c.o, c.d);
    this.voices++;
    s.onended = () => { this.voices = Math.max(0, this.voices - 1); try { g.disconnect(); } catch { /* gone */ } };
    if (c.duck) this.duck(c.duck, 0.2 + c.d / rate * 0.8, opts.t || 0);
    return true;
  }


  /** Is this id in the manifest (loaded or not)? */
  has(id) { return !!(this.man && this.man.clips[id]); }


  /** Soft synth stand-in while a sprite loads, so nothing important is ever silent. */
  _fallback(id) {
    if (!this.ctx || this.muted) return;
    if (id.startsWith('trap.warn') || id === 'boss.windup') { this.kalimba(this._note(5, 1), { vol: 0.08, dec: 0.15 }); this.kalimba(this._note(7, 1), { t: 0.11, vol: 0.08, dec: 0.15 }); return; }
    if (id.startsWith('ui.')) { this.tone(this._note(2, 1), { dec: 0.06, vol: 0.06, type: 'sine' }); return; }
    if (/\.(fire|a[123]|hit|eject)$/.test(id) || id.startsWith('trap.')) { this.noise({ dec: 0.12, vol: 0.07, f0: 1500, f1: 300 }); return; }
    if (/\.tell$/.test(id)) return; // the shared warning already plays with every tell
    this.kalimba(this._note(4, 1), { vol: 0.06, dec: 0.3, verb: 0.3 });
  }


  /** Dip the music bus by `amount` (0..1) for `sec`, then recover. Overlaps keep the deepest. */
  duck(amount = 0.5, sec = 0.6, delay = 0) {
    if (!this.duckGain) return;
    const t = this.ctx.currentTime + delay, lvl = Math.max(0.05, 1 - Math.max(0, Math.min(0.95, amount)));
    if (this._duckUntil && t < this._duckUntil && lvl > this._duckLvl) return;
    this._duckUntil = t + sec; this._duckLvl = lvl;
    const p = this.duckGain.gain;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(lvl, t, 0.04);
    p.setTargetAtTime(1, t + sec, 0.35);
  }


  // ------------------------------------------------------------ music
  /** Start (or cross-fade to) a world's music loop. Lazy-loads its calm stem and sprite. */
  music(worldId = this.world) {
    if (!WORLDS.includes(worldId)) worldId = 'meadow';
    const changed = worldId !== this.world;
    this.world = worldId;
    this.wantMusic = true;
    if (!this.ctx) return; // starts after the first tap (unlock → _afterCtx)
    this._manifest().then((m) => {
      if (!m || !m.music[worldId] || this.world !== worldId) return;
      if (changed) this._evict(worldId);
      this._sprite(worldId);
      if (this.stems && this.stems.world === worldId) return this._levels();
      this._stem(worldId, 'calm').then((b) => {
        if (!b || this.world !== worldId || !this.wantMusic) return;
        if (this.stems && this.stems.world === worldId) return;
        this._startStems(worldId, b, m.music[worldId]);
      });
    });
  }


  _stem(w, stem) {
    const k = `${w}:${stem}`;
    if (!this._stemBuf[k]) {
      const e = this.man && this.man.music[w] && this.man.music[w].stems[stem];
      if (!e) return Promise.resolve(null);
      const info = this.man.music[w];
      this._stemBuf[k] = this._fetch(this._url(e)).then((ab) => this._decode(ab)).then((b) => {
        if (!b) { delete this._stemBuf[k]; return null; }
        sealLoop(b, info.loopStart, info.loopEnd);
        return b;
      });
    }
    return this._stemBuf[k];
  }


  /** Decode a set piece's stem ahead of time (call ~5 s before chase/boss starts). */
  prepare(level) {
    if (!this.ctx || !this.man) return;
    if (level === 'chase' || level === 'boss') this._stem(this.world, 'chase');
    if (level === 'boss') this._stem(this.world, 'boss');
  }


  _startStems(w, calmBuf, info) {
    const c = this.ctx, now = c.currentTime + 0.05;
    this._stopStems(1.6);
    const len = info.loopEnd - info.loopStart;
    const r0 = Math.pow(2, (this.keyLift || 0) / 12);
    const st = { world: w, t0: now, info, len, src: {}, gain: {}, anc: { t: now, pos: 0, r0, r1: r0, d: 0 } }; // V3.2: playhead anchor (rate can change)
    this.stems = st;
    this._attach(st, 'calm', calmBuf, 0.0001);
    st.gain.calm.gain.setTargetAtTime(1, now, 0.6); // fade in
    this._levels();
    // the other stems arrive in the background once the calm loop runs (skipped on the
    // lowest quality tier until a set piece asks for them)
    if (!this.lowMemory) setTimeout(() => this.prepare('boss'), 4000);
  }


  _attach(st, stem, buf, g0) {
    if (st.src[stem] || this.stems !== st) return;
    const c = this.ctx, now = c.currentTime + 0.02;
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true; s.loopStart = st.info.loopStart; s.loopEnd = st.info.loopEnd;
    const g = c.createGain(); g.gain.value = g0;
    s.connect(g); g.connect(this._musicDest ? this._musicDest() : this.musicBus);
    // V3.2: phase from the playhead anchor (golden hour changes the rate), same rate automation as the others
    const a = st.anc, pos = a ? stemPos(a, now) : now - st.t0;
    const off = st.info.loopStart + (((pos % st.len) + st.len) % st.len);
    if (a) { s.playbackRate.value = stemRate(a, now); if (now < a.t + a.d) s.playbackRate.linearRampToValueAtTime(a.r1, a.t + a.d); }
    s.start(now, off);
    st.src[stem] = s; st.gain[stem] = g;
  }


  _stopStems(fade = 1.2) {
    const st = this.stems;
    if (!st) return;
    this.stems = null;
    const t = this.ctx.currentTime;
    for (const k of Object.keys(st.src)) {
      try { st.gain[k].gain.setTargetAtTime(0.0001, t, fade / 4); st.src[k].stop(t + fade + 0.1); } catch { /* already stopped */ }
    }
  }


  /** V3.2: ramp every stem's playback rate together (key lift); keeps the anchor exact. */
  _setStemRate(st, r, d = 0.5) {
    if (!st || !st.anc || !this.ctx) return;
    const t = this.ctx.currentTime + 0.02, cur = stemRate(st.anc, t);
    st.anc = { t, pos: stemPos(st.anc, t), r0: cur, r1: r, d };
    for (const k of Object.keys(st.src)) {
      const p = st.src[k].playbackRate;
      p.cancelScheduledValues(t); p.setValueAtTime(cur, t); p.linearRampToValueAtTime(r, t + d);
    }
  }


  /** V3-FEEL: 0..0.55, the combo / flow lift (chase stem under the calm loop). */
  setFeelLift(v) {
    const q = Math.round(Math.max(0, Math.min(0.55, v)) * 20) / 20;
    if (q === this.feelLift) return;
    this.feelLift = q; this._levels();
  }


  /** Intensity by set piece: 'calm' | 'chase' | 'boss'. Layers cross-fade in sync. */
  setIntensity(level = 'calm') {
    this.level = ['calm', 'chase', 'boss'].includes(level) ? level : 'calm';
    this.prepare(this.level);
    this._levels();
  }


  _levels() {
    const st = this.stems;
    if (!st || !this.ctx) return;
    const want = { calm: 1, chase: this.level !== 'calm' ? 1 : (this.feelLift || 0), boss: this.level === 'boss' ? 1 : 0 }; // V3-FEEL: the chase stem rises a little with the combo
    if (this.goldenFull) { want.chase = 1; if (!this.lowMemory || st.src.boss) want.boss = Math.max(want.boss, 0.8); } // V3.2: golden hour = the full stem
    const t = this.ctx.currentTime;
    for (const stem of ['chase', 'boss']) {
      if (want[stem] && !st.src[stem]) {
        this._stem(st.world, stem).then((b) => { if (b && this.stems === st) { this._attach(st, stem, b, 0.0001); this._levels(); } });
        continue;
      }
      if (st.gain[stem]) st.gain[stem].gain.setTargetAtTime(want[stem] ? want[stem] >= 0.99 ? 1 : want[stem] : 0.0001, t, want[stem] ? 0.45 : 0.9);
    }
  }


  // ------------------------------------------------------------ sim events
  /**
   * Voice a frame's sim events. By default only the v2 ids (and trapWarn / trapHit) are
   * handled, because main.js still voices the v1 ones itself; pass {all: true} to let this
   * mixer voice everything.
   */
  onEvents(events, { all = false } = {}) {
    if (!events) return;
    for (const e of events) { if (this._gitEvent && e) this._gitEvent(e); this.handleEvent(e, all); } // V3.2: the music layer hears every event
  }


  handleEvent(e, all = false) {
    if (!e || !e.type) return;
    // MECH's setpiece events carry a `type` field that overwrites the event type
    // ({type:'boss', id, name} on start, {type:'boss', id, perfect} on end): recognise them
    if (SP_KINDS.includes(e.type) && e.id) return this.handleEvent({ ...e, type: 'perfect' in e || 'hits' in e ? 'setpiece.end' : 'setpiece.start', kind: e.type }, all);
    const ty = e.type, bw = e.boss && BOSS_WORLD[String(e.boss).replace(/^.*\./, '')], w = e.world || bw || this.world;
    if (ty in LEGACY_EVENTS) {
      if (!all) return;
      if (ty === 'collect') return this.play('core.collect', { step: Math.min(9, (e.chain || 1) - 1), minGap: 0.015 });
      if (ty === 'merge' && e.jit) return this.play('core.merge.jit');
      if (ty === 'pickup') return this.play(`pickup.${e.kind}`) || undefined;
      return LEGACY_EVENTS[ty] && this.play(LEGACY_EVENTS[ty]);
    }
    if (ty.startsWith('pickup.')) {
      const k = ty.slice(7);
      return this.play(k.endsWith('.end') ? 'pickup.end' : `pickup.${PICKUP_ALIAS[k] || k}`);
    }
    switch (ty) {
      case 'trapWarn': {
        if (e.boss || String(e.trap || '').startsWith('boss:')) return this.play('boss.windup', { minGap: 0.3 });
        this.play(e.t != null && e.t < 0.45 ? 'trap.warn.close' : 'trap.warn', { minGap: 0.25 });
        const tell = this._trapId(e.trap, 'tell', w, e.skin);
        if (tell) this.play(tell, { t: 0.04, vol: 0.9 });
        return;
      }
      case 'trapHit': case 'trapFire': {
        if (String(e.trap || '').startsWith('boss:')) return this.play(`${w}.boss.a${ATTACK_SLOT[String(e.trap).split(':')[2]] || 2}`);
        const f = this._trapId(e.trap, 'fire', w, e.skin);
        if (f) this.play(f, { vol: ty === 'trapHit' ? 0.8 : 1 });
        return;
      }
      case 'vehicle.mount': case 'rideMount': return this.play(`vehicle.${RIDE_ALIAS[e.ride] || e.ride}.mount`) || undefined;
      case 'vehicle.action': case 'rideAction': return this.play(`vehicle.${RIDE_ALIAS[e.ride] || e.ride}.action`);
      case 'vehicle.dismount': case 'rideEject': case 'rideEnd': {
        const hit = e.src === 'hit' || e.why === 'hit' || e.why === 'eject' || e.hit || ty === 'rideEject';
        return this.play(hit ? `vehicle.${RIDE_ALIAS[e.ride] || e.ride}.eject` : 'vehicle.end');
      }
      case 'vehicle.hit': return this.play('vehicle.hit');
      case 'ring.offer': case 'ringOffer': return this.play('ring.offer');
      case 'ring.pick': case 'ringTake': this.play((e.lv || 1) > 1 ? 'ring.levelup' : 'ring.pick'); if (e.knot) this.play('knot.take', { t: 0.25 }); return;
      case 'knot.take': case 'knotTake': return this.play('knot.take');
      case 'synergy': case 'ring.synergy': return this.play('ring.synergy');
      case 'skill.fire': case 'skill': return this.play(`skill.${e.id}`);
      case 'skill.ready': return this.play('skill.ready');
      case 'skill.smash': return this.play('vehicle.stag.action');
      case 'ring.echo': return this.play('pickup.twinseed', { vol: 0.7 });
      case 'ring.ember': return this.play('pickup.rush', { vol: 0.7 });
      case 'ring.dance': return this.play('core.graze');
      case 'setpiece.start': case 'setPiece': {
        const kind = e.kind || e.phase || 'calm';
        if (ty === 'setPiece' && e.phase === 'end') return this.handleEvent({ ...e, type: 'setpiece.end' });
        this.play('setpiece.title');
        if (kind === 'boss') { this.play('setpiece.boss', { t: 0.3 }); this.play(`${w}.boss.enter`, { t: 1.2 }); } else this.play(`setpiece.${kind}`, { t: 0.3 });
        this.setIntensity(kind === 'boss' ? 'boss' : kind === 'chase' ? 'chase' : 'calm');
        return;
      }
      case 'setpiece.near': return this.prepare(e.kind);
      case 'setpiece.end':
        if (e.kind === 'boss' && e.cleared !== false) this.play(`${w}.boss.defeat`);
        if (e.cleared !== false) this.play('setpiece.clear', { t: e.kind === 'boss' ? 0.6 : 0 });
        this.setIntensity('calm');
        return;
      case 'boss.phase':
        if (e.windup) return this.play('boss.windup');
        if (e.hurt) return this.play(`${w}.boss.hurt`);
        if (e.attack) return this.play(`${w}.boss.a${ATTACK_SLOT[e.attack] || Math.max(1, Math.min(3, +e.attack || 1))}`);
        if (e.phase > 0) return this.play(`${w}.boss.enter`, { vol: 0.7 }); // a new phase: the entrance roar, softer
        return;
      case 'boss.attack': return this.play(`${w}.boss.a${ATTACK_SLOT[e.attack] || 2}`);
      case 'boss.foil': return this.play(`${w}.boss.hurt`);
      case 'boss.steal': return this.play('core.revert');
      case 'boss.windup': return this.play('boss.windup');
      case 'boss.hurt': return this.play(`${w}.boss.hurt`);
      case 'boss.defeat': return this.play(`${w}.boss.defeat`);
      case 'chest': { const k = e.kind || e.tier; return this.chestReveal(typeof k === 'string' ? SP_KINDS.indexOf(k) + 1 : e.tier); }
      case 'acorns.fly': case 'currency.fly': return this.currencyFly(e.n || 5);
      case 'reward.claim': return this.play('reward.claim');
      case 'lowsap': return this.play('core.lowsap', { minGap: 2 });
      default:
    }
  }


  _trapId(trap, kind, w, skin) {
    if (!trap) return null;
    // a world skin `<world>.trap.<name>` picks that world's signature cue when there is one
    const m = /^([a-z]+)\.trap\.([a-z0-9]+)/.exec(skin || '');
    if (m) {
      const k = TRAP_ALIAS[`${m[1]}.${m[2]}`] || m[2];
      if (this.has(`${m[1]}.trap.${k}.${kind}`)) return `${m[1]}.trap.${k}.${kind}`;
    }
    const key = trap;
    const own = `${w}.trap.${key}.${kind}`;
    if (this.has(own)) return own;
    const g = GENERIC_TRAP[key];
    if (g && g[kind === 'tell' ? 0 : 1]) { this._sprite('traps'); return g[kind === 'tell' ? 0 : 1]; }
    return kind === 'fire' ? 'core.merge.empty' : null;
  }


  // ------------------------------------------------------------ composite cues
  /** Chest reveal: ratchet, lid, then the rarity stamp (tier 0..3 lifts the stamp). */
  chestReveal(tier = 0) {
    this.play('reward.chest.ratchet');
    this.play('reward.chest.open', { t: 1.05 });
    this.play('reward.chest.stamp', { t: 1.55, step: Math.max(0, Math.min(4, tier | 0)) });
  }


  /** Currency flying to the counter: swish, n landing ticks climbing the scale, a final pop. */
  currencyFly(n = 5) {
    const k = Math.max(1, Math.min(12, n | 0));
    this.play('currency.fly');
    for (let i = 0; i < k; i++) this.play('currency.tick', { t: 0.35 + i * 0.06, step: i % 10, vol: 0.8 });
    this.play('currency.land', { t: 0.42 + k * 0.06 });
  }

}

/** Copy the mixer onto Sound.prototype (idempotent). */
export function install(Sound) {
  installGit(Sound);
  if (Sound.prototype._mixerInstalled) return;
  for (const k of Object.getOwnPropertyNames(Mixer.prototype)) {
    if (k !== 'constructor') Object.defineProperty(Sound.prototype, k, Object.getOwnPropertyDescriptor(Mixer.prototype, k));
  }
  Sound.prototype._mixerInstalled = true;
}

/** V3.2: playhead position (s, loop-relative before wrapping) and rate of a stem anchor at time t. */
export function stemPos(a, t) {
  const dt = t - a.t;
  if (dt <= 0) return a.pos;
  if (dt < a.d) { const r = a.r0 + (a.r1 - a.r0) * dt / a.d; return a.pos + (a.r0 + r) / 2 * dt; }
  return a.pos + (a.r0 + a.r1) / 2 * a.d + a.r1 * (dt - a.d);
}
export function stemRate(a, t) { const dt = t - a.t; return dt <= 0 ? a.r0 : dt >= a.d ? a.r1 : a.r0 + (a.r1 - a.r0) * dt / a.d; }

/**
 * Make a decoded loop seamless whatever the codec did at its edges: blend the last few ms
 * before loopEnd into the audio that precedes loopStart (the file carries 0.5 s of
 * wrap-around context there), so the jump from loopEnd back to loopStart is continuous.
 */
export function sealLoop(buf, loopStart, loopEnd, ms = 12) {
  const sr = buf.sampleRate, a = Math.round(loopStart * sr), b = Math.round(loopEnd * sr), L = Math.min(Math.round(ms / 1000 * sr), a);
  if (L < 2 || b > buf.length) return buf;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let k = 0; k < L; k++) {
      const w = (k + 1) / L;
      d[b - L + k] = d[b - L + k] * (1 - w) + d[a - L + k] * w;
    }
  }
  return buf;
}

