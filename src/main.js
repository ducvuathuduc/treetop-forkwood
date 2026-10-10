// Forkwood: game glue (input, camera, effects, UI, persistence).
import { createSim, step, summary, heightM, W, PX_PER_M, STAGES, SAP_MAX } from './sim.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { createBot, botInput } from './bot.js';
import { renderCard, shareCard, downloadCard } from './share.js';
import { dailySeed, dailyLabel } from './rng.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT_MODE = params.has('bot');           // let the bot play the real game (testing)
const FIXED_SEED = params.has('seed') ? (Number(params.get('seed')) >>> 0) : null;
// challenge links: ?seed=<course>&beat=<metres> ("beat my tree")
const CHALLENGE = FIXED_SEED != null && params.has('beat') ? { seed: FIXED_SEED, m: Math.max(1, Math.min(99999, Math.floor(Number(params.get('beat')) || 0))) } : null;

const canvas = $('game');
const renderer = new Renderer(canvas);
const sound = new Sound();

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

let best = store.get('forkwood.best', { score: 0, height: 0 });
let tutorialDone = store.get('forkwood.tutorial', false);
let stats = store.get('forkwood.stats', { runs: 0, meters: 0, merges: 0, treetops: 0, bestMult: 1 });
const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let calm = store.get('forkwood.calm', null);
const isCalm = () => (calm == null ? !!(motionQuery && motionQuery.matches) : calm);

// ------------------------------------------------------------------ state
let mode = 'title';         // title | play | over
let paused = false;
let daily = false;
let sim = null;
let bot = createBot(0.8, 7);
let botSkill = 0.8;
let lastSum = null;
let cardCanvas = null;
let deathShown = false;

