// Forkwood 2.0 "Living Masterpieces": the seven painted worlds (CONTRACT.md §"The 7 worlds").
// Owned by ENGINE. Art fields (layers, sprite ids) resolve through the ART registry
// (assets/v2/registry.json); anything missing falls back to temp art or a vector placeholder.
//
// World definition (contract):
//   { id, name, nameVi, medium, layers:[{key, parallax, mode:'stretch-cover'|'tile-x', zone}],
//     zones:5, ambient:[fxIds], sky:'flow'|'static', palette:{bg, vine, reward, danger, ui},
//     vineSkinDefault, trapSet:[trapIds], setPieces:{calm, chase, boss}, music }
// Extra engine fields (optional, safe to ignore elsewhere):
//   zoneTint: five multiply tints (low -> high) for the zone crossfade on the painted layers
//   zoneNames / zoneNamesVi, legacy: the v1 map slot this world replaces (keeps unlock order/prices)
//
// A layer `key` resolves to registry id `<world>.layer.<key>`. `zone` = null shows on every
// zone; 0..4 limits the layer to that height zone (crossfaded by height, see zoneAt()).
// `parallax` = fraction of camera travel the layer follows (0 = fixed sky, 1 = world speed).

import { WORLD_MECH } from './world-mech.js'; // V2-INT: the sim's trap sets and set pieces are authoritative

export const SAFETY = { vine: '#6fe3b4', reward: '#f2b33d', danger: '#e2603f' }; // constant on every world

/** Height zones in metres (same thresholds as v1 backdrop.js so trap/zone pacing is unchanged). */
export const ZONE_M = [0, 200, 450, 800, 1200];
export const ZONE_FADE = 46; // metres of crossfade around each boundary

// fit: 'cover' fills the screen (opaque sky); 'width' spans the width, placed by anchor
// ([0.5,1] = bottom centre) and scrolls with camera*parallax. Registry entries may override
// parallax / mode / fit / anchor / zone per layer (ART knows its compositions best).
const L = (key, parallax, mode = 'stretch-cover', zone = null, fit = 'width', anchor = [0.5, 1]) => ({ key, parallax, mode, zone, fit, anchor });
const STD = () => [L('sky', 0.015, 'stretch-cover', null, 'cover', [0.5, 1]), L('far', 0.05), L('mid', 0.12), L('side', 0.3)];

