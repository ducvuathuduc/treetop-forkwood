// P6-RACE: live race UI. Lobby, share link, 3-2-1 countdown, live HUD with the
// rival's height, the rival's ghost branch in the world, the finish card and
// rematch. Lazy-loaded the first time a race is created or a race link opens.
import { RaceSession, newRoomId, raceUrl, roomCode, seedFor, RACE_SECONDS, CONNECT_TIMEOUT } from './race.js';
import { drawBud, FONT, INK, roundRect } from './render.js';
import { PX_PER_M, W } from './sim.js';
import { ICON } from './icons.js';
import * as R from './retention.js';

const TAU = Math.PI * 2;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const av = (p, f, size) => R.avatarHTML((R.PORTRAITS[p] || R.PORTRAITS[0]).id, (R.FRAMES[f] || R.FRAMES[0]).id, size);
const WHY = {
  timeout: 'Could not reach the race server in time.',
  network: 'The live connection was blocked on this network.',
  load: 'The live race library did not load (offline?).',
  'no-host': 'Your friend\u2019s room is closed, or they left.',
  full: 'This room is already racing.',
  left: 'Your friend left the room.',
  'room-taken': 'That room name is taken. Make a new one.',
};

/**
 * hooks: getMe() -> { name, p, f }, sound, onStart(seed, rules), onExit(), onFallback(seed),
 *        transport ('peer' | 'local' | 'dead'), heightM(sim)
 */
