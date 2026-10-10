// Forkwood: game glue (input, camera, effects, UI, persistence).
import { createSim, step, summary, heightM, W, PX_PER_M, STAGES, SAP_MAX, CHARMS } from './sim.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { createBot, botInput } from './bot.js';
import { renderCard, shareCard, downloadCard } from './share.js';
import { dailySeed, dailyLabel } from './rng.js';
import * as M from './meta.js';
import { applyLoadout } from './skins.js';
import { createMetaUI } from './ui-meta.js';

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

// one save object for everything (meta.js migrates the first build's keys)
let S = M.loadSave((k) => store.get(k, null));
const persist = (apply = true) => { if (!BOT_MODE) store.set(M.SAVE_KEY, S); if (apply) applyLoadout(S.loadout); };
persist();
const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const isCalm = () => (S.calm == null ? !!(motionQuery && motionQuery.matches) : S.calm);

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
let autoplay = false; // trailer capture: the bot plays a normal (saved) run in real time

const cam = { x: W / 2, y: -200, scale: 1, anchor: 0.7, trauma: 0, punch: 0 };
const fx = { particles: [], floaters: [], sparks: [], flash: 0, flashColor: '255,80,80', banner: null, shownScore: 0, shownSap: SAP_MAX, multPulse: 0, sapPulse: 0, squash: 0, hitStop: 0 };
const input = { targetX: null, dir: 0, toggle: false, keys: new Set(), pointerId: null, downT: 0, downX: 0, downY: 0, moved: 0, anchor: W / 2, kind: window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse' };
// first-run coach: steer -> fork -> merge, taught by doing (screen-space, never overlaps the world)
const coach = { step: null, t: 0, collects: 0, retry: false, slow: false };
const ui = createMetaUI({ getSave: () => S, persist, sound, isCalm, onOpen: () => { $('title').classList.remove('show'); }, onClose: () => { if (mode === 'title') { $('title').classList.add('show'); refreshTitle(); } else ui.refreshBar(mode); } });
let timeScale = 1;
const TREETOP_IDX = STAGES.findIndex((st) => st.name === 'Treetop');

function setMode(m) {
  mode = m;
  document.body.className = 'state-' + m + (isCalm() ? ' calm' : '');
  $('title').classList.toggle('show', m === 'title');
  $('over').classList.toggle('show', m === 'over');
  $('pause').classList.remove('show');
  paused = false;
  if (m !== 'title') ui.hide();
  ui.refreshBar(m);
}

function startDemo() {
  sim = createSim({ seed: (Math.random() * 1e9) | 0, demo: true });
  bot = createBot(0.85, (Math.random() * 1000) | 0);
  cam.y = sim.cy - 120;
  resetFx();
}

function resetFx() {
  fx.particles.length = 0; fx.floaters.length = 0; fx.sparks.length = 0; fx.flash = 0; fx.banner = null; fx.multPulse = 0; fx.sapPulse = 0; fx.squash = 0;
  fx.shownScore = 0; fx.shownSap = SAP_MAX; fx.hitStop = 0; cam.trauma = 0; cam.punch = 0; fx.plate = null;
}

function startRun(isDaily = daily) {
  sound.unlock();
  daily = isDaily;
  const seed = daily ? dailySeed() : FIXED_SEED ?? ((Math.random() * 1e9) >>> 0);
  const bestM = daily ? store.get('forkwood.daily.' + dailySeed(), { height: 0 }).height : CHALLENGE ? CHALLENGE.m : S.best.height;
  const pure = daily || !!CHALLENGE; // daily tree and challenge links: same rules for everyone, no charms
  sim = createSim({ seed, tutorial: !S.tutorial, bestM, pure, charm: pure ? null : S.charm });
  coach.step = sim.tutorial ? 'steer' : null; coach.t = 0; coach.collects = 0; coach.retry = false; coach.slow = false;
  timeScale = 1;
  bot = createBot(botSkill, seed & 0xffff);
  cam.y = sim.cy - 60; cam.scale = renderer.baseScale() * (isCalm() ? 1 : 0.86); cam.anchor = 0.7;
  resetFx();
  deathShown = false;
  input.toggle = false;
  setMode('play');
  sound.setStage(0);
  sound.start();
  sound.sprout();
  // opening beat: the seed bursts out of the soil
  ring(W / 2, -4, '#a9cf5a', 120, 0.8); ring(W / 2, -4, '#f4ecd8', 70, 0.5);
  burst(W / 2, -6, 16, '#8fb14a', 260, 9, 1.3, 'leaf'); burst(W / 2, -6, 8, '#c4e88a', 200, 7, 1.1, 'leaf');
  burst(W / 2, -10, 10, '#ffe08a', 240, 8, 0.7, 'spark');
  shake(5); fx.squash = 1;
  if (!sim.tutorial) {
    const goal = CHALLENGE && !daily ? { text: `BEAT ${CHALLENGE.m} m`, sub: 'same course as your friend' }
      : daily ? { text: bestM > 0 ? `BEAT ${bestM} m` : 'DAILY TREE', sub: `${dailyLabel()} · same course for all · no charms` }
      : S.best.height < STAGES[TREETOP_IDX].m ? { text: 'REACH THE TREETOP', sub: `${STAGES[TREETOP_IDX].m} m · fork, merge, climb` }
      : { text: `BEAT ${S.best.height} m`, sub: sim.charm ? `your best · ${CHARMS[sim.charm].name} charm ready to charge` : 'your best · gold line' };
    fx.banner = { ...goal, t: 0, max: 2.2, small: true };
  }
}

function toMenu() {
  sound.stop();
  if (sound.ready) sound.startMenu();
  setMode('title');
  refreshTitle();
  startDemo();
}

function refreshTitle() {
  const bits = [];
  if (S.best.score > 0) bits.push(`best ${S.best.height} m · ${S.best.score.toLocaleString('en-US')} pts`);
  if (S.stats.runs > 0) bits.push(`${S.stats.runs} run${S.stats.runs === 1 ? '' : 's'}`);
  if (S.stats.treetops > 0) bits.push(`treetop ×${S.stats.treetops}`);
  ui.refreshBar(mode);
  $('title-best').textContent = bits.join(' · ');
  $('btn-calm').querySelector('.lbl').textContent = `Calm mode: ${isCalm() ? 'on' : 'off'}`;
  document.body.classList.toggle('calm', isCalm());
  $('btn-calm').setAttribute('aria-pressed', String(isCalm()));
  if (CHALLENGE) {
    $('challenge').hidden = false;
    $('challenge').textContent = `A friend grew ${CHALLENGE.m} m on this course. Can you beat it?`;
    $('btn-play-label').textContent = 'Take the challenge';
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
function floater(x, y, text, color = '#f4ecd8', size = 20, life = 0.9) {
  fx.floaters.push({ x: Math.max(60, Math.min(W - 60, x)), y, text, color, size, life, max: life, vy: -70, rot: size >= 26 ? (Math.random() - 0.5) * 0.12 : 0 });
  if (fx.floaters.length > 24) fx.floaters.shift();
}
// trauma-based shake (Eiserloh, GDC 2016): events add trauma, shake = trauma^2 with smooth noise
function shake(a) { if (!isCalm()) cam.trauma = Math.min(1, cam.trauma + a / 26); }
function spark(x, y) { fx.sparks.push({ wx: x, wy: y, t: 0, max: 0.42 + Math.random() * 0.12 }); if (fx.sparks.length > 24) fx.sparks.shift(); }
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
  if (!coach.step || mode !== 'play' || s.dead) return null;
  const tap = input.kind === 'touch' ? 'TAP' : input.kind === 'key' ? 'SPACE' : 'CLICK';
  const steer = input.kind === 'touch' ? 'Drag anywhere to steer' : input.kind === 'key' ? '← → to steer' : 'Move the mouse to steer';
  switch (coach.step) {
    case 'steer': return { title: steer, sub: 'Catch sunlight to refill your sap', n: 1 };
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
  if (!coach.step || s.dead) return 1;
  coach.t += dt;
  const y = s.cy;
  if (coach.step === 'steer' && s.brambles.some((b) => b.kind === 'split' && b.y < y && b.y > y - 520)) { coach.step = 'fork'; coach.t = 0; }
  if (coach.step === 'fork' && !s.forked && s.brambles.some((b) => b.kind === 'split' && b.y < y && b.y > y - 300)) coach.slow = true;
  if (coach.step === 'merge' && s.forked && s.brambles.some((b) => b.kind === 'gate' && b.y < y && b.y > y - 340)) coach.slow = true;
  if (coach.step === 'praise' && coach.t > 3.4) {
    coach.step = null;
    if (!BOT_MODE) { S.tutorial = true; persist(false); }
  }
  return coach.slow ? 0.22 : 1;
}

function handleEvents(s, quiet) {
  for (const e of s.events) {
    switch (e.type) {
      case 'collect':
        if (!quiet) coachEvent('collect', e, s);
        burst(e.x, e.y, 6, '#ffe08a', 170, 7, 0.45, 'spark');
        if (!quiet) { sound.collect(e.chain, e.forked); spark(e.x, e.y); floater(e.x + (e.chain % 2 ? 26 : -26), e.y - 10, `+${e.pts}`, '#fbe3a4', 15 + Math.min(7, e.chain), 0.6); }
        break;
      case 'fork':
        for (const t of s.tips) { ring(t.x, s.cy, '#8fd0e6', 50); burst(t.x, s.cy, 5, '#a9cf5a', 130, 6, 0.6, 'leaf'); }
        if (!quiet && coach.step && coach.step !== 'merge') { hitStop(0.08); flash('159,232,255', 0.35); floater(e.x, e.y - 76, 'forked!', '#8fd0e6', 34, 1.1); }
        if (!quiet) { coachEvent('fork', e, s); sound.fork(); fx.squash = 1; floater(e.x, e.y - 40, 'fork', '#8fd0e6', 18, 0.6); shake(3); cam.punch = 0.035; }
        break;
      case 'merge':
        ring(e.x, e.y, '#f2b33d', 110 + e.mult * 8, 0.7); ring(e.x, e.y, '#f4ecd8', 60, 0.45);
        burst(e.x, e.y, 12 + e.mult * 2, '#ffe08a', 280, 9, 0.7, 'spark');
        burst(e.x, e.y, 10, STAGES[s.stageIdx].leaf, 200, 7, 1.2, 'leaf');
        if (!quiet) {
          coachEvent('merge', e, s);
          sound.merge(e.mult); shake(5 + e.mult); flash('255,215,106', 0.4); fx.multPulse = 1; fx.squash = 1; vibrate(25);
          hitStop(0.04 + 0.006 * e.mult); cam.punch = 0.05 + 0.01 * e.mult;
          floater(e.x, e.y - 50, `merge ×${e.mult}`, '#f2b33d', 28 + e.mult * 2, 1.2);
          floater(e.x, e.y - 18, `+${e.bonus}`, '#f4ecd8', 20, 1.0);
        }
        break;
      case 'emptymerge':
        if (!quiet) { coachEvent('emptymerge', e, s); sound.emptyMerge(); floater(e.x, e.y - 34, 'merged, no commits', '#e8dcc0', 14, 0.7); }
        break;
      case 'revert':
        burst(e.x, e.y, 10, '#e2603f', 220, 7, 0.8, 'leaf');
        if (!quiet) { coachEvent('revert', e, s); hitStop(0.07); sound.revert(); shake(9); flash('255,70,70', 0.6); vibrate(60); floater(e.x, e.y - 30, e.lost ? `reverted −${e.lost}` : 'reverted', '#ff9a86', 24, 1.0); }
        break;
      case 'hit':
        burst(e.x, e.y, 10, '#6b4429', 200, 4, 0.7);
        burst(e.x, e.y, 6, STAGES[s.stageIdx].leaf, 160, 7, 1.2, 'leaf');
        if (!quiet) { hitStop(0.09); sound.hit(); shake(12); flash('255,60,60', 0.8); vibrate(70); floater(e.x, e.y - 30, `−${e.dmg} sap`, '#ff9a86', 22, 0.9); }
        break;
      case 'near':
        if (!quiet) { sound.near(); floater(e.x, e.y - 20, `close +${e.bonus}`, '#c4e88a', 17, 0.8); }
        break;
      case 'splitpass':
        ring(e.x, e.y, '#a9cf5a', 90, 0.6);
        if (!quiet) { sound.collect(8, true); floater(e.x, e.y - 40, `both lanes +${e.bonus}`, '#c4e88a', 20, 1.0); }
        break;
      case 'bloom':
        ring(e.x, e.y, '#f7b6c8', 80, 0.6);
        burst(e.x, e.y, 12, '#f7b6c8', 230, 7, 1.1, 'leaf');
        burst(e.x, e.y, 5, '#fff4ec', 180, 6, 1.0, 'leaf');
        if (!quiet) { sound.bloom(e.n); shake(2); floater(e.x, e.y - 44, `full bloom +${e.bonus}`, '#f7b6c8', 22, 1.1); }
        break;
      case 'golden':
        ring(e.x, e.y, '#f2b33d', 220, 0.9); ring(e.x, e.y, '#f4ecd8', 140, 0.7);
        burst(e.x, e.y, 30, '#ffe08a', 420, 10, 1.1, 'spark');
        if (!quiet) { sound.goldenStart(); flash('255,205,90', 0.7); shake(10); vibrate(60); hitStop(0.09); fx.banner = { text: 'GOLDEN HOUR', sub: 'sunlight comes to you · double points', t: 0, max: 2.6, gold: true }; }
        break;
      case 'goldenend':
        if (!quiet) { sound.goldenEnd(); floater(s.cx, s.cy - 50, 'dusk · ×4', '#f2b33d', 20, 1.0); }
        break;
      case 'dew':
        burst(e.x, e.y, 12, '#9fd6ef', 180, 4, 0.7); ring(e.x, e.y, '#78bfe0', 60);
        if (!quiet) { sound.dew(); floater(e.x, e.y - 20, '+30 sap', '#cdeaf7', 18, 0.9); }
        break;
      case 'shield':
        ring(e.x, e.y, '#c98a4a', 70);
        if (!quiet) { sound.shield(); floater(e.x, e.y - 20, 'bark shield', '#e9b77e', 18, 0.9); }
        break;
      case 'shieldbreak':
        burst(e.x, e.y, 10, '#c98a4a', 200, 6, 0.6, 'leaf');
        if (!quiet) { sound.shieldBreak(); shake(5); floater(e.x, e.y - 24, 'blocked', '#e9b77e', 20, 0.8); }
        break;
      case 'stage': {
        const st = STAGES[e.idx];
        sound.setStage(e.idx);
        if (!quiet && !isCalm()) fx.plate = { t: 0, color: STAGES[e.idx].sky };
        if (!quiet && e.idx === TREETOP_IDX) {
          sound.stageUp(); sound.newBest();
          fx.banner = { text: 'Treetop', sub: 'you grew a whole tree · now reach the stars', t: 0, max: 3.4, gold: true };
          flash('255,215,106', 0.6); shake(8); vibrate(80);
          for (let k = 0; k < 5; k++) burst(s.cx + (k - 2) * 70, s.cy - 80 - k * 20, 12, STAGES[e.idx].leaf, 340, 8, 1.8, 'leaf');
          burst(s.cx, s.cy - 60, 26, '#ffe08a', 420, 10, 1.0, 'spark');
        } else if (!quiet) { sound.stageUp(); fx.banner = { text: st.name, sub: `${st.m} m · +15 sap`, t: 0, max: 2.4 }; }
        break;
      }
      case 'acorn':
        burst(e.x, e.y, 5, '#d99a52', 150, 6, 0.5, 'leaf');
        if (!quiet) { sound.acorn(e.n); fx.acornPulse = 1; floater(e.x, e.y - 16, '+1 acorn', '#f3cf8e', 15, 0.7); }
        break;
      case 'charged':
        if (!quiet) { sound.charged(); floater(s.cx, s.cy - 70, `${CHARMS[e.charm].name} ready`, '#ffe08a', 19, 1.1); }
        break;
      case 'charm': {
        const col = { ward: '#c98a4a', sun: '#f2b33d', roots: '#78bfe0', still: '#cfe6ff' }[e.charm];
        ring(e.x, e.y, col, 140, 0.7); ring(e.x, e.y, '#f4ecd8', 90, 0.5);
        burst(e.x, e.y, 16, col, 260, 8, 0.8, e.charm === 'sun' ? 'spark' : 'leaf');
        if (!quiet) {
          sound.charm(e.charm); shake(4); hitStop(0.05); vibrate(30);
          flash(e.charm === 'still' ? '200,230,255' : e.charm === 'roots' ? '150,210,240' : '255,215,106', 0.35);
          floater(e.x, e.y - 60, { ward: 'bark ward', sun: 'sun call', roots: '+25 sap · combo −2', still: 'stillness' }[e.charm], col, 24, 1.1);
        }
        break;
      }
      case 'newbest':
        if (!quiet) { sound.newBest(); floater(s.cx, s.cy - 60, CHALLENGE && !daily ? 'friend beaten' : 'new best', '#f2b33d', 28, 1.4); flash('255,215,106', 0.35); }
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
  cam.trauma = Math.max(0, cam.trauma - dt * 1.5);
  for (const sp of fx.sparks) sp.t += dt;
  if (fx.sparks.length && fx.sparks[0].t >= fx.sparks[0].max) { fx.sparks = fx.sparks.filter((sp) => sp.t < sp.max); fx.sapPulse = 1; }
  fx.sapPulse = Math.max(0, fx.sapPulse - dt * 4);
  fx.squash = Math.max(0, fx.squash - dt * 5);
  fx.acornPulse = Math.max(0, (fx.acornPulse || 0) - dt * 4);
  cam.punch = Math.max(0, (cam.punch || 0) - dt * 0.25);
  if (fx.banner) { fx.banner.t += dt; if (fx.banner.t > fx.banner.max) fx.banner = null; }
  if (fx.plate) { fx.plate.t += dt; if (fx.plate.t > 1.3) fx.plate = null; }
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
  const prevBest = S.best.height;
  let rewards = null;
  const before = S.acorns;
  if (!BOT_MODE) {
    const challengeWon = !!(CHALLENGE && !daily && sum.height > CHALLENGE.m);
    rewards = M.finishRun(S, sum, { daily, challengeWon });
    newBest = rewards.bestScore;
    persist();
    if (daily) {
      const key = 'forkwood.daily.' + dailySeed();
      const d = store.get(key, { score: 0, height: 0 });
      if (sum.score > d.score) { store.set(key, { score: sum.score, height: Math.max(d.height, sum.height) }); newBest = true; }
    }
  }
  const url = location.host ? (location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '') : 'Forkwood';
  const challenge = CHALLENGE && !daily ? { m: CHALLENGE.m, won: sum.height > CHALLENGE.m } : null;
  try {
    cardCanvas = renderCard(sim, sum, { daily, dailyLabel: dailyLabel(), newBest, url, seed: sim.seed, challenge, level: S.level, printNo: Math.max(1, S.stats.runs) });
    $('card-img').src = cardCanvas.toDataURL('image/png');
  } catch (e) {
    console.warn('card render failed', e && e.stack || e);
  }
  const toGo = STAGES[TREETOP_IDX].m - sum.height;
  $('over-kicker').textContent = challenge ? (challenge.won ? `★ CHALLENGE BEATEN (${challenge.m} m)` : `CHALLENGE: ${challenge.m - sum.height + 1} m short`)
    : newBest ? '★ NEW BEST' : daily ? `DAILY TREE · ${dailyLabel()}` : `reached ${sum.stage.toUpperCase()}`;
  $('over-tip').textContent = toGo > 0 ? `${toGo} m to the Treetop. ${runTip(sum)}`
    : (sum.height > prevBest && prevBest >= STAGES[TREETOP_IDX].m) ? 'Above the treetop and climbing. Stars next.' : runTip(sum);
  countUp(sum.height);
  $('over-kicker').classList.toggle('gold', !!(newBest || (challenge && challenge.won)));
  $('over-score').textContent = `${sum.score.toLocaleString('en-US')} pts · best ${Math.max(S.best.score, sum.score).toLocaleString('en-US')}`;
  $('over-hash').textContent = `tree ${sum.hash} · ${sum.commits} commits · ${sum.merges} merges · ${sum.reverts} reverts · max ×${sum.maxMult}`;
  $('share-msg').textContent = '';
  setMode('over');
  ui.showRewards(rewards, { before });
  if (input.kind !== 'touch') $('btn-again').focus({ preventScroll: true });
}

let countRaf = 0;
function countUp(target) {
  // the height counts up with soft ticks, then settles (instant in calm mode)
  const el = $('over-height');
  cancelAnimationFrame(countRaf);
  const set = (v) => { el.innerHTML = `${v}<small>m</small>`; };
  if (isCalm() || BOT_MODE || target < 2) { set(target); return; }
  const t0 = performance.now(), dur = Math.min(1100, 380 + target * 2);
  let lastTick = -1;
  const stepFn = (now) => {
    const k = Math.min(1, (now - t0) / dur), v = Math.round(target * (1 - Math.pow(1 - k, 3)));
    set(v);
    const tick = Math.floor(v / Math.max(1, Math.round(target / 14)));
    if (tick !== lastTick) { lastTick = tick; sound.tick(tick); }
    if (k < 1) countRaf = requestAnimationFrame(stepFn);
  };
  set(0);
  countRaf = requestAnimationFrame(stepFn);
}

function runTip(sum) {
  if (sum.merges === 0) return 'Tip: fork, grab sunlight on both branches, then merge for a combo.';
  if (sum.reverts >= 2) return 'Tip: merge before thorn gates. A hit on a fork reverts that branch.';
  if (sum.maxMult < 4) return 'Tip: merge often. Every merge raises the multiplier, and ×8 starts golden hour.';
  if (sum.blooms === 0) return 'Tip: catch every sunlight in a trail and that branch bursts into full bloom.';
  return 'Tip: split gates reward forked trees with a both-lanes bonus.';
}

function challengeUrl() {
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'Forkwood';
  return `${base}?seed=${sim.seed}&beat=${lastSum.height}`;
}

function shareText() {
  const s = lastSum;
  return `I grew a ${s.height} m tree in Forkwood (tree ${s.hash} · ${s.commits} commits · ${s.merges} merges${daily ? ` · daily ${dailyLabel()}` : ''}). Same course, can you beat it? ${challengeUrl()}`;
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
  const cz = renderer.layout.charm;
  if (mode === 'play' && cz && Math.hypot(e.clientX - cz.x, e.clientY - cz.y) < cz.r) { input.charm = true; return; }
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
  if (ui.isOpen) { if (k === 'Escape') ui.hide(); return; }
  if (k === 'm' || k === 'M') { toggleMute(); return; }
  if (k === 'r' || k === 'R') { startRun(daily && mode !== 'title'); return; }
  if (mode === 'title') { if (k === 'Enter' || k === ' ') startRun(false); else if (k === 'd' || k === 'D') startRun(true); return; }
  if (mode === 'over') { if (k === 'Enter' || k === ' ') startRun(daily); if (k === 'Escape') toMenu(); return; }
  if (k === 'p' || k === 'P' || k === 'Escape') { paused ? resume() : pause(); return; }
  if (paused) { if (k === ' ' || k === 'Enter') resume(); return; }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { input.keys.add('L'); input.targetX = null; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { input.keys.add('R'); input.targetX = null; }
  if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') toggleFork();
  if (k === 'e' || k === 'E' || k === 'Shift' || k === 'q' || k === 'Q') input.charm = true;
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
$('btn-calm').addEventListener('click', (e) => { e.stopPropagation(); S.calm = !isCalm(); persist(false); sound.unlock(); sound.toggle(); refreshTitle(); });
$('btn-challenge').addEventListener('click', async () => {
  if (!lastSum) return;
  const url = challengeUrl();
  let ok = false;
  try { await navigator.clipboard.writeText(`Beat my ${lastSum.height} m tree in Forkwood: ${url}`); ok = true; } catch { /* ignore */ }
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
// iOS only unlocks WebAudio inside touchend/click, so listen there as well
for (const ev of ['touchend', 'click']) window.addEventListener(ev, () => sound.unlock(), { capture: true, passive: true });
// a soft click on every menu button
document.querySelectorAll('.btn, .icon').forEach((b) => b.addEventListener('pointerdown', () => { sound.unlock(); sound.click(); }));

// ------------------------------------------------------------------ loop
/** One gameplay tick: coach slow-mo + hit-stop, then the sim and its events. */
function playTick(dt, inp) {
  const want = updateCoach(sim, dt);
  timeScale += (want - timeScale) * Math.min(1, dt * (want < timeScale ? 10 : 4));
  let sdt = dt * timeScale;
  if (fx.hitStop > 0) { fx.hitStop -= dt; sdt = 0; }
  if (inp.toggle || inp.charm) sdt = Math.max(sdt, 1 / 240); // never swallow a tap during a freeze
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
    if (sound.menu) sound.update(0, 1);
    cam.scale += (base * 0.92 - cam.scale) * Math.min(1, dt * 3);
    cam.anchor = 0.72;
    cam.y += (sim.cy - cam.y) * Math.min(1, dt * 4);
  } else if (mode === 'play' && !paused) {
    let inp;
    if (BOT_MODE || autoplay) inp = botInput(bot, sim);
    else inp = { targetX: input.dir !== 0 ? null : input.targetX, dir: input.dir, toggle: input.toggle, charm: input.charm };
    input.toggle = false; input.charm = false;
    playTick(dt, inp);
    sound.setFrost(sim.inFrost && !sim.dead);
    sound.setLowSap(sim.dead ? 1 : sim.sap / SAP_MAX);
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
    acornPulse: fx.acornPulse || 0,
    touch: input.kind === 'touch',
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
  get fx() { return fx; },
  get audio() { return { state: sound.ctx ? sound.ctx.state : 'none', sprite: !!sound.buf, muted: sound.muted, zzfx: Object.keys(sound.zz).length }; },
  get calm() { return isCalm(); },
  get cam() { return cam; },
  get layout() { return renderer.layout; },
  get save() { return S; },
  get meta() { return M; },
  get ui() { return ui; },
  reloadSave: () => { S = M.loadSave((k) => store.get(k, null)); persist(); refreshTitle(); return S; },
  charmNow: () => { input.charm = true; },
  setAutoplay: (v) => { autoplay = !!v; },
  // trailer capture only: start a golden hour as if a merge had reached ×8
  forceGolden: () => { if (!sim || sim.dead) return; sim.mult = 8; sim.maxMult = 8; sim.golden = 6; sim.goldens++; sim.events = [{ type: 'golden', x: sim.cx, y: sim.cy }]; handleEvents(sim, false); sim.events = []; },
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
// the print pull: the paper sheet lifts off the first frame (skipped in calm mode)
setTimeout(() => $('press').classList.add('done'), BOT_MODE || isCalm() ? 0 : 1400);
if (S.migrationBonus) { const n = S.migrationBonus; delete S.migrationBonus; persist(false); setTimeout(() => ui.toast(`Welcome back: +${n} acorns for the ${S.stats.meters.toLocaleString('en-US')} m you already grew`, 'gift'), 1600); }
requestAnimationFrame((t) => { last = t; frame(t); });
