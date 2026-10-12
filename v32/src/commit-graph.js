// V3.2-CARD: the run's history as a `git log --graph`.
// buildHistory() reads the sim's own path list (no event log needed): every path
// knows its parent, its points (with time) and its commits; a fork ends the
// parent and starts two children, a merge ends both and starts one child, and a
// revert retracts a branch (its death is kept on p.died by a one-line hook in
// sim.revert, see work/v3/V32-EVENTS.md). drawGraph() paints it in the world's
// palette: lanes as brush strokes, commit dots at sunlight, forks, merges,
// deaths, blooms, tags at stage heights and storm bands.
import { PX_PER_M, STAGES, STORMS } from './sim.js';

const TAU = Math.PI * 2;
const mOf = (y) => Math.max(0, -y / PX_PER_M);

/**
 * Pure history of a run (works on a live or finished sim, or on a plain clone of
 * its paths). Returns branches with lanes, events sorted by height, and totals.
 */
export function buildHistory(s) {
  const paths = s.paths || [];
  const byId = new Map(paths.map((p) => [p.id, p]));
  const kids = new Map();
  for (const p of paths) if (p.parent != null) { if (!kids.has(p.parent)) kids.set(p.parent, []); kids.get(p.parent).push(p); }
  const br = [];
  const ev = [];
  const lane = new Map();
  let top = 0;
  for (const p of paths) {
    if (!p.pts || !p.pts.length) continue;
    const m0 = mOf(p.pts[0].y);
    const t0 = p.pts[0].t ?? p.born ?? 0;
    const dead = p.state === 'reverting' || p.state === 'gone';
    let m1 = dead && p.died ? mOf(p.died.y) : mOf(p.pts[p.pts.length - 1].y);
    if (m1 < m0) m1 = m0;
    // lane: a lone tip is lane 0; the second child of a fork takes lane 1
    let L = 0;
    if (p.parent != null) {
      const sib = (kids.get(p.parent) || []).filter((q) => Math.abs((q.born ?? 0) - (p.born ?? 0)) < 1e-6);
      if (sib.length >= 2) L = Math.min(2, Math.max(0, sib.indexOf(p))); // >2 tips: extra lanes to the right
    }
    lane.set(p.id, L);
    const b = { id: p.id, parent: p.parent, m0, m1, t0, lane: L, laneEnd: L, dead: dead && !!p.died, died: p.died || null, merged: p.state === 'merged', live: p.state === 'live' || p.state === 'done', into: null, drift: null, sun: [], blooms: [] };
    for (const c of p.commits || []) {
      const q = p.pts[Math.min(c.i, p.pts.length - 1)];
      if (!q) continue;
      const m = mOf(q.y);
      if (c.kind === 'commit') b.sun.push(m);
      else if (c.kind === 'bloom') b.blooms.push(m);
      else if (c.kind === 'fork') ev.push({ kind: 'fork', m, t: c.born, lane: L, id: p.id });
      else if (c.kind === 'merge') ev.push({ kind: 'merge', m, t: c.born, lane: 0, id: p.id });
    }
    // a dead branch lost its points (and commits) to the retract: spread its sunlight evenly
    if (b.dead && p.died.sun) for (let k = 0; k < p.died.sun; k++) b.sun.push(m0 + (m1 - m0) * (k + 1) / (p.died.sun + 1));
    if (b.dead) ev.push({ kind: 'death', m: m1, t: p.died.t, lane: L, id: p.id, src: p.died.src });
    for (const m of b.sun) ev.push({ kind: 'sun', m, lane: L, id: p.id });
    for (const m of b.blooms) ev.push({ kind: 'bloom', m, lane: L, id: p.id });
    top = Math.max(top, m1);
    br.push(b);
  }
  // merges: a merged branch flows into the child born when it ended
  const bById = new Map(br.map((b) => [b.id, b]));
  for (const b of br) {
    if (!b.merged) continue;
    const p = byId.get(b.id);
    const child = paths.find((q) => q.parent != null && Math.abs((q.born ?? -1) - (p.endT ?? -2)) < 1e-6 && (q.parent === p.id || (byId.get(q.parent) && byId.get(q.parent).parent === p.parent)));
    if (child) b.into = child.id;
  }
  // the survivor of a death in lane 0 drifts over into lane 0 (git redraws the column)
  for (const b of br) {
    if (!b.dead || b.lane !== 0) continue;
    const sib = br.find((q) => q !== b && q.parent === b.parent && q.lane === 1 && q.m0 === b.m0);
    if (sib && !sib.dead) { sib.drift = b.m1; sib.laneEnd = 0; }
  }
  const sun = br.reduce((n, b) => n + b.sun.length, 0);
  const stages = STAGES.filter((st, i) => i > 0 && st.m <= top).map((st) => ({ name: st.name, m: st.m }));
  const storms = ((s.R && s.R.storms) || STORMS).filter((st) => st.m <= top).map((st) => ({ m0: st.m, m1: Math.min(top, st.m + st.len), through: top >= st.m + st.len }));
  ev.sort((a, b) => a.m - b.m || (a.t ?? 0) - (b.t ?? 0));
  const heads = br.filter((b) => !b.dead && !b.merged && !(kids.get(b.id) || []).length);
  return {
    branches: br, events: ev, top, sun, stages, storms,
    forks: ev.filter((e) => e.kind === 'fork').length,
    merges: ev.filter((e) => e.kind === 'merge').length,
    deaths: ev.filter((e) => e.kind === 'death'),
    blooms: ev.filter((e) => e.kind === 'bloom').length,
    heads: heads.map((b) => b.id),
    end: s.end || '', endSrc: s.dead && s.end === 'hit' ? (s.lastHitSrc || '') : '', won: !!s.won,
    time: s.t || 0, maxMult: s.maxMult || 1, goldens: s.goldens || 0,
    _by: bById,
  };
}

