// First-launch story: five storybook plates (woodblock-style illustrations made
// for Forkwood), one line each, tap to advance, Skip any time. About 25 s if
// left alone. Loaded only on a first visit or from "Replay the story".
// Reduced motion / calm mode: plates swap with a plain fade, no slow zoom.
import { loadArt } from './art.js';

export const BEATS = [
  { img: 'story1', text: 'Long ago, the Great Tree held up the sky. Every leaf it grew was a memory.' },
  { img: 'story2', text: 'Then the Storm came. Lightning split the crown, and its branches were reverted to dust.' },
  { img: 'story3', text: 'One seed survived. A sparrow carried it to the edge of the meadow.' },
  { img: 'story4', text: 'Now it is yours. Fork to grow two paths at once. Merge to bring them home.' },
  { img: 'story5', text: 'Climb past thorns and storms, beyond the clouds, to the treetop. Grow.' },
];
export const BEAT_MS = 5200;

/**
 * Show the story. opts: { calm, sound, onDone(reason) } where reason is
 * 'end' | 'skip'. Returns a controller { next, skip, get index }.
 */
export function playIntro({ calm = false, sound = null, onDone = () => {} } = {}) {
  for (const b of BEATS) loadArt(b.img);
  const root = document.createElement('section');
  root.id = 'intro';
  root.className = 'intro' + (calm ? ' calm' : '');
  root.setAttribute('aria-label', 'Story');
  root.innerHTML = `
    <div class="intro-stage">
      ${BEATS.map((b, i) => `<figure class="plate" data-i="${i}"><img src="assets/art/${b.img}.webp" alt="" decoding="async" ${i ? 'loading="eager"' : ''} /></figure>`).join('')}
      <div class="intro-frame" aria-hidden="true"></div>
    </div>
    <p class="intro-text" aria-live="polite"></p>
    <div class="intro-ui">
      <ol class="intro-dots">${BEATS.map(() => '<li></li>').join('')}</ol>
      <button class="intro-skip" type="button">Skip <span aria-hidden="true">&rsaquo;&rsaquo;</span></button>
    </div>
    <p class="intro-hint">tap to continue</p>`;
  document.body.appendChild(root);
  document.body.classList.add('in-intro');
  const plates = root.querySelectorAll('.plate'), dots = root.querySelectorAll('.intro-dots li'), text = root.querySelector('.intro-text');
  let i = -1, timer = 0, done = false;
  function go(k) {
    if (done) return;
    if (k >= BEATS.length) { finish('end'); return; }
    i = k;
    plates.forEach((p, j) => { p.classList.toggle('on', j === i); p.classList.toggle('past', j < i); });
    dots.forEach((d, j) => d.classList.toggle('on', j <= i));
    text.classList.remove('show');
    // restart the caption's ink-in
    void text.offsetWidth;
    text.textContent = BEATS[i].text;
    text.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => go(i + 1), BEAT_MS);
  }
  function finish(reason) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    root.classList.add('out');
    document.body.classList.remove('in-intro');
    setTimeout(() => root.remove(), calm ? 0 : 520);
    onDone(reason);
  }
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target.closest('.intro-skip')) return;
    if (sound) { sound.unlock(); sound.page(); }
    go(i + 1);
  });
  root.querySelector('.intro-skip').addEventListener('click', (e) => { e.stopPropagation(); if (sound) sound.unlock(); finish('skip'); });
  const onKey = (e) => {
    if (done) { window.removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('skip'); }
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (sound) sound.unlock(); go(i + 1); }
  };
  window.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => go(0));
  return { next: () => go(i + 1), skip: () => finish('skip'), get index() { return i; }, get done() { return done; } };
}
