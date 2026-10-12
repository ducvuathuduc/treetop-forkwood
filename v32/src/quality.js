// v1.0.1 PERF: render quality tiers + an adaptive governor.
// Setting (localStorage 'forkwood.quality', or ?quality=auto|high|low):
//   auto  start at full quality, step down while frames run slow, step back up when they recover
//   high  always tier 0 (the v1.0.0 look)
//   low   "smooth mode": tier 2 fixed, no CSS glass blur
// Tier 0 is the reference look; lower tiers trade canvas resolution and a few soft
// backdrop layers (far haze, god rays, half the ambient motes) for frame time.
export const TIERS = [
  { id: 0, dpr: 2, back: 1.25, far1: true, rays: true, amb: 1, backEvery: 1 },
  { id: 1, dpr: 1.5, back: 1, far1: true, rays: true, amb: 1, backEvery: 1 },
  { id: 2, dpr: 1.25, back: 1, far1: false, rays: false, amb: 0.5, backEvery: 2 },
  { id: 3, dpr: 1, back: 0.85, far1: false, rays: false, amb: 0.5, backEvery: 2 },
];
const KEY = 'forkwood.quality';
const MODES = ['auto', 'high', 'low'];
const WIN = 30;          // frames per measurement window (or WIN_MS, whichever first, min 8 frames)
const WIN_MS = 600;
const SLOW = 18.5;       // median rAF interval (ms) that counts as a slow window
const FAST = 14.5;       // median that counts as comfortably fast
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function readMode() {
  try {
    const u = new URLSearchParams(location.search).get('quality');
    if (MODES.includes(u)) return u;
    const s = localStorage.getItem(KEY);
    if (MODES.includes(s)) return s;
  } catch {}
  return 'auto';
}

export const quality = {
  mode: readMode(),
  tier: 0,
  ceil: 0,              // auto: best tier it may recover to (raised after a failed recovery)
  listeners: [],
  win: [], winT: 0, slowN: 0, fastN: 0, skip: 2, probe: null, upAt: -1e9, changes: 0, log: [],
  get T() { return TIERS[this.tier]; },
  get blur() { return this.mode === 'high' || (this.mode === 'auto' && !isIOS && this.tier < 2); },
  init() { this.apply(this.mode === 'low' ? 2 : 0, 'init'); return this; },
  onChange(fn) { this.listeners.push(fn); },
  setMode(m) {
    if (!MODES.includes(m)) return;
    this.mode = m;
    try { localStorage.setItem(KEY, m); } catch {}
    this.ceil = 0; this.probe = null; this.floorLock = null;
    this.apply(m === 'low' ? 2 : 0, 'mode');
  },
  cycle() { this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]); return this.mode; },
  label() { return this.mode === 'auto' ? 'Auto' : this.mode === 'high' ? 'High' : 'Smooth'; },
  apply(t, why) {
    t = Math.max(0, Math.min(TIERS.length - 1, t));
    const changed = t !== this.tier || why === 'init' || why === 'mode';
    this.tier = t; this.win.length = 0; this.winT = 0; this.slowN = 0; this.fastN = 0; this.skip = 1;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('q-noblur', !this.blur);
      document.documentElement.dataset.quality = this.mode + ':' + t;
    }
    if (changed) { this.changes++; this.log.push([Math.round(performance.now()), why, t]); if (this.log.length > 20) this.log.shift(); for (const f of this.listeners) f(this.T); }
  },
  /** Feed one real rAF interval (ms) while the game canvas is the thing on screen. */
  sample(ms) {
    if (this.mode !== 'auto') return;
    if (!(ms > 0) || ms > 250) { this.win.length = 0; return; } // tab switch / hitch: not a rendering signal
    this.win.push(ms); this.winT = (this.winT || 0) + ms;
    if (this.win.length < WIN && !(this.winT >= WIN_MS && this.win.length >= 8)) return;
    const s = this.win.slice().sort((a, b) => a - b), med = s[s.length >> 1];
    this.win.length = 0; this.winT = 0;
    if (this.skip > 0) { this.skip--; return; } // settle after a change
    const now = performance.now();
    if (this.probe) {
      // after a step down: if it didn't help, the limit is not fill rate (e.g. iOS Low Power Mode
      // caps rAF at 30 Hz); go back and stop stepping down
      const p = this.probe; this.probe = null;
      if (med > p.med * 0.88) { this.floorLock = p.from; this.apply(p.from, 'no-gain'); return; }
    }
    if (med > SLOW) {
      this.fastN = 0;
      if (++this.slowN >= (med > 30 ? 1 : 2) && this.tier < TIERS.length - 1 && !(this.floorLock != null && this.tier >= this.floorLock)) {
        if (now - this.upAt < 12000) this.ceil = Math.max(this.ceil, this.tier + 1); // recovery didn't hold
        this.probe = { from: this.tier, med };
        this.apply(this.tier + 1, 'slow ' + med.toFixed(1));
      }
    } else if (med < FAST) {
      this.slowN = 0;
      if (++this.fastN >= 7 && this.tier > this.ceil) { this.upAt = now; this.apply(this.tier - 1, 'fast ' + med.toFixed(1)); }
    } else { this.slowN = 0; this.fastN = 0; }
  },
};
export default quality;