export function createRaceUI(hooks) {
  const box = document.createElement('section');
  box.id = 'race'; box.className = 'overlay'; box.setAttribute('aria-label', 'Live race');
  box.innerHTML = '<div class="panel paper race-panel"><div class="race-body" aria-live="polite"></div></div>';
  document.body.appendChild(box);
  const body = box.querySelector('.race-body');
  const cd = document.createElement('div'); cd.id = 'race-count'; cd.setAttribute('aria-live', 'assertive'); document.body.appendChild(cd);
  const hud = document.createElement('div'); hud.id = 'race-hud'; hud.hidden = true; document.body.appendChild(hud);
  let ses = null, myM = 0, shown = { m: 0, cy: 0, xs: [] }, copied = '';

  window.addEventListener('pagehide', () => { if (ses) ses.leave(); });
  function open() { box.classList.add('show'); document.body.classList.add('racing-ui'); }
  function close() { box.classList.remove('show'); }

  function start(role, room) {
    if (ses) ses.leave();
    copied = '';
    ses = new RaceSession({ role, room, me: hooks.getMe(), transport: hooks.transport || 'peer', timeout: hooks.timeout || CONNECT_TIMEOUT });
    ses.on('change', () => render());
    ses.on('opp', () => { if (ses.state === 'ended') render(); });
    ses.on('start', ({ seed, rules }) => {
      close(); shown = { m: 0, cy: 0, xs: [] }; myM = 0;
      hud.hidden = false;
      hooks.onStart(seed, rules);
    });
    open(); render();
  }
  const host = () => start('host', newRoomId());
  const join = (room) => start('guest', room);

  function leave(toMenu = true) {
    if (ses) ses.leave();
    ses = null; close(); hud.hidden = true; cd.className = ''; cd.textContent = '';
    document.body.classList.remove('racing-ui');
    if (toMenu) hooks.onExit();
  }

  function card(me, nm, sub, extra = '') {
    return `<div class="rc-player ${extra}">${av(me.p, me.f, 48)}<b>${esc(nm)}</b><small>${sub}</small></div>`;
  }

  function render() {
    if (!ses) return;
    const s = ses, me = s.me, o = s.opp;
    const url = raceUrl(s.room);
    cd.className = ''; cd.textContent = '';
    if (s.state === 'countdown') {
      close(); hud.hidden = true;
      cd.className = 'show'; cd.innerHTML = `<b>${s.count}</b><small>same course · ${RACE_SECONDS} s · highest tree wins</small>`;
      if (hooks.sound) try { hooks.sound.tick(s.count); } catch { /* audio locked */ }
      return;
    }
    if (s.state === 'racing') { close(); return; }
    if (s.state !== 'ended') hud.hidden = true;
    open();
    let h = '';
    if (s.state === 'connecting' || s.state === 'waiting') {
      const guest = s.role === 'guest';
      h = `<p class="kicker">${ICON.modes} LIVE RACE${guest ? ` · ROOM ${roomCode(s.room)}` : ''}</p>
        <h2>${guest ? 'Joining your friend\u2026' : 'Race a friend, live'}</h2>
        ${guest ? `<p class="rc-status"><i class="spin"></i>Connecting (up to ${Math.round(CONNECT_TIMEOUT / 1000)} s)</p>` : `
        <p>Send this link. When your friend opens it you both see the lobby, then race the same tree for ${RACE_SECONDS} seconds, each with the other's branch climbing beside you.</p>
        <div class="rc-link"><input id="rc-url" readonly value="${esc(url)}" aria-label="Race link" /><button class="btn secondary" id="rc-copy">${copied ? 'Copied' : 'Copy'}</button></div>
        <p class="rc-code">Room <b>${roomCode(s.room)}</b></p>
        <p class="rc-status"><i class="spin"></i>${s.state === 'waiting' ? (s.why === 'left' ? 'Your friend left. Waiting for them to come back\u2026' : 'Room open. Waiting for your friend\u2026') : 'Opening the room\u2026'}</p>`}
        <div class="row"><button class="btn secondary" id="rc-cancel">Cancel</button>${!guest && navigator.share ? '<button class="btn secondary" id="rc-share">Share link</button>' : ''}</div>`;
    } else if (s.state === 'lobby') {
      h = `<p class="kicker">${ICON.modes} LOBBY · ROOM ${roomCode(s.room)}</p>
        <div class="rc-vs">${card(me, me.name || 'You', me.ready ? 'ready' : 'you', me.ready ? 'ready' : '')}<span class="vs">vs</span>${card(o, o.name, o.ready ? 'ready' : 'getting ready', o.ready ? 'ready' : '')}</div>
        <p>Same course for both of you · ${RACE_SECONDS} seconds · the highest tree when the clock stops (or when you run out of sap) wins.</p>
        <div class="row"><button class="btn primary" id="rc-ready" ${me.ready ? 'disabled' : ''}>${me.ready ? `Waiting for ${esc(o.name)}\u2026` : 'Ready'}</button></div>
        <div class="row small"><button class="btn secondary" id="rc-cancel">Leave</button></div>`;
    } else if (s.state === 'ended') {
      h = `<p class="kicker">${ICON.modes} YOUR TREE IS DONE</p>
        <h2>${fmt(s.mine.h)} m</h2>
        <p class="rc-status"><i class="spin"></i>${esc(o ? o.name : 'Friend')} is still growing: <b>${fmt(o ? o.m : 0)} m</b></p>`;
    } else if (s.state === 'done') {
      const res = s.result, lost = o && o.lost;
      const head = !s.mine ? 'Race called off' : res === 'win' ? 'You win!' : res === 'tie' ? 'A dead heat' : `${esc(o.name)} wins`;
      const oh = o && o.end ? o.end.h : o ? o.m : 0, osc = o && o.end ? o.end.sc : o ? o.sc || 0 : 0;
      h = `<p class="kicker ${res === 'win' ? 'gold' : ''}">${ICON.modes} RACE ${s.round + 1} · ROOM ${roomCode(s.room)}</p>
        <h2 class="rc-result">${head}</h2>
        <div class="rc-vs result">${card(me, me.name || 'You', s.mine ? `${fmt(s.mine.h)} m · ${fmt(s.mine.sc)} pts` : '-', res === 'win' ? 'winner' : '')}<span class="vs">vs</span>${card(o || { p: 0, f: 0 }, o ? o.name : 'Friend', lost ? `${fmt(oh)} m · disconnected` : `${fmt(oh)} m · ${fmt(osc)} pts`, res === 'lose' ? 'winner' : '')}</div>
        ${lost ? `<p class="rc-status warn">${esc(o.name)} disconnected. You can send them a duel link for the same course instead.</p>` : ''}
        <div class="row">${lost ? '<button class="btn primary" id="rc-fallback">Duel link instead</button>' : `<button class="btn primary" id="rc-again" ${me.ready ? 'disabled' : ''}>${me.ready ? `Waiting for ${esc(o.name)}\u2026` : o && o.ready ? 'Accept rematch' : 'Rematch'}</button>`}</div>
        <div class="row small"><button class="btn secondary" id="rc-cancel">Menu</button></div>`;
    } else if (s.state === 'failed') {
      h = `<p class="kicker">${ICON.modes} LIVE RACE</p>
        <h2>Couldn\u2019t race live</h2>
        <p>${esc(WHY[s.why] || WHY.network)} You can still play the same course and send it as a duel: your friend races your rival tip whenever they open it.</p>
        <div class="row"><button class="btn primary" id="rc-fallback">Play it as a duel</button></div>
        <div class="row small"><button class="btn secondary" id="rc-retry">Try again</button><button class="btn secondary" id="rc-cancel">Menu</button></div>`;
    }
    body.innerHTML = h;
    body.dataset.state = s.state;
    const on = (id, fn) => { const b = body.querySelector('#' + id); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
    on('rc-cancel', () => leave(true));
    on('rc-ready', () => ses.setReady(true));
    on('rc-again', () => ses.rematch());
    on('rc-retry', () => { const r = ses.role, room = ses.role === 'guest' ? ses.room : newRoomId(); start(r, room); });
    on('rc-fallback', () => { const seed = seedFor(ses.room, ses.round); leave(false); hooks.onFallback(seed); });
    on('rc-copy', async () => {
      try { await navigator.clipboard.writeText(url); copied = url; } catch { const i = body.querySelector('#rc-url'); i.select(); copied = 'manual'; }
      const b = body.querySelector('#rc-copy'); if (b) b.textContent = copied === 'manual' ? 'Select & copy' : 'Copied';
    });
    on('rc-share', async () => { try { await navigator.share({ text: `Race me live in Forkwood (room ${roomCode(ses.room)}): ${url}` }); } catch { /* cancelled */ } });
  }

  // ---- live race: HUD and ghost
  function tick(sim, m, dt) {
    if (!ses) return;
    myM = m;
    if (ses.state === 'racing') ses.tick(sim, m);
    const o = ses.opp;
    if (o) {
      const k = Math.min(1, dt * 8);
      shown.m += (o.m - shown.m) * k;
      shown.cy += (o.cy - shown.cy) * k;
      shown.xs = o.xs.map((x, i) => (shown.xs[i] == null ? x : shown.xs[i] + (x - shown.xs[i]) * k));
    }
    if (!hud.hidden && (ses.state === 'racing' || ses.state === 'ended')) {
      const om = o ? shown.m : 0, d = om - m;
      const tag = !o ? '' : o.lost ? '<em>disconnected</em>' : o.end ? '<em>done</em>' : '';
      hud.innerHTML = `<span class="me">${av(ses.me.p, ses.me.f, 22)}<b>${fmt(m)} m</b></span><span class="bar"><i style="--a:${Math.min(1, m / Math.max(1, m, om) || 0)}"></i><i class="o" style="--a:${Math.min(1, om / Math.max(1, m, om) || 0)}"></i></span><span class="op">${o ? av(o.p, o.f, 22) : ''}<b>${fmt(om)} m</b>${tag}</span>${o && Math.abs(d) >= 1 ? `<span class="gap ${d > 0 ? 'behind' : 'ahead'}">${d > 0 ? `${fmt(d)} m behind` : `${fmt(-d)} m ahead`}</span>` : ''}`;
    }
  }

  /** World-space: the rival's branch as a pale dashed line plus their bud and name tag. */
  function draw(ctx, s, now) {
    const o = ses && ses.opp;
    if (!o || !o.trail.length) return;
    const tr = o.trail;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let lane = 0; lane < 2; lane++) {
      for (const pass of [0, 1]) {
        ctx.beginPath();
        let drawing = false;
        for (const q of tr) {
          const x = q.xs[lane];
          if (x == null) { drawing = false; continue; }
          if (!drawing) { ctx.moveTo(x, q.cy); drawing = true; } else ctx.lineTo(x, q.cy);
        }
        if (shown.xs[lane] != null && drawing) ctx.lineTo(shown.xs[lane], shown.cy);
        ctx.setLineDash(pass ? [10, 9] : []);
        ctx.strokeStyle = pass ? 'rgba(255,231,168,0.85)' : 'rgba(30,26,22,0.28)';
        ctx.lineWidth = pass ? 3.5 : 8;
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    const xs = shown.xs.length ? shown.xs : [W / 2];
    const y = shown.cy || -shown.m * PX_PER_M;
    for (const x of xs) {
      ctx.fillStyle = 'rgba(255,231,168,0.35)'; ctx.beginPath(); ctx.arc(x, y - 2, 19, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalAlpha = o.lost ? 0.35 : 0.75; ctx.translate(x, y); drawBud(ctx, false, 1.05); ctx.restore();
    }
    const label = (o.name || 'RIVAL').toUpperCase() + (o.lost ? ' · OFFLINE' : '');
    ctx.font = `800 12px ${FONT.ui}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 14, lx = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, xs[0]));
    ctx.fillStyle = INK; roundRect(ctx, lx - tw / 2 + 2, y - 50 + 2, tw, 19, 8); ctx.fill();
    ctx.fillStyle = '#ffe7a8'; roundRect(ctx, lx - tw / 2, y - 50, tw, 19, 8); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; roundRect(ctx, lx - tw / 2, y - 50, tw, 19, 8); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillText(label, lx, y - 40);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function localEnd(sum) { if (ses) { ses.finish(sum); hud.hidden = false; } }

  return {
    host, join, leave, tick, draw, localEnd,
    get session() { return ses; },
    get state() { return ses ? ses.state : 'none'; },
    /** true while a race owns the game screen (countdown through finish) */
    get active() { return !!ses && ses.state !== 'left'; },
    get racing() { return !!ses && (ses.state === 'racing' || ses.state === 'ended'); },
    get myM() { return myM; },
  };
}
