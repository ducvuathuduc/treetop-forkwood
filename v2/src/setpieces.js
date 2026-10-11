// Forkwood 2.0 MECH: set pieces (calm spectacle, chase, boss), bosses, chests
// and the in-run drop tables (MECHANICS.md §2.6, §2.7). Pure and deterministic.
//
// Schedule: calm ~260 m, chase ~640 m, boss ~900 m, then the rotation repeats
// every ~350 m with +15% intensity per loop. A set piece is part of the COURSE
// (placed by the director from the seed), so daily / weekly / race courses carry
// the same set pieces for everyone. Boss attacks roll on their own stream, and
// each one follows the trap contract (>= 1.2 s telegraph). Set pieces never
// overlap a storm (the storm waits) and regular traps stay out of a boss fight.
import { clamp, mulberry32 } from './rng.js';
import { worldMech } from './world-mech.js';

const W = 560, TIP_R = 9, PX = 30;
export const SP_FIRST = [{ type: 'calm', m: 260 }, { type: 'chase', m: 640 }, { type: 'boss', m: 900 }];
export const SP_LOOP = 350, SP_LEN = { calm: 140, chase: 190, boss: 230 };
export const BOSS_WARN = { dive: 1.2, track: 0.25, lane: 46, sweep: 1.5, sweepLane: 40, volley: 1.3, ring: 1.25, ringR: 46, ringArmed: 0.8, grab: 1.4, orbs: 1.2, plates: 1.5 };
export const BOSS_DMG = 18;

export const BOSSES = {
  giant: { phases: [['volley', 'volley'], ['sweep', 'sweep'], ['coins', 'volley']] }, // V2-INT: names follow ART's drawn bosses (see world-mech.js); ids unchanged for audio/tests
  crowking: { phases: [['dive', 'dive', 'dive'], ['volley', 'volley', 'volley'], ['grab', 'dive']] },
  gargoyle: { phases: [['sweep', 'sweep'], ['grab', 'dive'], ['dive2', 'dive2']] },
  kitsune: { phases: [['orbs'], ['orbs', 'dive'], ['orbs', 'orbs']] },
  heron: { phases: [['dive', 'dive', 'dive'], ['ring', 'ring', 'ring'], ['sweep', 'dive']] },
  stag: { phases: [['plates'], ['volley', 'volley'], ['sweep', 'sweep']] },
  dragon: { phases: [['ring', 'ring', 'ring'], ['dive', 'dive'], ['volley', 'volley']] },
};

/** n-th set piece slot: {type, m, loop}. */
export function spSlot(i) {
  if (i < 3) return { ...SP_FIRST[i], loop: 0 };
  const k = i - 3, loop = 1 + Math.floor(k / 3);
  return { type: SP_FIRST[k % 3].type, m: 900 + SP_LOOP * (k + 1), loop };
}
/** Which set-piece types a mode allows (Zen: calm only, Storm Rush: chases only, quests: none). */
export function spAllowed(R, type) {
  if (R.script) return false;
  if (R.noDeath) return type === 'calm';
  if (R.storms) return type === 'chase';
  return true;
}

const lootStream = (s) => s.rng6 || (s.rng6 = mulberry32((s.seed ^ 0x3c6ef372) >>> 0));
const bossStream = (s, i) => mulberry32((s.seed ^ (0x1b873593 + i * 0x2545f491)) >>> 0);

/** Director hook: open the next set piece at height m (generation time). Returns the region or null. */
export function spOpen(s, y, m) {
  const D = s.dir;
  D.spI = D.spI || 0;
  let slot = spSlot(D.spI);
  while (slot && !spAllowed(s.R, slot.type) && D.spI < 60) slot = spSlot(++D.spI);
  if (!slot || m < slot.m) return null;
  D.spI++;
  const wm = worldMech(s.world), def = wm.setPieces[slot.type];
  const len = SP_LEN[slot.type] * PX;
  const sp = { i: D.spI - 1, type: slot.type, id: def.id, name: def.name, nameVi: def.nameVi, boss: def.boss || null, pursuer: def.pursuer || null, loop: slot.loop, y0: y, y1: y - len, n: 0, started: false, ended: false, skin: def.id };
  s.spList.push(sp);
  return sp;
}

