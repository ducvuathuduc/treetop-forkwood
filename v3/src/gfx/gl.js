// Forkwood 2.0 WebGL render layer (PixiJS v8, WebGL only).
//
// Draws, on its own canvas UNDER the 2D canvas:
//   backdrop  painted parallax layers of the current world (registry, lazy, variant-picked),
//             zone crossfade by height, palette sky placeholder, vignette
//   sky       Van Gogh flow-field brushstrokes (worlds with sky:'flow')
//   ambient   per-world fx ids (petals, fireflies, embers, gold flakes, ink, ripples, foam, dust, motes)
//   world     ground, the vine as a living textured brushstroke (per-skin strip), leaves,
//             commit dots, tips/buds, motes/pickups/beetles (registry sprites or vector
//             placeholders), fx particles, juice (pops, bursts, flash)
// The 2D canvas on top keeps traps, HUD, text floaters and screen overlays (render.js overlay mode).
// The sim is never touched: everything here reads sim state and the fx/cam presentation objects.
import * as PIXI_GL from '../vendor/pixi.mjs';
// ?renderer=webgpu (experimental, test only): swaps in a separate lazily loaded bundle with WebGPURenderer.
let PIXI = PIXI_GL;
import gsap from '../vendor/gsap.mjs';
import quality from '../quality.js';
import { WORLDS, WORLD, currentWorld, onWorldChange, loadWorld, preloadNext, zoneAt, loadRegistry, registryEntry, pickVariant, loadBitmap, resolveId, loadLayerBitmap, ZONE_M, dropBitmap } from '../worlds.js';
import { VINE_SKINS, skinDef, paintStrip, paintGlowStrip } from './skins.js';
import { buildAtlas, paintPlaceholder } from './atlas.js';
import { vstyle, paintShadowStrip, paintRimStrip, paintFreshStrip, paintTendrilStrip, paintGround, paintRoots, GROUND } from './vine-art.js';
import { Living, liveConfig, liveWorld, livingSupported } from './living.js'; // V3.2 living backdrops
export const SUN_K = 1.6, SUN_TEACH = 14; // V3.2: sunlight size and how many of a run's first sunlights pulse

const TAU = Math.PI * 2;
const hexN = (h) => parseInt(String(h).slice(1, 7), 16);
const hex3 = (h) => { const n = hexN(h); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixN = (a, b, t) => { const A = hex3(a), B = hex3(b); return ((A[0] + (B[0] - A[0]) * t) << 16) | ((A[1] + (B[1] - A[1]) * t) << 8) | (A[2] + (B[2] - A[2]) * t); };
// V3.2: the vine is the sap bar. Below WILT_HI of max sap the stem browns and the leaves droop, fully at WILT_LO.
export const WILT_HI = 0.62, WILT_LO = 0.15, WILT_STEM = 0x94582a, WILT_LEAF = 0xc8884a, WILT_DRY = 0xf0c89a;
const mulN = (a, b) => (((((a >> 16) & 255) * ((b >> 16) & 255) / 255) << 16) | ((((a >> 8) & 255) * ((b >> 8) & 255) / 255) << 8) | ((a & 255) * (b & 255) / 255)) >>> 0;
const lerpN = (a, b, t) => { const A = [(a >> 16) & 255, (a >> 8) & 255, a & 255], B = [(b >> 16) & 255, (b >> 8) & 255, b & 255]; return ((A[0] + (B[0] - A[0]) * t) << 16) | ((A[1] + (B[1] - A[1]) * t) << 8) | (A[2] + (B[2] - A[2]) * t); };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const easeBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// V3: a zone sky pans by progress through its OWN zone (zt.prog belongs to zone i, so the upper sky
// fading in near a boundary would jump when i flips)
const zoneProg = (z, m) => { const m0 = ZONE_M[z], m1 = ZONE_M[z + 1]; return Math.min(1, Math.max(0, m1 != null ? (m - m0) / (m1 - m0) : (m - m0) / 600)); };
const PX_PER_M = 30; // sim units per metre (sim.js PX_PER_M); only used for zone lookups of leaves

// particle budgets per quality tier (phone budget <= 300 alive)
const BUDGET = [{ parts: 300, flow: 220, amb: 40 }, { parts: 260, flow: 180, amb: 34 }, { parts: 200, flow: 130, amb: 26 }, { parts: 150, flow: 90, amb: 18 }];
// world/skin ids -> ART registry skin ids
// V2-INT: META store skins and MECH economy skins map onto the 12 strips ART drew
const SKIN_ALIAS = { 'vine.skin.fresco': 'vine.skin.frescochalk', 'vine.skin.tempera': 'vine.skin.frescochalk', 'vine.skin.plaster': 'vine.skin.frescochalk',
  'vine.skin.sprout': 'vine.skin.cel', 'vine.skin.meadowgrass': 'vine.skin.cel', 'vine.skin.wildflower': 'vine.skin.sakura', 'vine.skin.goldenhour': 'vine.skin.watercolour',
  'vine.skin.season': 'vine.skin.moonsilver', 'vine.skin.explorer': 'vine.skin.chudau', 'vine.skin.cypress': 'vine.skin.impasto', 'vine.skin.starswirl': 'vine.skin.moonsilver',
  'vine.skin.laurel': 'vine.skin.goldleaf', 'vine.skin.halo': 'vine.skin.goldleaf', 'vine.skin.woodblock': 'vine.skin.sumi', 'vine.skin.pinewave': 'vine.skin.sumi', 'vine.skin.indigo': 'vine.skin.sumi',
  'vine.skin.dab': 'vine.skin.dabs', 'vine.skin.willow': 'vine.skin.watercolour', 'vine.skin.lotus': 'vine.skin.sakura', 'vine.skin.leaf': 'vine.skin.goldleaf', 'vine.skin.tessera': 'vine.skin.goldleaf',
  'vine.skin.son': 'vine.skin.lacquer', 'vine.skin.eggshell': 'vine.skin.chudau', 'vine.skin.lilypad': 'vine.skin.dabs', 'vine.skin.mosaic': 'vine.skin.goldleaf',
  'vine.skin.spiral': 'vine.skin.goldleaf', 'vine.skin.lanternsilk': 'vine.skin.lacquer', 'vine.skin.moonthread': 'vine.skin.moonsilver', 'vine.skin.ember': 'vine.skin.maple', 'vine.skin.aurora': 'vine.skin.watercolour' };
const SHAKE_PX = () => (Math.min(innerWidth, innerHeight) < 600 ? 4 : 7); // shake budget (px)

// ------------------------------------------------------------------ helpers
class Pool {
  constructor(parent, make) { this.parent = parent; this.make = make; this.items = []; this.n = 0; }
  begin() { this.n = 0; }
  next() { let it = this.items[this.n]; if (!it) { it = this.make(); this.items.push(it); this.parent.addChild(it); } it.visible = true; this.n++; return it; }
  end() { for (let i = this.n; i < this.items.length; i++) this.items[i].visible = false; }
}
class PPool { // ParticleContainer pool
  constructor(pc, tex) { this.pc = pc; this.tex = tex; this.items = []; this.n = 0; }
  begin() { this.n = 0; }
  next(tex) { let p = this.items[this.n]; if (!p) { p = new PIXI.Particle({ texture: tex || this.tex, anchorX: 0.5, anchorY: 0.5 }); this.items.push(p); } if (tex) p.texture = tex; this.n++; return p; }
  end() { const c = this.pc.particleChildren; c.length = 0; for (let i = 0; i < this.n; i++) c.push(this.items[i]); this.pc.update(); }
}

// ------------------------------------------------------------------ flow field (Van Gogh sky)
function buildFlowField(GW = 32, GH = 56) {
  // curl of value noise + hand-placed vortices (the swirls), cached once
  const vort = [[0.3, 0.22, 1, 0.16], [0.72, 0.14, -1, 0.12], [0.55, 0.42, 1, 0.2], [0.18, 0.62, -1, 0.14], [0.8, 0.7, 1, 0.16]];
  const A = new Float32Array(GW * GH);
  const n = (x, y) => Math.sin(x * 3.1 + Math.sin(y * 2.3) * 1.7) + Math.cos(y * 2.7 + Math.sin(x * 1.9) * 1.3);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = i / (GW - 1), y = j / (GH - 1), e = 0.01;
    let vx = (n(x, y + e) - n(x, y - e)) / (2 * e) * 0.08, vy = -(n(x + e, y) - n(x - e, y)) / (2 * e) * 0.08;
    vx += 1; // prevailing drift to the right, like the brush direction in the sky
    for (const [cx, cy, dir, r] of vort) {
      const dx = x - cx, dy = (y - cy) * 0.6, d2 = dx * dx + dy * dy, k = Math.exp(-d2 / (r * r)) * 3.2;
      vx += -dy * dir * k / Math.max(0.05, Math.sqrt(d2)); vy += dx * dir * k / Math.max(0.05, Math.sqrt(d2));
    }
    A[j * GW + i] = Math.atan2(vy, vx);
  }
  return { GW, GH, A, at(u, v) { const i = Math.max(0, Math.min(GW - 1, Math.round(u * (GW - 1)))), j = Math.max(0, Math.min(GH - 1, Math.round(v * (GH - 1)))); return A[j * GW + i]; } };
}

// ambient fx definitions: frame, count weight, motion, tints, blend
const AMB = {
  petals: { frame: 'fx.petal', w: 1, vx: [10, 40], vy: [18, 46], spin: 2, sway: 22, scale: [0.6, 1.1], tint: ['#ffc8d8', '#ffe4ec', '#ffd0a8'], alpha: 0.9 },
  fireflies: { frame: 'fx.firefly', w: 0.8, vx: [-8, 8], vy: [-14, -4], spin: 0, sway: 14, scale: [0.5, 0.9], tint: ['#fff2a0', '#d8ff9a'], alpha: 1, add: true, blink: true },
  embers: { frame: 'fx.ember', w: 0.8, vx: [-6, 10], vy: [-40, -18], spin: 0, sway: 10, scale: [0.4, 0.8], tint: ['#ffb04a', '#ff7a3a', '#ffd27a'], alpha: 1, add: true, blink: true },
  goldflakes: { frame: 'fx.flake', w: 1, vx: [-12, 12], vy: [14, 30], spin: 3, sway: 18, scale: [0.5, 1], tint: ['#ffd75a', '#fff0a8', '#e8b030'], alpha: 1, glint: true },
  inksplash: { frame: 'fx.ink.0', w: 0.25, vx: [0, 0], vy: [6, 14], spin: 0, sway: 0, scale: [0.5, 1], tint: ['#1b2a4a'], alpha: 0.35, fade: true },
  ripples: { livingOff: true, frame: 'fx.ripple', w: 0.5, vx: [0, 0], vy: [0, 0], spin: 0, sway: 0, scale: [0.6, 1.4], tint: ['#ffffff', '#ffe9a0'], alpha: 0.45, grow: true, low: true },
  foam: { frame: 'fx.foam', w: 0.8, vx: [20, 50], vy: [10, 30], spin: 1, sway: 8, scale: [0.4, 0.9], tint: ['#fbf3e0', '#ffffff'], alpha: 0.9 },
  plasterdust: { frame: 'fx.dust', w: 1, vx: [-4, 4], vy: [4, 12], spin: 0, sway: 6, scale: [0.3, 0.8], tint: ['#fff6e0', '#f0e0c0'], alpha: 0.6 },
  motes: { frame: 'fx.dust', w: 0.8, vx: [-5, 5], vy: [-8, 8], spin: 0, sway: 10, scale: [0.3, 0.6], tint: ['#fff6d0'], alpha: 0.7, add: true, blink: true },
  strokes: null, // handled by the flow-field sky
};

