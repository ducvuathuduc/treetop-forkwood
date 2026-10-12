// Forkwood V3.2 LIVING BACKDROPS: every painted plate is drawn by one shader that keeps the
// painting and moves the paint, the way production 2D games bring a painted background to life
// (Ori's "slices" + uber-shader, Valve's flow maps), instead of a GIF/video loop:
//
//   flow     two-phase flow map (Vlachos, "Water Flow in Portal 2", SIGGRAPH 2010): the paint slides
//            along a per-plate vector field baked from the painting's own brush direction
//            (art-src/tools/living_maps.py); phases cross-fade, a noise offset hides the pulse,
//            and offsets are centred on zero so the plate rests at its painted state at each peak
//   water    ripple UV distortion + moving glints where the plate's map marks water
//   sway     wind sway for grass / willows / lotus marked in the map; side foliage plates sway by
//            distance from the screen edge they are rooted on (UV-distortion wind, gusts in noise)
//   twinkle  stars, lamps, gold leaf and the sun pulse with per-texel phases
//   haze     soft fbm mist drifting where the map allows it (no cut-out sprites: it lives in paint)
//   rays     breathing light shafts from the plate's sun / oculus / canopy light
//   boil     slow noise warp + noise-eroded alpha for translucent cloud plates (no hard cut edges)
//
// One quad (= one draw call, same as the sprite it replaces), 3-5 texture reads per pixel, all
// effect switches are uniforms (no program variants). Quality: tier 0-1 full, tier 2 drops flow
// cross-fade / haze / rays (single read), tier 3 is the static painting.
import { LIVING_MAPS } from './living-data.js';

const VERT = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uFlow;
uniform sampler2D uNoise;
uniform vec4 uColor;   // premultiplied tint * alpha (PixiJS mesh pipe)
uniform vec4 uMap;     // layer uv = screen uv * xy + zw
uniform vec4 uTex;     // tex w, tex h, mode (0 cover: mirror x / clamp y, 1 tile-y: repeat), has flow map
uniform vec4 uT;       // time, flow amp (uv), flow period (s), full quality (1) / lite (0)
uniform vec4 uWave;    // ripple amp, ripple freq, sway amp, water glints
uniform vec4 uFx;      // twinkle, haze, rays, edge sway (side plates)
uniform vec4 uMistC;   // haze rgb, haze scale
uniform vec4 uRayC;    // ray rgb, ray spread
uniform vec4 uRayO;    // ray origin (plate uv), boil amp, alpha erosion
uniform vec4 uClip;    // far plates: screen-uv y of the painted horizon, feather, 1 = keep only below it (water things)
uniform vec4 uSide;    // constant flow for plates without a map: flow xy, plate-u range (waterfalls)

vec2 wrapUV(vec2 uv) {
  if (uTex.z < 0.5) return vec2(1.0 - abs(mod(uv.x, 2.0) - 1.0), clamp(uv.y, 0.0, 1.0));
  return fract(uv);
}
vec4 tex(vec2 uv) { return texture(uTexture, wrapUV(uv)); }

