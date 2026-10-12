// Forkwood v3 HOME: the live demo run plays full screen behind a light menu. Three switchable
// layouts (?home=a|b|c, persisted in localStorage 'forkwood.home', Settings > Dev switches live):
//   a  Classic-plus  v1 layout (logo, big GROW, side buttons, 5 tabs); swipe or ‹ › changes world and
//                    the demo crossfades into it live while the vine keeps growing.
//   b  Seed picker   the worlds are seeds on a living branch at the bottom; tapping one makes the demo
//                    vine fork and grow into that world; GROW is a pod on a stem out of the branch.
//   c  World branch  (V3.2) the 7 worlds hang as gilded medallions on a living branch in a low dock
//                    above GROW, leaving the middle of the screen to the demo run; the title is written
//                    by a vine. Tap a medallion: the camera dips back and zooms into that world.
// The demo itself lives in main.js (bot + sim); this module only talks to it through `demo`
// ({ fork(), cam({scale, anchor}), worldNow() }) and the hub's chooseWorld().
import { WORLDS, WORLD } from './worlds-meta.js';
import * as SS from './store-state.js';
import { MAP_PRICE } from './economy.js';
import { MI, paintingSrc, underpainting } from './ui-art.js';

export const HOMES = ['a', 'b', 'c'];
export const HOME_NAMES = { a: 'Classic', b: 'Seeds', c: 'World branch' };
export const DEFAULT_HOME = 'c';
const KEY = 'forkwood.home';
export function readHome() {
  try {
    const u = new URLSearchParams(location.search).get('home');
    if (HOMES.includes(u)) { localStorage.setItem(KEY, u); return u; }
    const s = localStorage.getItem(KEY);
    if (HOMES.includes(s)) return s;
  } catch { /* private mode */ }
  return DEFAULT_HOME;
}
// demo camera per layout: scale (× base) and anchor (screen fraction the vine tip sits at)
// V3.2 c: the vine tip rides in the open middle band between the title and the branch dock
export const CAMS = { a: { scale: 0.9, anchor: 0.62 }, b: { scale: 0.86, anchor: 0.52 }, c: { scale: 0.95, anchor: 0.42 } };

