// Meta interface: the wallet and level chips, the dock on the title screen,
// the Goals / Shop / Charms / Badges / Profile book, the game-over rewards and
// toasts. All DOM, so the canvas loop stays untouched. Previews are drawn with
// the same canvas functions the game uses, so a skin looks identical in the
// shop and in play.
import { ICON } from './icons.js';
import * as M from './meta.js';
import { SKINS, SKIN, SLOTS, THEME } from './skins.js';
import { MAPS as MAP_LIST, MAP as MAP_BY_ID } from './maps.js'; // v1.0: shop filter by map
// V2-INT fix: map chips name the v2 world that took over each legacy map slot
const MAP_SHORT = { forkwood: 'Meadow', phongnha: 'Starry River', arashiyama: 'Fresco', redwoods: 'Great Wave', blackforest: 'Lily Garden', amazon: 'Gilded Grove', beanstalk: 'Lantern Village' };
import { CHARMS } from './sim.js';
import * as Q from './quest.js';
import { MODE, STAKE } from './modes.js';
import { WORLDS } from './campaign.js';
import * as UE from './ui-econ.js'; // P8-ECON
// v1.0: shop economy sections load when the shop first opens (prefetched after boot)
let UES = null;
const loadUES = () => (UES ? Promise.resolve(UES) : import('./ui-econ-shop.js').then((m) => (UES = m)));
if (typeof window !== 'undefined') setTimeout(() => loadUES().catch(() => {}), 3000);
import { drawBud, skinLeaf, blossom, drawCharmIcon, drawAcorn, trailBit, INK, PAPER, OCHRE } from './render.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ previews
function withTheme(slot, item, fn) {
  const prev = THEME[slot];
  THEME[slot] = item;
  try { fn(); } finally { THEME[slot] = prev; }
}

