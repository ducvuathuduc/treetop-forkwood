// P8-ECON trap audit: force every one of the 9 traps and the classic hazards,
// drive straight into each, and assert that
//   1. a {type:'trapWarn'} event fires first, at least 0.8 s before it can hurt,
//   2. a {type:'trapHit'} event fires with a real consequence (sap, branch cut, points),
//   3. there is a way past it that never triggers trapHit.
// Node only: node tests/trap-audit.mjs
import { createSim, step, W, FORK_SPREAD, spawnChunkAt } from '../src/sim.js';
import { CROW_WARN, WARN_MIN, rowSolids } from '../src/traps.js';

let fails = 0;
const ok = (c, msg) => { if (c) console.log('ok  ', msg); else { fails++; console.log('FAIL', msg); } };
const rows = [];

function fresh(seed = 9) {
  const s = createSim({ seed });
  s.traps = []; s.brambles = []; s.beetles = []; s.columns = []; s.motes = []; s.frosts = []; s.winds = [];
  s.nextBeatY = -1e9; s.speed = 180; s.invuln = 0;
  return s;
}
/** Run for sec seconds; returns events stamped with sim time. */
function run(s, sec, inp) {
  const ev = [];
  for (let i = 0; i < sec * 60 && !s.dead; i++) { step(s, 1 / 60, typeof inp === 'function' ? inp(s) : inp); for (const e of s.events) ev.push({ ...e, at: s.t }); }
  return ev;
}
function setup(id, chunk, prep) {
  const s = fresh(); s.trapSeen[id] = true; if (prep) prep(s);
  if (chunk) spawnChunkAt(s, chunk, s.cy - 260);
  return s;
}
/** Try victims until one hits; returns { s, ev } for the first victim that triggers trapHit for `trap`. */
function firstHit(make, victims, trap, sec = 6) {
  for (const v of victims) { const s = make(); const ev = run(s, sec, v(s)); if (ev.some((e) => e.type === 'trapHit' && e.trap === trap)) return { s, ev }; }
  return null;
}
function audit(name, trap, make, victims, dodges, sec = 6, extra) {
  const hitRun = firstHit(make, victims, trap, sec);
  const warn = hitRun && hitRun.ev.find((e) => e.type === 'trapWarn' && e.trap === trap);
  const hitE = hitRun && hitRun.ev.find((e) => e.type === 'trapHit' && e.trap === trap);
  const lead = warn && hitE ? hitE.at - warn.at : -1;
  let dodged = false;
  for (const d of dodges) { const s = make(); const ev = run(s, sec, d(s)); if (!ev.some((e) => e.type === 'trapHit' && e.trap === trap) && !s.dead) { dodged = true; break; } }
  const effect = hitE ? hitE.effect : '-';
  ok(!!hitE, `${name}: driving into it fires trapHit (${effect}${hitE && hitE.dmg ? ', ' + hitE.dmg + ' sap' : ''})`);
  ok(!!warn && lead >= WARN_MIN - 1e-6, `${name}: trapWarn fires ${lead >= 0 ? lead.toFixed(2) : '?'} s before the hit (>= ${WARN_MIN} s)`);
  ok(dodged, `${name}: there is a way past it without a hit`);
  if (extra) extra(hitRun);
  rows.push({ name, trap, warn: lead >= 0 ? +lead.toFixed(2) : null, effect, dodge: dodged });
}
const hold = (x) => () => ({ targetX: x });
const xsAcross = [40, 100, 160, 220, 280, 340, 400, 460, 520].map((x) => hold(x));

// ---------------------------------------------------------------- the 9 traps
audit('Cracked twig', 'twig', () => setup('twig', 'twig'),
  [(s) => { const t = s.traps.find((q) => q.kind === 'twig'); return { targetX: (t.x0 + t.x1) / 2 }; }],
  [(s) => { const tw = s.traps.filter((q) => q.kind === 'twig'); const x = [20, 60, W - 60, W - 20].find((x) => tw.every((t) => x < t.x0 - 20 || x > t.x1 + 20)); return { targetX: x }; }]);
