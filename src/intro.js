// P8-STORY: first-launch story as a short manga. Seven beats on four pages:
// panels slam in along diagonals, the page shakes on impact, focus / speed
// lines boil, ink splashes wipe between pages, and the last page is a splash
// with the sprout breaking out of the panel border, then the title and Grow.
// Tap to advance, auto-advance otherwise (under 30 s), Skip always visible.
// Art: assets/story/*.webp (made for Forkwood with an image model, ~250 KB),
// loaded only when the story plays. Reduced motion / calm mode: plain fades,
// no shake, no flash, no boiling lines, no typewriter.

// Panel shapes are in page fractions (x right, y down) for a portrait page.
// cap: where the caption sits (l/r/t/b in page fractions, w width), kind
// narr = boxed narration, say = speech bubble, title = under the logo.
export const BEATS = [
  { img: 'tree', page: 0, text: 'In Forkwood, the Great Tree kept the sun-seeds warm.',
    poly: [[0, 0], [1, 0], [1, 0.34], [0, 0.42]], pos: '50% 18%', from: [-0.5, -0.35, -4],
    cap: { l: 0.035, t: 0.03, w: 0.6 }, fx: 'rays' },
  { img: 'crow', page: 0, text: 'Then the storm came. And a crow stole the light.',
    poly: [[0, 0.445], [1, 0.365], [1, 0.64], [0, 0.705]], pos: '62% 45%', from: [0.9, -0.25, 6],
    cap: { r: 0.035, t: 0.585, w: 0.62 }, fx: 'speed', impact: 1, sfx: { t: 'FWOOSH', l: 0.04, t0: 0.43, rot: -10 }, snd: 'storm' },
  { img: 'dark', page: 0, text: 'The Great Tree went dark. One sprout was left.',
    poly: [[0, 0.73], [1, 0.665], [1, 1], [0, 1]], pos: '38% 70%', from: [0, 0.4, 0],
    cap: { r: 0.035, b: 0.03, w: 0.52 }, fx: 'rain', sfx: { t: 'shhh…', r: 0.05, t0: 0.69, rot: -6, small: 1 }, snd: 'soft' },
  { img: 'eyes', page: 1, text: 'One small light opened its eyes.',
    poly: [[0, 0.135], [1, 0.08], [1, 0.25], [0, 0.305]], pos: '50% 45%', from: [-1.1, 0.05, -3],
    cap: { l: 0, t: 0, w: 0.6 }, fx: 'focus', impact: 2, sfx: { t: 'BA-DUM', r: 0.05, t0: 0.27, rot: -8 }, snd: 'heart' },
  { img: 'resolve', page: 1, text: '\u201CI\u2019ll bring it back.\u201D',
    poly: [[0, 0.33], [1, 0.275], [1, 1], [0, 1]], pos: '50% 55%', from: [0, 0.6, 0],
    cap: { r: 0.05, t: 0.38, w: 0.46, kind: 'say' }, fx: 'glint', snd: 'resolve' },
  { img: 'reach', page: 2, text: 'Fork. Merge. Grow higher than the storm.',
    poly: [[0.03, 0.012], [1, 0], [0.97, 0.988], [0, 1]], pos: '50% 50%', from: [0, 1, 0],
    cap: { l: 0.06, b: 0.045, w: 0.64 }, fx: 'up', impact: 1, sfx: { t: 'ZOOM', l: 0.6, t0: 0.12, rot: -72 }, snd: 'zoom' },
  { img: 'sky', page: 3, text: 'Climb to the treetop. Bring back the dawn.',
    poly: [[0, 0.07], [1, 0.02], [1, 0.97], [0, 1]], pos: '50% 62%', from: [0, -0.2, 0],
    cap: { c: 1, t: 0.245, w: 0.8, kind: 'title' }, fx: 'sun', splash: 1, snd: 'dawn' },
];
export const BEAT_MS = 4200;
// ?introhold=1 turns off auto-advance (for screenshots on slow machines)
const HOLD = typeof location !== 'undefined' && /[?&]introhold=1/.test(location.search);
const PAGES = 4;
const HERO = 'hero';
const BASE = 'assets/story/';

