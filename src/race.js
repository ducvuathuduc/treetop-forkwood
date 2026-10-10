// P6-RACE: live 2-player race. Room ids, the transport layer and the race
// session (lobby -> countdown -> race -> finish -> rematch). No DOM here except
// the lazy <script> tag for PeerJS; ui-race.js draws everything.
//
// Transport interface (every link implements it):
//   link.on('ready'|'open'|'data'|'close'|'error', fn)   events
//   link.send(obj)                                        JSON-able message to the other side
//   link.close()                                          tear down
// 'ready' = host is listening (room registered); 'open' = the two players are connected.
// PeerLink uses PeerJS 1.5.5 (WebRTC data channel, free public PeerJS cloud broker).
// LocalLink uses a BroadcastChannel (two tabs of one browser) and exists for tests
// and offline play on one machine; DeadLink never connects (tests the fallback).

export const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
export const RACE_SECONDS = 90;
// same sim for both players; mode marker lets the difficulty director stay off for races
export const RACE_RULES = { timeLimit: RACE_SECONDS, speed: 1.08, drain: 0.95, score: 1, mode: 'race' };
export const CONNECT_TIMEOUT = 8000;  // no connection within this -> fall back to the async duel link
export const STALE_MS = 6000;         // nothing heard for this long -> the other player is gone
export const SEND_MS = 100;           // race state ~10 Hz
export const COUNTDOWN = 3;
const PROTO = 1;

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const pick = (n, rnd) => Array.from({ length: n }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join('');
/** forkwood-<6-char code>-<random>: the code is what people read out, the tail keeps rooms unguessable. */
export const newRoomId = (rnd = Math.random) => `forkwood-${pick(6, rnd)}-${pick(10, rnd)}`;
export const parseRoom = (v) => (/^forkwood-[a-z0-9]{6}-[a-z0-9]{4,24}$/.test(String(v || '')) ? String(v) : null);
export const roomCode = (id) => (id || '').split('-')[1].toUpperCase();
/** Course seed for a room and round: both sides derive the same tree with no handshake. */
export function seedFor(room, round = 0) {
  let h = 2166136261;
  for (const ch of `${room}:${round}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export const raceUrl = (room, loc = location) => `${loc.origin}${loc.pathname}?race=${room}`;

// ---------------------------------------------------------------- transports
class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
  emit(ev, ...a) { for (const fn of this._h[ev] || []) { try { fn(...a); } catch (e) { console.warn('race handler', e); } } }
}

let peerLoading = null;
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  peerLoading = peerLoading || new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('peerjs missing')));
    s.onerror = () => { peerLoading = null; s.remove(); rej(new Error('peerjs load failed')); };
    document.head.appendChild(s);
  });
  return peerLoading;
}

export class PeerLink extends Emitter {
  constructor(role, room) {
    super();
    this.role = role; this.room = room; this.conn = null; this.peer = null; this.dead = false;
    loadPeerJS().then((Peer) => this._start(Peer)).catch(() => this.emit('error', 'load'));
  }
  _start(Peer) {
    if (this.dead) return;
    const peer = this.peer = this.role === 'host' ? new Peer(this.room, { debug: 0 }) : new Peer({ debug: 0 });
    peer.on('error', (e) => this.emit('error', (e && e.type) || 'peer'));
    peer.on('disconnected', () => { if (!this.dead && !peer.destroyed) try { peer.reconnect(); } catch { /* broker gone; the data channel may still live */ } });
    if (this.role === 'host') {
      peer.on('open', () => this.emit('ready'));
      peer.on('connection', (c) => {
        if (this.conn && this.conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 400); }); return; }
        this._attach(c);
      });
    } else {
      peer.on('open', () => this._attach(peer.connect(this.room, { reliable: true, serialization: 'json' })));
    }
  }
  _attach(c) {
    this.conn = c;
    c.on('open', () => this.emit('open'));
    c.on('data', (d) => this.emit('data', d));
    c.on('close', () => { if (this.conn === c) { this.conn = null; this.emit('close'); } });
    c.on('error', () => {});
  }
  send(o) { if (this.conn && this.conn.open) try { this.conn.send(o); } catch { /* channel closing */ } }
  close() { this.dead = true; try { if (this.peer) this.peer.destroy(); } catch { /* ignore */ } }
}

export class LocalLink extends Emitter {
  constructor(role, room) {
    super();
    this.role = role; this.open = false; this.dead = false;
    this.bc = new BroadcastChannel('fw-race-' + room);
    this.bc.onmessage = (e) => this._in(e.data);
    if (role === 'host') setTimeout(() => !this.dead && this.emit('ready'), 30);
    else { const knock = () => { if (this.dead || this.open) return; this._post({ sys: 'hello' }); setTimeout(knock, 250); }; knock(); }
  }
  _post(o) { if (!this.dead) this.bc.postMessage({ from: this.role, ...o }); }
  _in(m) {
    if (!m || m.from === this.role) return;
    if (m.sys === 'hello' && this.role === 'host') { if (this.open) return; this.open = true; this._post({ sys: 'ack' }); this.emit('open'); }
    else if (m.sys === 'ack' && this.role === 'guest' && !this.open) { this.open = true; this.emit('open'); }
    else if (m.sys === 'bye') { if (this.open) { this.open = false; this.emit('close'); } }
    else if (m.msg && this.open) this.emit('data', m.msg);
  }
  send(o) { if (this.open) this._post({ msg: o }); }
  close() { if (this.open) this._post({ sys: 'bye' }); this.dead = true; this.open = false; this.bc.close(); }
}

/** Never connects: exercises the timeout and fallback path. */
export class DeadLink extends Emitter { send() {} close() {} }

export function makeLink(kind, role, room) {
  if (kind === 'local' && typeof BroadcastChannel !== 'undefined') return new LocalLink(role, room);
  if (kind === 'dead') return new DeadLink();
  return new PeerLink(role, room);
}

// ---------------------------------------------------------------- session
/**
 * One race room seen from this device. The UI listens to `change` and reads
 * the fields; main.js feeds it the live sim with tick(sim) while racing.
 * states: connecting | waiting (host, room open) | lobby | countdown | racing | ended (me done, waiting) | done | failed
 */
export class RaceSession extends Emitter {
  constructor({ role, room, me, transport = 'peer', now = () => performance.now(), timeout = CONNECT_TIMEOUT }) {
    super();
    this.role = role; this.room = room; this.me = { ...me, ready: false };
    this.opp = null; this.round = 0; this.state = 'connecting'; this.why = '';
    this.count = 0; this.mine = null; this.now = now; this.everConnected = false;
    this.link = makeLink(transport, role, room);
    this.link.on('ready', () => { clearTimeout(this.tmo); if (this.state === 'connecting') this._set('waiting'); });
    this.link.on('open', () => this._open());
    this.link.on('data', (d) => this._data(d));
    this.link.on('close', () => this._lost('closed'));
    this.link.on('error', (e) => {
      if (this.everConnected && e !== 'peer-unavailable') return; // broker hiccups after the channel is up do not matter
      if (this.state === 'connecting' || (this.role === 'guest' && !this.everConnected)) this._fail(e === 'unavailable-id' ? 'room-taken' : e === 'peer-unavailable' ? 'no-host' : 'network');
    });
    this.tmo = setTimeout(() => { if (this.state === 'connecting') this._fail('timeout'); }, timeout);
    this.beat = setInterval(() => this._heartbeat(), 1000);
  }
  get seed() { return seedFor(this.room, this.round); }
  _set(st, why = '') { this.state = st; if (why) this.why = why; this.emit('change', st); }
  _fail(why) { clearTimeout(this.tmo); this._set('failed', why); this.link.close(); clearInterval(this.beat); }
  _send(o) { this.link.send(o); }
  _hello() { this._send({ t: 'hi', v: PROTO, n: this.me.name, p: this.me.p, f: this.me.f, ready: this.me.ready, round: this.round }); }
  _open() {
    clearTimeout(this.tmo);
    this.everConnected = true;
    this._hello();
  }
  _data(d) {
    if (!d || typeof d !== 'object') return;
    const t = this.now();
    if (this.opp) {
      this.opp.seen = t;
      // a stalled tab (phone backgrounded, CPU starved) that speaks again is back in the race
      if (this.opp.lost === 'timeout' && d.t !== 'bye') { this.opp.lost = false; this.emit('change', this.state); }
    }
    switch (d.t) {
      case 'full': this._fail('full'); break;
      case 'hi': {
        const fresh = !this.opp;
        if (fresh) this.opp = { ready: !!d.ready, seen: t, m: 0, cy: 0, xs: [], trail: [], end: null, lost: false };
        Object.assign(this.opp, { name: String(d.n || 'Friend').slice(0, 12) || 'Friend', p: d.p | 0, f: d.f | 0 });
        if (this.role === 'guest' && typeof d.round === 'number') this.round = d.round;
        if (fresh) this._hello();
        if (this.state === 'connecting' || this.state === 'waiting') this._set('lobby'); else this.emit('change', this.state);
        break;
      }
      case 'ready': if (this.opp) { this.opp.ready = !!d.on; this._maybeGo(); this.emit('change', this.state); } break;
      case 'go': if (this.role === 'guest') this._countdown(d.round); break;
      case 'st': if (this.opp && (this.state === 'racing' || this.state === 'ended' || this.state === 'countdown')) {
        this.opp.m = +d.m || 0; this.opp.cy = +d.cy || 0; this.opp.xs = Array.isArray(d.xs) ? d.xs.slice(0, 2).map(Number) : []; this.opp.sc = d.sc | 0; this.opp.tt = +d.tt || 0;
        const tr = this.opp.trail, last = tr[tr.length - 1];
        if (!last || Math.abs(last.cy - this.opp.cy) > 2 || last.xs.length !== this.opp.xs.length) { tr.push({ cy: this.opp.cy, xs: this.opp.xs }); if (tr.length > 600) tr.splice(0, tr.length - 600); }
        this.emit('opp');
      } break;
      case 'end': if (this.opp) { this.opp.end = { h: d.h | 0, sc: d.sc | 0, why: String(d.why || '') }; this.opp.m = d.h | 0; this._maybeDone(); this.emit('change', this.state); } break;
      case 'again': if (this.opp) { this.opp.ready = true; this._maybeGo(); this.emit('change', this.state); } break;
      case 'bye': this._lost('left'); break;
      case 'ping': default: break;
    }
  }
  _heartbeat() {
    if (!this.opp) return;
    this._send({ t: 'ping' });
    if (!this.opp.lost && this.now() - this.opp.seen > STALE_MS) this._lost('timeout');
  }
  _lost(why) {
    if (!this.opp || this.opp.lost) return;
    if (this.state === 'lobby' || this.state === 'waiting') {
      // friend left before the start: the host keeps the room open for them
      this.opp = null; this.me.ready = false;
      if (this.role === 'host') this._set('waiting', 'left'); else this._fail('left');
      return;
    }
    this.opp.lost = why;
    if (this.state === 'countdown') { clearInterval(this.cd); this._set('done', 'lost'); return; }
    this._maybeDone();
    this.emit('change', this.state);
  }
  setReady(on = true) {
    if (!this.opp || this.opp.lost) return;
    this.me.ready = on;
    this._send({ t: 'ready', on });
    this._maybeGo();
    this.emit('change', this.state);
  }
  rematch() {
    if (!this.opp || this.opp.lost || this.state !== 'done') return;
    this.me.ready = true;
    this._send({ t: 'again' });
    this._maybeGo();
    this.emit('change', this.state);
  }
  _maybeGo() {
    if (this.role !== 'host' || !this.opp || !this.me.ready || !this.opp.ready) return;
    if (this.state !== 'lobby' && this.state !== 'done') return;
    const round = this.state === 'done' ? this.round + 1 : this.round;
    this._send({ t: 'go', round, seed: seedFor(this.room, round) });
    this._countdown(round);
  }
  _countdown(round) {
    if (this.state === 'countdown' || this.state === 'racing') return;
    this.round = round;
    this.me.ready = false; if (this.opp) { this.opp.ready = false; this.opp.end = null; this.opp.trail = []; this.opp.m = 0; this.opp.xs = []; this.opp.cy = 0; }
    this.mine = null; this.count = COUNTDOWN;
    this._set('countdown');
    clearInterval(this.cd);
    this.cd = setInterval(() => {
      this.count--;
      if (this.count > 0) { this.emit('change', this.state); return; }
      clearInterval(this.cd);
      this.lastSend = 0;
      this._set('racing');
      this.emit('start', { seed: this.seed, rules: RACE_RULES, round: this.round });
    }, 1000);
  }
  /** Called every frame while racing with the live sim; sends ~10 Hz. */
  tick(sim, heightM) {
    if (this.state !== 'racing' || !sim) return;
    const t = this.now();
    if (t - (this.lastSend || 0) < SEND_MS) return;
    this.lastSend = t;
    this._send({ t: 'st', m: Math.round(heightM * 10) / 10, cy: Math.round(sim.cy), xs: sim.tips.map((q) => Math.round(q.x)), sc: Math.floor(sim.score), tt: Math.round(sim.t * 10) / 10 });
  }
  /** My run ended (out of sap or the clock). */
  finish(sum) {
    if (this.state !== 'racing') return;
    this.mine = { h: sum.height, sc: sum.score, why: sum.end };
    this._send({ t: 'end', h: sum.height, sc: sum.score, why: sum.end });
    this._set('ended');
    this._maybeDone();
  }
  _maybeDone() {
    if (this.state !== 'ended' || !this.opp) return;
    if (this.opp.end || this.opp.lost) this._set('done');
  }
  /** win | lose | tie (heights first, then points) */
  get result() {
    if (!this.mine || !this.opp) return null;
    if (!this.opp.end) return 'win';
    const a = this.mine, b = this.opp.end;
    if (a.h !== b.h) return a.h > b.h ? 'win' : 'lose';
    if (a.sc !== b.sc) return a.sc > b.sc ? 'win' : 'lose';
    return 'tie';
  }
  leave() {
    clearInterval(this.beat); clearInterval(this.cd); clearTimeout(this.tmo);
    this._send({ t: 'bye' });
    setTimeout(() => this.link.close(), 150);
    this.state = 'left';
  }
}
