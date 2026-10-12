// P8-MAPS: cosmetic skins themed to the map set (src/maps.js). Same shape as
// SKINS in src/skins.js (slot / palette / shape fields the renderer already
// reads), so the econ integrator can append them: SKINS.push(...MAP_SKINS).
// This file does not import or edit skins.js. `map` names the map each skin
// belongs to (for a "themed to this map" row in the map carousel / shop);
// `unlock.cost` is a suggested acorn price for the integrator to confirm.
//
// Shapes used are the existing ones only: leaf: leaf | needle | maple | ginkgo;
// bud: bud | acorn | cone | lantern; trail kinds: leaves | sparks | pollen |
// petals | fireflies | ink | stardust.

export const MAP_SKINS = [
  // Phong Nha (Việt Nam)
  { id: 'bark.karst', slot: 'bark', map: 'phongnha', name: 'Karst limestone', unlock: { cost: 320 }, wood: '#8e9a8e', light: '#dfe8dc', fresh: ['#5f8a5a', '#7fa86a', '#a6c98a'], mark: '#2f4a40' },
  { id: 'bud.hoian', slot: 'bud', map: 'phongnha', name: 'Hội An lantern', unlock: { cost: 480 }, shape: 'lantern', body: '#e8b23a', hi: '#fff0b0' },
  { id: 'trail.jadeflies', slot: 'trail', map: 'phongnha', name: 'Cave fireflies', unlock: { cost: 420 }, kind: 'fireflies', c: ['#b8ff9a', '#f0ffd0'] },
  // Arashiyama (Japan)
  { id: 'bark.bamboo', slot: 'bark', map: 'arashiyama', name: 'Green bamboo', unlock: { cost: 360 }, wood: '#7f9a4a', light: '#d6e6a0', fresh: ['#8fb14a', '#a9cf5a', '#cde27e'], mark: '#3f5228' },
  { id: 'leaf.bamboo', slot: 'leaf', map: 'arashiyama', name: 'Bamboo blades', unlock: { cost: 260 }, leaves: ['#4f8a3e', '#93c26a'], shape: 'needle' },
  { id: 'trail.momiji', slot: 'trail', map: 'arashiyama', name: 'Momiji', unlock: { cost: 440 }, kind: 'petals', c: ['#e2483a', '#f29a4a'] },
  // Redwoods (USA)
  { id: 'bark.redwood', slot: 'bark', map: 'redwoods', name: 'Coast redwood', unlock: { cost: 380 }, wood: '#8a3a22', light: '#d8825a', fresh: ['#6f8a4a', '#8fa85a', '#b0c87a'] },
  { id: 'leaf.sequoia', slot: 'leaf', map: 'redwoods', name: 'Sequoia sprays', unlock: { cost: 280 }, leaves: ['#2f5e3e', '#5f8a52'], shape: 'needle' },
  { id: 'bud.sequoia', slot: 'bud', map: 'redwoods', name: 'Sequoia cone', unlock: { cost: 420 }, shape: 'cone', body: '#7a4a2a', hi: '#c88a52' },
  // Black Forest / Hansel & Gretel (Deutschland)
  { id: 'bark.gingerbread', slot: 'bark', map: 'blackforest', name: 'Gingerbread', unlock: { cost: 520 }, wood: '#a0632e', light: '#f4d6a0', fresh: ['#c98a4a', '#e0a860', '#f0c27e'], mark: '#fff6ec' },
  { id: 'bud.candy', slot: 'bud', map: 'blackforest', name: 'Gumdrop', unlock: { cost: 460 }, shape: 'acorn', body: '#ff6f91', hi: '#ffd0dc', cap: '#fff6ec' },
  { id: 'trail.crumbs', slot: 'trail', map: 'blackforest', name: 'Breadcrumbs', unlock: { cost: 360 }, kind: 'pollen', c: ['#c98a4a', '#f0c27e'] },
  // Amazon (Brasil)
  { id: 'leaf.monstera', slot: 'leaf', map: 'amazon', name: 'Monstera', unlock: { cost: 340 }, leaves: ['#1f8a5a', '#4fc07a'], shape: 'leaf' },
  { id: 'blossom.heliconia', slot: 'blossom', map: 'amazon', name: 'Heliconia', unlock: { cost: 420 }, petal: '#ff5a3a', alt: '#ffd23a', center: '#2a8a4a' },
  { id: 'trail.morpho', slot: 'trail', map: 'amazon', name: 'Blue morpho', unlock: { cost: 520 }, kind: 'petals', c: ['#2f7dff', '#9ad8ff'] },
  { id: 'bud.toucan', slot: 'bud', map: 'amazon', name: 'Toucan beak', unlock: { cost: 480 }, shape: 'acorn', body: '#ff9a2a', hi: '#ffe07a', cap: '#1a1a1a' },
  // Beanstalk sky (Jack and the Beanstalk)
  { id: 'bark.beanstalk', slot: 'bark', map: 'beanstalk', name: 'Beanstalk', unlock: { cost: 440 }, wood: '#3f7a3a', light: '#a6dc6a', fresh: ['#6faa3c', '#8fcf4a', '#b8ec6a'] },
  { id: 'leaf.bean', slot: 'leaf', map: 'beanstalk', name: 'Magic bean leaves', unlock: { cost: 300 }, leaves: ['#3faa4a', '#8ad86a'], shape: 'leaf' },
  { id: 'bud.goldenegg', slot: 'bud', map: 'beanstalk', name: 'Golden egg', unlock: { cost: 640 }, shape: 'bud', body: '#ffc94d', hi: '#fff3c4' },
  { id: 'trail.goldfeather', slot: 'trail', map: 'beanstalk', name: 'Goose feathers', unlock: { cost: 560 }, kind: 'stardust', c: ['#ffe08a', '#fff6d8'] },
];
export const MAP_SKIN = Object.fromEntries(MAP_SKINS.map((s) => [s.id, s]));
/** Skins themed to one map, for a "matching looks" row. */
export const skinsForMap = (mapId) => MAP_SKINS.filter((s) => s.map === mapId);
export default MAP_SKINS;
