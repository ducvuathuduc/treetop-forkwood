// Forkwood 2.0 META: the hub's rooms, loaded on first open.
//   shop     Offers → Free → Gems → Acorns → Skins (incl. vine skins) → Pods (odds on the card)
//   gallery  swipe the framed paintings with museum labels; unlock with acorns, $ packs, ad trial
//   grove    vine wardrobe, critters, skills, upgrades (+ the classic charms / badges / goals book)
//   pass     season pass: free track (earned, auto-granted) + premium track (stub purchase)
//   league   weekly practice league against seeded ghost growers
import * as R from './retention.js';
import { itemName } from './ui-grove.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (n) => Math.round(n).toLocaleString('en-US');
// critter skills from the approved v12 MECHANICS §2.4 (MECH stream implements them)
const SKILLS = { sparrow: ['Updraft Dash', 'Dash up and through one thin hazard.'], squirrel: ['Stash', 'Bank staged sunlight as if merged.'], owl: ['Night Sight', 'Slow the world; warnings come earlier.'], fox: ['Trickster Feint', 'A decoy tip draws crows and hornets.'], snail: ['Shell Up', 'A moment of full safety, then sap.'], moth: ['Lantern Call', 'Pull every nearby mote to you.'], frog: ['Tongue Snap', 'Grab the nearest pickup or gem.'], beetle: ['Horn Charge', 'Smash the next hazard you touch.'] };

