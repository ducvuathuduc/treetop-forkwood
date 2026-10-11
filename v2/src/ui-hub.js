// Forkwood 2.0 META: the museum hub ("Don't Make Me Think").
// Home = one big framed painting of the selected world, a giant PLAY in the thumb
// zone, currency bar top-right (+ opens the shop), ≤3 side buttons each side (daily
// left, timed right), one event banner, and 5 fixed tabs SHOP · GROVE · PLAY · PASS ·
// LEAGUE. Red dots only for something claimable now. Rooms (shop, gallery, grove,
// pass, league) load on first open from ui-rooms.js. Sheets (offer, coming soon,
// odds, age question) never cover the whole screen and close on a tap outside.
//
// main.js keeps owning runs and the old title ids; this module only decorates and
// routes. Hooks main.js calls: refresh(mode), onHome(), afterRun(info), isOpen.
import * as SS from './store-state.js';
let ST = null; // the full store (catalogue, adapters, offers) loads after the first frame
export const loadStore = () => (ST ? Promise.resolve(ST) : import('./store.js').then((m) => (ST = m)));
import * as EC from './economy.js';
import * as M from './meta.js';
import { WORLDS, WORLD, DEFAULT_WORLD, WORLD_BY_LEGACY } from './worlds-meta.js';
import { MI, frameHTML, labelHTML, ensureDefs, loadRegistry, wakeImages } from './ui-art.js';
// motion.js loads after the first frame; until then these no-ops stand in (first-load budget)
const NOOP = () => {}; let motion = { press: NOOP, popIn: NOOP, stagger: NOOP, roomIn: NOOP, burst: NOOP, bump: NOOP, countUp: NOOP, drift: NOOP, setCalm: NOOP, loadGsap: NOOP, flyTo: () => Promise.resolve() };
let motionLoading = null;
const loadMotion = (isCalm) => motionLoading || (motionLoading = import('./motion.js').then((m) => { motion = m.default; motion.setCalm(isCalm); return motion; }));

const $ = (id) => document.getElementById(id);
const TABS = ['shop', 'grove', 'play', 'pass', 'league'];
const UNLOCK_ALL = typeof location !== 'undefined' && /[?&]unlock=all\b/.test(location.search);
const fmt = (n) => (n >= 1e5 ? Math.round(n / 1e3) + 'k' : Math.round(n).toLocaleString('en-US'));
const hm = (ms) => { const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3); return h >= 48 ? `${Math.floor(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`; };

/** Onboarding gates (MENU-MONETIZATION §1b): run 1 only PLAY; tabs after run 1; shop + gift run 3; pass day 2; league level 5; races level 8. */
export function gates(S, now = new Date()) {
  if (UNLOCK_ALL) return { tabs: true, shop: true, grove: true, pass: true, league: true, daily: true, quests: true, gift: true, race: true, offers: true };
  const runs = S.stats.runs | 0, lvl = S.level | 0;
  return {
    tabs: runs >= 1, grove: runs >= 1, daily: runs >= 1, quests: runs >= 1,
    shop: runs >= 3, gift: runs >= 3,
    pass: runs >= 5 || (runs >= 1 && SS.isDayTwo(S, now)),
    league: lvl >= 5, race: lvl >= 8 || runs >= 12,
    offers: runs >= 3 || SS.isDayTwo(S, now),
  };
}
const GATE_TEXT = { shop: 'The gift shop opens after your 3rd climb.', grove: 'The Grove opens after your first climb.', pass: 'The Season Pass opens tomorrow (or after 5 climbs).', league: 'Leagues open at level 5.' };