export function drawPreview(cv, item) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 96, h = cv.clientHeight || 72;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  withTheme(item.slot, item, () => {
    const B = THEME.bark;
    const branch = (x0, y0, x1, y1, wd) => {
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + 8, (y0 + y1) / 2, x1, y1);
        ctx.lineWidth = pass === 0 ? wd + 5 : pass === 1 ? wd : wd * 0.28;
        ctx.strokeStyle = pass === 0 ? INK : pass === 1 ? B.wood : B.light; ctx.stroke();
      }
    };
    if (item.slot === 'sky') {
      const st = item.stops, n = 7;
      for (let i = 0; i < n; i++) { const m = 900 * (1 - (i + 0.5) / n); ctx.fillStyle = skyCol(st, m); ctx.fillRect(0, (h * i) / n, w, h / n + 1); }
      ctx.fillStyle = 'rgba(255,244,214,0.95)'; ctx.beginPath(); ctx.arc(w * 0.74, h * 0.62, 8, 0, TAU); ctx.fill();
      branch(w * 0.4, h + 4, w * 0.46, h * 0.35, 6);
      return;
    }
    if (item.slot === 'card') {
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-0.05);
      const cw = h * 0.72, ch = h * 0.86;
      ctx.fillStyle = INK; ctx.fillRect(-cw / 2 + 3, -ch / 2 + 3, cw, ch);
      ctx.fillStyle = item.paper; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
      ctx.fillStyle = skyCol(THEME.sky.stops, 200); ctx.fillRect(-cw / 2 + 5, -ch / 2 + 12, cw - 10, ch * 0.62);
      ctx.strokeStyle = item.ink; ctx.lineWidth = 1.5; ctx.strokeRect(-cw / 2 + 5, -ch / 2 + 12, cw - 10, ch * 0.62);
      ctx.fillStyle = item.ink; ctx.fillRect(-cw / 2 + 5, -ch / 2 + 4, cw * 0.4, 4);
      ctx.fillStyle = item.seal; ctx.fillRect(cw / 2 - 15, ch / 2 - 15, 10, 10);
      if (item.edge === 'perforated') { ctx.strokeStyle = INK; ctx.setLineDash([1.5, 3]); ctx.strokeRect(-cw / 2 + 2, -ch / 2 + 2, cw - 4, ch - 4); ctx.setLineDash([]); }
      ctx.restore();
      return;
    }
    if (item.slot === 'bark') {
      branch(w * 0.3, h + 6, w * 0.62, 8, 14);
      ctx.strokeStyle = B.fresh[2]; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(w * 0.6, 16); ctx.lineTo(w * 0.62, 8); ctx.stroke();
      if (B.mark) { ctx.strokeStyle = B.mark; ctx.lineWidth = 2.5; ctx.lineCap = 'butt'; for (const y of [h * 0.7, h * 0.48, h * 0.3]) { ctx.beginPath(); ctx.moveTo(w * 0.42, y); ctx.lineTo(w * 0.5, y + 1); ctx.stroke(); } }
      return;
    }
    if (item.slot === 'leaf') {
      branch(w * 0.5, h + 6, w * 0.5, h * 0.2, 6);
      const L = item.leaves || ['#5cc65c', '#3cae56'];
      [[-2.4, 0], [-0.7, 1], [-2.9, 1], [-0.25, 0]].forEach(([a, j], i) => skinLeaf(ctx, w * 0.5, h * (0.62 - i * 0.12), 22, a, L[j], 2.2));
      return;
    }
    if (item.slot === 'blossom') {
      branch(w * 0.3, h + 6, w * 0.62, 10, 7);
      blossom(ctx, w * 0.42, h * 0.48, 9, 0.3, item.petal, 1);
      blossom(ctx, w * 0.62, h * 0.3, 8, 1.1, item.alt, 1);
      blossom(ctx, w * 0.66, h * 0.66, 7, 2.2, item.petal, 1);
      return;
    }
    if (item.slot === 'trail') {
      branch(w * 0.5, h + 6, w * 0.5, h * 0.32, 6);
      ctx.save(); ctx.translate(w * 0.5, h * 0.26); drawBud(ctx, false, 1.2); ctx.restore();
      if (item.kind === 'none') { ctx.fillStyle = 'rgba(30,26,22,0.45)'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('none', w * 0.5, h * 0.9); return; }
      for (let i = 0; i < 9; i++) { const k = 1 - i / 10, a = i * 1.7; trailBit(ctx, item.kind, item.c, w * 0.5 + Math.sin(a) * (6 + i * 2.6), h * 0.42 + i * 4.2, k, a, 0.9); }
      return;
    }
    if (item.slot === 'bud') {
      branch(w * 0.5, h + 6, w * 0.5, h * 0.55, 7);
      ctx.save(); ctx.translate(w * 0.5, h * 0.42); drawBud(ctx, false, 1.9); ctx.restore();
    }
  });
}
function skyCol(stops, m) {
  for (let i = 0; i < stops.length - 1; i++) {
    const [m0, c0] = stops[i], [m1, c1] = stops[i + 1];
    if (m <= m1) {
      const t = Math.max(0, (m - m0) / (m1 - m0));
      const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16);
      const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }
  }
  return stops[stops.length - 1][1];
}
function iconCanvas(draw, size = 44) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = size * dpr; cv.height = size * dpr; cv.style.width = cv.style.height = size + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(size / 2, size / 2);
  draw(ctx, size);
  return cv;
}

