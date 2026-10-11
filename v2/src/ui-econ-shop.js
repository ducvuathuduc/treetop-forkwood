// v1.0: the shop's economy sections (boosts, upgrades, pods, gem nest), split
// from ui-econ.js so they load when the shop first opens, not at boot.
import * as E from './economy.js';
import { ICON } from './icons.js';
import { GEM_ICON, BOOST_ICON, UP_ICON, COST_SKINS, armed, esc, fmt, acorn, gem } from './ui-econ.js';

/** Render one economy section into body. deps: { getSave, persist, sound, toast, countWallet, rerender } */
export function renderSection(body, S, sec, deps) {
  E.ensureEcon(S);
  const X = S.econ, today = new Date().toISOString().slice(0, 10);
  let html = '';
  if (sec === 'boosts') {
    const arm = armed(S);
    html = `<p class="muted center lead">One of each per run, on <b>Grow</b> and the modes. Boosts are switched off on the daily and weekly trees, quest levels, challenge links and races, so those stay fair.</p>
      <ul class="charms eco-list">${E.BOOST_IDS.map((id) => {
        const b = E.BOOSTS[id], n = X.boosts[id] || 0, on = arm.includes(id);
        return `<li class="charm eco ${on ? 'on' : ''}"><span class="eico">${BOOST_ICON[b.icon]}</span><div><h3>${esc(b.name)} <small class="own">×${n}</small></h3><p>${esc(b.blurb)}</p></div><div class="eact">
          <button class="btn secondary sm" data-boost-buy="${id}" ${S.acorns >= b.price ? '' : 'disabled'}>${ICON.acorn}${b.price}</button>
          ${n ? `<button class="btn ${on ? 'primary' : 'secondary'} sm arm" data-boost-arm="${id}" aria-pressed="${on}">${on ? 'Armed' : 'Arm'}</button>` : ''}</div></li>`;
      }).join('')}</ul>
      <p class="muted center small">Armed boosts fire at the start of your next free-play run.</p>`;
  } else if (sec === 'upgrades') {
    html = `<p class="muted center lead">Make the power-ups you find in the tree last longer. Six levels each; every level costs more. Off on fair runs.</p>
      <ul class="charms eco-list">${E.UPGRADE_IDS.map((id) => {
        const u = E.UPGRADES[id], lv = E.upLevel(S, id), c = E.upCost(S, id);
        const pips = Array.from({ length: E.MAX_UP }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        return `<li class="charm eco"><span class="eico">${UP_ICON[id]}</span><div><h3>${esc(u.name)} <small class="own">${E.upValue(id, lv)} ${u.unit}${c != null ? ` → ${E.upValue(id, lv + 1)} ${u.unit}` : ''}</small></h3><p>${esc(u.blurb)}</p><span class="pips up-pips">${pips}</span></div><div class="eact">
          ${c == null ? `<span class="state worn">Max</span>` : `<button class="btn secondary sm" data-up="${id}" ${S.acorns >= c ? '' : 'disabled'}>${ICON.acorn}${fmt(c)}</button>`}</div></li>`;
      }).join('')}</ul>`;
  } else if (sec === 'pods') {
    const price = E.podPrice(S, today);
    const row = (o) => `<tr><td>${esc(o.text)}</td><td>${o.w}%</td></tr>`;
    html = `<section class="card pod-card"><header><span class="hico pod-ico">${ICON.chest}</span><div><h3>Seed pod</h3><p>Opens at once. Each pod you buy today costs a little more (resets at UTC midnight).</p></div></header>
        <button class="btn primary small-primary" data-pod ${S.acorns >= price ? '' : 'disabled'}>Open a pod for ${ICON.acorn}${fmt(price)}</button>
        <details class="odds" open><summary>Odds, published in full</summary><table>${E.POD_ODDS.map(row).join('')}</table></details></section>
      <section class="card pod-card gold"><header><span class="hico pod-ico">${ICON.chest}</span><div><h3>Golden pod</h3><p>Better odds, paid with dew gems you earned by playing.</p></div></header>
        <button class="btn secondary" data-gpod ${X.gems >= E.GEM_SHOP.golden.gems ? '' : 'disabled'}>Open for ${GEM_ICON}${E.GEM_SHOP.golden.gems}</button>
        <details class="odds"><summary>Odds</summary><table>${E.GOLDEN_ODDS.map(row).join('')}</table></details></section>
      <p class="muted center small">Opened ${X.pods} seed pods and ${X.gpods} golden pods · nothing here costs real money</p>`;
  } else if (sec === 'gems') {
    const ways = [
      [`Finish every 3rd level`, `+${E.GEM.levelUp}`], ['All three daily challenges', `+${E.GEM.allDaily}`], ['All three weekly challenges', `+${E.GEM.allWeekly}`],
      ['Word hunt: day 3 and day 5+ in a row', '+1'], ['Streak: 7 / 14 / 30 / 60 / 100 days', '+3 / 3 / 8 / 10 / 15'],
      ['Season tiers 5, 10, 15, 20, 25, 30', '+2 to +5'], ['League promotion', `+${E.GEM.promote}`], ['A dew gem in the tree (past 250 m, rare)', '+1'], ['Seed pods (11%)', '+1 or +2'],
    ];
    html = `<section class="card gem-card"><header><span class="hico">${GEM_ICON}</span><div><h3>${fmt(X.gems)} dew gems</h3><p>The rare currency. Earned only by playing: there is no store and nothing to buy with money.</p></div></header>
        <ul class="ways">${ways.map(([a, b]) => `<li><span>${esc(a)}</span><b>${esc(b)}</b></li>`).join('')}</ul></section>
      <ul class="charms eco-list">
        <li class="charm eco"><span class="eico">${ICON.retry}</span><div><h3>Second chance</h3><p>When your sap runs dry on a free-play run: 1, then 2, 4 and 8 gems in the same run.</p></div><div class="eact"><span class="state">on the spot</span></div></li>
        <li class="charm eco"><span class="eico">${ICON.frost}</span><div><h3>${esc(E.GEM_SHOP.freeze.name)} <small class="own">${S.streak.freezes}/2</small></h3><p>${esc(E.GEM_SHOP.freeze.blurb)}</p></div><div class="eact"><button class="btn secondary sm" data-freeze ${X.gems >= E.GEM_SHOP.freeze.gems && S.streak.freezes < 2 ? '' : 'disabled'}>${GEM_ICON}${E.GEM_SHOP.freeze.gems}</button></div></li>
        <li class="charm eco"><span class="eico">${ICON.goals}</span><div><h3>${esc(E.GEM_SHOP.skip.name)}</h3><p>${esc(E.GEM_SHOP.skip.blurb)} The level-up pays at the end of your next run.</p></div><div class="eact"><button class="btn secondary sm" data-skip ${X.gems >= E.GEM_SHOP.skip.gems && S.goals.some((g) => !g.done) ? '' : 'disabled'}>${GEM_ICON}${E.GEM_SHOP.skip.gems}</button></div></li>
      </ul>
      ${X.log.length ? `<p class="muted center small">Recent: ${X.log.slice(0, 4).map((l) => `+${l.n} ${esc(l.why)}`).join(' · ')}</p>` : ''}`;
  }
  body.insertAdjacentHTML('beforeend', html);
  wire(body, sec, deps);
}