const acorns = (n) => `<span class="price">${MI.acorn}${n.toLocaleString('en-US')}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createHome(H) {
  const title = document.getElementById('title');
  const art = document.getElementById('hub-art');
  const pick = document.getElementById('home-pick');
  const logo = document.getElementById('home-logo');
  const wname = document.getElementById('home-world');
  let variant = readHome(), shown = null, busy = 0, booted = false;

  // landscape: the tree sits mid-screen, so the vine tip rides higher
  const cams = () => { const c = { ...CAMS[variant] }; if (variant === 'c' && innerWidth > innerHeight) { c.anchor = 0.4; c.scale = 1.0; } return c; };
  const owns = (id) => SS.ownsWorld(H.getSave(), id);
  const thumb = (id) => `<img alt="" decoding="async" ${booted ? 'src' : 'data-src'}="${paintingSrc(id, true)}">`;

  // V3.2: the title is set in Sansita Swashed (organic swash display); a vine twines under it, curls up
  // at both ends and puts out a few leaves and a bud. Same markup for every layout.
  const VINE = '<g class="logo-vine"><path class="logo-tendril" d="M44 128 C 10 124 8 96 30 92 C 44 90 48 104 38 108 M44 128 C 150 140 240 116 300 126 S 450 138 512 118 C 540 110 548 86 530 80 C 516 76 512 92 522 96"/>'
    + '<path class="logo-leaf" d="M118 133 q -6 -20 14 -26 q 2 18 -14 26z"/><path class="logo-leaf" d="M214 126 q 10 18 30 12 q -10 -18 -30 -12z"/><path class="logo-leaf" d="M352 131 q -4 -20 16 -24 q 0 18 -16 24z"/><path class="logo-leaf" d="M446 130 q 12 16 30 8 q -12 -16 -30 -8z"/>'
    + '<circle class="logo-bud" cx="528" cy="84" r="5"/></g>';
  function renderLogo() {
    logo.innerHTML = `<svg class="logo-write" viewBox="0 0 560 150" role="img" aria-label="Forkwood"><text x="280" y="104" text-anchor="middle">Forkwood</text>${VINE}</svg>`;
    title.classList.remove('wrote'); void logo.offsetWidth; requestAnimationFrame(() => title.classList.add('wrote'));
  }
  function renderName(id) {
    const w = WORLD[id];
    wname.innerHTML = `<b>${esc(w.name)}</b><span lang="vi">${esc(w.nameVi)}</span>`;
  }
  function renderStage(id) {
    const S = H.getSave();
    if (variant === 'a') {
      art.innerHTML = '';
      const owned = WORLDS.filter((w) => owns(w.id));
      pick.innerHTML = `<div class="ws-row"><button class="ws-nav l" data-step="-1" aria-label="Previous world">${MI.left}</button>
        <button class="ws-name" data-gallery aria-label="All worlds"><b>${esc(WORLD[id].name)}</b><span lang="vi">${esc(WORLD[id].nameVi)}</span></button>
        <button class="ws-nav r" data-step="1" aria-label="Next world">${MI.right}</button></div>
        <div class="ws-dots" role="tablist" aria-label="Worlds">${WORLDS.map((w) => `<button role="tab" class="ws-dot ${w.id === id ? 'on' : ''} ${owns(w.id) ? '' : 'locked'}" data-w="${w.id}" aria-label="${esc(w.name)}${owns(w.id) ? '' : ' (locked)'}" aria-selected="${w.id === id}"></button>`).join('')}</div>`;
      pick.dataset.owned = owned.length;
    } else if (variant === 'b') {
      art.innerHTML = '';
      const n = WORLDS.length;
      const pts = WORLDS.map((w, i) => [110 + (i / (n - 1)) * 780, 56 + (i % 2 ? -1 : 1) * 15]);
      let d = `M-20 ${pts[0][1] + 18}`;
      for (let i = 0; i < n; i++) { const [x, y] = pts[i]; const px = i ? pts[i - 1][0] : -20; d += ` Q ${(px + x) / 2} ${y + (i % 2 ? -26 : 26)} ${x} ${y}`; }
      d += ` Q 1010 ${pts[n - 1][1] - 20} 1030 ${pts[n - 1][1] - 10}`;
      pick.innerHTML = `<div class="branch"><svg class="branch-svg" viewBox="0 0 1000 110" preserveAspectRatio="none" aria-hidden="true"><path class="br-shadow" d="${d}"/><path class="br-wood" d="${d}"/>${pts.map(([x, y], i) => `<path class="br-leaf" d="M${x} ${y} q ${i % 2 ? 22 : -22} -30 ${i % 2 ? 44 : -44} -18 q ${i % 2 ? -18 : 18} 14 ${i % 2 ? -44 : 44} 18z" />`).join('')}</svg>
        <div class="seeds" role="tablist" aria-label="Worlds">${WORLDS.map((w, i) => { const own = owns(w.id); return `<button role="tab" class="seed ${w.id === id ? 'on' : ''} ${own ? '' : 'locked'}" data-w="${w.id}" style="--x:${(pts[i][0] / 10).toFixed(2)}%;--y:${pts[i][1].toFixed(1)}%;background:${underpainting(w.id)}" aria-label="${esc(w.name)}${own ? '' : ': locked, ' + (MAP_PRICE[w.legacy] || 0) + ' acorns'}" aria-selected="${w.id === id}"><span class="seed-pic">${thumb(w.id)}</span>${own ? '' : `<span class="seed-lock">${MI.lock}</span>`}</button>`; }).join('')}</div></div>
        <p class="seed-cap"><b>${esc(WORLD[id].name)}</b><span lang="vi">${esc(WORLD[id].nameVi)}</span></p>`;
    } else {
      // V3.2: the world tree became a living branch in a low dock above GROW, so the demo run plays
      // unobstructed in the middle of the screen. Medallions hang off the branch; the chosen one swells.
      art.innerHTML = '';
      const nextLocked = (WORLDS.find((w) => !owns(w.id)) || {}).id; // only the next unlock shows its price
      const n = WORLDS.length;
      const pts = WORLDS.map((w, i) => [80 + (i / (n - 1)) * 840, i % 2 ? 40 : 56]);
      let d = 'M-10 64';
      for (let i = 0; i < n; i++) { const [x, y] = pts[i]; const px = i ? pts[i - 1][0] : -10; d += ` Q ${((px + x) / 2).toFixed(1)} ${i % 2 ? 22 : 76} ${x.toFixed(1)} ${y}`; }
      d += ' Q 980 30 1010 46';
      const leaves = pts.slice(0, -1).map(([x, y], i) => { const mx = (x + pts[i + 1][0]) / 2, my = (y + pts[i + 1][1]) / 2 + (i % 2 ? 9 : -9), s = i % 2 ? 1 : -1; return `<path class="wb-leaf" d="M${mx.toFixed(1)} ${my.toFixed(1)} q ${-8} ${s * 18} 8 ${s * 26} q 6 ${-s * 14} -8 ${-s * 26}z"/>`; }).join('');
      pick.innerHTML = `<p class="wb-cap"><b>${esc(WORLD[id].name)}</b><span lang="vi">${esc(WORLD[id].nameVi)}</span></p><div class="wbranch" role="tablist" aria-label="Worlds">
        <svg class="wb-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="wb-shadow" d="${d}"/><path class="wb-wood" d="${d}"/><path class="wb-hi" d="${d}"/>${leaves}</svg>
        ${WORLDS.map((w, i) => { const own = owns(w.id); return `<button role="tab" class="fruit ${w.id === id ? 'on' : ''} ${own ? '' : 'locked'}" data-w="${w.id}" style="--x:${(pts[i][0] / 10).toFixed(1)}%;--y:${pts[i][1]}%;--i:${i};background:${underpainting(w.id)}" aria-label="${esc(w.name)}${own ? '' : ': locked, ' + (MAP_PRICE[w.legacy] || 0) + ' acorns'}" aria-selected="${w.id === id}"><span class="fruit-pic">${thumb(w.id)}</span>${own ? '' : w.id === nextLocked ? `<span class="fruit-price">${MI.lock}${acorns(MAP_PRICE[w.legacy] || 0)}</span>` : `<span class="seed-lock">${MI.lock}</span>`}</button>`; }).join('')}
      </div>`;
    }
    void S;
  }
  function render(force) {
    const id = H.currentWorld();
    title.dataset.home = variant;
    document.body.dataset.home = variant;
    if (!force && shown === id) return;
    const first = shown === null || force;
    shown = id;
    if (first) { renderLogo(); title.classList.add('fresh'); clearTimeout(render.t); render.t = setTimeout(() => title.classList.remove('fresh'), 2600); }
    renderName(id);
    renderStage(id);
    if (first) H.demo.cam(cams(), true);
  }
  function setVariant(v) {
    if (!HOMES.includes(v)) return;
    variant = v; try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    render(true);
  }

  // ------------------------------------------------------------ world changes
  /** Pick a world from the home layout: owned -> live switch with the layout's move; locked -> worlds room. */
  function pickWorld(id) {
    if (!WORLD[id]) return;
    if (!owns(id)) { H.openRoom('gallery', { focus: id }); return; }
    if (id === H.currentWorld()) { if (variant !== 'a') H.motion.popIn(title.querySelector(`[data-w="${id}"]`)); return; }
    const t = ++busy;
    if (variant === 'b') {
      // the vine forks toward the seed, then the world fades in around it
      H.demo.fork();
      markOn(id);
      setTimeout(() => { if (t === busy) H.chooseWorld(id); }, 260);
    } else if (variant === 'c') {
      // camera dips back to the whole tree, then zooms into the chosen branch
      H.demo.cam({ scale: cams().scale * 0.72, anchor: cams().anchor - 0.05 });
      markOn(id);
      setTimeout(() => { if (t === busy) H.chooseWorld(id); }, 320);
      setTimeout(() => { if (t === busy) H.demo.cam({ scale: cams().scale * 1.12, anchor: cams().anchor + 0.05 }); }, 700);
      setTimeout(() => { if (t === busy) H.demo.cam(cams()); }, 1500);
    } else H.chooseWorld(id);
    if (H.sound.page) H.sound.page();
  }
  function markOn(id) { title.querySelectorAll('[data-w]').forEach((b) => { const on = b.dataset.w === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); }
  function step(d) {
    const owned = WORLDS.filter((w) => owns(w.id));
    if (owned.length < 2) { H.openRoom('gallery', {}); return; }
    const i = owned.findIndex((w) => w.id === H.currentWorld());
    pickWorld(owned[(i + d + owned.length) % owned.length].id);
  }
  title.addEventListener('click', (e) => {
    const s = e.target.closest('[data-step]');
    if (s) { e.stopPropagation(); step(+s.dataset.step); return; }
    const w = e.target.closest('[data-w]');
    if (w) { e.stopPropagation(); pickWorld(w.dataset.w); return; }
    if (e.target.closest('[data-gallery]')) { e.stopPropagation(); H.openRoom('gallery', {}); }
  });
  function boot() { booted = true; title.querySelectorAll('img[data-src]').forEach((im) => { im.src = im.dataset.src; im.removeAttribute('data-src'); }); }

  return { render, setVariant, step, pickWorld, boot, get variant() { return variant; } };
}