// ------------------------------------------------------------------ UI
export function createMetaUI({ getSave, persist, sound, isCalm, onOpen, onClose }) {
  const bar = $('metabar'), dock = $('dock'), book = $('meta'), body = $('meta-body');
  let tab = 'goals', shopSlot = 'bark', shopMap = '', open = false, shopView = 'skins'; // P8-ECON: shopView
  $('acorn-ico').innerHTML = ICON.acorn;
  $('gift-ico').innerHTML = ICON.gift;
  for (const b of dock.querySelectorAll('[data-tab]')) b.querySelector('.di').innerHTML = ICON[b.dataset.tab];
  for (const b of book.querySelectorAll('.tabs [data-tab]')) b.querySelector('.ti').innerHTML = ICON[b.dataset.tab];
  $('btn-meta-close').innerHTML = ICON.close;
  $('rw-acorn-ico').innerHTML = ICON.acorn;
  if ($('gem-ico')) $('gem-ico').innerHTML = UE.GEM_ICON; // P8-ECON

  function today() { return M.dayKey(); }

  function refreshBar(mode) {
    const S = getSave();
    const show = S.stats.runs > 0 && (mode === 'title' || mode === 'over');
    bar.hidden = !show;
    dock.hidden = !(show && mode === 'title');
    $('acorn-n').textContent = fmt(S.acorns);
    if ($('gem-n')) $('gem-n').textContent = fmt((S.econ && S.econ.gems) || 0); // P8-ECON
    $('lvl-n').textContent = S.level;
    $('lvl-pips').innerHTML = S.goals.map((g) => `<i class="${g.done ? 'on' : ''}"></i>`).join('');
    const gift = M.giftReady(S, today());
    $('btn-gift').hidden = !gift;
    const dots = {
      goals: gift || S.goals.some((g) => g.done && false),
      shop: SKINS.some((it) => M.canBuy(S, it.id, today())),
      charms: Object.keys(CHARMS).some((id) => M.charmUnlocked(S, id) && !(S.seen.charms || []).includes(id)),
      badges: false, profile: false,
    };
    for (const b of dock.querySelectorAll('[data-tab]')) b.classList.toggle('dot', !!dots[b.dataset.tab]);
    for (const b of book.querySelectorAll('.tabs [data-tab]')) b.classList.toggle('dot', !!dots[b.dataset.tab]);
  }

  function show(t = tab) {
    tab = t;
    open = true;
    book.classList.add('show');
    document.body.classList.add('book');
    for (const b of book.querySelectorAll('.tabs [data-tab]')) { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    render();
    if (onOpen) onOpen();
  }
  function hide() { if (!open) return; open = false; book.classList.remove('show'); document.body.classList.remove('book'); if (onClose) onClose(); }

  function render() {
    const S = getSave();
    M.rollover(S);
    if (tab === 'charms') { S.seen.charms = Object.keys(CHARMS).filter((id) => M.charmUnlocked(S, id)); persist(false); }
    body.innerHTML = '';
    body.scrollTop = 0;
    ({ goals: renderGoals, shop: renderShop, charms: renderCharms, badges: renderBadges, profile: renderProfile })[tab](S);
    refreshBar('title');
    body.querySelectorAll('canvas[data-skin]').forEach((cv) => drawPreview(cv, SKIN[cv.dataset.skin]));
  }

  // ---- goals
  const task = (t, extra = '') => {
    const pct = Math.min(100, Math.round(((t.p || 0) / t.n) * 100));
    return `<li class="task ${t.done ? 'done' : ''}"><span class="box">${t.done ? ICON.tick : ''}</span><span class="tt">${esc(M.describe(t))}<span class="prog"><span class="fill" style="width:${pct}%"></span></span></span><span class="pn">${t.done ? 'done' : `${fmt(t.p || 0)}/${fmt(t.n)}`}</span>${extra}</li>`;
  };
  function renderGoals(S) {
    const gift = M.giftReady(S, today());
    const st = S.streak;
    const nextDay = gift ? (st.last && Math.round((Date.parse(today()) - Date.parse(st.last)) / 864e5) === 1 ? st.count + 1 : (st.freezes > 0 && st.last && Math.round((Date.parse(today()) - Date.parse(st.last)) / 864e5) === 2 ? st.count + 1 : 1)) : st.count;
    const cal = M.GIFTS.map((g, i) => {
      const dayN = Math.floor((Math.max(1, nextDay) - 1) / 7) * 7 + i + 1;
      const got = dayN < nextDay || (!gift && dayN === nextDay);
      const isNext = gift && dayN === nextDay;
      return `<li class="${got ? 'got' : ''} ${isNext ? 'next' : ''}"><b>${g}</b><small>day ${dayN}</small></li>`;
    }).join('');
    const hrs = Math.ceil(M.msToNextDay() / 36e5);
    body.innerHTML = `
      <section class="card lvl-card">
        <header><span class="lv-badge">${ICON.level}<b>${S.level}</b></span><div><h3>Level ${S.level}</h3><p>Finish all three goals to reach level ${S.level + 1} and earn <b>${M.levelReward(S.level)}</b> acorns${nextUnlock(S)}.</p></div></header>
        <ul class="tasks">${S.goals.map((g) => task(g)).join('')}</ul>
      </section>
      ${UE.wordCard(S)}<!-- P8-ECON -->
      <section class="card streak-card">
        <header><span class="hico">${ICON.flame}</span><div><h3>${st.count > 0 ? `${st.count}-day streak` : 'Daily gift'}</h3><p>Open Forkwood each day for a bigger gift. Every 7th day adds a frost guard that saves a missed day (${st.freezes}/2).</p></div></header>
        <ol class="gift-cal">${cal}</ol>
        ${gift ? `<button class="btn primary small-primary" id="btn-claim">${ICON.gift}Open today's gift</button>` : `<p class="muted">Next gift in ${hrs} h (UTC midnight).</p>`}
      </section>
      <section class="card">
        <header><div><h3>Daily challenges</h3><p>New every day at UTC midnight · ${hrs} h left</p></div></header>
        <ul class="tasks">${S.daily.list.map((c) => task(c, `<span class="rw">${ICON.acorn}${c.reward}</span>`)).join('')}</ul>
      </section>
      <section class="card">
        <header><div><h3>Weekly challenges</h3><p>Week ${esc(S.weekly.week.split('-W')[1] || '')} · progress adds up across runs</p></div></header>
        <ul class="tasks">${S.weekly.list.map((c) => task(c, `<span class="rw">${ICON.acorn}${c.reward}</span>`)).join('')}</ul>
      </section>`;
    const cb = $('btn-claim');
    if (cb) cb.addEventListener('click', () => claim(cb));
  }
  function nextUnlock(S) {
    const lv = S.level + 1;
    const ch = Object.entries(M.CHARM_LEVEL).find(([, l]) => l === lv);
    const sk = SKINS.find((it) => it.unlock.level === lv);
    if (ch) return `, plus the <b>${CHARMS[ch[0]].name}</b> charm`;
    if (sk) return `, plus <b>${sk.name}</b>`;
    return '';
  }
  function claim(fromEl) {
    const S = getSave();
    const r = M.claimGift(S, today());
    if (!r) return;
    persist(true);
    sound.unlock(); sound.sparkle();
    flyAcorns(fromEl || $('btn-gift'), Math.min(10, 4 + (r.amount / 15) | 0));
    countWallet(S.acorns - r.amount, S.acorns);
    toast(`Day ${r.day} gift: +${r.amount} acorns${r.freeze ? ' and a frost guard' : ''}${r.usedFreeze ? ' (a frost guard kept your streak)' : ''}`, 'gift');
    for (const a of r.achs) toast(`Badge: ${M.ACH[a].name} +${M.ACH[a].reward}`, 'badge');
    for (const m of r.milestones || []) toast(`${m.d}-day streak milestone: +${m.acorns} acorns`, 'gift');
    if (open && tab === 'goals') render(); else refreshBar('title');
    const sn = $('streak-n'); if (sn) sn.textContent = S.streak.count;
  }

  // ---- shop
  function renderShop(S) {
    // P8-ECON: the shop has five sections; skins is the original page
    if (shopView !== 'skins') {
      if (!UES) { body.innerHTML = UE.sectionTabs(shopView) + '<p class="muted center">Opening…</p>'; loadUES().then(() => { if (open && tab === 'shop') render(); }); return; }
      body.innerHTML = UE.sectionTabs(shopView);
      UES.renderSection(body, S, shopView, { getSave, persist, sound, toast, countWallet, rerender: render, showPod });
      body.querySelectorAll('[data-eco]').forEach((b) => b.addEventListener('click', () => { shopView = b.dataset.eco; sound.page(); render(); }));
      const on = body.querySelector('.eco-tabs .on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      return;
    }
    renderSkins(S);
    body.insertAdjacentHTML('afterbegin', UE.sectionTabs(shopView));
    body.querySelectorAll('[data-eco]').forEach((b) => b.addEventListener('click', () => { shopView = b.dataset.eco; sound.page(); render(); }));
  }
  function showPod(r, golden) { toast(`${golden ? 'Golden pod' : 'Seed pod'}: ${UES ? UES.podText(r) : ''}`, 'gift'); }
  function renderSkins(S) {
    // /P8-ECON
    const deal = M.featured(S, today());
    const items = shopMap ? SKINS.filter((it) => it.map === shopMap) : SKINS.filter((it) => it.slot === shopSlot);
    const col = M.collection(S);
    const mapChips = MAP_LIST.filter((m) => SKINS.some((it) => it.map === m.id));
    const hint = shopMap ? `Looks themed to ${MAP_BY_ID[shopMap].name}` : SLOTS.find((s) => s.id === shopSlot).hint;
    body.innerHTML = `
      ${deal ? `<section class="card deal"><canvas class="pv big" data-skin="${deal.id}"></canvas><div><p class="kick">Today's print · 25% off</p><h3>${esc(deal.name)} <small>${esc(SLOTS.find((s) => s.id === deal.slot).name)}</small></h3><p><s>${deal.unlock.cost}</s> <b class="price">${ICON.acorn}${M.priceOf(S, deal.id, today())}</b></p><button class="btn secondary" data-buy="${deal.id}" ${M.canBuy(S, deal.id, today()) ? '' : 'disabled'}>${M.canBuy(S, deal.id, today()) ? 'Buy and wear' : `Need ${M.priceOf(S, deal.id, today()) - S.acorns} more`}</button></div></section>` : ''}
      <div class="slots" role="tablist">${SLOTS.map((s) => `<button class="slot ${!shopMap && s.id === shopSlot ? 'on' : ''}" data-slot="${s.id}">${esc(s.name)}</button>`).join('')}</div>
      <div class="slots map-filter" role="tablist" aria-label="Looks by map"><span class="mf-l">Maps</span>${mapChips.map((m) => `<button class="slot mf ${shopMap === m.id ? 'on' : ''}" data-shopmap="${m.id}" aria-pressed="${shopMap === m.id}"><i style="background:linear-gradient(160deg,${m.swatch[0]},${m.swatch[1]} 70%,${m.swatch[2]})"></i>${esc(MAP_SHORT[m.id] || m.name)}</button>`).join('')}</div>
      <p class="muted center">${esc(hint)} · collection ${col.owned}/${col.total} · skins never change the game</p>
      <ul class="grid">${items.map((it) => {
        const own = S.owned.includes(it.id), worn = S.loadout[it.slot] === it.id;
        const price = M.priceOf(S, it.id, today());
        let act;
        if (worn) act = `<span class="state worn">Wearing</span>`;
        else if (own) act = `<button class="btn secondary sm" data-equip="${it.id}">Wear</button>`;
        else if (price != null) act = `<button class="btn secondary sm buy" data-buy="${it.id}" ${S.acorns >= price ? '' : 'disabled'}>${ICON.acorn}${price}</button>`;
        else act = `<span class="state locked">${ICON.lock}${esc(M.unlockText(it))}</span>`;
        return `<li class="item ${worn ? 'worn' : ''} ${own ? 'own' : ''}"><canvas class="pv" data-skin="${it.id}"></canvas><p class="nm">${esc(it.name)}</p>${act}</li>`;
      }).join('')}</ul>`;
    body.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => { shopSlot = b.dataset.slot; shopMap = ''; sound.page(); render(); }));
    body.querySelectorAll('[data-shopmap]').forEach((b) => b.addEventListener('click', () => { shopMap = shopMap === b.dataset.shopmap ? '' : b.dataset.shopmap; sound.page(); render(); }));
    { const onm = body.querySelector('.map-filter .on'); if (onm) { const row = onm.parentElement; row.scrollLeft += onm.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - onm.clientWidth) / 2; } }
    body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const S2 = getSave(), id = b.dataset.buy, before = S2.acorns;
      if (!M.buy(S2, id, today())) return;
      M.equip(S2, id);
      const achs = M.checkAchievements(S2, null, {});
      persist(true);
      sound.buy();
      countWallet(before, S2.acorns);
      toast(`${SKIN[id].name} is yours, and you are wearing it`, 'buy');
      for (const a of achs) toast(`Badge: ${M.ACH[a].name} +${M.ACH[a].reward}`, 'badge');
      render();
    }));
    body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => { const S2 = getSave(); if (M.equip(S2, b.dataset.equip)) { persist(true); sound.equip(); render(); } }));
  }

  // ---- charms
  function renderCharms(S) {
    body.innerHTML = `
      <p class="muted center lead">Take one charm into a run. Scoring merges charge it; fire it with <b>E</b>, <b>Shift</b> or a tap on the charm badge. Charms are switched off on the daily tree and on challenge links, so those stay fair.</p>
      <ul class="charms">${Object.entries(CHARMS).map(([id, c]) => {
        const un = M.charmUnlocked(S, id), on = S.charm === id;
        return `<li class="charm ${on ? 'on' : ''} ${un ? '' : 'locked'}"><span class="cico" data-charm="${id}"></span><div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p><p class="muted">Charges after ${c.charge} scoring merges</p></div>${un ? (on ? `<button class="btn secondary sm" data-uncharm>Take off</button>` : `<button class="btn secondary sm" data-charm-eq="${id}">Take it</button>`) : `<span class="state locked">${ICON.lock}Level ${M.CHARM_LEVEL[id]}</span>`}</li>`;
      }).join('')}</ul>`;
    body.querySelectorAll('[data-charm]').forEach((el) => el.appendChild(iconCanvas((ctx, sz) => {
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(2, 2, sz / 2 - 3, 0, TAU); ctx.fill();
      ctx.fillStyle = M.charmUnlocked(getSave(), el.dataset.charm) ? OCHRE : '#ebdfc4'; ctx.beginPath(); ctx.arc(0, 0, sz / 2 - 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
      drawCharmIcon(ctx, el.dataset.charm, sz * 0.62);
    }, 56)));
    body.querySelectorAll('[data-charm-eq]').forEach((b) => b.addEventListener('click', () => { const S2 = getSave(); if (M.setCharm(S2, b.dataset.charmEq)) { persist(true); sound.charm(b.dataset.charmEq); render(); } }));
    body.querySelectorAll('[data-uncharm]').forEach((b) => b.addEventListener('click', () => { M.setCharm(getSave(), null); persist(true); sound.equip(); render(); }));
  }

  // ---- badges
  function renderBadges(S) {
    const n = Object.keys(S.ach).length;
    body.innerHTML = `<p class="muted center lead">${n} of ${M.ACHIEVEMENTS.length} badges stamped</p>
      <ul class="badges">${M.ACHIEVEMENTS.map((a, i) => {
        const got = !!S.ach[a.id];
        return `<li class="badge ${got ? 'got' : ''}" style="--r:${((i * 37) % 9) - 4}deg"><span class="seal"><b>${esc(a.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</b></span><h3>${esc(a.name)}</h3><p>${esc(a.text)}</p><p class="rw">${got ? `stamped ${esc(S.ach[a.id])}` : `${ICON.acorn}${a.reward}`}</p></li>`;
      }).join('')}</ul>`;
  }

  // ---- profile
  function renderProfile(S) {
    const st = S.stats;
    const mins = Math.round(st.time / 60);
    const rows = [
      ['Level', S.level], ['Runs', fmt(st.runs)], ['Best height', `${fmt(S.best.height)} m`], ['Best score', fmt(S.best.score)],
      ['Total climbed', `${fmt(st.meters)} m`], ['Treetops reached', fmt(st.treetops)], ['Best combo', `×${st.bestMult}`], ['Merges', fmt(st.merges)],
      ['Full blooms', fmt(st.blooms)], ['Golden hours', fmt(st.goldens)], ['Close calls', fmt(st.nearMisses)], ['Charms used', fmt(st.charmUses)],
      ['Acorns earned', fmt(S.earned)], ['Acorns spent', fmt(S.spent)], ['Daily trees', fmt(st.dailyRuns)], ['Time growing', mins < 1 ? '< 1 min' : `${fmt(mins)} min`],
      ['Longest streak', `${S.streak.best} days`], ['Collection', `${M.collection(S).owned}/${M.collection(S).total}`],
    ];
    body.innerHTML = `
      <section class="card"><header><span class="hico">${ICON.profile}</span><div><h3>Your rings</h3><p>Everything here stays on this device. No account, no tracking.</p></div></header>
      <dl class="stats">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>
      <section class="card"><header><div><h3>Your tallest trees</h3><p>Top five on this device</p></div></header>
      ${S.topRuns.length ? `<ol class="top">${S.topRuns.map((r, i) => `<li><span class="rk">${i + 1}</span><b>${fmt(r.h)} m</b><span>${fmt(r.s)} pts</span><code>tree ${esc(r.hash)}</code><small>${esc(r.d)}${r.daily ? ' · daily' : ''}</small></li>`).join('')}</ol>` : '<p class="muted">Grow a tree to start the list.</p>'}</section>`;
  }

  // ---- game over rewards
  function showRewards(out, opts = {}) {
    const box = $('rewards');
    if (!out) { box.hidden = true; return; }
    box.hidden = false;
    const S = getSave();
    $('rw-parts').textContent = out.acorns.parts.map(([k, v]) => `${k} ${v}`).join(' · ');
    const target = out.acorns.total;
    const el = $('rw-acorns');
    if (isCalm() || opts.instant) el.textContent = target;
    else { const t0 = performance.now(); const tick = (now) => { const k = Math.min(1, (now - t0) / 700); el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    const goals = out.levelUps.length ? out.goalsAfter : S.goals.map((g) => ({ text: M.describe(g), done: g.done }));
    $('rw-goals').innerHTML = `<span class="lvl-tag">Lv ${out.levelUps.length ? out.levelUps[out.levelUps.length - 1].level - 1 : S.level}</span>${goals.map((g) => `<span class="g ${g.done ? 'done' : ''}" title="${esc(g.text)}"><i>${g.done ? ICON.tick : ''}</i>${esc(g.text)}</span>`).join('')}`;
    const stamps = [];
    for (const l of out.levelUps) stamps.push({ k: 'level', t: `Level ${l.level}`, s: `+${l.reward}` });
    for (const c of out.charms) stamps.push({ k: 'charm', t: `Charm: ${CHARMS[c].name}`, s: 'unlocked' });
    for (const id of out.unlocked) stamps.push({ k: 'skin', t: SKIN[id].name, s: 'unlocked' });
    for (const a of out.achs) stamps.push({ k: 'badge', t: M.ACH[a].name, s: `+${M.ACH[a].reward}` });
    for (const c of out.daily) stamps.push({ k: 'daily', t: 'Daily done', s: `+${c.reward}` });
    for (const c of out.weekly) stamps.push({ k: 'weekly', t: 'Weekly done', s: `+${c.reward}` });
    if (out.extra && out.extra.length) stamps.unshift(...out.extra);
    // P8-ECON: gems and the word hunt
    if (out.econ) { if (out.econ.word) stamps.unshift({ k: 'daily', t: `Word: ${out.econ.word.word}`, s: out.econ.word.reward }); else if (out.econ.letter) stamps.unshift({ k: 'daily', t: `Letter ${out.econ.letter}`, s: 'word hunt' }); if (out.econ.gems) stamps.unshift({ k: 'badge', t: `+${out.econ.gems} dew gem${out.econ.gems > 1 ? 's' : ''}`, s: out.econ.parts.map((p) => p[0]).join(', ') }); }
    if (out.rings) $('rw-parts').textContent += ` · +${out.rings.total} rings`;
    const q = out.quest;
    if (q) {
      // quest: chests, titles and unlocks stamp in first; they matter most
      const qs = [];
      if (q.newStars) qs.push({ k: 'level', t: `+${q.newStars} star${q.newStars > 1 ? 's' : ''}`, s: `${q.stars}/3` });
      for (const c of q.chests) qs.push({ k: 'level', t: `Chest ${c.k}`, s: `+${c.acorns}` });
      for (const t of q.titles) qs.push({ k: 'badge', t: `Title: ${Q.TITLE[t].name}`, s: 'earned' });
      // V2-INT fix: at most 2 unlock chips; the rest roll into one '+N more unlocked'
      q.unlocks.slice(0, 2).forEach((u) => { const [kind, id] = u.split(':'); qs.push({ k: 'charm', t: kind === 'mode' ? `${MODE[id].name} mode` : kind === 'stake' ? `${STAKE[id].name} stake` : `World ${id}: ${WORLDS[id - 1].name}`, s: 'unlocked' }); });
      if (q.unlocks.length > 2) qs.push({ k: 'charm', t: `+${q.unlocks.length - 2} more`, s: 'unlocked' });
      if (q.stakeBest && q.stakeBestId) qs.push({ k: 'level', t: 'Stake best', s: '' });
      stamps.unshift(...qs);
    }
    const ul = $('rw-stamps');
    ul.innerHTML = stamps.slice(0, 6).map((s, i) => `<li class="stamp st-${s.k}" style="--d:${0.75 + i * 0.32}s;--r:${(i % 2 ? 2 : -3)}deg"><b>${esc(s.t)}</b><small>${esc(s.s)}</small></li>`).join('') + (stamps.length > 6 ? `<li class="stamp more" style="--d:${0.75 + 6 * 0.32}s">+${stamps.length - 6} more</li>` : '');
    ul.hidden = !stamps.length;
    if (!isCalm()) stamps.slice(0, 6).forEach((s, i) => setTimeout(() => { if (s.k === 'level') sound.levelUp(); else sound.stamp(); }, (0.75 + i * 0.32) * 1000));
    if (target > 0 && !isCalm()) setTimeout(() => flyAcorns($('rw-acorn-ico'), Math.min(8, 3 + (target / 12) | 0)), 250);
    setTimeout(() => countWallet(opts.before ?? out.total - target, out.total), isCalm() ? 0 : 700);
  }

  // ---- juice
  function countWallet(from, to) {
    const el = $('acorn-n');
    if (isCalm()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (now) => { const k = Math.min(1, (now - t0) / 650); el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    $('btn-wallet').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-3deg)' }, { transform: 'scale(1)' }], { duration: 420, delay: 380, easing: 'cubic-bezier(.2,1.35,.35,1)' });
  }
  function flyAcorns(fromEl, n) {
    if (isCalm() || !fromEl || bar.hidden) return;
    const a = fromEl.getBoundingClientRect(), b = $('acorn-ico').getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const d = document.createElement('span');
      d.className = 'fly'; d.innerHTML = ICON.acorn;
      document.body.appendChild(d);
      const x0 = a.left + a.width / 2 - 12 + (Math.random() - 0.5) * 30, y0 = a.top + a.height / 2 - 12;
      const x1 = b.left + b.width / 2 - 12, y1 = b.top + b.height / 2 - 12;
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 160, my = Math.min(y0, y1) - 60 - Math.random() * 80;
      const an = d.animate([
        { transform: `translate(${x0}px,${y0}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1.15) rotate(${(Math.random() - 0.5) * 60}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${x1}px,${y1}px) scale(.7)`, opacity: 1 },
      ], { duration: 620 + i * 40, delay: i * 55, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' });
      an.onfinish = () => { d.remove(); if (i % 2 === 0) sound.acorn(i); };
    }
  }
  function toast(text, kind = '') {
    const box = $('toasts');
    const t = document.createElement('p');
    t.className = 'toast ' + kind;
    t.innerHTML = `${kind === 'gift' ? ICON.gift : kind === 'badge' ? ICON.badges : kind === 'buy' ? ICON.shop : ICON.acorn}<span>${esc(text)}</span>`;
    box.appendChild(t);
    while (box.children.length > (innerWidth < 520 ? 2 : 3)) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
  }

  // ---- wiring
  dock.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); sound.page(); show(b.dataset.tab); }));
  book.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { sound.page(); show(b.dataset.tab); }));
  $('btn-meta-close').addEventListener('click', hide);
  book.addEventListener('pointerdown', (e) => { if (e.target === book) hide(); });
  $('btn-wallet').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); show('shop'); });
  $('btn-lvl').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); show('goals'); });
  $('btn-gift').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); claim($('btn-gift')); });

  if ($('btn-gems')) $('btn-gems').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); shopView = 'gems'; show('shop'); }); // P8-ECON
  return { refreshBar, show, hide, get isOpen() { return open; }, get tab() { return tab; }, showRewards, toast, claim, showShop(v) { shopView = v || 'skins'; show('shop'); } };
}