/** Director hook: one chunk inside an open set piece. api: sim primitives. Returns its length. */
export function spChunk(s, sp, y, d, m, A) {
  const r = s.rng, k = sp.n++;
  if (sp.type === 'calm') {
    // pure reward: rich trails worth double, a free signature ride at the start
    if (k === 0) { A.addTrail(s, y, { n: 6, cx: W / 2, amp: 60, bonus: 2 }); A.addRideKnot(s, W / 2, y - 330, worldMech(s.world).rides.sig); s.lastGate = null; return 520; }
    A.addTrail(s, y, { n: 8, amp: 100 + r() * 90, bonus: 2 });
    A.addTwinTrail(s, y - 380, 140 + r() * (W - 280), 4, 2);
    s.lastGate = null; return 680;
  }
  if (sp.type === 'chase') {
    if (k === 0) {
      s.traps.push({ kind: 'tide', y0: sp.y0 - 40, y1: sp.y1 + 120, top: null, v: 0, done: false, k: 0.85 + 0.03 * sp.loop, chase: true, skin: `${s.world}.sp.${sp.pursuer}` });
      A.addTrail(s, y - 40, { n: 5, cx: W / 2, amp: 80 });
      A.addRideKnot(s, W / 2 + (r() - 0.5) * 160, y - 380, worldMech(s.world).rides.sig);
      s.lastGate = null; return 620;
    }
    if (k % 2 === 1) return A.worldChunk(s, y, Math.min(1, d * (1 + 0.15 * sp.loop)), m, 1);
    A.addTrail(s, y, { n: 6, amp: 140 }); s.lastGate = null; return 460;
  }
  // boss: only sunlight on the course; the attacks come from the boss at run time
  if (k % 2 === 0) A.addTrail(s, y, { n: 6, amp: 90 + r() * 120 }); else A.addTwinTrail(s, y, 160 + r() * (W - 320), 4);
  s.lastGate = null; return 440;
}

// ---------------------------------------------------------------- run time
/** Per-step: start / end set pieces as the tip enters / leaves them, and run the boss. */
export function spUpdate(s, dt, A) {
  for (const sp of s.spList) {
    if (!sp.started && s.cy < sp.y0) {
      sp.started = true; s.sp = sp; sp.hits0 = s.hits;
      A.emit(s, 'setpiece.start', { id: sp.id, kind: sp.type, name: sp.name, nameVi: sp.nameVi, loop: sp.loop, x: s.cx, y: s.cy, skin: sp.skin });
      if (sp.type === 'boss') s.boss = { id: sp.boss, sp, phase: -1, t: 1.6, atk: null, q: 0, foils: 0, hits: 0, plates: 0, rng: bossStream(s, sp.i), skin: `${s.world}.boss.${sp.boss}` };
    }
    if (sp.started && !sp.ended && s.cy < sp.y1) {
      sp.ended = true; if (s.sp === sp) s.sp = null;
      const hitsIn = s.hits - (sp.hits0 || 0);
      const perfect = hitsIn === 0;
      if (sp.type === 'boss' && s.boss) { s.boss = null; s.bossesBeaten = (s.bossesBeaten || 0) + 1; }
      s.setPieces = (s.setPieces || 0) + 1;
      const loot = openChest(s, sp.type, perfect, sp.boss, A);
      A.emit(s, 'setpiece.end', { id: sp.id, kind: sp.type, perfect, hits: hitsIn, x: s.cx, y: s.cy });
      A.emit(s, 'chest', { kind: sp.type, tier: sp.type, perfect, loot, x: s.cx, y: s.cy - 60, skin: `${s.world}.chest.${sp.type}` });
    }
  }
  s.spList = s.spList.filter((sp) => !sp.ended || sp.y1 < s.cy + 1200);
  if (s.boss) bossStep(s, dt, A);
}