export const WORLDS = [
  {
    id: 'meadow', name: 'Golden Hour Meadow', nameVi: 'Đồng cỏ hoàng hôn', medium: 'cinematic anime painting', legacy: 'forkwood',
    layers: STD(),
    zones: 5, ambient: ['petals', 'fireflies', 'motes'], sky: 'static',
    palette: { bg: '#9fc4d8', vine: SAFETY.vine, reward: SAFETY.reward, danger: SAFETY.danger, ui: '#fff4dc', ink: '#1d2a33', glow: '#ffe2a8' },
    zoneTint: ['#ffffff', '#ffe6c8', '#ffc9a0', '#b8a6d8', '#5a5f98'],
    zoneNames: ['Sunset meadow', 'Shrine hill', 'Sea of clouds', 'Blue hour above the clouds', 'Milky Way night'],
    zoneNamesVi: ['Đồng cỏ hoàng hôn', 'Đồi đền', 'Biển mây', 'Giờ xanh trên mây', 'Đêm Ngân Hà'],
    vineSkinDefault: 'vine.skin.cel',
    trapSet: ['meadow.trap.crow', 'meadow.trap.gust', 'meadow.trap.crossing', 'meadow.trap.dusktide'],
    setPieces: { calm: 'meadow.set.lanternrise', chase: 'meadow.set.train', boss: 'meadow.boss.stormcloud' },
    music: 'meadow',
  },
  {
    id: 'starry', name: 'Starry River', nameVi: 'Đêm sao bên sông', medium: 'Van Gogh impasto, animated swirling sky', legacy: 'phongnha',
    layers: STD(),
    zones: 5, ambient: ['strokes', 'fireflies', 'ripples'], sky: 'flow',
    palette: { bg: '#14306b', vine: SAFETY.vine, reward: SAFETY.reward, danger: SAFETY.danger, ui: '#f8e9a8', ink: '#0b1430', glow: '#ffe27a' },
    zoneTint: ['#ffffff', '#f2f0ff', '#dfe6ff', '#c9d4ff', '#aab8ff'],
    zoneNames: ['Night river', 'Cypress bank', 'Village steeple', 'Swirling sky', 'Moon and stars'],
    zoneNamesVi: ['Dòng sông đêm', 'Bờ bách', 'Tháp chuông làng', 'Bầu trời xoáy', 'Trăng và sao'],
    vineSkinDefault: 'vine.skin.impasto',
    trapSet: ['starry.trap.crowflock', 'starry.trap.whirl', 'starry.trap.wheatthorns', 'starry.trap.rivertide'],
    setPieces: { calm: 'starry.set.boatdrift', chase: 'starry.set.cometchase', boss: 'starry.boss.whirlpool' },
    music: 'starry',
  },
  {
    id: 'fresco', name: 'Fresco Cathedral', nameVi: 'Thánh đường bích họa', medium: 'Renaissance fresco, plaster, gold', legacy: 'arashiyama',
    layers: STD(),
    zones: 5, ambient: ['plasterdust', 'goldflakes', 'motes'], sky: 'static',
    palette: { bg: '#e8d7b8', vine: SAFETY.vine, reward: SAFETY.reward, danger: SAFETY.danger, ui: '#fff6e0', ink: '#3a2a1c', glow: '#ffe6a8' },
    zoneTint: ['#ffffff', '#fff2dc', '#f6e2c0', '#e9d2b0', '#c8b8e0'],
    zoneNames: ['Mosaic floor', 'Colonnade', 'Coffered vault', 'Cloud and putti', 'Golden dome'],
    zoneNamesVi: ['Sàn khảm', 'Hàng cột', 'Vòm ô vuông', 'Mây và thiên thần', 'Mái vòm vàng'],
    vineSkinDefault: 'vine.skin.frescochalk',
    trapSet: ['fresco.trap.dove', 'fresco.trap.scaffold', 'fresco.trap.archgate', 'fresco.trap.dampplaster'],
    setPieces: { calm: 'fresco.set.choir', chase: 'fresco.set.collapse', boss: 'fresco.boss.gargoyle' },
    music: 'fresco',
  },
  {
    id: 'ukiyo', name: 'Great Wave Cliffs', nameVi: 'Sóng lớn núi thiêng', medium: 'ukiyo-e woodblock, washi', legacy: 'redwoods',
    layers: STD(),
    zones: 5, ambient: ['foam', 'inksplash', 'petals'], sky: 'static',
    palette: { bg: '#efe2c4', vine: SAFETY.vine, reward: SAFETY.reward, danger: SAFETY.danger, ui: '#fbf3e0', ink: '#1b2a4a', glow: '#fff1c8' },
    zoneTint: ['#ffffff', '#fff4e0', '#f0e6d8', '#d8d4e8', '#8a94c0'],
    zoneNames: ['Oshiokuri boats', 'Wave foot', 'Claw foam', 'Sacred peak', 'Ink night'],
    zoneNamesVi: ['Thuyền oshiokuri', 'Chân sóng', 'Bọt móng vuốt', 'Núi thiêng', 'Đêm mực'],
    vineSkinDefault: 'vine.skin.sumi',
    trapSet: ['ukiyo.trap.cormorant', 'ukiyo.trap.wave', 'ukiyo.trap.seagust', 'ukiyo.trap.twinfish'],
    setPieces: { calm: 'ukiyo.set.lull', chase: 'ukiyo.set.greatwave', boss: 'ukiyo.boss.seadragon' },
    music: 'ukiyo',
  },
  {
    id: 'lilies', name: 'Lily Garden', nameVi: 'Vườn súng', medium: 'Monet impressionist dabs', legacy: 'blackforest',
    layers: STD(),
    zones: 5, ambient: ['ripples', 'petals', 'motes'], sky: 'static',
    palette: { bg: '#b8c8de', vine: SAFETY.vine, reward: SAFETY.reward, danger: SAFETY.danger, ui: '#fbf6ff', ink: '#28304a', glow: '#fff0c0' },
    zoneTint: ['#ffffff', '#f6f0ff', '#ffe8d8', '#ffd4b8', '#9aa0d0'],
    zoneNames: ['Pond surface', 'Japanese bridge', 'Wisteria arbour', 'Haystacks', 'Impression, sunrise'],
    zoneNamesVi: ['Mặt ao', 'Cầu Nhật', 'Giàn tử đằng', 'Đụn rơm', 'Ấn tượng bình minh'],
    vineSkinDefault: 'vine.skin.dabs',
    trapSet: ['lilies.trap.heron', 'lilies.trap.duckweed', 'lilies.trap.pondrise', 'lilies.trap.dragonfly'],
    setPieces: { calm: 'lilies.set.boatglide', chase: 'lilies.set.rainshower', boss: 'lilies.boss.pondcarp' },
    music: 'lilies',
  },
  {
    id: 'gilded', name: 'Gilded Grove', nameVi: 'Rừng dát vàng', medium: 'Klimt gold leaf mosaic (birch forest)', legacy: 'amazon',
    layers: STD(),
    zones: 5, ambient: ['goldflakes', 'motes', 'petals'], sky: 'static',
    palette: { bg: '#c89a3a', vine: SAFETY.vine, reward: '#ffe9a0', danger: SAFETY.danger, ui: '#fff4d0', ink: '#2a1a08', glow: '#fff1b0' },
    zoneTint: ['#ffffff', '#fff2d0', '#ffe8b0', '#f2d090', '#a08860'],
    zoneNames: ['Flower carpet', 'Birch spirals', 'Mosaic band', 'Gold-leaf ground', 'Gold stars'],
    zoneNamesVi: ['Thảm hoa', 'Xoắn bạch dương', 'Dải khảm', 'Nền vàng lá', 'Sao vàng'],
    vineSkinDefault: 'vine.skin.goldleaf',
    trapSet: ['gilded.trap.blackbird', 'gilded.trap.spiralthorn', 'gilded.trap.tesserae', 'gilded.trap.glare'],
    setPieces: { calm: 'gilded.set.leaffall', chase: 'gilded.set.mosaicslide', boss: 'gilded.boss.owl' },
    music: 'gilded',
  },
  {
    id: 'lacquer', name: 'Lantern Village', nameVi: 'Làng đèn lồng', medium: 'Vietnamese sơn mài lacquer', legacy: 'beanstalk',
    layers: STD(),
    zones: 5, ambient: ['embers', 'fireflies', 'petals'], sky: 'static',
    palette: { bg: '#140c0a', vine: SAFETY.vine, reward: SAFETY.reward, danger: '#ff7a4a', ui: '#ffe8c0', ink: '#0a0606', glow: '#ffcf6a' },
    zoneTint: ['#ffffff', '#fff0e0', '#ffe0c8', '#f0c8a8', '#c8a0a0'],
    zoneNames: ['Lotus pond', 'Bamboo hedge', 'Village gate', 'Communal house roofs', 'Gold-leaf moon'],
    zoneNamesVi: ['Ao sen', 'Lũy tre', 'Cổng làng', 'Mái đình', 'Trăng vàng lá'],
    vineSkinDefault: 'vine.skin.lacquer',
    trapSet: ['lacquer.trap.egret', 'lacquer.trap.bamboogust', 'lacquer.trap.flood', 'lacquer.trap.villagegate'],
    setPieces: { calm: 'lacquer.set.lanternfloat', chase: 'lacquer.set.dragondance', boss: 'lacquer.boss.carpdragon' },
    music: 'lacquer',
  },
];