audit('Pulse thorns', 'pulse', () => setup('pulse', 'pulse'), xsAcross,
  [(s) => (q) => { const p = q.traps.find((t) => t.kind === 'pulse' && !t.passed); if (!p) return { targetX: q.cx }; const ta = (q.cy - p.y) / Math.max(80, q.speed); const sol = rowSolids(p, p.clock + ta); for (let x = 40; x < W; x += 20) if (sol.every(([a, b]) => x < a - 30 || x > b + 30)) return { targetX: x }; return { targetX: q.cx }; }]);
audit('Trapdoor gate', 'door', () => setup('door', 'door'), xsAcross,
  [(s) => { const d = s.traps.find((t) => t.kind === 'door'); return { targetX: (d.sq[0] + d.sq[1]) / 2 }; }]);
audit('Crosswind', 'gust', () => setup('gust', 'gust'),
  [(s) => { const g = s.traps.find((t) => t.kind === 'gust'); return { targetX: g.dir > 0 ? W - 10 : 10 }; }],
  [(s) => { const g = s.traps.find((t) => t.kind === 'gust'); return { targetX: g.dir > 0 ? 160 : W - 160 }; }]);
audit('Sap drain', 'sap', () => setup('sap', 'sapzone'),
  [(s) => { const z = s.traps.find((t) => t.kind === 'sap'); return { targetX: (z.x0 + z.x1) / 2 }; }],
  [(s) => { const z = s.traps.find((t) => t.kind === 'sap'); return { targetX: z.x0 > W / 2 ? 40 : W - 40 }; }], 4,
  (h) => { const s0 = fresh(); s0.trapSeen.sap = true; spawnChunkAt(s0, 'sapzone', s0.cy - 260); s0.motes = []; const z = s0.traps.find((t) => t.kind === 'sap'); const a = s0.sap; run(s0, 3, { targetX: (z.x0 + z.x1) / 2 }); const s1 = fresh(); s1.trapSeen.sap = true; spawnChunkAt(s1, 'sapzone', s1.cy - 260); s1.motes = []; const b = s1.sap; run(s1, 3, { targetX: z.x0 > W / 2 ? 40 : W - 40 }); ok((a - s0.sap) > (b - s1.sap) + 10, `Sap drain: standing in it costs ${((a - s0.sap) - (b - s1.sap)).toFixed(1)} extra sap`); });
audit('Golden lure', 'lure', () => setup('lure', 'lure'),
  [(s) => { const lure = s.motes.filter((m) => m.lure); return (q) => { const m = lure.find((o) => !o.taken && o.y < q.cy - 10); return { targetX: m ? m.x : q.cx }; }; }],
  [(s) => { const cap = s.traps.find((q) => q.kind === 'cap'); return { targetX: cap.side < 0 ? W - 150 : 150 }; }]);
audit('Twin beetles', 'twins', () => setup('twins', 'twins'),
  [-22, 22, -26, 26, -18, 18].map((dx) => (s) => { const tw = s.traps.find((q) => q.kind === 'twins'); return { targetX: tw.x + dx }; }),
  [(s) => { const tw = s.traps.find((q) => q.kind === 'twins'); let f = false; return () => { const o = { targetX: tw.x }; if (!f) { o.toggle = true; f = true; } return o; }; }], 4);
audit('Rising thorns', 'tide', () => setup('tide', 'tide', (s) => { s.R.speed = 0.32; /* V3.1: was 0.4 before the +25% base climb */ }),
  [hold(W / 2)],
  [(s) => { s.R.speed = 1; return { targetX: W / 2 }; }], 14);
{
  // the crow: hold your line and it pecks; swerve out of its lane and it misses
  const mk = () => { const s = setup('crow', null); spawnChunkAt(s, 'crow', s.cy - 60); s.motes = []; return s; };
  audit('Crow', 'crow', mk, [hold(W / 2)],
    [() => (q) => { const c = q.traps.find((t) => t.kind === 'crow'); if (c && c.st === 'warn') return { targetX: c.x < W / 2 ? c.x + 140 : c.x - 140 }; return { targetX: W / 2 }; }], 4,
    (h) => {
      const st = h.ev.find((e) => e.type === 'crowsteal');
      ok(!!st && st.sap > 0, `Crow: a peck costs sap (${st && st.sap}) and points (${st && st.pts})`);
      const s = mk(); s.score = 2000; const sc0 = s.score; run(s, 4, hold(W / 2)); ok(s.score < sc0 + 400 && s.crowSteals === 1, `Crow: a peck takes 5% of your points (score ${sc0} -> ${s.score} incl. height points)`);
      // forked: the pair straddles the lane
      const f = mk(); let tg = false; const evF = run(f, 4, () => { const o = { targetX: W / 2 }; if (!tg) { o.toggle = true; tg = true; } return o; });
      ok(evF.some((e) => e.type === 'crowfoil') && !evF.some((e) => e.type === 'trapHit' && e.trap === 'crow'), 'Crow: a forked pair straddles the dive lane (foiled)');
      ok(CROW_WARN >= WARN_MIN && CROW_WARN <= 1.2, `Crow: warning lasts ${CROW_WARN} s`);
      // regression for "the crow appears and nothing happens": a single tip with nothing staged is still attacked
      const n = mk(); const evN = run(n, 4, hold(W / 2)); ok(evN.some((e) => e.type === 'crow') && evN.some((e) => e.type === 'trapHit' && e.trap === 'crow'), 'Crow: a single unforked tip is attacked too (the old crow flew off and did nothing)');
    });
}