function bossStep(s, dt, A) {
  const B = s.boss, sp = B.sp, def = BOSSES[B.id];
  const p = clamp((sp.y0 - s.cy) / (sp.y0 - sp.y1), 0, 0.999);
  const ph = Math.min(2, Math.floor(p * 3));
  if (ph !== B.phase) { B.phase = ph; B.q = 0; A.emit(s, 'boss.phase', { boss: B.id, phase: ph, x: s.cx, y: s.cy, skin: B.skin, word: def.words ? def.words[ph] : null }); }
  if (B.atk) { if (atkStep(s, B, B.atk, dt, A)) { B.atk = null; B.t = Math.max(0.5, 1.0 / (1 + 0.15 * sp.loop)); } return; }
  B.t -= dt;
  if (B.t > 0 || s.cy < sp.y1 + 260) return; // no new attack in the last stretch
  const list = def.phases[ph];
  let kind = list[B.q++ % list.length];
  if (kind === 'grab' && !(s.tips.length === 2 && s.tips.some((t) => t.staged > 0))) kind = 'dive';
  B.atk = atkStart(s, B, kind, A);
}

const spd = (s) => Math.max(170, s.speed);
function atkStart(s, B, kind, A) {
  const r = B.rng, a = { kind, t: 0, done: false, skin: `${B.skin}.${kind}` };
  const emitWarn = (x, y, t, extra) => A.emit(s, 'trapWarn', { trap: `boss:${B.id}:${kind}`, skin: a.skin, x, y, t: +t.toFixed(2), boss: true, ...(extra || {}) });
  switch (kind) {
    case 'dive': case 'sweep': case 'dive2': {
      const lane = kind === 'sweep' ? BOSS_WARN.sweepLane : BOSS_WARN.lane;
      a.warn = kind === 'sweep' ? BOSS_WARN.sweep : BOSS_WARN.dive; a.lane = lane;
      const x0 = s.decoy > 0 ? s.decoyX : s.cx;
      a.xs = kind === 'dive2' ? [x0, clamp(x0 + (x0 < W / 2 ? 1 : -1) * (2 * lane + 2 * TIP_R + 60), lane, W - lane)] : [x0];
      emitWarn(a.xs[0], s.cy, a.warn, { lane, lanes: a.xs.slice() });
      break;
    }
    case 'volley': {
      a.warn = BOSS_WARN.volley; a.y = s.cy - spd(s) * a.warn; a.gapW = 140;
      a.gap = clamp(s.cx + (r() - 0.5) * 360, a.gapW / 2 + 20, W - a.gapW / 2 - 20);
      emitWarn(a.gap, a.y, a.warn, { gap: [a.gap - a.gapW / 2, a.gap + a.gapW / 2] });
      break;
    }
    case 'ring': {
      a.warn = BOSS_WARN.ring; a.r = BOSS_WARN.ringR;
      a.x = clamp(s.cx + (r() - 0.5) * 120, 60, W - 60); a.y = s.cy - spd(s) * a.warn;
      emitWarn(a.x, a.y, a.warn, { r: a.r });
      break;
    }
    case 'grab': a.warn = BOSS_WARN.grab; emitWarn(s.cx, s.cy, a.warn, { grab: true }); break;
    case 'orbs': {
      a.warn = BOSS_WARN.orbs; a.y = s.cy - spd(s) * 1.9;
      a.orbs = [-1, 0, 1].map((k) => ({ x: clamp(s.cx + k * 150, 40, W - 40), done: false }));
      emitWarn(s.cx, a.y, a.warn, { orbs: a.orbs.map((o) => o.x) });
      break;
    }
    case 'plates': {
      a.warn = BOSS_WARN.plates; a.y = s.cy - spd(s) * a.warn;
      a.plates = [W / 2 - 160, W / 2, W / 2 + 160].map((x) => ({ x, broken: false, passed: false }));
      emitWarn(W / 2, a.y, a.warn, { plates: a.plates.map((p) => p.x) });
      break;
    }
    case 'coins': {
      a.warn = 0;
      for (let i = 0; i < 8; i++) s.motes.push({ x: clamp(s.cx + Math.sin(i) * 120, 40, W - 40), y: s.cy - 260 - i * 40, kind: 'sun', r: 11, ph: 0, taken: false, bonus: 2 });
      A.acorns(s, 3, s.cx, s.cy - 200);
      break;
    }
  }
  A.emit(s, 'boss.attack', { boss: B.id, attack: kind, phase: B.phase, x: s.cx, y: s.cy, skin: a.skin });
  return a;
}

