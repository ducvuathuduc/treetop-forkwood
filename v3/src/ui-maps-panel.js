// P8-MAPS: map select carousel (loaded on first tap of the title's Map chip,
// see ui-maps.js). A glass carousel; each
// slide previews the map's own plates, and swiping also re-themes the live
// scene behind the veil. Locked maps show their price; buying is the econ
// integrator's job: we dispatch `forkwood:map-unlock` ({ id, cost }) on window
// and re-render when maps.onChange fires (after setOwnership / grantMap).
import { MAPS, MAP, isUnlocked, selectedId, select, onChange } from './maps.js';
import { skinsForMap } from './skins-maps.js';
import { backdrop } from './backdrop.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plate = (m, l) => `assets/art/${m.plates ? `m-${l}-${m.plates}` : `w-${l}-meadow`}.webp`;
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const ACORN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10h12M7 10c0 6 2.5 9 5 10 2.5-1 5-4 5-10"/><path d="M6 10c0-3 3-5 6-5s6 2 6 5"/></svg>';

export function createMapsPanel(opts = {}) {
  const sound = opts.sound || null;
  const refreshChip = opts.refreshChip || (() => {});
  // the overlay
  const sec = document.createElement('section');
  sec.id = 'maps'; sec.className = 'overlay'; sec.setAttribute('aria-label', 'Choose a map'); sec.setAttribute('role', 'dialog');
  sec.innerHTML = `<div class="maps-panel">
      <header class="maps-head"><div><p class="kicker">Maps</p><h2>Where will you grow?</h2></div>
        <button class="icon maps-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
      <div class="maps-track" tabindex="0" aria-roledescription="carousel"></div>
      <div class="maps-nav"><button class="icon maps-prev" type="button" aria-label="Previous map"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="maps-dots" role="tablist"></div>
        <button class="icon maps-next" type="button" aria-label="Next map"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>
      <p class="maps-looks" aria-live="polite"></p>
      <button class="btn primary maps-go" type="button"></button>
    </div>`;
  document.body.appendChild(sec);
  const track = sec.querySelector('.maps-track'), dots = sec.querySelector('.maps-dots');
  const go = sec.querySelector('.maps-go'), looks = sec.querySelector('.maps-looks');
  let idx = 0, open = false;

  function slides() {
    track.innerHTML = MAPS.map((m, i) => {
      const un = isUnlocked(m.id), sel = selectedId() === m.id;
      return `<article class="map-card ${un ? '' : 'locked'} ${sel ? 'sel' : ''}" data-i="${i}" aria-label="${esc(m.name)}">
        <div class="map-art" data-src="${i}" style="--sw0:${m.swatch[0]};--sw1:${m.swatch[1]};--sw2:${m.swatch[2]}"></div>
        <div class="map-info">
          <p class="map-where">${PIN}${esc(m.place)}${m.country && m.country !== m.place ? ` · ${esc(m.country)}` : ''}</p>
          <h3>${esc(m.name)}</h3>
          ${m.tale ? `<p class="map-tale">${esc(m.tale)}</p>` : ''}
          <p class="map-flav">${esc(m.flavour)}</p>
          ${m.world ? '' : `<p class="map-zones">${(m.zones || ['Meadow', 'Oak forest', 'Snowy pines', 'Storm canopy', 'Starry sky']).map(esc).join('<i></i>')}</p>`}
        </div>
        <span class="map-badge">${sel ? 'Selected' : un ? 'Unlocked' : `${LOCK}${m.unlock.cost ? `${ACORN}${m.unlock.cost}` : m.unlock.level ? `Level ${m.unlock.level}` : 'Locked'}`}</span>
      </article>`;
    }).join('');
    dots.innerHTML = MAPS.map((m, i) => `<button role="tab" type="button" aria-label="${esc(m.name)}" data-i="${i}"></button>`).join('');
  }
  // load a slide's plates only when it is near the view
  function hydrate(i) {
    for (const k of [i - 1, i, i + 1]) {
      const el = track.querySelector(`.map-art[data-src="${k}"]`);
      if (!el || el.dataset.ok) continue;
      const m = MAPS[k];
      el.style.backgroundImage = m.painting ? `url(${m.painting})` : `url(${plate(m, 'side')}), url(${plate(m, 'far')}), url(${plate(m, 'sky')})`; // V2-INT: the world's painting
      el.dataset.ok = '1';
    }
  }
  function setIdx(i, scroll = true) {
    idx = Math.max(0, Math.min(MAPS.length - 1, i));
    const m = MAPS[idx];
    [...dots.children].forEach((d, k) => d.setAttribute('aria-selected', k === idx ? 'true' : 'false'));
    [...track.children].forEach((c, k) => c.classList.toggle('on', k === idx));
    hydrate(idx);
    if (scroll) { const c = track.children[idx]; if (c) track.scrollTo({ left: c.offsetLeft - (track.clientWidth - c.clientWidth) / 2, behavior: 'smooth' }); }
    const un = isUnlocked(m.id);
    go.classList.toggle('locked', !un);
    go.innerHTML = selectedId() === m.id ? 'Grow here' : un ? `Choose ${esc(m.name)}` : `${LOCK}<span>Unlock${m.unlock.cost ? ` · ${m.unlock.cost} acorns` : m.unlock.level ? ` at level ${m.unlock.level}` : ''}</span>`;
    const sk = skinsForMap(m.id);
    looks.innerHTML = sk.length ? `Matching looks: ${sk.map((s) => esc(s.name)).join(' · ')}` : 'The original Forkwood climb.';
    backdrop.preloadMap(m);
    backdrop.setMap(m); // live preview behind the veil
  }
  function show() {
    open = true; slides();
    sec.classList.add('show'); document.body.classList.add('maps-open');
    const i = MAPS.findIndex((m) => m.id === selectedId());
    requestAnimationFrame(() => { setIdx(i, false); const c = track.children[i]; if (c) track.scrollLeft = c.offsetLeft - (track.clientWidth - c.clientWidth) / 2; track.focus({ preventScroll: true }); });
    if (sound && sound.page) sound.page();
  }
  function hide() {
    open = false; sec.classList.remove('show'); document.body.classList.remove('maps-open');
    backdrop.setMap(MAP[selectedId()]); // restore the chosen map
    refreshChip();
  }
  // events
  sec.querySelector('.maps-x').addEventListener('click', (e) => { e.stopPropagation(); hide(); });
  sec.addEventListener('click', (e) => { if (e.target === sec) hide(); });
  sec.querySelector('.maps-prev').addEventListener('click', (e) => { e.stopPropagation(); setIdx(idx - 1); });
  sec.querySelector('.maps-next').addEventListener('click', (e) => { e.stopPropagation(); setIdx(idx + 1); });
  dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { e.stopPropagation(); setIdx(+b.dataset.i); } });
  track.addEventListener('click', (e) => { const c = e.target.closest('.map-card'); if (c && +c.dataset.i !== idx) { e.stopPropagation(); setIdx(+c.dataset.i); } });
  let st = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => {
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0, bd = 1e9;
      [...track.children].forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid); if (d < bd) { bd = d; best = k; } });
      if (best !== idx) setIdx(best, false);
    }, 90);
  }, { passive: true });
  sec.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'ArrowLeft') { setIdx(idx - 1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowRight') { setIdx(idx + 1); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape') { hide(); e.stopPropagation(); }
  });
  go.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = MAPS[idx];
    if (!isUnlocked(m.id)) { window.dispatchEvent(new CustomEvent('forkwood:map-unlock', { detail: { id: m.id, cost: m.unlock.cost || 0, unlock: m.unlock } })); return; }
    if (selectedId() === m.id) { hide(); if (opts.onPlay) opts.onPlay(m); return; }
    select(m.id); slides(); setIdx(idx, false); refreshChip();
    if (sound && sound.stamp) sound.stamp();
  });
  onChange(() => { if (open) { slides(); setIdx(idx, false); } });
  return { show, hide, refresh: refreshChip, get open() { return open; } };
}
