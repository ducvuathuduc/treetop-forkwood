// Forkwood 2.0 META: UI art registry. Every picture the menus show is looked up by
// a registry id (`meadow.ui.painting`, `ui.icon.pass`, `ui.frame.gilt` ...). ART fills
// assets/v2/registry.json; until an id exists there, a placeholder is used:
//   paintings -> downscaled v13 concept paintings in assets/meta/paintings/ (own-made),
//                drawn over a CSS "underpainting" gradient of the world's tones
//   icons     -> inline vector line icons below (own-made)
//   frames    -> CSS gilt frame + inline SVG corner ornaments (own-made)
// Swapping in final art = adding the id to the registry; no UI code changes.
import { WORLD, paintingId } from './worlds-meta.js';

const PLACEHOLDER_PAINTING = (id, small) => `assets/v2/${id}/ui/${id}.ui.painting${small ? '.s' : ''}.webp`; // V2-INT: same files ART's registry lists
let REG = null, regLoading = null;
/** Load ART's registry once (optional; missing file = placeholders). */
export function loadRegistry() {
  if (REG || regLoading) return regLoading || Promise.resolve(REG);
  // opt-in until ART's registry ships (a 404 would be a console error): <meta name="art-registry" content="assets/v2/registry.json">
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="art-registry"]');
  if (!meta) { REG = {}; return Promise.resolve(REG); }
  regLoading = fetch(meta.content || 'assets/v2/registry.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list) => {
    REG = Object.fromEntries((Array.isArray(list) ? list : []).filter((e) => e && e.id && e.file).map((e) => [e.id, e]));
    return REG;
  });
  return regLoading;
}
export const regFile = (id) => (REG && REG[id] ? 'assets/v2/' + REG[id].file : null); // V2-INT: registry paths are relative to assets/v2/
/** Image url for a world's framed painting (small = gallery thumbnail). */
export function paintingSrc(worldId, small = false) {
  const f = regFile(paintingId(worldId) + (small ? '.s' : '')) || regFile(paintingId(worldId));
  return f || PLACEHOLDER_PAINTING(worldId, small);
}
/** CSS underpainting shown before (or instead of) the image: crisp gradient bands, no blur. */
export function underpainting(worldId) {
  const t = (WORLD[worldId] || WORLD.meadow).tones;
  return `linear-gradient(178deg, ${t[0]} 0%, ${t[1]} 34%, ${t[2]} 68%, ${t[3]} 100%)`;
}