const cam = { x: W / 2, y: -200, scale: 1, anchor: 0.7, shake: 0 };
const fx = { particles: [], floaters: [], flash: 0, flashColor: '255,80,80', banner: null, shownScore: 0, shownSap: SAP_MAX, multPulse: 0, hitStop: 0 };
const input = { targetX: null, dir: 0, toggle: false, keys: new Set(), pointerId: null, downT: 0, downX: 0, downY: 0, moved: 0, anchor: W / 2, kind: window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse' };
// first-run coach: steer -> fork -> merge, taught by doing (screen-space, never overlaps the world)
const coach = { step: null, t: 0, collects: 0, retry: false, slow: false };
let timeScale = 1;
const TREETOP_IDX = STAGES.findIndex((st) => st.name === 'Treetop');

function setMode(m) {
  mode = m;
  document.body.className = 'state-' + m;
  $('title').classList.toggle('show', m === 'title');
  $('over').classList.toggle('show', m === 'over');
  $('pause').classList.remove('show');
  paused = false;
}

function startDemo() {
  sim = createSim({ seed: (Math.random() * 1e9) | 0, demo: true });
  bot = createBot(0.85, (Math.random() * 1000) | 0);
  cam.y = sim.cy - 120;
  resetFx();
}

function resetFx() {
  fx.particles.length = 0; fx.floaters.length = 0; fx.flash = 0; fx.banner = null; fx.multPulse = 0;
  fx.shownScore = 0; fx.shownSap = SAP_MAX; fx.hitStop = 0; cam.shake = 0; cam.punch = 0;
}

function startRun(isDaily = daily) {
  sound.unlock();
  daily = isDaily;
  const seed = daily ? dailySeed() : FIXED_SEED ?? ((Math.random() * 1e9) >>> 0);
  const bestM = daily ? store.get('forkwood.daily.' + dailySeed(), { height: 0 }).height : CHALLENGE ? CHALLENGE.m : best.height;
  sim = createSim({ seed, tutorial: !tutorialDone, bestM });
  coach.step = sim.tutorial ? 'steer' : null; coach.t = 0; coach.collects = 0; coach.retry = false; coach.slow = false;
  timeScale = 1;
  bot = createBot(botSkill, seed & 0xffff);
  cam.y = sim.cy - 60; cam.scale = renderer.baseScale(); cam.anchor = 0.7;
  resetFx();
  deathShown = false;
  input.toggle = false;
  setMode('play');
  sound.setStage(0);
  sound.start();
  sound.click();
  if (!sim.tutorial) {
    const goal = CHALLENGE && !daily ? { text: `BEAT ${CHALLENGE.m} m`, sub: 'same course as your friend' }
      : best.height < STAGES[TREETOP_IDX].m ? { text: 'REACH THE TREETOP', sub: `${STAGES[TREETOP_IDX].m} m · fork, merge, climb` }
      : { text: `BEAT ${daily ? bestM : best.height} m`, sub: daily ? `daily tree · ${dailyLabel()}` : 'your best · gold line' };
    fx.banner = { ...goal, t: 0, max: 2.2, small: true };
  }
}

function toMenu() {
  sound.stop();
  setMode('title');
  refreshTitle();
  startDemo();
}

function refreshTitle() {
  const bits = [];
  if (best.score > 0) bits.push(`best ${best.height} m · ${best.score.toLocaleString('en-US')} pts`);
  if (stats.runs > 0) bits.push(`${stats.runs} run${stats.runs === 1 ? '' : 's'}`);
  if (stats.treetops > 0) bits.push(`🌳 treetop ×${stats.treetops}`);
  $('title-best').textContent = bits.join(' · ');
  $('btn-calm').textContent = `Calm mode: ${isCalm() ? 'on' : 'off'}`;
  $('btn-calm').setAttribute('aria-pressed', String(isCalm()));
  if (CHALLENGE) {
    $('challenge').hidden = false;
    $('challenge').textContent = `A friend grew ${CHALLENGE.m} m on this course. Can you beat it?`;
    $('btn-play').innerHTML = '▶&nbsp; Take the challenge';
  }
  const d = store.get('forkwood.daily.' + dailySeed(), null);
  $('daily-best').textContent = d ? `· today ${d.height} m` : `· ${dailyLabel()}`;
}

// ------------------------------------------------------------------ effects
function burst(x, y, n, color, speed = 160, size = 4, life = 0.6, kind = 'dot') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
    fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.4), max: life, color, size: size * (0.6 + Math.random() * 0.8), kind, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, g: kind === 'leaf' ? 60 : 0 });
  }
  if (fx.particles.length > 500) fx.particles.splice(0, fx.particles.length - 500);
}
function ring(x, y, color, size = 60, life = 0.5) { fx.particles.push({ x, y, vx: 0, vy: 0, life, max: life, color, size, kind: 'ring' }); }
function floater(x, y, text, color = '#ffffff', size = 20, life = 0.9) {
  fx.floaters.push({ x: Math.max(60, Math.min(W - 60, x)), y, text, color, size, life, max: life, vy: -70 });
  if (fx.floaters.length > 24) fx.floaters.shift();
}
function shake(a) { if (!isCalm()) cam.shake = Math.max(cam.shake, a); }
function flash(color, a = 1) { fx.flashColor = color; fx.flash = Math.max(fx.flash, isCalm() ? a * 0.3 : a); }
function hitStop(sec) { fx.hitStop = Math.max(fx.hitStop || 0, sec); }
function vibrate(ms) { if (navigator.vibrate && !BOT_MODE && !isCalm()) try { navigator.vibrate(ms); } catch { /* ignore */ } }

function coachEvent(type, e, s) {
  if (!coach.step) return;
  if (type === 'collect' && coach.step === 'steer' && ++coach.collects >= 3) { coach.step = 'fork'; coach.t = 0; }
  else if (type === 'fork' && (coach.step === 'fork' || coach.step === 'steer')) { coach.step = 'merge'; coach.t = 0; }
  else if (type === 'merge') { coach.step = 'praise'; coach.t = 0; }
  else if ((type === 'emptymerge' || type === 'revert') && coach.step === 'merge') { coach.step = 'fork'; coach.t = 0; coach.retry = type; }
}