/** Advance one boss attack. Returns true when it has resolved. */
function atkStep(s, B, a, dt, A) {
  a.t += dt;
  const R = A.tipR(s), safe = s.invuln > 0 || s.pu.rush > 0;
  const hitTip = (ti) => { B.hits++; A.hit(s, ti, BOSS_DMG, 'boss'); };
  const foil = (how, bonus = 30) => { B.foils++; const b = A.addScore(s, bonus * s.mult); A.emit(s, 'boss.foil', { boss: B.id, attack: a.kind, how, x: s.cx, y: s.cy, bonus: b }); };
  switch (a.kind) {
    case 'coins': return true;
    case 'dive': case 'sweep': case 'dive2': {
      if (a.t < BOSS_WARN.track && a.kind !== 'dive2') a.xs[0] += clamp((s.decoy > 0 ? s.decoyX : s.cx) - a.xs[0], -400 * dt, 400 * dt);
      if (a.t < a.warn) return false;
      let ti = -1; s.tips.forEach((t, i) => { if (a.xs.some((x) => Math.abs(t.x - x) < a.lane + R - 3)) ti = i; });
      if (ti >= 0 && !safe && !(s.decoy > 0)) hitTip(ti); else foil(s.decoy > 0 ? 'decoy' : 'dodge');
      return true;
    }
    case 'volley': {
      if (!a.passed && a.y >= s.cy && a.y < s.prevCy) {
        a.passed = true;
        let ti = -1; s.tips.forEach((t, i) => { if (t.x < a.gap - a.gapW / 2 + R - 3 || t.x > a.gap + a.gapW / 2 - R + 3) ti = i; });
        if (ti >= 0 && !safe) hitTip(ti); else foil('gap', 20);
        return true;
      }
      return a.t > a.warn + 3; // the tip never got there (slowed): let it go
    }
    case 'ring': {
      if (a.t < a.warn) return false;
      if (!a.armed) {
        a.armed = true;
        if (s.tips.length === 2 && s.tips[0].x < a.x && s.tips[1].x > a.x && Math.abs(s.cy - a.y) < a.r + 40) { foil('candy', 40); A.acorns(s, 2, a.x, a.y); return true; }
      }
      for (let i = 0; i < s.tips.length; i++) { const t = s.tips[i]; if ((t.x - a.x) ** 2 + (s.cy - a.y) ** 2 < (a.r + R - 4) ** 2) { if (!safe) hitTip(i); else foil('safe'); return true; } }
      if (a.t > a.warn + BOSS_WARN.ringArmed) { foil('dodge', 20); return true; }
      return false;
    }
    case 'grab': {
      if (a.t < a.warn) return false;
      if (s.tips.length === 2 && !safe) {
        let lost = 0; for (const t of s.tips) { lost += t.staged; t.staged = 0; } s.commits -= lost;
        B.hits++; A.emit(s, 'boss.steal', { boss: B.id, lost, x: s.cx, y: s.cy });
      } else foil('merged', 50);
      return true;
    }
    case 'orbs': {
      const active = a.t >= a.warn;
      const tx = s.tips.length === 2 ? s.cx : (s.decoy > 0 ? s.decoyX : s.cx); // a fork splits them: they aim between the tips
      for (const o of a.orbs) {
        if (o.done) continue;
        if (active) o.x += clamp(tx - o.x, -70 * dt, 70 * dt);
        if (a.y >= s.cy && a.y < s.prevCy) {
          o.done = true;
          let ti = -1; s.tips.forEach((t, i) => { if (Math.abs(t.x - o.x) < 14 + R - 3) ti = i; });
          if (ti >= 0 && active && !safe) hitTip(ti);
        }
      }
      if (a.orbs.every((o) => o.done)) { if (!a.hit) foil('dodge', 30); return true; }
      return a.t > a.warn + 4;
    }
    case 'plates': {
      if (a.y >= s.cy && a.y < s.prevCy) {
        for (const p of a.plates) {
          const two = s.tips.length === 2;
          if (two && s.tips[0].x < p.x && s.tips[1].x > p.x) { p.broken = true; B.plates++; foil('plate', 60); continue; }
          let ti = -1; s.tips.forEach((t, i) => { if (Math.abs(t.x - p.x) < 16 + R - 3) ti = i; });
          if (ti >= 0 && !safe) hitTip(ti);
        }
        return true;
      }
      return a.t > a.warn + 3;
    }
  }
  return true;
}