export class GLLayer {
  static async create(host, opts = {}) {
    if (typeof location !== 'undefined' && /[?&]glfail=1/.test(location.search)) throw new Error('forced failure (?glfail=1)'); // fallback test hook
    if (opts.webgpu) {
      try {
        if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) throw new Error('no WebGPU adapter');
        PIXI = await import('../vendor/pixi-webgpu.mjs');
        const gl = new GLLayer(host, opts); await gl.init(true); return gl;
      } catch (e) { console.info('[forkwood] WebGPU unavailable, using WebGL:', e.message); PIXI = PIXI_GL; }
    }
    const gl = new GLLayer(host, opts);
    await gl.init(false);
    return gl;
  }

  constructor(host, opts) {
    this.host = host; this.opts = opts; this.failed = false; this.ready = false;
    this.stats = { drawCalls: 0, texMB: 0, frames: [], p50: 0, p95: 0, fps: 0 };
    this.texBytes = new Map();
  }

  async init(gpu) {
    const r = gpu ? new PIXI.WebGPURenderer() : new PIXI.WebGLRenderer();
    this.backend = gpu ? 'webgpu' : 'webgl';
    await r.init({ width: innerWidth, height: innerHeight, resolution: this.res(), antialias: false, background: '#0b1029', backgroundAlpha: 1, autoDensity: true, preference: gpu ? 'webgpu' : 'webgl', failIfMajorPerformanceCaveat: !this.opts.allowSoftware, powerPreference: 'high-performance', clearBeforeRender: true });
    this.r = r;
    const cv = r.canvas; cv.id = 'game-gl'; cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'fixed', inset: '0', display: 'block', pointerEvents: 'none', width: '100vw', height: '100vh' });
    const game = this.host.canvas; game.parentNode.insertBefore(cv, game);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.fail('context lost'); });
    if (r.gl) this.countDrawCalls(r.gl);
    // V3.2: painted plates drawn by the living shader (flow maps, water, wind, haze, rays); WebGL2 only
    this.living = null;
    if (!gpu && livingSupported(r)) { try { this.living = new Living(PIXI, this, loadBitmap); } catch (e) { console.info('[forkwood] living backdrops off:', e.message); } }

    // V2-INT: one GSAP copy is shared with the DOM menus (motion.js), so the engine no longer stops the global
    // ticker; its tweens live on a private paused timeline driven by presentation time (pause/slow-mo stay in sync).
    this.gsapT = 0; this.tl = gsap.timeline({ paused: true, autoRemoveChildren: true });

    // atlas
    this.atlas = buildAtlas(1024);
    this.atlasBase = PIXI.Texture.from(this.atlas.canvas);
    this.atlasBase.source.scaleMode = 'linear';
    this.trackTex('atlas', this.atlas.canvas.width, this.atlas.canvas.height);
    this.tex = {};
    for (const [id, f] of Object.entries(this.atlas.frames)) this.tex[id] = new PIXI.Texture({ source: this.atlasBase.source, frame: new PIXI.Rectangle(f.x, f.y, f.w, f.h) });
    this.slotOf = new Map(); this.slotN = 0;
    this.regTex = new Map(); // registry id -> Texture (ART sprites)
    this.regFrames = new Map(); this.regPending = new Map(); this.pages = new Map();

    // stage: render groups keep transforms on the GPU side and batches apart
    const S = this.stage = new PIXI.Container();
    this.bg = new PIXI.Container({ isRenderGroup: true });
    this.skyFill = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.layerC = new PIXI.Container();
    this.flowPC = new PIXI.ParticleContainer({ texture: this.atlasBase, dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.ambPC = new PIXI.ParticleContainer({ texture: this.atlasBase, dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.ambAddPC = new PIXI.ParticleContainer({ texture: this.atlasBase, dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.ambAddPC.blendMode = 'add';
    this.bg.addChild(this.skyFill, this.layerC, this.flowPC, this.ambPC, this.ambAddPC);

    this.rollC = new PIXI.Container();
    this.world = new PIXI.Container({ isRenderGroup: true });
    this.rollC.addChild(this.world);
    // V3.1: painted ground strata (tiling sprite per world) + the vine's own roots, over a deep-soil fill
    this.ground = new PIXI.Container();
    this.groundFill = new PIXI.Graphics(); this.roots = new PIXI.Container(); this.groundTile = null; this.groundTex = new Map();
    this.ground.addChild(this.groundFill, this.roots);
    this.vineGlow = this.makeRibbon(paintGlowStrip(), 'add');
    this.vine = this.makeRibbon(null);
    // V3.1 living vine: drop shadow + rim light share the stem geometry (no extra CPU), fresh growth and
    // curling tendrils are their own small ribbons; back leaves sit under the stem for depth
    this.vineShadow = new PIXI.Mesh({ geometry: this.vine.geometry, texture: PIXI.Texture.WHITE });
    this.vineRim = new PIXI.Mesh({ geometry: this.vine.geometry, texture: PIXI.Texture.WHITE }); this.vineRim.blendMode = 'add';
    this.vineWilt = new PIXI.Mesh({ geometry: this.vine.geometry, texture: PIXI.Texture.WHITE }); this.vineWilt.tint = WILT_STEM; this.vineWilt.visible = false; this.wilt = 0; // V3.2
    this.fresh = this.makeRibbon(null, null, 1600);
    this.tendril = this.makeRibbon(null, null, 3200);
    this.leafBackC = new PIXI.Container();
    this.stripM = -1; this.trailAcc = 0;
    this.leafC = new PIXI.Container();
    this.entC = new PIXI.Container();
    this.glowC = new PIXI.Container(); this.glowC.blendMode = 'add';
    this.tipC = new PIXI.Container();
    this.fxPC = new PIXI.ParticleContainer({ texture: this.atlasBase, dynamicProperties: { position: true, rotation: true, color: true, vertex: true, uvs: true } });
    this.juiceC = new PIXI.Container();
    this.world.addChild(this.ground, this.vineShadow, this.leafBackC, this.vineGlow.mesh, this.vine.mesh, this.vineWilt, this.vineRim, this.fresh.mesh, this.tendril.mesh, this.leafC, this.glowC, this.entC, this.tipC, this.fxPC, this.juiceC);

    this.front = new PIXI.Container();
    this.vignette = new PIXI.Sprite(this.makeVignette());
    this.flash = new PIXI.Sprite(PIXI.Texture.WHITE); this.flash.alpha = 0;
    this.veilS = new PIXI.Sprite(PIXI.Texture.WHITE); this.veilS.tint = 0x080b14; this.veilS.alpha = 0;
    this.front.addChild(this.vignette, this.flash, this.veilS);
    S.addChild(this.bg, this.rollC, this.front);

    this.leafPool = new Pool(this.leafC, () => new PIXI.Sprite());
    this.leafBackPool = new Pool(this.leafBackC, () => new PIXI.Sprite());
    this.entPool = new Pool(this.entC, () => new PIXI.Sprite());
    this.glowPool = new Pool(this.glowC, () => new PIXI.Sprite(this.tex.glow));
    this.tipPool = new Pool(this.tipC, () => new PIXI.Sprite(this.tex['vine.bud']));
    this.fxPool = new PPool(this.fxPC, this.atlasBase);
    this.flowPool = new PPool(this.flowPC, this.atlasBase);
    this.ambPool = new PPool(this.ambPC, this.atlasBase);
    this.ambAddPool = new PPool(this.ambAddPC, this.atlasBase);

    this.flowField = buildFlowField();
    this.flow = []; this.amb = [];
    this.skins = new Map();
    this.layers = []; this.worldId = null;
    this.lastNow = performance.now() / 1000;
    this.skinId = null; this.arc = new WeakMap();

    this.resize();
    loadRegistry().then(() => this.applyRegistry());
    this.setWorld(currentWorld().id);
    onWorldChange((w) => this.setWorld(w.id));
    this.ready = true;
  }

  res() { return Math.min(quality.T.dpr, window.devicePixelRatio || 1); }

  fail(why) {
    if (this.failed) return;
    this.failed = true; this.failWhy = why;
    try { this.r.canvas.style.display = 'none'; } catch { /* gone */ }
    if (this.host.glFailed) this.host.glFailed(why);
  }

  countDrawCalls(gl) {
    const st = this.stats;
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = gl[fn]; if (!orig) continue;
      gl[fn] = function (...a) { st.dc++; return orig.apply(this, a); };
    }
    st.dc = 0;
  }
  trackTex(key, w, h) { this.texBytes.set(key, w * h * 4); let s = 0; for (const v of this.texBytes.values()) s += v; this.stats.texMB = +(s / 1048576).toFixed(1); }

  resize() {
    const cw = innerWidth, ch = innerHeight, res = this.res();
    this.cw = cw; this.ch = ch;
    if (this.r.resolution !== res) this.r.resolution = res;
    this.r.resize(cw, ch, res);
    this.skyFill.width = cw; this.skyFill.height = ch;
    this.vignette.width = cw; this.vignette.height = ch;
    this.flash.width = cw; this.flash.height = ch; this.veilS.width = cw; this.veilS.height = ch;
    this.layoutLayers();
  }

  makeVignette() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const g = cv.getContext('2d'), r = g.createRadialGradient(128, 118, 50, 128, 128, 185);
    r.addColorStop(0, 'rgba(8,10,20,0)'); r.addColorStop(0.7, 'rgba(8,10,20,0.12)'); r.addColorStop(1, 'rgba(8,10,20,0.5)');
    g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    this.trackTex('vignette', 256, 256);
    return PIXI.Texture.from(cv);
  }

  // ---------------------------------------------------------------- registry sprites
  /**
   * Registry sprites. An entry is either a single file, or a frame set inside an atlas page
   * (`atlas` + `rects:[[x,y,w,h],...]`, as ART ships them, "@2x": drawn at w/2 x h/2 world units).
   * Pages are decoded once and shared, so every frame of a page batches together.
   */
  regLoad(id) {
    if (this.regPending.has(id)) return this.regPending.get(id);
    const e = registryEntry(id);
    if (!e || e.type === 'layer') { this.regPending.set(id, Promise.resolve(null)); return this.regPending.get(id); }
    const v = pickVariant(e, 64, 64);
    const p = this.page(v.url).then((src) => {
      if (!src) return null;
      const rects = Array.isArray(e.rects) && e.rects.length ? e.rects : [[0, 0, src.width, src.height]];
      const frames = rects.map(([x, y, w, h]) => new PIXI.Texture({ source: src, frame: new PIXI.Rectangle(x, y, w, h) }));
      const at2x = /@2x/.test(e.scale || '') || !!e.atlas;
      for (const f of frames) f.fwScale = at2x ? 0.5 : 1;
      this.regTex.set(id, frames[0]); this.regFrames.set(id, { frames, fps: e.fps || 0, anchor: e.anchor || [0.5, 0.5], e });
      return frames;
    });
    this.regPending.set(id, p);
    return p;
  }
  page(url) {
    if (!this.pages.has(url)) this.pages.set(url, loadBitmap(url).then((bm) => { if (!bm) return null; const t = PIXI.Texture.from(bm); t.source.scaleMode = 'linear'; this.trackTex('page:' + url, bm.width, bm.height); return t.source; }));
    return this.pages.get(url);
  }
  applyRegistry() {
    for (const id of Object.keys(this.tex)) this.regLoad(id);
    if (this.W) this.setSkin(this.skinOverride || this.W.vineSkinDefault, true); // V2-INT fix: keep the equipped (Grove) skin once ART's strips arrive
  }
  /** Texture for a registry id: ART sprite > atlas frame > generic placeholder (never throws). */
  sprite(id, t = 0) {
    const rid = resolveId(id); if (rid && rid !== id) { id = rid; if (!this.regPending.has(id)) this.regLoad(id); } // V2-INT: MECH skin ids -> ART ids
    const R = this.regFrames.get(id);
    if (R) return R.frames.length > 1 && R.fps ? R.frames[Math.floor(t * R.fps) % R.frames.length] : R.frames[0];
    const own = this.tex[id]; if (own) { this.regLoad(id); return own; }
    let s = this.slotOf.get(id);
    if (s == null) {
      s = this.slotN++ % this.atlas.slots; this.slotOf.set(id, s);
      paintPlaceholder(this.atlas, s, id); this.atlasBase.source.update();
      this.regLoad(id);
    }
    return this.tex[`_slot.${s}`];
  }

  // ---------------------------------------------------------------- worlds / parallax
  async setWorld(id) {
    const w = WORLD[id] || WORLDS[0];
    if (this.worldId === w.id) return;
    this.worldId = w.id; this.W = w;
    this.setSkin(this.skinOverride || w.vineSkinDefault);
    this.applyVineStyle();
    this.drawGround();
    this.flow.length = 0; this.amb.length = 0;
    const need = this.needPx();
    const data = await loadWorld(w.id, need.w, need.h);
    if (this.worldId !== w.id) return;
    const old = this.layers;
    this.layers = data.layers.map((ly) => this.makeLayer(ly));
    for (const L of this.layers) { L.root.alpha = 0; this.layerC.addChild(L.root); this.tween(L.root, { alpha: 1, duration: old.length ? 0.6 : 0.35, ease: 'sine.out' }); }
    for (const L of old) this.tween(L.root, { alpha: 0, duration: 0.6, ease: 'sine.in', onComplete: () => { L.root.destroy({ children: true }); if (L.tex) { L.tex.destroy(true); this.texBytes.delete('layer:' + L.id + L.k); } } });
    this.layoutLayers();
    preloadNext(w.id, need.w, need.h);
  }
  needPx() { const res = this.res(); return { w: Math.round(innerWidth * res), h: Math.round(innerHeight * res) }; }

  makeLayer(ly) {
    const root = new PIXI.Container();
    const L = { ...ly, root, k: Math.random().toString(36).slice(2, 6) };
    if (!ly.bitmap) return L; // missing (or lazy zone art not decoded yet): the palette sky placeholder shows through
    L.ownBitmap = true; // decoded by loadWorld and cached with the world: never closed here
    this.attachLayerTex(L, ly.bitmap);
    return L;
  }
  attachLayerTex(L, bitmap) {
    L.bitmap = bitmap;
    L.tex = PIXI.Texture.from(bitmap); L.tex.source.scaleMode = 'linear';
    this.trackTex('layer:' + L.id + L.k, bitmap.width, bitmap.height);
    const cfg = this.living && liveConfig(this.worldId, L);
    if (cfg) { // V3.2: one living quad replaces the sprite / tiling sprite (wrapping happens in the shader)
      L.tex.source.addressMode = L.fit === 'cover' ? 'mirror-repeat' : 'repeat';
      L.live = this.living.make(L, L.tex, cfg); L.root.addChild(L.live.mesh);
      return;
    }
    if (L.mode === 'tile-x' || L.mode === 'tile-y') {
      L.tex.source.addressMode = 'repeat';
      L.tile = new PIXI.TilingSprite({ texture: L.tex, width: 10, height: 10 });
      L.root.addChild(L.tile);
    } else {
      L.main = new PIXI.Sprite(L.tex); L.main.anchor.set(L.anchor[0], L.anchor[1]);
      L.root.addChild(L.main);
    }
  }
  /**
   * V3 zone art: decode a lazy zone layer once the climb gets near it (zone i itself, and zone i+1
   * from 60% through zone i). Only touches layers of the current stack; a world switch mid-decode
   * drops the result.
   */
  wantZoneLayers(zt) {
    const want = new Set([zt.i, zt.j]);
    if (zt.prog >= 0.6) want.add(zt.i + 1);
    // free zone art two or more zones away (phone texture budget < 64 MB); it reloads lazily on the way back
    for (const L of this.layers) {
      if (!L.zones || !L.tex || L.loading || L.zones.some((z) => Math.abs(z - zt.i) <= 1)) continue;
      L.root.removeChildren().forEach((c) => c.destroy());
      L.tex.destroy(true); this.texBytes.delete('layer:' + L.id + L.k);
      L.tex = L.tile = L.main = L.sides = L.live = null;
      if (!L.ownBitmap) { if (L.src) dropBitmap(L.src.url); L.bitmap = null; } // zone-0 bitmaps stay cached with the world (cheap re-upload)
      L.lazy = true; this.trackTex('_', 0, 0);
    }
    for (const L of this.layers) {
      if (!L.lazy || L.tex || L.loading || !L.zones.some((z) => want.has(z))) continue;
      L.loading = true; const stack = this.layers;
      (L.bitmap ? Promise.resolve(L.bitmap) : loadLayerBitmap(L)).then((bm) => {
        L.loading = false;
        if (!bm || this.layers !== stack || L.root.destroyed) return;
        this.attachLayerTex(L, bm); this.layoutLayers();
      });
    }
  }

  /**
   * Layer fit (never magnifies past 1.0 texel per device px):
   *   fit 'cover' (sky): covers the whole screen; small zone-progress pan inside the overscan.
   *   fit 'width' (far/mid/side): spans the screen width, placed by its anchor ([0.5,1] = bottom
   *   centre on the screen bottom) and scrolls down with camera * parallax as you climb.
   * If capped art is narrower than the screen (portrait-only art on desktop) mirrored copies fill
   * the sides so there is never an empty edge.
   */
  layoutLayers() {
    if (!this.layers) return;
    const cw = this.cw, ch = this.ch, res = this.res();
    this.opaqueSky = false;
    for (const L of this.layers) {
      if (!L.tex) continue;
      const tw = L.tex.width, th = L.tex.height;
      if (L.live) { // V3.2 living quad: same fit as the sprite path, mirrored sides come from the shader
        if (L.fit === 'cover') { L.k0 = Math.min(Math.max(cw / tw, ch / th) * 1.04, 1 / res); L.travel = Math.max(0, th * L.k0 - ch); if (L.opaque && L.zone == null && th * L.k0 >= ch - 1) this.opaqueSky = true; }
        else { L.k0 = L.mode === 'tile-x' || L.mode === 'tile-y' ? Math.min(1 / res, Math.max(cw / tw, 0.0001)) : Math.min(cw / tw, 1 / res); L.travel = 0; }
        continue;
      }
      if (L.tile) { // tile-y: width-fit (capped at 1.0x), repeats vertically as the camera climbs
        const k = Math.min(1 / res, Math.max(cw / tw, 0.0001));
        L.k0 = k; L.tile.width = cw; L.tile.height = ch; L.tile.tileScale.set(k, k);
        continue;
      }
      let k = L.fit === 'cover' ? Math.max(cw / tw, ch / th) * 1.04 : cw / tw;
      k = Math.min(k, 1 / res);
      L.k0 = k; L.main.scale.set(k);
      L.travel = L.fit === 'cover' ? Math.max(0, th * k - ch) : 0;
      const sw = tw * k;
      if (L.sides) { for (const s of L.sides) s.destroy(); L.sides = null; }
      if (sw < cw - 1) {
        L.sides = [];
        const n = Math.ceil((cw - sw) / 2 / sw);
        for (let i = 1; i <= n; i++) for (const dir of [-1, 1]) {
          const s = new PIXI.Sprite(L.tex); s.anchor.set(L.anchor[0], L.anchor[1]); s.scale.set(i % 2 ? -k : k, k);
          s.idx = i; s.dir = dir; L.root.addChildAt(s, 0); L.sides.push(s);
        }
      }
      if (L.fit === 'cover' && L.opaque && L.zone == null && th * k >= ch - 1) this.opaqueSky = true;
    }
  }

  /** V3.1: painted soil strata + grass edge for the world (tile cached per world), deep soil below. */
  drawGround() {
    const st = vstyle(this.W.id), G = GROUND;
    let tex = this.groundTex.get(this.W.id);
    if (!tex) {
      tex = PIXI.Texture.from(paintGround(this.W.id)); tex.source.addressMode = 'repeat'; tex.source.scaleMode = 'linear';
      this.groundTex.set(this.W.id, tex); this.trackTex('ground:' + this.W.id, tex.width, tex.height);
      // keep at most two worlds of ground on the GPU (current + previous)
      for (const [k, t] of this.groundTex) if (this.groundTex.size > 2 && k !== this.W.id) { t.destroy(true); this.groundTex.delete(k); this.texBytes.delete('ground:' + k); }
    }
    if (!this.groundTile) { this.groundTile = new PIXI.TilingSprite({ texture: tex, width: 9000, height: G.H }); this.ground.addChildAt(this.groundTile, 1); }
    this.groundTile.texture = tex;
    this.groundTile.tileScale.set(1 / G.RES, 1 / G.RES);
    this.groundTile.position.set(-4200, -G.TOP);
    this.groundTile.tilePosition.set(4200 + 280 - G.W / 2, 0); // tile seam far from the vine
    const g = this.groundFill; g.clear();
    g.rect(-4200, G.H - G.TOP - 4, 9000, 6000).fill({ color: hexN(st.ground.deep) });
    this.rootsKey = null;
  }
  /** The vine's own roots spreading under the ground from its base (painted once per run). */
  drawRoots(s) {
    const p0 = s.paths[0] && s.paths[0].pts[0]; if (!p0) return;
    const key = s.seed + ':' + this.W.id + ':' + p0.x;
    if (this.rootsKey === key) return;
    this.rootsKey = key;
    const r = paintRoots(this.W.id, (s.seed % 9973) + 1);
    if (this.rootsS) { this.rootsS.texture.destroy(true); this.rootsS.destroy(); }
    const t = PIXI.Texture.from(r.cv); t.source.scaleMode = 'linear';
    this.rootsS = new PIXI.Sprite(t); this.rootsS.scale.set(1 / r.res); this.rootsS.position.set(p0.x - r.ox, p0.y - r.oy);
    this.roots.addChild(this.rootsS); this.trackTex('roots', r.cv.width, r.cv.height);
  }
  /** V3.1: per-world vine dressing (fresh growth + tendril strips, shadow/rim colours). */
  applyVineStyle() {
    const st = this.vst = vstyle(this.W.id);
    if (!this.vineStyleTex) this.vineStyleTex = new Map();
    let T = this.vineStyleTex.get(this.W.id);
    if (!T) {
      T = { fresh: PIXI.Texture.from(paintFreshStrip(st, this.W.id === 'starry' || this.W.id === 'lilies')), tendril: PIXI.Texture.from(paintTendrilStrip(st)) };
      T.fresh.source.addressMode = 'clamp-to-edge'; T.tendril.source.addressMode = 'clamp-to-edge';
      this.vineStyleTex.set(this.W.id, T); this.trackTex('vstyle:' + this.W.id, 128 * 32 + 64 * 16, 1);
    }
    this.fresh.mesh.texture = T.fresh; this.tendril.mesh.texture = T.tendril;
    this.vineShadow.tint = hexN(st.shadow[0]); this.vineShadow.alpha = st.shadow[1]; this.vineShadow.position.set(st.shadow[2], st.shadow[3]);
    this.vineRim.tint = st.rim ? hexN(st.rim) : 0; this.vineRim.alpha = st.rimA || 0.5;
  }
  /** Shadow / rim strips must match the stem strip's transparent margin (ART stems carry one). */
  setStripMargin(m) {
    m = Math.round(m * 50) / 50; if (m === this.stripM) return; this.stripM = m;
    const sh = PIXI.Texture.from(paintShadowStrip(m)), rim = PIXI.Texture.from(paintRimStrip(m));
    sh.source.addressMode = 'repeat'; rim.source.addressMode = 'repeat';
    const old = [this.vineShadow.texture, this.vineRim.texture];
    this.vineShadow.texture = sh; this.vineRim.texture = rim; this.vineWilt.texture = sh; // V3.2: the wilt wash uses the stem body mask
    for (const t of old) if (t && t !== PIXI.Texture.WHITE) t.destroy(true);
  }

  // ---------------------------------------------------------------- vine
  /**
   * Vine skin. ART strips (`<skin>.stem`, tileable ALONG the stroke, `tile:'x'`) are cut out of
   * their atlas into a repeat-wrapped texture and mapped by arc length; without one the engine
   * paints its own strip (U = wood age) from the skin's stroke params. `<skin>.leaf` /
   * `<skin>.flower` replace the vector leaves and blossoms.
   */
  /** V2-INT: the equipped vine (Grove wardrobe) beats the world default; null = world default. */
  setSkinOverride(id) { this.skinOverride = id || null; if (this.W) this.setSkin(this.skinOverride || this.W.vineSkinDefault); }
  setSkin(id, force) {
    id = SKIN_ALIAS[id] || id;
    if (this.skinId === id && !force) return;
    this.skinId = id; const sk = skinDef(id);
    this.sk = sk; this.vineTile = null;
    let t = this.skins.get(id);
    if (!t) {
      t = PIXI.Texture.from(paintStrip(id)); t.source.scaleMode = 'linear'; t.source.addressMode = 'clamp-to-edge';
      this.trackTex('skin:' + id, 256, 64); this.skins.set(id, t);
    }
    this.vine.mesh.texture = t; this.setStripMargin(0);
    this.vineGlow.mesh.tint = sk.glow ? hexN(sk.glow) : 0;
    const stemId = id + '.stem', e = registryEntry(stemId);
    if (e) {
      const want = id;
      const cached = this.skins.get(stemId);
      const use = (tile) => { if (this.skinId !== want || !tile) return; this.vine.mesh.texture = tile.tex; this.vineTile = tile; this.setStripMargin((1 - 1.15 / tile.coreK) / 2); };
      if (cached) use(cached);
      else {
        const v = pickVariant(e, 512, 64);
        loadBitmap(v.url).then((bm) => {
          if (!bm) return;
          const [x, y, w, h] = (e.rects && e.rects[0]) || [0, 0, bm.width, bm.height];
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(bm, x, y, w, h, 0, 0, w, h);
          const tex = PIXI.Texture.from(cv); tex.source.addressMode = 'repeat'; tex.source.scaleMode = 'linear';
          this.trackTex('skin:' + stemId, w, h);
          const tile = { tex, len: w * 0.5, thick: h * 0.5, coreK: Math.min(1.8, h / Math.max(8, (/(\d+)px core/.exec(e.notes || '') || [0, h * 0.7])[1])) * 1.15 }; // @2x strip: world length of one repeat
          this.skins.set(stemId, tile); use(tile);
        });
      }
    }
    for (const part of ['leaf', 'flower']) this.regLoad(`${id}.${part}`);
  }
  makeRibbon(canvas, blend, CAP = 6000) { // CAP: points (2 verts each)
    const pos = new Float32Array(CAP * 4), uv = new Float32Array(CAP * 4), idx = new Uint32Array((CAP - 1) * 6);
    for (let k = 0; k < CAP - 1; k++) { const a = k * 2, o = k * 6; idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = a + 2; idx[o + 3] = a + 1; idx[o + 4] = a + 3; idx[o + 5] = a + 2; }
    const geometry = new PIXI.MeshGeometry({ positions: pos, uvs: uv, indices: idx });
    const tex = canvas ? PIXI.Texture.from(canvas) : PIXI.Texture.WHITE;
    const mesh = new PIXI.Mesh({ geometry, texture: tex });
    if (blend) mesh.blendMode = blend;
    return { mesh, geometry, pos, uv, cap: CAP, n: 0 };
  }

  /** Builds the vine ribbons for every visible path: width from growth age, U = wood age / arc length.
   *  V3.1: thicker tapered trunk, fresh-growth overlay near live tips, curling tendrils (tier <= 1). */
  buildVine(s, now, topY, botY, px, gold) {
    const R = this.vine, G = this.vineGlow, F = this.fresh, TD = this.tendril, sk = this.sk, st = this.vst || vstyle(this.worldId);
    const tier = quality.tier;
    const glowOn = sk.glow && tier <= 1, freshOn = tier <= 2, tendOn = tier <= 1;
    let n = 0, gn = 0, fn = 0, tn = 0;
    const P = R.pos, U = R.uv, GP = G.pos, GU = G.uv, FP = F.pos, FU = F.uv, TP = TD.pos, TU = TD.uv, cap = R.cap - 4, fcap = F.cap - 4, tcap = TD.cap - 4;
    const step = Math.max(1, Math.floor(px * 1.3));
    const order = s.paths, tile = this.vineTile;
    const arcU = (p, i) => { // cumulative arc length per path (append-only), cached on our side
      let A = this.arc.get(p); if (!A || A.length > p.pts.length) { A = [0]; this.arc.set(p, A); }
      for (let k = A.length; k <= i; k++) { const q = p.pts[k], r = p.pts[k - 1]; A.push(A[k - 1] + Math.hypot(q.x - r.x, q.y - r.y)); }
      return A[i];
    };
    const wAt = (pt) => 8.5 + Math.min(24, 3 * Math.sqrt(Math.max(0, now - pt.t)));
    const brk = (arr, uarr, k, x, y) => { arr[k * 4] = x; arr[k * 4 + 1] = y; arr[k * 4 + 2] = x; arr[k * 4 + 3] = y; uarr[k * 4] = uarr[k * 4 + 2] = 0.5; uarr[k * 4 + 1] = uarr[k * 4 + 3] = 0.5; };
    const FRESH_L = 72, TSTEP = 60, curlK = st.curl || 4.4;
    this.vineHW = this.vineHW || new WeakMap();
    for (const p of order) {
      if (p.state === 'gone' || p.pts.length < 2) continue;
      const pts = p.pts, rev = p.state === 'reverting';
      // pts run bottom -> top (y decreasing)
      let i0 = 0, i1 = pts.length - 1;
      { let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].y > botY + 40) lo = m + 1; else hi = m; } i0 = Math.max(0, lo - 1); }
      { let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].y > topY - 40) lo = m + 1; else hi = m; } i1 = Math.min(pts.length - 1, lo + 1); }
      if (i1 <= i0) continue;
      const live = p.state === 'live';
      const first = n, ffirst = fn;
      const wmul = sk.width * (rev ? 0.9 : 1);
      const tipArc = arcU(p, pts.length - 1);
      let lastT = -1;
      for (let i = i0; i <= i1 && n < cap; i += (i + step > i1 && i !== i1 ? i1 - i : step)) {
        const a = pts[i], b = pts[Math.min(i1, i + 1)], c = pts[Math.max(i0, i - 1)];
        let dx = b.x - c.x, dy = b.y - c.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const w0 = Math.max(9, wAt(a)); // floor: the stroke always reads as paint, not a hairline
        // tip taper: the brush lifts off over the last stretch of a live path; a fork starts slim at its knot
        const fromTip = pts.length - 1 - i;
        const taper = (live ? Math.min(1, 0.3 + fromTip / 16) : 1) * (p.parent != null ? Math.min(1, 0.55 + i / 10) : 1);
        const core = (w0 * wmul * taper) / 2 + 1.6 * Math.max(1, px * 0.8);
        // keyline lives inside the strip; ART stem strips carry transparent margins (core 48 of 68 px)
        const hw = core * (tile ? tile.coreK : 1);
        const nx = -dy * hw, ny = dx * hw;
        const arc = arcU(p, i);
        const age = tile ? arc / tile.len : rev ? 0.98 : Math.min(0.98, Math.max(0.02, (wAt(a) - 4) / 14));
        if (n === first && n > 0) { brk(P, U, n, a.x, a.y); n++; }
        const o = n * 4;
        P[o] = a.x + nx; P[o + 1] = a.y + ny; P[o + 2] = a.x - nx; P[o + 3] = a.y - ny;
        U[o] = age; U[o + 1] = 0; U[o + 2] = age; U[o + 3] = 1;
        n++;
        // fresh young growth: bright overlay over the last FRESH_L units of a live stem, fading back
        const dTip = tipArc - arc;
        if (freshOn && live && !rev && dTip < FRESH_L && fn < fcap) {
          if (fn === ffirst && fn > 0) { brk(FP, FU, fn, a.x, a.y); fn++; }
          const fh = core * 0.94, fo = fn * 4, fu = dTip / FRESH_L;
          FP[fo] = a.x - dy * fh; FP[fo + 1] = a.y + dx * fh; FP[fo + 2] = a.x + dy * fh; FP[fo + 3] = a.y - dx * fh;
          FU[fo] = fu; FU[fo + 1] = 0; FU[fo + 2] = fu; FU[fo + 3] = 1; fn++;
        }
        // curling tendrils, deterministic per stretch of stem, unfurling as the stem grows past
        const tk = Math.floor(arc / TSTEP);
        if (tendOn && !rev && tk !== lastT && tk > 0 && tn < tcap - 40) {
          lastT = tk;
          const h = hash(tk * 7.31 + p.id * 13.7);
          if (h > 0.3) {
            const grow = Math.min(1, Math.max(0, (now - a.t - 0.12) / 0.75));
            if (grow > 0.02) {
              const side = (tk + p.id) % 2 ? 1 : -1, h2 = hash(tk * 3.7 + 1.1);
              const segs = 16, len = (34 + h2 * 30) * (0.35 + 0.65 * grow), turn = curlK * (0.8 + h * 0.5) * (0.45 + 0.55 * grow);
              // start on the stem edge, heading outward and up
              let ang = Math.atan2(dy, dx) + side * (0.95 + h2 * 0.5) + Math.sin(now * 1.3 + tk) * 0.07;
              let x = a.x - side * dy * core * 0.85, y = a.y + side * dx * core * 0.85;
              if (tn > 0) { brk(TP, TU, tn, x, y); tn++; }
              for (let j = 0; j <= segs; j++) {
                const t = j / segs, tw = (4.2 * (1 - t) + 0.7) * Math.max(1, px * 0.75);
                const ca = Math.cos(ang + side * Math.PI / 2), sa = Math.sin(ang + side * Math.PI / 2);
                const to = tn * 4;
                TP[to] = x + ca * tw; TP[to + 1] = y + sa * tw; TP[to + 2] = x - ca * tw; TP[to + 3] = y - sa * tw;
                TU[to] = t; TU[to + 1] = 0; TU[to + 2] = t; TU[to + 3] = 1; tn++;
                const segL = len / segs * (1 - t * 0.45);
                ang += side * turn * Math.pow(t + 0.08, 1.6) / segs * 2.2;
                x += Math.cos(ang) * segL; y += Math.sin(ang) * segL;
              }
              { const k = tn - 1; brk(TP, TU, tn, TP[k * 4], TP[k * 4 + 1]); tn++; }
            }
          }
        }
        if (glowOn && live && fromTip < 40 && gn < cap) {
          const gw = (Math.min(w0, 10) * 2.4 + 14 * Math.max(1, px * 0.8)) * (1 - fromTip / 44);
          if (gn > 0 && fromTip >= 39) { brk(GP, GU, gn, a.x, a.y); gn++; }
          const go = gn * 4, gx = -dy * gw / 2, gy = dx * gw / 2;
          GP[go] = a.x + gx; GP[go + 1] = a.y + gy; GP[go + 2] = a.x - gx; GP[go + 3] = a.y - gy;
          GU[go] = 0.5; GU[go + 1] = 0; GU[go + 2] = 0.5; GU[go + 3] = 1; gn++;
        }
        if (i === i1) break;
      }
      if (n > first) { const k = n - 1; brk(P, U, n, P[k * 4], P[k * 4 + 1]); n++; }
      if (fn > ffirst) { const k = fn - 1; brk(FP, FU, fn, FP[k * 4], FP[k * 4 + 1]); fn++; }
      if (glowOn && gn > 0) { const k = gn - 1; brk(GP, GU, gn, GP[k * 4], GP[k * 4 + 1]); gn++; }
    }
    // collapse the tail (unused capacity) into a point
    const clear = (arr, from, to) => { if (to > from) arr.fill(0, from * 4, to * 4); };
    clear(P, n, R.n); clear(GP, gn, G.n); clear(FP, fn, F.n); clear(TP, tn, TD.n); R.n = n; G.n = gn; F.n = fn; TD.n = tn;
    for (const X of [R, G, F, TD]) { X.geometry.getBuffer('aPosition').update(); X.geometry.getBuffer('aUV').update(); }
    G.mesh.visible = gn > 0; G.mesh.alpha = gold > 0 ? 0.5 : 0.2;
    F.mesh.visible = fn > 0; TD.mesh.visible = tn > 0;
    this.vineShadow.visible = tier <= 2 && n > 0; this.vineRim.visible = tier <= 1 && n > 0 && !!st.rim;
    // V3.2 vine = sap bar: a dry-brown wash over the stem body, a warm-grey multiply, fading fresh growth
    const wl = this.wilt || 0;
    this.vineWilt.visible = n > 0 && wl > 0.02; this.vineWilt.alpha = 0.82 * wl;
    R.mesh.tint = wl > 0.01 ? lerpN(0xffffff, WILT_DRY, wl) : 0xffffff;
    F.mesh.alpha = 1 - 0.85 * wl; TD.mesh.tint = wl > 0.01 ? lerpN(0xffffff, WILT_LEAF, wl) : 0xffffff;
    this.vineRim.alpha = (st.rimA || 0.5) * (1 - 0.6 * wl);
    if (gold > 0) G.mesh.tint = 0xffd36a; else if (sk.glow) G.mesh.tint = hexN(sk.glow);
  }

  drawLeaves(s, now, topY, botY, px) {
    const pool = this.leafPool, id = this.skinId; pool.begin();
    const wl = this.wilt || 0, wTint = wl > 0.01 ? lerpN(0xffffff, WILT_LEAF, wl) : 0xffffff; // V3.2: leaves brown + droop with low sap
    const artLeaf = this.regFrames.get(`${id}.leaf`), artFlower = this.regFrames.get(`${id}.flower`);
    const leafT = this.tex[`leaf.${id}`] || this.tex['fx.leaf'], darkT = this.tex[`leaf.${id}.dark`] || leafT, dotT = this.tex['vine.dot'];
    const k = 1 / this.atlas.res;
    const dots = this.sk.dot;
    for (const p of s.paths) {
      if (p.state === 'gone' || !p.commits.length) continue;
      const rev = p.state === 'reverting';
      for (const c of p.commits) {
        const pt = p.pts[Math.min(c.i, p.pts.length - 1)];
        if (!pt || pt.y < topY - 60 || pt.y > botY + 60) continue;
        const grow = Math.min(1, (now - c.born) / 0.45), pop = grow < 1 ? easeBack(grow) : 1;
        if (c.kind === 'bloom') {
          if (rev) continue;
          if (artFlower) { const sp = pool.next(), ft = artFlower.frames[0]; sp.texture = ft; sp.anchor.set(0.5); sp.x = pt.x; sp.y = pt.y - 8; sp.rotation = Math.sin(now * 0.8 + c.i) * 0.1; sp.scale.set(pop * 30 / (ft.width * 0.5) * 0.5); sp.tint = 0xffffff; sp.alpha = 1; continue; }
          for (let j = 0; j < 3; j++) { const sp = pool.next(); sp.texture = this.tex['fx.petal']; sp.anchor.set(0.5); const h = hash(c.i * 3 + j); sp.x = pt.x + (j - 1) * 15 * pop; sp.y = pt.y - 6 - (j % 2) * 12 * pop; sp.scale.set(k * 1.3 * pop); sp.rotation = now * 0.3 + h * 6; sp.tint = j === 1 ? 0xffe4ec : 0xffb6c8; sp.alpha = 1; }
          continue;
        }
        if (!rev && px < 3) {
          const nL = c.kind === 'merge' ? 4 : 2;
          for (let j = 0; j < nL; j++) {
            const side = j % 2 === 0 ? 1 : -1, h = hash(c.i * 13 + j);
            // unfurl: leaves open from folded against the stem to their final angle
            const open = (0.7 + h * 0.6) * (0.25 + 0.75 * pop);
            const ang = side * open - Math.PI / 2 + Math.sin(now * 1.6 + c.i * 0.3 + j) * 0.08;
            const len = (14 + h * 9) * pop * (c.kind === 'merge' ? 1.2 : 1);
            const sp = pool.next();
            if (artLeaf) { // ART leaf: anchor at its base, drawn pointing up-right (rotate so it follows `ang`)
              const ft = artLeaf.frames[0]; sp.texture = ft; sp.anchor.set(artLeaf.anchor[0], artLeaf.anchor[1]);
              sp.x = pt.x; sp.y = pt.y; sp.rotation = ang + Math.PI / 4; const q = len / (ft.width * 0.5 * 0.9) * Math.max(1, px * 0.8) * 0.5 * Math.max(0.4, pop);
              sp.scale.set(side < 0 ? -q : q, q * (1 - 0.3 * wl)); sp.rotation = (side < 0 ? ang + Math.PI * 3 / 4 : ang + Math.PI / 4) + side * wl * 0.6;
              sp.tint = mulN(j % 2 ? 0xd8e0d8 : 0xffffff, wTint); sp.alpha = 1;
            } else {
              sp.texture = j % 2 ? darkT : leafT; sp.anchor.set(0.03, 0.5);
              sp.x = pt.x; sp.y = pt.y; sp.rotation = ang + side * wl * 0.6; sp.scale.set(len / 30 * k * Math.max(1, px * 0.8), Math.max(0.4, pop) * Math.max(1, px * 0.8) * 0.9 * k * (1 - 0.3 * wl));
              sp.tint = mulN(j >= 2 ? 0xfff2d8 : 0xffffff, wTint); sp.alpha = 1;
            }
          }
        }
        const r = (c.kind === 'merge' ? 7.5 : c.kind === 'fork' ? 5.5 : 4.2) * pop * Math.max(1, px * 0.7);
        const d = pool.next(); d.texture = dotT; d.anchor.set(0.5); d.x = pt.x; d.y = pt.y; d.rotation = 0; d.alpha = 1;
        d.scale.set((r + 2.2) / 10 * k); d.tint = rev ? 0xff9a86 : c.kind === 'merge' ? 0xf2b33d : c.kind === 'fork' ? hexN(dots.fork) : hexN(dots.plain);
      }
    }
    // V3.1: leaves sprout all along the stem (alternate sides, pop + unfold + sway), flowers now and then,
    // a few darker back leaves under the stem for depth. Deterministic per stretch of stem.
    const tier = quality.tier, st = this.vst || vstyle(this.worldId);
    if (px < 3 && tier <= 2) {
      const bp = this.leafBackPool; bp.begin();
      const dens = tier <= 1 ? 1 : 0.6, LSTEP = st.leafStep / dens, FSTEP = st.flowerStep;
      const wAt = (pt) => 8.5 + Math.min(24, 3 * Math.sqrt(Math.max(0, now - pt.t)));
      for (const p of s.paths) {
        if (p.state === 'gone' || p.state === 'reverting' || p.pts.length < 3) continue;
        const pts = p.pts, A = this.arc.get(p); if (!A) continue;
        let i0 = 0, i1 = Math.min(pts.length - 1, A.length - 1);
        { let lo = 0, hi = i1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].y > botY + 40) lo = m + 1; else hi = m; } i0 = Math.max(1, lo - 1); }
        { let lo = 0, hi = i1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].y > topY - 40) lo = m + 1; else hi = m; } i1 = Math.min(i1, lo + 1); }
        let lastL = Math.floor(A[i0 - 1] / LSTEP), lastF = Math.floor(A[i0 - 1] / FSTEP);
        for (let i = i0; i < i1; i++) {
          const kL = Math.floor(A[i] / LSTEP), kF = Math.floor(A[i] / FSTEP);
          if (kL === lastL && kF === lastF) continue;
          const a = pts[i], b = pts[Math.min(pts.length - 1, i + 1)], c = pts[i - 1];
          let dx = b.x - c.x, dy = b.y - c.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const dir = Math.atan2(dy, dx), core = Math.max(9, wAt(a)) * this.sk.width / 2;
          if (kL !== lastL) {
            lastL = kL;
            const h = hash(kL * 3.17 + p.id * 11.3);
            if (h >= st.leafSkip) {
              const g = Math.min(1, Math.max(0, (now - a.t - 0.05) / 0.42)); if (g <= 0) continue;
              const pop = g < 1 ? easeBack(g) : 1, side = (kL + p.id) % 2 ? 1 : -1, h2 = hash(kL * 5.1 + 2.3), h3 = hash(kL * 9.7 + 4.1);
              const back = tier <= 1 && h3 < 0.32;
              const sway = Math.sin(now * 1.7 + kL * 1.3) * (0.07 + (pts.length - i < 30 ? 0.06 : 0));
              const ang = dir + side * (0.75 + h2 * 0.65) * (0.25 + 0.75 * Math.min(1, pop)) * (back ? 1.25 : 1) + sway * (1 - 0.7 * wl) + side * wl * 0.75; // V3.2: droop
              const len = (19 + h * 14) * (back ? 1.2 : 1) * Math.min(1.25, 0.8 + core / 40) * Math.max(0.05, pop);
              const sp = back ? bp.next() : pool.next();
              const bx = a.x - side * dy * core * 0.55, by = a.y + side * dx * core * 0.55;
              if (artLeaf) {
                const ft = artLeaf.frames[0]; sp.texture = ft; sp.anchor.set(artLeaf.anchor[0], artLeaf.anchor[1]);
                const q = len / (ft.width * 0.5 * 0.9) * 0.5 * Math.max(1, px * 0.8);
                sp.x = bx; sp.y = by; sp.scale.set(side < 0 ? -q : q, q * (1 - 0.3 * wl)); sp.rotation = side < 0 ? ang + Math.PI * 3 / 4 : ang + Math.PI / 4;
              } else {
                sp.texture = h2 > 0.5 ? darkT : leafT; sp.anchor.set(0.03, 0.5); sp.x = bx; sp.y = by; sp.rotation = ang;
                sp.scale.set(len / 30 * k * Math.max(1, px * 0.8), Math.min(1, pop) * Math.max(1, px * 0.8) * 0.9 * k * (1 - 0.3 * wl));
              }
              sp.tint = mulN(back ? 0x8c9a8c : h2 > 0.62 ? 0xe2eadc : 0xffffff, wTint); sp.alpha = 1;
            }
          }
          if (kF !== lastF) {
            lastF = kF;
            const h = hash(kF * 13.3 + p.id * 3.9);
            if (h < st.flowerP) {
              const g = Math.min(1, Math.max(0, (now - a.t - 0.3) / 0.7)); if (g <= 0) continue;
              const pop = easeBack(g), side = (kF + p.id) % 2 ? -1 : 1, size = (15 + h * 9) * Math.max(1, px * 0.7);
              const fx0 = a.x - side * dy * (core + 5), fy0 = a.y + side * dx * (core + 5);
              const sp = pool.next();
              if (artFlower) { const ft = artFlower.frames[0]; sp.texture = ft; sp.anchor.set(0.5); sp.scale.set(size * pop / ft.width); }
              else { sp.texture = this.tex['fx.petal']; sp.anchor.set(0.5); sp.scale.set(k * 1.6 * pop); sp.tint = 0xffd0dc; }
              sp.x = fx0; sp.y = fy0; sp.rotation = (1 - Math.min(1, g * 1.2)) * -0.9 * side + Math.sin(now * 0.9 + kF) * 0.08 + side * wl * 0.5; sp.alpha = 1 - 0.75 * wl; if (artFlower) sp.tint = wTint; // V3.2: flowers fade + droop
            }
          }
        }
      }
      bp.end();
    } else this.leafBackPool.begin(), this.leafBackPool.end();
    // scars where a single tip got hit
    for (const sc of s.scars) { if (sc.y < topY - 20 || sc.y > botY + 20) continue; const sp = pool.next(); sp.texture = this.tex['fx.spark']; sp.anchor.set(0.5); sp.x = sc.x; sp.y = sc.y; sp.rotation = Math.PI / 4; sp.scale.set(k * 0.75); sp.tint = 0xe2603f; sp.alpha = 1; }
    pool.end();
  }

  drawTips(s, now, fx, gold) {
    const pool = this.tipPool, gp = this.glowPool; pool.begin();
    const blink = s.invuln > 0 && Math.floor(now * 14) % 2 === 0;
    const sq = fx.squash || 0, k = 1 / this.atlas.res, sk = this.sk;
    for (const tip of s.tips) {
      const g = gp.next(); g.anchor.set(0.5); g.x = tip.x; g.y = s.cy; g.tint = gold > 0 ? 0xf2b33d : hexN(sk.glow || '#6fe3b4'); g.alpha = 0.55; g.scale.set((34 + Math.sin(now * 6) * 2) / 32 * k);
      if (blink) continue;
      // growth-tip squash & stretch (fork/merge/land) plus a living wobble
      const wob = Math.sin(now * 12) * 0.05;
      const b = pool.next(); b.anchor.set(0.5, 0.62); b.x = tip.x; b.y = s.cy; b.rotation = s.heading || 0;
      b.scale.set(k * (1 + sq * 0.45 - wob), k * (1 - sq * 0.3 + wob));
      b.tint = gold > 0 ? 0xffd36a : hexN(sk.tip); b.alpha = 1;
    }
    pool.end();
  }

  drawEntities(s, now, gold, ui) {
    const pool = this.entPool, k = 1 / this.atlas.res; pool.begin();
    if (!ui.reveal) {
      for (const o of s.motes) {
        if (o.y < this.topY - 30 || o.y > this.botY + 30) continue;
        if (o.kind === 'acorn' && o.letter) continue; // word-hunt letters keep their 2D text tile
        const id = o.skin || (o.kind === 'sun' ? 'pickup.sun' : o.kind === 'dew' ? 'pickup.dew' : o.kind === 'acorn' ? (o.gem ? 'pickup.gem' : 'pickup.acorn') : o.kind === 'chip' || o.kind === 'bark' ? 'pickup.chip' : `pickup.${o.kind}`);
        const t = this.sprite(id);
        if (this.worldId === 'gilded' && (o.kind === 'sun' || o.kind === 'acorn')) { // V2-INT: cool dark rim so gold rewards read on gold leaf
          const h = pool.next(); h.texture = this.tex.glow; h.anchor.set(0.5); h.tint = 0x0d3f48; h.alpha = 0.62; h.rotation = 0;
          h.x = o.x; h.y = o.y; h.scale.set((o.r * 3.4) / 64 * k);
        }
        // V3.2: sunlight ("sap rings") drawn SUN_K x bigger (the visual now matches the pickup radius r + 13),
        // with a glowing outline; the first few of a run pulse to teach "grab these"
        const sun = o.kind === 'sun' && !o.fin;
        if (sun && !o.v32) { o.v32 = 1; o.v32i = this.sunSeen = (this.sunSeen || 0) + 1; }
        const teach = sun && o.v32i <= SUN_TEACH ? 1 : 0, by = Math.sin(now * (o.kind === 'sun' ? 2.2 : 3) + o.ph) * 2.5;
        const pulse = 1 + Math.sin(now * 5 + o.ph) * 0.07 + teach * 0.16 * Math.max(0, Math.sin(now * 6.5 + o.ph));
        if (sun) {
          const ring = this.tex['fx.ring'];
          if (ring) { const q = pool.next(); q.texture = ring; q.anchor.set(0.5); q.x = o.x; q.y = o.y + by; q.rotation = 0; q.tint = o.rich ? 0xffc85a : 0xfff0b8; q.alpha = 0.55 + 0.3 * teach; q.scale.set((o.r * 2 * SUN_K + 8) * pulse / ring.width); }
          const g = this.glowPool.next(); g.anchor.set(0.5); g.x = o.x; g.y = o.y + by; g.tint = 0xffd36a; g.alpha = 0.22 + 0.25 * teach; g.scale.set(o.r * SUN_K * 3.6 / 32 * k * pulse);
        }
        const sp = pool.next(); sp.texture = t; sp.anchor.set(0.5); sp.alpha = 1; sp.tint = 0xffffff;
        const reg = this.regTex.has(resolveId(id) || id), sc = reg ? (o.r * 2.6) / Math.max(t.width, t.height) : k;
        sp.x = o.x; sp.y = o.y + by;
        sp.rotation = o.kind === 'acorn' && !o.gem ? Math.sin(now * 2 + o.ph) * 0.18 : o.kind === 'chip' ? now : 0;
        sp.scale.set(sc * (o.kind === 'sun' ? pulse * o.r / 11 * (sun ? SUN_K : 1) : 1));
        if (o.kind === 'sun' || o.gem) { const g = this.glowPool.next(); g.anchor.set(0.5); g.x = sp.x; g.y = sp.y; g.tint = o.gem ? 0x8fa8ff : 0xf2b33d; g.alpha = gold > 0 ? 0.6 : 0.42; g.scale.set(o.r * (gold > 0 ? 3.4 : 2.8) / 32 * k * (o.gem ? 1.1 : 0.78) * (sun ? SUN_K : 1)); }
      }
      for (const b of s.beetles) {
        if (b.y < this.topY - 30 || b.y > this.botY + 30) continue;
        const fr = Math.floor(now * 10 + (b.ph || 0)) & 1;
        const id = b.skin || `${this.worldId}.enemy.beetle`;
        const t = this.regTex.get(id) || this.tex[`enemy.beetle.${fr}`];
        const sp = pool.next(); sp.texture = t; sp.anchor.set(0.5); sp.alpha = 1; sp.tint = 0xffffff;
        const dir = b.vx >= 0 ? 1 : -1; sp.x = b.x; sp.y = b.y; sp.rotation = Math.sin(now * 16 + (b.ph || 0)) * 0.05;
        sp.scale.set(dir * 1.15 * k, 1.15 * k);
      }
    }
    pool.end();
  }

  drawParticles(fx, px, ui) {
    const pool = this.fxPool, k = 1 / this.atlas.res; pool.begin();
    const cap = BUDGET[quality.tier].parts - this.flow.length - this.amb.length;
    let n = 0;
    for (const p of fx.particles) {
      if (n++ >= Math.max(24, cap)) break;
      const a = Math.max(0, p.life / p.max);
      const kind = p.kind === 'leaf' ? 'fx.leaf' : p.kind === 'ring' ? 'fx.ring' : p.kind === 'spark' ? 'fx.spark' : p.kind === 'stroke' ? `fx.stroke.${(p.v || 0) % 6}` : 'dot';
      const q = pool.next(this.tex[kind]);
      q.x = p.x; q.y = p.y; q.rotation = p.rot || 0; q.tint = hexN(p.color && p.color[0] === '#' ? p.color : '#ffffff'); q.alpha = Math.min(1, a * (p.kind === 'ring' ? 1 : 1.6));
      let sc;
      if (p.kind === 'ring') { const rr = p.size * (1 - Math.pow(a, 3)) + 6; sc = rr / 61 * k; }
      else if (p.kind === 'leaf') sc = p.size * 2 / 30 * k;
      else if (p.kind === 'spark') sc = p.size * (0.5 + 0.5 * a) / 15 * k;
      else if (p.kind === 'stroke') sc = p.size * 3 / 50 * k;
      else sc = p.size * (0.4 + 0.6 * a) / 7 * k;
      q.scaleX = q.scaleY = sc;
    }
    this.fxDrawn = pool.n;
    pool.end();
  }

  // ---------------------------------------------------------------- sky + ambient
  updateFlow(dt, zt) {
    const W = this.W, pool = this.flowPool; pool.begin();
    if (W.sky === 'flow' && !(this.living && liveWorld(W.id))) { // V3.2: with living plates the painted sky itself swirls
      const want = BUDGET[quality.tier].flow, F = this.flowField, cw = this.cw, ch = this.ch;
      const cols = zt.i >= 3 ? [0xf8e27a, 0xdfe8ff, 0x6a8ae0, 0x2a4ab0, 0xfff6c0] : [0x3a6ad0, 0x6a9ae8, 0xf2d86a, 0xdfe8ff, 0x1e3c90];
      while (this.flow.length < want) this.flow.push({ u: Math.random(), v: Math.random() * 0.75, life: 0, max: 2 + Math.random() * 2, f: (Math.random() * 6) | 0, c: cols[(Math.random() * cols.length) | 0], s: 0.6 + Math.random() * 0.7 });
      if (this.flow.length > want) this.flow.length = want;
      const sp = 0.035; // field units per second
      for (const q of this.flow) {
        q.life += dt;
        if (q.life > q.max) { q.u = Math.random(); q.v = Math.random() * 0.75; q.life = 0; q.c = cols[(Math.random() * cols.length) | 0]; }
        const ang = F.at(q.u, q.v);
        q.u += Math.cos(ang) * sp * dt * q.s; q.v += Math.sin(ang) * sp * dt * q.s * 0.56;
        if (q.u > 1.02) q.u -= 1.04; if (q.u < -0.02) q.u += 1.04;
        const t = q.life / q.max, a = Math.sin(Math.PI * t);
        const p = pool.next(this.tex[`fx.stroke.${q.f}`]);
        p.x = q.u * cw; p.y = q.v * ch; p.rotation = ang; p.tint = q.c; p.alpha = 0.55 * a;
        const sz = (0.32 + q.s * 0.22) * Math.max(0.85, Math.min(1.5, cw / 700)) / this.atlas.res;
        p.scaleX = sz; p.scaleY = sz * 0.62;
      }
    } else this.flow.length = 0;
    pool.end();
  }

  updateAmbient(dt, now, zt, camDy) {
    const W = this.W, cw = this.cw, ch = this.ch;
    const ids = W.ambient.filter((id) => AMB[id] && !(this.living && liveWorld(W.id) && AMB[id].livingOff));
    const want = BUDGET[quality.tier].amb;
    if (ids.length) {
      const total = ids.reduce((s, id) => s + AMB[id].w, 0);
      while (this.amb.length < want) {
        let r = Math.random() * total, id = ids[0];
        for (const k of ids) { r -= AMB[k].w; if (r <= 0) { id = k; break; } }
        const d = AMB[id], R = (a) => a[0] + Math.random() * (a[1] - a[0]);
        this.amb.push({ id, d, x: Math.random() * cw, y: d.low ? ch * (0.55 + Math.random() * 0.45) : Math.random() * ch, vx: R(d.vx), vy: R(d.vy), sc: R(d.scale), rot: Math.random() * TAU, ph: Math.random() * TAU, tint: hexN(d.tint[(Math.random() * d.tint.length) | 0]), life: 0, max: 5 + Math.random() * 6 });
      }
    }
    if (this.amb.length > want || !ids.length) this.amb.length = ids.length ? want : 0;
    const pa = this.ambPool, pb = this.ambAddPool; pa.begin(); pb.begin();
    const k = 1 / this.atlas.res;
    for (const q of this.amb) {
      const d = q.d; q.life += dt;
      q.x += (q.vx + Math.sin(now * 0.9 + q.ph) * d.sway) * dt; q.y += q.vy * dt + camDy * 0.35; q.rot += d.spin * dt;
      if (q.life > q.max || q.y > ch + 30 || q.y < -30 || q.x < -30 || q.x > cw + 30) {
        q.life = 0; q.x = Math.random() * cw; q.y = d.low ? ch * (0.55 + Math.random() * 0.45) : (q.vy > 0 ? -20 : q.vy < 0 ? ch + 20 : Math.random() * ch);
        if (camDy > 1) q.y = -20; // climbing: new particles enter from the top
      }
      const t = q.life / q.max, fade = Math.min(1, t * 4, (1 - t) * 4);
      const p = (d.add ? pb : pa).next(this.tex[d.frame]);
      p.x = q.x; p.y = q.y; p.rotation = q.rot; p.tint = q.tint;
      let a = d.alpha * fade;
      if (d.blink) a *= 0.45 + 0.55 * Math.max(0, Math.sin(now * 2.4 + q.ph * 3));
      if (d.glint) a *= 0.6 + 0.4 * Math.max(0, Math.sin(now * 5 + q.ph + q.x * 0.01));
      p.alpha = a;
      p.scaleX = p.scaleY = q.sc * k * (d.grow ? 0.5 + t : 1);
    }
    pa.end(); pb.end();
  }

  updateBackdrop(view, zt) {
    const W = this.W, cw = this.cw, ch = this.ch;
    let tint = mixN(W.zoneTint[zt.i], W.zoneTint[zt.j], zt.w);
    if (W.zoneGrade) { // ART zone grade: multiply part as a tint (free); add/sat would need a filter, so skipped
      const A = W.zoneGrade[zt.i] || W.zoneGrade[0], B = W.zoneGrade[zt.j] || A;
      const ch3 = (k) => Math.max(0, Math.min(255, Math.round(255 * Math.min(1, A.mul[k] + (B.mul[k] - A.mul[k]) * zt.w))));
      tint = (ch3(0) << 16) | (ch3(1) << 8) | ch3(2);
    }
    const sideTint = mixN('#' + tint.toString(16).padStart(6, '0'), '#000000', 0.16);
    this.skyFill.tint = mixN(W.palette.bg, '#000000', 0.15 * zt.i);
    this.wantZoneLayers(zt);
    // zone crossfade (V3): lo/hi = the two zones around the nearest boundary, wHi = weight of hi.
    // Opaque cover skies: the lower sky stays fully opaque while the upper one fades in on top
    // (no see-through mid-fade). Translucent tile layers (far/side) dissolve: lower fades out as
    // upper fades in. A zone layer not decoded yet keeps its lower neighbour fully up.
    const lo = Math.min(zt.i, zt.j), hi = Math.max(zt.i, zt.j), wHi = zt.j > zt.i ? zt.w : zt.j < zt.i ? 1 - zt.w : 0;
    const hiReady = new Set();
    for (const L of this.layers) if (L.zones && L.tex && L.zones.includes(hi)) hiReady.add(L.group);
    let skyCovered = this.opaqueSky;
    let groundY = 9; // V3.2: screen-uv y of the painted horizon of the visible sky (far clouds fade out below it)
    for (const L of this.layers) {
      // zone-limited layers crossfade by height; all-zone layers are re-lit with the zone tint
      let a = 1;
      if (L.zones) {
        const inLo = L.zones.includes(lo), inHi = L.zones.includes(hi);
        const w = hiReady.has(L.group) ? wHi : 0;
        if (inLo && inHi) a = 1;
        else if (inLo) a = L.opaque && L.fit === 'cover' ? 1 : 1 - w;
        else if (inHi) a = w;
        else a = 0;
      }
      if (!L.tex) { L.root.visible = false; continue; }
      if (L.opaque && L.fit === 'cover' && a >= 0.999) skyCovered = true;
      if (L.live) {
        const tw = L.tex.width, th = L.tex.height, sw = tw * L.k0, sh = th * L.k0;
        let x0, y0;
        if (L.fit === 'cover') {
          const y = ch * L.anchor[1] + L.travel * (L.zone != null ? zoneProg(L.zone, view.camM) : Math.min(1, view.camM / 1400));
          x0 = cw * L.anchor[0] - view.camX * L.parallax * 0.15 - sw * L.anchor[0]; y0 = y - sh * L.anchor[1];
          L.root.visible = a > 0.003 && y0 < ch + 2;
        } else if (L.mode === 'tile-x' || L.mode === 'tile-y') {
          x0 = (cw - sw) / 2 - view.camX * L.parallax * 0.15; y0 = ch - sh + view.camPx * L.parallax;
          L.root.visible = a > 0.003;
        } else {
          const y = ch * L.anchor[1] + view.camPx * L.parallax;
          x0 = cw * L.anchor[0] - view.camX * L.parallax * 0.15 - sw * L.anchor[0]; y0 = y - sh * L.anchor[1];
          L.root.visible = a > 0.003 && y0 < ch + 2;
        }
        if (L.fit === 'cover' && L.opaque) { const hy = L.live.hz != null ? (y0 + L.live.hz * sh) / ch : 1.2; groundY = a >= 0.999 ? hy : groundY + (hy - groundY) * a; }
        if (L.root.visible) this.living.update(L.live, cw, ch, [cw / sw, ch / sh, -x0 / sw, -y0 / sh], tint, a, quality.tier, groundY);
        continue;
      }
      if (L.main) {
        let y;
        if (L.fit === 'cover') y = ch * L.anchor[1] + L.travel * (L.anchor[1] - 0.5) * 0 + L.travel * (L.zone != null ? zoneProg(L.zone, view.camM) : Math.min(1, view.camM / 1400));
        else y = ch * L.anchor[1] + view.camPx * L.parallax;
        const x = cw * L.anchor[0] - view.camX * L.parallax * 0.15;
        L.main.position.set(x, y); L.main.tint = tint; L.main.alpha = a;
        const top = y - L.tex.height * L.k0 * L.anchor[1];
        // culled once it has scrolled fully off screen
        L.root.visible = a > 0.003 && top < ch + 2;
        if (L.sides) { const sw = L.tex.width * L.k0; for (const s of L.sides) { s.position.set(x + s.dir * sw * s.idx, y); s.tint = sideTint; s.alpha = a; } }
      } else if (L.tile) {
        L.root.visible = a > 0.003;
        L.tile.tint = tint; L.tile.alpha = a;
        // bottom of the tile sits on the screen bottom at the start, then scrolls with camera * parallax
        L.tile.tilePosition.y = ch - L.tex.height * L.k0 + view.camPx * L.parallax;
        L.tile.tilePosition.x = (cw - L.tex.width * L.k0) / 2 - view.camX * L.parallax * 0.15;
      }
    }
    this.skyFill.visible = !skyCovered; // no overdraw under an opaque painted sky (zone skies included)
  }

  // ---------------------------------------------------------------- events / juice
  /** Sim events (main.js handleEvents passes them through). Presentation only. */
  event(e, fx, cam, quiet) {
    if (!this.ready || this.failed) return;
    const sk = this.sk, mat = [hexN(sk.strip.fresh), hexN(sk.strip.core), hexN(sk.leaf.fill)];
    const pop = (x, y, tex, tint, size, dur = 0.42) => {
      const s = new PIXI.Sprite(tex); s.anchor.set(0.5); s.x = x; s.y = y; s.tint = tint; s.scale.set(0.01); this.juiceC.addChild(s);
      const k = size / Math.max(tex.width, tex.height);
      this.tween(s.scale, { x: k, y: k, duration: dur * 0.45, ease: 'back.out(2.2)' });
      this.tween(s, { alpha: 0, duration: dur * 0.55, delay: dur * 0.45, ease: 'sine.in', onComplete: () => s.destroy() });
    };
    const strokes = (x, y, n, speed) => { // fork/merge burst painted in the skin's material
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random() * 0.4, v = speed * (0.6 + Math.random() * 0.6); fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.55, max: 0.55, size: 9 + Math.random() * 6, color: '#' + mat[i % 3].toString(16).padStart(6, '0'), kind: 'stroke', v: i, rot: a, vr: 0 }); }
    };
    switch (e.type) {
      case 'collect': pop(e.x, e.y, this.tex['fx.ring'], 0xffe08a, 46, 0.36); break;
      case 'fork': if (!quiet) strokes(e.x, e.y, 8, 160); break;
      case 'merge': strokes(e.x, e.y, 10 + Math.min(8, e.mult || 0), 230); pop(e.x, e.y, this.tex.glow, 0xffd36a, 160, 0.5); break;
      case 'hit': case 'revert': if (!quiet) pop(e.x, e.y, this.tex['fx.ink.1'], 0xe2603f, 60, 0.4); break;
      case 'vehicle.mount': if (!quiet) { fx.slowmo = Math.max(fx.slowmo || 0, 0.35); cam.punch = 0.08; pop(e.x, e.y, this.tex.glow, 0xffffff, 220, 0.6); } break;
      case 'vehicle.dismount': if (!quiet) pop(e.x, e.y, this.tex['fx.ring'], 0xffffff, 120, 0.4); break;
      case 'vehicle.hit': if (!quiet) { fx.flash = Math.max(fx.flash, 0.5); fx.flashColor = '255,90,60'; } break;
      case 'ring.pick': case 'skill.fire': pop(e.x, e.y, this.tex['fx.ring'], 0xfff1b0, 90, 0.45); break;
      case 'setpiece.start': case 'boss.phase': if (!quiet) cam.trauma = Math.min(1, (cam.trauma || 0) + 0.2); break;
      default:
        if (e.type && e.type.startsWith('pickup.')) pop(e.x, e.y, this.sprite(e.type), 0xffffff, 54, 0.4);
    }
  }
  /** V3.1: a soft per-world particle trail behind each growing tip (pollen, impasto flecks, gold dust...). */
  tipTrail(s, fx, dt) {
    if (s.dead || !s.tips || !s.tips.length || quality.tier >= 3 || fx.particles.length > 140) return;
    const T = (this.vst || vstyle(this.worldId)).trail, rate = T.rate * (quality.tier >= 2 ? 0.5 : 1) * Math.min(1.6, Math.max(0.4, (s.speed || 200) / 230));
    this.trailAcc += dt * rate;
    while (this.trailAcc >= 1) {
      this.trailAcc -= 1;
      const tip = s.tips[(Math.random() * s.tips.length) | 0], kind = T.kinds[(Math.random() * T.kinds.length) | 0];
      const life = 0.55 + Math.random() * 0.6;
      fx.particles.push({ x: tip.x + (Math.random() - 0.5) * 10, y: s.cy + 6 + Math.random() * 6, vx: (Math.random() - 0.5) * 46, vy: 26 + Math.random() * 46, g: -14,
        life, max: life, size: kind === 'stroke' ? 3 + Math.random() * 3 : kind === 'leaf' ? 3.5 + Math.random() * 2 : 1.6 + Math.random() * 2.2,
        color: T.cols[(Math.random() * T.cols.length) | 0], kind, v: (Math.random() * 6) | 0, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 5 });
    }
  }
  /** Slow-mo hook (vehicle mount, boss phase). */
  slowmo(fx, dur = 0.35) { fx.slowmo = Math.max(fx.slowmo || 0, dur); }
  /** Budgeted screen shake in CSS px for a trauma value 0..1 (phones <= 4 px, desktop <= 7 px). */
  tween(target, vars) { return this.tl.to(target, vars, this.gsapT); }
  shakePx(trauma) { const k = trauma * trauma; return Math.min(22 * k, SHAKE_PX()); }

  // ---------------------------------------------------------------- frame
  draw(s, cam, fx, ui, view) {
    if (!this.ready || this.failed) return;
    if (this.r.gl && this.r.gl.isContextLost()) return; // V3.2: never compile a shader on a lost context (the contextlost event switches renderer)
    const t0 = performance.now();
    const now = view.now, nowS = t0 / 1000, dt = Math.min(1 / 20, Math.max(0, nowS - this.lastNow)); this.lastNow = nowS;
    this.gsapT += dt; this.tl.totalTime(this.gsapT);
    const res = this.res(); if (Math.abs(this.r.resolution - res) > 0.01 || this.cw !== innerWidth || this.ch !== innerHeight) this.resize();
    const zt = zoneAt(view.camM);
    this.topY = view.topY; this.botY = view.botY;
    const camDy = this.lastCamPx == null ? 0 : (view.camPx - this.lastCamPx); this.lastCamPx = view.camPx;

    this.updateBackdrop(view, zt);
    // V3.2: a pinned living clock (frame-sequence tests) drives the ambient layers too, so captures are deterministic
    let dtA = dt, nowA = nowS;
    if (this.living && this.living.clock != null) { dtA = Math.max(0, Math.min(0.2, this.living.clock - (this.lastClock ?? this.living.clock))); this.lastClock = this.living.clock; nowA = this.living.clock; }
    this.updateFlow(view.frozen ? 0 : dtA, zt);
    this.updateAmbient(view.frozen ? 0 : dtA, nowA, zt, Math.max(-40, Math.min(40, camDy)));

    // world transform (shared with the 2D overlay)
    this.rollC.pivot.set(this.cw / 2, this.ch / 2); this.rollC.position.set(this.cw / 2, this.ch / 2); this.rollC.rotation = view.roll || 0;
    this.world.position.set(view.ox, view.oy); this.world.scale.set(view.sc);
    this.ground.visible = view.botY > -300;
    if (this.ground.visible) this.drawRoots(s);

    // V3.2 vine = sap bar: smoothed wilt from the sap fraction (browns slowly, greens up fast on sunlight)
    if (this.wSim !== s) { this.wSim = s; this.wilt = 0; this.sunSeen = 0; }
    { const fr = s.sap / Math.max(1, s.sapMaxV || 100);
      const wT = ui.reveal || s.golden > 0 ? 0 : Math.max(0, Math.min(1, (WILT_HI - fr) / (WILT_HI - WILT_LO)));
      const wdt = Math.min(0.25, Math.max(0, nowS - (this.wLast || nowS))); this.wLast = nowS; // own clock: not capped at 1/20 like dt
      this.wilt += (wT - this.wilt) * Math.min(1, wdt * (wT < this.wilt ? 6 : 1.8)); }
    this.buildVine(s, now, view.topY, view.botY, view.px, view.gold);
    this.drawLeaves(s, now, view.topY, view.botY, view.px);
    this.glowPool.begin(); // tips and glowing pickups share one additive batch
    this.drawTips(s, now, fx, view.gold);
    this.drawEntities(s, now, view.gold, ui);
    this.glowPool.end();
    if (!view.frozen) this.tipTrail(s, fx, dt);
    this.drawParticles(fx, view.px, ui);

    this.flash.alpha = fx.flash > 0 ? Math.min(0.45, fx.flash * 0.3) : 0;
    if (fx.flash > 0) { const c = String(fx.flashColor || '255,255,255').split(',').map(Number); this.flash.tint = (c[0] << 16) | (c[1] << 8) | c[2]; }
    this.veilS.alpha = view.veil || 0;
    this.flash.visible = this.flash.alpha > 0.003; this.veilS.visible = this.veilS.alpha > 0.003;
    this.vignette.visible = quality.tier <= 1;

    this.stats.dc = 0;
    this.r.render(this.stage);
    this.stats.drawCalls = this.stats.dc;
    const ms = performance.now() - t0;
    const fr = this.stats.frames; fr.push(ms); if (fr.length > 120) fr.shift();
    this.stats.renderMs = ms;
  }

  /** Dim the frozen frame behind a modal (re-renders once with the veil). */
  veil(a) { this.veilS.alpha = a; this.veilS.visible = a > 0; if (this.ready && !this.failed && !(this.r.gl && this.r.gl.isContextLost())) this.r.render(this.stage); }
}

export default GLLayer;
