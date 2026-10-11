// The Grove: streak, season track, practice league, duels and your profile
// (avatar, name, badge, tree look). Lazy-loaded the first time it opens.
// Everything is local to this device; the league's rivals are ghost growers
// generated from the week's seed and the UI says so.
import { ICON } from './icons.js';
import * as R from './retention.js';
import { SKIN } from './skins.js';
import * as Q from './quest.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const TABS = [['streak', 'Streak', ICON.flame], ['season', 'Season', ICON.level], ['league', 'League', ICON.badges], ['duels', 'Duels', ICON.duel], ['profile', 'Profile', ICON.profile]];
const hrs = (ms) => { const h = Math.max(0, Math.floor(ms / 36e5)); return h >= 48 ? `${Math.floor(h / 24)} days` : `${h} h`; };

export function itemName(id) {
  const [kind, key] = id.split('.');
  if (kind === 'portrait') return `Portrait: ${(R.PORTRAIT[key] || {}).name || key}`;
  if (kind === 'frame') return `Frame: ${(R.FRAME[key] || {}).name || key}`;
  return SKIN[id] ? `${SKIN[id].name}` : id;
}

export function createGroveUI({ getSave, persist, sound, onOpen, onClose, onStory, onShop, onAvatar }) {
  const box = document.createElement('section');
  box.id = 'grove'; box.className = 'overlay'; box.setAttribute('aria-label', 'Grove: streak, season, league, duels and profile');
  box.innerHTML = `<div class="panel glass meta-panel grove-panel">
    <header class="meta-head"><div class="tabs" role="tablist">${TABS.map(([id, n, ic]) => `<button data-gtab="${id}" role="tab"><span class="ti">${ic}</span><span>${n}</span></button>`).join('')}</div>
    <button class="icon gclose" aria-label="Close" title="Close (Esc)">${ICON.close}</button></header>
    <div class="meta-body grove-body"></div></div>`;
  document.body.appendChild(box);
  const body = box.querySelector('.grove-body');
  let tab = 'streak', open = false;

  function show(t = tab) {
    tab = t; open = true;
    box.classList.add('show'); document.body.classList.add('book');
    for (const b of box.querySelectorAll('[data-gtab]')) { const on = b.dataset.gtab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    render();
    if (onOpen) onOpen();
  }
  function hide() { if (!open) return; open = false; box.classList.remove('show'); document.body.classList.remove('book'); if (onClose) onClose(); }

  function render() {
    const S = getSave();
    R.ensure(S);
    body.scrollTop = 0;
    ({ streak: renderStreak, season: renderSeason, league: renderLeague, duels: renderDuels, profile: renderProfile })[tab](S);
  }

  // ---- streak
  function renderStreak(S) {
    const st = S.streak, nm = R.nextMilestone(S);
    const today = R.dayKey();
    const days = new Set(S.ret.days.concat(st.last ? [st.last] : []));
    // last 28 days, oldest first, as a small calendar
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(Date.parse(today + 'T12:00:00Z') - i * 864e5), k = R.dayKey(d);
      cells.push(`<li class="${days.has(k) ? 'on' : ''} ${k === today ? 'today' : ''}" title="${k}"><span>${d.getUTCDate()}</span></li>`);
    }
    const pct = nm ? Math.min(100, Math.round((st.count / nm.d) * 100)) : 100;
    body.innerHTML = `
      <section class="card streak-hero">
        <div class="flame-big">${ICON.flame}<b>${st.count}</b></div>
        <div><h3>${st.count > 0 ? `${st.count}-day streak` : 'Start a streak today'}</h3>
        <p>A day counts when you finish a run or open the daily gift (UTC days). Best: <b>${st.best}</b> days.</p>
        <p class="guards">${[0, 1].map((i) => `<span class="guard ${i < st.freezes ? 'on' : ''}">${ICON.frost}</span>`).join('')}<span>Frost guards ${st.freezes}/2: each saves one missed day. Earned every 7th day, on league promotion and on the season track.</span></p></div>
      </section>
      ${nm ? `<section class="card"><header><div><h3>Next milestone: ${nm.d} days</h3><p>${nm.d - st.count} to go · +${nm.acorns} acorns${nm.item ? ` and ${esc(itemName(nm.item))}` : ''}</p></div></header>
        <span class="prog big"><span class="fill" style="width:${pct}%"></span></span></section>` : ''}
      <section class="card"><header><div><h3>Last 28 days</h3><p>Filled days are days you grew a tree</p></div></header><ol class="cal28">${cells.join('')}</ol></section>
      <section class="card"><header><div><h3>Milestones</h3><p>Paid once, the day you reach them</p></div></header>
        <ul class="ms">${R.STREAK_MILESTONES.map((m) => { const got = S.ret.streakMs.includes(m.d); return `<li class="${got ? 'got' : ''}"><span class="d">${m.d}<small>days</small></span><span class="rw">${ICON.acorn}${m.acorns}${m.item ? ` · ${esc(itemName(m.item))}` : ''}</span><span class="state">${got ? ICON.tick : ''}</span></li>`; }).join('')}</ul></section>`;
  }

  // ---- season
  function renderSeason(S) {
    const Se = S.ret.season, at = R.tierAt(Se.xp);
    const rows = [];
    for (let t = 1; t <= R.SEASON_TIERS; t++) {
      const rw = R.SEASON_REWARDS[t] || {}, got = t <= at.tier;
      const what = rw.item ? esc(itemName(rw.item)) + (rw.acorns ? ` + ${rw.acorns}` : '') : `${R.tierAcorns(t)} acorns`;
      rows.push(`<li class="${got ? 'got' : ''} ${t === at.tier + 1 ? 'next' : ''} ${rw.item ? 'prize' : ''}"><span class="t">${t}</span><span class="w">${rw.item ? ICON.chest : ICON.acorn}${what}${rw.freeze ? ' + frost guard' : ''}</span><span class="state">${got ? ICON.tick : ''}</span></li>`);
    }
    const pct = at.need ? Math.round((at.into / at.need) * 100) : 100;
    body.innerHTML = `
      <section class="card season-hero"><header><span class="hico">${ICON.level}</span><div><h3>Grove season · ${esc(R.seasonName(Se.id || R.seasonKey()))}</h3>
        <p>Free track, earned only by playing. Rings come from every run (height, goals, challenges, first run of the day). Rewards are paid the moment you reach a tier. Ends in ${hrs(R.seasonEndsIn())}.</p></div></header>
        <div class="tierline"><b>Tier ${at.tier}</b><span class="prog big"><span class="fill" style="width:${pct}%"></span></span><small>${at.need ? `${at.into}/${at.need} rings` : 'complete'}</small></div></section>
      <section class="card"><ol class="track">${rows.join('')}</ol></section>`;
    const nx = body.querySelector('.track .next');
    if (nx) requestAnimationFrame(() => nx.scrollIntoView({ block: 'center' }));
  }

  // ---- league
  function renderLeague(S) {
    const L = S.ret.league, list = R.standings(S), tier = R.TIERS[L.tier];
    const endMs = R.weekStart().getTime() + 7 * 864e5 - Date.now();
    const rows = list.map((r, i) => {
      const zone = i < R.PROMOTE && L.tier < R.TIERS.length - 1 ? 'up' : i >= R.LEAGUE_SIZE - R.DEMOTE && L.tier > 0 ? 'down' : '';
      const av = r.you ? R.avatarHTML(S.ret.avatar.portrait, S.ret.avatar.frame, 30) : R.avatarHTML(R.PORTRAITS[r.portrait].id, 'twig', 30);
      return `<li class="${r.you ? 'you' : 'ghost'} ${zone}"><span class="rk">${i + 1}</span>${av}<span class="nm">${esc(r.you ? (S.ret.name || 'You') : r.name)}${r.you ? '' : '<small>ghost</small>'}</span><b>${fmt(r.score)}</b></li>`;
    }).join('');
    const res = L.result;
    body.innerHTML = `
      <section class="card league-hero"><div class="ladder">${R.TIERS.map((t, i) => `<span class="${i === L.tier ? 'on' : i < L.tier ? 'past' : ''}">${t}</span>`).join('')}</div>
        <h3>${esc(tier)} league · week ${esc(L.week.split('-W')[1] || '')}</h3>
        <p>Top ${R.PROMOTE} move up, bottom ${R.DEMOTE} move down when the week ends (in ${hrs(endMs)}). Your score is the rings you earn this week.</p>
        <p class="honest">${ICON.lock}<span>Practice league: your nine rivals are <b>ghost growers</b> simulated from this week's seed (the same for everyone), not live players. Nothing leaves your device.</span></p></section>
      ${res ? `<section class="card result ${res.to > res.from ? 'up' : res.to < res.from ? 'down' : ''}"><h3>Last week: #${res.rank} in ${esc(R.TIERS[res.from])}</h3><p>${res.to > res.from ? `Promoted to ${esc(R.TIERS[res.to])}` : res.to < res.from ? `Moved down to ${esc(R.TIERS[res.to])}` : 'Stayed'} · +${res.acorns} acorns${res.freeze ? ' · +1 frost guard' : ''}</p></section>` : ''}
      <section class="card"><ol class="standings">${rows}</ol></section>`;
  }

  // ---- duels
  function renderDuels(S) {
    const D = S.ret.duels;
    const sent = D.sent.slice().reverse().map((d) => `<li><code>${esc(d.id)}</code><b>${fmt(d.h)} m</b><small>${esc(d.d)}</small><span class="st ${d.res || ''}">${d.res === 'win' ? 'you won' : d.res === 'lose' ? 'they won' : 'waiting for an answer'}</span></li>`).join('');
    const done = D.done.slice().reverse().map((d) => `<li class="${d.won ? 'win' : 'lose'}"><span class="st">${d.won ? 'won' : 'lost'}</span><span>${esc(d.as === 'racer' ? `vs ${d.from}` : `${d.from} answered`)}</span><b>${fmt(d.mine)} m</b><small>vs ${fmt(d.theirs)} m</small></li>`).join('');
    body.innerHTML = `
      <section class="card"><header><span class="hico">${ICON.duel}</span><div><h3>Duel a friend</h3>
        <p>After any endless or daily run, tap <b>Duel</b> on the result card. The link carries your course, height and pace: your friend grows the exact same tree while your <b>rival tip</b> climbs beside them. When they send their answer back, both of you get acorns (+${R.DUEL_WIN} for the winner, +${R.DUEL_PLAY} for taking part), on each device.</p></div></header></section>
      <section class="card"><header><div><h3>Duels you sent</h3><p>${D.sent.length ? 'Settled when you open your friend\u2019s answer link' : 'None yet'}</p></div></header>${sent ? `<ul class="duels">${sent}</ul>` : ''}</section>
      <section class="card"><header><div><h3>Results</h3><p>${D.done.length ? '' : 'Race a friend\u2019s link to see it here'}</p></div></header>${done ? `<ul class="duels res">${done}</ul>` : ''}</section>`;
  }

  // ---- profile
  function renderProfile(S) {
    const A = S.ret.avatar;
    const badges = [['', 'None']].concat(Object.keys(S.ach).map((id) => [id, id])).concat((S.quest.titles || []).map((t) => ['title:' + t, Q.TITLE[t] ? Q.TITLE[t].name : t]));
    const achName = (id) => { if (!id) return 'None'; if (id.startsWith('title:')) { const t = id.slice(6); return Q.TITLE[t] ? Q.TITLE[t].name : t; } return achLabel(id); };
    const L = S.ret.league;
    body.innerHTML = `
      <section class="card profile-hero">${R.avatarHTML(A.portrait, A.frame, 96)}
        <div><label class="nm-l">Name on your duels <input id="g-name" maxlength="12" value="${esc(S.ret.name)}" placeholder="Grower" autocomplete="off" spellcheck="false" /></label>
        <p class="facts"><span>${ICON.flame}${S.streak.count}-day streak</span><span>${ICON.badges}${esc(R.TIERS[L.tier])} league</span><span>${ICON.level}Season tier ${R.tierAt(S.ret.season.xp).tier}</span></p>
        ${A.badge ? `<p class="badge-on">${ICON.star}${esc(achName(A.badge))}</p>` : ''}</div></section>
      <section class="card"><header><div><h3>Portrait</h3><p>Earn more on the season track, streaks and the league</p></div></header>
        <ul class="pick">${R.PORTRAITS.map((p) => { const own = S.ret.owned.includes('portrait.' + p.id); return `<li><button class="${A.portrait === p.id ? 'on' : ''}" data-portrait="${p.id}" ${own ? '' : 'disabled'} title="${esc(p.name)}${own ? '' : ' · ' + esc(R.unlockLabel(p.unlock))}">${R.avatarHTML(p.id, 'twig', 52)}${own ? '' : `<span class="lk">${ICON.lock}</span>`}</button><small>${esc(own ? p.name : R.unlockLabel(p.unlock))}</small></li>`; }).join('')}</ul></section>
      <section class="card"><header><div><h3>Frame</h3></div></header>
        <ul class="pick">${R.FRAMES.map((f) => { const own = S.ret.owned.includes('frame.' + f.id); return `<li><button class="${A.frame === f.id ? 'on' : ''}" data-frame="${f.id}" ${own ? '' : 'disabled'} title="${esc(f.name)}">${R.avatarHTML(A.portrait, f.id, 52)}${own ? '' : `<span class="lk">${ICON.lock}</span>`}</button><small>${esc(own ? f.name : R.unlockLabel(f.unlock))}</small></li>`; }).join('')}</ul></section>
      <section class="card"><header><div><h3>Badge</h3><p>Show one badge or title under your name</p></div></header>
        <div class="chips">${badges.map(([id, n]) => `<button class="bchip ${A.badge === id ? 'on' : ''}" data-badge="${esc(id)}">${esc(id && !id.startsWith('title:') ? achLabel(id) : n)}</button>`).join('')}</div></section>
      <section class="card row2"><button class="btn secondary" id="g-look">${ICON.shop}Tree look: bark, leaves, blossom, trail</button><button class="btn secondary" id="g-story">${ICON.play}Replay the story</button></section>`;
    body.querySelectorAll('[data-portrait]').forEach((b) => b.addEventListener('click', () => { if (R.setAvatar(getSave(), 'portrait', b.dataset.portrait)) { persist(false); sound.equip(); render(); if (onAvatar) onAvatar(); } }));
    body.querySelectorAll('[data-frame]').forEach((b) => b.addEventListener('click', () => { if (R.setAvatar(getSave(), 'frame', b.dataset.frame)) { persist(false); sound.equip(); render(); if (onAvatar) onAvatar(); } }));
    body.querySelectorAll('[data-badge]').forEach((b) => b.addEventListener('click', () => { if (R.setAvatar(getSave(), 'badge', b.dataset.badge)) { persist(false); sound.page(); render(); } }));
    const inp = body.querySelector('#g-name');
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.addEventListener('change', () => { const S2 = getSave(); S2.ret.name = R.cleanName(inp.value); inp.value = S2.ret.name; persist(false); });
    body.querySelector('#g-look').addEventListener('click', () => { hide(); if (onShop) onShop(); });
    body.querySelector('#g-story').addEventListener('click', () => { hide(); if (onStory) onStory(); });
  }
  let achLabel = (id) => id;
  function setAchNames(fn) { achLabel = fn; }

  box.querySelectorAll('[data-gtab]').forEach((b) => b.addEventListener('click', () => { sound.page(); show(b.dataset.gtab); }));
  box.querySelector('.gclose').addEventListener('click', hide);
  box.addEventListener('pointerdown', (e) => { if (e.target === box) hide(); });
  return { show, hide, render, setAchNames, get isOpen() { return open; }, get tab() { return tab; } };
}
