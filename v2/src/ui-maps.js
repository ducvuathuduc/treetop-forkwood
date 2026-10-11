// P8-MAPS: the title's Map chip. Shows the chosen map; the carousel itself
// (ui-maps-panel.js + skins-maps.js) loads on first tap so it costs nothing at boot.
import { MAP, selectedId, onChange } from './maps.js';
import { backdrop } from './backdrop.js';

/** v1.0: fetch a stylesheet once; resolves when it is applied (or failed). */
const cssLoads = {};
export function loadCss(href) {
  return cssLoads[href] || (cssLoads[href] = new Promise((res) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.onload = () => res(); l.onerror = () => res();
    document.head.appendChild(l);
  }));
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createMapsUI(opts = {}) {
  const actions = document.querySelector('#title .title-actions');
  const play = document.getElementById('btn-play');
  const chip = document.createElement('button');
  chip.id = 'btn-maps'; chip.className = 'map-chip'; chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog');
  if (actions && play) actions.insertBefore(chip, play.nextSibling);
  let panel = null, loading = null;
  function refreshChip() {
    const m = MAP[selectedId()];
    chip.innerHTML = `<span class="mc-sw" style="background:linear-gradient(160deg,${m.swatch[0]},${m.swatch[1]} 70%,${m.swatch[2]})"></span><span class="mc-l">Map</span><b>${esc(m.name)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
    chip.setAttribute('aria-label', `Map: ${m.name}. Choose a map`);
  }
  function show() {
    if (panel) return panel.show();
    if (!loading) loading = Promise.all([import('./ui-maps-panel.js'), loadCss('maps.css')]).then(([M]) => { panel = M.createMapsPanel({ ...opts, refreshChip }); return panel; });
    return loading.then((p) => p.show());
  }
  chip.addEventListener('click', (e) => { e.stopPropagation(); show(); });
  onChange(() => { refreshChip(); if (!(panel && panel.open)) backdrop.setMap(MAP[selectedId()]); });
  refreshChip();
  backdrop.setMap(MAP[selectedId()]);
  return { show, hide: () => panel && panel.hide(), refresh: refreshChip, get open() { return !!(panel && panel.open); } };
}