export const WORLD = Object.fromEntries(WORLDS.map((w) => [w.id, w]));
// V2-INT: trap sets / set pieces come from MECH (src/world-mech.js) so render, audio and sim agree on ids
for (const w of WORLDS) {
  const m = WORLD_MECH[w.id]; if (!m) continue;
  w.trapSet = m.trapSet.slice();
  w.setPieces = { calm: m.setPieces.calm.id, chase: m.setPieces.chase.id, boss: m.setPieces.boss.id };
}
export const DEFAULT_WORLD = 'meadow';
/** v1 map id -> v2 world (same slot, so the unlock economy order/prices are kept). */
export const WORLD_FOR_MAP = Object.fromEntries(WORLDS.map((w) => [w.legacy, w.id]));
export const worldForMap = (mapId) => WORLD_FOR_MAP[mapId] || (WORLD[mapId] ? mapId : DEFAULT_WORLD);
export const nextWorld = (id) => WORLDS[(WORLDS.findIndex((w) => w.id === id) + 1) % WORLDS.length].id;

/** Zone index i, neighbour j and crossfade weight w (0 = all i), progress through zone i. */
export function zoneAt(m) {
  let i = 0;
  for (let k = ZONE_M.length - 1; k >= 0; k--) if (m >= ZONE_M[k]) { i = k; break; }
  const m0 = ZONE_M[i], m1 = ZONE_M[i + 1];
  let j = i, w = 0;
  if (m1 != null && m > m1 - ZONE_FADE / 2) { j = i + 1; w = (m - (m1 - ZONE_FADE / 2)) / ZONE_FADE; }
  else if (i > 0 && m < m0 + ZONE_FADE / 2) { j = i - 1; w = 0.5 - (m - m0) / ZONE_FADE; }
  const prog = m1 != null ? Math.min(1, Math.max(0, (m - m0) / (m1 - m0))) : Math.min(1, (m - m0) / 600);
  return { i, j, w: Math.max(0, Math.min(1, w)), prog };
}