/** Coach text for the current step, worded for the device being used. */
function coachView(s) {
  if (!coach.step || mode !== 'play') return null;
  const tap = input.kind === 'touch' ? 'TAP' : input.kind === 'key' ? 'SPACE' : 'CLICK';
  const steer = input.kind === 'touch' ? 'Drag anywhere to steer' : input.kind === 'key' ? '← → to steer' : 'Move the mouse to steer';
  switch (coach.step) {
    case 'steer': return { title: steer, sub: 'Grab sunlight ☀ to refill your sap', n: 1 };
    case 'fork': return { title: `${tap} to fork`, sub: coach.retry === 'emptymerge' ? 'Grab sunlight on both branches before merging' : coach.retry === 'revert' ? 'A hit reverts a branch. Fork again!' : 'Split into two branches: one per gap', n: 2, urgent: coach.slow, cue: coach.slow };
    case 'merge': {
      const staged = s.tips.length === 2 ? s.tips[0].staged + s.tips[1].staged : 0;
      const ready = staged >= 2 && s.forkTime > 0.9;
      return ready ? { title: `${tap} again to merge`, sub: coach.slow ? 'Merge before the thorns!' : `Cash in ${staged} commits for a combo`, n: 3, urgent: coach.slow, cue: true }
        : { title: 'Grow both branches', sub: 'Each sunlight is a commit on that branch', n: 3 };
    }
    case 'praise': return { title: `Merged! Combo ×${s.mult}`, sub: `Combos stack to ×8 · reach the Treetop at ${STAGES[TREETOP_IDX].m} m`, n: 4, good: true };
  }
  return null;
}

function updateCoach(s, dt) {
  coach.slow = false;
  if (!coach.step) return 1;
  coach.t += dt;
  const y = s.cy;
  if (coach.step === 'steer' && s.brambles.some((b) => b.kind === 'split' && b.y < y && b.y > y - 520)) { coach.step = 'fork'; coach.t = 0; }
  if (coach.step === 'fork' && !s.forked && s.brambles.some((b) => b.kind === 'split' && b.y < y && b.y > y - 300)) coach.slow = true;
  if (coach.step === 'merge' && s.forked && s.brambles.some((b) => b.kind === 'gate' && b.y < y && b.y > y - 340)) coach.slow = true;
  if (coach.step === 'praise' && coach.t > 3.4) {
    coach.step = null;
    if (!BOT_MODE) { tutorialDone = true; store.set('forkwood.tutorial', true); }
  }
  return coach.slow ? 0.22 : 1;
}