// ------------------------------------------------------------------ icons (24px grid, 1.8 stroke, round caps)
const sv = (d, cls = '') => `<svg class="mi ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const MI = {
  acorn: sv('<path d="M4.5 10c0-3.3 3.4-5.5 7.5-5.5s7.5 2.2 7.5 5.5z" fill="currentColor" fill-opacity=".28"/><path d="M6 10c.3 5.8 2.8 9.6 6 11 3.2-1.4 5.7-5.2 6-11"/><path d="M12 4.5c0-1.2.6-2.2 1.8-2.6"/>', 'mi-acorn'),
  gem: sv('<path d="M12 2.8c3.5 4.5 6.3 8.1 6.3 11.4a6.3 6.3 0 0 1-12.6 0C5.7 10.9 8.5 7.3 12 2.8z" fill="currentColor" fill-opacity=".3"/><path d="M9.3 14.6a2.9 2.9 0 0 0 2.5 2.8"/>', 'mi-gem'),
  plus: sv('<path d="M12 6v12M6 12h12"/>'),
  shop: sv('<path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8z"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>'),
  grove: sv('<path d="M12 21v-7"/><path d="M12 14c-4.4 0-7-2.7-7-6.3C5 4.6 8 3 12 3s7 1.6 7 4.7C19 11.3 16.4 14 12 14z"/><path d="M9 21h6"/>'),
  play: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z" fill="currentColor"/></svg>',
  pass: sv('<path d="M5 4h14v16l-7-3.5L5 20z"/><path d="M9 9.5l2 2 4-4"/>'),
  league: sv('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4.5v1A3.5 3.5 0 0 0 8 10.5M17 6h2.5v1A3.5 3.5 0 0 1 16 10.5"/><path d="M12 13v4M8.5 20h7M10 17h4v3h-4z"/>'),
  gift: sv('<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-2.5 0-4.5-1-4.5-2.7S9.6 3.5 12 9c2.4-5.5 4.5-4.4 4.5-2.7S14.5 9 12 9z"/>'),
  calendar: sv('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M9 14.5l2 2 4-4"/>'),
  map: sv('<path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/>'),
  live: sv('<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'),
  clock: sv('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
  close: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: sv('<path d="M15 5l-7 7 7 7"/>'),
  left: sv('<path d="M14.5 6 8.5 12l6 6"/>'),
  right: sv('<path d="M9.5 6l6 6-6 6"/>'),
  lock: sv('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  tick: sv('<path d="M5 12.5l4.2 4.2L19 7"/>'),
  info: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/><circle cx="12" cy="12" r="6.5"/>'),
  ad: sv('<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M10 9.5v5l4.3-2.5z" fill="currentColor"/>'),
  pod: sv('<path d="M12 3c4.5 2.5 7 6.2 7 10a7 7 0 0 1-14 0c0-3.8 2.5-7.5 7-10z"/><path d="M12 7v12M8.5 11.5 12 14l3.5-2.5"/>'),
  vine: sv('<path d="M12 21c0-5 1-8 4-11"/><path d="M12 21c0-4-1.5-6.5-4.5-9"/><path d="M16 10c2.6-.2 4-1.6 4.5-4-2.5.1-4 1.4-4.5 4zM7.5 12c-2.6-.1-4-1.4-4.6-3.8 2.5 0 4 1.3 4.6 3.8z"/>'),
  critter: sv('<path d="M5 15c0-4.4 3.1-8 7-8s7 3.6 7 8"/><path d="M5 15h14l-1.5 3.5h-11z"/><circle cx="9.5" cy="11.5" r=".9" fill="currentColor"/><path d="M15 9.5l3-3"/>'),
  skill: sv('<path d="M13 3 6 13.5h5.2L10 21l8-11h-5.4z"/>'),
  up: sv('<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5"/><path d="M6 20h12"/>'),
  story: sv('<path d="M4 5.5C6.8 4.4 9.4 4.6 12 6.5c2.6-1.9 5.2-2.1 8-1v13c-2.8-1.1-5.4-.9-8 1-2.6-1.9-5.2-2.1-8-1z"/><path d="M12 6.5v13"/>'),
  sound: sv('<path d="M11 5 6.5 8.5H4v7h2.5L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'),
  star: '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3.1-5.4 3.1 1.2-6L3.3 9.5l6.1-.7z" fill="currentColor"/></svg>',
  restore: sv('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
};

// carved gilt corner ornament (acanthus scroll), mirrored per corner by CSS
const CORNER = '<svg class="fr-corner" viewBox="0 0 40 40" aria-hidden="true"><path d="M2 38V14C2 7 7 2 14 2h24" fill="none" stroke="url(#mz-gold)" stroke-width="3.2"/><path d="M8 34V16c0-4.5 3.5-8 8-8h18" fill="none" stroke="#6b4a18" stroke-width="1.2" opacity=".7"/><path d="M5 5c6 .5 9.5 4 10 10-4.5-1.2-8.3-4.8-10-10z" fill="url(#mz-gold)" stroke="#6b4a18" stroke-width=".8"/><circle cx="14.5" cy="14.5" r="2.4" fill="#fff1bf" stroke="#6b4a18" stroke-width=".8"/></svg>';
/** Shared SVG gradient defs (once per document). */
export function ensureDefs() {
  if (typeof document === 'undefined' || document.getElementById('mz-defs')) return;
  const d = document.createElement('div');
  d.id = 'mz-defs'; d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = '<svg width="0" height="0"><defs><linearGradient id="mz-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b5"/><stop offset=".35" stop-color="#e2b04f"/><stop offset=".7" stop-color="#a87526"/><stop offset="1" stop-color="#f3d27a"/></linearGradient></defs></svg>';
  document.body.appendChild(d);
}
/**
 * A framed painting: gilt moulding, linen liner, the picture, four carved corners.
 * opts: { small, locked, lazy, alt }
 */
export function frameHTML(worldId, opts = {}) {
  const w = WORLD[worldId] || WORLD.meadow;
  const src = paintingSrc(w.id, !!opts.small);
  return `<div class="frame gilt ${opts.small ? 'frame-s' : 'frame-l'} ${opts.locked ? 'locked' : ''}" data-world="${w.id}" data-art="${paintingId(w.id)}">
    <div class="fr-liner"><div class="fr-canvas" style="background-image:${underpainting(w.id)}"><img ${opts.defer ? `data-src="${src}"` : `src="${src}"`} alt="${opts.alt || w.name + ', ' + w.medium}" ${opts.lazy ? 'loading="lazy"' : ''} decoding="async" draggable="false" onload="this.classList.add('in')" onerror="this.remove()"></div></div>
    ${CORNER.replace('fr-corner', 'fr-corner tl')}${CORNER.replace('fr-corner', 'fr-corner tr')}${CORNER.replace('fr-corner', 'fr-corner bl')}${CORNER.replace('fr-corner', 'fr-corner br')}
    ${opts.locked ? `<span class="fr-rope" aria-hidden="true"></span>` : ''}
  </div>`;
}
/** Museum wall label for a world. */
export function labelHTML(worldId, extra = '') {
  const w = WORLD[worldId] || WORLD.meadow;
  return `<div class="mlabel"><b class="ml-name">${w.name}</b><i class="ml-vi" lang="vi">${w.nameVi}</i><span class="ml-medium">${w.medium}</span><small class="ml-room">${w.room} · ${w.year}</small>${extra}</div>`;
}
/** Start deferred picture loads (hero painting waits for the first frame; budget). */
export function wakeImages(root = document) { root.querySelectorAll('img[data-src]').forEach((im) => { im.src = im.dataset.src; im.removeAttribute('data-src'); }); }