const css = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');

/**
 * Show the story. opts: { calm, sound, onDone(reason) } where reason is
 * 'end' | 'skip'. Returns a controller { next, skip, get index }.
 */
// v1.0: the story's styles (story.css) load with this module, not at boot
let cssReady = null;
export function loadStoryCss() {
  if (cssReady) return cssReady;
  cssReady = new Promise((res) => {
    if (document.querySelector('link[data-story-css]')) return res();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'story.css'; l.dataset.storyCss = '1';
    l.onload = () => res(); l.onerror = () => res();
    document.head.appendChild(l);
  });
  return cssReady;
}
if (typeof document !== 'undefined') loadStoryCss();
/** Play the story once its styles are in (resolves to the same controller playIntroNow returns). */
export function playIntro(opts = {}) { return loadStoryCss().then(() => playIntroNow(opts)); }

export function playIntroNow({ calm = false, sound = null, onDone = () => {}, beats = BEATS, base = BASE, maxAspect = 0.74, ep = null } = {}) {
  const HEROSRC = BASE + HERO + '.webp';
  const root = document.createElement('section');
  root.id = 'intro';
  root.className = 'intro mg' + (calm ? ' calm' : '');
  root.setAttribute('aria-label', 'Story');
  root.innerHTML = `
    <canvas class="mg-bg" aria-hidden="true"></canvas>
    <div class="mg-shake">
      <div class="mg-page">
        ${beats.map((b, i) => `<figure class="plate" data-i="${i}" data-page="${b.page}"><img src="${base}${b.img}.webp" alt="" decoding="async" style="object-position:${b.pos}" />${b.fx ? '<canvas class="mg-fx" aria-hidden="true"></canvas>' : ''}<i class="mg-tone" aria-hidden="true"></i><svg class="mg-border" aria-hidden="true"><polygon class="w"/><polygon class="k"/></svg></figure>`).join('')}
        ${beats.map((b, i) => (b.sfx ? `<b class="mg-sfx${b.sfx.small ? ' small' : ''}" data-i="${i}" aria-hidden="true">${b.sfx.t}</b>` : '')).join('')}
        <img class="mg-hero" src="${HEROSRC}" alt="" decoding="async" aria-hidden="true" />
        <div class="mg-title" aria-hidden="true"><span class="mg-logo">Forkwood</span></div>
        <p class="intro-text" aria-live="polite"></p>
        <button class="mg-grow btn primary" type="button">Grow</button>
      </div>
    </div>
    <div class="mg-flash" aria-hidden="true"></div>
    <canvas class="mg-ink" aria-hidden="true"></canvas>
    <div class="intro-ui">
      <ol class="intro-dots">${beats.map(() => '<li></li>').join('')}</ol>
      <button class="intro-skip" type="button">Skip <span aria-hidden="true">&rsaquo;&rsaquo;</span></button>
    </div>
    <p class="intro-hint">tap to continue</p>
    ${ep ? `<div class="ep-card" aria-hidden="true"><small>${ep.kicker}</small><strong>${ep.title}</strong><code>${ep.git}</code></div>` : ''}`;
  if (ep) root.classList.add('ep', 'ep-w-' + ep.world);
  document.body.appendChild(root);
  document.body.classList.add('in-intro');

  const $ = (s) => root.querySelector(s);
  const page = $('.mg-page'), shake = $('.mg-shake'), text = $('.intro-text');
  const plates = [...root.querySelectorAll('.plate')], dots = root.querySelectorAll('.intro-dots li');
  const sfxEls = [...root.querySelectorAll('.mg-sfx')];
  const bg = $('.mg-bg'), ink = $('.mg-ink');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let land = false, i = -1, pg = -1, timer = 0, done = false, raf = 0, W = 0, H = 0, PW = 0, PH = 0, wipe = null;
  const later = [];
  const after = (ms, fn) => { later.push(setTimeout(fn, ms)); };

  const snd = (name) => {
    if (!sound) return;
    try {
      switch (name) {
        case 'whoosh': sound.noise({ dec: 0.28, vol: 0.12, f0: 500, f1: 4200, type: 'bandpass', q: 1.2 }); break;
        case 'impact': sound.noise({ dec: 0.1, vol: 0.18, f0: 1800, f1: 120 }); sound.tone(70, { type: 'sine', dec: 0.35, vol: 0.18, slide: 0.5 }); break;
        case 'storm': sound.storm(); break;
        case 'soft': sound.noise({ dec: 1.6, vol: 0.05, f0: 5000, f1: 2500, type: 'highpass', q: 0.5 }); break;
        case 'heart': [0, 0.17].forEach((t) => sound.tone(58, { t, type: 'sine', dec: 0.16, vol: 0.28, slide: 0.6 })); break;
        case 'resolve': sound.kalimba(392, { vol: 0.08, dec: 1.0, verb: 0.5 }); sound.kalimba(587, { t: 0.12, vol: 0.07, dec: 1.2, verb: 0.5 }); break;
        case 'zoom': sound.noise({ dec: 0.55, vol: 0.14, f0: 300, f1: 6000, type: 'bandpass', q: 2 }); break;
        case 'dawn': if (sound.sparkle) sound.sparkle(); break;
        case 'page': if (sound.page) sound.page(); break;
      }
    } catch { /* audio is optional */ }
  };

  // ------------------------------------------------------------ layout
  function layout() {
    W = innerWidth; H = innerHeight;
    const top = 60, bot = 44, side = 12;
    const aw = W - side * 2, ah = H - top - bot;
    const a = Math.min(maxAspect, Math.max(0.5, aw / ah));
    if (aw / ah > a) { PH = ah; PW = ah * a; } else { PW = aw; PH = aw / a; }
    PW = Math.round(PW); PH = Math.round(PH);
    land = PW / PH > 1;
    page.style.cssText = css({ left: Math.round((W - PW) / 2) + 'px', top: Math.round(top + (ah - PH) / 2) + 'px', width: PW + 'px', height: PH + 'px', '--pw': PW + 'px' });
    beats.forEach((b, k) => {
      const pts = ((land && b.polyL) || b.poly).map(([x, y]) => [x * PW, y * PH]);
      const x0 = Math.min(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1]));
      const x1 = Math.max(...pts.map((p) => p[0])), y1 = Math.max(...pts.map((p) => p[1]));
      const bw = x1 - x0, bh = y1 - y0, loc = pts.map(([x, y]) => [x - x0, y - y0]);
      const f = plates[k];
      f.style.left = x0 + 'px'; f.style.top = y0 + 'px'; f.style.width = bw + 'px'; f.style.height = bh + 'px';
      f.style.clipPath = `polygon(${loc.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
      f.style.setProperty('--dx', (b.from[0] * PW).toFixed(0) + 'px');
      f.style.setProperty('--dy', (b.from[1] * PH).toFixed(0) + 'px');
      f.style.setProperty('--rot', b.from[2] + 'deg');
      const svg = f.querySelector('svg');
      svg.setAttribute('viewBox', `0 0 ${bw.toFixed(1)} ${bh.toFixed(1)}`);
      const ptsStr = loc.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      svg.querySelectorAll('polygon').forEach((p) => p.setAttribute('points', ptsStr));
      const cv = f.querySelector('.mg-fx');
      if (cv) { cv.width = Math.round(bw * DPR); cv.height = Math.round(bh * DPR); cv._w = bw; cv._h = bh; cv._seed = 0; }
    });
    sfxEls.forEach((el) => {
      const s = beats[+el.dataset.i].sfx;
      el.style.cssText = css({ [s.l != null ? 'left' : 'right']: (s.l != null ? s.l : s.r) * PW + 'px', top: s.t0 * PH + 'px', '--r': s.rot + 'deg' });
    });
    // the splash hero: as big as fits under the title, bursting out of the bottom border
    $('.mg-hero').style.width = Math.round(Math.min(PW * 0.98, PH * 0.455)) + 'px';
    bg.width = Math.round(W * DPR); bg.height = Math.round(H * DPR);
    ink.width = Math.round(W * DPR); ink.height = Math.round(H * DPR);
    if (i >= 0) placeCaption(beats[i]);
    drawBg(true);
  }

  function placeCaption(b) {
    const c = (land && b.capL) || b.cap, st = { width: c.w * PW + 'px' };
    if (c.c) st.left = ((1 - c.w) / 2) * PW + 'px';
    else if (c.l != null) st.left = c.l * PW + 'px'; else st.right = c.r * PW + 'px';
    if (c.t != null) st.top = c.t * PH + 'px'; else st.bottom = c.b * PH + 'px';
    text.style.cssText = css(st);
    text.dataset.kind = c.kind || 'narr';
  }

  function setText(b) {
    // the element's text is the full line at once (screen readers, tests);
    // the typewriter is spans revealed by CSS delays
    text.classList.remove('show');
    text.textContent = '';
    if (calm) text.textContent = b.text;
    else {
      let n = 0;
      for (const word of b.text.split(' ')) {
        const w = document.createElement('span'); w.className = 'w';
        for (const ch of word) { const s = document.createElement('span'); s.textContent = ch; s.style.setProperty('--d', n++); w.appendChild(s); }
        if (text.childNodes.length) text.appendChild(document.createTextNode(' '));
        text.appendChild(w);
        n++;
      }
    }
    placeCaption(b);
    void text.offsetWidth;
    text.classList.add('show');
  }

  // ------------------------------------------------------------ beats
  function go(k) {
    if (done) return;
    if (k >= beats.length) { finish('end'); return; }
    i = k;
    const b = beats[i];
    clearTimeout(timer);
    if (!HOLD) timer = setTimeout(() => go(i + 1), BEAT_MS);
    dots.forEach((d, j) => d.classList.toggle('on', j <= i));
    setText(b);
    root.dataset.beat = i;
    // never slam in an empty panel: give a slow image up to 700 ms to decode
    const im = plates[i].querySelector('img');
    if (!calm && !(im.complete && im.naturalWidth) && im.decode) {
      const k0 = i; let went = false;
      const run = () => { if (!went && !done && i === k0) { went = true; turn(); } };
      im.decode().then(run, run); after(700, run);
      return;
    }
    turn();
  }
  function turn() {
    const b = beats[i], k = i;
    const show = () => {
      plates.forEach((p, j) => {
        const same = beats[j].page === b.page;
        p.classList.toggle('on', same && j <= i);
        p.classList.toggle('enter', j === i);
      });
      sfxEls.forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
      root.classList.toggle('splash', !!b.splash);
      if (calm) return;
      snd('whoosh');
      // the panel lands ~300 ms in: shake, flash, sound
      after(b.impact ? 260 : 330, () => {
        if (done || i !== k) return;
        shake.classList.remove('hit', 'hit2'); void shake.offsetWidth;
        shake.classList.add(b.impact === 2 ? 'hit2' : 'hit');
        if (b.impact) { root.classList.remove('flash'); void root.offsetWidth; root.classList.add('flash'); snd('impact'); }
        if (b.snd) snd(b.snd);
      });
    };
    if (b.page !== pg) {
      const first = pg < 0;
      pg = b.page;
      root.dataset.page = pg;
      if (first || calm) { if (!first) root.classList.add('fade'); show(); }
      else { snd('page'); inkWipe(show); }
    } else show();
  }

  function finish(reason) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    later.forEach(clearTimeout);
    cancelAnimationFrame(raf);
    removeEventListener('resize', layout);
    root.classList.add('out');
    document.body.classList.remove('in-intro');
    setTimeout(() => root.remove(), calm ? 0 : 520);
    onDone(reason);
  }

  // ------------------------------------------------------------ canvas FX
  // seeded jitter so lines "boil" a few times a second like hand-drawn frames
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  function focusLines(g, w, h, cx, cy, n, r0, col, max) {
    g.fillStyle = col;
    const R = Math.hypot(w, h);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.05;
      const inner = r0 * (0.75 + rnd() * 0.6), wd = (0.004 + rnd() * max);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      g.lineTo(cx + Math.cos(a - wd) * R, cy + Math.sin(a - wd) * R);
      g.lineTo(cx + Math.cos(a + wd) * R, cy + Math.sin(a + wd) * R);
      g.closePath(); g.fill();
    }
  }
  function streaks(g, w, h, ang, n, col, len, wd, t, speed) {
    g.save(); g.translate(w / 2, h / 2); g.rotate(ang);
    const R = Math.hypot(w, h);
    g.strokeStyle = col; g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = (rnd() - 0.5) * R, L = len * (0.4 + rnd());
      const y = ((rnd() * R + t * speed) % (R * 1.4)) - R * 0.7;
      g.lineWidth = wd * (0.3 + rnd());
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + L); g.stroke();
    }
    g.restore();
  }

  function drawFx(cv, b, t) {
    const g = cv.getContext('2d'), w = cv._w, h = cv._h;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, w, h);
    const frame = Math.floor(t / 90); // ~11 fps boil
    seed = 1 + frame * 7919 + b.page * 31;
    switch (b.fx) {
      case 'focus': focusLines(g, w, h, w / 2, h * 0.5, 90, Math.min(w * 0.36, h * 1.2), 'rgba(10,12,16,.85)', 0.012); break;
      case 'speed': streaks(g, w, h, -1.25, 34, 'rgba(255,255,255,.75)', w * 0.35, 2.2, t, 1.6); break;
      case 'rain': streaks(g, w, h, 0.18, 46, 'rgba(220,230,240,.32)', h * 0.18, 1.1, t, 0.9); break;
      case 'up': {
        streaks(g, w, h, 0, 40, 'rgba(255,255,255,.55)', h * 0.3, 2, -t, 2.4);
        seed = 1 + frame * 13;
        focusLines(g, w, h, w * 0.52, h * 0.38, 60, Math.min(w, h) * 0.55, 'rgba(10,12,16,.30)', 0.01);
        break;
      }
      case 'rays': case 'sun': case 'glint': {
        const cx = w * (b.fx === 'glint' ? 0.5 : 0.5), cy = b.fx === 'sun' ? h * 0.66 : b.fx === 'glint' ? h * 0.04 : h * 0.3;
        const rr = b.fx === 'glint' ? Math.min(w, h) * 0.25 : Math.max(w, h) * 0.6;
        const pulse = 0.75 + 0.25 * Math.sin(t / 420);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
        gr.addColorStop(0, `rgba(255,214,110,${0.42 * pulse})`); gr.addColorStop(1, 'rgba(255,201,77,0)');
        g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, w, h);
        // drifting gold motes
        seed = 99 + b.page;
        for (let k = 0; k < 18; k++) {
          const x = rnd() * w, sp = 8 + rnd() * 16, y = (rnd() * h - (t / 1000) * sp) % h;
          const yy = y < 0 ? y + h : y, r = 0.8 + rnd() * 1.8;
          g.fillStyle = `rgba(255,212,110,${0.35 + 0.4 * Math.abs(Math.sin(t / 600 + k))})`;
          g.beginPath(); g.arc(x + Math.sin(t / 900 + k) * 6, yy, r, 0, Math.PI * 2); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        break;
      }
    }
  }

  function drawBg(force) {
    const g = bg.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const b = beats[Math.max(0, i)];
    g.fillStyle = '#0B0E12'; g.fillRect(0, 0, W, H);
    // a faint focus burst behind the page; boils on intense beats
    const t = performance.now();
    seed = 7 + (calm || force ? 0 : Math.floor(t / (b && b.impact ? 90 : 400)));
    const cx = W / 2, cy = H * 0.45;
    focusLines(g, W, H, cx, cy, 120, Math.min(W, H) * 0.42, b && b.splash ? 'rgba(255,201,77,.07)' : 'rgba(255,246,230,.05)', 0.01);
    const v = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(11,14,18,0)'); v.addColorStop(1, 'rgba(5,6,8,.85)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }

  // ink splash wipe: blobs swell to cover the screen, the page swaps, then they drain away
  function inkWipe(mid) {
    const blobs = [];
    seed = 4242 + pg * 101;
    const R = Math.hypot(W, H);
    for (let k = 0; k < 12; k++) blobs.push({ x: rnd() * W, y: rnd() * H, r: R * (0.18 + rnd() * 0.22), d: rnd() * 0.35, wob: rnd() * 6 });
    const drops = [];
    for (let k = 0; k < 40; k++) drops.push({ x: rnd() * W, y: rnd() * H, r: 2 + rnd() * 9, d: rnd() * 0.5 });
    wipe = { t0: performance.now(), blobs, drops, mid, swapped: false, IN: 340, OUT: 420 };
  }
  function drawWipe(now) {
    const g = ink.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!wipe) return;
    const e = now - wipe.t0;
    let k;
    if (e < wipe.IN) k = e / wipe.IN;
    else {
      if (!wipe.swapped) { wipe.swapped = true; wipe.mid(); }
      k = 1 - (e - wipe.IN) / wipe.OUT;
      if (k <= 0) { wipe = null; return; }
    }
    g.fillStyle = '#07090B';
    const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
    for (const b of wipe.blobs) {
      const r = b.r * ease((k - b.d * (1 - k)) / (1 - b.d * 0.5)) * 1.9;
      if (r <= 0) continue;
      g.beginPath();
      for (let a = 0; a <= 24; a++) {
        const th = (a / 24) * Math.PI * 2, rr = r * (1 + 0.08 * Math.sin(th * 5 + b.wob) + 0.05 * Math.sin(th * 9 + b.wob * 2));
        const x = b.x + Math.cos(th) * rr, y = b.y + Math.sin(th) * rr;
        if (a) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.fill();
    }
    for (const d of wipe.drops) { const s = ease(k * 1.4 - d.d); if (s > 0) { g.beginPath(); g.arc(d.x, d.y, d.r * s, 0, Math.PI * 2); g.fill(); } }
  }

  let lastBg = 0;
  function loop(now) {
    if (done) return;
    raf = requestAnimationFrame(loop);
    drawWipe(now);
    if (calm) return;
    if (now - lastBg > 85) { lastBg = now; drawBg(false); }
    plates.forEach((p, j) => {
      if (!p.classList.contains('on')) return;
      const cv = p.querySelector('.mg-fx');
      // v1.0.1 PERF: the line work boils at ~11 fps; 30 Hz redraws keep the motion and halve the cost
      if (cv && now - (cv._t || 0) >= 32) { cv._t = now; drawFx(cv, beats[j], now); }
    });
  }

  // ------------------------------------------------------------ input
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target.closest('.intro-skip')) return;
    if (sound) sound.unlock();
    go(i + 1);
  });
  root.querySelector('.intro-skip').addEventListener('click', (e) => { e.stopPropagation(); if (sound) sound.unlock(); finish('skip'); });
  root.querySelector('.mg-grow').addEventListener('click', (e) => { e.stopPropagation(); finish('end'); });
  const onKey = (e) => {
    if (done) { removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('skip'); }
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (sound) sound.unlock(); go(i + 1); }
  };
  addEventListener('keydown', onKey, true);
  addEventListener('resize', layout);
  layout();
  raf = requestAnimationFrame(loop);
  requestAnimationFrame(() => setTimeout(() => { if (i < 0) go(0); }, ep && !calm ? 1800 : 0));
  return { next: () => go(i + 1), skip: () => finish('skip'), get index() { return i; }, get done() { return done; } };
}
