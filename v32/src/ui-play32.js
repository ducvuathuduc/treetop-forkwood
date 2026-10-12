// Forkwood V3.2 GAMEPLAY UI: contest mode, the "one more run" goal line on the results card and the
// next world blurred behind it. Styles are injected here (no shared CSS file is touched).
import { CONTEST } from './flags.js';
import { STAGES } from './sim.js';
import { WORLDS, WORLD } from './worlds-meta.js';

const CSS = `
html.contest #tabbar [data-hub="shop"], html.contest #tabbar [data-hub="pass"], html.contest #tabbar [data-hub="league"],
html.contest #btn-wallet, html.contest #btn-gems, html.contest #btn-gift, html.contest #hub-offer, html.contest #hub-pass,
html.contest #dock [data-tab="shop"], html.contest #meta [data-tab="shop"], html.contest #btn-restore, html.contest #season-cards,
html.contest #rw-double, html.contest .rw-double, html.contest .offer-art,
html.contest .rail-btn.offer, html.contest .rail-btn.timed { display: none !important; }
#over .over-goal { margin: 6px 0 2px; font-weight: 900; font-size: clamp(20px, 5.4vw, 30px); line-height: 1.12; letter-spacing: -0.01em;
  color: #fff3c4; text-shadow: 0 2px 0 rgba(8,11,28,.45), 0 0 18px rgba(255,214,110,.35); }
#over .over-goal small { display: block; margin-top: 3px; font-weight: 600; font-size: 0.5em; letter-spacing: 0; color: rgba(255,246,230,.78); text-shadow: 0 1px 0 rgba(8,11,28,.45); }
#over .over-goal .bar { display: block; height: 6px; margin: 8px auto 0; max-width: 260px; border-radius: 3px; background: rgba(255,246,230,.16); overflow: hidden; }
#over .over-goal .bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #8be68f, #ffe07a); }
#over .v32-next { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; opacity: 0; transition: opacity .6s ease .2s; }
#over.show .v32-next { opacity: 1; }
#over .v32-next i { position: absolute; inset: -40px; background-size: cover; background-position: center; filter: blur(14px) saturate(1.1) brightness(.62); transform: scale(1.08); }
#over .v32-next b { position: absolute; left: 4%; right: 4%; bottom: max(12px, env(safe-area-inset-bottom)); font: 700 11px/1.3 system-ui, sans-serif; letter-spacing: .05em;
  text-transform: uppercase; color: rgba(255,246,230,.66); text-align: center; text-wrap: balance; }
#over > .panel { position: relative; z-index: 1; }
`;

let styled = false;
function style() { if (styled || typeof document === 'undefined') return; styled = true; const st = document.createElement('style'); st.id = 'v32-play-css'; st.textContent = CSS; document.head.appendChild(st); }

/** Contest build: hide monetisation surfaces (CSS) and report whether it is on. */
export function initContest() {
  style();
  if (CONTEST) document.documentElement.classList.add('contest');
  return CONTEST;
}

/**
 * The nearest goal after a run, for the big results line. Pure (exported for tests).
 * h: this run's height, best: the record before this run, stars: optional [{ m, label }] goals.
 * Returns { kind, m, vi, en, frac } or null.
 */
export function nearestGoal(h, best, extra = []) {
  const goals = [];
  if (best > h) goals.push({ kind: 'record', at: best, vi: (d) => `Còn ${d} m nữa là đạt kỷ lục`, en: (d) => `${d} m to beat your record (${best} m)` });
  const st = STAGES.find((s) => s.m > h);
  if (st) goals.push({ kind: 'rank', at: st.m, vi: (d) => `Còn ${d} m nữa là lên hạng ${st.name}`, en: (d) => `${d} m to the next rank: ${st.name}` });
  for (const g of extra) if (g.m > h) goals.push({ kind: 'star', at: g.m, vi: (d) => `Còn ${d} m nữa là có sao kế tiếp`, en: (d) => `${d} m to the next star${g.label ? ': ' + g.label : ''}` });
  if (!goals.length) return null;
  goals.sort((a, b) => a.at - b.at);
  const g = goals[0], d = Math.max(1, Math.ceil(g.at - h));
  const from = g.kind === 'record' ? 0 : (STAGES.filter((s) => s.m <= h).pop() || { m: 0 }).m;
  return { kind: g.kind, m: d, vi: g.vi(d), en: g.en(d), frac: Math.max(0.04, Math.min(1, (h - from) / Math.max(1, g.at - from))), newBest: h > best && best > 0 };
}

/** Render the goal line (and the blurred next world) on the results card. g from nearestGoal. */
export function showGoal(g, { world, headline } = {}) {
  style();
  if (typeof document === 'undefined') return;
  const over = document.getElementById('over'), h2 = document.getElementById('over-height');
  if (!over || !h2) return;
  let el = document.getElementById('over-goal');
  if (!el) { el = document.createElement('p'); el.id = 'over-goal'; el.className = 'over-goal'; h2.after(el); }
  el.hidden = !g;
  if (g) {
    const top = headline ? `${headline} · ` : '';
    el.innerHTML = `<span lang="vi">${top}${esc(g.vi)}</span><small>${esc(g.en)}</small><span class="bar" aria-hidden="true"><i style="width:${(g.frac * 100).toFixed(0)}%"></i></span>`;
  }
  // next world, blurred behind the card (all worlds are open: it is a "where next" tease, not a lock)
  let nx = over.querySelector('.v32-next');
  const i = WORLDS.findIndex((w) => w.id === world), next = WORLDS[(Math.max(0, i) + 1) % WORLDS.length];
  if (!next) { if (nx) nx.remove(); return; }
  if (!nx) { nx = document.createElement('div'); nx.className = 'v32-next'; nx.setAttribute('aria-hidden', 'true'); nx.innerHTML = '<i></i><b></b>'; over.prepend(nx); }
  const url = new URL(`../assets/v2/${next.id}/ui/${next.id}.ui.painting.webp`, import.meta.url).href;
  nx.querySelector('i').style.backgroundImage = `url("${url}")`;
  nx.querySelector('b').textContent = `Next world · ${WORLD[next.id].name} · ${WORLD[next.id].nameVi}`;
  nx.dataset.world = next.id;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