export function createRooms(H) {
  const { ST, EC, MI, motion } = H;
  const S = () => H.getSave();
  const acornP = (n) => `<span class="pr acorn">${MI.acorn}${n0(n)}</span>`;
  const gemP = (n) => `<span class="pr gem">${MI.gem}${n0(n)}</span>`;
  const vineSVG = (tones, big) => `<svg class="vine-pv ${big ? 'big' : ''}" viewBox="0 0 60 80" aria-hidden="true"><path d="M30 78C30 58 24 50 18 40S14 18 28 6" fill="none" stroke="${tones[0]}" stroke-width="6" stroke-linecap="round"/><path d="M30 78C30 60 38 50 42 38S44 20 34 10" fill="none" stroke="${tones[0]}" stroke-width="4.5" stroke-linecap="round" opacity=".85"/><path d="M19 40c-7 0-11-4-12-10 7 0 11 4 12 10zM41 36c7-1 10-5 11-11-7 1-10 5-11 11zM27 18c-6-2-8-7-7-12 5 2 8 6 7 12z" fill="${tones[1]}" stroke="${tones[0]}" stroke-width="1.2"/></svg>`;
  const flash = (el) => motion.burst(el, { n: 10 });

  // ================================================================ SHOP
  function shop(body, opts) {
    const s = S(), T = ST.ensureStore(s), f = ST.freebie(s);
    const offers = ['pass_premium', 'starter_sprout', 'explorer_bundle', 'acorn_doubler', 'no_ads', 'dew_jar'].map((id) => ST.PRODUCT[id]).filter((p) => !(p.limit && T.owned.includes(p.id)) && !(p.id === 'starter_sprout' && !ST.offerLeft(s, p.id) && (s.stats.runs | 0) < 3));
    const pass = ST.PRODUCT.pass_premium, passPrice = ST.priceFor(pass, s);
    const adFree = ST.adAllowed(s, 'free_pod');
    body.innerHTML = `
      <nav class="chips" role="tablist">${ST.SECTIONS.map((x) => `<button class="chip-s" data-go="${x.id}">${x.name}</button>`).join('')}</nav>
      <section class="sec" data-sec="offers"><h3 class="sec-h">Offers</h3>
        <article class="card hero pass-hero" data-pid="pass_premium"><div class="ph-ribbon">${esc(R.seasonName(R.seasonKey()).split(' ')[0])}</div>
          <div class="ph-body"><p class="kick">Season Pass</p><h4>Premium track</h4><p class="muted">${esc(pass.blurb)}</p>
          <div class="row"><button class="mz-btn gold" data-buy="pass_premium">${passPrice < pass.price ? `<s>${ST.priceText({ price: pass.price })}</s> ` : ''}${ST.priceText(pass, s)}</button><button class="mz-btn ghost" data-buy="pass_plus">Plus ${ST.priceText(ST.PRODUCT.pass_plus, s)}</button></div></div>
          <span class="ph-medal" aria-hidden="true">${MI.pass}</span></article>
        <div class="grid">${offers.filter((p) => p.id !== 'pass_premium').map((p) => `<article class="card offer-card" data-pid="${p.id}"><span class="oc-ico">${p.id === 'acorn_doubler' ? MI.acorn : p.id === 'no_ads' ? MI.ad : p.id === 'dew_jar' ? MI.gem : p.id === 'explorer_bundle' ? MI.map : MI.gift}</span><h4>${esc(p.name)}</h4><p class="muted small">${esc(p.blurb)}</p>${p.id === 'dew_jar' ? `<p class="jar"><i style="width:${Math.min(100, (T.jar / 60) * 100)}%"></i><span>${T.jar}/60 gems</span></p>` : ''}${p.id === 'starter_sprout' ? `<p class="small fixed">30 gems · First Sprout vine · 3 boosts</p>` : ''}<button class="mz-btn gold" data-buy="${p.id}">${ST.priceText(p, s)}</button></article>`).join('')}</div>
      </section>
      <section class="sec" data-sec="free"><h3 class="sec-h">Free</h3><div class="grid">
        <article class="card free-card ${f.claimed ? 'done' : 'ready'}"><span class="oc-ico">${MI.gift}</span><h4>Today’s gift</h4><p class="big-txt">${esc(f.text)}</p>${f.claimed ? `<button class="mz-btn ghost" disabled>${MI.tick} Claimed</button>` : `<button class="mz-btn green" data-act="free">Claim</button>`}</article>
        <article class="card free-card next"><span class="oc-ico">${MI.lock}</span><h4>Tomorrow</h4><p class="big-txt">${esc(f.nextText)}</p><p class="muted small">Come back tomorrow</p></article>
        <article class="card free-card"><span class="oc-ico">${MI.pod}</span><h4>Free seed pod</h4><p class="muted small">Watch one short ad. 1 a day · ${ST.adsLeftToday(s)} of 8 ads left today.</p><button class="mz-btn ghost" data-act="adpod" ${adFree ? '' : 'disabled'}>${MI.ad} ${adFree ? 'Watch ad' : 'Tomorrow'}</button></article>
      </div></section>
      <section class="sec" data-sec="gems"><h3 class="sec-h">Gems</h3><div class="grid gems">${ST.gemPacksFor(s).map((p) => { const b = ST.badgeFor(p); return `<article class="card gem-card" data-pid="${p.id}">${b ? `<span class="badge">${esc(b)}</span>` : ''}<span class="gem-pile t${p.tier}">${MI.gem}</span><h4>${n0(p.grants.gems)} gems</h4><p class="rate">${esc(ST.exchangeText(p))}</p><button class="mz-btn gold" data-buy="${p.id}">${ST.priceText(p, s)}</button></article>`; }).join('')}</div></section>
      <section class="sec" data-sec="acorns"><h3 class="sec-h">Acorns</h3><div class="grid">${ST.PRODUCTS.filter((p) => p.section === 'acorns').map((p) => { const b = ST.badgeFor(p); return `<article class="card acorn-card">${b ? `<span class="badge">${esc(b)}</span>` : ''}<span class="gem-pile acorn">${MI.acorn}</span><h4>${n0(p.grants.acorns)} acorns</h4><p class="rate">${esc(ST.exchangeText(p))}</p><button class="mz-btn gold" data-ex="${p.id}">${gemP(p.priceGems)}</button></article>`; }).join('')}</div></section>
      <section class="sec" data-sec="skins"><h3 class="sec-h">Skins</h3><p class="muted small sec-note">Artist vines work on every world. Owning a world gives you its vine.</p><div class="grid skins">${ST.VINE_SKINS.map(skinCard).join('')}</div>
        <button class="mz-btn ghost wide" data-act="classic">Classic wardrobe: bark, leaves, sky, postcards</button></section>
      <section class="sec" data-sec="pods"><h3 class="sec-h">Pods</h3><div class="grid pods">${['seed', 'golden'].map(podCard).join('')}</div></section>
      <footer class="shop-foot"><p class="small muted">Prices in USD. Real-money purchases are not open yet: buttons show the real price and tell you when. 1 gem ≈ $0.10 ≈ ${ST.ACORNS_PER_GEM} acorns. Random items only in pods, with odds shown before you buy. Nothing bought changes daily, weekly, quest, race or duel trees.</p><button class="mz-btn ghost" data-act="restore">${MI.restore} Restore purchases</button></footer>`;
    const go = (id) => { const el = body.querySelector(`[data-sec="${id}"]`); if (el) body.scrollTo({ top: el.offsetTop - 62, behavior: H.isCalm() ? 'auto' : 'smooth' }); body.querySelectorAll('.chip-s').forEach((c) => c.classList.toggle('on', c.dataset.go === id)); };
    body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    bindCommon(body);
    body.querySelector('[data-act="free"]')?.addEventListener('click', (e) => {
      const r = ST.claimFreebie(S()); if (!r) return; H.persist(false);
      const kind = r.kind === 'gem' ? 'gem' : 'acorn';
      H.claimFx(e.currentTarget, kind, r.kind === 'acorn' ? 9 : 4).then(() => { if (r.pod) H.toast(`Seed pod: ${podText(r.pod)}`, 'gift'); H.refreshAll(); });
    });
    body.querySelector('[data-act="adpod"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget, r = await ST.rewarded(S(), 'free_pod'); H.persist(false);
      if (r.status === 'rewarded') { const pod = EC.openPod(S()); H.persist(false); H.claimFx(btn, 'acorn', 6); H.toast(`Seed pod: ${podText(pod)}`, 'gift'); H.refreshAll(); }
      else H.toast(r.status === 'capped' ? 'That one is done for today.' : 'Ads are coming soon. Thanks for trying: we counted it.', 'badge');
    });
    body.querySelector('[data-act="classic"]').addEventListener('click', () => { H.closeRoom(); H.openOldShop('skins'); });
    body.querySelector('[data-act="restore"]').addEventListener('click', async () => { const n = await ST.restore(S()); H.toast(n ? `Restored ${n}` : 'Nothing to restore yet.', 'badge'); });
    body.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
      const r = ST.exchange(S(), b.dataset.ex);
      if (r.status === 'success') { H.persist(false); H.claimFx(b, 'acorn', 10).then(H.refreshAll); }
      else H.toast(`You need ${r.need} more gem${r.need > 1 ? 's' : ''}.`, 'badge');
    }));
    body.querySelectorAll('[data-pod]').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.pod, res = kind === 'golden' ? EC.buyGolden(S()) : EC.buyPod(S());
      if (!res) { H.toast(kind === 'golden' ? 'Not enough gems yet.' : 'Not enough acorns yet.', 'badge'); return; }
      H.persist(false); revealPod(kind, res, b);
    }));
    if (opts.section) requestAnimationFrame(() => go(opts.section));
    body.onscroll = () => { const secs = [...body.querySelectorAll('[data-sec]')]; let cur = secs[0].dataset.sec; for (const x of secs) if (x.offsetTop - 80 <= body.scrollTop) cur = x.dataset.sec; body.querySelectorAll('.chip-s').forEach((c) => c.classList.toggle('on', c.dataset.go === cur)); };
    body.onscroll();
  }
  function skinCard(v) {
    const s = S(), own = ST.ownsSkin(s, v.id), on = ST.ensureStore(s).vineSkin === v.id || (!ST.ensureStore(s).vineSkin && v.id === H.WORLD[H.currentWorld()].vine);
    const needWorld = v.how.world && !ST.ownsWorld(s, v.how.world);
    const price = v.how.acorns ? acornP(v.how.acorns) : v.how.gems ? gemP(v.how.gems) : '';
    const how = v.how.product ? (v.how.product === 'starter_sprout' ? 'In the Starter Sprout' : 'In the Explorer Bundle') : v.how.pass ? 'Season Pass tier 30' : needWorld ? `Unlock ${H.WORLD[v.how.world].name} first` : '';
    return `<article class="card skin-card ${own ? 'own' : ''} ${on ? 'on' : ''}">${vineSVG(v.tones)}<h4>${esc(v.name)}</h4>${v.world ? `<p class="small muted">${esc(H.WORLD[v.world].medium)}</p>` : '<p class="small muted">Exclusive</p>'}
      ${own ? `<button class="mz-btn ${on ? 'ghost' : 'green'}" data-equip="${v.id}" ${on ? 'disabled' : ''}>${on ? `${MI.tick} Worn` : 'Wear'}</button>` : how ? `<p class="small how">${esc(how)}</p>` : `<button class="mz-btn gold" data-skin="${v.id}">${price}</button>`}</article>`;
  }
  function podCard(kind) {
    const s = S(), info = ST.POD_INFO[kind], cost = info.cost(s), odds = ST.oddsFor(kind);
    return `<article class="card pod-card ${kind}"><span class="pod-art ${kind}" aria-hidden="true">${MI.pod}</span><h4>${info.name}</h4>
      <table class="odds mini">${odds.map((o) => `<tr><td>${esc(o.text)}</td><td>${o.pct}%</td></tr>`).join('')}</table>
      <div class="row"><button class="mz-btn gold" data-pod="${kind}">${cost.acorns ? acornP(cost.acorns) : gemP(cost.gems)}</button><button class="mz-icon" data-odds="${kind}" aria-label="Drop rates">${MI.info}</button></div><p class="small muted">${esc(info.note)}</p></article>`;
  }
  function podText(r) { if (!r) return ''; if (r.acorns) return `+${n0(r.acorns)} acorns`; if (r.gems) return `+${r.gems} gem${r.gems > 1 ? 's' : ''}`; if (r.boosts && r.boosts.length) return r.boosts.map((b) => EC.BOOSTS[b] ? EC.BOOSTS[b].name : b).join(', '); if (r.boost) return EC.BOOSTS[r.boost] ? EC.BOOSTS[r.boost].name : r.boost; if (r.skin) return 'a new skin!'; return r.text || 'a surprise'; }
  function revealPod(kind, res, from) {
    const card = H.openSheet(`<div class="pod-reveal ${kind}"><span class="pod-art ${kind} open">${MI.pod}</span></div><p class="kick">${ST.POD_INFO[kind].name}</p><h3>${esc(podText(res))}</h3><div class="row"><button class="mz-btn green" data-x>Collect</button></div>`, { cls: 'reveal' });
    const art = card.querySelector('.pod-art'); motion.popIn(art); setTimeout(() => motion.burst(art, { n: 16 }), 220);
    card.querySelector('[data-x]').addEventListener('click', (e) => { const k = res.gems ? 'gem' : 'acorn'; H.claimFx(e.currentTarget, k, res.gems ? 3 : 8); H.closeSheet(); H.refreshAll(); });
  }
  function bindCommon(body) {
    body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); H.buy(b.dataset.buy, 'shop'); }));
    body.querySelectorAll('[data-odds]').forEach((b) => b.addEventListener('click', () => H.oddsSheet(b.dataset.odds)));
    body.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => {
      const r = ST.buySkin(S(), b.dataset.skin);
      if (r.status === 'success') { H.persist(false); ST.equipSkin(S(), b.dataset.skin); H.persist(false); emitSkin(); flash(b); if (H.sound.buy) H.sound.buy(); setTimeout(H.refreshAll, 350); }
      else H.toast(r.status === 'short' ? `You need ${n0(r.need)} more ${r.cur}.` : r.status === 'locked' ? 'Unlock that world first.' : 'Not available.', 'badge');
    }));
    body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => { if (ST.equipSkin(S(), b.dataset.equip)) { H.persist(false); emitSkin(); if (H.sound.equip) H.sound.equip(); flash(b); setTimeout(H.refreshAll, 300); } }));
  }
  const emitSkin = () => { try { window.dispatchEvent(new CustomEvent('forkwood:vine-skin', { detail: { id: ST.ensureStore(S()).vineSkin } })); } catch { /* ignore */ } };

  // ================================================================ GALLERY
  function gallery(body, opts = {}) {
    const s = S(), cur = H.currentWorld(), focus = opts.focus && H.WORLD[opts.focus] ? opts.focus : cur; // v3 HOME: a locked seed/fruit opens its world
    const items = H.WORLDS.map((w) => {
      const own = ST.ownsWorld(s, w.id), price = EC.MAP_PRICE[w.legacy] || 0, trial = ST.adAllowed(s, 'map_trial');
      return `<article class="gal-item ${own ? 'own' : 'locked'} ${w.id === cur ? 'cur' : ''}" data-w="${w.id}">
        <div class="gal-frame">${H.frameHTMLRef(w.id, { lazy: w.id !== cur, locked: !own })}</div>
        ${H.labelHTMLRef(w.id, `<span class="ml-blurb">${esc(w.blurb)}</span>`)}
        <div class="gal-act">${own ? (w.id === cur ? `<button class="mz-btn ghost" disabled>${MI.tick} Growing here</button><button class="mz-btn green" data-act="climb">${MI.play} Climb</button>` : `<button class="mz-btn green" data-act="hang">Grow here</button>`)
          : `<button class="mz-btn green" data-act="unlock">${MI.lock} ${acornP(price)}</button><button class="mz-btn gold" data-buy="world_pack_${w.id}">Pack ${ST.priceText(ST.PRODUCT['world_pack_' + w.id], s)}</button><button class="mz-btn ghost" data-act="trial" ${trial ? '' : 'disabled'}>${MI.ad} Try once</button>`}</div>
      </article>`;
    }).join('');
    body.innerHTML = `<div class="gallery" tabindex="0">${items}</div><div class="gal-dots">${H.WORLDS.map((w) => `<i data-d="${w.id}" class="${w.id === cur ? 'on' : ''}"></i>`).join('')}</div>
      <article class="card bundle-card"><span class="oc-ico">${MI.map}</span><div><h4>Explorer Bundle</h4><p class="muted small">${esc(ST.PRODUCT.explorer_bundle.blurb)}</p></div><button class="mz-btn gold" data-buy="explorer_bundle">${ST.priceText(ST.PRODUCT.explorer_bundle, s)}</button></article>`;
    const gal = body.querySelector('.gallery');
    requestAnimationFrame(() => { const c = gal.querySelector(`[data-w="${focus}"]`) || gal.querySelector('.cur'); if (c) gal.scrollLeft = c.offsetLeft - (gal.clientWidth - c.clientWidth) / 2; });
    gal.addEventListener('scroll', () => { const mid = gal.scrollLeft + gal.clientWidth / 2; let best = null, bd = 1e9; for (const it of gal.children) { const d = Math.abs(it.offsetLeft + it.clientWidth / 2 - mid); if (d < bd) { bd = d; best = it; } } if (best) body.querySelectorAll('.gal-dots i').forEach((i) => i.classList.toggle('on', i.dataset.d === best.dataset.w)); }, { passive: true });
    body.querySelectorAll('.gal-dots i').forEach((d) => d.addEventListener('click', () => { const it = gal.querySelector(`[data-w="${d.dataset.d}"]`); gal.scrollTo({ left: it.offsetLeft - (gal.clientWidth - it.clientWidth) / 2, behavior: 'smooth' }); }));
    bindCommon(body);
    body.querySelectorAll('.gal-item').forEach((it) => {
      const id = it.dataset.w, w = H.WORLD[id];
      it.querySelector('[data-act="hang"]')?.addEventListener('click', (e) => { H.chooseWorld(id); flash(e.currentTarget); if (H.sound.equip) H.sound.equip(); setTimeout(() => gallery(body, {}), 260); });
      it.querySelector('[data-act="climb"]')?.addEventListener('click', () => H.play());
      it.querySelector('[data-act="unlock"]')?.addEventListener('click', (e) => {
        const btn = e.currentTarget, paid = EC.buyMap(S(), w.legacy);
        if (!paid) { H.toast(`You need ${n0(EC.MAP_PRICE[w.legacy] - S().acorns)} more acorns. Climb, claim gifts, or swap gems in the shop.`, 'badge'); return; }
        H.persist(false); if (H.sound.buy) H.sound.buy();
        motion.burst(it.querySelector('.frame'), { n: 18 });
        it.querySelector('.fr-rope')?.classList.add('drop');
        setTimeout(() => { H.chooseWorld(id); H.toast(`${w.name} is yours. Its ${ST.VINE_SKINS.find((v) => v.world === id).name} vine too.`, 'gift'); gallery(body); H.refreshAll(); }, 650);
      });
      it.querySelector('[data-act="trial"]')?.addEventListener('click', async () => { const r = await ST.rewarded(S(), 'map_trial'); H.persist(false); H.toast(r.status === 'rewarded' ? `One climb in ${w.name}: the trial hook is ready for ENGINE.` : 'Ad trials are coming soon. We counted your tap.', 'badge'); if (r.status === 'rewarded') try { window.dispatchEvent(new CustomEvent('forkwood:world-trial', { detail: { id, legacy: w.legacy } })); } catch { /* ignore */ } });
    });
  }

  // ================================================================ GROVE
  function grove(body) {
    const s = S(), T = ST.ensureStore(s);
    const crit = R.PORTRAITS.map((p) => { const un = R.itemUnlocked(s, p.unlock), on = s.ret.avatar.portrait === p.id; return `<article class="tile critter ${un ? '' : 'locked'} ${on ? 'on' : ''}" data-crit="${p.id}"><span class="cr-av">${R.avatarHTML(p.id, s.ret.avatar.frame, 54)}</span><b>${esc(p.name)}</b><small>${un ? (on ? 'With you' : 'Tap to bring') : esc(R.unlockLabel(p.unlock))}</small></article>`; }).join('');
    const skills = Object.entries(SKILLS).map(([id, [n, d]]) => `<article class="tile skill"><span class="sk-ico">${MI.skill}</span><b>${esc(n)}</b><small>${esc((R.PORTRAIT[id] || {}).name || id)} · ${esc(d)}</small><span class="soon-tag">Arrives with critter skills</span></article>`).join('');
    const ups = EC.UPGRADE_IDS.map((id) => { const u = EC.UPGRADES[id], lv = EC.upLevel(s, id), c = EC.upCost(s, id); return `<article class="tile up"><b>${esc(u.name)}</b><small>${esc(u.blurb)}</small><span class="pips">${Array.from({ length: EC.MAX_UP }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span><span class="small">${EC.upValue(id, lv)} ${u.unit}${c ? ` → ${EC.upValue(id, lv + 1)}` : ''}</span>${c ? `<button class="mz-btn gold" data-up="${id}">${acornP(c)}</button>` : `<span class="small muted">Max</span>`}</article>`; }).join('');
    body.innerHTML = `
      <section class="sec"><h3 class="sec-h">${MI.vine} Vine wardrobe</h3><div class="grid skins">${ST.VINE_SKINS.filter((v) => ST.ownsSkin(s, v.id)).map(skinCard).join('')}<button class="card skin-card more" data-act="moreskins">${MI.shop}<h4>More vines</h4><p class="small muted">In the shop</p></button></div></section>
      <section class="sec"><h3 class="sec-h">${MI.critter} Critters</h3><div class="grid tiles">${crit}</div></section>
      <section class="sec"><h3 class="sec-h">${MI.skill} Skills</h3><p class="muted small sec-note">Each critter brings one skill on the charm button. Off in fair modes.</p><div class="grid tiles">${skills}</div></section>
      <section class="sec"><h3 class="sec-h">${MI.up} Upgrades</h3><div class="grid tiles">${ups}</div></section>
      <section class="sec"><h3 class="sec-h">Collection</h3><div class="grid book">${[['goals', 'Goals'], ['charms', 'Charms'], ['badges', 'Badges'], ['profile', 'Rings & profile']].map(([t, n]) => `<button class="tile book-btn" data-book="${t}"><b>${n}</b></button>`).join('')}<button class="tile book-btn" data-streak><b>Streak & duels</b></button></div></section>`;
    bindCommon(body);
    body.querySelector('[data-act="moreskins"]').addEventListener('click', () => H.openRoom('shop', { section: 'skins' }));
    body.querySelectorAll('[data-crit]').forEach((t) => t.addEventListener('click', () => { if (t.classList.contains('locked')) { H.toast(t.querySelector('small').textContent, 'badge'); return; } R.setAvatar(S(), 'portrait', t.dataset.crit); H.persist(false); flash(t); if (H.sound.equip) H.sound.equip(); setTimeout(() => grove(body), 250); }));
    body.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const r = EC.buyUpgrade(S(), b.dataset.up); if (!r) { H.toast('Not enough acorns yet.', 'badge'); return; } H.persist(false); flash(b); if (H.sound.buy) H.sound.buy(); setTimeout(() => { grove(body); H.refreshAll(); }, 300); }));
    body.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => { H.closeRoom(); H.openGoals(b.dataset.book); }));
    body.querySelector('[data-streak]').addEventListener('click', () => { H.closeRoom(); H.openGrove('streak'); });
    void T;
  }

  // ================================================================ PASS
  function pass(body) {
    const s = S(), T = ST.ensureStore(s), at = R.tierAt(s.ret.season.xp | 0), tier = at.tier, prem = T.passPremium, seen = T.passSeen | 0;
    const freeTxt = (t) => { const r = R.SEASON_REWARDS[t]; if (r && r.item) return itemName(r.item); const g = []; const a = R.tierAcorns(t); if (a) g.push(`${a} acorns`); if (r && r.freeze) g.push('Frost guard'); if (EC.GEM.season[t]) g.push(`${EC.GEM.season[t]} gems`); return g.join(' + ') || `${a} acorns`; };
    const rows = [];
    for (let t = 1; t <= R.SEASON_TIERS; t++) {
      const reached = t <= tier, pr = ST.PASS_PREMIUM[t];
      rows.push(`<div class="tier ${reached ? 'got' : ''} ${t === tier + 1 ? 'next' : ''} ${reached && t > seen ? 'new' : ''}"><span class="t-n">${t}</span>
        <div class="t-free">${reached ? MI.tick : ''}<span>${esc(freeTxt(t))}</span></div>
        <div class="t-prem ${prem ? '' : 'locked'}">${pr ? `${prem ? (reached ? MI.tick : '') : MI.lock}<span>${esc(ST.premiumText(pr))}</span>` : '<span class="muted">·</span>'}</div></div>`);
    }
    const p = ST.PRODUCT.pass_premium;
    body.innerHTML = `<div class="pass-top card"><div><p class="kick">Season ${esc(R.seasonName(R.seasonKey()))}</p><h4>Tier ${tier} of ${R.SEASON_TIERS}</h4><p class="bar"><i style="width:${at.need ? (at.into / at.need) * 100 : 100}%"></i></p><p class="small muted">${at.need ? `${at.into}/${at.need} rings to tier ${tier + 1} · every climb earns rings` : 'Season complete'}</p></div>
      ${prem ? `<span class="badge">Premium</span>` : `<button class="mz-btn gold" data-buy="pass_premium">Unlock premium ${ST.priceText(p, s)}</button>`}</div>
      <div class="tier head"><span class="t-n">#</span><div class="t-free"><b>Free</b></div><div class="t-prem"><b>Premium</b></div></div>
      <div class="tiers">${rows.join('')}</div>
      <p class="small muted center">Free rewards are added the moment you reach a tier. Buying premium late pays every tier you already passed.</p>`;
    bindCommon(body);
    const nx = body.querySelector('.tier.next') || body.querySelector('.tier.got:last-of-type');
    if (nx) requestAnimationFrame(() => { body.scrollTop = Math.max(0, nx.offsetTop - body.clientHeight / 2); });
    const fresh = body.querySelectorAll('.tier.new');
    fresh.forEach((r, i) => setTimeout(() => motion.burst(r.querySelector('.t-free'), { n: 8 }), 300 + i * 120));
    if (tier > seen) { T.passSeen = tier; H.persist(false); }
  }

  // ================================================================ LEAGUE
  function league(body) {
    const s = S(), L = s.ret.league, list = R.standings(s), T = ST.ensureStore(s);
    const left = (() => { const now = new Date(), ws = R.weekStart(now); return +ws + 7 * 864e5 - now; })();
    const d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 3600e3);
    body.innerHTML = `<div class="card lg-top"><span class="lg-crest">${MI.league}</span><div><p class="kick">This week</p><h4>${esc(R.TIERS[L.tier])} league</h4><p class="small muted">Ends in ${d}d ${h}h · top ${R.PROMOTE} move up, bottom 2 move down</p></div></div>
      ${L.result ? `<p class="card small lg-res">Last week: #${L.result.rank} in ${esc(R.TIERS[L.result.from])}${L.result.to > L.result.from ? ` → promoted to ${esc(R.TIERS[L.result.to])}` : ''} · +${L.result.acorns} acorns</p>` : ''}
      <ol class="lg-list">${list.map((r, i) => `<li class="lg-row ${r.you ? 'you' : ''} ${i < R.PROMOTE ? 'up' : i >= list.length - 2 ? 'down' : ''}"><span class="lg-rank">${i + 1}</span><span class="lg-av">${R.avatarHTML(R.PORTRAITS[r.portrait] ? R.PORTRAITS[r.portrait].id : 'sparrow', 'twig', 34)}</span><span class="lg-name">${esc(r.you ? (r.name || 'You') : r.name)}${r.you ? ' <small>(you)</small>' : ''}</span><span class="lg-score">${n0(r.score)}</span></li>`).join('')}</ol>
      <p class="small muted center">A practice league: your rivals are seeded ghost growers, the same for everyone in your tier this week. Rings come from every climb.</p>`;
    if (!T.intro.leagueSeen) { T.intro.leagueSeen = true; H.persist(false); }
  }

  const TITLES = { shop: ['Gift shop', 'Offers, gems, skins and pods'], gallery: ['Worlds', 'Seven living worlds to grow through'], grove: ['The Grove', 'Vines, critters, skills, upgrades'], pass: ['Season Pass', 'Climb to fill the track'], league: ['League', 'Weekly practice league'] };
  return {
    render(id, body, opts = {}) { body.onscroll = null; ({ shop, gallery, grove, pass, league })[id](body, opts); },
    title: (id) => TITLES[id][0], sub: (id) => TITLES[id][1],
  };
}
