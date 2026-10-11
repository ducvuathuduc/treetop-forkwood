// Forkwood 2.0 META: menu micro-interactions. GSAP drives them once it is loaded
// (lazily, after the first frame, so it never counts against the first load); until
// then, or if it fails, the Web Animations API plays the same moves. Only transform
// and opacity animate (compositor-only, 60 fps on phones). Calm mode = no motion.
let gsapMod = null;
const G = () => gsapMod;
let calm = () => false;
let gsapLoading = null;
export function setCalm(fn) { calm = fn; }
/** Load GSAP after boot. V2-INT: the single vendored copy is ENGINE's ES module (core + CSSPlugin). */
export function loadGsap() {
  if (gsapMod) return Promise.resolve(gsapMod);
  if (!gsapLoading) gsapLoading = import('./vendor/gsap.mjs').then((m) => (gsapMod = m.gsap || m.default)).catch(() => null);
  return gsapLoading;
}
const waapi = (el, frames, o) => (el && el.animate ? el.animate(frames, { fill: 'both', ...o }) : null);

/** Button press: squash on down, springy release (Candy Crush style "squeeze"). */
export function press(el) {
  if (!el || calm()) return;
  const g = G();
  if (g) { g.killTweensOf(el, 'scale'); g.timeline().to(el, { scale: 0.93, duration: 0.08, ease: 'power2.out' }).to(el, { scale: 1, duration: 0.42, ease: 'elastic.out(1.1, 0.45)' }); return; }
  waapi(el, [{ transform: 'scale(1)' }, { transform: 'scale(.93)', offset: 0.18 }, { transform: 'scale(1.03)', offset: 0.55 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out', fill: 'none' });
}
/** Pop in (cards, sheets): scale + fade with a soft overshoot. */
export function popIn(el, delay = 0) {
  if (!el) return;
  if (calm()) { el.style.opacity = 1; return; }
  const g = G();
  if (g) { g.fromTo(el, { scale: 0.86, opacity: 0, y: 14 }, { scale: 1, opacity: 1, y: 0, duration: 0.46, delay, ease: 'back.out(1.6)', clearProps: 'transform' }); return; }
  waapi(el, [{ transform: 'translateY(14px) scale(.86)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: delay * 1000, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'backwards' });
}
/** Stagger a list of children in. */
export function stagger(els, step = 0.035) { [...els].slice(0, 18).forEach((el, i) => popIn(el, i * step)); }
/** Room/tab transition: slide from the side of the tab you came from. dir = -1 | 1 | 0 */
export function roomIn(el, dir = 0) {
  if (!el) return;
  if (calm()) return;
  const x = dir * 42, g = G();
  if (g) { g.fromTo(el, { x, opacity: 0 }, { x: 0, opacity: 1, duration: 0.34, ease: 'power3.out', clearProps: 'transform,opacity' }); return; }
  waapi(el, [{ transform: `translateX(${x}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'none' });
}

let layer = null;
function fxLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div'); layer.id = 'mz-fx'; layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}
const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
/** Reward burst: gold flecks + a ring, from an element or a point. ≤ 18 nodes, removed after. */
export function burst(from, opts = {}) {
  if (calm() || !from) return;
  const p = from.getBoundingClientRect ? centre(from) : from, L = fxLayer(), n = opts.n || 14, g = G();
  const ring = document.createElement('i'); ring.className = 'mz-ring'; ring.style.left = p.x + 'px'; ring.style.top = p.y + 'px'; L.appendChild(ring);
  const kill = (el) => el.remove();
  if (g) g.fromTo(ring, { scale: 0.2, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => kill(ring) });
  else { const a = waapi(ring, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }], { duration: 600, easing: 'ease-out' }); if (a) a.onfinish = () => kill(ring); else kill(ring); }
  for (let i = 0; i < n; i++) {
    const f = document.createElement('i'); f.className = 'mz-fleck' + (i % 3 === 0 ? ' leaf' : ''); f.style.left = p.x + 'px'; f.style.top = p.y + 'px'; L.appendChild(f);
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = 46 + Math.random() * 58, dx = Math.cos(a) * d, dy = Math.sin(a) * d - 18, rot = (Math.random() - 0.5) * 540;
    if (g) g.timeline({ onComplete: () => kill(f) }).fromTo(f, { x: 0, y: 0, scale: 0.4, rotation: 0, opacity: 1 }, { x: dx, y: dy, scale: 1, rotation: rot, duration: 0.42, ease: 'power3.out' }).to(f, { y: dy + 26, opacity: 0, duration: 0.36, ease: 'power1.in' });
    else { const an = waapi(f, [{ transform: 'translate(0,0) scale(.4)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px,${dy + 26}px) rotate(${rot}deg)`, opacity: 0 }], { duration: 780, easing: 'ease-out' }); if (an) an.onfinish = () => kill(f); else kill(f); }
  }
}
/**
 * Currency fly-to-bar: n icons arc from `from` to `to`, the counter ticks up as they land.
 * icon = inner HTML of each flyer. onLand(i) fires per arrival; resolves when done.
 */
export function flyTo(from, to, { n = 8, icon = '', onLand } = {}) {
  return new Promise((done) => {
    if (!from || !to) { done(); return; }
    if (calm()) { if (onLand) onLand(n - 1, true); bump(to); done(); return; }
    const a = from.getBoundingClientRect ? centre(from) : from, b = centre(to), L = fxLayer(), g = G();
    n = Math.max(1, Math.min(12, n));
    let landed = 0;
    for (let i = 0; i < n; i++) {
      const f = document.createElement('span'); f.className = 'mz-fly'; f.innerHTML = icon; f.style.left = a.x + 'px'; f.style.top = a.y + 'px'; L.appendChild(f);
      const sx = (Math.random() - 0.5) * 90, sy = (Math.random() - 0.5) * 60 - 20, dx = b.x - a.x, dy = b.y - a.y, delay = i * 0.045;
      const land = () => { f.remove(); landed++; bump(to); if (onLand) onLand(landed - 1, landed === n); if (landed === n) done(); };
      if (g) g.timeline({ delay, onComplete: land }).fromTo(f, { x: 0, y: 0, scale: 0.5, opacity: 0 }, { x: sx, y: sy, scale: 1.15, opacity: 1, duration: 0.26, ease: 'power2.out' }).to(f, { x: dx, y: dy, scale: 0.7, duration: 0.5, ease: 'power2.in' });
      else { const an = waapi(f, [{ transform: 'translate(0,0) scale(.5)', opacity: 0 }, { transform: `translate(${sx}px,${sy}px) scale(1.15)`, opacity: 1, offset: 0.34 }, { transform: `translate(${dx}px,${dy}px) scale(.7)`, opacity: 1 }], { duration: 760, delay: delay * 1000, easing: 'ease-in-out' }); if (an) an.onfinish = land; else land(); }
    }
  });
}
/** Little bounce on a counter when something lands in it. */
export function bump(el) {
  if (!el || calm()) return;
  const g = G();
  if (g) { g.killTweensOf(el, 'scale'); g.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }); return; }
  waapi(el, [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out', fill: 'none' });
}
/** Count a number element up from a to b over ~0.7 s. */
export function countUp(el, a, b, fmt = (v) => Math.round(v).toLocaleString('en-US')) {
  if (!el) return;
  if (calm() || a === b) { el.textContent = fmt(b); return; }
  const t0 = performance.now(), T = 700;
  const tick = (now) => { const k = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(a + (b - a) * e); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
/** Slow "living painting" drift for the hero frame (Ken Burns, transform only). */
export function drift(img) {
  if (!img || calm()) return null;
  const g = G();
  if (g) return g.fromTo(img, { scale: 1.02, xPercent: -0.8 }, { scale: 1.08, xPercent: 0.8, duration: 18, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  return waapi(img, [{ transform: 'scale(1.02) translateX(-.8%)' }, { transform: 'scale(1.08) translateX(.8%)' }], { duration: 18000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', fill: 'none' });
}
export const motion = { press, popIn, stagger, roomIn, burst, flyTo, bump, countUp, drift, loadGsap, setCalm };
export default motion;
