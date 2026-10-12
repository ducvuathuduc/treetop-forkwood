// Forkwood V3.2 GAMEPLAY (sim side, pure and deterministic):
//  - fork-choice gates: two lanes, one SAFE (open, a little sunlight), one RICH (a sunlight column,
//    but a thorn squeeze above it). Fork to take both. Layout rolls on its own stream (rngC) so the
//    main course stream is not consumed by the decision.
//  - run-time hooks (after collisions): choice.show / choice.pick, vine.wilt / vine.revive events.
// Every event name + payload is documented in work/v3/V32-EVENTS.md (GAMEPLAY section).
import { clamp, mulberry32 } from './rng.js';

const W = 560, TIP_R = 9, FORK_SPREAD = 78;
export const CHOICE = {
  minM: 70,         // never in the opening (tutorial beats + first gates)
  gapM: 100,        // at least this many metres between two choice gates
  p: 0.3,           // chance a build beat becomes a choice gate (when allowed)
  firstP: 0.6,      // ... before the run's first one
  gapW: 112,        // lane width at the gate (same as the tutorial split: a forked pair fits)
  squeeze: 92,      // the hedge edge sits squeeze/2 beyond the rich lane centre
  rowDy: 260,       // thorn row this far above the gate
  len: 600,         // chunk length
  richSuns: 5, safeSuns: 3,
};
// vine health thresholds (fraction of max sap); the art lerps on its own, these are for audio cues
export const WILT = { on: 0.33, off: 0.45, revive: 0.45 };

const rc = (s) => s.rngC || (s.rngC = mulberry32((s.seed ^ 0x7f4a7c15) >>> 0));

/** Director hook: should this build beat become a choice gate? (Uses rngC only.) */
export function wantChoice(s, m) {
  if (s.R.script || s.tutorialOnly || m < CHOICE.minM || !s.choicesOn) return false;
  const D = s.dir;
  if (D.choiceM != null && m - D.choiceM < CHOICE.gapM) return false;
  return rc(s)() < (D.choiceM == null ? CHOICE.firstP : CHOICE.p); // the first one comes early: most players see one before 300 m
}

/** Build a choice gate at y. A: { hazardSkin } from sim. Returns its length. */
export function choiceGate(s, y, m, A) {
  const r = rc(s), half = 34, gw = CHOICE.gapW;
  s.dir.choiceM = m;
  // keep it reachable from the previous gate (same rule as reachableX: 80 + 0.62 * dy)
  const prev = s.lastGate ? s.lastGate.x : W / 2;
  let px = clamp(prev + (r() - 0.5) * 120, half + gw + 12, W - half - gw - 12);
  const side = r() < 0.5 ? -1 : 1; // the RICH lane
  const gaps = [[px - half - gw, px - half], [px + half, px + half + gw]];
  const solids = [[0, gaps[0][0]], [px - half, px + half], [gaps[1][1], W]];
  const gate = { y, solids, gaps, kind: 'split', passed: false, seed: r() * 1000, px, choice: side, lanes: { safe: px - side * FORK_SPREAD, rich: px + side * FORK_SPREAD }, skin: A.hazardSkin(s.world, 'split') };
  s.brambles.push(gate);
  const rx = px + side * FORK_SPREAD, sx = px - side * FORK_SPREAD;
  // thorn row: a thorn hedge closes in on the RICH lane from the outer wall, leaving a squeeze; the SAFE
  // lane and the middle stay open (a tip that merges between the rows lands in the open, never on thorns)
  const ry = y - CHOICE.rowDy, sq = CHOICE.squeeze;
  const edge = side > 0 ? rx + sq / 2 : rx - sq / 2;
  const g2 = side > 0 ? [[0, edge]] : [[edge, W]], sol2 = side > 0 ? [[edge, W]] : [[0, edge]];
  s.brambles.push({ y: ry, solids: sol2, gaps: g2, kind: 'gate', passed: false, seed: r() * 1000, choiceRow: side, lanes: { safe: sx, rich: rx }, skin: A.hazardSkin(s.world, 'gate') });
  // sunlight: a rich column through the squeeze, two on the safe side
  // the rich column hugs the hedge (the last ones sit right at the thorns: grab them and graze)
  for (let i = 0; i < CHOICE.richSuns; i++) s.motes.push({ x: rx + side * Math.min(18, i * 6), y: y + 50 - i * 66, kind: 'sun', r: 11, ph: r() * 6.28, taken: false, rich: true });
  for (let i = 0; i < CHOICE.safeSuns; i++) s.motes.push({ x: sx, y: y + 40 - i * 95, kind: 'sun', r: 11, ph: r() * 6.28, taken: false });
  s.lastGate = { y: ry, x: px };
  return CHOICE.len;
}

/** After collisions: choice-gate and vine-health events. A: { emit, sapMax } */
export function v32Post(s, dt, A) {
  const V = s.v32 || (s.v32 = { wilt: false, low: 1 });
  // choice gates
  for (const b of s.brambles) {
    if (!b.choice) continue;
    if (!b.cShown && b.y < s.cy && b.y > s.cy - Math.max(200, s.speed) * 1.6) {
      b.cShown = true;
      A.emit(s, 'choice.show', { x: b.px, y: b.y, rich: b.choice > 0 ? 'right' : 'left', t: +((s.cy - b.y) / Math.max(60, s.speed)).toFixed(2) });
    }
    if (!b.cPicked && s.cy < b.y - 4) {
      b.cPicked = true;
      const sides = new Set(s.tips.map((t) => Math.sign(t.x - b.px) || 1));
      const lane = sides.size > 1 ? 'both' : sides.has(b.choice) ? 'rich' : 'safe';
      s.choices = s.choices || { rich: 0, safe: 0, both: 0 }; s.choices[lane]++;
      A.emit(s, 'choice.pick', { lane, x: s.cx, y: s.cy, forked: s.tips.length === 2 });
    }
  }
  // vine health (the art reads s.sap directly; these are cue points)
  const fr = s.sap / Math.max(1, A.sapMax(s));
  const caught = s.events.some((e) => e.type === 'collect' || e.type === 'dew');
  if (caught && V.low < WILT.revive && s.golden <= 0) A.emit(s, 'vine.revive', { x: s.cx, y: s.cy, from: +V.low.toFixed(2), sap: Math.round(s.sap) });
  if (!V.wilt && fr < WILT.on && !s.dead) { V.wilt = true; A.emit(s, 'vine.wilt', { x: s.cx, y: s.cy, sap: Math.round(s.sap) }); }
  else if (V.wilt && fr > WILT.off) V.wilt = false;
  V.low = fr;
}