function handleEvents(s, quiet) {
  for (const e of s.events) {
    switch (e.type) {
      case 'collect':
        if (!quiet) coachEvent('collect', e, s);
        burst(e.x, e.y, 7, '#ffe27a', 150, 3.5, 0.5);
        if (!quiet) { sound.collect(e.chain, e.forked); floater(e.x, e.y - 14, `+${e.pts}`, '#fff3b0', 16 + Math.min(8, e.chain), 0.7); }
        break;
      case 'fork':
        for (const t of s.tips) { ring(t.x, s.cy, '#9fe8ff', 50); burst(t.x, s.cy, 8, '#c9f59a', 120, 3, 0.5); }
        if (!quiet) { coachEvent('fork', e, s); sound.fork(); floater(e.x, e.y - 40, 'fork', '#9fe8ff', 18, 0.6); shake(3); cam.punch = 0.035; }
        break;
      case 'merge':
        ring(e.x, e.y, '#ffd76a', 110, 0.7); ring(e.x, e.y, '#ffffff', 60, 0.45);
        burst(e.x, e.y, 18, '#ffd76a', 260, 4, 0.8);
        burst(e.x, e.y, 10, STAGES[s.stageIdx].leaf, 200, 7, 1.2, 'leaf');
        if (!quiet) {
          coachEvent('merge', e, s);
          sound.merge(e.mult); shake(5 + e.mult); flash('255,215,106', 0.5); fx.multPulse = 1; vibrate(25);
          hitStop(0.045); cam.punch = 0.05 + 0.01 * e.mult;
          burst(e.x, e.y, 6 + e.mult * 3, '#ffffff', 320, 3, 0.6);
          floater(e.x, e.y - 50, `MERGE ×${e.mult}`, '#ffd76a', 28 + e.mult * 2, 1.2);
          floater(e.x, e.y - 18, `+${e.bonus}`, '#ffffff', 20, 1.0);
        }
        break;
      case 'emptymerge':
        if (!quiet) { coachEvent('emptymerge', e, s); sound.emptyMerge(); floater(e.x, e.y - 34, 'merged (no commits)', 'rgba(255,255,255,0.8)', 14, 0.7); }
        break;
      case 'revert':
        burst(e.x, e.y, 16, '#ff6b6b', 220, 4, 0.7);
        if (!quiet) { coachEvent('revert', e, s); hitStop(0.07); sound.revert(); shake(9); flash('255,70,70', 0.6); vibrate(60); floater(e.x, e.y - 30, e.lost ? `REVERTED −${e.lost}` : 'REVERTED', '#ff8a8a', 24, 1.0); }
        break;
      case 'hit':
        burst(e.x, e.y, 12, '#7b5236', 200, 4, 0.7);
        burst(e.x, e.y, 6, STAGES[s.stageIdx].leaf, 160, 7, 1.2, 'leaf');
        if (!quiet) { hitStop(0.09); sound.hit(); shake(12); flash('255,60,60', 0.8); vibrate(70); floater(e.x, e.y - 30, `−${e.dmg} sap`, '#ff8a8a', 22, 0.9); }
        break;
      case 'near':
        if (!quiet) { sound.near(); floater(e.x, e.y - 20, `close! +${e.bonus}`, '#c9f59a', 17, 0.8); }
        break;
      case 'splitpass':
        ring(e.x, e.y, '#c9f59a', 90, 0.6);
        if (!quiet) { sound.collect(8, true); floater(e.x, e.y - 40, `both lanes +${e.bonus}`, '#c9f59a', 20, 1.0); }
        break;
      case 'dew':
        burst(e.x, e.y, 14, '#8fd3ff', 180, 4, 0.7); ring(e.x, e.y, '#8fd3ff', 60);
        if (!quiet) { sound.dew(); floater(e.x, e.y - 20, '+30 sap', '#bfe7ff', 18, 0.9); }
        break;
      case 'shield':
        ring(e.x, e.y, '#ffb347', 70);
        if (!quiet) { sound.shield(); floater(e.x, e.y - 20, 'bark shield', '#ffd08a', 18, 0.9); }
        break;
      case 'shieldbreak':
        burst(e.x, e.y, 14, '#ffb347', 200, 4, 0.6);
        if (!quiet) { sound.shieldBreak(); shake(5); floater(e.x, e.y - 24, 'blocked!', '#ffd08a', 20, 0.8); }
        break;
      case 'stage': {
        const st = STAGES[e.idx];
        sound.setStage(e.idx);
        if (!quiet && e.idx === TREETOP_IDX) {
          sound.stageUp(); sound.newBest();
          fx.banner = { text: 'TREETOP!', sub: 'you grew a whole tree · now reach the stars', t: 0, max: 3.4, gold: true };
          flash('255,215,106', 0.6); shake(8); vibrate(80);
          for (let k = 0; k < 5; k++) burst(s.cx + (k - 2) * 70, s.cy - 80 - k * 20, 12, STAGES[e.idx].leaf, 340, 8, 1.8, 'leaf');
          burst(s.cx, s.cy - 60, 30, '#ffd76a', 420, 4, 1.0);
        } else if (!quiet) { sound.stageUp(); fx.banner = { text: st.name.toUpperCase(), sub: `${st.m} m · +15 sap`, t: 0, max: 2.4 }; }
        break;
      }
      case 'newbest':
        if (!quiet) { sound.newBest(); floater(s.cx, s.cy - 60, CHALLENGE && !daily ? 'FRIEND BEATEN!' : 'NEW BEST!', '#ffd76a', 28, 1.4); flash('255,215,106', 0.35); }
        break;
      case 'death':
        for (const t of s.tips) burst(t.x, s.cy, 14, STAGES[s.stageIdx].leaf, 140, 7, 1.6, 'leaf');
        if (!quiet) { sound.death(); sound.stop(); shake(6); vibrate(120); }
        break;
    }
  }
}

