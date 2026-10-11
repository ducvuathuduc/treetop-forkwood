// P8-ECON: shop sections for the endless-runner economy (boosts, upgrades,
// seed pods with their odds, the gem nest), the word-hunt card, and the
// second-chance prompt. DOM only; every rule lives in src/economy.js.
import * as E from './economy.js';
import { ICON } from './icons.js';
import { SKINS, SKIN } from './skins.js';

export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const svg = (p, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
export const GEM_ICON = svg('<path d="M12 2.5c3.6 4.6 6.5 8.3 6.5 11.7a6.5 6.5 0 0 1-13 0C5.5 10.8 8.4 7.1 12 2.5z"/><path d="M9.2 14.6a3 3 0 0 0 2.6 2.9"/>', 'i-gem');
export const BOOST_ICON = {
  rush: svg('<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/><path d="M8 20h8"/>'),
  ink: svg('<path d="M12 3c3 4 5 6.7 5 9.5a5 5 0 0 1-10 0C7 9.7 9 7 12 3z"/><path d="M10 13h4"/><path d="M12 11v4"/>'),
  pollen: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m5 5 2 2"/><path d="m17 17 2 2"/><path d="m19 5-2 2"/><path d="m7 17-2 2"/>'),
  bark: ICON.shield,
};
export const UP_ICON = { pollen: BOOST_ICON.pollen, ink: BOOST_ICON.ink, rush: BOOST_ICON.rush, golden: ICON.star, dew: svg('<path d="M12 3c3 4 5 6.7 5 9.5a5 5 0 0 1-10 0C7 9.7 9 7 12 3z"/>') };
export const SECTIONS = [['skins', 'Skins'], ['boosts', 'Boosts'], ['upgrades', 'Upgrades'], ['pods', 'Pods'], ['gems', 'Gems']];
export const COST_SKINS = () => SKINS.filter((s) => s.unlock.cost).map((s) => s.id);
export const acorn = (n) => `<b class="price">${ICON.acorn}${fmt(n)}</b>`;
export const gem = (n) => `<b class="price gem">${GEM_ICON}${fmt(n)}</b>`;

export function sectionTabs(cur) {
  return `<div class="slots eco-tabs" role="tablist">${SECTIONS.map(([id, nm]) => `<button class="slot ${id === cur ? 'on' : ''}" data-eco="${id}" role="tab" aria-selected="${id === cur}">${esc(nm)}</button>`).join('')}</div>`;
}
export function armed(S) { E.ensureEcon(S); if (!Array.isArray(S.econ.armed)) S.econ.armed = []; S.econ.armed = S.econ.armed.filter((id) => E.BOOSTS[id] && S.econ.boosts[id] > 0); return S.econ.armed; }

/** Word hunt card for the Goals tab. */
export function wordCard(S) {
  E.ensureEcon(S);
  const today = new Date().toISOString().slice(0, 10), w = S.econ.word, word = E.wordOf(today);
  const got = w.day === today ? w.got : 0, done = w.day === today && w.done;
  const streak = done ? w.streak : (w.last && Date.parse(today) - Date.parse(w.last) <= 864e5 ? w.streak : 0);
  const next = Math.min(5, streak + (done ? 0 : 1));
  return `<section class="card word-card"><header><span class="hico">${ICON.book}</span><div><h3>Word hunt</h3><p>One letter waits in each free-play run (60-160 m up). Spell today's word for ${esc(E.WORD_REWARD[next - 1])}. Day ${next} of 5 in a row.</p></div></header>
    <ol class="letters" aria-label="Today's word, ${got} of ${word.length} letters found">${[...word].map((ch, i) => `<li class="${i < got || done ? 'got' : ''} ${i === got && !done ? 'next' : ''}">${i < got || done ? ch : ''}</li>`).join('')}</ol>
    ${done ? `<p class="muted small center">Spelled! A new word at UTC midnight.</p>` : ''}</section>`;
}

/** The second-chance prompt. Returns { offer(sim, n, onYes, onNo) }. */
export function createRevive({ getSave, sound, isCalm }) {
  const el = document.getElementById('revive');
  let timer = 0, raf = 0, done = null;
  function close(yes) { if (!done) return; clearTimeout(timer); cancelAnimationFrame(raf); el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); const f = done; done = null; f(yes); }
  el.querySelector('#rv-yes').addEventListener('click', () => close(true));
  el.querySelector('#rv-no').addEventListener('click', () => close(false));
  return {
    get open() { return !!done; },
    /** n = second chances already used this run. cb(yes) */
    offer(n, cb) {
      const S = getSave(), cost = E.reviveCost(n);
      if (n >= E.MAX_REVIVES || S.econ.gems < cost) return false;
      done = cb;
      el.querySelector('#rv-cost').innerHTML = `${GEM_ICON}${cost}`;
      el.querySelector('#rv-have').textContent = `you have ${S.econ.gems}`;
      el.querySelector('#rv-next').textContent = n + 1 < E.MAX_REVIVES ? `next one costs ${E.reviveCost(n + 1)}` : 'last one this run';
      el.classList.add('show'); el.setAttribute('aria-hidden', 'false');
      const bar = el.querySelector('.rv-bar i'), T = 4000, t0 = performance.now();
      const tick = (now) => { const k = Math.min(1, (now - t0) / T); bar.style.transform = `scaleX(${1 - k})`; if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
      timer = setTimeout(() => close(false), T);
      if (sound && sound.near) sound.near();
      return true;
    },
    cancel() { close(false); },
  };
}

/** v1.0: glass confirm for buying a map with acorns. buy(id) -> price | false. */
export function createMapBuy({ getSave, sound, maps, buy, onBought, toast }) {
  const el = document.createElement('section');
  el.id = 'mapbuy'; el.className = 'overlay revive mapbuy'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-hidden', 'true'); el.setAttribute('aria-label', 'Unlock map');
  el.innerHTML = `<div class="panel glass rv-panel mb-panel"><span class="mb-sw"></span><p class="kick">Unlock map</p><h2 class="mb-name"></h2><p class="muted mb-where"></p>
    <p class="muted mb-have"></p><div class="row"><button class="btn primary mb-yes" type="button"></button><button class="btn secondary mb-no" type="button">Not now</button></div></div>`;
  document.body.appendChild(el);
  let cur = null;
  const close = () => { cur = null; el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); };
  el.querySelector('.mb-no').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  el.querySelector('.mb-yes').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!cur) return;
    const S = getSave(), m = cur, before = S.acorns, paid = buy(m.id);
    if (!paid) return;
    close();
    if (sound && sound.buy) sound.buy();
    if (onBought) onBought(m, before, S.acorns);
    if (toast) toast(`${m.name} unlocked: ${fmt(paid)} acorns well spent`, 'buy');
  });
  return {
    get open() { return !!cur; },
    offer(id) {
      const m = maps.MAP[id]; if (!m || maps.isUnlocked(id)) return false;
      const S = getSave(), cost = (m.unlock && m.unlock.cost) | 0, short = Math.max(0, cost - S.acorns);
      cur = m;
      el.querySelector('.mb-sw').style.background = `linear-gradient(160deg,${m.swatch[0]},${m.swatch[1]} 70%,${m.swatch[2]})`;
      el.querySelector('.mb-name').textContent = m.name;
      el.querySelector('.mb-where').textContent = `${m.place}${m.country && m.country !== m.place ? ' · ' + m.country : ''}`;
      el.querySelector('.mb-have').textContent = short ? `You have ${fmt(S.acorns)}: ${fmt(short)} more to go. Acorns come from every run.` : `You have ${fmt(S.acorns)} acorns. Maps are yours for good.`;
      const yes = el.querySelector('.mb-yes');
      yes.innerHTML = short ? `Need ${fmt(short)} more` : `Unlock for <b class="price">${ICON.acorn}${fmt(cost)}</b>`;
      yes.disabled = !!short;
      el.classList.add('show'); el.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => (short ? el.querySelector('.mb-no') : yes).focus({ preventScroll: true }));
      if (sound && sound.page) sound.page();
      return true;
    },
    close,
  };
}
