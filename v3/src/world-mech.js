// Forkwood 2.0 MECH: the gameplay identity of the 7 worlds (pure data, no DOM).
//
// Every world has its OWN trap set: a selection of the 24 trap mechanics (the
// 9 v1 traps in src/traps.js + 15 in src/traps2.js), each re-themed for the
// world with its own name, hint and registry skin id `<world>.trap.<name>`
// (ART draws sprites under exactly these ids; keep them stable). The classic
// hazards (thorn gates, split gates, columns, beetles, frost, wind, sliders)
// appear on every world under `<world>.hazard.<kind>`.
//
// ENGINE's src/worlds.js reads `trapSet` (registry ids) and `setPieces` from
// here, so the world definition and the simulation can never disagree.

export const WORLD_IDS = ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer'];
export const DEFAULT_WORLD = 'meadow';

// t(mech, name, label, labelVi, hint)
const t = (mech, name, label, labelVi, hint) => ({ mech, name, label, labelVi, hint });

export const WORLD_MECH = {
  meadow: {
    name: 'Golden Hour Meadow',
    traps: [
      t('twig', 'reed', 'SNAPPING REED', 'Cây sậy gãy', 'keep moving · the reed snaps if you linger'),
      t('gust', 'gust', 'GOLDEN BREEZE', 'Gió hoàng hôn', 'grass streaks warn of a gust · lean into it'),
      t('crow', 'crow', 'MEADOW CROW', 'Quạ đồng', 'it marks your lane · swerve out (or fork round it) before it dives'),
      t('lure', 'honeylure', 'HONEY LURE', 'Mồi mật ong', 'too-easy sunlight leads into a bramble pocket'),
      t('pulse', 'thistle', 'THISTLE PULSE', 'Hàng gai kế', 'thistles breathe in and out · take the open lane'),
      t('web', 'dewweb', 'DEW WEB', 'Mạng nhện sương', 'go round · or fork through it to tear it'),
      t('cone', 'squirrel', 'ACORN SQUIRREL', 'Sóc ném hạt', 'leave the target circle after it locks'),
      t('hornets', 'hornet', 'BEE SWARM', 'Đàn ong', 'thread the gap beside the swarm'),
      t('seesaw', 'seesaw', 'SWAYING BOUGH', 'Cành bập bênh', 'read the chevrons · enter the open end (fork both when level)'),
    ],
    rides: { sig: 'dandelion', native: ['hummingbird', 'mushroom'] },
    setPieces: {
      calm: { id: 'meadow.sp.bloom', name: 'Golden Bloom', nameVi: 'Mùa hoa vàng' },
      chase: { id: 'meadow.sp.stormfront', name: 'Summer Storm Front', nameVi: 'Giông mùa hạ', pursuer: 'storm' },
      boss: { id: 'meadow.boss.giant', name: 'THE CROW KING', nameVi: 'Vua Quạ', boss: 'giant' },
    },
  },
  starry: {
    name: 'Starry River',
    traps: [
      t('crow', 'crowdive', 'CROW FLOCK', 'Bầy quạ đêm', 'the flock marks your lane · swerve out (or fork round it)'),
      t('vortex', 'vortex', 'SWIRL CURRENT', 'Xoáy sao', 'the swirl drags you to its star knot · ride the rim or fork round the eye'),
      t('pulse', 'wheatspikes', 'WHEAT SPIKES', 'Gai lúa mì', 'the wheat spikes breathe in and out · take the open lane'),
      t('door', 'cypressgate', 'CYPRESS GATE', 'Cổng bách', 'the cypress sways shut on the beat · the side gap never shuts'),
      t('embers', 'lampsparks', 'LAMP SPARKS', 'Tia đèn', 'sparks swell before they flare · keep your distance'),
      t('bats', 'swallows', 'NIGHT SWALLOWS', 'Én đêm', 'they dive where you were · keep moving'),
      t('tide', 'riverrise', 'RISING RIVER', 'Sông dâng', 'keep climbing · the river rises from below'),
      t('icicle', 'fallingstar', 'FALLING STAR', 'Sao rơi', 'a shaking star falls down its shaded column · sidestep'),
    ],
    rides: { sig: 'swiftlet', native: ['crane', 'hummingbird'] },
    setPieces: {
      calm: { id: 'starry.sp.drift', name: 'Starlight Drift', nameVi: 'Dòng sao trôi' },
      chase: { id: 'starry.sp.flood', name: 'The River Flood', nameVi: 'Lũ sông sao', pursuer: 'river' },
      boss: { id: 'starry.boss.crowking', name: 'THE NIGHT MISTRAL', nameVi: 'Gió đêm', boss: 'crowking' },
    },
  },
  fresco: {
    name: 'Fresco Cathedral',
    traps: [
      t('icicle', 'plaster', 'FALLING PLASTER', 'Vữa rơi', 'shaking plaster falls down its shaded column · sidestep'),
      t('cone', 'candlewax', 'CANDLE DRIPS', 'Sáp nến nhỏ', 'leave the wax circle after it locks'),
      t('door', 'archgate', 'ARCH GATE', 'Cổng vòm', 'the doors swing on the beat · the side gap never shuts'),
      t('pendulum', 'censer', 'SWINGING CENSER', 'Lư hương đung đưa', 'the ghost arc shows each swing · time the gap'),
      t('pulse', 'organpipes', 'ORGAN PIPES', 'Ống đàn organ', 'the pipes rise and fall · take the open lane'),
      t('sap', 'damp', 'DAMP PLASTER', 'Vữa ẩm', 'wet plaster drinks your sap · go round'),
      t('twins', 'cherub', 'TWIN CHERUBS', 'Cặp thiên thần', 'fork around them · or squeeze past one side'),
      t('bats', 'belfrybats', 'BELFRY BATS', 'Dơi tháp chuông', 'they dive where you were · keep moving'),
    ],
    rides: { sig: 'crane', native: ['dandelion', 'stag'] },
    setPieces: {
      calm: { id: 'fresco.sp.choir', name: 'Choir of Light', nameVi: 'Hợp xướng ánh sáng' },
      chase: { id: 'fresco.sp.nave', name: 'The Crumbling Nave', nameVi: 'Gian giữa đổ sụp', pursuer: 'rubble' },
      boss: { id: 'fresco.boss.gargoyle', name: 'THE STONE CHERUB', nameVi: 'Thiên thần đá', boss: 'gargoyle' },
    },
  },
  ukiyo: {
    name: 'Great Wave Cliffs',
    traps: [
      t('tide', 'wavecrest', 'WAVE CREST', 'Ngọn sóng', 'keep climbing · the great wave rises from below'),
      t('pendulum', 'onikite', 'WIND KITE', 'Diều gió', 'the ghost arc shows each swing · time the gap'),
      t('gust', 'seawind', 'SEA WIND', 'Gió biển', 'spray streaks warn of a gust · lean into it'),
      t('pulse', 'spray', 'SEA SPRAY', 'Bọt sóng', 'the spray breathes in and out · take the open lane'),
      t('seesaw', 'pinebough', 'CLIFF PINE', 'Cành thông vách đá', 'read the chevrons · enter the open end'),
      t('pecker', 'oarsweep', 'OAR SWEEP', 'Mái chèo quét', 'a dotted row flashes before the oars sweep · pass above or below'),
      t('crow', 'cormorant', 'CORMORANT DIVE', 'Chim cốc lao', 'it marks your lane · swerve out before it dives'),
      t('jaws', 'rocks', 'CLASHING ROCKS', 'Đá kẹp', 'the rocks quiver before they clash · pass while open or fork outside'),
    ],
    rides: { sig: 'rocket', native: ['crane', 'dandelion'] },
    setPieces: {
      calm: { id: 'ukiyo.sp.lanterns', name: 'Lantern Festival', nameVi: 'Lễ hội đèn' },
      chase: { id: 'ukiyo.sp.typhoon', name: 'Typhoon', nameVi: 'Bão lớn', pursuer: 'wave' },
      boss: { id: 'ukiyo.boss.kitsune', name: 'THE ONI KITE', nameVi: 'Diều quỷ', boss: 'kitsune' },
    },
  },
  lilies: {
    name: 'Lily Garden',
    traps: [
      t('hornets', 'dragonflyswarm', 'DRAGONFLY SWARM', 'Đàn chuồn chuồn', 'thread the gap beside the swarm'),
      t('twig', 'lilysink', 'SINKING PADS', 'Lá súng chìm', 'keep moving · the pad sinks if you linger'),
      t('web', 'reedweb', 'REED WEB', 'Mạng nhện lau', 'go round · or fork through it to tear it'),
      t('jaws', 'turtle', 'SNAPPING TURTLE', 'Rùa đớp', 'the jaws quiver before they snap · pass while open or fork outside'),
      t('spores', 'pollen', 'SLEEPY POLLEN', 'Phấn hoa ngái ngủ', 'the haze swaps left and right · avoid it'),
      t('strangle', 'weeds', 'TANGLE WEED', 'Rong quấn', 'weeds grow in from both banks · merge to slip through the middle'),
      t('door', 'footbridge', 'FOOTBRIDGE GATE', 'Cổng cầu gỗ', 'the gate swings on the beat · the side gap never shuts'),
      t('sap', 'mud', 'POND MUD', 'Bùn ao', 'thick mud drinks your sap · go round'),
    ],
    rides: { sig: 'morpho', native: ['dandelion', 'hummingbird'] },
    setPieces: {
      calm: { id: 'lilies.sp.bloom', name: 'Water-lily Bloom', nameVi: 'Súng nở' },
      chase: { id: 'lilies.sp.flood', name: 'Spring Flood', nameVi: 'Nước lên', pursuer: 'pond' },
      boss: { id: 'lilies.boss.heron', name: 'THE HERON MATRIARCH', nameVi: 'Diệc chúa', boss: 'heron' },
    },
  },
  gilded: {
    name: 'Gilded Grove',
    traps: [
      t('icicle', 'goldshards', 'MOSAIC SHARDS', 'Mảnh khảm', 'shaking shards fall down their shaded column · sidestep'),
      t('beam', 'glare', 'GOLD GLARE', 'Ánh vàng chói', 'the glare warms up, then sweeps · straddle it or stay ahead'),
      t('pulse', 'spiralthorn', 'SPIRAL THORNS', 'Gai xoắn', 'the spirals breathe in and out · take the open lane'),
      t('twins', 'scarabs', 'TWIN SCARABS', 'Cặp bọ vàng', 'fork around them · or squeeze past one side'),
      t('seesaw', 'birchbough', 'BIRCH BOUGH', 'Cành bạch dương', 'read the chevrons · enter the open end'),
      t('lure', 'goldlure', 'GILDED LURE', 'Mồi dát vàng', 'too-easy sunlight leads into a gilded pocket'),
      t('strangle', 'tendrils', 'GOLDEN TENDRILS', 'Tua vàng', 'tendrils grow in from both sides · merge to slip through the middle'),
      t('embers', 'flakes', 'GOLD FLAKES', 'Vảy vàng', 'flakes swell before they flare · keep your distance'),
    ],
    rides: { sig: 'stag', native: ['hummingbird', 'goose'] },
    setPieces: {
      calm: { id: 'gilded.sp.leaffall', name: 'Gold Leaf Fall', nameVi: 'Lá vàng rơi' },
      chase: { id: 'gilded.sp.avalanche', name: 'Gilded Avalanche', nameVi: 'Thác lá vàng', pursuer: 'gold' },
      boss: { id: 'gilded.boss.stag', name: 'THE GOLDEN PEACOCK', nameVi: 'Công vàng', boss: 'stag' },
    },
  },
  lacquer: {
    name: 'Lantern Village',
    traps: [
      t('embers', 'lanternfire', 'LANTERN FIRE', 'Lửa đèn lồng', 'the flame swells before it flares · keep your distance'),
      t('bats', 'koileap', 'KOI LEAP', 'Cá chép nhảy', 'koi leap where you were · keep moving'),
      t('web', 'mosquitonet', 'MOSQUITO NET', 'Màn tuyn', 'go round · or fork through it to tear it'),
      t('door', 'shutters', 'WOODEN SHUTTERS', 'Cửa chớp gỗ', 'the shutters swing on the beat · the side gap never shuts'),
      t('pendulum', 'lanternswing', 'SWINGING LANTERNS', 'Đèn lồng đung đưa', 'the ghost arc shows each swing · time the gap'),
      t('cone', 'firecracker', 'FIRECRACKER DROP', 'Pháo rơi', 'leave the red circle after it locks'),
      t('candy', 'screen', 'FOLDING SCREEN', 'Bình phong gấp', 'grab the triple sunlight and get out the far side before it folds'),
      t('crow', 'egret', 'DIVING EGRET', 'Cò lao xuống', 'it marks your lane · swerve out before it dives'),
    ],
    rides: { sig: 'goose', native: ['crane', 'swiftlet'] },
    setPieces: {
      calm: { id: 'lacquer.sp.lanterns', name: 'Mid-Autumn Lanterns', nameVi: 'Đèn Trung thu' },
      chase: { id: 'lacquer.sp.fireworks', name: 'Festival Fireworks', nameVi: 'Pháo hoa lễ hội', pursuer: 'fireworks' },
      boss: { id: 'lacquer.boss.dragon', name: 'THE CARP DRAGON', nameVi: 'Cá chép hóa rồng', boss: 'dragon' },
    },
  },
};

