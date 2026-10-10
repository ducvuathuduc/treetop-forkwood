// Quest map interface: worlds and levels (stars, locks, goals), the modes
// board with stakes, titles, and the weekly code. All DOM, drawn in the same
// print style as the meta book (paper cards, ink outlines, inline SVG icons).
import { ICON } from './icons.js';
import { WORLDS, LEVEL, levelsOf, goalText, MAX_STARS, worldOf } from './campaign.js';
import { MODES, STAKES, STAKE, weekKey, weekCode } from './modes.js';
import * as Q from './quest.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const stars = (n, max = 3) => Array.from({ length: max }, (_, i) => `<i class="st ${i < n ? 'on' : ''}">${i < n ? ICON.star : ICON.starOff}</i>`).join('');

export function createQuestUI({ getSave, persist, sound, onPlayLevel, onPlayMode, onOpen, onClose }) {
  const box = $('questmap'), body = $('quest-body');
  let tab = 'map', open = false, pick = null;
  for (const b of box.querySelectorAll('.tabs [data-qtab]')) b.querySelector('.ti').innerHTML = ICON[b.dataset.qtab === 'map' ? 'map' : 'modes'];
  $('btn-quest-close').innerHTML = ICON.close;

  function show(t = tab, levelId = null) {
    tab = t; open = true; pick = levelId;
    box.classList.add('show');
    document.body.classList.add('book');
    for (const b of box.querySelectorAll('.tabs [data-qtab]')) { const on = b.dataset.qtab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    render();
    if (onOpen) onOpen();
  }
  function hide() { if (!open) return; open = false; box.classList.remove('show'); document.body.classList.remove('book'); if (onClose) onClose(); }

  function render() {
    const S = getSave();
    Q.repairQuest(S);
    const total = Q.totalStars(S), nextChest = (Q.chestsEarned(S) + 1) * Q.STARS_PER_CHEST;
    $('quest-stars').innerHTML = `${ICON.star}<b>${total}</b><small>/${MAX_STARS}</small>`;
    $('quest-chest').innerHTML = total >= MAX_STARS ? `${ICON.chest}<span>all chests open</span>` : `${ICON.chest}<span>next chest at ${nextChest}★</span><span class="prog"><span class="fill" style="width:${Math.round(100 * (total % Q.STARS_PER_CHEST) / Q.STARS_PER_CHEST)}%"></span></span>`;
    body.innerHTML = '';
    body.scrollTop = 0;
    if (tab === 'map') renderMap(S); else renderModes(S);
  }

  // ---- worlds and levels
  function renderMap(S) {
    const html = WORLDS.map((w) => {
      const open = Q.worldUnlocked(S, w.id);
      const lv = levelsOf(w.id);
      const nodes = lv.map((l, i) => {
        const un = Q.levelUnlocked(S, l.id), st = S.quest.stars[l.id] || 0;
        return `<button class="lnode ${un ? '' : 'locked'} ${st ? 'done' : ''} ${pick === l.id ? 'sel' : ''}" data-lvl="${l.id}" ${un ? '' : 'aria-disabled="true"'} style="--i:${i}">
          <span class="num">${un ? l.id : ICON.lock}</span><span class="nm">${esc(l.name)}</span><span class="stars">${stars(st)}</span></button>`;
      }).join('<span class="path" aria-hidden="true"></span>');
      const need = !open ? (Q.totalStars(S) < w.need ? `Needs ${w.need}★ (you have ${Q.totalStars(S)})` : `Clear level ${w.id - 1}-1 first`) : '';
      return `<section class="card world ${open ? '' : 'locked'}" style="--wc:${w.color}">
        <header><span class="wnum">${w.id}</span><div><h3>${esc(w.name)}</h3><p>${open ? esc(w.twist) : esc(need)}</p></div><span class="wst">${ICON.star}${Q.worldStars(S, w.id)}/12</span></header>
        <div class="nodes">${nodes}</div>
        ${pick && pick.startsWith(w.id + '-') ? levelSheet(S, LEVEL[pick]) : ''}
      </section>`;
    }).join('');
    body.innerHTML = `<p class="lead muted">Short hand-made climbs. Reach the ribbon for a star, beat the level's two goals for the rest. Stars open new worlds, modes and stakes; every 6 stars opens a chest.</p>${html}`;
    body.querySelectorAll('[data-lvl]').forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled')) { sound.click(); b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 220 }); return; }
      sound.page(); pick = pick === b.dataset.lvl ? null : b.dataset.lvl; const y = body.scrollTop; render(); body.scrollTop = y;
      const sel = body.querySelector('.lvl-sheet'); if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
    const go = body.querySelector('[data-play-lvl]');
    if (go) go.addEventListener('click', () => { hide(); onPlayLevel(go.dataset.playLvl); });
  }
  function levelSheet(S, lv) {
    const st = S.quest.stars[lv.id] || 0, best = S.quest.best[lv.id] || 0, mk = S.quest.marks[lv.id] || 0;
    const goals = [{ t: 'Reach the finish ribbon', on: !!(mk & 1) || st >= 1 }, ...lv.goals.map((g, i) => ({ t: goalText(g), on: !!(mk & (2 << i)) }))];
    return `<div class="lvl-sheet">
      <div class="ls-head"><b>${lv.id} · ${esc(lv.name)}</b><span class="stars big">${stars(st)}</span></div>
      <ol class="ls-goals">${goals.map((g) => `<li class="${g.on ? 'on' : ''}"><i class="st ${g.on ? 'on' : ''}">${g.on ? ICON.star : ICON.starOff}</i>${esc(g.t)}</li>`).join('')}</ol>
      <p class="muted">${best ? `Best ${fmt(best)} pts · ` : ''}same course every try · goal stars stay once earned</p>
      <button class="btn primary small-primary" data-play-lvl="${lv.id}">${ICON.play}${st ? 'Play again' : 'Play'}</button>
    </div>`;
  }

  // ---- modes, stakes, titles
  function renderModes(S) {
    const cur = S.quest.stake;
    const stakeBtns = STAKES.map((k) => {
      const un = Q.stakeUnlocked(S, k.id);
      return `<button class="stake ${cur === k.id ? 'on' : ''} ${un ? '' : 'locked'}" data-stake="${k.id}" ${un ? '' : 'aria-disabled="true"'} title="${esc(un ? k.adds.join(' · ') || k.blurb : Q.STAKE_UNLOCK[k.id].text)}">
        <b>${un ? '' : ICON.lock}${esc(k.name)}</b><small>×${k.mult} pts</small></button>`;
    }).join('');
    const sk = STAKE[cur];
    const cards = MODES.map((m) => {
      const un = Q.modeUnlocked(S, m.id);
      const best = m.id === 'classic' ? { h: S.quest.stakeBest[cur] || (cur === 'sapling' ? S.best.height : 0) } : (m.id === 'weekly' ? (S.quest.weekly[weekKey()] || null) : S.quest.modeBest[m.id]);
      const extra = m.id === 'classic' ? `<div class="stakes" role="group" aria-label="Stake">${stakeBtns}</div><p class="muted small">${esc(sk.adds.length ? 'Adds: ' + sk.adds.join(' · ') : sk.blurb)}</p>`
        : m.id === 'weekly' ? `<p class="code">Code <b>${weekCode()}</b> · ${esc(weekKey())}</p>` : '';
      return `<section class="card mode ${un ? '' : 'locked'}" data-mode-card="${m.id}">
        <header><span class="mico m-${m.id}">${un ? modeGlyph(m.id) : ICON.lock}</span><div><h3>${esc(m.name)} <small>${esc(m.short)}</small></h3><p>${esc(un ? m.blurb : Q.MODE_UNLOCK[m.id].text)}</p></div></header>
        ${un ? extra : ''}
        <div class="mrow"><span class="mbest">${un && best && (best.h || best.s) ? `best ${fmt(best.h || 0)} m${best.s ? ` · ${fmt(best.s)} pts` : ''}` : ''}</span>${un ? `<button class="btn secondary" data-play-mode="${m.id}">${ICON.play}Play</button>` : ''}</div>
      </section>`;
    }).join('');
    const titles = Q.TITLES.map((t) => {
      const got = S.quest.titles.includes(t.id);
      return `<button class="ttl ${got ? '' : 'locked'} ${S.quest.title === t.id ? 'on' : ''}" data-title="${t.id}" ${got ? '' : 'aria-disabled="true"'} title="${esc(t.text)}">${got ? '' : ICON.lock}${esc(t.name)}</button>`;
    }).join('');
    body.innerHTML = `<p class="lead muted">Same tree, different rules. Modes and stakes unlock on the quest map or by growing high in Endless.</p>${cards}
      <section class="card"><header><div><h3>Titles</h3><p>Shown on your postcard. Earned on the map and in modes.</p></div></header><div class="titles">${titles}</div></section>`;
    body.querySelectorAll('[data-stake]').forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled')) { sound.click(); return; }
      S.quest.stake = b.dataset.stake; persist(false); sound.page(); const y = body.scrollTop; render(); body.scrollTop = y;
    }));
    body.querySelectorAll('[data-title]').forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled')) return;
      Q.setTitle(S, S.quest.title === b.dataset.title ? null : b.dataset.title); persist(false); sound.page(); const y = body.scrollTop; render(); body.scrollTop = y;
    }));
    body.querySelectorAll('[data-play-mode]').forEach((b) => b.addEventListener('click', () => { hide(); onPlayMode(b.dataset.playMode); }));
  }

  function modeGlyph(id) {
    const g = {
      classic: ICON.level, zen: '<svg viewBox="0 0 40 40" class="ico"><circle cx="20" cy="20" r="14" fill="#cfe6ff" stroke="#1e1a16" stroke-width="2.6"/><path d="M12 22c3 3 13 3 16 0" fill="none" stroke="#1e1a16" stroke-width="2.6" stroke-linecap="round"/></svg>',
      sprint: '<svg viewBox="0 0 40 40" class="ico"><circle cx="20" cy="22" r="13" fill="#f4ecd8" stroke="#1e1a16" stroke-width="2.6"/><path d="M20 22V13M16 5h8" stroke="#1e1a16" stroke-width="2.8" stroke-linecap="round"/><path d="M20 22l6 4" stroke="#e2603f" stroke-width="2.8" stroke-linecap="round"/></svg>',
      hardcore: '<svg viewBox="0 0 40 40" class="ico"><path d="M20 4l13 5v10c0 9-6 15-13 17C13 34 7 28 7 19V9z" fill="#e2603f" stroke="#1e1a16" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 12v10M20 27v1" stroke="#1e1a16" stroke-width="3.2" stroke-linecap="round"/></svg>',
      mirror: '<svg viewBox="0 0 40 40" class="ico"><path d="M20 5v30" stroke="#1e1a16" stroke-width="2.6" stroke-dasharray="3 3"/><path d="M15 12l-8 8 8 8M25 12l8 8-8 8" fill="none" stroke="#5b7fc4" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      storm: '<svg viewBox="0 0 40 40" class="ico"><path d="M9 20a7 7 0 0 1 5-11 9 9 0 0 1 16 3 6 6 0 0 1 0 12H11a5 5 0 0 1-2-4z" fill="#b4a8d8" stroke="#1e1a16" stroke-width="2.6" stroke-linejoin="round"/><path d="M21 24l-4 7h5l-3 6" fill="none" stroke="#f2b33d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      weekly: ICON.map,
    };
    return g[id] || ICON.level;
  }

  // ---- wiring
  box.querySelectorAll('.tabs [data-qtab]').forEach((b) => b.addEventListener('click', () => { sound.page(); show(b.dataset.qtab); }));
  $('btn-quest-close').addEventListener('click', hide);
  box.addEventListener('pointerdown', (e) => { if (e.target === box) hide(); });
  return { show, hide, get isOpen() { return open; }, get tab() { return tab; }, render };
}
export { worldOf };
