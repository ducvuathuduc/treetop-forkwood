// Forkwood 1.0: the story in episodes. The Prologue (src/intro.js BEATS) plus one short manga episode per
// world. Episode N plays the first time a free-play run starts in that world; the Story gallery on Home
// replays any of them. Art: assets/story/ep/*.webp (made for Forkwood), lazy-loaded
// per episode, never on first load. Text is short so it fits a 390 px phone.
import { playIntro, loadStoryCss } from './intro.js';

// Panel shapes in page fractions. Portrait: three slanted bands. Landscape (desktop): two panels on top,
// one wide panel below.
const P = {
  a: [[0, 0], [1, 0], [1, 0.305], [0, 0.345]],
  b: [[0, 0.365], [1, 0.325], [1, 0.645], [0, 0.685]],
  c: [[0, 0.705], [1, 0.665], [1, 1], [0, 1]],
};
const L = {
  a: [[0, 0], [0.505, 0], [0.485, 0.455], [0, 0.455]],
  b: [[0.52, 0], [1, 0], [1, 0.455], [0.5, 0.455]],
  c: [[0, 0.475], [1, 0.475], [1, 1], [0, 1]],
};
const CAP = {
  a: { l: 0.03, t: 0.02, w: 0.64 }, b: { r: 0.035, t: 0.38, w: 0.56 }, c: { l: 0.035, b: 0.035, w: 0.66 },
};
const CAPL = {
  a: { l: 0.015, t: 0.02, w: 0.3 }, b: { r: 0.015, t: 0.02, w: 0.3 }, c: { l: 0.02, b: 0.04, w: 0.36 },
};
const beat = (ep, k, text, o = {}) => ({
  img: `${ep}-${k}`, page: 0, text, poly: P[k], polyL: L[k], pos: o.pos || '50% 50%',
  from: k === 'a' ? [-0.6, -0.2, -3] : k === 'b' ? [0.8, 0, 4] : [0, 0.5, 0],
  cap: { ...CAP[k], kind: o.kind }, capL: { ...CAPL[k], kind: o.kind }, fx: o.fx, impact: o.impact, snd: o.snd,
});

export const EPISODES = [
  { id: 'prologue', n: 0, world: null, title: 'Prologue: The Stolen Light', git: 'git clone great-tree', thumb: 'ep0' },
  { id: 'meadow', n: 1, world: 'meadow', title: 'Golden Hour Meadow', git: 'git init sprout', thumb: 'ep1', beats: [
    beat('ep1', 'a', 'The storm scattered the sun-seeds into seven living paintings.', { fx: 'rays', pos: '50% 60%' }),
    beat('ep1', 'b', '"Hey! Not every critter here is friendly!"', { kind: 'say', fx: 'speed', impact: 1, snd: 'impact', pos: '60% 40%' }),
    beat('ep1', 'c', '"Every sun-seed I catch is a commit. On to the next painting!"', { kind: 'say', fx: 'glint', snd: 'resolve', pos: '45% 40%' }),
  ] },
  { id: 'starry', n: 2, world: 'starry', title: 'Starry River', git: 'git checkout -b starlight', thumb: 'ep2', beats: [
    beat('ep2', 'a', 'In the Starry River, the night sky itself swirls.', { fx: 'sun', pos: '50% 40%' }),
    beat('ep2', 'b', '"The safe sky... or the stars behind the thorns?"', { kind: 'say', fx: 'focus', impact: 2, snd: 'heart', pos: '55% 45%' }),
    beat('ep2', 'c', '"Why choose? FORK! Two branches, twice the light!"', { kind: 'say', fx: 'up', impact: 1, snd: 'zoom', pos: '50% 35%' }),
  ] },
  { id: 'fresco', n: 3, world: 'fresco', title: 'Fresco Cathedral', git: 'git merge starlight', thumb: 'ep3', beats: [
    beat('ep3', 'a', 'Under the painted dome, a sun-seed waits on high.', { fx: 'rays', pos: '50% 30%' }),
    beat('ep3', 'b', '"One branch alone can\u2019t break these thorns..."', { kind: 'say', fx: 'focus', snd: 'soft', pos: '50% 55%' }),
    beat('ep3', 'c', '"Then MERGE! Two branches braided into one!"', { kind: 'say', fx: 'speed', impact: 2, snd: 'impact', pos: '55% 45%' }),
  ] },
  { id: 'ukiyo', n: 4, world: 'ukiyo', title: 'Great Wave Cliffs', git: 'git revert HEAD', thumb: 'ep4', beats: [
    beat('ep4', 'a', 'At the cliffs, the Great Wave rose like a mountain.', { fx: 'rain', snd: 'storm', pos: '50% 45%' }),
    beat('ep4', 'b', '"My branch! The wave took it!"', { kind: 'say', fx: 'speed', impact: 2, snd: 'impact', pos: '55% 40%' }),
    beat('ep4', 'c', 'A lost branch is not the end. Revert, breathe, and grow again.', { fx: 'sun', snd: 'resolve', pos: '50% 40%' }),
  ] },
  { id: 'lilies', n: 5, world: 'lilies', title: 'Lily Garden', git: 'git stash', thumb: 'ep5', beats: [
    beat('ep5', 'a', 'A quiet pond. Time to rest, and count the light.', { fx: 'glint', snd: 'soft', pos: '45% 55%' }),
    beat('ep5', 'b', 'CROW: "Cute little sprout. Those seeds are MINE."', { kind: 'say', fx: 'focus', impact: 2, snd: 'heart', pos: '55% 35%' }),
    beat('ep5', 'c', '"Not for long, Crow!"', { kind: 'say', fx: 'up', impact: 1, snd: 'zoom', pos: '60% 40%' }),
  ] },
  { id: 'gilded', n: 6, world: 'gilded', title: 'Gilded Grove', git: 'git diff gold..light', thumb: 'ep6', beats: [
    beat('ep6', 'a', 'In the Gilded Grove, everything glitters.', { fx: 'sun', pos: '50% 40%' }),
    beat('ep6', 'b', '"Keep your gold, Crow. I only want the light."', { kind: 'say', fx: 'focus', snd: 'resolve', pos: '50% 40%' }),
    beat('ep6', 'c', 'Three branches, one target. The chase is on!', { fx: 'speed', impact: 1, snd: 'impact', pos: '50% 45%' }),
  ] },
  { id: 'lacquer', n: 7, world: 'lacquer', title: 'Lantern Village', git: 'git push origin dawn', thumb: 'ep7', beats: [
    beat('ep7', 'a', 'Lantern Village. The last climb to the treetop.', { fx: 'glint', snd: 'soft', pos: '50% 35%' }),
    beat('ep7', 'b', '"All my branches... MERGE!"', { kind: 'say', fx: 'up', impact: 2, snd: 'zoom', pos: '45% 50%' }),
    beat('ep7', 'c', 'Dawn came back to the Great Tree. Every commit led here.', { fx: 'sun', snd: 'dawn', pos: '50% 30%' }),
  ] },
];
export const EP_BY_WORLD = Object.fromEntries(EPISODES.filter((e) => e.world).map((e) => [e.world, e]));

