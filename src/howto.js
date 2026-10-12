// Forkwood 1.0: "How to play" in four animated cards (drag = steer, quick tap = fork/merge,
// sunlight = sap, dodge traps). Shown once after the prologue on first launch, and any time from Home.
// Pure DOM + inline SVG + CSS animation (story.css), no images, so it costs nothing on first load.
import { loadStoryCss } from './intro.js';

const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const VINE = '#3fae6a';
const CARDS = [
  { k: 'steer', h: touch ? 'Drag to steer' : 'Drag or \u2190 \u2192 to steer',
    p: 'Hold anywhere and slide left or right. Your vine tip follows your finger.',
    svg: `<path class="ht-path" d="M60 150 C60 120 40 100 55 75 S80 40 60 12" stroke="${VINE}"/><circle class="ht-tip ht-steer" cx="60" cy="40" r="7"/><g class="ht-finger ht-steer"><circle cx="60" cy="118" r="11"/></g>` },
  { k: 'fork', h: touch ? 'Quick tap = fork / merge' : 'Tap or Space = fork / merge',
    p: 'Tap once to split into two branches. Tap again to merge them back for a \u00D72 combo.',
    svg: `<path d="M60 150 L60 92" stroke="${VINE}"/><path class="ht-l" d="M60 92 C60 70 30 60 30 20" stroke="${VINE}"/><path class="ht-r" d="M60 92 C60 70 90 60 90 20" stroke="${VINE}"/><text class="ht-x2" x="60" y="40">\u00D72</text><circle class="ht-tap" cx="60" cy="120" r="12"/>` },
  { k: 'sun', h: 'Sunlight = sap = life',
    p: 'Your sap drains as you climb. Catch sunlight to refill it. Run dry and the climb ends.',
    svg: `<path d="M60 150 C60 110 70 80 60 40" stroke="${VINE}"/><g class="ht-sun"><circle cx="60" cy="36" r="10"/></g><rect x="14" y="160" width="92" height="9" rx="4.5" class="ht-barbg"/><rect x="14" y="160" width="92" height="9" rx="4.5" class="ht-bar"/>` },
  { k: 'traps', h: 'Dodge the traps',
    p: 'Thorns, diving crows, falling acorns. A hit reverts a branch (git revert). Fork to keep a spare!',
    svg: `<path class="ht-dodge" d="M60 150 C60 110 30 90 34 40" stroke="${VINE}"/><g class="ht-thorn"><path d="M70 70 l14 -6 l-6 14 l12 2 l-12 6 l6 12 l-14 -6 z"/></g><circle class="ht-acorn" cx="96" cy="0" r="6"/>` },
];

/** Show the cards; resolves when the player taps the last button (or skips). */
export function showHowTo({ sound = null, calm = false, last = 'Let\u2019s grow!' } = {}) {
  return loadStoryCss().then(() => new Promise((res) => {
    let i = 0;
    const root = document.createElement('section');
    root.className = 'howto' + (calm ? ' calm' : ''); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'How to play');
    root.innerHTML = `<div class="ht-card"><p class="ht-kick">How to play <span class="ht-n"></span></p>
      <div class="ht-stage">${CARDS.map((c, k) => `<figure class="ht-slide ht-${c.k}" data-k="${k}"><svg viewBox="0 0 120 176" aria-hidden="true">${c.svg}</svg><figcaption><h3>${c.h}</h3><p>${c.p}</p></figcaption></figure>`).join('')}</div>
      <ol class="ht-dots">${CARDS.map(() => '<li></li>').join('')}</ol>
      <div class="ht-btns"><button class="btn secondary ht-skip" type="button">Skip</button><button class="btn primary ht-next" type="button">Next</button></div></div>`;
    document.body.appendChild(root);
    const slides = root.querySelectorAll('.ht-slide'), dots = root.querySelectorAll('.ht-dots li');
    const next = root.querySelector('.ht-next');
    const show = () => {
      slides.forEach((s, k) => s.classList.toggle('on', k === i));
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      root.querySelector('.ht-n').textContent = `${i + 1}/${CARDS.length}`;
      next.textContent = i === CARDS.length - 1 ? last : 'Next';
    };
    const done = () => { removeEventListener('keydown', onKey, true); root.classList.add('out'); setTimeout(() => root.remove(), 260); res(); };
    const step = () => { if (sound) { sound.unlock(); try { sound.tone(660 + i * 90, { type: 'sine', dec: 0.12, vol: 0.06 }); } catch { /* optional */ } } if (i < CARDS.length - 1) { i++; show(); } else done(); };
    const onKey = (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); done(); } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); step(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; show(); } };
    addEventListener('keydown', onKey, true);
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    next.addEventListener('click', (e) => { e.stopPropagation(); step(); });
    root.querySelector('.ht-skip').addEventListener('click', (e) => { e.stopPropagation(); done(); });
    root.querySelector('.ht-stage').addEventListener('click', (e) => { e.stopPropagation(); step(); });
    show();
    requestAnimationFrame(() => root.classList.add('show'));
  }));
}