function wire(body, sec, { getSave, persist, sound, toast, countWallet, rerender, showPod }) {
  const act = (sel, fn) => body.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { const S = getSave(), before = S.acorns; const r = fn(S, b); if (r) { persist(true); if (countWallet) countWallet(before, S.acorns); rerender(); } }));
  act('[data-boost-buy]', (S, b) => { const ok = E.buyBoost(S, b.dataset.boostBuy); if (ok) { sound.buy(); toast(`${E.BOOSTS[b.dataset.boostBuy].name} added (×${S.econ.boosts[b.dataset.boostBuy]})`, 'buy'); } return ok; });
  act('[data-boost-arm]', (S, b) => { const a = armed(S), id = b.dataset.boostArm, i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); sound.equip(); return true; });
  act('[data-up]', (S, b) => { const id = b.dataset.up; const ok = E.buyUpgrade(S, id); if (ok) { sound.buy(); toast(`${E.UPGRADES[id].name} level ${E.upLevel(S, id)}: ${E.upValue(id, E.upLevel(S, id))} ${E.UPGRADES[id].unit}`, 'buy'); } return ok; });
  act('[data-pod]', (S) => { const r = E.buyPod(S, { skins: COST_SKINS() }); if (r) { sound.sparkle(); showPod(r); } return !!r; });
  act('[data-gpod]', (S) => { const r = E.buyGolden(S, { skins: COST_SKINS() }); if (r) { sound.sparkle(); showPod(r, true); } return !!r; });
  act('[data-freeze]', (S) => { const ok = E.buyFreeze(S); if (ok) { sound.buy(); toast('Frost guard ready: a missed day will not break your streak', 'gift'); } return ok; });
  act('[data-skip]', (S) => { const g = E.skipGoal(S); if (g) { sound.buy(); toast('Goal ticked off: the level-up pays at the end of your next run', 'buy'); } return !!g; });
}

/** What a pod gave, as one line. */
export function podText(r) {
  const bits = [];
  if (r.acorns) bits.push(`+${fmt(r.acorns)} acorns`);
  if (r.gems) bits.push(`+${r.gems} dew gem${r.gems > 1 ? 's' : ''}`);
  for (const b of r.boosts || []) bits.push(E.BOOSTS[b].name);
  if (r.skin) bits.push(`${SKIN[r.skin].name} (skin)`);
  return bits.join(' · ');
}

