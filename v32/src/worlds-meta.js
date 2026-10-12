// Forkwood 2.0 META: the seven worlds as the menus see them (gallery labels,
// unlock slots, painting ids). ENGINE owns src/worlds.js (layers, traps, music);
// this file only carries what the out-of-run screens need, so the two can merge
// by `id` without touching each other.
//
// Unlock economy: the v2 worlds take over the v1 map SLOTS in order, so prices and
// every player's existing ownership carry over unchanged (S.econ.maps keeps the
// legacy ids). Slot 1 and 2 were free in v1 and stay free.

export const WORLDS = [
  { id: 'meadow', legacy: 'forkwood', name: 'Golden Hour Meadow', nameVi: 'Đồng cỏ hoàng hôn', medium: 'Cinematic anime painting',
    room: 'Gallery I', year: 'Forkwood Collection', vine: 'vine.skin.watercolour',
    blurb: 'Wind through the tall grass, a train line on the levee and a sky that turns to fire.',
    tones: ['#f6c36b', '#e7875a', '#5d7fa6', '#24314a'] },
  { id: 'starry', legacy: 'phongnha', name: 'Starry River', nameVi: 'Đêm sao bên sông', medium: 'Impasto oil, after Van Gogh',
    room: 'Gallery II', year: 'Forkwood Collection', vine: 'vine.skin.impasto',
    blurb: 'Thick swirls of cobalt and chrome yellow; the sky itself turns while you climb.',
    tones: ['#f2d36b', '#3d6fb6', '#1d3366', '#0d1733'] },
  { id: 'fresco', legacy: 'arashiyama', name: 'Fresco Cathedral', nameVi: 'Thánh đường bích họa', medium: 'Renaissance fresco, lime plaster and gold',
    room: 'Gallery III', year: 'Forkwood Collection', vine: 'vine.skin.tempera',
    blurb: 'Up through painted vaults and coffered ceilings into a dome of gold.',
    tones: ['#e9d3a8', '#c58b5a', '#7d9bb0', '#4a3a2c'] },
  { id: 'ukiyo', legacy: 'redwoods', name: 'Great Wave Cliffs', nameVi: 'Sóng lớn núi thiêng', medium: 'Ukiyo-e woodblock on washi',
    room: 'Gallery IV', year: 'Forkwood Collection', vine: 'vine.skin.sumi',
    blurb: 'Prussian-blue breakers with claws of foam, and the sacred mountain beyond.',
    tones: ['#efe4cc', '#2f5c8a', '#1b3552', '#c9473a'] },
  { id: 'lilies', legacy: 'blackforest', name: 'Lily Garden', nameVi: 'Vườn súng', medium: 'Impressionist dabs, after Monet',
    room: 'Gallery V', year: 'Forkwood Collection', vine: 'vine.skin.dabs',
    blurb: 'Over the pond and the little green bridge, through wisteria into morning haze.',
    tones: ['#bfd8c8', '#7fa7c9', '#d99bb4', '#3e5b56'] },
  { id: 'gilded', legacy: 'amazon', name: 'Gilded Grove', nameVi: 'Rừng dát vàng', medium: 'Gold-leaf mosaic, after Klimt',
    room: 'Gallery VI', year: 'Forkwood Collection', vine: 'vine.skin.goldleaf',
    blurb: 'A birch forest set in gold leaf and mosaic tesserae that glint as you pass.',
    tones: ['#e8c262', '#b8862f', '#f1ead2', '#2f2a1d'] },
  { id: 'lacquer', legacy: 'beanstalk', name: 'Lantern Village', nameVi: 'Làng đèn lồng', medium: 'Vietnamese sơn mài lacquer',
    room: 'Gallery VII', year: 'Forkwood Collection', vine: 'vine.skin.lacquer',
    blurb: 'Black lacquer, eggshell and gold: lotus pond, bamboo, village roofs, a gilded moon.',
    tones: ['#d8a24a', '#b0302a', '#e9dcc0', '#120c0a'] },
];
export const WORLD = Object.fromEntries(WORLDS.map((w, i) => [w.id, { ...w, i }]));
export const WORLD_BY_LEGACY = Object.fromEntries(WORLDS.map((w) => [w.legacy, w.id]));
export const DEFAULT_WORLD = 'meadow';
/** Registry id of a world's framed painting (ART fills it; placeholders in ui-art.js). */
export const paintingId = (id) => `${id}.ui.painting`;