void main() {
  float t = uT.x;
  vec2 uv = vUV * uMap.xy + uMap.zw;
  vec2 mu = wrapUV(uv);
  float asp = uTex.y / max(1.0, uTex.x);
  vec4 F = vec4(0.5, 0.5, 0.0, 0.0), G = vec4(0.0);
  if (uTex.w > 0.5) {
    float fx = clamp(mu.x, 0.004, 0.996) * 0.5;
    F = texture(uFlow, vec2(fx, mu.y));
    G = texture(uFlow, vec2(0.5 + fx, mu.y));
  }
  vec4 N = texture(uNoise, mu * vec2(1.1, 1.1 * asp) + vec2(t * 0.006, t * 0.002));
  float water = F.b <= 0.5 ? F.b * 2.0 : 0.0;
  float sway = F.b > 0.5 ? (F.b - 0.5) * 2.0 : 0.0;
  vec2 d = vec2(0.0);
  if (water > 0.002 && uWave.x > 0.0) {
    float ph = mu.y * uWave.y + t * 1.7 + N.r * 6.2832;
    d += vec2(sin(ph), 0.45 * cos(ph * 0.73 + t * 0.9)) * uWave.x * water;
  }
  float gust = 0.55 + 0.45 * sin(t * 0.47 + N.g * 4.0);
  if (sway > 0.002 && uWave.z > 0.0) {
    d.x += (sin(t * 1.6 + mu.y * 18.0 + N.g * 5.0) * 0.6 + sin(t * 0.7 + mu.x * 4.0) * 0.4) * uWave.z * sway * gust;
  }
  if (uFx.w > 0.0) { // side plates: rooted at the screen edge, the inner (free) ends move most
    float e = min(vUV.x, 1.0 - vUV.x);
    float k = smoothstep(0.0, 0.2, e);
    float n2 = texture(uNoise, vec2(vUV.y * 0.6 - t * 0.05, 0.37)).g;
    float w = (sin(t * 1.3 + vUV.y * 9.0 + n2 * 6.0) * 0.65 + (n2 - 0.5) * 1.2) * gust;
    // leaf flutter: small, quick, spatially varied (the bend above is slow and broad)
    float fl = texture(uNoise, vUV * vec2(4.0, 8.0) + vec2(t * 0.07, -t * 0.04)).g - 0.5;
    w += fl * 1.6 * (0.6 + 0.4 * gust);
    d.x += w * uFx.w * k * uMap.x;
    d.y += cos(t * 1.1 + vUV.x * 7.0) * uFx.w * 0.25 * k * uMap.y;
  }
  if (uRayO.z > 0.0) { // boil: slow billowing warp of translucent cloud plates
    vec2 b = texture(uNoise, mu * vec2(0.8, 0.8 * asp) + vec2(t * 0.011, -t * 0.004)).rg - 0.5;
    d += b * uRayO.z;
  }
  vec2 base = uv + d;
  vec4 col;
  vec2 flow = F.rg * 2.0 - 1.0;
  bool hasFlow = uTex.w > 0.5;
  if (uSide.x != 0.0 || uSide.y != 0.0) {
    float m = smoothstep(uSide.z - 0.04, uSide.z + 0.04, mu.x) * (1.0 - smoothstep(uSide.w - 0.04, uSide.w + 0.04, mu.x));
    flow = uSide.xy * m; hasFlow = true;
  }
  if (uT.y > 0.0 && uT.w > 0.5 && hasFlow) {
    float p0 = fract(t / uT.z + N.g * 0.8);
    float p1 = fract(p0 + 0.5);
    vec4 s0 = tex(base - flow * (p0 - 0.5) * uT.y);
    vec4 s1 = tex(base - flow * (p1 - 0.5) * uT.y);
    col = mix(s0, s1, abs(1.0 - 2.0 * p0));
  } else {
    col = tex(base);
  }
  if (uRayO.w > 0.0 && col.a > 0.001) { // noise-eroded alpha: cloud edges dissolve instead of cutting
    float n = texture(uNoise, mu * vec2(2.3, 2.3 * asp) + vec2(t * 0.008, 0.0)).r;
    float na = clamp((col.a - (1.0 - n) * uRayO.w) / max(0.05, 1.0 - uRayO.w * 0.6), 0.0, 1.0);
    col *= na / col.a;
  }
  if (uFx.x > 0.0 && G.r > 0.003) {
    // per-light phase from the soft noise (constant across one star), slow breathing + quicker shimmer
    float ph = N.r * 19.0 + floor(mu.x * 9.0) * 1.7 + floor(mu.y * 15.0) * 2.3;
    float tw = 0.5 + 0.35 * sin(t * 1.3 + ph) + 0.15 * sin(t * 4.7 + ph * 1.7);
    col.rgb *= 1.0 + uFx.x * G.r * (tw - 0.4);
  }
  if (uT.w > 0.5) {
    if (uFx.y > 0.0 && G.g > 0.003) {
      vec2 mq = mu * vec2(1.0, asp) * uMistC.w;
      float m = texture(uNoise, mq * 0.9 + vec2(t * 0.011, t * 0.003)).r * 0.6
              + texture(uNoise, mq * 1.9 - vec2(t * 0.017, -t * 0.002)).g * 0.4;
      float mist = smoothstep(0.42, 0.78, m) * G.g * uFx.y;
      col.rgb = mix(col.rgb, uMistC.rgb * col.a, mist);
    }
    if (uFx.z > 0.0 && G.b > 0.003) {
      vec2 rd = (mu - uRayO.xy) * vec2(1.0, asp);
      float r = length(rd);
      float ang = atan(rd.y, rd.x);
      // broad soft shafts: the angle walks slowly through low-frequency noise (a few beams, not a starburst)
      float beam = texture(uNoise, vec2(ang * uRayC.w + t * 0.004, 0.31 + r * 0.05 + t * 0.003)).r;
      beam = smoothstep(0.46, 0.8, beam) * (0.75 + 0.25 * sin(t * 0.37 + ang * 2.0));
      float fall = exp(-r * 1.4) * smoothstep(0.0, 0.12, r);
      vec3 ray = uRayC.rgb * beam * fall * uFx.z * G.b;
      col.rgb = col.rgb + ray * col.a * (1.0 - col.rgb * 0.6);
    }
  }
  if (water > 0.002 && uWave.w > 0.0) {
    float g1 = texture(uNoise, mu * vec2(6.0, 6.0 * asp * 0.4) + vec2(t * 0.021, t * 0.004)).b;
    float g2 = texture(uNoise, mu * vec2(4.5, 4.5 * asp * 0.4) - vec2(t * 0.017, 0.0)).b;
    float gl = smoothstep(0.6, 0.72, g1 * 0.5 + g2 * 0.5) * water * uWave.w;
    col.rgb += vec3(1.0, 0.96, 0.86) * gl * col.a;
  }
  if (uClip.x < 1.5) { // clouds stay in the sky (never on the ground); pond things stay on the water
    float below = smoothstep(uClip.x - uClip.y, uClip.x, vUV.y);
    col *= uClip.z > 0.5 ? below : 1.0 - below;
  }
  finalColor = col * uColor;
}`;

const hexRGB = (h) => { const n = parseInt(String(h || '#ffffff').slice(1, 7), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// Per world, per plate group ('sky' covers the zone skies sky.zN too; 'far' = far.zN / far.night).
// flow: [amp (plate uv per cycle), period s]; ripple: [amp, freq]; mist: [strength, colour, scale]; rays: [strength, colour, spread]
// edgeSway: px of wind sway at the free (inner) ends of side foliage; sideFlow: constant flow on a plate-u band per variant
export const LIVE = {
  meadow: {
    sky: { flow: [0.022, 9], ripple: [0, 0], sway: 0.004, twinkle: 0.35, mist: [0.38, '#fff1dc', 1.6], rays: [0.3, '#ffe2a8', 0.16] },
    'sky.z3': { flow: [0.02, 10], twinkle: 0.9, mist: [0.3, '#c8c8f0', 1.5] },
    'sky.z4': { flow: [0.012, 12], twinkle: 1.1 },
    far: { boil: 0.012, soften: 0.55 },
    side: { edgeSway: 4.5 },
  },
  starry: {
    sky: { flow: [0.05, 7], ripple: [0.004, 140], twinkle: 0.7, sparkle: 0.5 },
    far: { boil: 0.02, soften: 0.45 },
    side: { edgeSway: 4 },
  },
  fresco: {
    sky: { flow: [0.018, 10], twinkle: 0.25, mist: [0.25, '#fffaf0', 1.4], rays: [0.26, '#fff0c8', 0.2], rayO: [0.5, -0.08] },
    far: {},
    side: {},
  },
  ukiyo: {
    sky: { flow: [0.024, 9], ripple: [0.0035, 160], twinkle: 0.3, mist: [0.32, '#fbf0dc', 1.3], sparkle: 0.25 },
    far: { boil: 0.008, soften: 0.6 },
    side: { edgeSway: 1.5, flow: [0.06, 2.6], sideFlow: { p: [0, 1, 0.68, 0.95], d: [0, 1, 0.81, 0.985] } }, // the wave column pours down
  },
  lilies: {
    sky: { flow: [0.02, 10], ripple: [0.0045, 110], sway: 0.006, twinkle: 0.3, mist: [0.34, '#f6eeff', 1.4], rays: [0.26, '#fff6dc', 0.16], sparkle: 0.45 },
    far: { boil: 0.006, clipAbove: true },
    side: { edgeSway: 5 },
  },
  gilded: {
    sky: { flow: [0.012, 11], sway: 0.003, twinkle: 0.75, mist: [0.2, '#fff4c8', 1.2], rays: [0.26, '#fff0b0', 0.18], rayO: [0.5, -0.05] },
    far: {},
    side: { edgeSway: 2.5 },
  },
  lacquer: {
    sky: { flow: [0.016, 10], ripple: [0.0045, 120], sway: 0.003, twinkle: 0.55, mist: [0.16, '#6a4020', 1.1], sparkle: 0.35 },
    far: { },
    side: { edgeSway: 4 },
  },
};

/** Living config for a resolved layer (null = draw it as a plain sprite). */
// Worlds whose living look has been reviewed in motion ship ON; the rest keep the V3.1 static plates
// until reviewed (?living=all previews them, ?living=0 turns everything off).
export const LIVE_ON = new Set(['meadow', 'starry', 'fresco', 'ukiyo']);
const livingAll = () => { try { return /[?&]living=all/.test(location.search); } catch { return false; } };
/** True when this world's plates are drawn living (so the old sprite stand-ins for motion can step aside). */
export const liveWorld = (id) => LIVE_ON.has(id) || livingAll();
export function liveConfig(worldId, layer) {
  if (!LIVE_ON.has(worldId) && !livingAll()) return null;
  const W = LIVE[worldId]; if (!W) return null;
  const key = String(layer.key || '');
  const group = key.startsWith('sky') ? 'sky' : key.startsWith('far') ? 'far' : key.startsWith('side') ? 'side' : null;
  if (!group) return null;
  const zoneKey = key.replace(/\.night$/, '');
  return { ...(W[group] || {}), ...(W[zoneKey] && zoneKey !== group ? W[zoneKey] : {}), group };
}
/** Flow-map entry for a plate url (…/meadow.layer.sky.z1.p.webp -> LIVING_MAPS['meadow.layer.sky.z1.p']). */
export function mapFor(url) {
  const m = /([^/]+)\.(?:webp|avif)$/.exec(url || ''); if (!m) return null;
  return LIVING_MAPS[m[1]] || null;
}

let program = null;
export class Living {
  /** PIXI = the vendored module; gl = GLLayer (for loadBitmap / trackTex). */
  constructor(PIXI, gl, loadBitmap) {
    this.PIXI = PIXI; this.gl = gl; this.loadBitmap = loadBitmap;
    this.base = new URL('../../assets/v3/living/', import.meta.url).href;
    this.clock = null; // tests: fixed time in seconds
    this.t0 = performance.now() / 1000;
    const neutral = (r, g, b) => { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 2, 2); return PIXI.Texture.from(c); };
    this.flat = neutral(128, 128, 0); this.grey = neutral(128, 128, 128);
    this.noise = this.grey;
    this.maps = new Map();
    loadBitmap(this.base + 'noise.webp').then((bm) => {
      if (!bm) return;
      const t = PIXI.Texture.from(bm); t.source.addressMode = 'repeat'; t.source.scaleMode = 'linear';
      this.noise = t; gl.trackTex('living:noise', bm.width, bm.height);
      for (const L of this.live) if (L.shader) L.shader.resources.uNoise = t.source;
    });
    this.live = new Set();
    program = program || PIXI.GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'forkwood-living' });
  }
  time() { return this.clock != null ? this.clock : performance.now() / 1000 - this.t0; }
  flowTex(url) {
    if (!this.maps.has(url)) this.maps.set(url, this.loadBitmap(url).then((bm) => {
      if (!bm) return null;
      const t = this.PIXI.Texture.from(bm); t.source.scaleMode = 'linear'; t.source.addressMode = 'clamp-to-edge';
      this.gl.trackTex('living:' + url, bm.width, bm.height); return t;
    }));
    return this.maps.get(url);
  }
  /** A screen quad drawing `tex` with the living shader; returns the controller stored on the layer. */
  make(L, tex, cfg) {
    const { PIXI } = this;
    const geometry = new PIXI.MeshGeometry({ positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) });
    const U = new PIXI.UniformGroup({
      uMap: { value: new Float32Array([1, 1, 0, 0]), type: 'vec4<f32>' },
      uTex: { value: new Float32Array([tex.width, tex.height, L.fit === 'cover' ? 0 : 1, 0]), type: 'vec4<f32>' },
      uT: { value: new Float32Array([0, 0, 8, 1]), type: 'vec4<f32>' },
      uWave: { value: new Float32Array(4), type: 'vec4<f32>' },
      uFx: { value: new Float32Array(4), type: 'vec4<f32>' },
      uMistC: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
      uRayC: { value: new Float32Array([1, 1, 1, 2]), type: 'vec4<f32>' },
      uRayO: { value: new Float32Array([0.5, 0.2, 0, 0]), type: 'vec4<f32>' },
      uClip: { value: new Float32Array([9, 0.08, cfg.clipAbove ? 1 : 0, 0]), type: 'vec4<f32>' },
      uSide: { value: new Float32Array((cfg.sideFlow && cfg.sideFlow[/\.d\.(webp|avif)$/.test(L.url || '') ? 'd' : 'p']) || [0, 0, 0, 1]), type: 'vec4<f32>' },
    });
    const shader = new PIXI.Shader({ glProgram: program, resources: { uTexture: tex.source, uFlow: this.flat.source, uNoise: this.noise.source, living: U } });
    const mesh = new PIXI.Mesh({ geometry, shader, texture: tex });
    const C = { mesh, geometry, shader, U: U.uniforms, group: U, cfg, w: 0, h: 0, map: null };
    const u = C.U;
    const [fa, fp] = cfg.flow || [0, 8];
    u.uT[1] = fa; u.uT[2] = fp;
    const [ra, rf] = cfg.ripple || [0, 0];
    u.uWave[0] = ra; u.uWave[1] = rf; u.uWave[2] = cfg.sway || 0; u.uWave[3] = cfg.sparkle || 0;
    u.uFx[0] = cfg.twinkle || 0;
    if (cfg.mist) { u.uFx[1] = cfg.mist[0]; const c = hexRGB(cfg.mist[1]); u.uMistC.set([c[0], c[1], c[2], cfg.mist[2] || 1.4]); }
    if (cfg.rays) { u.uFx[2] = cfg.rays[0]; const c = hexRGB(cfg.rays[1]); u.uRayC.set([c[0], c[1], c[2], cfg.rays[2] || 2]); }
    u.uRayO[2] = cfg.boil || 0; u.uRayO[3] = cfg.soften || 0;
    C.base = { fx1: u.uFx[1], fx2: u.uFx[2] };
    // the plate's own flow / mask map (sky plates)
    const entry = mapFor(L.url);
    C.hz = entry && entry.hz != null ? entry.hz : null;
    if (entry && entry.map) {
      const ro = cfg.rayO || entry.ray;
      if (ro) { u.uRayO[0] = ro[0]; u.uRayO[1] = ro[1]; } else u.uFx[2] = C.base.fx2 = 0;
      this.flowTex(this.base + entry.map).then((t) => { if (!t || mesh.destroyed) return; shader.resources.uFlow = t.source; u.uTex[3] = 1; });
    } else { u.uFx[1] = u.uFx[2] = C.base.fx1 = C.base.fx2 = 0; }
    this.live.add(C);
    mesh.on('destroyed', () => this.live.delete(C));
    return C;
  }
  /** Per frame: screen size, plate placement (uv transform), tint/alpha, time, quality tier. */
  update(C, cw, ch, map, tint, alpha, tier, clipY = 9) {
    if (C.w !== cw || C.h !== ch) {
      C.w = cw; C.h = ch;
      const P = C.geometry.getBuffer('aPosition'); P.data.set([0, 0, cw, 0, cw, ch, 0, ch]); P.update();
    }
    const u = C.U;
    u.uMap[0] = map[0]; u.uMap[1] = map[1]; u.uMap[2] = map[2]; u.uMap[3] = map[3];
    const still = tier >= 3;
    u.uT[0] = still ? 0 : this.time();
    u.uT[3] = tier <= 1 ? 1 : 0;
    const k = still ? 0 : 1;
    u.uT[1] = (C.cfg.flow ? C.cfg.flow[0] : 0) * k;
    u.uWave[0] = (C.cfg.ripple ? C.cfg.ripple[0] : 0) * k; u.uWave[2] = (C.cfg.sway || 0) * k; u.uWave[3] = (C.cfg.sparkle || 0) * k;
    u.uFx[0] = (C.cfg.twinkle || 0) * k; u.uFx[3] = (C.cfg.edgeSway || 0) * Math.sqrt(Math.max(1, cw) / 390) / Math.max(1, cw) * k; // px at the free ends (phone), grows gently on wide screens
    u.uRayO[2] = (C.cfg.boil || 0) * k;
    u.uClip[0] = C.cfg.group === 'far' ? clipY : 9;
    C.mesh.tint = tint; C.mesh.alpha = alpha;
  }
}

/** Living backdrops need WebGL2 (GLSL ES 3.0); ?living=0 turns them off (A/B and fallback check). */
export function livingSupported(renderer) {
  try {
    if (typeof location !== 'undefined' && /[?&]living=0/.test(location.search)) return false;
    return !!(renderer && renderer.gl && typeof WebGL2RenderingContext !== 'undefined' && renderer.gl instanceof WebGL2RenderingContext);
  } catch { return false; }
}