function updateFx(dt) {
  for (const p of fx.particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2.5; p.vy *= 1 - dt * 2.5; p.vy += (p.g || 0) * dt; p.rot += (p.vr || 0) * dt;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const f of fx.floaters) { f.life -= dt; f.y += f.vy * dt; f.vy *= 1 - dt * 2; }
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
  fx.flash = Math.max(0, fx.flash - dt * 3);
  fx.multPulse = Math.max(0, fx.multPulse - dt * 3);
  cam.shake = Math.max(0, cam.shake - dt * 40);
  cam.punch = Math.max(0, (cam.punch || 0) - dt * 0.25);
  if (fx.banner) { fx.banner.t += dt; if (fx.banner.t > fx.banner.max) fx.banner = null; }
  if (sim) {
    fx.shownScore += (sim.score - fx.shownScore) * Math.min(1, dt * 10);
    if (Math.abs(sim.score - fx.shownScore) < 1) fx.shownScore = sim.score;
    fx.shownSap += (sim.sap - fx.shownSap) * Math.min(1, dt * 12);
  }
}

// ------------------------------------------------------------------ game over
function showGameOver() {
  deathShown = true;
  const sum = summary(sim);
  lastSum = sum;
  let newBest = false;
  const prevBest = best.height;
  if (!BOT_MODE) {
    stats = { ...stats, runs: stats.runs + 1, meters: stats.meters + sum.height, merges: stats.merges + sum.merges,
      treetops: stats.treetops + (sum.height >= STAGES[TREETOP_IDX].m ? 1 : 0), bestMult: Math.max(stats.bestMult, sum.maxMult) };
    store.set('forkwood.stats', stats);
    if (sum.score > best.score || sum.height > best.height) {
      newBest = sum.score > best.score;
      best = { score: Math.max(best.score, sum.score), height: Math.max(best.height, sum.height) };
      store.set('forkwood.best', best);
    }
    if (daily) {
      const key = 'forkwood.daily.' + dailySeed();
      const d = store.get(key, { score: 0, height: 0 });
      if (sum.score > d.score) { store.set(key, { score: sum.score, height: Math.max(d.height, sum.height) }); newBest = true; }
    }
  }
  const url = location.host ? (location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '') : 'Forkwood';
  const challenge = CHALLENGE && !daily ? { m: CHALLENGE.m, won: sum.height > CHALLENGE.m } : null;
  try {
    cardCanvas = renderCard(sim, sum, { daily, dailyLabel: dailyLabel(), newBest, url, seed: sim.seed, challenge });
    $('card-img').src = cardCanvas.toDataURL('image/png');
  } catch (e) {
    console.warn('card render failed', e && e.stack || e);
  }
  const toGo = STAGES[TREETOP_IDX].m - sum.height;
  $('over-kicker').textContent = challenge ? (challenge.won ? `★ CHALLENGE BEATEN (${challenge.m} m)` : `CHALLENGE: ${challenge.m - sum.height + 1} m short`)
    : newBest ? '★ NEW BEST' : daily ? `DAILY TREE · ${dailyLabel()}` : `reached ${sum.stage.toUpperCase()}`;
  $('over-tip').textContent = toGo > 0 ? `${toGo} m to the Treetop. ${runTip(sum)}`
    : (sum.height > prevBest && prevBest >= STAGES[TREETOP_IDX].m) ? 'Above the treetop and climbing. Stars next.' : runTip(sum);
  $('over-height').textContent = `${sum.height} m`;
  $('over-score').textContent = `${sum.score.toLocaleString('en-US')} pts · best ${Math.max(best.score, sum.score).toLocaleString('en-US')}`;
  $('over-hash').textContent = `tree ${sum.hash} · ${sum.commits} commits · ${sum.merges} merges · ${sum.reverts} reverts · max ×${sum.maxMult}`;
  $('share-msg').textContent = '';
  setMode('over');
  $('btn-again').focus({ preventScroll: true });
}

