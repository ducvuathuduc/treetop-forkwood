import { WORLDS as V2_WORLDS } from './worlds-meta.js'; // V2-INT: legacy map slot -> v2 world
// P8-MAPS: selectable map themes. A map is a whole look for the climb: three
// plates (sky / far / side, assets/art/m-*-<id>.webp, ~25-45 KB each set,
// loaded only when the map is picked), a palette for each of the five height
// zones (day -> dusk -> night as you climb), zone names, ambient particles,
// a foreground clump style, a flavour line, and its own postage stamp for the
// game-over postcard (drawn in share.js from `stamp`).
//
// Maps never touch the simulation. Economy wiring (prices, ownership) lives
// with the econ integrator: every map carries an `unlock` field
// ({ free: true } | { cost: <acorns> } | { level: n }), and ownership is read
// through setOwnership(); until that is wired a small localStorage fallback
// keeps the default-unlocked maps playable.

const K = ['top', 'bot', 'mass', 'mid', 'lite', 'deep', 'fog', 'ray', 'acc', 'crit', 'cloud'];
const P = (s) => Object.fromEntries(s.trim().split(/\s+/).map((h, i) => [K[i], h]));

import { UNLOCK_ALL_MAPS } from './flags.js'; // V3.2
export const MAPS = [
  {
    id: 'forkwood', name: 'Forkwood', place: 'The Grove', country: 'Forkwood', code: 'FW',
    flavour: 'Meadow to starlight: the original climb.', tale: null,
    unlock: { free: true }, plates: null, // uses the classic per-zone w-* plates
    swatch: ['#8db9b6', '#f3d3ae', '#173029'],
    stamp: { motif: 'oak', ink: '#173029', bg: ['#8db9b6', '#f3d3ae'], accent: '#5fd99a', word: 'FORKWOOD', postmark: 'THE GROVE · FORKWOOD' },
    paper: '#f1ece2',
  },
  {
    id: 'phongnha', name: 'Phong Nha Caves', place: 'Phong Nha–Kẻ Bàng', country: 'Việt Nam', code: 'VN',
    flavour: 'Climb out of the cave mouth into the karst jungle, past the skylight, into the firefly night.',
    unlock: { free: true }, plates: 'phongnha', clump: 'vine',
    swatch: ['#7fb3a6', '#efe2c4', '#0f2a26'],
    day: P('#7fb3a6 #efe2c4 #c3d3c4 #8fb0a0 #4b7566 #0f2a26 #dfe2cc #fff0c8 #fff6dc #fff0b0 #f6f4e6'),
    dusk: P('#5f8a8e #e8c7a6 #a9b9b4 #7b9690 #405e5a #0e2224 #cdbfae #ffd9a0 #ffe2b0 #ffd27a #eadccc'),
    night: P('#0c1f26 #23434a #1f3a3e #173034 #10252a #061316 #2a4a4e #d8fff0 #c8ffe6 #c8ff9a #3a5a5e'),
    zones: ['Cave mouth', 'Karst jungle', 'Skylight', 'Monsoon', 'Firefly night'],
    amb: [[['mote', 10], ['blade', 5], ['bird', 3]], [['mote', 8], ['blade', 6]], [['mote', 12]], [['drop', 22]], [['glow', 14]]],
    pcol: { blade: ['#3f6e4a', '#6f9a5a'], mote: '#fff6d0', drop: '#d8ece6' },
    stamp: { motif: 'karst', ink: '#0f2a26', bg: ['#7fb3a6', '#efe2c4'], accent: '#e2603f', word: 'VIỆT NAM', postmark: 'PHONG NHA–KẺ BÀNG · VIỆT NAM' },
    paper: '#eef0e6',
  },
  {
    id: 'arashiyama', name: 'Arashiyama Bamboo', place: 'Kyoto', country: 'Japan', code: 'JP',
    flavour: 'Up through the whispering culms of Kyoto, to lantern dusk and the moon over the hills.',
    unlock: { cost: 900 }, plates: 'arashiyama', clump: 'bamboo',
    swatch: ['#9cc3b4', '#f4dccb', '#10241c'],
    day: P('#9cc3b4 #f4dccb #cbd8c0 #9db89a #557a5c #10241c #e9dccb #fff1d6 #fff6e6 #b9d98a #fbf5ec'),
    dusk: P('#8a8fb0 #f2c3a8 #b9b8b4 #8c9690 #4c5e58 #121e1c #dcc4b4 #ffcf9e #ffd0a0 #a6c97a #f0dccc'),
    night: P('#141a33 #3a3658 #2c2e4c #222640 #181c32 #0a0d18 #3c3a5c #ffe6b0 #ffe2a8 #ffcc66 #4a4870'),
    zones: ['Bamboo path', 'Moss garden', 'Lantern dusk', 'Mountain rain', 'Moon over Kyoto'],
    amb: [[['blade', 8]], [['blade', 8], ['bird', 3]], [['petal', 6], ['glow', 6]], [['drop', 18], ['blade', 5]], [['glow', 12]]],
    pcol: { blade: ['#5f9a4a', '#9cc46a'], petal: ['#f6b6c8', '#ffe4ec'], drop: '#e6eef0' },
    stamp: { motif: 'bamboo', ink: '#10241c', bg: ['#9cc3b4', '#f4dccb'], accent: '#d8432f', word: 'JAPAN', postmark: 'ARASHIYAMA · KYOTO · JAPAN' },
    paper: '#f4efe4',
  },
  {
    id: 'redwoods', name: 'Redwood Giants', place: 'Humboldt, California', country: 'USA', code: 'US',
    flavour: 'Tallest trees on Earth: climb the cathedral columns through golden fog.',
    unlock: { cost: 1200 }, plates: 'redwoods', clump: 'fern',
    swatch: ['#d9b98a', '#f3cdbb', '#2a1410'],
    day: P('#d9b98a #f3cdbb #e3c9b4 #c39c88 #7a4e40 #2a1410 #f0d6c4 #fff0c8 #fff4e0 #ffe6b0 #fff4ea'),
    dusk: P('#9a7a8a #f2b49a #c8aaa4 #a07e7c #5e3c3a #22100e #dcbcae #ffc890 #ffd0a0 #ffcf8a #efd8cc'),
    night: P('#141226 #3a2c3e #2c2236 #221a2c #181220 #0c070c #3a2e40 #fff0d0 #fff2d6 #fff0c0 #4a3c50'),
    zones: ['Fern floor', 'Cathedral', 'Golden fog', 'Pacific storm', 'Big Dipper'],
    amb: [[['mote', 12]], [['mote', 10], ['bird', 3]], [['mote', 14]], [['drop', 20]], [['glow', 10]]],
    pcol: { mote: '#fff2d8', drop: '#efe2dc' },
    stamp: { motif: 'redwood', ink: '#2a1410', bg: ['#d9b98a', '#f3cdbb'], accent: '#3f6e4a', word: 'USA', postmark: 'HUMBOLDT · CALIFORNIA · USA' },
    paper: '#f5ece2',
  },
  {
    id: 'blackforest', name: 'Black Forest', place: 'Schwarzwald', country: 'Deutschland', code: 'DE', tale: 'Hansel & Gretel',
    flavour: 'Follow the breadcrumbs past the gingerbread glow, and do not knock on the witch\'s door.',
    unlock: { cost: 1500 }, plates: 'blackforest', clump: 'bough',
    swatch: ['#5a4a6e', '#f0b98a', '#1a1424'],
    day: P('#8e86a8 #f0c9a0 #c4bccc #948ca6 #564e6a #1a1424 #e2cdb8 #ffe0b0 #fff0dc #e9b36a #f4e8e0'),
    dusk: P('#5a4a6e #f0b98a #a8a0b4 #7a7090 #463e58 #16101e #cfb4a2 #ffc98a #ffd49a #f2a65a #e2ccc4'),
    night: P('#120e22 #3a2a44 #2a2238 #20192e #171222 #0a0712 #3a2e48 #ffd9a0 #ffe0a8 #ffb85a #4a3a58'),
    zones: ['Breadcrumb trail', 'Deep firs', 'Gingerbread glow', 'Witch\'s storm', 'Cuckoo moon'],
    amb: [[['crumb', 8], ['mote', 6]], [['crumb', 6], ['leaf', 4]], [['crumb', 8], ['glow', 8]], [['leaf', 10]], [['glow', 10]]],
    pcol: { crumb: ['#c98a4a', '#f0c27e', '#ff8fb0', '#fff6ec'], mote: '#ffe8c8' },
    stamp: { motif: 'gingerbread', ink: '#1a1424', bg: ['#5a4a6e', '#f0b98a'], accent: '#ff8fb0', word: 'DEUTSCHLAND', postmark: 'SCHWARZWALD · DEUTSCHLAND' },
    paper: '#f2e8de',
  },
  {
    id: 'amazon', name: 'Amazon Canopy', place: 'Amazônia', country: 'Brasil', code: 'BR',
    flavour: 'From the riverbank through the understory to the emergent crowns, with morphos for company.',
    unlock: { cost: 1800 }, plates: 'amazon', clump: 'vine',
    swatch: ['#4f9a92', '#e3e2a6', '#062018'],
    day: P('#4f9a92 #e3e2a6 #b9d2b0 #84ad8e #3f6e56 #062018 #d6dcb2 #fffad0 #f6ffe0 #6ad0ff #f2f6e2'),
    dusk: P('#3e6e7e #f0c290 #9ab4a4 #6e8c84 #34564a #061a16 #c8c0a0 #ffd690 #ffe0a0 #5ab8ff #e2d8c4'),
    night: P('#06161e #183a3c #15302f #0f2626 #0a1c1c #030e0c #1e403e #d8ffd8 #d0ffc8 #b8ff7a #2e4e4c'),
    zones: ['Riverbank', 'Understory', 'Canopy', 'Downpour', 'Jungle night'],
    amb: [[['morpho', 3], ['mote', 6]], [['morpho', 3], ['blade', 6]], [['morpho', 3], ['bird', 3]], [['drop', 26]], [['glow', 16]]],
    pcol: { morpho: ['#2f7dff', '#9ad8ff'], blade: ['#2f8a4a', '#6fc06a'], mote: '#fbffd8', drop: '#d8f0e8' },
    stamp: { motif: 'morpho', ink: '#062018', bg: ['#4f9a92', '#e3e2a6'], accent: '#2f7dff', word: 'BRASIL', postmark: 'AMAZÔNIA · BRASIL' },
    paper: '#eef0e2',
  },
  {
    id: 'beanstalk', name: 'Beanstalk Sky', place: 'Above the clouds', country: 'Fairy tale', code: 'FT', tale: 'Jack and the Beanstalk',
    flavour: 'One magic bean, one very long climb, and a castle on a cloud at the top.',
    unlock: { cost: 2400 }, plates: 'beanstalk', clump: 'bean',
    swatch: ['#6fa4d8', '#f6e6c8', '#0e2a1a'],
    day: P('#6fa4d8 #f6e6c8 #cfd6ea #a6b4d2 #5a7a6a #0e2a1a #ece4d8 #fff6d8 #ffffff #ffe27a #ffffff'),
    dusk: P('#7a7cc0 #f6c8b0 #c4bcd8 #9a96c0 #4e6464 #0e2018 #e0ccc8 #ffd8a8 #fff0dc #ffd25a #f6e6e8'),
    night: P('#0e1236 #2e3270 #262a5e #1c2050 #141838 #070a1e #343a78 #fff1c4 #fff1c4 #ffe27a #5a5f98'),
    zones: ['Cottage garden', 'Magic beans', 'Cloud bank', 'Thunderhead', 'Giant\'s castle'],
    amb: [[['petal', 6], ['bird', 3]], [['blade', 6], ['feather', 3]], [['feather', 4], ['bird', 3]], [['drop', 14]], [['glow', 12]]],
    pcol: { petal: ['#ffffff', '#ffe4f0'], blade: ['#3faa4a', '#8ad86a'], feather: ['#ffd25a', '#fff3c4'], drop: '#e8eefa' },
    stamp: { motif: 'beanstalk', ink: '#0e2a1a', bg: ['#6fa4d8', '#f6e6c8'], accent: '#ffc94d', word: 'FAIRYLAND', postmark: 'CLOUD KINGDOM · FAIRYLAND' },
    paper: '#f3eee6',
  },
];
// V2-INT fix: the v1 maps are retired; each legacy slot (ownership, prices, ids in saves) now IS the v2
// world that took it over, so every label, stamp and postcard reads the world (EN/VI), never Phong Nha &co.
for (const w of V2_WORLDS) {
  const m = MAPS.find((x) => x.id === w.legacy); if (!m) continue;
  const [t0, t1, t2, t3] = w.tones;
  Object.assign(m, { v1name: m.name, world: w.id, name: w.name, nameVi: w.nameVi, place: w.nameVi, country: w.medium, code: '', tale: null, flavour: w.blurb,
    painting: `assets/v2/${w.id}/ui/${w.id}.ui.painting.s.webp`, swatch: [t0, t1, t3],
    stamp: { ...m.stamp, ink: t3, bg: [t0, t1], accent: t1, word: w.nameVi.toUpperCase(), postmark: `${w.name.toUpperCase()} · FORKWOOD` } });
}
export const MAP = Object.fromEntries(MAPS.map((m) => [m.id, m]));
export const DEFAULT_MAP = 'forkwood';
/** Ids unlocked for every player from the start (classic + one new). */
export const DEFAULT_UNLOCKED = MAPS.filter((m) => m.unlock.free).map((m) => m.id);
/** Plate asset names for a map (lazy: loaded only once the map is chosen or previewed). */
export const plateNames = (m) => (m && m.plates ? ['sky', 'far', 'side'].map((l) => `m-${l}-${m.plates}`) : []);

