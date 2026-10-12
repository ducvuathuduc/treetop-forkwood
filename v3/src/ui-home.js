// Forkwood v3 HOME: the live demo run plays full screen behind a light menu. Three switchable
// layouts (?home=a|b|c, persisted in localStorage 'forkwood.home', Settings > Dev switches live):
//   a  Classic-plus  v1 layout (logo, big GROW, side buttons, 5 tabs); swipe or ‹ › changes world and
//                    the demo crossfades into it live while the vine keeps growing.
//   b  Seed picker   the worlds are seeds on a living branch at the bottom; tapping one makes the demo
//                    vine fork and grow into that world; GROW is a pod on a stem out of the branch.
//   c  World tree    the camera pulls back; the 7 worlds hang as fruit on the branches of a world-tree
//                    whose trunk rises from GROW; the title is written by a vine. Tap a branch: the
//                    camera dips back and zooms into that world.
// The demo itself lives in main.js (bot + sim); this module only talks to it through `demo`
// ({ fork(), cam({scale, anchor}), worldNow() }) and the hub's chooseWorld().
import { WORLDS, WORLD } from './worlds-meta.js';
import * as SS from './store-state.js';
import { MAP_PRICE } from './economy.js';
import { MI, paintingSrc, underpainting } from './ui-art.js';

export const HOMES = ['a', 'b', 'c'];
export const HOME_NAMES = { a: 'Classic', b: 'Seeds', c: 'World tree' };
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
export const CAMS = { a: { scale: 0.9, anchor: 0.62 }, b: { scale: 0.86, anchor: 0.52 }, c: { scale: 0.74, anchor: 0.4 } };

const SPROUT = '<svg class="logo-sprout" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38V20" stroke="#2f6b33" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M20 22C12 22 7 16 7 8c8 0 13 6 13 14z" fill="#7cc46a" stroke="#1E2A1C" stroke-width="1.6"/><path d="M20 18c0-8 5-13 13-13 0 8-5 13-13 13z" fill="#a6dd7c" stroke="#1E2A1C" stroke-width="1.6"/></svg>';
const acorns = (n) => `<span class="price">${MI.acorn}${n.toLocaleString('en-US')}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// V3.1: the painted world tree (assets/v3/home/wtree-*.webp, 900×696): medallions sit on its seven
// foliage clusters, in % of the art box; fireflies drift around the crown
const TREE_PCT = [[9.5, 58], [16, 32.5], [27.5, 17.5], [46.8, 9], [69, 15], [84, 32.5], [90.5, 58.5]];
const TREE_ART = new URL('../assets/v3/home/', import.meta.url).href;
const FIREFLIES = [[22, 44, 0], [36, 28, 1.3], [58, 22, 2.1], [74, 40, 0.6], [12, 70, 3.2], [88, 72, 1.8], [50, 46, 2.7], [64, 60, 4.1], [30, 62, 3.6], [80, 18, 0.9]];
export function createHome(H) {
  const title = document.getElementById('title');
  const art = document.getElementById('hub-art');
  const pick = document.getElementById('home-pick');
  const logo = document.getElementById('home-logo');
  const wname = document.getElementById('home-world');
  let variant = readHome(), shown = null, busy = 0, booted = false;

  // landscape: the tree sits mid-screen, so the vine tip rides higher
  const cams = () => { const c = { ...CAMS[variant] }; if (variant === 'c' && innerWidth > innerHeight) c.anchor = 0.3; return c; };
  const owns = (id) => SS.ownsWorld(H.getSave(), id);
  const thumb = (id) => `<img alt="" decoding="async" ${booted ? 'src' : 'data-src'}="${paintingSrc(id, true)}">`;

  function renderLogo() {
    if (variant === 'c') {
      // the vine writes the title: stroke draws on, then the fill and a leaf bud arrive
      logo.innerHTML = `<svg class="logo-write" viewBox="0 0 520 120" role="img" aria-label="Forkwood"><text x="260" y="88" text-anchor="middle">Forkwood</text><path class="logo-tendril" d="M30 102 C 120 116 200 92 260 104 S 420 112 492 96" /></svg>`;
      title.classList.remove('wrote'); void logo.offsetWidth; requestAnimationFrame(() => title.classList.add('wrote'));
    } else logo.innerHTML = `<svg class="logo-write" viewBox="0 0 520 120" role="img" aria-label="Forkwood"><text x="260" y="88" text-anchor="middle">Forkwood</text><path class="logo-tendril" d="M30 102 C 120 116 200 92 260 104 S 420 112 492 96" />${SPROUT.replace('class="logo-sprout"', 'class="logo-sprout" x="470" y="40" width="44" height="44"')}</svg>`;
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
      pick.innerHTML = '';
      const nextLocked = (WORLDS.find((w) => !owns(w.id)) || {}).id; // only the next unlock shows its price
      art.innerHTML = `<div class="wtree" role="tablist" aria-label="Worlds">
        <img class="wtree-art" alt="" decoding="async" ${booted ? '' : 'fetchpriority="high"'} src="${TREE_ART}wtree-560.webp" srcset="${TREE_ART}wtree-560.webp 560w, ${TREE_ART}wtree-900.webp 900w" sizes="(min-width: 900px) min(760px, 60vw), 92vw">
        <div class="wtree-ff" aria-hidden="true">${FIREFLIES.map(([x, y, d]) => `<i style="--x:${x}%;--y:${y}%;--d:${d}s"></i>`).join('')}</div>
        ${WORLDS.map((w, i) => { const own = owns(w.id); return `<button role="tab" class="fruit ${w.id === id ? 'on' : ''} ${own ? '' : 'locked'}" data-w="${w.id}" style="--x:${TREE_PCT[i][0]}%;--y:${TREE_PCT[i][1]}%;--i:${i};background:${underpainting(w.id)}" aria-label="${esc(w.name)}${own ? '' : ': locked, ' + (MAP_PRICE[w.legacy] || 0) + ' acorns'}" aria-selected="${w.id === id}"><span class="fruit-pic">${thumb(w.id)}</span>${own ? '' : `<span class="seed-lock">${MI.lock}</span>${w.id === nextLocked ? `<span class="fruit-price">${acorns(MAP_PRICE[w.legacy] || 0)}</span>` : ''}`}</button>`; }).join('')}
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
