// Forkwood 2.0 MECH: rides (vehicles). Pure and deterministic; sim.js hands
// every call an api object (no import of sim.js).
//
// Shared rules (MECHANICS.md §2.2, owner brief): a ride is ONE EXTRA HIT (a hit
// ejects you: no sap or combo lost, 0.8 s grace), mounting gives 0.6 s of
// 0.5× slow-mo plus a rule label, the 2.0 s of course after a dismount are
// cleared of hazards, sap drains at half rate and the tap becomes the ride's
// action (you cannot fork while riding). A ride never ends a run.
import { clamp } from './rng.js';
import { worldMech } from './world-mech.js';
import { pingTraps, breakTrapAhead } from './traps2.js';

const W = 560;
export const MOUNT_SLOW = { t: 0.6, k: 0.5 };
export const EJECT_GRACE = 0.8, CLEAR_SEC = 2.0, BLINK = 1.0;
export const RARITY = { common: 50, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

export const RIDES = {
  hummingbird: { name: 'Hummingbird', nameVi: 'Chim ruồi', dur: 10, speed: 1.25, steer: 1.6, catch: 1.3, rarity: 'uncommon', label: 'TAP = DART', cd: 0.5, color: '#3fbf7f' },
  rocket: { name: 'Bamboo Rocket', nameVi: 'Tên lửa tre', dur: 6, speed: 2.0, steer: 0.5, catch: 1, rarity: 'rare', label: 'TAP = HOP', cd: 0.6, color: '#9cc46a' },
  mushroom: { name: 'Mushroom Trampoline', nameVi: 'Nấm bật nhảy', dur: 8, speed: 1.3, steer: 1, catch: 1, rarity: 'uncommon', label: 'TAP = STOMP', cd: 0.2, color: '#e2603f' },
  dandelion: { name: 'Dandelion Puff', nameVi: 'Bồ công anh', dur: 12, speed: 1, steer: 1, catch: 1, rarity: 'common', label: 'TAP = FOLD / OPEN', cd: 0.15, color: '#f4ecd8' },
  stag: { name: 'Stag Strider', nameVi: 'Bọ hung chiến', dur: 10, speed: 1.1, steer: 1, catch: 1, rarity: 'rare', label: 'TAP = SNAP', cd: 1.0, color: '#7a4e40' },
  crane: { name: 'Paper Crane', nameVi: 'Hạc giấy', dur: 10, speed: 1, steer: 1, catch: 1.2, rarity: 'uncommon', label: 'TAP = FLAP', cd: 0.25, color: '#fbf5ec' },
  rail: { name: 'Beanstalk Express', nameVi: 'Tàu dây leo', dur: 9, speed: 1.4, steer: 1, catch: 1, rarity: 'rare', label: 'TAP = SWITCH RAIL', cd: 0.4, color: '#5cc65c' },
  swiftlet: { name: 'Night Swift', nameVi: 'Chim yến đêm', dur: 10, speed: 1.2, steer: 1, catch: 1, rarity: 'uncommon', label: 'TAP = SONAR', cd: 1.2, color: '#4fc3d9' },
  morpho: { name: 'Morpho Swarm', nameVi: 'Đàn bướm xanh', dur: 9, speed: 1.15, steer: 1, catch: 1, rarity: 'epic', label: 'TAP = SCATTER', cd: 1.5, color: '#2f7dff' },
  goose: { name: 'Golden Goose', nameVi: 'Ngỗng vàng', dur: 8, speed: 1.3, steer: 1, catch: 1, rarity: 'legendary', label: 'TAP = GOLDEN EGG', cd: 1.0, color: '#ffd25a', hits: 2 },
};
export const RIDE_IDS = Object.keys(RIDES);
// registry names ART uses for some rides (assets/v2/registry.json)
export const RIDE_ART = { rocket: 'bamboorocket', rail: 'beanstalk', goose: 'goldengoose', crane: 'papercrane', stag: 'stagstrider' };
export const rideSkin = (id, anim = 'fly') => `vehicle.${RIDE_ART[id] || id}.${anim}`;
export const GOOSE_MIN_M = 850;

/** Weighted ride pick for a world at height m (signature ×4, natives ×1, rest ×0.3; goose only past 850 m). */
export function ridePick(world, m, r, opts = {}) {
  const wm = worldMech(world).rides;
  const ws = RIDE_IDS.map((id) => {
    if (id === 'goose' && (m < GOOSE_MIN_M || opts.gooseUsed)) return 0;
    const k = id === wm.sig ? 4 : wm.native.includes(id) ? 1 : 0.3;
    return k * RARITY[RIDES[id].rarity];
  });
  const tot = ws.reduce((a, b) => a + b, 0);
  let q = r() * tot;
  for (let i = 0; i < ws.length; i++) { q -= ws[i]; if (q <= 0) return RIDE_IDS[i]; }
  return wm.sig;
}

/** Place a Ride Knot (steer into it to mount) on the course. */
export function addRideKnot(s, x, y, id) {
  s.motes.push({ x: clamp(x, 60, W - 60), y, kind: 'ride', ride: id, r: 20, ph: 0, taken: false, skin: rideSkin(id, 'knot') });
  if (id === 'goose') s.gooseUsed = true;
  s.rideKnots = (s.rideKnots || 0) + 1;
}

const ringLv = (s, id) => (s.ringLv ? s.ringLv(id) : 0);
/** Mount a ride (from a Ride Knot, a set piece, the Ride Token boost or the frog's tongue). */
export function mount(s, id, A, why = 'knot') {
  const R = RIDES[id]; if (!R) return false;
  if (s.ride) dismount(s, A, 'swap', true);
  if (s.tips.length === 2) A.mergeNow(s);
  const upk = A.upK(s, 'rides');
  const craft = ringLv(s, 'craft');
  const dur = R.dur * upk + 2 * craft;
  let hits = R.hits || 1;
  if (craft >= 3) hits = Math.max(hits, 2);
  if (!s.ridesTaken && s.econ && s.econ.up && (s.econ.up.rides | 0) >= 6) hits = Math.max(hits, 2);
  s.ride = { id, t: dur, dur, hits, cd: 0, mode: 'open', air: 0, phase: 0, bounces: 0, flap: 0, dart: 0, scatter: 0, lane: s.cx < W / 2 ? -1 : 1, junction: 0, eggs: 0, smashed: 0, skin: rideSkin(id) };
  s.ridesTaken = (s.ridesTaken || 0) + 1;
  s.slowmo = Math.max(s.slowmo || 0, MOUNT_SLOW.t);
  s.invuln = Math.max(s.invuln, 0.3);
  A.emit(s, 'vehicle.mount', { ride: id, why, x: s.cx, y: s.cy, label: R.label, name: R.name, dur: +dur.toFixed(1), hits, color: R.color, skin: s.ride.skin });
  return true;
}

/** Leave the ride: grace, a hazard-free stretch ahead, an event. */
export function dismount(s, A, why = 'expire', quiet = false) {
  const r = s.ride; if (!r) return;
  s.ride = null;
  s.invuln = Math.max(s.invuln, EJECT_GRACE);
  const dist = CLEAR_SEC * Math.max(170, s.speed);
  if (!quiet) A.clearAhead(s, dist);
  if (s.ringLv && ringLv(s, 'bark') >= 2) s.barkReady = true; // Thick Bark II: first hit after each ride blocked
  A.emit(s, 'vehicle.dismount', { ride: r.id, why, x: s.cx, y: s.cy, clearTo: s.cy - dist });
}

/** A hit while riding: lose the ride (or one of its hits), never sap or combo. */
export function rideHit(s, A, src) {
  const r = s.ride; if (!r) return false;
  if (r.id === 'rail' && r.junction <= 0) return true; // on the rail you cannot be touched
  r.hits--;
  A.emit(s, 'vehicle.hit', { ride: r.id, src, x: s.cx, y: s.cy, hitsLeft: Math.max(0, r.hits) });
  if (r.hits <= 0) dismount(s, A, 'hit'); else s.invuln = Math.max(s.invuln, EJECT_GRACE);
  return true;
}

/** Speed, steering and catch multipliers of the current ride. */
export function rideMods(s) {
  const r = s.ride; if (!r) return null;
  const R = RIDES[r.id];
  let sp = R.speed, catchK = R.catch;
  if (r.id === 'dandelion') { if (r.mode === 'fold') { sp = 1.6; catchK = 0.8; } else { sp = 0.75; catchK = 2; } }
  if (r.id === 'crane') sp = r.flap > 0 ? 1.15 + 0.5 * Math.min(1, r.flap / 0.5) : 0.6;
  if (r.id === 'hummingbird' && r.dart > 0) sp *= 1.6;
  if (r.id === 'mushroom') sp = r.air > 0 ? 1.4 : 1.0;
  return { speed: sp, steer: R.steer, catch: catchK, drain: 0.5 };
}
/** Is the tip airborne over row hazards (mushroom bounce)? */
export const rideAir = (s) => !!(s.ride && s.ride.id === 'mushroom' && s.ride.air > 0);

/** Per-step ride clock and the ride's tap action. Returns true when the tap was consumed. */
export function rideStep(s, dt, input, A) {
  const r = s.ride; if (!r) return false;
  r.t -= dt; r.cd = Math.max(0, r.cd - dt); r.dart = Math.max(0, r.dart - dt); r.flap = Math.max(0, r.flap - dt);
  if (r.scatter > 0) { r.scatter -= dt; if (r.scatter <= 0) { A.bumpMult(s); A.emit(s, 'vehicle.action', { ride: 'morpho', act: 'regroup', x: s.cx, y: s.cy }); } }
  if (r.id === 'mushroom') {
    r.phase += dt;
    if (r.air > 0) { r.air -= dt; if (r.air <= 0) { r.phase = 0; r.land = 0.3; A.emit(s, 'vehicle.action', { ride: 'mushroom', act: 'land', x: s.cx, y: s.cy }); } }
    else { r.land = (r.land || 0) - dt; if (r.land <= 0) { r.air = r.super ? 1.0 : 0.7; r.super = false; r.bounces++; } }
  }
  if (r.id === 'rail') { r.jt = (r.jt || 0) + dt; r.junction = (r.jt % 2.5) > 2.25 ? 1 : 0; }
  const used = !!input.toggle;
  if (used && r.cd <= 0) action(s, r, input, A);
  if (r.t <= 0) dismount(s, A, 'expire');
  return used;
}

function action(s, r, input, A) {
  const R = RIDES[r.id]; r.cd = R.cd;
  const ev = { ride: r.id, x: s.cx, y: s.cy };
  switch (r.id) {
    case 'hummingbird': r.dart = 0.25; s.invuln = Math.max(s.invuln, 0.25); ev.act = 'dart'; break;
    case 'rocket': { const dir = input.targetX != null ? Math.sign(input.targetX - s.cx) || 1 : (input.dir || 1); s.cx = clamp(s.cx + dir * 90, 20, W - 20); ev.act = 'hop'; ev.dir = dir; break; }
    case 'mushroom': {
      if (r.air <= 0 && (r.land || 0) > 0.18) { r.super = true; ev.act = 'super'; A.addScore(s, 40 * s.mult); }
      else if (r.air > 0) { r.air = 0; r.land = 0.3; r.phase = 0; ev.act = 'stomp'; ev.crushed = A.crushNear(s, 60); }
      else ev.act = 'early';
      break;
    }
    case 'dandelion': r.mode = r.mode === 'open' ? 'fold' : 'open'; ev.act = r.mode; break;
    case 'stag': { const hitObj = A.breakAhead(s, 120); ev.act = 'snap'; ev.broke = hitObj || null; if (hitObj) { r.smashed++; A.addScore(s, 60 * s.mult); A.bumpMult(s); } break; }
    case 'crane': r.flap = Math.min(0.9, r.flap + 0.45); ev.act = 'flap'; break;
    case 'rail': r.lane = -r.lane; ev.act = 'switch'; ev.lane = r.lane; break;
    case 'swiftlet': { const n = pingTraps(s, A, 140) + A.stunBeetles(s, 140, 1.5); ev.act = 'ping'; ev.r = 140; ev.stunned = n; if (n) A.addScore(s, 30 * n * s.mult); break; }
    case 'morpho': r.scatter = 1.2; ev.act = 'scatter'; ev.spread = 110; break;
    case 'goose': r.eggs++; A.addScore(s, 100 * s.mult); A.acorns(s, 3, s.cx, s.cy + 30); ev.act = 'egg'; break;
  }
  A.emit(s, 'vehicle.action', ev);
}

/** Rail steering: the rail carries the tip along a lane. */
export const railTarget = (s) => (s.ride && s.ride.id === 'rail' ? W / 2 + s.ride.lane * 110 : null);

/** Extra catch points (Morpho scatter: two more tips 110 u to each side). */
export function rideCatchXs(s) { const r = s.ride; return r && r.id === 'morpho' && r.scatter > 0 ? [s.cx - 110, s.cx + 110] : null; }

// ---------------------------------------------------------------- bot policy (MECHANICS.md §5)
export function rideBot(s, sk, r) {
  const ride = s.ride; if (!ride || ride.cd > 0 || r() > 0.25 + sk * 0.75) return false;
  const y = s.cy;
  const ahead = (d) => s.brambles.some((b) => b.y < y && b.y > y - d) || s.columns.some((c) => c.live && c.y0 < y && c.y0 > y - d) || s.beetles.some((b) => b.y < y && b.y > y - d) || s.traps.some((t) => (t.t2 || t.kind === 'pulse' || t.kind === 'door' || t.kind === 'twig') && (t.y ?? t.y0) < y && (t.y ?? t.y0) > y - d);
  switch (ride.id) {
    case 'dandelion': { const busy = ahead(300); return (busy && ride.mode === 'fold') || (!busy && ride.mode === 'open'); }
    case 'rocket': return false; // hops only to dodge (the steering does the work)
    case 'mushroom': return ride.air <= 0 && (ride.land || 0) > 0.18 && (ride.land || 0) < 0.3;
    case 'stag': return ahead(120);
    case 'crane': return ride.flap < 0.2;
    case 'rail': return false;
    case 'swiftlet': return s.beetles.some((b) => Math.abs(b.y - y) < 140) || s.traps.some((t) => (t.kind === 'hornets' || t.kind === 'bats' || t.kind === 'cone') && Math.abs((t.y ?? 0) - y) < 260);
    case 'morpho': return s.motes.filter((o) => o.kind === 'sun' && o.y < y && o.y > y - 160).length >= 3;
    case 'goose': return true;
    case 'hummingbird': return !ahead(200);
  }
  return false;
}