// zone palettes: day, 40 % to dusk, dusk, halfway to night (storm), night
const mix = (a, b, t) => {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
};
const mixPal = (a, b, t) => Object.fromEntries(K.map((k) => [k, mix(a[k], b[k], t)]));
/** Five zone palettes in backdrop keys (meadow, oak, snow, storm, sky order). */
export function zonePalettes(m) {
  if (!m || !m.day) return null;
  const storm = mixPal(m.dusk, m.night, 0.55);
  storm.top = mix(storm.top, '#3a4252', 0.35); storm.bot = mix(storm.bot, '#7a8291', 0.35);
  return [m.day, mixPal(m.day, m.dusk, 0.4), m.dusk, storm, m.night];
}

// ------------------------------------------------------------------ ownership + selection
const LS_SEL = 'forkwood.map', LS_OWN = 'forkwood.maps.owned';
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
let ownership = null; // econ hook: () => array of owned map ids
let levelOf = () => 0;
let granter = null; // econ hook: (id) => void, writes the owned map into the save
const listeners = new Set();

/**
 * Econ integration: `owned` returns the ids the player has bought (the free
 * ones are always added); `level` the player level for { level } unlocks.
 */
export function setOwnership({ owned, level, grant } = {}) { ownership = owned || null; if (level) levelOf = level; granter = grant || null; emit(); }
export function ownedIds() {
  if (UNLOCK_ALL_MAPS) return new Set(MAPS.map((m) => m.id)); // V3.2: every map open (flags.js)
  const o = new Set(DEFAULT_UNLOCKED);
  for (const id of (ownership ? ownership() : ls.get(LS_OWN, [])) || []) o.add(id);
  for (const m of MAPS) if (m.unlock.level && levelOf() >= m.unlock.level) o.add(m.id);
  return o;
}
export const isUnlocked = (id) => ownedIds().has(id);
/** Local fallback unlock (the econ integrator replaces this with a purchase). */
export function grantMap(id) { if (!MAP[id]) return; if (granter) granter(id); else { const a = new Set(ls.get(LS_OWN, [])); a.add(id); ls.set(LS_OWN, [...a]); } emit(); }
/** Ids granted through the local fallback before the economy took over (migrated once into the save). */
export function takeLegacyOwned() { const a = ls.get(LS_OWN, []); try { localStorage.removeItem(LS_OWN); } catch (e) { /* private mode */ } return Array.isArray(a) ? a.filter((id) => MAP[id]) : []; }
export function selectedId() { const id = ls.get(LS_SEL, DEFAULT_MAP); return MAP[id] && isUnlocked(id) ? id : DEFAULT_MAP; }
export function selected() { return MAP[selectedId()]; }
export function select(id) { if (!MAP[id] || !isUnlocked(id)) return false; ls.set(LS_SEL, id); emit(); return true; }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) try { fn(selected()); } catch (e) { console.warn(e); } }

export const maps = { MAPS, MAP, DEFAULT_MAP, DEFAULT_UNLOCKED, plateNames, zonePalettes, setOwnership, ownedIds, isUnlocked, grantMap, takeLegacyOwned, selectedId, selected, select, onChange };
export default maps;