function runTip(sum) {
  if (sum.merges === 0) return 'Tip: fork, grab sunlight on both branches, then merge for a combo.';
  if (sum.reverts >= 2) return 'Tip: merge before thorn gates. A hit on a fork reverts that branch.';
  if (sum.maxMult < 4) return 'Tip: merge often. Every merge raises the multiplier (max ×8).';
  return 'Tip: split gates reward forked trees with a both-lanes bonus.';
}

function challengeUrl() {
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'Forkwood';
  return `${base}?seed=${sim.seed}&beat=${lastSum.height}`;
}

function shareText() {
  const s = lastSum;
  return `I grew a ${s.height} m tree in Forkwood 🌳 (tree ${s.hash} · ${s.commits} commits · ${s.merges} merges${daily ? ` · daily ${dailyLabel()}` : ''}). Same course, can you beat it? ${challengeUrl()}`;
}

// ------------------------------------------------------------------ input
function worldX(clientX) {
  const sc = cam.scale;
  return (clientX - (renderer.cw / 2 - cam.x * sc)) / sc;
}

function toggleFork() { if (mode === 'play' && !paused) input.toggle = true; }

// Mouse steers absolutely (the tip follows the cursor). Touch steers relatively:
// drag anywhere and the tip moves with your finger, so a tap to fork never yanks
// the branch toward the tap point and your thumb never has to cover the tip.
const TOUCH_GAIN = 1.5;
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  input.kind = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  if (mode === 'title') { startRun(false); return; }
  else if (mode === 'play' && paused) { resume(); return; }
  input.pointerId = e.pointerId; input.downT = performance.now(); input.downX = e.clientX; input.downY = e.clientY; input.moved = 0;
  if (e.pointerType === 'mouse') input.targetX = worldX(e.clientX);
  else input.anchor = input.targetX ?? (sim ? sim.cx : W / 2);
  if (e.pointerType === 'mouse' && mode === 'play' && e.button === 0) toggleFork();
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    if (input.dir !== 0) return;
    if (input.kind === 'key' && Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) < 3) return;
    input.kind = 'mouse';
    input.targetX = worldX(e.clientX);
  } else if (e.pointerId === input.pointerId) {
    input.targetX = Math.max(0, Math.min(W, input.anchor + ((e.clientX - input.downX) / cam.scale) * TOUCH_GAIN));
    input.moved = Math.max(input.moved, Math.hypot(e.clientX - input.downX, e.clientY - input.downY));
  }
});
window.addEventListener('pointerup', (e) => {
  if (e.pointerId !== input.pointerId) return;
  if (e.pointerType !== 'mouse' && mode === 'play' && performance.now() - input.downT < 260 && input.moved < 16) toggleFork();
  input.pointerId = null;
});
window.addEventListener('pointercancel', () => { input.pointerId = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  if (e.repeat && (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W')) return;
  sound.unlock();
  if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', ' ', 'ArrowUp', 'w', 'W'].includes(k)) input.kind = 'key';
  if (k === 'm' || k === 'M') { toggleMute(); return; }
  if (k === 'r' || k === 'R') { startRun(daily && mode !== 'title'); return; }
  if (mode === 'title') { if (k === 'Enter' || k === ' ') startRun(false); else if (k === 'd' || k === 'D') startRun(true); return; }
  if (mode === 'over') { if (k === 'Enter' || k === ' ') startRun(daily); if (k === 'Escape') toMenu(); return; }
  if (k === 'p' || k === 'P' || k === 'Escape') { paused ? resume() : pause(); return; }
  if (paused) { if (k === ' ' || k === 'Enter') resume(); return; }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { input.keys.add('L'); input.targetX = null; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { input.keys.add('R'); input.targetX = null; }
  if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') toggleFork();
  input.dir = (input.keys.has('R') ? 1 : 0) - (input.keys.has('L') ? 1 : 0);
});
window.addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.keys.delete('L');
  if (k === 'ArrowRight' || k === 'd' || k === 'D') input.keys.delete('R');
  input.dir = (input.keys.has('R') ? 1 : 0) - (input.keys.has('L') ? 1 : 0);
});

function pause() {
  if (mode !== 'play' || paused || sim.dead) return;
  paused = true;
  $('pause').classList.add('show');
  sound.suspend();
}
function resume() {
  if (!paused) return;
  paused = false;
  $('pause').classList.remove('show');
  sound.resume();
  last = performance.now();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', () => { if (!BOT_MODE) pause(); });

function toggleMute() { sound.setMuted(!sound.muted); $('btn-mute').classList.toggle('muted', sound.muted); }
$('btn-mute').classList.toggle('muted', sound.muted);
$('btn-mute').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); toggleMute(); });
$('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); paused ? resume() : pause(); });
$('btn-play').addEventListener('click', (e) => { e.stopPropagation(); startRun(false); });
$('btn-daily').addEventListener('click', (e) => { e.stopPropagation(); startRun(true); });
$('btn-again').addEventListener('click', () => startRun(daily));
$('btn-menu').addEventListener('click', toMenu);
$('btn-menu-p').addEventListener('click', toMenu);
$('btn-calm').addEventListener('click', (e) => { e.stopPropagation(); calm = !isCalm(); store.set('forkwood.calm', calm); refreshTitle(); });
$('btn-challenge').addEventListener('click', async () => {
  if (!lastSum) return;
  const url = challengeUrl();
  let ok = false;
  try { await navigator.clipboard.writeText(`Beat my ${lastSum.height} m tree in Forkwood 🌳 ${url}`); ok = true; } catch { /* ignore */ }
  $('share-msg').textContent = ok ? 'Challenge link copied: same course, beat my height.' : url;
});
$('btn-resume').addEventListener('click', resume);
$('pause').addEventListener('pointerdown', (e) => { if (e.target === $('pause')) resume(); });
$('btn-save').addEventListener('click', () => {
  if (!cardCanvas) return;
  downloadCard(cardCanvas, `forkwood-${lastSum.hash}-${lastSum.height}m.png`);
  $('share-msg').textContent = 'Saved your tree as a PNG.';
});
$('btn-share').addEventListener('click', async () => {
  if (!cardCanvas) return;
  const r = await shareCard(cardCanvas, shareText(), `forkwood-${lastSum.hash}.png`);
  let copiedText = false;
  if (r !== 'shared' && r !== 'cancelled') {
    try { if (r !== 'copied') { await navigator.clipboard.writeText(shareText()); copiedText = true; } } catch { /* ignore */ }
  }
  $('share-msg').textContent = { shared: 'Shared!', copied: 'Image copied: paste it into your post.', downloaded: copiedText ? 'Image saved and caption copied.' : 'Image saved.', cancelled: '', failed: 'Could not share on this browser.' }[r] || '';
});
// title screen: clicking empty space starts the game too
$('title').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  sound.unlock();
  startRun(false);
});