/** Boss attack primitives as drawable shapes (debug / placeholders). */
export function bossShapes(s) {
  const B = s.boss; if (!B || !B.atk) return [];
  const a = B.atk, out = [];
  if (a.xs) for (const x of a.xs) out.push({ t: 'lane', x, hw: a.lane, warn: a.t < a.warn, left: a.warn - a.t });
  if (a.kind === 'volley') out.push({ t: 'row', y: a.y, solids: [[0, a.gap - a.gapW / 2], [a.gap + a.gapW / 2, W]] });
  if (a.kind === 'ring') out.push({ t: 'circle', x: a.x, y: a.y, r: a.r, armed: !!a.armed });
  if (a.kind === 'grab') out.push({ t: 'circle', x: s.cx, y: s.cy, r: 90 * (1 - a.t / a.warn) + 20 });
  if (a.orbs) for (const o of a.orbs) if (!o.done) out.push({ t: 'circle', x: o.x, y: a.y, r: 14 });
  if (a.plates) for (const p of a.plates) if (!p.broken) out.push({ t: 'col', x: p.x, y0: a.y + 40, y1: a.y - 40, hw: 16 });
  return out.map((o) => ({ ...o, kind: `boss:${B.id}:${a.kind}`, skin: a.skin }));
}

// ---------------------------------------------------------------- drop tables
export const HOLLOW = { firstM: 100, every: 250 }; // V2-MECH econ tune: 150 -> 250 m
export const HOLLOW_TABLE = [
  { id: 'acorns', w: 40, lo: 5, hi: 10 }, { id: 'pickup', w: 25 }, { id: 'ride', w: 12 }, { id: 'sap', w: 10, sap: 25 },
  { id: 'acornsBig', w: 7, lo: 20, hi: 40 }, { id: 'gem', w: 2, minM: 250 }, { id: 'rideToken', w: 2 },
];
export const CHEST_TABLE = {
  calm: [{ id: 'acorns', w: 46, lo: 10, hi: 30 }, { id: 'boost', w: 30 }, { id: 'acornsBig', w: 10, lo: 50, hi: 80 }, { id: 'gem', w: 3 }, { id: 'rideToken', w: 8 }, { id: 'acorns2', w: 3, lo: 15, hi: 45 }],
  chase: [{ id: 'acornsBoost', w: 100, lo: 12, hi: 25 }],
  boss: [{ id: 'acorns', w: 45, lo: 40, hi: 80 }, { id: 'boost2', w: 20 }, { id: 'rideToken2', w: 12 }, { id: 'gem', w: 12 }, { id: 'skin', w: 8 }, { id: 'trophy', w: 3 }],
};
export const CHEST_POINTS = { calm: 300, chase: 500, boss: 1000 };
const roll = (table, r) => { const tot = table.reduce((a, o) => a + o.w, 0); let q = r() * tot; for (const o of table) { q -= o.w; if (q <= 0) return o; } return table[table.length - 1]; };