// ------------------------------------------------------------------ painting
const hx = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 1) => { const c = hx(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const hash = (n) => { const x = Math.sin(n * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };

/** One painted stroke along pts [[x,y]...]: ink underlay, colour body, dry-brush bristles, light edge. */
function brush(ctx, pts, w, col, ink, seed, light) {
  if (pts.length < 2) return;
  const line = (off, ow) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + off, pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (Math.abs(x1 - x0) > 0.5) { const my = (y0 + y1) / 2; ctx.bezierCurveTo(x0 + off, my, x1 + off, my, x1 + off, y1); }
      else ctx.lineTo(x1 + off, y1);
    }
    ctx.lineWidth = ow; ctx.stroke();
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(ink, 0.92); line(0, w + 5);
  ctx.strokeStyle = col; line(0, w);
  // bristles: thin, slightly offset, lighter and darker passes
  for (let k = 0; k < 4; k++) {
    const h = hash(seed * 13 + k);
    ctx.strokeStyle = k % 2 ? rgba(light, 0.28 + h * 0.2) : rgba(ink, 0.16);
    line((h - 0.5) * w * 0.7, Math.max(1, w * (0.12 + h * 0.1)));
  }
}

function dot(ctx, x, y, r, fill, ink) {
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, TAU); ctx.fill();
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

function cross(ctx, x, y, r, col, ink) {
  ctx.lineCap = 'round';
  for (const [c, w] of [[ink, 7.5], [col, 3.6]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
  }
}

function blossom(ctx, x, y, r, petal, center, ink) {
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass ? petal : ink; ctx.beginPath();
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5, px = x + Math.cos(a) * r * 0.8, py = y + Math.sin(a) * r * 0.8, rr = r * 0.55 + (pass ? 0 : 1.8); ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, TAU); }
    ctx.fill();
  }
  ctx.fillStyle = center; ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU); ctx.fill();
}

/**
 * Paint the history into rect {x,y,w,h}. opts:
 *   mapM(m) -> screen y (share the tree's scale so dots line up with the tree), else linear;
 *   pal { ink, paper, lanes:[c0,c1], light, sun, merge, fork, death, petal, center, text, tag };
 *   labels: draw git decorations to the right of the lanes (tags, reverts, HEAD).
 *   font(weight, px) -> ctx.font string. headLabel: text after "HEAD ->".
 */
