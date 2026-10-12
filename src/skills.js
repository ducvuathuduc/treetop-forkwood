// Forkwood 2.0 MECH: critter skills on the charm button (MECHANICS.md §2.4).
// The profile critter carries one active skill with a cooldown, fired from the
// existing charm button (E / Shift / badge). Choosing a skill replaces the charm
// for that run. Every scoring merge cuts the remaining cooldown by 1.0 s.
// Off in pure modes (daily, weekly, quest, challenge, duel, race, tutorial).
// Values interpolate linearly from level 1 to level 6.
import { clamp } from './rng.js';
import { breakTrapAhead } from './traps2.js';

export const MERGE_CUT = 1.0;
export const SKILL_MAX_LV = 6;
// lv1 -> lv6 pairs
export const SKILLS = {
  sparrow:  { name: 'Updraft Dash', critter: 'Sparrow', cd: [12, 8], dur: [0.5, 0.8], dash: [90, 120], blurb: 'Dash up and through: a moment of untouchable speed.' },
  squirrel: { name: 'Stash', critter: 'Squirrel', cd: [18, 12], acorns: [4, 10], blurb: 'Bank your staged sunlight as if you merged, plus acorns.' },
  owl:      { name: 'Night Sight', critter: 'Owl', cd: [20, 14], dur: [4, 5.5], slow: [0.6, 0.5], warn: [0.6, 0.8], blurb: 'The world slows and every warning comes earlier.' },
  fox:      { name: 'Trickster Feint', critter: 'Fox', cd: [16, 11], dur: [3, 4.5], blurb: 'A foxfire decoy draws crows, bats, swarms and falling cones.' },
  snail:    { name: 'Shell Up', critter: 'Snail', cd: [22, 16], dur: [2.5, 3.5], sap: [15, 25], blurb: 'Untouchable but slow for a moment, then a sip of sap.' },
  moth:     { name: 'Lantern Call', critter: 'Moth', cd: [14, 10], reach: [220, 320], bonus: [0.5, 0.8], dur: [3, 4], blurb: 'Pull nearby sunlight to you; it is worth more for a while.' },
  frog:     { name: 'Tongue Snap', critter: 'Frog', cd: [10, 7], reach: [260, 380], items: [1, 2], blurb: 'Grab the nearest pickup, ride knot, letter or gem (or eat a beetle).' },
  beetle:   { name: 'Horn Charge', critter: 'Beetle', cd: [18, 13], dur: [1.5, 2.5], objs: [1, 2], blurb: 'The next hazard you touch is smashed instead.' },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const skillSkin = (id) => `skill.${id}.fx`;
/** Value of a level-interpolated stat. */
export const sv = (pair, lv) => pair[0] + (pair[1] - pair[0]) * (clamp(lv, 1, SKILL_MAX_LV) - 1) / (SKILL_MAX_LV - 1);

export function makeSkill(opt) {
  if (!opt || !SKILLS[opt.id]) return null;
  const lv = clamp(opt.lv | 0 || 1, 1, SKILL_MAX_LV);
  const cdMax = sv(SKILLS[opt.id].cd, lv);
  return { id: opt.id, lv, cd: cdMax * 0.5, cdMax, uses: 0 }; // starts half charged
}
export const skillReady = (s) => !!s.skill && !s.dead && s.skill.cd <= 0;
export function skillTick(s, dt) { if (s.skill && s.skill.cd > 0) s.skill.cd = Math.max(0, s.skill.cd - dt); }
export function skillMergeCut(s) { if (s.skill && s.skill.cd > 0) s.skill.cd = Math.max(0, s.skill.cd - MERGE_CUT); }

/** Fire the skill. A: sim api. Returns true when it fired. */
export function fireSkill(s, A) {
  if (!skillReady(s)) return false;
  const k = s.skill, S = SKILLS[k.id], lv = k.lv;
  k.cd = k.cdMax; k.uses++;
  const ev = { id: k.id, lv, x: s.cx, y: s.cy, skin: skillSkin(k.id) };
  switch (k.id) {
    case 'sparrow': {
      const d = sv(S.dur, lv); s.invuln = Math.max(s.invuln, d); s.dashT = d; s.dashV = sv(S.dash, lv) / d;
      if (lv >= 4) { const b = A.breakAhead(s, 140); ev.broke = b; }
      break;
    }
    case 'squirrel': {
      const staged = s.tips.reduce((a, t) => a + t.staged, 0);
      if (staged > 0) { const b = A.addScore(s, 50 + 20 * staged * s.mult); for (const t of s.tips) t.staged = 0; A.bumpMult(s); s.merges++; ev.banked = staged; ev.bonus = b; }
      const n = Math.round(sv(S.acorns, lv)); A.acorns(s, n, s.cx, s.cy); ev.acorns = n;
      break;
    }
    case 'owl': s.owlT = sv(S.dur, lv); s.owlK = sv(S.slow, lv); s.owlWarn = sv(S.warn, lv); break;
    case 'fox': s.decoy = sv(S.dur, lv); s.decoyX = s.cx < 280 ? s.cx + 150 : s.cx - 150; ev.decoyX = s.decoyX; break;
    case 'snail': s.shellT = sv(S.dur, lv); s.shellSap = sv(S.sap, lv); s.invuln = Math.max(s.invuln, s.shellT); break;
    case 'moth': s.mothT = sv(S.dur, lv); s.mothK = 1 + sv(S.bonus, lv); ev.pulled = A.pull(s, sv(S.reach, lv)); break;
    case 'frog': ev.grabbed = A.tongue(s, sv(S.reach, lv), Math.round(sv(S.items, lv))); break;
    case 'beetle': s.hornT = sv(S.dur, lv); s.hornN = Math.round(sv(S.objs, lv)); break;
  }
  A.emit(s, 'skill.fire', ev);
  return true;
}

/** Per-step timers of skill effects (dt real seconds). */
export function skillEffects(s, dt, A) {
  if (s.owlT > 0) { s.owlT -= dt; if (s.owlT <= 0) { s.owlT = 0; A.emit(s, 'skill.end', { id: 'owl' }); } }
  if (s.decoy > 0) { s.decoy -= dt; s.decoyX += Math.sin(s.t * 3) * 40 * dt; if (s.decoy <= 0) A.emit(s, 'skill.end', { id: 'fox' }); }
  if (s.shellT > 0) { s.shellT -= dt; if (s.shellT <= 0) { s.sap = Math.min(A.sapMax(s), s.sap + (s.shellSap || 0)); A.emit(s, 'skill.end', { id: 'snail', sap: s.shellSap }); } }
  if (s.mothT > 0) { s.mothT -= dt; if (s.mothT <= 0) A.emit(s, 'skill.end', { id: 'moth' }); }
  if (s.hornT > 0) { s.hornT -= dt; if (s.hornT <= 0) { s.hornN = 0; A.emit(s, 'skill.end', { id: 'beetle' }); } }
  if (s.dashT > 0) s.dashT -= dt;
}

/** Bot policy: fire when the trigger condition holds (MECHANICS.md §5). */
export function skillBot(s, sk, r) {
  if (!skillReady(s) || r() > 0.2 + sk * 0.8) return false;
  const y = s.cy;
  const danger = (d) => s.brambles.some((b) => b.y < y && b.y > y - d) || s.beetles.some((b) => b.y < y && b.y > y - d) || s.columns.some((c) => c.live && c.y0 < y && c.y0 > y - d) || s.traps.some((t) => (t.y ?? t.y0) < y && (t.y ?? t.y0) > y - d && t.kind !== 'label');
  switch (s.skill.id) {
    case 'sparrow': case 'beetle': case 'snail': return danger(160) && s.invuln <= 0;
    case 'owl': return danger(260);
    case 'fox': return s.traps.some((t) => (t.kind === 'crow' && t.st === 'warn') || (t.kind === 'cone' && t.st === 'track') || t.kind === 'bats' && t.on);
    case 'squirrel': return s.tips.reduce((a, t) => a + t.staged, 0) >= 3;
    case 'moth': return s.motes.filter((o) => o.kind === 'sun' && Math.abs(o.y - y) < 260).length >= 4;
    case 'frog': return s.motes.some((o) => (o.pickup || o.kind === 'ride' || o.letter || o.gem) && Math.abs(o.y - y) < 300);
  }
  return false;
}
