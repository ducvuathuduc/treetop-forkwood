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
export function drawTraps(R, ctx, s, now, topY, botY, calm, fx, cam, ui) {
  if (M) return M.drawTraps(R, ctx, s, now, topY, botY, calm, fx, cam, ui);
  if ((ui && ui.hud) || (s.traps && s.traps.length)) loadTrapFx();
}
export function drawTrapFx(R, ctx, s, now, px, ui) { if (M) M.drawTrapFx(R, ctx, s, now, px, ui); }
export function drawTrapFxScreen(R, ctx, cw, ch, ui) { if (M) M.drawTrapFxScreen(R, ctx, cw, ch, ui); }
export function drawTrapFxHud(R, ctx, ui) { if (M) M.drawTrapFxHud(R, ctx, ui); }