window.addEventListener('resize', () => { renderer.resize(); });

// ------------------------------------------------------------------ loop
/** One gameplay tick: coach slow-mo + hit-stop, then the sim and its events. */
function playTick(dt, inp) {
  const want = updateCoach(sim, dt);
  timeScale += (want - timeScale) * Math.min(1, dt * (want < timeScale ? 10 : 4));
  let sdt = dt * timeScale;
  if (fx.hitStop > 0) { fx.hitStop -= dt; sdt = 0; }
  if (inp.toggle) sdt = Math.max(sdt, 1 / 240); // never swallow a tap during a freeze
  step(sim, sdt, inp);
  handleEvents(sim, false);
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsVal = 60, frameMs = 0;

function frame(nowMs) {
  const t0 = performance.now();
  let dt = (nowMs - last) / 1000;
  last = nowMs;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 1 / 30);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { fpsVal = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  const base = renderer.baseScale();
  if (mode === 'title') {
    const inp = botInput(bot, sim);
    step(sim, dt, inp);
    handleEvents(sim, true);
    if (sim.dead || sim.t > 70) startDemo();
    cam.scale += (base * 0.92 - cam.scale) * Math.min(1, dt * 3);
    cam.anchor = 0.72;
    cam.y += (sim.cy - cam.y) * Math.min(1, dt * 4);
  } else if (mode === 'play' && !paused) {
    let inp;
    if (BOT_MODE) inp = botInput(bot, sim);
    else inp = { targetX: input.dir !== 0 ? null : input.targetX, dir: input.dir, toggle: input.toggle };
    input.toggle = false;
    playTick(dt, inp);
    sound.setFrost(sim.inFrost && !sim.dead);
    sound.update(Math.min(1, heightM(sim) / 600) * 0.8 + (sim.mult / 8) * 0.2, sim.mult);
    if (!sim.dead) {
      cam.scale += (base * (1 + (cam.punch || 0)) - cam.scale) * Math.min(1, dt * 4);
      cam.anchor += (0.7 - cam.anchor) * Math.min(1, dt * 4);
      cam.y += (sim.cy - cam.y) * Math.min(1, dt * 9);
    } else {
      // gentle pull-back that shows off the tree before the card appears
      cam.scale += (base * 0.42 - cam.scale) * Math.min(1, dt * 2.2);
      cam.anchor += (0.32 - cam.anchor) * Math.min(1, dt * 2.2);
      cam.y += (sim.cy - cam.y) * Math.min(1, dt * 3);
      if (sim.deathT > 1.1 && !deathShown) showGameOver();
    }
  } else if (mode === 'over') {
    step(sim, dt, {});
    cam.scale += (base * 0.42 - cam.scale) * Math.min(1, dt * 2);
    cam.anchor += (0.32 - cam.anchor) * Math.min(1, dt * 2);
  }
  if (!paused) updateFx(dt);
  renderer.draw(sim, cam, fx, {
    hud: mode === 'play',
    hints: false,
    coach: coachView(sim),
    bestM: mode === 'title' ? 0 : sim.bestM,
    bestLabel: CHALLENGE && !daily ? 'FRIEND' : 'BEST',
    daily,
    reveal: false,
    calm: isCalm(),
  });
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
  requestAnimationFrame(frame);
}

// testing hooks (used by tests/smoke.mjs)
window.forkwood = {
  get mode() { return mode; },
  get paused() { return paused; },
  get sim() { return sim; },
  get fps() { return fpsVal; },
  get frameMs() { return frameMs; },
  get coach() { return coach.step; },
  get timeScale() { return timeScale; },
  get banner() { return fx.banner; },
  get layout() { return renderer.layout; },
  summary: () => sim && summary(sim),
  start: (d = false) => startRun(d),
  setBotSkill: (k) => { botSkill = k; },
  killNow: () => { if (sim) sim.sap = 0.001; },
  // play N seconds through the real gameplay path (coach, hit-stop, events) synchronously
  advance: (sec, inp = {}) => {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n && mode === 'play' && !sim.dead; i++) {
      playTick(1 / 60, inp === 'bot' ? botInput(bot, sim) : { ...inp, toggle: i === 0 && !!inp.toggle });
      updateFx(1 / 60);
      cam.y += (sim.cy - cam.y) * 0.15;
    }
    return { coach: coach.step, timeScale, m: heightM(sim), tips: sim.tips.length, merges: sim.merges };
  },
  // simulate ahead synchronously with the bot (for screenshots of late stages)
  fastForward: (sec, skill = 0.95) => {
    const b = createBot(skill, 99);
    const n = Math.round(sec * 60);
    for (let i = 0; i < n && !sim.dead; i++) { step(sim, 1 / 60, botInput(b, sim)); sim.sap = Math.max(sim.sap, 60); }
    cam.y = sim.cy; fx.shownScore = sim.score;
    return heightM(sim);
  },
};

startDemo();
setMode('title');
refreshTitle();
requestAnimationFrame((t) => { last = t; frame(t); });