/** Play one episode (or the prologue). Resolves when it ends or is skipped. */
export function playEpisode(id, { calm = false, sound = null } = {}) {
  const e = EPISODES.find((x) => x.id === id) || EPISODES[0];
  return new Promise((res) => {
    if (!e.beats) { playIntro({ calm, sound, onDone: (why) => res(why) }); return; }
    // warm the three panels before the title card lifts
    e.beats.forEach((b) => { const im = new Image(); im.decoding = 'async'; im.src = 'assets/story/ep/' + b.img + '.webp'; });
    playIntro({ calm, sound, beats: e.beats, base: 'assets/story/ep/', maxAspect: 1.62,
      ep: { kicker: `Episode ${e.n} of 7`, title: e.title, git: '$ ' + e.git, world: e.world }, onDone: (why) => res(why) });
  });
}

/** The Story gallery: every episode, all open (all maps are open). */
export function openStoryGallery({ seen = {}, calm = false, sound = null, onClose = () => {} } = {}) {
  return loadStoryCss().then(() => new Promise((res) => {
    const root = document.createElement('section');
    root.className = 'ep-gallery'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Story episodes');
    root.innerHTML = `<div class="epg-card"><header><h2>Story</h2><p>Sprout's quest to bring back the dawn, in 8 short episodes.</p><button class="epg-x" aria-label="Close">\u2715</button></header>
      <ol class="epg-list">${EPISODES.map((e) => `<li><button class="epg-ep" data-id="${e.id}"><img src="assets/story/ep/${e.thumb}-thumb.webp" alt="" loading="lazy" decoding="async" /><span class="epg-t"><small>${e.n ? 'Episode ' + e.n : 'Prologue'}${seen[e.id] ? ' \u00B7 watched' : ''}</small><b>${e.n ? e.title : 'The Stolen Light'}</b><code>$ ${e.git}</code></span></button></li>`).join('')}</ol></div>`;
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add('show'));
    const close = () => { root.remove(); onClose(); res(); };
    root.querySelector('.epg-x').addEventListener('click', (ev) => { ev.stopPropagation(); close(); });
    root.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.target === root) close(); });
    const onKey = (ev) => { if (ev.key === 'Escape' && document.body.contains(root) && !document.body.classList.contains('in-intro')) { removeEventListener('keydown', onKey); close(); } };
    addEventListener('keydown', onKey);
    root.querySelectorAll('.epg-ep').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation(); if (sound) sound.unlock();
      root.style.visibility = 'hidden';
      playEpisode(b.dataset.id, { calm, sound }).then(() => { seen[b.dataset.id] = 1; root.style.visibility = ''; });
    }));
  }));
}