export function drawGraph(ctx, H, rect, opts = {}) {
  const pal = opts.pal;
  const top = Math.max(H.top, 1);
  const mapM = opts.mapM || ((m) => rect.y + rect.h - (m / top) * rect.h);
  const gap = opts.laneGap || 44;
  const lx = (L) => rect.x + (opts.laneX || 22) + L * gap;
  const W = opts.stroke || 9;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x - 6, rect.y - 30, rect.w + 12, rect.h + 60); ctx.clip();
  // storm bands behind
  for (const st of H.storms) {
    const y0 = mapM(st.m1), y1 = mapM(st.m0);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, rgba(pal.storm, 0.05)); g.addColorStop(0.5, rgba(pal.storm, 0.2)); g.addColorStop(1, rgba(pal.storm, 0.05));
    ctx.fillStyle = g; ctx.fillRect(rect.x + 4, y0, rect.w - 8, Math.max(6, y1 - y0));
    // slanted rain ticks
    ctx.strokeStyle = rgba(pal.storm, 0.35); ctx.lineWidth = 1.4;
    for (let x = rect.x + 10; x < rect.x + rect.w - 8; x += 14) for (let y = y0 + 4; y < y1 - 2; y += 16) { ctx.beginPath(); ctx.moveTo(x + ((y * 7) % 9), y); ctx.lineTo(x + ((y * 7) % 9) - 4, y + 8); ctx.stroke(); }
  }
  // stage hairlines
  ctx.setLineDash([3, 7]); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(pal.ink, 0.22);
  for (const st of H.stages) { const y = mapM(st.m); ctx.beginPath(); ctx.moveTo(rect.x, y); ctx.lineTo(rect.x + rect.w, y); ctx.stroke(); }
  ctx.setLineDash([]);
  // lanes: every branch is a stroke from its fork to its end, curving in/out of lane 1
  const by = H._by;
  const minDy = 12;
  const order = H.branches.slice().sort((a, b) => b.lane - a.lane); // lane 1 under lane 0
  for (const b of order) {
    const pts = [];
    const parent = b.parent != null ? by.get(b.parent) : null;
    const startX = parent ? lx(parent.laneEnd) : lx(b.lane);
    const y0 = mapM(b.m0), y1 = mapM(b.m1);
    pts.push([startX, y0]);
    if (b.lane > 0) pts.push([lx(b.lane), Math.max(y1, y0 - Math.min(minDy * 2.4, Math.max(4, (y0 - y1) * 0.45)))]);
    if (b.drift != null) { const yd = mapM(b.drift); pts.push([lx(b.lane), yd]); pts.push([lx(0), Math.max(y1, yd - minDy * 2)]); }
    let endX = lx(b.laneEnd);
    if (b.into != null && b.laneEnd > 0) { pts.push([lx(b.laneEnd), Math.min(pts[pts.length - 1][1], y1 + Math.min(minDy * 2.4, Math.max(4, (y0 - y1) * 0.45)))]); endX = lx(0); }
    pts.push([endX, y1]);
    // drop zero-length stubs
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.4);
    if (clean.length < 2) clean.push([endX, y1 - 0.5]);
    const lc = pal.lanes[b.lane % pal.lanes.length];
    const col = b.dead ? lc.replace(/^#.*/, (h) => rgba(h, 0.75)) : lc;
    brush(ctx, clean, b.dead ? W * 0.72 : W, col, pal.ink, b.id + 1, pal.light);
  }
  // dots: sunlight small, blooms, forks, merges, deaths
  const lastSunY = {};
  for (const e of H.events) {
    if (e.kind !== 'sun') continue;
    const b = by.get(e.id); const L = b ? (b.drift != null && e.m > b.drift ? 0 : b.lane) : 0;
    const y = mapM(e.m);
    if (Math.abs((lastSunY[L] ?? 1e9) - y) < 10) continue;
    lastSunY[L] = y;
    dot(ctx, lx(L), y, 3.2, pal.sun, pal.ink);
  }
  let lastBloomY = 1e9;
  for (const e of H.events) {
    const y = mapM(e.m);
    if (e.kind === 'fork') dot(ctx, lx(e.lane), y, 5, pal.paper, pal.ink);
    else if (e.kind === 'merge') { dot(ctx, lx(0), y, 7.5, pal.merge, pal.ink); ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(lx(0), y, 2.4, 0, TAU); ctx.fill(); }
    else if (e.kind === 'bloom') { const b = by.get(e.id); const L = b ? (b.drift != null && e.m > b.drift ? 0 : b.lane) : 0; if (Math.abs(lastBloomY - y) < 22) continue; lastBloomY = y; blossom(ctx, lx(L) - 15, y - 2, 6.5, pal.petal, pal.center, pal.ink); }
  }
  for (const d of H.deaths) cross(ctx, lx(d.lane), mapM(d.m), 7.5, pal.death, pal.ink); // deaths on top of everything
  // root + HEADs: every live tip ends in a ring; a fatal hit crosses the tallest one out
  const y0 = mapM(0);
  dot(ctx, lx(0), y0, 6, pal.paper, pal.ink);
  const heads = H.heads.map((id) => by.get(id)).filter(Boolean).sort((a, b) => b.m1 - a.m1);
  const main = heads[0];
  const headL = main ? main.laneEnd : 0;
  const headY = mapM(main ? main.m1 : H.top);
  for (const b of heads) {
    const x = lx(b.laneEnd), y = mapM(b.m1);
    if (b === main && H.end === 'hit' && !H.won) { cross(ctx, x, y, 9, pal.death, pal.ink); continue; }
    dot(ctx, x, y, b === main ? 9 : 7, pal.merge, pal.ink); ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(x, y, b === main ? 3.2 : 2.4, 0, TAU); ctx.fill();
  }
  void headL;
  // decorations, git style: (HEAD -> name), (tag: Canopy), revert: crow
  if (opts.labels !== false && opts.font) {
    const LX = lx(1) + 26;
    const maxW = rect.x + rect.w - LX;
    const labs = [];
    labs.push({ y: headY, pri: 0, parts: [['(', pal.text], ['HEAD -> ', pal.head], [opts.headLabel || 'main', pal.branch], [')', pal.text]], sub: `${Math.floor(H.top)} m` });
    for (const st of H.stages) labs.push({ y: mapM(st.m), pri: 1, parts: [['(tag: ', pal.text], [opts.stageName ? opts.stageName(st.name) : st.name, pal.tag], [')', pal.text]], sub: `${st.m} m` });
    for (const st of H.storms) labs.push({ y: mapM((st.m0 + st.m1) / 2), pri: 2, parts: [[opts.stormWord || 'storm', pal.text]], sub: st.through ? '✓' : '' });
    for (const d of H.deaths) labs.push({ y: mapM(d.m), pri: 0.5, parts: [['revert', pal.death], [opts.causeShort ? `: ${opts.causeShort(d.src)}` : '', pal.text]] });
    labs.push({ y: y0, pri: 1, parts: [[opts.rootLabel || 'init', pal.text]] });
    labs.sort((a, b) => a.pri - b.pri);
    const placed = [];
    const px = opts.labelPx || 19;
    for (const l of labs) {
      if (placed.some((q) => Math.abs(q.y - l.y) < px * 1.55)) continue;
      if (l.y < rect.y - 8 || l.y > rect.y + rect.h + 14) continue;
      placed.push(l);
      let x = LX;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const [t, c] of l.parts) {
        ctx.font = opts.font(700, px); ctx.fillStyle = c;
        const left = rect.x + rect.w - x; if (left < 12) break;
        ctx.fillText(t, x, l.y, left); x += Math.min(left, ctx.measureText(t).width);
      }
      if (l.sub && x + 40 < rect.x + rect.w) { ctx.font = opts.font(600, px * 0.82); ctx.fillStyle = rgba(pal.ink, 0.55); ctx.fillText(' ' + l.sub, x + 4, l.y + 1, rect.x + rect.w - x - 6); }
    }
    ctx.textBaseline = 'alphabetic';
    void maxW;
  }
  ctx.restore();
}