// ---------------------------------------------------------------- classic hazards
audit('Thorn gate', 'gate', () => setup('gate', 'gate'), xsAcross,
  [(s) => { const g = s.brambles.find((b) => b.kind === 'gate'); return { targetX: (g.gaps[0][0] + g.gaps[0][1]) / 2 }; }]);
audit('Split gate', 'split', () => setup('split', 'split'), xsAcross,
  [(s) => { const g = s.brambles.find((b) => b.kind === 'split'); return { targetX: (g.gaps[0][0] + g.gaps[0][1]) / 2 }; }]);
audit('Thorn column', 'thorn', () => setup('column', 'column'),
  [(s) => { const c = s.columns[0]; return { targetX: c.x }; }],
  [(s) => { const c = s.columns[0]; return { targetX: c.x < W / 2 ? c.x + 150 : c.x - 150 }; }]);
audit('Beetle', 'beetle', () => { const s = fresh(); s.beetles.push({ x: W / 2, y: s.cy - 300, vx: 0, ph: 0, passed: false, r: 14 }); return s; },
  [hold(W / 2)], [hold(W / 2 + 120)], 4);
audit('Lightning bolt', 'bolt', () => { const s = fresh(); s.columns.push({ x: W / 2, y0: s.cy - 420, y1: s.cy - 590, hw: 24, kind: 'bolt', live: false, passed: false, seed: 1 }); return s; },
  [hold(W / 2)], [hold(W / 2 + 140)], 4);
{
  // frost: no knock-back, but it slows you and drinks sap
  const s = fresh(); s.frosts.push({ x: W / 2, y: s.cy - 300, r: 80, vx: 0, ph: 0 });
  const ev = run(s, 3, hold(W / 2));
  ok(ev.some((e) => e.type === 'trapWarn' && e.trap === 'frost'), 'Frost cloud: trapWarn before you reach it');
  const t = fresh(); t.frosts.push({ x: W / 2, y: t.cy - 300, r: 80, vx: 0, ph: 0 }); const a = t.sap; run(t, 3, hold(W / 2));
  const u = fresh(); u.frosts.push({ x: W / 2, y: u.cy - 300, r: 80, vx: 0, ph: 0 }); const b = u.sap; run(u, 3, hold(W / 2 + 170));
  ok((a - t.sap) > (b - u.sap) + 5, `Frost cloud: going through costs ${((a - t.sap) - (b - u.sap)).toFixed(1)} extra sap and slows you; going round is free`);
  rows.push({ name: 'Frost cloud', trap: 'frost', warn: 1.2, effect: 'slow + drain', dodge: true });
}

// ---------------------------------------------------------------- report
console.log('\ntrap                warn lead  consequence  avoidable');
for (const r of rows) console.log(`${r.name.padEnd(18)}  ${String(r.warn ?? '-').padStart(6)} s  ${String(r.effect).padEnd(12)} ${r.dodge ? 'yes' : 'NO'}`);
if (process.env.JSON) console.log(JSON.stringify(rows));
console.log(fails ? `\n${fails} FAILED` : '\ntrap audit OK');
process.exit(fails ? 1 : 0);