// ------------------------------------------------------------------ registry
// assets/v2/registry.json (ART) is authoritative; assets/v2/_temp/registry.temp.json
// (ENGINE temp art, clearly marked) fills gaps. Entries sharing an id are resolution
// variants; an entry may also carry `variants:[{file,w,h}]`.
const BASE = new URL('../assets/v2/', import.meta.url).href;
export const TEMP_ART = false; // V2-INT: ART registry is in; assets/v2/_temp deleted
let registryP = null;
const byId = new Map();
async function fetchJSON(url) {
  try { const r = await fetch(url, { cache: 'force-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}
export function loadRegistry() {
  if (registryP) return registryP;
  registryP = (async () => {
    // TEMP_ART: while ENGINE runs on temp art, the temp registry says whether ART's registry exists yet
    // (avoids a 404 console error). Integration: delete assets/v2/_temp and set TEMP_ART = false.
    const tempDoc = TEMP_ART ? await fetchJSON(BASE + '_temp/registry.temp.json') : null;
    const temp = tempDoc ? (Array.isArray(tempDoc) ? tempDoc : tempDoc.entries) : null;
    const art = !TEMP_ART || (tempDoc && tempDoc.artRegistry) ? await fetchJSON(BASE + 'registry.json') : null;
    const add = (list, dir, prio) => {
      if (!Array.isArray(list)) return;
      for (let e of list) {
        if (!e || !e.id || !e.file) continue;
        const vs = [{ file: e.file, w: e.w, h: e.h, avif: e.avif }, ...(Array.isArray(e.variants) ? e.variants : [])]
          .map((v) => ({ ...v, url: new URL(v.file, dir).href, avif: v.avif ? new URL(v.avif, dir).href : null, prio }));
        // ART ships resolution variants as sibling ids: '<id>.p' (portrait) / '<id>.d' (desktop)
        const m = e.type === 'layer' && /^(.+)\.(p|d)$/.exec(e.id);
        if (m) e = { ...e, id: m[1] };
        const cur = byId.get(e.id);
        if (cur && cur.prio > prio) continue; // ART beats temp
        if (cur && cur.prio === prio) { cur.variants.push(...vs); continue; }
        byId.set(e.id, { ...e, prio, variants: vs });
      }
    };
    add(temp, BASE + '_temp/', 0);
    add(art, BASE, 1);
    if (art) applyWorldsArt(await fetchJSON(BASE + 'worlds-art.json'));
    return byId;
  })();
  return registryP;
}
export const registryEntry = (id) => byId.get(id) || null;
export const registryReady = () => byId.size > 0;
// V2-INT: sim skin ids -> drawn ART ids. MECH names traps `<world>.trap.<name>`, rides `vehicle.<art>.<anim>`,
// bosses `<world>.boss.<mechBoss>`, pickups `pickup.<id>`, hollows `common.hollow`; ART drew a subset under
// its own names. Resolution: exact id > icon.<id> > same-world sprite with the same `mech` > any world's
// sprite with that mech > null (caller draws a clean vector fallback). Cached once the registry is in.
const aliasCache = new Map();
export function resolveId(id, mech) {
  if (!id) return null;
  const key = id + '|' + (mech || '');
  if (aliasCache.has(key)) return aliasCache.get(key);
  if (!byId.size) return byId.has(id) ? id : null;
  let r = null, m;
  if (byId.has(id)) r = id;
  else if (byId.has('icon.' + id)) r = 'icon.' + id;
  else if (id === 'common.hollow') r = byId.has('icon.drop.knothollow') ? 'icon.drop.knothollow' : null;
  else if ((m = /^vehicle\.([a-z]+)\./.exec(id))) { for (const k of byId.keys()) if (k.startsWith('vehicle.' + m[1] + '.')) { r = k; break; } }
  else if ((m = /^([a-z]+)\.boss\.[a-z]+$/.exec(id))) { const w = WORLD[m[1]]; r = w && w.bossArt && byId.has(w.bossArt) ? w.bossArt : null; }
  else if ((m = /^([a-z]+)\.trap\./.exec(id)) && mech) {
    const wid = m[1]; let any = null;
    for (const e of byId.values()) {
      if (e.mech !== mech || !/\.trap\./.test(e.id)) continue;
      if (e.world === wid) { r = e.id; break; }
      if (!any) any = e.id;
    }
    r = r || any;
  }
  aliasCache.set(key, r);
  return r;
}

/**
 * ART's assets/v2/worlds-art.json fills the art fields of each world: layer stack
 * (key = full registry id, parallax, mode 'stretch-cover' | 'tile-y', zone), zone grades
 * ({name, mul:[r,g,b], add:[r,g,b], sat}), vine skin, trap set, boss and the art palette
 * (the engine's SAFETY colours still win for vine/reward/danger readability).
 */
export function applyWorldsArt(doc) {
  if (!doc || typeof doc !== 'object') return;
  for (const [id, a] of Object.entries(doc)) {
    const w = WORLD[id]; if (!w || !a) continue;
    if (Array.isArray(a.layers) && a.layers.length) {
      w.layers = a.layers.map((l) => {
        const key = String(l.key || '').replace(new RegExp('^' + id + '\\.layer\\.'), '');
        const cover = l.mode === 'stretch-cover';
        return { key, parallax: l.parallax ?? 0, mode: l.mode || 'tile-y', zone: l.zone ?? null, fit: cover ? 'cover' : 'width', anchor: cover ? [0.5, 0.5] : [0.5, 1], opaque: cover };
      });
    }
    if (Array.isArray(a.zones) && a.zones.length) {
      w.zoneGrade = a.zones.map((z) => ({ mul: z.mul || [1, 1, 1], add: z.add || [0, 0, 0], sat: z.sat ?? 1 }));
      w.zoneNames = a.zones.map((z) => z.name || '');
      if (a.zones.some((z) => z.nameVi)) w.zoneNamesVi = a.zones.map((z) => z.nameVi || z.name || '');
    }
    if (a.vineSkinDefault) w.vineSkinDefault = a.vineSkinDefault;
    // V2-INT: trapSet / boss stay MECH's (WORLD_MECH); ART's lists are its drawing checklist only
    if (a.boss) w.bossArt = typeof a.boss === 'string' ? a.boss : a.boss.id;
    if (a.palette) w.artPalette = a.palette;
  }
}
export const registryIds = () => [...byId.keys()];

/**
 * Pick the resolution variant with the fewest texels that still draws at <= 1.0x magnification
 * for this fit ('cover' needs both axes, 'width' only the width); if none is big enough, the
 * largest. So phones get the 1080-wide portrait file and desktops the 2560-wide one.
 */
export function pickVariant(entry, needW, needH, fit = 'width') {
  const vs = entry.variants.filter((v) => v.w && v.h);
  if (!vs.length) return entry.variants[0];
  const mag = (v) => (fit === 'cover' ? Math.max(needW / v.w, needH / v.h) : needW / v.w);
  const ok = vs.filter((v) => mag(v) <= 1.0001).sort((a, b) => a.w * a.h - b.w * b.h);
  if (ok.length) return ok[0];
  return vs.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
}

// AVIF support (ART ships `avif` siblings for the big opaque skies, ~25-40% smaller)
const AVIF_1PX = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
let avifP = null;
export function avifOK() {
  if (!avifP) avifP = (async () => { try { const i = new Image(); i.src = AVIF_1PX; await i.decode(); return i.width > 0; } catch { return false; } })();
  return avifP;
}
const bitmapCache = new Map(); // url -> Promise<ImageBitmap|HTMLImageElement|null>
export function loadBitmap(url) {
  if (bitmapCache.has(url)) return bitmapCache.get(url);
  const p = (async () => {
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) return null;
      const blob = await r.blob();
      if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
      const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img;
    } catch { return null; }
  })();
  bitmapCache.set(url, p);
  return p;
}
export function dropBitmap(url) {
  const p = bitmapCache.get(url); bitmapCache.delete(url);
  if (p) p.then((b) => b && b.close && b.close());
}

/**
 * Lazy world loader: resolves each layer of a world to the best variant for the
 * given device-pixel viewport and decodes it. Returns { world, layers:[{...layer, id, bitmap, w, h, url}] }.
 * Missing layers come back with bitmap = null (the renderer paints a palette placeholder).
 * V3 zone art: layers limited to zone >= 1 are NOT decoded here; they come back with
 * `lazy:true, bitmap:null, src` and the renderer calls loadLayerBitmap() when the climb nears
 * their zone (gl.js: 60% through the zone below). Consecutive zone layers of one stack that point
 * at the same file (meadow's day/night far clouds) are merged into one layer with `zones:[..]`.
 * Every zone layer carries `group` (its key without the `.z<k>` suffix) for the crossfade.
 */
const worldCache = new Map();
export async function loadWorld(id, needW, needH) {
  const w = WORLD[id] || WORLD[DEFAULT_WORLD];
  const key = `${w.id}:${needW >= needH ? 'wide' : 'tall'}:${Math.round(Math.max(needW, needH) / 256)}`;
  if (worldCache.has(key)) return worldCache.get(key);
  const p = (async () => {
    await loadRegistry();
    const avif = await avifOK();
    const resolved = w.layers.map((ly) => {
      const rid = `${w.id}.layer.${ly.key}`, e = registryEntry(rid);
      if (!e) return { ...ly, id: rid, bitmap: null };
      const o = { ...ly };
      for (const k of ['parallax', 'mode', 'fit', 'anchor', 'zone', 'opaque']) if (e[k] != null) o[k] = e[k];
      if (ly.zone !== undefined) o.zone = ly.zone; // worlds-art's zone wins over the registry's
      if (o.mode === 'stretch-cover' && e.mode === 'stretch-cover' && !e.fit) { o.fit = 'cover'; o.anchor = [0.5, 0.5]; }
      if (o.mode === 'tile-y') o.fit = 'width';
      if (o.opaque == null) o.opaque = ly.key === 'sky' || /^sky\.z\d$/.test(ly.key);
      const v = pickVariant(e, needW, needH, o.fit);
      const src = { url: v.avif && avif ? v.avif : v.url, fallback: v.url };
      return { ...o, id: rid, src, url: v.url, w: v.w, h: v.h, temp: e.prio === 0, group: o.zone != null ? ly.key.replace(/\.z\d$/, '') : null, zones: o.zone != null ? [o.zone] : null };
    });
    const merged = [];
    for (const L of resolved) {
      const prev = merged.length && merged[merged.length - 1];
      if (prev && L.zones && prev.zones && prev.group === L.group && prev.src && L.src && prev.src.url === L.src.url) { prev.zones.push(L.zone); continue; }
      merged.push(L);
    }
    const layers = await Promise.all(merged.map(async (L) => {
      if (!L.src) return L;
      if (L.zones && Math.min(...L.zones) > 0) return { ...L, bitmap: null, lazy: true };
      const bitmap = await loadLayerBitmap(L);
      return { ...L, bitmap, w: bitmap ? bitmap.width : L.w, h: bitmap ? bitmap.height : L.h };
    }));
    return { world: w, layers };
  })();
  worldCache.set(key, p);
  return p;
}
/** Decode one resolved layer (AVIF first, WebP fallback). Shared by loadWorld and the lazy zone loader. */
export async function loadLayerBitmap(L) {
  if (!L || !L.src) return null;
  return (await loadBitmap(L.src.url)) || (L.src.url !== L.src.fallback ? await loadBitmap(L.src.fallback) : null);
}

/** Preload the next world on idle so switching worlds in the gallery is instant. */
export function preloadNext(id, needW, needH) {
  const go = () => loadWorld(nextWorld(id), needW, needH);
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
}

// ------------------------------------------------------------------ current world
let current = null;
const listeners = new Set();
export function currentWorld() {
  if (current) return WORLD[current];
  let id = null;
  try { id = new URLSearchParams(location.search).get('world'); } catch { /* no location */ }
  if (!WORLD[id]) { try { const sel = JSON.parse(localStorage.getItem('forkwood.map') || 'null'); id = sel ? worldForMap(sel) : null; } catch { id = null; } }
  current = WORLD[id] ? id : DEFAULT_WORLD;
  return WORLD[current];
}
export function setWorld(id) {
  if (!WORLD[id] || id === current) return false;
  current = id;
  for (const fn of listeners) fn(WORLD[id]);
  return true;
}
export function onWorldChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export default { WORLDS, WORLD, DEFAULT_WORLD, ZONE_M, zoneAt, loadRegistry, registryEntry, pickVariant, loadWorld, loadLayerBitmap, preloadNext, currentWorld, setWorld, onWorldChange, worldForMap, nextWorld, SAFETY };