/**
 * Open a set-piece chest. Pure runs: points only. Free play: acorns go into the
 * run, gems into s.gems, everything meta (boosts, ride tokens, skins, trophies)
 * into s.loot for economy.applyLoot() after the run.
 */
export function openChest(s, tier, perfect, boss, A) {
  const out = [];
  const pts = A.addScore(s, CHEST_POINTS[tier] * s.mult * (perfect ? 1.5 : 1));
  out.push({ type: 'points', n: pts });
  if (s.pure || !s.econ) return out;
  const r = lootStream(s);
  for (let k = 0; k < (perfect && tier === 'boss' ? 2 : 1); k++) {
    const o = roll(CHEST_TABLE[tier], r);
    const n = o.lo ? o.lo + Math.floor(r() * (o.hi - o.lo + 1)) : 0;
    if (o.id === 'acorns' || o.id === 'acornsBig' || o.id === 'acorns2') out.push({ type: 'acorns', n: A.acorns(s, n, s.cx, s.cy, true) });
    else if (o.id === 'acornsBoost') { out.push({ type: 'acorns', n: A.acorns(s, n, s.cx, s.cy, true) }); out.push({ type: 'boost', n: 1 }); }
    else if (o.id === 'boost' || o.id === 'boost2') out.push({ type: 'boost', n: o.id === 'boost2' ? 2 : 1 });
    else if (o.id === 'rideToken' || o.id === 'rideToken2') out.push({ type: 'rideToken', n: o.id === 'rideToken2' ? 2 : 1 });
    else if (o.id === 'gem') { s.gems++; out.push({ type: 'gem', n: 1 }); }
    else if (o.id === 'skin') out.push({ type: 'skin', world: s.world, fallback: 600 });
    else if (o.id === 'trophy') out.push({ type: 'trophy', boss });
  }
  for (const l of out) if (l.type !== 'points' && l.type !== 'acorns' && l.type !== 'gem') s.loot.push(l);
  return out;
}

/** Knot Hollow positions (own stream: never shifts the course). */
export function hollowYs(s, uptoM) {
  const r = mulberry32((s.seed ^ 0x7f4a7c15) >>> 0), ys = [];
  for (let m = HOLLOW.firstM; m < uptoM; m += HOLLOW.every) ys.push({ y: -(m + r() * 40) * PX, x: 90 + r() * (W - 180) });
  return ys;
}
/** Open a Knot Hollow. Pure runs: points only. */
export function openHollow(s, o, A) {
  if (s.pure || !s.econ) { const b = A.addScore(s, 200 * s.mult); A.emit(s, 'hollow', { x: o.x, y: o.y, loot: { type: 'points', n: b } }); return; }
  const r = lootStream(s), m = -o.y / PX;
  let it = roll(HOLLOW_TABLE, r);
  if (it.id === 'gem' && m < it.minM) it = HOLLOW_TABLE[0];
  let loot;
  if (it.id === 'acorns' || it.id === 'acornsBig') loot = { type: 'acorns', n: A.acorns(s, it.lo + Math.floor(r() * (it.hi - it.lo + 1)), o.x, o.y, true) };
  else if (it.id === 'pickup') { const k = A.randomPickup(r); A.givePickup(s, k, o.x, o.y); loot = { type: 'pickup', id: k }; }
  else if (it.id === 'ride') { const id = A.ridePick(s, r); A.mount(s, id, 'hollow'); loot = { type: 'ride', id }; }
  else if (it.id === 'sap') { s.sap = Math.min(A.sapMax(s), s.sap + it.sap); loot = { type: 'sap', n: it.sap }; }
  else if (it.id === 'gem') { s.gems++; loot = { type: 'gem', n: 1 }; }
  else { loot = { type: 'rideToken', n: 1 }; s.loot.push(loot); }
  A.emit(s, 'hollow', { x: o.x, y: o.y, loot });
}
