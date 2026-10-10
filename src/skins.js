// Cosmetic skins. Every item is a palette or a shape drawn in the same
// woodblock-print style as the base game (one warm ink key plate, flat colour
// plates). Skins never touch the simulation: they only change how the tree,
// the sky and the postcard are printed.
import { SKY_STOPS, STAGES } from './sim.js';

export const SLOTS = [
  { id: 'bark', name: 'Bark', hint: 'the colour of your wood' },
  { id: 'leaf', name: 'Leaves', hint: 'what grows on every commit' },
  { id: 'blossom', name: 'Blossom', hint: 'printed on every full bloom' },
  { id: 'bud', name: 'Branch tip', hint: 'the growing tip you steer' },
  { id: 'sky', name: 'Sky plate', hint: 'the posterised sky you climb' },
  { id: 'card', name: 'Postcard', hint: 'the print you share' },
];

// unlock: { cost } in acorns, or { level } / { ach } for earned-only items
export const SKINS = [
  // bark
  { id: 'bark.walnut', slot: 'bark', name: 'Walnut', unlock: { free: true }, wood: '#6b4429', light: '#a8744a', fresh: ['#7d8f3a', '#8fb14a', '#a9cf5a'] },
  { id: 'bark.birch', slot: 'bark', name: 'Birch', unlock: { cost: 240 }, wood: '#e9e1cf', light: '#ffffff', fresh: ['#9fb35a', '#b5cc6a', '#cde27e'], mark: '#1e1a16' },
  { id: 'bark.cherry', slot: 'bark', name: 'Cherry', unlock: { cost: 360 }, wood: '#8e3b2e', light: '#d07a5c', fresh: ['#8a6a3a', '#a9884a', '#c9a85a'] },
  { id: 'bark.ebony', slot: 'bark', name: 'Ebony', unlock: { cost: 640 }, wood: '#2f2723', light: '#f2b33d', fresh: ['#4d5a2a', '#66773a', '#86994a'] },
  { id: 'bark.gilded', slot: 'bark', name: 'Gilded', unlock: { ach: 'starlight' }, wood: '#c98a2a', light: '#ffe08a', fresh: ['#b58f2a', '#d8b03a', '#f2cf5a'] },
  // leaves
  { id: 'leaf.seasons', slot: 'leaf', name: 'Seasons', unlock: { free: true }, leaves: null, shape: 'leaf' },
  { id: 'leaf.evergreen', slot: 'leaf', name: 'Evergreen', unlock: { cost: 150 }, leaves: ['#2f7a45', '#3f9655'], shape: 'needle' },
  { id: 'leaf.maple', slot: 'leaf', name: 'Maple fire', unlock: { cost: 320 }, leaves: ['#d9502e', '#f08a2c'], shape: 'maple' },
  { id: 'leaf.indigo', slot: 'leaf', name: 'Indigo print', unlock: { cost: 520 }, leaves: ['#2c4a8a', '#5b7fc4'], shape: 'leaf' },
  { id: 'leaf.ginkgo', slot: 'leaf', name: 'Ginkgo', unlock: { level: 6 }, leaves: ['#e8b32a', '#f6d45a'], shape: 'ginkgo' },
  // blossom
  { id: 'blossom.plum', slot: 'blossom', name: 'Plum', unlock: { free: true }, petal: '#f7b6c8', alt: '#fff4ec', center: '#f2b33d' },
  { id: 'blossom.camellia', slot: 'blossom', name: 'Camellia', unlock: { cost: 240 }, petal: '#e2483a', alt: '#ff8f7a', center: '#ffe08a' },
  { id: 'blossom.wisteria', slot: 'blossom', name: 'Wisteria', unlock: { cost: 400 }, petal: '#a98be0', alt: '#e2d4ff', center: '#f4ecd8' },
  { id: 'blossom.moonflower', slot: 'blossom', name: 'Moonflower', unlock: { ach: 'florist' }, petal: '#f4fbff', alt: '#cfe6ff', center: '#5b7fc4' },
  // tip
  { id: 'bud.sprout', slot: 'bud', name: 'Green bud', unlock: { free: true }, shape: 'bud', body: '#6faa3c', hi: '#c4e88a' },
  { id: 'bud.acorn', slot: 'bud', name: 'Acorn cap', unlock: { cost: 300 }, shape: 'acorn', body: '#c98a4a', hi: '#f0c27e', cap: '#6b4429' },
  { id: 'bud.pinecone', slot: 'bud', name: 'Pinecone', unlock: { cost: 500 }, shape: 'cone', body: '#8a5a32', hi: '#c98a4a' },
  { id: 'bud.lantern', slot: 'bud', name: 'Paper lantern', unlock: { level: 10 }, shape: 'lantern', body: '#e2603f', hi: '#ffe08a' },
  // sky plates (stops: [metres, colour])
  { id: 'sky.print', slot: 'sky', name: 'Print sky', unlock: { free: true }, stops: SKY_STOPS },
  { id: 'sky.dawn', slot: 'sky', name: 'Dawn wash', unlock: { cost: 400 }, stops: [[0, '#ffd9c2'], [40, '#ffe9d6'], [120, '#f9d0de'], [240, '#e9c6ef'], [400, '#c9b8f0'], [600, '#8f8fd0'], [850, '#4a4f8e'], [1100, '#252a5c']] },
  { id: 'sky.ukiyo', slot: 'sky', name: 'Prussian blue', unlock: { cost: 700 }, stops: [[0, '#f1e6c8'], [40, '#cfe0e2'], [120, '#8fb6c9'], [240, '#4f86a8'], [400, '#2d5f8a'], [600, '#1c3f6a'], [850, '#10264a'], [1100, '#081630']] },
  { id: 'sky.riso', slot: 'sky', name: 'Risograph', unlock: { cost: 600 }, stops: [[0, '#ffb3c7'], [40, '#ffc9d6'], [120, '#8fd6cf'], [240, '#5cc3c0'], [400, '#ff7aa2'], [600, '#3d5ba9'], [850, '#24306e'], [1100, '#121a44']] },
  // postcards
  { id: 'card.cream', slot: 'card', name: 'Cream', unlock: { free: true }, paper: '#f4ecd8', ink: '#1e1a16', seal: '#d8432f', edge: 'plain' },
  { id: 'card.kraft', slot: 'card', name: 'Kraft', unlock: { cost: 100 }, paper: '#d8b98a', ink: '#2a1e14', seal: '#a8321f', edge: 'plain' },
  { id: 'card.night', slot: 'card', name: 'Night print', unlock: { cost: 440 }, paper: '#1d2342', ink: '#f4ecd8', seal: '#f2b33d', edge: 'plain' },
  { id: 'card.stamp', slot: 'card', name: 'Postage stamp', unlock: { cost: 760 }, paper: '#f6efe0', ink: '#1e1a16', seal: '#2c4a8a', edge: 'perforated' },
];
export const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const DEFAULT_LOADOUT = { bark: 'bark.walnut', leaf: 'leaf.seasons', blossom: 'blossom.plum', bud: 'bud.sprout', sky: 'sky.print', card: 'card.cream' };

/** The live theme the renderer and the postcard read. */
export const THEME = {
  bark: SKIN['bark.walnut'], leaf: SKIN['leaf.seasons'], blossom: SKIN['blossom.plum'],
  bud: SKIN['bud.sprout'], sky: SKIN['sky.print'], card: SKIN['card.cream'],
};

export function applyLoadout(loadout = {}) {
  for (const slot of Object.keys(DEFAULT_LOADOUT)) {
    const it = SKIN[loadout[slot]] || SKIN[DEFAULT_LOADOUT[slot]];
    THEME[slot] = it.slot === slot ? it : SKIN[DEFAULT_LOADOUT[slot]];
  }
  return THEME;
}

/** Leaf fill for a commit at stage st (alternate = darker side leaf). */
export function leafColor(st, j = 0) {
  const L = THEME.leaf.leaves;
  if (!L) return st.leaf;
  return L[j % L.length];
}

export const stageLeaf = (i) => STAGES[i].leaf;