export function createHub({ getSave, persist, sound, isCalm, getMode, selectWorld, onPlay, toast, openGoals, openOldShop, openGrove, refreshBar }) {
  ensureDefs();
  const S0 = getSave(); SS.ensureStore(S0); SS.startStoreSession(S0); persist(false);
  const title = $('title'), tabbar = $('tabbar'), room = $('room'), sheet = $('sheet'), settings = $('settings');
  const roomBody = room.querySelector('.room-body');
  let booted = false;
  let roomId = null, rooms = null, roomsLoading = null, offerTimer = 0, worldShown = null, runId = 0;

  // ------------------------------------------------ static decoration
  $('btn-settings').innerHTML = MI.gear;
  room.querySelector('.room-back').innerHTML = MI.back;
  settings.querySelector('.sheet-x').innerHTML = MI.close;
  for (const b of tabbar.querySelectorAll('[data-hub]')) b.querySelector('.ti').innerHTML = MI[b.dataset.hub === 'play' ? 'play' : b.dataset.hub];
  $('daily-ico').innerHTML = MI.calendar; $('quest-ico').innerHTML = MI.map; $('race-ico').innerHTML = MI.live;
  // left rail: daily gift first (moved from the old chip bar), right rail: season + offer timers
  const gift = $('btn-gift');
  if (gift) { gift.className = 'rail-btn gift'; gift.innerHTML = `<span id="gift-ico" class="bi">${MI.gift}</span><span class="lbl">Gift</span><span class="rb-sub">ready</span>`; $('rail-l').prepend(gift); }
  const passBtn = document.createElement('button'); passBtn.id = 'hub-pass'; passBtn.className = 'rail-btn timed'; passBtn.innerHTML = `<span class="bi">${MI.pass}</span><span class="lbl">Season</span><span class="rb-sub" data-t></span>`;
  const offerBtn = document.createElement('button'); offerBtn.id = 'hub-offer'; offerBtn.className = 'rail-btn timed offer'; offerBtn.hidden = true; offerBtn.innerHTML = `<span class="bi">${MI.gift}</span><span class="lbl">Offer</span><span class="rb-sub" data-t></span>`;
  $('rail-r').prepend(offerBtn); $('rail-r').prepend(passBtn);
  // + buttons on the currency chips open the right shop section
  for (const [id, sec] of [['btn-wallet', 'acorns'], ['btn-gems', 'gems']]) {
    const c = $(id); if (!c) continue;
    c.insertAdjacentHTML('beforeend', `<span class="plus" aria-hidden="true">${MI.plus}</span>`);
    c.addEventListener('click', (e) => { e.stopImmediatePropagation(); e.preventDefault(); sound.unlock(); if (!gates(getSave()).shop) { toast(GATE_TEXT.shop, 'badge'); return; } openRoom('shop', { section: sec }); }, true);
  }

  // ------------------------------------------------ the hero painting
  const art = $('hub-art');
  function renderArt(force) {
    const S = getSave(), w = currentWorld(S);
    if (!force && worldShown === w) return;
    worldShown = w;
    const i = WORLD[w].i, prev = WORLDS[(i + WORLDS.length - 1) % WORLDS.length], next = WORLDS[(i + 1) % WORLDS.length];
    art.innerHTML = `<div class="hang hang-side l" data-step="-1" aria-hidden="true">${frameHTML(prev.id, { small: true, lazy: true, locked: !SS.ownsWorld(S, prev.id) })}</div>
      <button class="hang hang-main" id="hub-frame" aria-label="${WORLD[w].name}: open the gallery"><span class="picture-light" aria-hidden="true"></span>${frameHTML(w, { defer: !booted })}</button>
      <div class="hang hang-side r" data-step="1" aria-hidden="true">${frameHTML(next.id, { small: true, lazy: true, locked: !SS.ownsWorld(S, next.id) })}</div>
      <button class="mz-icon art-nav l" data-step="-1" aria-label="Previous world">${MI.left}</button><button class="mz-icon art-nav r" data-step="1" aria-label="Next world">${MI.right}</button>
      <figcaption>${labelHTML(w)}</figcaption>`;
    const img = art.querySelector('#hub-frame img');
    if (img) motion.drift(img);
    if (booted) wakeImages(art);
  }
  art.addEventListener('click', (e) => {
    const st = e.target.closest('[data-step]');
    if (st) { e.stopPropagation(); stepWorld(+st.dataset.step); return; }
    if (e.target.closest('#hub-frame')) { e.stopPropagation(); openRoom('gallery'); }
  });
  // swipe the painting to browse owned worlds
  { let x0 = null; art.addEventListener('pointerdown', (e) => { x0 = e.clientX; }, { passive: true }); art.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 48) { stepWorld(e.clientX < x0 ? 1 : -1); art.dataset.swiped = '1'; setTimeout(() => delete art.dataset.swiped, 50); } x0 = null; }, { passive: true }); art.addEventListener('click', (e) => { if (art.dataset.swiped) e.stopImmediatePropagation(); }, true); }
  function currentWorld(S) { const T = SS.ensureStore(S); return T.world && SS.ownsWorld(S, T.world) ? T.world : DEFAULT_WORLD; }
  function stepWorld(d) {
    const S = getSave(), owned = WORLDS.filter((w) => SS.ownsWorld(S, w.id));
    const i = owned.findIndex((w) => w.id === currentWorld(S));
    const nx = owned[(i + d + owned.length) % owned.length];
    if (nx.id === currentWorld(S)) { openRoom('gallery'); return; }
    chooseWorld(nx.id);
    if (sound.page) sound.page();
  }
  function chooseWorld(id) {
    const S = getSave(); if (!SS.ownsWorld(S, id)) return false;
    SS.ensureStore(S).world = id; persist(false);
    if (selectWorld) selectWorld(id, WORLD[id].legacy);
    try { window.dispatchEvent(new CustomEvent('forkwood:world-select', { detail: { id, legacy: WORLD[id].legacy } })); } catch { /* ignore */ }
    renderArt(true);
    motion.popIn(art.querySelector('#hub-frame .frame'));
    return true;
  }

  // ------------------------------------------------ refresh (called by main.js after refreshTitle / bar)
  function refresh(mode = getMode()) {
    const S = getSave(), G = gates(S), home = mode === 'title';
    if (mode === 'play') loadCss('museum-rooms.css'); // revive / results styling, before a run can end
    renderArt(false);
    document.body.classList.toggle('hub-first', !G.tabs);
    tabbar.hidden = !(home && G.tabs);
    for (const b of tabbar.querySelectorAll('[data-hub]')) { const t = b.dataset.hub; const open = t === 'play' || G[t]; b.classList.toggle('locked', !open); b.classList.toggle('on', t === (roomId && TABS.includes(roomId) ? roomId : roomId ? '' : 'play')); }
    { const db = $('daily-best'); const t = db.textContent.replace(/^·\s*/, '').replace(/^today\s*/, ''); db.textContent = /\d{4}-\d\d/.test(t) || /^[A-Z][a-z]{2} \d/.test(t) ? 'new' : t; }
    $('btn-daily').hidden = !G.daily; $('btn-quest').hidden = !G.quests; $('btn-race').hidden = !G.race;
    if (gift && !G.gift) gift.hidden = true;
    passBtn.hidden = !G.pass;
    if (G.pass) passBtn.querySelector('[data-t]').textContent = hm(seasonLeft());
    const off = G.offers ? activeOffer(S) : null;
    offerBtn.hidden = !off;
    if (off) { offerBtn.querySelector('[data-t]').textContent = hm(SS.offerLeft(S, off)); offerBtn.dataset.offer = off; }
    // red dots: only for things you can claim right now
    const dots = { shop: G.shop && !SS.freeClaimed(S), pass: G.pass && passNew(S) > 0, league: G.league && !!(S.ret.league.result && !SS.ensureStore(S).intro.leagueSeen), grove: false, play: false };
    for (const b of tabbar.querySelectorAll('[data-hub]')) b.classList.toggle('dot', !!dots[b.dataset.hub]);
    passBtn.classList.toggle('dot', dots.pass);
    if (gift) gift.classList.toggle('dot', !gift.hidden);
    for (const r of ['rail-l', 'rail-r']) $(r).classList.toggle('empty', ![...$(r).children].some((c) => !c.hidden));
  }
  const seasonLeft = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - d; };
  const passNew = (S) => Math.max(0, (S.ret.season.tier | 0) - (SS.ensureStore(S).passSeen | 0));
  function activeOffer(S) { const T = SS.ensureStore(S); for (const id of ['starter_sprout']) { const l = SS.offerLeft(S, id); if (l && !T.owned.includes(id)) return id; } return null; }

  // ------------------------------------------------ rooms
  function loadRooms() {
    if (rooms) return Promise.resolve(rooms);
    roomsLoading = roomsLoading || Promise.all([import('./ui-rooms.js'), loadCss('museum-rooms.css'), loadStore(), loadMotion(isCalm)]).then(([m]) => { api.ST = ST; api.motion = motion; return (rooms = m.createRooms(api)); });
    return roomsLoading;
  }
  function openRoom(id, opts = {}) {
    const S = getSave(), G = gates(S);
    if (TABS.includes(id) && id !== 'play' && !G[id]) { toast(GATE_TEXT[id], 'badge'); return; }
    if (id === 'play') { closeRoom(); return; }
    const from = roomId ? TABS.indexOf(roomId) : 2, to = TABS.indexOf(id);
    roomId = id;
    room.classList.add('show'); room.setAttribute('aria-hidden', 'false'); document.body.classList.add('hub-room');
    title.classList.remove('show');
    room.dataset.room = id;
    if (sound.page) sound.page();
    refresh('title');
    loadRooms().then((R) => {
      if (roomId !== id) return;
      roomBody.scrollTop = 0;
      R.render(id, roomBody, opts);
      room.querySelector('.room-title').textContent = R.title(id);
      room.querySelector('.room-sub').textContent = R.sub(id);
      motion.roomIn(room.querySelector('.room-in'), to >= 0 && from >= 0 ? Math.sign(to - from) : 0);
      motion.stagger(roomBody.querySelectorAll('.card, .tile, .gal-item, .tier, .lg-row'));
      refresh('title');
      if (refreshBar) refreshBar();
    });
  }
  function closeRoom() {
    if (!roomId) return;
    roomId = null;
    room.classList.remove('show'); room.setAttribute('aria-hidden', 'true'); document.body.classList.remove('hub-room');
    if (getMode() === 'title') { title.classList.add('show'); motion.roomIn(title.querySelector('.title-card'), 0); }
    refresh(); if (refreshBar) refreshBar();
  }
  room.querySelector('.room-back').addEventListener('click', (e) => { e.stopPropagation(); closeRoom(); });
  tabbar.addEventListener('click', (e) => { const b = e.target.closest('[data-hub]'); if (!b) return; e.stopPropagation(); sound.unlock(); if (sound.startMenu) sound.startMenu(); openRoom(b.dataset.hub); });
  passBtn.addEventListener('click', (e) => { e.stopPropagation(); openRoom('pass'); });
  offerBtn.addEventListener('click', (e) => { e.stopPropagation(); loadStore().then(() => { const p = ST.PRODUCT[offerBtn.dataset.offer]; if (p) showOffer(p, false); }); });
  if (gift) gift.addEventListener('click', () => { const a = $('acorn-n'); setTimeout(() => { motion.burst(gift); motion.flyTo(gift, a, { n: 8, icon: MI.acorn }); }, 30); });

  // ------------------------------------------------ sheets (modals: dim + game paused behind)
  let sheetClose = null;
  function openSheet(html, { onClose, cls = '' } = {}) {
    loadCss('museum-rooms.css');
    const card = sheet.querySelector('.sheet-card');
    card.className = 'sheet-card ' + cls;
    card.innerHTML = `<button class="mz-icon sheet-x" aria-label="Close">${MI.close}</button>` + html;
    sheet.classList.add('show'); sheet.setAttribute('aria-hidden', 'false'); document.body.classList.add('hub-sheet');
    sheetClose = onClose || null;
    motion.popIn(card);
    card.querySelector('.sheet-x').addEventListener('click', (e) => { e.stopPropagation(); closeSheet(); });
    return card;
  }
  function closeSheet() { if (!sheet.classList.contains('show')) return; sheet.classList.remove('show'); sheet.setAttribute('aria-hidden', 'true'); document.body.classList.remove('hub-sheet'); const f = sheetClose; sheetClose = null; if (f) f(); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  settings.addEventListener('click', (e) => { if (e.target === settings || e.target.closest('.sheet-x')) { settings.classList.remove('show'); settings.setAttribute('aria-hidden', 'true'); document.body.classList.remove('hub-sheet'); } });
  const closeSettings = () => { settings.classList.remove('show'); settings.setAttribute('aria-hidden', 'true'); document.body.classList.remove('hub-sheet'); };
  $('btn-story').addEventListener('click', closeSettings);
  $('btn-settings').addEventListener('click', (e) => { e.stopPropagation(); loadCss('museum-rooms.css'); settings.classList.add('show'); settings.setAttribute('aria-hidden', 'false'); document.body.classList.add('hub-sheet'); motion.popIn(settings.querySelector('.sheet-card')); });
  $('btn-restore').addEventListener('click', async (e) => { e.stopPropagation(); await loadStore(); const n = await ST.restore(getSave()); persist(false); toast(n ? `Restored ${n} purchase${n > 1 ? 's' : ''}` : 'Nothing to restore yet: the shop opens for real money soon.', 'badge'); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (sheet.classList.contains('show')) { e.stopImmediatePropagation(); closeSheet(); }
    else if (settings.classList.contains('show')) { e.stopImmediatePropagation(); settings.classList.remove('show'); document.body.classList.remove('hub-sheet'); }
    else if (roomId) { e.stopImmediatePropagation(); closeRoom(); }
  }, true);

  /** Purchase entry point for every price button: age question → coming soon (real price, interest logged). */
  async function buy(id, where = '') {
    await loadStore();
    const S = getSave(), p = ST.PRODUCT[id];
    let r = await ST.purchase(S, id, { where });
    if (r.status === 'age_gate') { const band = await askAge(); if (!band) return r; ST.setAge(S, band); r = await ST.purchase(S, id, { where }); }
    persist(false);
    if (r.status === 'coming_soon') comingSoon(p);
    else if (r.status === 'parental_consent') openSheet(`<p class="kick">Ask a grown-up</p><h3>Purchases need a parent’s OK</h3><p class="muted">Players under 16 need a parent or guardian to approve purchases. This step is coming with the real shop; nothing was charged.</p><div class="row"><button class="mz-btn ghost" data-x>OK</button></div>`).querySelector('[data-x]').addEventListener('click', closeSheet);
    else if (r.status === 'success') { toast(`${p.name}: thank you!`, 'gift'); refreshAll(); }
    else if (r.status === 'owned') toast('You already own this.', 'badge');
    return r;
  }
  function askAge() {
    return new Promise((res) => {
      let done = false;
      const card = openSheet(`<p class="kick">Before your first purchase</p><h3>How old are you?</h3><p class="muted">We ask once. Under-16s need a parent’s OK to buy, and see only non-personalised ads. Nothing leaves this device.</p>
        <div class="age-row"><button class="mz-btn ghost" data-age="under13">Under 13</button><button class="mz-btn ghost" data-age="13to15">13–15</button><button class="mz-btn ghost" data-age="16plus">16 or older</button></div>`, { cls: 'age', onClose: () => { if (!done) res(null); } });
      card.querySelectorAll('[data-age]').forEach((b) => b.addEventListener('click', () => { done = true; closeSheet(); res(b.dataset.age); }));
    });
  }
  function comingSoon(p) {
    const S = getSave(), T = ST.ensureStore(S);
    const card = openSheet(`<p class="kick">Coming soon</p><h3>${p.name}</h3><p class="price-big">${ST.priceText(p, S)}</p><p class="muted">Real-money purchases open soon. We counted your interest — it tells us what to open first. Nothing was charged.</p>
      <div class="row"><button class="mz-btn gold" data-n ${T.notify.includes(p.id) ? 'disabled' : ''}>${T.notify.includes(p.id) ? 'We’ll let you know' : 'Notify me'}</button><button class="mz-btn ghost" data-x>Close</button></div>`, { cls: 'soon' });
    card.querySelector('[data-n]').addEventListener('click', (e) => { ST.notifyMe(S, p.id); persist(false); e.currentTarget.textContent = 'We’ll let you know'; e.currentTarget.disabled = true; motion.burst(e.currentTarget, { n: 8 }); });
    card.querySelector('[data-x]').addEventListener('click', closeSheet);
  }
  function oddsSheet(kind) {
    const o = ST.oddsFor(kind), info = ST.POD_INFO[kind];
    openSheet(`<p class="kick">Drop rates</p><h3>${info.name}</h3><table class="odds">${o.map((x) => `<tr><td>${x.text}</td><td>${x.pct}%</td></tr>`).join('')}</table><p class="muted small">${info.note} Odds are the same for everyone and never change with spending.</p>`, { cls: 'odds-sheet' });
  }
  /** Sales popup: fixed contents, one price button, visible X, timer. */
  function showOffer(p, auto = true) {
    const S = getSave();
    if (auto) ST.markOfferShown(S, p.id); persist(false);
    const left = ST.offerLeft(S, p.id);
    const items = p.grants.gems ? [`${p.grants.gems} gems`] : [];
    if (p.grants.skins) items.push(...p.grants.skins.map((id) => `${ST.VINE_SKIN[id].name} vine`));
    if (p.grants.boosts) items.push(...Object.keys(p.grants.boosts).map((b) => EC.BOOSTS[b].name));
    if (p.grants.passPremium) items.push('Premium season track', 'Every passed tier paid at once');
    const card = openSheet(`<div class="offer-art" aria-hidden="true">${frameHTML(currentWorld(S), { small: true })}</div><p class="kick">${p.id === 'starter_sprout' ? 'Welcome offer · one time' : 'This season'}</p><h3>${p.name}</h3>
      <ul class="offer-list">${items.map((t) => `<li>${MI.tick}<span>${t}</span></li>`).join('')}</ul>
      <button class="mz-btn gold big" data-buy>${ST.priceText(p, S)}</button>${left != null ? `<p class="muted small center">${MI.clock} ends in ${hm(left)}</p>` : ''}`, { cls: 'offer' });
    card.querySelector('[data-buy]').addEventListener('click', () => { closeSheet(); buy(p.id, auto ? 'popup' : 'rail'); });
    refresh();
  }
  /** Back on Home after a run: at most one offer, never in the first session, never mid-run. */
  function onHome() {
    clearTimeout(offerTimer);
    const S = getSave();
    if (!gates(S).offers) return;
    loadStore().then(() => {
    const p = ST.offerFor(S, { midRun: getMode() !== 'title' });
    if (p) offerTimer = setTimeout(() => { if (getMode() === 'title' && !roomId && !sheet.classList.contains('show') && !document.querySelector('.overlay.show:not(#title)')) showOffer(p, true); }, 1400);
    });
  }
  function afterRun(info = {}) { runId++; const S = getSave(); SS.noteRun(S, { lost: !!info.lost }); persist(false); }

  /** Results card: "×2 acorns" by rewarded ad, free play only, 1 per run, only when an ad provider exists. */
  function offerDouble(o) { const old = $('rw-double'); if (old) old.remove(); loadStore().then(() => offerDoubleNow(o)); }
  function offerDoubleNow({ gained, fair }) {
    const S = getSave();
    if (fair || !(gained > 0) || ST.adProviderName() === 'stub' || !ST.adAllowed(S, 'double_run', { runId })) return;
    const host = $('rewards'); if (!host) return;
    const b = document.createElement('button'); b.id = 'rw-double'; b.className = 'mz-btn gold rw-double'; b.type = 'button';
    b.innerHTML = `${MI.ad}<span>×2 acorns</span><small>+${fmt(gained)}</small>`;
    host.appendChild(b);
    b.addEventListener('click', async (e) => {
      e.stopPropagation(); b.disabled = true;
      const r = await ST.rewarded(getSave(), 'double_run', { runId });
      if (r.status === 'rewarded') { ST.grant(getSave(), `double:${Date.now()}`, { acorns: gained }, { why: 'double run' }); persist(false); await claimFx(b, 'acorn', 10); b.innerHTML = `${MI.tick}<span>Doubled</span>`; }
      else { b.innerHTML = `<span>${r.status === 'capped' ? 'Done for today' : 'No ad right now'}</span>`; }
      persist(false);
    });
  }
  function refreshAll() { refresh(); if (refreshBar) refreshBar(); if (rooms && roomId) rooms.render(roomId, roomBody, {}); }
  /** Reward claim: burst at the button, currency flies to the bar, counter ticks. */
  function claimFx(fromEl, kind = 'acorn', n = 8) {
    const to = kind === 'gem' ? $('gem-n') : $('acorn-n');
    motion.burst(fromEl); if (sound.sparkle) sound.sparkle();
    return motion.flyTo(fromEl, to, { n, icon: kind === 'gem' ? MI.gem : MI.acorn, onLand: (i, last) => { if (last && refreshBar) refreshBar(); } });
  }

  // global press feedback on every menu button
  document.addEventListener('pointerdown', (e) => { const b = e.target.closest('.mz-btn, .rail-btn, .tabbar button, .play-xl, .mz-icon, .card [data-act]'); if (b) motion.press(b); }, { passive: true });
  // GSAP + art registry after the first frame (keeps them out of the first load)
  const idle = (fn, t) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: t }) : setTimeout(fn, t));
  // the hero painting loads right after the first frame + load event (the underpainting shows meanwhile)
  const boot = () => { if (booted) return; booted = true; wakeImages(art); };
  if (document.readyState === 'complete') setTimeout(boot, 1600); else window.addEventListener('load', () => setTimeout(boot, 1600), { once: true });
  const wakeMotion = () => loadMotion(isCalm).then(() => { motion.loadGsap(); const img = art.querySelector('#hub-frame img'); if (img) motion.drift(img); });
  document.addEventListener('pointerdown', () => { boot(); wakeMotion(); }, { once: true, passive: true });
  setTimeout(() => idle(() => { boot(); wakeMotion(); loadCss('museum-rooms.css'); loadStore(); loadRegistry().then(() => renderArt(true)); }, 2000), 3500);
  setInterval(() => { if (getMode() === 'title' && !roomId) refresh(); }, 30000);

  const api = {
    getSave, persist, sound, toast, isCalm, frameHTMLRef: frameHTML, labelHTMLRef: labelHTML, ST, EC, M, MI, motion, WORLDS, WORLD, WORLD_BY_LEGACY,
    gates: () => gates(getSave()), currentWorld: () => currentWorld(getSave()), chooseWorld, buy, comingSoon, oddsSheet, openSheet, closeSheet, claimFx,
    openRoom, closeRoom, refreshAll, play: () => { closeRoom(); onPlay(); }, openGoals, openOldShop, openGrove, runId: () => runId,
  };
  renderArt(true); refresh();
  return {
    refresh, onHome, afterRun, offerDouble, openRoom, closeRoom, showOffer, buy, chooseWorld, claimFx,
    get isOpen() { return !!roomId || sheet.classList.contains('show'); }, get room() { return roomId; }, api,
    adAllowed: (pl) => !!ST && ST.adAllowed(getSave(), pl, { runId }),
    adReady: (pl) => !!ST && ST.adProviderName() !== 'stub' && ST.adAllowed(getSave(), pl, { runId }),
    rewarded: (pl) => loadStore().then(() => ST.rewarded(getSave(), pl, { runId })).then((r) => { persist(false); return r; }),
    loadStore, get ST() { return ST; },
  };
}

export function loadCss(href) {
  return new Promise((res) => {
    if (document.querySelector(`link[data-css="${href}"]`)) return res();
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.dataset.css = href;
    l.onload = () => res(); l.onerror = () => res(); document.head.appendChild(l);
  });
}