// ids above follow the ART registry (assets/v2/registry.json) wherever ART already drew the sprite.
// derived: registry ids and lookups
for (const [wid, w] of Object.entries(WORLD_MECH)) {
  w.id = wid;
  for (const tr of w.traps) tr.id = `${wid}.trap.${tr.name}`;
  w.trapSet = w.traps.map((tr) => tr.id);
  w.mechs = new Set(w.traps.map((tr) => tr.mech));
  w.byMech = Object.fromEntries(w.traps.map((tr) => [tr.mech, tr]));
}

export const worldMech = (id) => WORLD_MECH[id] || WORLD_MECH[DEFAULT_WORLD];
/** Does this world use a trap mechanic? (Combos need every one of their parts.) */
export const hasMech = (wid, mech) => worldMech(wid).mechs.has(mech);
/** Registry skin id for a trap mechanic on a world (falls back to a common id). */
export const trapSkin = (wid, mech) => { const tr = worldMech(wid).byMech[mech]; return tr ? tr.id : `common.trap.${mech}`; };
export const hazardSkin = (wid, kind) => `${worldMech(wid).id}.hazard.${kind}`;
/** Display name and hint of a mechanic on a world (for trapintro). */
export const trapLabel = (wid, mech) => worldMech(wid).byMech[mech] || null;

/** Fair modes (daily, weekly, race, duel) need one world for everyone: a stable pick from the seed. */
export const worldForSeed = (seed) => WORLD_IDS[(seed >>> 0) % WORLD_IDS.length];