/** Palette for the graph from a world's four tones + the card's ink/paper (lanes picked for contrast with the paper). */
export function graphPalette(tones, ink, paper, dark) {
  const [t0, t1, t2, t3] = tones;
  const pick = (a, b) => (dark ? a : b);
  const L = (h) => { const [r, g, b] = hx(h); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const sat = (h) => { const c = hx(h); return (Math.max(...c) - Math.min(...c)) / 255; };
  const pl = L(paper);
  const il = L(ink);
  const cands = [t1, t2, t0, t3].filter((t, i, a) => a.indexOf(t) === i && Math.abs(L(t) - pl) > 0.28 && Math.abs(L(t) - il) > 0.1).sort((a, b) => (sat(b) + Math.abs(L(b) - pl)) - (sat(a) + Math.abs(L(a) - pl)));
  const lanes = [cands[0] || ink, cands[1] || (dark ? '#d8cfc0' : '#5a4a3a')];
  return {
    ink, paper, lanes,
    light: pick('#ffffff', '#fff8ea'),
    sun: '#ffd45a', merge: '#f2b33d', fork: '#8fd0e6', death: '#e0503c',
    petal: '#f7a8c4', center: '#ffd45a',
    storm: pick('#9fb4d8', '#5b6b8c'), // slate rain, the same in every world
    text: rgba(ink, 0.78), head: pick('#8fe0d0', '#2f7d6d'), branch: pick('#a6f08a', '#3f8a2c'), tag: pick('#ffd45a', '#a8661a'),
  };
}
