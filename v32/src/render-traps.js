// Forkwood pass 8: trap / pickup / boost visuals live in render-traps-fx.js (~58 KB of
// drawing code). This shim keeps them off the first load: the module is fetched when a
// run starts (ui.hud), when a trap first appears, or after the title has idled 6 s.
// Traps never spawn before 25 m, so the module is always in place before one is visible.
let M = null, asked = false;
export function loadTrapFx() {
  if (asked) return;
  asked = true;
  import('./render-traps-fx.js').then((m) => { M = m; }, () => { asked = false; });
}
// v1.0.1 PERF: fetch + parse when the main thread is idle, not mid-frame
if (typeof window !== 'undefined') setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(loadTrapFx, { timeout: 2000 }) : loadTrapFx()), 6000);
// V2-INT: v2 sprites (traps2 / bosses / rides) load with the run, like render-traps-fx
let MECH = null, mechAsked = false;
function loadMech() { if (mechAsked) return; mechAsked = true; import('./render-mech.js').then((m) => { MECH = m; }, () => { mechAsked = false; }); }
export function drawTraps(R, ctx, s, now, topY, botY, calm, fx, cam, ui) {
  if (MECH) MECH.drawMech(ctx, s, now); else if ((ui && ui.hud) || (s && s.boss) || (s && s.traps && s.traps.some((t) => t.t2))) loadMech(); // V2-INT: painted v2 sprites (render-mech.js)
  if (M) return M.drawTraps(R, ctx, s, now, topY, botY, calm, fx, cam, ui);
  if ((ui && ui.hud) || (s.traps && s.traps.length)) loadTrapFx();
}
/** V2-INT: ART medallion for a growth ring token (false until render-mech.js and the atlas are in). */
export function drawRingIcon(ctx, id, x, y, size) { if (!MECH) { loadMech(); return false; } return MECH.drawRingIcon(ctx, id, x, y, size); }
export function drawTrapFx(R, ctx, s, now, px, ui) { if (M) M.drawTrapFx(R, ctx, s, now, px, ui); }
export function drawTrapFxScreen(R, ctx, cw, ch, ui) { if (M) M.drawTrapFxScreen(R, ctx, cw, ch, ui); }
export function drawTrapFxHud(R, ctx, ui) { if (M) M.drawTrapFxHud(R, ctx, ui); }
/** V2-INT: classic hazards painted in the world's ART (false = not loaded yet, keep the v1 look). */
export function drawBrambleArt(ctx, s, b) { return !!(MECH && MECH.drawBrambleArt(ctx, s, b)); }
export function drawColumnArt(ctx, s, c) { return !!(MECH && MECH.drawColumnArt(ctx, s, c)); }
export function drawWallArt(ctx, s, x0, y1, x1, y0) { return !!(MECH && MECH.drawWallArt(ctx, s, x0, y1, x1, y0)); }
export function classicSprite(s, mech) { return MECH ? MECH.classicSprite(s, mech) : null; }
export function mechApi() { return MECH; }
