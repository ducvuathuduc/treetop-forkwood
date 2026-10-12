// Forkwood: game glue (input, camera, effects, UI, persistence).
import { createSim, step, summary, heightM, W, PX_PER_M, STAGES, SAP_MAX, CHARMS, PICKUPS, GRAFTS, SYNERGIES } from './sim.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { createBot, botInput } from './bot.js';
// v1.0: the postcard renderer loads after boot (first-load budget); it is ready long before a run ends
let SHARE = null;
const loadShare = () => (SHARE ? Promise.resolve(SHARE) : import('./share.js').then((m) => (SHARE = m)));
setTimeout(() => { const go = () => loadShare().catch(() => {}); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else go(); }, 2000); // v1.0.1 PERF: idle prefetch
import { dailySeed, dailyLabel } from './rng.js';
import * as M from './meta.js';
import { applyLoadout, SKIN } from './skins.js';
import { createMetaUI } from './ui-meta.js';
import { MODE, STAKE, STAKES, rulesFor, stakeOf, weekKey, weekSeed, weekCode, parseWeek } from './modes.js';
import { LEVEL, LEVELS, levelRules, goalText, goalMet, nextLevel, worldOf } from './campaign.js';
import * as Q from './quest.js';
import { ICON } from './icons.js';
import { preloadArt } from './art.js';
import quality from './quality.js'; // v1.0.1 PERF
import * as R from './retention.js';
import * as Dir from './director.js'; // P6-TRAPS
import * as SEA from './seasons.js'; // P6-SEASONS
import { backdrop } from './backdrop.js'; // P6-ART x P6-SEASONS: season palette
import * as EC from './economy.js'; import { revive as reviveSim } from './sim.js'; import { createRevive, createMapBuy, armed as armedBoosts } from './ui-econ.js'; // P8-ECON
import { selectedId as mapId, maps as MAPS_API } from './maps.js'; // P8-MAPS
import { createMapsUI, loadCss } from './ui-maps.js'; // P8-MAPS
import { createHub } from './ui-hub.js'; // META-V2: museum hub, rooms, store
import { WORLD_IDS, worldForSeed } from './world-mech.js'; // V2-INT: world per run
let hub = null; // META-V2
const ICON_STAR = ICON.star, ICON_STAR_OFF = ICON.starOff;
// P6-SEASONS: the season clock is the player's local time. ?season=<ISO local time> pins it (tests,
// previews); automated browsers without ?season= get no seasons so older tests stay deterministic.
const SEASON_PIN = (() => { const v = new URLSearchParams(location.search).get('season'); if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; })();
const SEASON_T0 = Date.now();
const seasonClock = () => (SEASON_PIN ? new Date(SEASON_PIN.getTime() + (Date.now() - SEASON_T0)) : navigator.webdriver ? null : new Date());
const seasonNow = () => { const d = seasonClock(); return d ? SEA.active(d) : { list: [], theme: SEA.themeFor([]) }; };
let SEASON = seasonNow();
let runSeasons = []; // seasons whose gameplay modifiers are on in the current run
// /P6-SEASONS

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT_MODE = params.has('bot');           // let the bot play the real game (testing)
const FIXED_SEED = params.has('seed') ? (Number(params.get('seed')) >>> 0) : null;
// challenge links: ?seed=<course>&beat=<metres> ("beat my tree")
const BEAT = Math.max(1, Math.min(9999999, Math.floor(Number(params.get('beat')) || 0)));
const LINK_STAKE = STAKE[params.get('stake')] ? params.get('stake') : 'sapling';
const LINK_LVL = LEVEL[params.get('lvl')] ? params.get('lvl') : null;
const LINK_WEEK = parseWeek(params.get('week'));
const LINK_MODE = MODE[params.get('mode')] && params.get('mode') !== 'weekly' ? params.get('mode') : null;
// challenge links: ?seed=&beat=[&mode=&stake=] (a course), ?lvl=&beat= (a quest level's score), ?week=&beat= (this week's tree)
// duel links: ?duel=<code> (course + height + pace + avatar, checksummed; see retention.js)
const DUEL = params.has('duel') ? R.decodeDuel(params.get('duel')) : null;
const CHALLENGE = DUEL ? { seed: DUEL.seed, m: Math.max(1, DUEL.h), lvl: null, week: null, mode: MODE[DUEL.mode] && DUEL.mode !== 'weekly' ? DUEL.mode : 'classic', stake: STAKE[DUEL.stake] ? DUEL.stake : 'sapling', duel: DUEL }
  : params.has('beat') && (FIXED_SEED != null || LINK_LVL || LINK_WEEK)
  ? { seed: FIXED_SEED, m: BEAT, lvl: LINK_LVL, week: LINK_WEEK, mode: LINK_MODE || 'classic', stake: LINK_STAKE } : null;

// P6-RACE: live race links (?race=forkwood-<code>-<random>); ?rt=local|dead picks a test transport
const RACE_ROOM = params.get('race');
const RACE_RT = ['local', 'dead'].includes(params.get('rt')) ? params.get('rt') : 'peer';
let raceUI = null, raceLoading = null, raceSeed = null, raceRules = null;
// P6-RACE end
const canvas = $('game');
quality.init(); // v1.0.1 PERF: tier before the first resize
// v2 ENGINE: PixiJS WebGL layer under a transparent 2D overlay; ?gfx=2d (or ?renderer=canvas) forces Canvas2D.
// Automatic fallback to the full Canvas2D renderer if WebGL is missing, init fails or the context is lost.
const GFX = params.get('gfx') || params.get('renderer') || 'gl';
// Software-only WebGL (blocklisted GPU, SwiftShader) is slower than Canvas2D: by default it counts as
// "no WebGL" (failIfMajorPerformanceCaveat). An explicit ?gfx=gl opts into it (tests, perf harness).
const GL_SOFT_OK = params.has('gfx') || params.has('renderer');
const hasWebGL = (() => { try { const c = document.createElement('canvas'), o = { failIfMajorPerformanceCaveat: !GL_SOFT_OK }; return !!(c.getContext('webgl2', o) || c.getContext('webgl', o)); } catch { return false; } })();
const glWanted = !['2d', 'canvas', 'canvas2d'].includes(GFX) && hasWebGL;
const renderer = new Renderer(canvas, { overlay: glWanted });
if (glWanted) {
  import('./gfx/gl.js').then((m) => m.GLLayer.create(renderer, { webgpu: GFX === 'webgpu', allowSoftware: GL_SOFT_OK }))
    .then((gl) => { renderer.attachGL(gl); frozen = false; applySkin(); if (shownWorld && gl.worldId !== shownWorld) gl.setWorld(shownWorld); })
    .catch((e) => renderer.glFailed(String(e && e.message || e)));
} else renderer.layout.renderer = 'canvas2d';
quality.onChange(() => { renderer.resize(); if (renderer.gl) renderer.gl.resize(); frozen = false; applyLowMem(); });
// v1 painted plates are only needed by the Canvas2D renderer (fallback): skip them on the WebGL path
if (!glWanted) preloadArt(); else renderer.onFallback = () => preloadArt();
const sound = new Sound();
// V2-INT: which painted world is on screen. Free play climbs the world chosen on Home (or ?world=);
// fair modes (daily, weekly, quest, challenge, duel, race) use worldForSeed(seed) so everyone gets the
// same trap set. A gallery "try once" trial overrides the next free-play run only.
let trialWorld = null, shownWorld = null;
const WORLD_PARAM = WORLD_IDS.includes(params.get('world')) ? params.get('world') : null;
function selectedWorld() {
  if (WORLD_PARAM) return WORLD_PARAM;
  try { if (hub) return hub.currentWorld(); } catch { /* hub not ready */ }
  return EC.LEGACY_MAP_WORLD[MAPS_API.selectedId()] || 'meadow';
}
function showWorld(id) {
  if (!WORLD_IDS.includes(id)) id = 'meadow';
  if (renderer.gl && renderer.gl.worldId !== id) renderer.gl.setWorld(id); // GL may not be up yet: it reads currentWorld() on init
  import('./worlds.js').then((m) => m.setWorld(id)).catch(() => {});
  if (shownWorld !== id) { shownWorld = id; sound.music(id); }
}
// V2-INT: equipped vine skin (META store) wins over the world's default skin
const equippedSkin = () => (S && S.store && S.store.vineSkin) || null;
function applySkin() { const g = renderer.gl; if (g && g.setSkinOverride) g.setSkinOverride(equippedSkin()); }
const applyLowMem = () => { sound.lowMemory = quality.tier >= 3; };

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// one save object for everything (meta.js migrates the first build's keys)
let S = M.loadSave((k) => store.get(k, null));
// V2-INT fix: unlocks a grower already had before the quest block existed are marked seen once, so the
// first quest clear doesn't announce Zen, Sprint, Hardcore, Looking-glass, Weekly ... all at once
try { if (S && S.quest && !S.quest.primed) { Q.primeSeen(S); S.quest.primed = 1; } } catch { /* old save shape */ }
const persist = (apply = true) => { if (!BOT_MODE) store.set(M.SAVE_KEY, S); if (apply) applyLoadout(S.loadout); };
// session start: comeback gift, last week's league result, season rollover; a duel answer settles here
const SESSION = R.startSession(S);
const REPLY = DUEL && DUEL.r ? R.settleReply(S, DUEL) : null;
persist();
// first launch: the story plays, then the first run starts with no menu in between
// (automated browsers skip it unless the URL says ?intro=1, so headless tests stay on the title)
const FIRST_LAUNCH = !BOT_MODE && !CHALLENGE && !LINK_LVL && !LINK_WEEK && !LINK_MODE && S.stats.runs === 0 && !S.ret.introSeen && !params.has('race') /* P6-RACE */ && (!navigator.webdriver || params.get('intro') === '1');
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
// what is being played: endless (with a stake), a mode, a quest level or the weekly tree
let run = { mode: 'classic', stake: 'sapling', level: null, week: null };
let lastQuest = null;

const cam = { x: W / 2, y: -200, scale: 1, anchor: 0.7, trauma: 0, punch: 0 };
const fx = { particles: [], floaters: [], sparks: [], flash: 0, flashColor: '255,80,80', banner: null, shownScore: 0, shownSap: SAP_MAX, multPulse: 0, sapPulse: 0, squash: 0, hitStop: 0 };
const input = { targetX: null, dir: 0, toggle: false, keys: new Set(), pointerId: null, downT: 0, downX: 0, downY: 0, moved: 0, anchor: W / 2, kind: window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse' };
// first-run coach: steer -> fork -> merge, taught by doing (screen-space, never overlaps the world)
const coach = { step: null, t: 0, collects: 0, retry: false, slow: false };
const rv = createRevive({ getSave: () => S, sound, isCalm, ads: { allowed: () => !!hub && hub.adReady('revive'), watch: () => hub.rewarded('revive') } }); let reviveAsked = false; // P8-ECON, META-V2: ad continue
const ui = createMetaUI({ getSave: () => S, persist, sound, isCalm, onOpen: () => { $('title').classList.remove('show'); }, onClose: () => { if (mode === 'title') { $('title').classList.add('show'); refreshTitle(); } else ui.refreshBar(mode); } });
// the quest map UI loads on first open (keeps the first load small)
let questUI = null, questLoading = null;
function loadQuestUI() {
  if (questUI) return Promise.resolve(questUI);
  questLoading = questLoading || import('./ui-quest.js').then(({ createQuestUI }) => (questUI = createQuestUI({ getSave: () => S, persist, sound,
    onPlayLevel: (id) => startLevel(id), onPlayMode: (id) => startMode(id),
    onOpen: () => { $('title').classList.remove('show'); $('over').classList.remove('show'); ui.refreshBar('quest'); },
    onClose: () => { if (mode === 'title') { $('title').classList.add('show'); refreshTitle(); } else if (mode === 'over') { $('over').classList.add('show'); ui.refreshBar(mode); } } })));
  return questLoading;
}
const qui = {
  get isOpen() { return !!(questUI && questUI.isOpen); },
  hide() { if (questUI) questUI.hide(); },
  show(...a) { return loadQuestUI().then((q) => q.show(...a)); },
};
// the Grove (streak, season, league, duels, profile) loads on first open
let groveUI = null, groveLoading = null;
function loadGroveUI() {
  if (groveUI) return Promise.resolve(groveUI);
  groveLoading = groveLoading || import('./ui-grove.js').then(({ createGroveUI }) => {
    groveUI = createGroveUI({ getSave: () => S, persist, sound,
      onOpen: () => { $('title').classList.remove('show'); $('over').classList.remove('show'); ui.refreshBar('quest'); },
      onClose: () => { if (mode === 'title') { $('title').classList.add('show'); refreshTitle(); } else if (mode === 'over') { $('over').classList.add('show'); ui.refreshBar(mode); } },
      onStory: () => replayStory(), onShop: () => ui.show('shop'), onAvatar: () => refreshGroveChip() });
    groveUI.setAchNames((id) => (M.ACH[id] ? M.ACH[id].name : id));
    return groveUI;
  });
  return groveLoading;
}
const gui = {
  get isOpen() { return !!(groveUI && groveUI.isOpen); },
  hide() { if (groveUI) groveUI.hide(); },
  show(t) { return loadGroveUI().then((g) => g.show(t)); },
};
function refreshGroveChip() {
  const A = S.ret.avatar;
  $('av-chip').innerHTML = R.avatarHTML(A.portrait, A.frame, 30);
  $('streak-n').textContent = S.streak.count;
}
function replayStory() {
  import('./intro.js').then(({ playIntro }) => {
    $('title').classList.remove('show'); document.body.classList.add('intro-hold');
    playIntro({ calm: isCalm(), sound, onDone: () => { document.body.classList.remove('intro-hold'); if (mode === 'title') { $('title').classList.add('show'); refreshTitle(); } } });
  });
}
if (CHALLENGE) run = CHALLENGE.lvl ? { mode: 'classic', stake: 'sapling', level: CHALLENGE.lvl, week: null }
  : CHALLENGE.week ? { mode: 'weekly', stake: 'oak', level: null, week: CHALLENGE.week }
  : { mode: CHALLENGE.mode, stake: CHALLENGE.stake, level: null, week: null };
else if (LINK_LVL) run.level = LINK_LVL;
else if (LINK_WEEK) run = { mode: 'weekly', stake: 'oak', level: null, week: LINK_WEEK };
else if (LINK_MODE) run.mode = LINK_MODE;
run.stake = CHALLENGE ? run.stake : S.quest.stake;
let timeScale = 1;
let runDirector = null; // P6-TRAPS: director params of the current run (null = off)
let dirMode = 'classic'; // P6-TRAPS: mode name the director sees for this run
const TREETOP_IDX = STAGES.findIndex((st) => st.name === 'Treetop');

function setMode(m) {
  mode = m;
  document.body.className = 'state-' + m + (isCalm() ? ' calm' : '');
  $('title').classList.toggle('show', m === 'title');
  $('over').classList.toggle('show', m === 'over');
  $('pause').classList.remove('show');
  paused = false;
  if (m !== 'title') ui.hide();
  if (hub && m !== 'title') hub.closeRoom(); // META-V2
  ui.refreshBar(m);
  if (hub) hub.refresh(m); // META-V2
}

function startDemo() {
  const world = selectedWorld(); // V2-INT
  sim = createSim({ seed: (Math.random() * 1e9) | 0, demo: true, world });
  showWorld(world);
  bot = createBot(0.85, (Math.random() * 1000) | 0);
  cam.y = sim.cy - 120;
  resetFx();
}

function resetFx() {
  fx.particles.length = 0; fx.floaters.length = 0; fx.sparks.length = 0; fx.flash = 0; fx.banner = null; fx.multPulse = 0; fx.sapPulse = 0; fx.squash = 0;
  fx.shownScore = 0; fx.shownSap = SAP_MAX; fx.hitStop = 0; fx.slowmo = 0; cam.trauma = 0; cam.punch = 0; fx.plate = null;
}

/** What the HUD calls this run, e.g. "OAK", "SPRINT", "2-3 ZIG-ZAG". */
function runLabel() {
  if (daily) return 'DAILY';
  if (run.mode === 'race') return 'LIVE RACE'; // P6-RACE
  if (run.level) return `${run.level} ${LEVEL[run.level].name.toUpperCase()}`;
  if (run.mode === 'weekly') return `WEEKLY ${weekCode(run.week || weekKey()).slice(3)}`;
  if (run.mode !== 'classic') return MODE[run.mode].name.toUpperCase();
  return run.stake !== 'sapling' ? STAKE[run.stake].name.toUpperCase() : '';
}
function isChallengeRun() {
  if (!CHALLENGE || daily) return false;
  if (CHALLENGE.lvl) return run.level === CHALLENGE.lvl;
  if (CHALLENGE.week) return run.mode === 'weekly' && run.week === CHALLENGE.week;
  return !run.level && run.mode === CHALLENGE.mode && (run.mode !== 'classic' || run.stake === CHALLENGE.stake);
}
function bestFor() {
  if (daily) return store.get('forkwood.daily.' + dailySeed(), { height: 0 }).height;
  if (isChallengeRun() && !CHALLENGE.lvl) return CHALLENGE.m;
  if (run.level) return 0;
  if (run.mode === 'weekly') return (S.quest.weekly[run.week] || {}).h || 0;
  if (run.mode !== 'classic') return (S.quest.modeBest[run.mode] || {}).h || 0;
  return run.stake === 'sapling' ? S.best.height : (S.quest.stakeBest[run.stake] || 0);
}

function startLevel(id) { if (!LEVEL[id]) return; run = { ...run, level: id, mode: 'classic', week: null }; startRun(false); }
function startMode(id) {
  if (!MODE[id]) return;
  run = { ...run, level: null, mode: id, week: id === 'weekly' ? weekKey() : null, stake: id === 'classic' ? S.quest.stake : run.stake };
  startRun(false);
}

function startRun(isDaily = daily) {
  sound.unlock();
  daily = isDaily;
  if (qui.isOpen) qui.hide();
  const lv = run.level && !daily ? LEVEL[run.level] : null;
  const challenge = isChallengeRun();
  const seed = run.mode === 'race' && !daily ? raceSeed : daily ? dailySeed() : lv ? lv.seed : run.mode === 'weekly' ? weekSeed(run.week || weekKey()) : (challenge && CHALLENGE.seed != null) ? CHALLENGE.seed : FIXED_SEED ?? ((Math.random() * 1e9) >>> 0);
  const bestM = bestFor();
  // daily, weekly, quest levels and challenge links: same rules for everyone, no charms
  const pure = daily || challenge || !!lv || run.mode === 'weekly' || run.mode === 'race'; // P6-RACE: race = pure
  let rules = daily ? {} : lv ? levelRules(lv) : run.mode === 'race' ? { ...raceRules } : rulesFor(run);
  const isRace = !daily && (run.mode === 'race' || rules.mode === 'race'); // P6-RACE: race rules carry mode 'race'
  // P6-SEASONS: modifiers only in free play; daily / weekly / race / quest / challenge stay fair (tint only)
  SEASON = seasonNow();
  const seaFair = SEA.isFair({ daily, challenge, level: !!lv, mode: isRace ? 'race' : run.mode, race: isRace || !!run.race, pure }) || (!S.tutorial && !lv && run.mode === 'classic'); // first (tutorial) run stays plain
  rules = SEA.applyRules(rules, SEASON.list, { fair: seaFair });
  runSeasons = seaFair ? [] : SEASON.list;
  applySeasonLook();
  // /P6-SEASONS
  const tutorial = !S.tutorial && !lv && (daily || run.mode === 'classic');
  // P6-TRAPS: the hidden director only touches personal, unseeded runs
  dirMode = daily ? 'daily' : isRace ? 'race' : lv ? 'quest' : challenge ? (CHALLENGE.duel ? 'duel' : 'challenge') : run.mode === 'weekly' ? 'weekly' : FIXED_SEED != null ? 'seeded' : (BOT_MODE || autoplay) ? 'bot' : run.mode;
  const director = pure || isRace ? null : Dir.params(dirMode); // race: director always off
  runDirector = director;
  // P8-ECON: boosts, upgrades, grower multiplier, word-hunt letter (free play only)
  const econ = BOT_MODE || autoplay ? null : EC.runOptions(S, { pure, race: isRace, level: !!lv, tutorial }, armedBoosts(S));
  if (econ) { S.econ.armed = []; persist(false); }
  reviveAsked = false;
  // V2-INT: world (fair modes: one world per seed for everyone), critter skill and curses (free play only)
  const world = pure || isRace ? worldForSeed(seed) : (trialWorld || selectedWorld());
  trialWorld = null;
  const mech = BOT_MODE || autoplay ? null : EC.mechOptions(S, { pure, race: isRace, level: !!lv, tutorial });
  sim = createSim({ seed, tutorial, bestM, pure, charm: pure ? null : S.charm, rules, director, econ, world, ...(mech || {}) });
  showWorld(world);
  // /P8-ECON
  // /P6-TRAPS
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
    const m = MODE[run.mode], k = STAKE[run.stake];
    const goal = run.mode === 'race' && !daily ? { text: 'GO!', sub: `live race · ${sim.R.timeLimit} s · highest tree wins` } // P6-RACE
      : lv ? { text: `${lv.id} ${lv.name.toUpperCase()}`, sub: `reach the ribbon at ${sim.finishM} m · ${goalText(lv.goals[0])} · ${goalText(lv.goals[1])}`, sub2: challenge ? `friend scored ${CHALLENGE.m.toLocaleString('en-US')}` : '' }
      : challenge && CHALLENGE.week ? { text: `BEAT ${CHALLENGE.m} m`, sub: `weekly tree ${weekCode(run.week)} · same course as your friend` }
      : challenge ? { text: `BEAT ${CHALLENGE.m} m`, sub: `same course as your friend${run.mode !== 'classic' ? ' · ' + m.name : run.stake !== 'sapling' ? ' · ' + k.name : ''}` }
      : daily ? { text: bestM > 0 ? `BEAT ${bestM} m` : 'DAILY TREE', sub: `${dailyLabel()} · same course for all · no charms` }
      : run.mode === 'weekly' ? { text: bestM > 0 ? `BEAT ${bestM} m` : 'WEEKLY TREE', sub: `${weekCode(run.week)} · Oak stake · same for everyone all week` }
      : run.mode === 'sprint' ? { text: '60 SECONDS', sub: bestM > 0 ? `grow higher than ${bestM} m before the clock runs out` : 'how high can you grow before the clock runs out?' }
      : run.mode === 'zen' ? { text: 'ZEN', sub: 'no sap to lose · grow to the Cloudline (600 m) at your pace' }
      : run.mode === 'hardcore' ? { text: 'ONE HIT', sub: bestM > 0 ? `best ${bestM} m · points ×2 · any hit ends it` : 'points ×2 · any hit ends the tree' }
      : run.mode === 'mirror' ? { text: 'LOOKING-GLASS', sub: 'left is right · points ×1.5' }
      : run.mode === 'storm' ? { text: 'STORM RUSH', sub: 'storm after storm from 60 m · points ×1.6' }
      : run.stake !== 'sapling' ? { text: bestM > 0 ? `BEAT ${bestM} m` : `${k.name.toUpperCase()} STAKE`, sub: `points ×${k.mult} · ${k.adds.slice(-2).join(' · ')}` }
      : S.best.height < STAGES[TREETOP_IDX].m ? { text: 'REACH THE TREETOP', sub: `${STAGES[TREETOP_IDX].m} m · fork, merge, climb` }
      : { text: `BEAT ${S.best.height} m`, sub: sim.charm ? `your best · ${CHARMS[sim.charm].name} charm ready to charge` : 'your best · gold line' };
    if (runSeasons.length) goal.sub2 = goal.sub2 || runSeasons.map((x) => `${x.name}: ${x.effect}`).join(' · '); // P6-SEASONS
    fx.banner = { ...goal, t: 0, max: lv ? 3.2 : 2.2, small: true };
  }
}

function toMenu() {
  if (raceUI && raceUI.active) { raceUI.leave(false); } // P6-RACE
  if (run.mode === 'race') run = { mode: 'classic', stake: S.quest.stake, level: null, week: null }; // P6-RACE
  sound.stop();
  if (!CHALLENGE) run = { mode: 'classic', stake: S.quest.stake, level: null, week: null };
  if (sound.ready) sound.startMenu();
  setMode('title');
  refreshTitle();
  startDemo();
  if (hub) hub.onHome(); // META-V2: at most one offer, never mid-run
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
  { const qb = $('btn-quality'); if (qb) { qb.querySelector('.lbl').textContent = `Quality: ${quality.label()}`; qb.title = 'Auto adapts to your device. Smooth trades a little sharpness for frame rate.'; } }
  if (CHALLENGE) {
    $('challenge').hidden = false;
    if (CHALLENGE.duel) {
      const d = CHALLENGE.duel;
      $('challenge').innerHTML = `${R.avatarHTML(R.PORTRAITS[d.p].id, R.FRAMES[d.f].id, 34)}<span></span>`;
      $('challenge').querySelector('span:last-child').textContent = `${d.n || 'A friend'} challenged you to a duel: beat ${d.h} m on this exact course. Their rival tip climbs beside you.`;
      $('challenge').classList.add('duel');
      $('btn-play-label').textContent = 'Accept the duel';
    } else $('challenge').textContent = CHALLENGE.lvl ? `A friend scored ${CHALLENGE.m.toLocaleString('en-US')} on quest level ${CHALLENGE.lvl} (${LEVEL[CHALLENGE.lvl].name}). Can you beat it?`
      : CHALLENGE.week ? `A friend grew ${CHALLENGE.m} m on the weekly tree ${weekCode(CHALLENGE.week)}. Can you beat it?`
      : `A friend grew ${CHALLENGE.m} m on this course${CHALLENGE.mode !== 'classic' ? ` in ${MODE[CHALLENGE.mode].name}` : CHALLENGE.stake !== 'sapling' ? ` on ${STAKE[CHALLENGE.stake].name}` : ''}. Can you beat it?`;
    if (!CHALLENGE.duel) $('btn-play-label').textContent = 'Take the challenge';
  } else {
    const k = STAKE[S.quest.stake];
    $('btn-play-label').textContent = S.quest.stake === 'sapling' ? 'Grow' : `Grow · ${k.name}`;
  }
  // stake chip: only once a second stake is open (first visit stays one clean screen)
  const stakesOpen = STAKES.filter((k) => Q.stakeUnlocked(S, k.id));
  $('btn-stake').hidden = !!CHALLENGE || stakesOpen.length < 2;
  $('btn-stake').innerHTML = STAKES.map((k) => `<span class="${k.id === S.quest.stake ? 'on' : ''} ${Q.stakeUnlocked(S, k.id) ? '' : 'off'}">${k.name}<small>×${k.mult}</small></span>`).join('');
  const st = Q.totalStars(S);
  $('quest-n').textContent = st > 0 ? `${st}★` : 'new';
  $('quest-n').classList.toggle('new', st === 0);
  const d = store.get('forkwood.daily.' + dailySeed(), null);
  $('daily-best').textContent = d ? `· today ${d.height} m` : `· ${dailyLabel()}`;
  refreshGroveChip();
  refreshSeasons(); // P6-SEASONS
  if (hub) hub.refresh(mode); // META-V2
}

// P6-SEASONS: title cards with "open until …" countdowns, the tint layer, the overlay particles
function refreshSeasons() {
  if (mode === 'title') SEASON = seasonNow();
  const box = $('season-cards');
  if (!box) return;
  const now = seasonClock() || new Date();
  box.hidden = SEASON.list.length === 0;
  box.innerHTML = SEASON.list.map((x) => `<div class="season-card sc-${x.id}" data-season="${x.id}" title="${x.effect} · ${SEA.untilText(x.until, now)}"><span class="sc-ico" aria-hidden="true">${SEA.ICONS[x.id] || ''}</span><span class="sc-txt"><b>${x.name}</b><small>${x.effect}</small><em>${SEA.untilText(x.until, now)}</em></span></div>`).join(''); // P7-UI: chips show the name; effect and time left in the tooltip
  box.title = SEASON.list.length ? 'Open in free play. Daily, weekly, race and quest trees stay the same for everyone: looks only.' : '';
  $('title').classList.toggle('has-seasons', SEASON.list.length > 0);
  requestAnimationFrame(() => { box.classList.toggle('more', box.scrollWidth > box.clientWidth + 2); box.classList.toggle('end', box.scrollLeft + box.clientWidth >= box.scrollWidth - 2); });
  applySeasonLook();
}
function applySeasonLook() {
  const th = SEASON.theme;
  document.body.dataset.season = th.ids.join(' ');
  // P6-SEASONS x P6-ART: the season tint goes into the backdrop palette (canvas only),
  // so the HUD and title are never tinted (the old CSS #season-tint layer is gone).
  backdrop.setTheme(th.backdrop);
}
setInterval(() => { if (mode === 'title') refreshSeasons(); }, 30000);
$('season-cards').addEventListener('scroll', (e) => { const b = e.currentTarget; b.classList.toggle('end', b.scrollLeft + b.clientWidth >= b.scrollWidth - 2); }, { passive: true });
// a mouse wheel scrolls the season row sideways
$('season-cards').addEventListener('wheel', (e) => { const b = e.currentTarget; if (b.scrollWidth > b.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { b.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
// /P6-SEASONS

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
    if (renderer.gl) renderer.gl.event(e, fx, cam, quiet); // v2 ENGINE: FX/juice subscribers
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
          if (e.jit) { floater(e.x, e.y - 92, 'just in time ×1.5', '#c4e88a', 20, 1.1); sound.jit(); }
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
        if (!quiet) { const now = performance.now(), rep = now - (fx.lastHitAt || -1e9) < 700; fx.lastHitAt = now; hitStop(rep ? 0.05 : 0.09); sound.hit(); shake(rep ? 7 : 12); flash('255,60,60', rep ? 0.3 : 0.8); vibrate(70); floater(e.x, e.y - 30, `−${e.dmg} sap`, '#ff9a86', 22, 0.9); }
        break;
      case 'near':
        // P6-TRAPS: a brief slow-mo (~120 ms) on a close call, at most once a second, never in calm mode
        if (!quiet && !isCalm() && s.t - (fx.slowAt ?? -9) > 1) { fx.slowmo = 0.12; fx.slowAt = s.t; }
        if (!quiet) { sound.near(); floater(e.x, e.y - 20, e.n > 1 ? `close ×${Math.min(5, e.n)} +${e.bonus}` : `close +${e.bonus}`, '#c4e88a', 17 + Math.min(4, e.n), 0.8); }
        break;
      // P6-TRAPS: trap intros and trap events
      case 'trapintro':
        if (!quiet) fx.banner = { text: e.name, sub: e.hint, t: 0, max: 2.6, small: true };
        break;
      case 'snap':
        burst(e.x, e.y, 10, '#8a6a44', 220, 6, 0.8, 'leaf');
        break;
      case 'crow':
        if (!quiet) { sound.near(); floater(e.x, e.y - 70, 'crow! swerve or fork', '#ffd27a', 20, 1.1); /* P8-ECON */ }
        break;
      case 'crowsteal':
        if (!quiet) { sound.emptyMerge(); floater(e.x, e.y - 50, e.lost ? `crow stole ${e.lost}` : e.pts ? `crow −${e.pts} pts` : 'pecked!', '#ff9a86', 20, 1.0); /* P8-ECON */ }
        break;
      case 'crowfoil':
        ring(e.x, e.y, '#ffd27a', 80, 0.5);
        if (!quiet) floater(e.x, e.y - 60, `crow foiled +${e.bonus}`, '#c4e88a', 18, 0.9);
        break;
      case 'tide':
        if (!quiet) floater(s.cx, s.cy + 80, 'thorns rising: climb!', '#ff9a86', 18, 1.0);
        break;
      // /P6-TRAPS
      case 'graze':
        ring(e.x, e.y, '#c4e88a', 70, 0.5);
        if (!quiet) { sound.graze(e.n); floater(e.x, e.y - 52, `graze chain ${e.n} · +sap`, '#c4e88a', 22, 1.0); shake(2); }
        break;
      case 'straddle':
        ring(e.x, e.y, '#a9cf5a', 90, 0.6);
        if (!quiet) { sound.collect(8, true); floater(e.x, e.y - 40, `straddled +${e.bonus}`, '#c4e88a', 20, 1.0); }
        break;
      case 'pickup': {
        const col = { pollen: '#ffe08a', ink: '#f4ecd8', rush: '#a9cf5a' }[e.kind];
        ring(e.x, e.y, col, 90, 0.6); ring(e.x, e.y, '#1e1a16', 46, 0.35);
        burst(e.x, e.y, 14, col, 260, 8, 0.8, e.kind === 'rush' ? 'leaf' : 'spark');
        if (!quiet) {
          sound.pickup(e.kind); hitStop(0.04); vibrate(25);
          if (e.kind === 'rush') { shake(6); flash('190,230,140', 0.4); cam.punch = 0.06; }
          floater(e.x, e.y - 40, e.spring ? 'spring pollen' : e.extended ? `${PICKUPS[e.kind].name} +time` : PICKUPS[e.kind].name, col, 24, 1.1);
          if (!e.spring && e.stacked < 2) floater(e.x, e.y - 12, PICKUPS[e.kind].blurb, '#f4ecd8', 14, 1.0);
        }
        break;
      }
      case 'puend':
        if (!quiet) { sound.puEnd(); floater(s.cx, s.cy - 46, `${PICKUPS[e.kind].name} ends`, '#e8dcc0', 14, 0.7); }
        break;
      case 'graft': {
        ring(e.x, e.y, '#f2b33d', 110, 0.7); burst(e.x, e.y, 16, '#f2b33d', 280, 8, 0.9, 'leaf');
        if (!quiet) {
          sound.graft(); hitStop(0.06); shake(4); vibrate(30);
          const G = GRAFTS[e.id];
          if (e.again) floater(e.x, e.y - 40, `graft deepened +${e.bonus}`, '#f2b33d', 22, 1.1);
          else fx.banner = { text: G.name, sub: G.boon, sub2: `cost: ${G.cost}`, t: 0, max: 2.6, small: true };
        }
        break;
      }
      case 'synergy': {
        ring(e.x, e.y, '#ffe08a', 200, 0.9); burst(e.x, e.y, 26, '#ffe08a', 420, 9, 1.0, 'spark');
        if (!quiet) { sound.synergy(); flash('255,215,106', 0.45); shake(6); const SY = SYNERGIES[e.id] || { name: e.name || e.id, text: e.text || '' }; fx.banner = { text: SY.name.toUpperCase(), sub: SY.text, t: 0, max: 3, gold: true }; } // V2-MECH: ring synergies
        break;
      }
      case 'storm':
        if (!quiet) { sound.storm(); shake(5); fx.banner = { text: e.i === 0 ? 'THE STORM' : 'STORM', sub: 'lightning shows before it strikes · rain feeds sap', t: 0, max: 2.8 }; }
        break;
      case 'strike':
        if (!quiet) { sound.strike(); flash('255,246,200', 0.5); shake(4); }
        break;
      case 'stormend':
        burst(e.x, e.y - 40, 20, '#cfe6ff', 300, 8, 1.2, 'leaf');
        if (!quiet) { sound.stormEnd(); floater(e.x, e.y - 60, `storm weathered +${e.bonus}`, '#cfe6ff', 24, 1.4); flash('207,230,255', 0.35); }
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
        if (!quiet && run.level && !daily) { sound.stageUp(); floater(s.cx, s.cy - 50, '+15 sap', '#c4e88a', 18, 0.9); }
        else if (!quiet && e.idx === TREETOP_IDX) {
          sound.stageUp(); sound.newBest();
          fx.banner = { text: 'Treetop', sub: 'you grew a whole tree · now reach the stars', t: 0, max: 3.4, gold: true };
          flash('255,215,106', 0.6); shake(8); vibrate(80);
          for (let k = 0; k < 5; k++) burst(s.cx + (k - 2) * 70, s.cy - 80 - k * 20, 12, STAGES[e.idx].leaf, 340, 8, 1.8, 'leaf');
          burst(s.cx, s.cy - 60, 26, '#ffe08a', 420, 10, 1.0, 'spark');
        } else if (!quiet) { sound.stageUp(); fx.banner = { text: st.name, sub: `+15 sap · ${st.news}`, t: 0, max: 2.6 }; }
        break;
      }
      case 'acorn':
        burst(e.x, e.y, 5, '#d99a52', 150, 6, 0.5, 'leaf');
        if (!quiet) { sound.acorn(e.n); fx.acornPulse = 1; floater(e.x, e.y - 16, e.env ? 'red envelope +3' : '+1 acorn', e.env ? '#ff8a7a' : '#f3cf8e', 15, 0.7); } // P6-SEASONS: envelope
        break;
      case 'letter': // P8-ECON word hunt
        ring(e.x, e.y, '#f2b33d', 90, 0.55); ring(e.x, e.y, '#fff4c8', 54, 0.4);
        burst(e.x, e.y, 10, '#ffe08a', 200, 7, 0.7, 'spark');
        if (!quiet) { sound.sparkle(); floater(e.x, e.y - 20, `letter ${e.ch}!`, '#ffe08a', 22, 1.1); }
        break;
      case 'gem': // P8-ECON dew gem
        ring(e.x, e.y, '#8fa8ff', 110, 0.6); ring(e.x, e.y, '#e4ecff', 64, 0.45);
        burst(e.x, e.y, 14, '#a9b8ff', 240, 7, 0.85, 'spark');
        if (!quiet) { sound.sparkle(); floater(e.x, e.y - 20, '+1 dew gem', '#9fe3ff', 22, 1.1); }
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
        if (!quiet) { sound.newBest(); floater(s.cx, s.cy - 60, isChallengeRun() ? 'friend beaten' : 'new best', '#f2b33d', 28, 1.4); flash('255,215,106', 0.35); }
        break;
      case 'death':
        for (const t of s.tips) burst(t.x, s.cy, 14, STAGES[s.stageIdx].leaf, 140, 7, 1.6, 'leaf');
        if (!quiet) { sound.death(); sound.stop(); shake(6); vibrate(120); if (e.why === 'hit') fx.banner = { text: 'ONE HIT', sub: 'hardcore: the tree is done', t: 0, max: 1.6, small: true }; }
        break;
      case 'finish': {
        // a finish ribbon or the sprint clock: a win, celebrated like the Treetop
        const time = e.why === 'time';
        for (let k = 0; k < 5; k++) burst(s.cx + (k - 2) * 60, s.cy - 60 - k * 16, 12, STAGES[s.stageIdx].leaf, 320, 8, 1.6, 'leaf');
        burst(s.cx, s.cy - 50, 24, '#ffe08a', 400, 10, 1.0, 'spark');
        ring(s.cx, s.cy, '#f2b33d', 200, 0.9);
        if (!quiet) {
          sound.stageUp(); sound.newBest(); flash('255,215,106', 0.55); shake(7); vibrate(80); sound.stop();
          fx.banner = time ? { text: "TIME!", sub: `${Math.floor(heightM(s))} m in 60 s`, t: 0, max: 1.6, gold: true } : { text: run.level ? 'CLEAR!' : 'FINISH', sub: `${Math.floor(heightM(s))} m · ${Math.floor(s.score).toLocaleString('en-US')} pts`, t: 0, max: 1.6, gold: true };
        }
        break;
      }
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
  // P6-RACE: a live race shows its own finish card (no rewards, nothing saved)
  if (run.mode === 'race' && raceUI && raceUI.active) { const rs = summary(sim); lastSum = rs; setMode('over'); $('over').classList.remove('show'); raceUI.localEnd(rs); return; }
  // P6-RACE end
  const sum = summary(sim);
  lastSum = sum;
  let newBest = false;
  const prevBest = S.best.height;
  let rewards = null;
  const before = S.acorns;
  const lv = run.level && !daily ? LEVEL[run.level] : null;
  const challengeRun = isChallengeRun();
  lastQuest = null;
  if (!BOT_MODE && !autoplay) Dir.record(sum, dirMode); // P6-TRAPS
  if (!BOT_MODE) {
    const challengeWon = !!(challengeRun && (CHALLENGE.lvl ? sum.won && sum.score > CHALLENGE.m : sum.height > CHALLENGE.m));
    rewards = M.finishRun(S, sum, { daily, challengeWon, noBest: !!lv || (run.mode !== 'classic' && !daily) || (run.stake !== 'sapling' && !daily) });
    newBest = rewards.bestScore;
    const q = Q.finishQuest(S, sum, { mode: daily ? 'classic' : run.mode, stake: daily ? 'sapling' : stakeOf(run), level: lv ? lv.id : null, week: run.week });
    lastQuest = q;
    rewards.quest = q;
    rewards.unlocked.push(...M.unlockEarned(S));
    // retention: rings for the season and league, the daily gift, streak milestones, duel result
    const ret = R.afterRun(S, sum, rewards, M.claimGift);
    rewards.unlocked.push(...M.unlockEarned(S));
    rewards.extra = retStamps(ret);
    if (challengeRun && CHALLENGE.duel) {
      const dr = R.settleDuelRun(S, CHALLENGE.duel, sum);
      rewards.extra.unshift({ k: 'level', t: dr.won ? 'Duel won' : 'Duel played', s: dr.acorns ? `+${dr.acorns}` : 'again' });
    }
    rewards.rings = ret.rings;
    rewards.total = S.acorns;
    if (lv) newBest = !!q.levelBest && sum.won;
    else if (run.mode !== 'classic' || run.stake !== 'sapling') newBest = q.modeBest || q.stakeBest;
    persist();
    if (daily) {
      const key = 'forkwood.daily.' + dailySeed();
      const d = store.get(key, { score: 0, height: 0 });
      if (sum.score > d.score) { store.set(key, { score: sum.score, height: Math.max(d.height, sum.height) }); newBest = true; }
    }
  }
  const url = location.host ? (location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '') : 'Forkwood';
  const challenge = challengeRun ? { m: CHALLENGE.m, won: CHALLENGE.lvl ? sum.won && sum.score > CHALLENGE.m : sum.height > CHALLENGE.m, pts: !!CHALLENGE.lvl } : null;
  const modeLine = lv ? `Quest ${lv.id} · ${lv.name}${sum.won ? '' : ' · not finished'}` : run.mode === 'weekly' ? `Weekly tree ${weekCode(run.week)} · Oak` : run.mode !== 'classic' && !daily ? MODE[run.mode].name : (!daily && run.stake !== 'sapling' ? `${STAKE[run.stake].name} stake ×${STAKE[run.stake].mult}` : '');
  const cardStars = lv && lastQuest ? { run: lastQuest.runStars || 0, best: lastQuest.stars || 0 } : null;
  const cardMeta = { daily, dailyLabel: dailyLabel(), newBest, url, seed: lv || run.mode === 'weekly' ? null : sim.seed, challenge, level: S.level, printNo: Math.max(1, S.stats.runs), modeLine, stars: cardStars, title: S.quest.title ? Q.TITLE[S.quest.title].name : '', map: mapId(), world: shownWorld || (sim && sim.world) || selectedWorld() }; // P8-MAPS: map; V2-INT fix: the card is from the v2 world
  const paintCard = (SH, cs) => {
    try {
      cardCanvas = SH.renderCard(cs, sum, cardMeta);
      $('card-img').src = cardCanvas.toDataURL('image/png');
    } catch (e) {
      console.warn('card render failed', e && e.stack || e);
    }
  };
  cardCanvas = null;
  { const cs = sim; (SHARE ? Promise.resolve(SHARE) : loadShare()).then((SH) => (SH.preloadPainting ? SH.preloadPainting(cardMeta.world).then(() => SH) : SH)).then((SH) => paintCard(SH, cs)).catch((e) => console.warn('card module failed', e)); }
  const toGo = STAGES[TREETOP_IDX].m - sum.height;
  const why = { hit: 'one hit', time: "time's up", sap: 'out of sap', finish: 'finished' }[sum.end] || '';
  $('over-kicker').textContent = challenge ? (challenge.won ? `★ CHALLENGE BEATEN (${challenge.pts ? challenge.m.toLocaleString('en-US') + ' pts' : challenge.m + ' m'})` : challenge.pts ? `CHALLENGE: friend scored ${challenge.m.toLocaleString('en-US')}` : `CHALLENGE: ${challenge.m - sum.height + 1} m short`)
    : lv ? (sum.won ? `LEVEL ${lv.id} CLEAR` : `LEVEL ${lv.id} · ${why}`)
    : run.mode === 'sprint' && !daily ? (newBest ? '★ SPRINT BEST' : `SPRINT · ${why}`)
    : run.mode === 'zen' && !daily ? (sum.won ? 'ZEN · CLOUDLINE REACHED' : 'ZEN')
    : run.mode === 'hardcore' && !daily ? (newBest ? '★ HARDCORE BEST' : 'HARDCORE · one hit')
    : newBest ? `★ NEW BEST${run.stake !== 'sapling' && run.mode === 'classic' && !daily ? ' ON ' + STAKE[run.stake].name.toUpperCase() : ''}` : daily ? `DAILY TREE · ${dailyLabel()}` : run.mode === 'weekly' ? `WEEKLY ${weekCode(run.week)}` : `reached ${sum.stage.toUpperCase()}`;
  if (lv) {
    const mk = lastQuest ? lastQuest.mask || 0 : 0;
    $('over-tip').innerHTML = [`Reach the ribbon (${sum.finishM} m)`, ...lv.goals.map(goalText)].map((t, i) => `<span class="lg ${mk & (1 << i) ? 'on' : ''}">${mk & (1 << i) ? '★' : '☆'} ${t}</span>`).join('');
  } else $('over-tip').textContent = run.mode === 'sprint' && !daily ? `Sprint: ${sum.height} m in ${Math.min(60, Math.round(sum.time))} s. ${runTip(sum)}`
    : toGo > 0 ? `${toGo} m to the Treetop. ${runTip(sum)}`
    : (sum.height > prevBest && prevBest >= STAGES[TREETOP_IDX].m) ? 'Above the treetop and climbing. Stars next.' : runTip(sum);
  $('over-tip').classList.toggle('goals', !!lv);
  // P6-ART begin: retry hook, how far the record flag is from where this tree stopped
  {
    let rec = $('over-record');
    if (!rec) { rec = document.createElement('p'); rec.id = 'over-record'; rec.className = 'over-score'; rec.style.fontWeight = '800'; $('over-tip').before(rec); }
    const short = prevBest - sum.height;
    rec.textContent = lv || run.mode !== 'classic' || run.stake !== 'sapling' || daily || !prevBest ? '' : short > 0 ? `⚑ ${short} m short of your record (${prevBest} m)` : sum.height > prevBest ? `⚑ New record flag planted at ${sum.height} m` : '⚑ Level with your record';
    rec.hidden = !rec.textContent;
  }
  // P6-ART end
  document.querySelector('.over-panel').classList.toggle('lvl', !!lv);
  // stars for quest levels: this run's stars light up, newly earned ones stamp in
  const os = $('over-stars');
  os.hidden = !lv;
  if (lv && lastQuest) {
    const mk = lastQuest.mask || 0, prev = (S.quest.marks[lv.id] || 0) & ~mk | 0;
    os.innerHTML = [0, 1, 2].map((i) => { const on = !!(mk & (1 << i)), had = i < lastQuest.prevStars; return `<i class="${on ? 'on' : had ? 'had' : ''} ${on && i >= lastQuest.prevStars ? 'new' : ''}" style="--d:${0.35 + i * 0.22}s">${on || had ? ICON_STAR : ICON_STAR_OFF}</i>`; }).join('') + `<small>${lastQuest.stars}/3 on this level</small>`;
    if (!isCalm() && lastQuest.newStars) for (let i = 0; i < lastQuest.newStars; i++) setTimeout(() => sound.stamp(), (0.35 + (lastQuest.prevStars + i) * 0.22) * 1000);
  }
  // next / retry buttons
  const nx = lv && sum.won ? nextLevel(lv) : null;
  const nxOpen = nx && Q.levelUnlocked(S, nx.id);
  $('btn-next').hidden = !nxOpen;
  if (nxOpen) $('btn-next-label').textContent = `Next: ${nx.id} ${nx.name}`;
  $('btn-again-label').textContent = lv ? (sum.won ? 'Play again' : 'Retry') : 'Grow again';
  $('btn-again').classList.toggle('primary', !nxOpen); $('btn-again').classList.toggle('secondary', !!nxOpen);
  $('btn-menu').textContent = lv ? 'Map' : 'Menu';
  countUp(lv && sum.won ? sum.score : sum.height, lv && sum.won ? 'pts' : 'm');
  $('over-kicker').classList.toggle('gold', !!(newBest || (challenge && challenge.won)));
  $('over-score').textContent = lv ? (sum.won ? `${sum.height} m in ${Math.round(sum.time)} s · best ${(S.quest.best[lv.id] || sum.score).toLocaleString('en-US')} pts` : `${sum.height} of ${sum.finishM} m · ${sum.score.toLocaleString('en-US')} pts`)
    : `${sum.score.toLocaleString('en-US')} pts · best ${Math.max(run.mode === 'classic' && run.stake === 'sapling' || daily ? S.best.score : ((run.mode === 'classic' ? 0 : (S.quest.modeBest[run.mode] || {}).s) || 0), sum.score).toLocaleString('en-US')}`;
  $('over-hash').textContent = `tree ${sum.hash} · ${sum.commits} commits · ${sum.merges} merges · ${sum.reverts} reverts · max ×${sum.maxMult}${sum.grafts ? ` · grafts: ${sum.graftIds.map((g) => (GRAFTS[g] || { name: g }).name).join(', ')}` : ''}`;
  $('share-msg').textContent = '';
  setMode('over');
  ui.showRewards(rewards, { before });
  if (hub && rewards) { hub.afterRun({ lost: !newBest }); hub.offerDouble({ gained: S.acorns - before, fair: !!lv || daily || challengeRun || run.mode === 'weekly' }); } // META-V2
  refreshGroveChip();
  if (input.kind !== 'touch') $('btn-again').focus({ preventScroll: true });
}

function retStamps(ret) {
  const out = [];
  if (ret.gift) out.push({ k: 'daily', t: `Day ${ret.gift.day} gift`, s: `+${ret.gift.amount}` });
  for (const m of ret.milestones) out.push({ k: 'badge', t: `${m.d}-day streak`, s: `+${m.acorns}` });
  for (const t of ret.tiers.slice(-2)) out.push({ k: 'level', t: `Season tier ${t.tier}`, s: t.acorns ? `+${t.acorns}` : 'prize' });
  for (const id of ret.items.slice(0, 2)) { const [k, v] = id.split('.'); out.push({ k: 'skin', t: k === 'portrait' ? `Portrait: ${R.PORTRAIT[v].name}` : k === 'frame' ? `Frame: ${R.FRAME[v].name}` : (SKIN[id] ? SKIN[id].name : id), s: 'unlocked' }); }
  if (ret.league) out.push({ k: 'weekly', t: ret.league.to > ret.league.from ? `Up to ${R.TIERS[ret.league.to]}` : `League week: #${ret.league.rank}`, s: `+${ret.league.acorns}` });
  else if (ret.rank && ret.prevRank && ret.rank < ret.prevRank) out.push({ k: 'weekly', t: `League #${ret.rank}`, s: `up ${ret.prevRank - ret.rank}` });
  return out;
}

let countRaf = 0;
function countUp(target, unit = 'm') {
  // the height counts up with soft ticks, then settles (instant in calm mode)
  const el = $('over-height');
  cancelAnimationFrame(countRaf);
  const set = (v) => { el.innerHTML = `${unit === 'pts' ? v.toLocaleString('en-US') : v}<small>${unit}</small>`; };
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
  if (sum.height >= 100 && sum.height < 140 && sum.grafts === 0) return 'Tip: at 120 m two graft medallions appear. Steer into one, or fork to take both.';
  if (sum.height >= 400 && sum.height < 560 && sum.storms === 0) return 'Tip: in the storm, dashed columns show where lightning will strike. Stay out of them.';
  if (sum.height >= 240 && sum.splits < 2) return 'Tip: fork so your two tips pass either side of a thorn column.';
  if (sum.reverts >= 2) return 'Tip: merge before thorn gates. A hit on a fork reverts that branch.';
  if (sum.maxMult < 4) return 'Tip: merge often. Every merge raises the multiplier, and ×8 starts golden hour.';
  if (sum.blooms === 0) return 'Tip: catch every sunlight in a trail and that branch bursts into full bloom.';
  return 'Tip: split gates reward forked trees with a both-lanes bonus.';
}

function challengeUrl() {
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'Forkwood';
  if (run.level && !daily) return `${base}?lvl=${run.level}&beat=${lastSum.won ? lastSum.score : 1}`;
  if (run.mode === 'weekly' && !daily) return `${base}?week=${run.week}&beat=${lastSum.height}`;
  const extra = daily ? '' : `${run.mode !== 'classic' ? `&mode=${run.mode}` : ''}${run.mode === 'classic' && run.stake !== 'sapling' ? `&stake=${run.stake}` : ''}`;
  return `${base}?seed=${sim.seed}&beat=${lastSum.height}${extra}`;
}

/** A duel link for endless and daily runs; quest levels and weekly trees keep their own links. */
function duelUrl() {
  if ((run.level || run.mode === 'weekly') && !daily) return null;
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'Forkwood';
  const prev = isChallengeRun() && CHALLENGE.duel ? CHALLENGE.duel : null;
  const d = { id: R.newDuelId(), seed: sim.seed, h: lastSum.height, sc: lastSum.score, t: lastSum.time, mode: daily ? 'classic' : run.mode, stake: daily ? 'sapling' : run.stake,
    p: (R.PORTRAIT[S.ret.avatar.portrait] || R.PORTRAIT.sparrow).i, f: (R.FRAME[S.ret.avatar.frame] || R.FRAME.twig).i, n: S.ret.name, r: prev ? prev.id : '', rh: prev ? prev.h : 0 };
  R.registerSent(S, d); persist(false);
  return `${base}?duel=${R.encodeDuel(d)}`;
}

function shareText() {
  const s = lastSum;
  const lv = run.level && !daily ? LEVEL[run.level] : null;
  if (lv) {
    const n = lastQuest ? lastQuest.runStars || 0 : 0;
    return `Forkwood quest ${lv.id} "${lv.name}" ${'★'.repeat(n)}${'☆'.repeat(3 - n)} · ${s.score.toLocaleString('en-US')} pts\n${Q.mapGrid(S)}\nBeat my score: ${challengeUrl()}`;
  }
  const what = run.mode === 'weekly' && !daily ? ` on the weekly tree ${weekCode(run.week)}` : run.mode !== 'classic' && !daily ? ` in ${MODE[run.mode].name}` : run.stake !== 'sapling' && !daily ? ` on ${STAKE[run.stake].name} stake` : '';
  return `I grew a ${s.height} m tree in Forkwood${what} (tree ${s.hash} · ${s.commits} commits · ${s.merges} merges${daily ? ` · daily ${dailyLabel()}` : ''}). Same course, can you beat it? ${challengeUrl()}`;
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
// Looking-glass mode: steering is mirrored (the course is not)
const mirrored = () => mode === 'play' && !daily && !run.level && run.mode === 'mirror';
const mirrorX = (x) => (mirrored() ? W - x : x);
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  input.kind = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  if (raceUI && raceUI.active && mode !== 'play') return; // P6-RACE
  if (mode === 'title') { playMain(); return; }
  else if (mode === 'play' && paused) { resume(); return; }
  const cz = renderer.layout.charm;
  if (mode === 'play' && cz && Math.hypot(e.clientX - cz.x, e.clientY - cz.y) < cz.r) { input.charm = true; return; }
  input.pointerId = e.pointerId; input.downT = performance.now(); input.downX = e.clientX; input.downY = e.clientY; input.moved = 0;
  if (e.pointerType === 'mouse') input.targetX = mirrorX(worldX(e.clientX));
  else input.anchor = input.targetX ?? (sim ? sim.cx : W / 2);
  if (e.pointerType === 'mouse' && mode === 'play' && e.button === 0) toggleFork();
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    if (input.dir !== 0) return;
    if (input.kind === 'key' && Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) < 3) return;
    input.kind = 'mouse';
    input.targetX = mirrorX(worldX(e.clientX));
  } else if (e.pointerId === input.pointerId) {
    input.targetX = Math.max(0, Math.min(W, input.anchor + ((e.clientX - input.downX) / cam.scale) * TOUCH_GAIN * (mirrored() ? -1 : 1)));
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
  if (hub && hub.isOpen) return; // META-V2: rooms and sheets own the keys
  if (ui.isOpen) { if (k === 'Escape') ui.hide(); return; }
  if (qui.isOpen) { if (k === 'Escape') qui.hide(); return; }
  if (gui.isOpen) { if (k === 'Escape') gui.hide(); return; }
  if (document.body.classList.contains('in-intro')) return;
  if (raceUI && raceUI.active && mode !== 'play') return; // P6-RACE: the race card owns the keys
  if (raceUI && raceUI.active && (k === 'r' || k === 'R' || k === 'p' || k === 'P' || k === 'Escape')) return; // P6-RACE: no restart/pause mid-race
  if (k === 'm' || k === 'M') { toggleMute(); return; }
  if (k === 'r' || k === 'R') { startRun(daily && mode !== 'title'); return; }
  if (mode === 'title') { if (k === 'Enter' || k === ' ') playMain(); else if (k === 'd' || k === 'D') startRun(true); return; }
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
  if (run.mode === 'race') return; // P6-RACE: a live race never pauses
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
const playMain = () => { if (CHALLENGE) startRun(false); else startMode('classic'); };
$('btn-play').addEventListener('click', (e) => { e.stopPropagation(); playMain(); });
$('btn-daily').addEventListener('click', (e) => { e.stopPropagation(); startRun(true); });
$('btn-again').addEventListener('click', () => startRun(daily));
$('btn-next').addEventListener('click', () => { const nx = run.level && nextLevel(LEVEL[run.level]); if (nx) startLevel(nx.id); });
$('btn-menu').addEventListener('click', () => { if (run.level && !daily && mode === 'over') { sound.page(); qui.show('map', run.level); } else toMenu(); });
$('btn-quest').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); sound.page(); qui.show('map'); });
$('btn-stake').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = STAKES.filter((k) => Q.stakeUnlocked(S, k.id));
  const i = open.findIndex((k) => k.id === S.quest.stake);
  S.quest.stake = open[(i + 1) % open.length].id; run.stake = S.quest.stake; persist(false); sound.page(); refreshTitle();
});
$('quest-ico').innerHTML = ICON.map; $('daily-ico').innerHTML = ICON.calendar; $('race-ico').innerHTML = ICON.live; // P7-UI
$('btn-menu-p').addEventListener('click', toMenu);
$('btn-quality').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); quality.cycle(); refreshTitle(); ui.toast(quality.mode === 'low' ? 'Smooth mode: lighter effects, steadier frame rate' : quality.mode === 'high' ? 'High quality: full resolution and glass' : 'Auto quality: adapts to your device', 'badge'); }); // v1.0.1 PERF
$('btn-calm').addEventListener('click', (e) => { e.stopPropagation(); S.calm = !isCalm(); persist(false); sound.unlock(); sound.toggle(); refreshTitle(); });
$('btn-challenge').addEventListener('click', async () => {
  if (!lastSum) return;
  const durl = duelUrl(), url = durl || challengeUrl();
  const answer = durl && isChallengeRun() && CHALLENGE.duel;
  const text = durl ? (answer ? `My answer to your Forkwood duel: ${lastSum.height} m vs your ${CHALLENGE.duel.h} m. Open it to settle (and race me back): ${url}` : `Duel me in Forkwood: beat my ${lastSum.height} m on the same course. ${url}`) : `Beat my ${lastSum.height} m tree in Forkwood: ${url}`;
  let ok = false;
  if (navigator.share && input.kind === 'touch') { try { await navigator.share({ text }); ok = true; } catch { /* cancelled */ } }
  if (!ok) { try { await navigator.clipboard.writeText(text); ok = true; } catch { /* ignore */ } }
  $('share-msg').textContent = ok ? (durl ? (answer ? 'Answer link ready: when your friend opens it, the duel settles on their device.' : 'Duel link ready: your friend races your rival tip on this exact course.') : 'Challenge link copied: same course, beat my height.') : url;
});
$('btn-resume').addEventListener('click', resume);
$('pause').addEventListener('pointerdown', (e) => { if (e.target === $('pause')) resume(); });
$('btn-save').addEventListener('click', () => {
  if (!cardCanvas) return;
  SHARE.downloadCard(cardCanvas, `forkwood-${lastSum.hash}-${lastSum.height}m.png`);
  $('share-msg').textContent = 'Saved your tree as a PNG.';
});
$('btn-share').addEventListener('click', async () => {
  if (!cardCanvas) return;
  const r = await SHARE.shareCard(cardCanvas, shareText(), `forkwood-${lastSum.hash}.png`);
  let copiedText = false;
  if (r !== 'shared' && r !== 'cancelled') {
    try { if (r !== 'copied') { await navigator.clipboard.writeText(shareText()); copiedText = true; } } catch { /* ignore */ }
  }
  $('share-msg').textContent = { shared: 'Shared!', copied: 'Image copied: paste it into your post.', downloaded: copiedText ? 'Image saved and caption copied.' : 'Image saved.', cancelled: '', failed: 'Could not share on this browser.' }[r] || '';
});
// title screen: clicking empty space starts the game too
$('title').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .hub-art, .rail, .tabbar')) return; // META-V2
  sound.unlock();
  playMain();
});

window.addEventListener('resize', () => { renderer.resize(); frozen = false; });
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
  else if (fx.slowmo > 0) { fx.slowmo -= dt; sdt *= 0.35; } // P6-TRAPS near-miss slow-mo
  if (inp.toggle || inp.charm) sdt = Math.max(sdt, 1 / 240); // never swallow a tap during a freeze
  step(sim, sdt, inp);
  handleEvents(sim, false);
  sound.onEvents(sim.events); // V2-INT: v2 sim events (rides, rings, set pieces, bosses, world traps) -> SFX/music
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsVal = 60, frameMs = 0;
// v2 ENGINE: frame-interval telemetry (p50/p95 over the last 240 frames) + ?debug overlay
const frameRing = new Float32Array(240); let frameRingN = 0;
function framePct(q) { const n = Math.min(frameRingN, frameRing.length); if (!n) return 0; const a = Array.from(frameRing.subarray(0, n)).sort((x, y) => x - y); return a[Math.min(n - 1, Math.floor(q * n))]; }
const debugEl = params.has('debug') ? (() => { const d = document.createElement('div'); d.id = 'fw-debug'; d.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;font:11px/1.35 ui-monospace,monospace;color:#d8ffe8;background:rgba(6,10,14,.78);padding:5px 7px;border-radius:6px;pointer-events:none;white-space:pre'; document.body.appendChild(d); return d; })() : null;
let debugT = 0;

let introUp = false, frozen = false; // v1.0.1 PERF: the story covers the screen; don't paint the world under it
function frame(nowMs) {
  const t0 = performance.now();
  // feed the quality governor real frame intervals while the world is what's on screen
  if (!introUp && !paused && (mode === 'play' || mode === 'title') && document.visibilityState === 'visible') quality.sample(nowMs - last);
  let dt = (nowMs - last) / 1000;
  if (nowMs - last > 0 && nowMs - last < 1000) { frameRing[frameRingN % frameRing.length] = nowMs - last; frameRingN++; }
  if (debugEl && nowMs - debugT > 250) { debugT = nowMs; const g = renderer.gl, P = window.forkwood.perf; debugEl.textContent = `${P.renderer} ${Math.round(fpsVal)} fps  p50 ${P.p50.toFixed(1)}  p95 ${P.p95.toFixed(1)} ms\nframe ${frameMs.toFixed(1)} ms  gl ${g ? (g.stats.renderMs || 0).toFixed(1) : '-'} ms\ndraw calls ${P.drawCalls}  tex ${P.texMB} MB  q ${quality.mode}:${quality.tier} dpr ${renderer.dpr}\nworld ${P.world}  parts ${P.particles}`; }
  last = nowMs;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 1 / 30);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { fpsVal = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }

  const base = renderer.baseScale();
  // v1.0.1: a modal over the title (maps, shop/goals, quests, grove) freezes the demo world:
  // one clean frame (no traps, coins or banners), dimmed, then no redraws until it closes
  const modal = mode === 'title' && !introUp && !!document.querySelector('#maps.show, #meta.show, #questmap.show, #grove.show, #room.show, #title.hub.show'); // META-V2: the museum wall is opaque, so the demo world freezes under it
  if (modal) {
    if (!frozen) { frozen = true; renderer.draw(sim, cam, fx, { hud: false, hints: false, coach: null, bestM: 0, reveal: true, calm: true, mirror: mirrored(), finishM: 0, clock: null }); renderer.veil(0.45); }
    frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
    requestAnimationFrame(frame);
    return;
  }
  frozen = false;
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
    else inp = { targetX: input.dir !== 0 ? null : input.targetX, dir: mirrored() ? -input.dir : input.dir, toggle: input.toggle, charm: input.charm };
    input.toggle = false; input.charm = false;
    playTick(dt, inp);
    if (raceUI && raceUI.active) raceUI.tick(sim, heightM(sim), dt); // P6-RACE
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
      // P8-ECON: second chance (gems, cost doubles each time in a run)
      if (sim.deathT > 0.5 && !deathShown && !reviveAsked && sim.econ && sim.end === 'sap') {
        reviveAsked = true;
        rv.offer(sim.revives, (yes, via) => { if (yes && (via === 'ad' || EC.payRevive(S, sim.revives) !== false) && reviveSim(sim)) { persist(false); reviveAsked = false; fx.banner = { text: 'SECOND CHANCE', sub: 'sap refilled · the way ahead is clear', t: 0, max: 1.6, small: true }; sound.sprout(); } });
      }
      if (sim.deathT > 1.1 && !deathShown && !rv.open && (sim.dead)) showGameOver();
    }
  } else if (mode === 'over') {
    step(sim, dt, {});
    if (raceUI && raceUI.active) raceUI.tick(sim, heightM(sim), dt); // P6-RACE
    cam.scale += (base * 0.42 - cam.scale) * Math.min(1, dt * 2);
    cam.anchor += (0.32 - cam.anchor) * Math.min(1, dt * 2);
  }
  if (!paused) updateFx(dt);
  introUp = document.body.classList.contains('intro-hold');
  // V2-INT fix: the next frame is booked before drawing, so a draw error can never freeze the game
  requestAnimationFrame(frame);
  try { drawFrame(dt); } catch (e) { if (!frameErr) { frameErr = 1; console.warn('[forkwood] frame draw failed, continuing:', e && e.message); } }
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
}
let frameErr = 0;
function drawFrame(dt) {
  if (!introUp) renderer.draw(sim, cam, fx, {
    hud: mode === 'play',
    hints: false,
    coach: coachView(sim),
    bestM: mode === 'title' ? 0 : sim.bestM,
    bestLabel: isChallengeRun() ? 'FRIEND' : 'BEST',
    daily,
    modeLabel: mode === 'play' ? runLabel() : '',
    finishM: sim.finishM || 0,
    clock: sim.R && sim.R.timeLimit ? Math.max(0, sim.R.timeLimit - sim.t) : null,
    mirror: mirrored(),
    reveal: mode === 'title', // v1.0.1: the title demo shows only the world + vine (no thorns, coins, beetles under the menu)
    calm: isCalm(),
    acornPulse: fx.acornPulse || 0,
    touch: input.kind === 'touch',
    raceDraw: raceUI && raceUI.racing && run.mode === 'race' ? raceUI.draw : null, // P6-RACE
    ghostM: mode === 'play' && CHALLENGE && CHALLENGE.duel && isChallengeRun() ? R.ghostHeight(CHALLENGE.duel, sim.t) : null,
  });
  if (!introUp) SEA.drawOverlay(renderer, sim, SEASON.theme, paused ? 0 : dt, isCalm()); // P6-SEASONS
}

// testing hooks (used by tests/smoke.mjs)
export const VERSION = '2.0.0-preview';
window.forkwood = {
  version: VERSION,
  get mode() { return mode; },
  get paused() { return paused; },
  get sim() { return sim; },
  get fps() { return fpsVal; },
  get frameMs() { return frameMs; },
  // v2 ENGINE telemetry: rAF interval percentiles, GPU draw calls, texture MB, renderer in use
  get perf() { const g = renderer.gl; return { renderer: g ? g.backend : 'canvas2d', glWhy: renderer.glWhy || null, fps: fpsVal, frameMs, p50: framePct(0.5), p95: framePct(0.95), drawCalls: g ? g.stats.drawCalls : null, texMB: g ? g.stats.texMB : null, renderMs: g ? g.stats.renderMs : null, world: g ? g.worldId : null, particles: g ? g.flow.length + g.amb.length + (g.fxDrawn || 0) : fx.particles.length }; },
  resetPerf() { frameRingN = 0; },
  get gfx() { return renderer.gl; },
  setWorld: (id) => import('./worlds.js').then((m) => m.setWorld(id)),
  get quality() { return { mode: quality.mode, tier: quality.tier, dpr: renderer.dpr, blur: quality.blur, frozen, log: quality.log }; },
  setQuality: (m) => { quality.setMode(m); refreshTitle(); return quality.mode; },
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
  get run() { return run; },
  get seasons() { return { list: SEASON.list, theme: SEASON.theme, run: runSeasons, api: SEA }; }, // P6-SEASONS
  get quest() { return Q; },
  get qui() { return qui; },
  get gui() { return gui; },
  get retention() { return R; },
  get duel() { return DUEL; },
  get race() { return raceUI; }, // P6-RACE
  get dirMode() { return dirMode; }, // P6-TRAPS
  get director() { return runDirector; }, // P6-TRAPS
  get backdropTheme() { return backdrop.theme; }, // P6-ART x P6-SEASONS
  loadRaceUI: () => loadRaceUI(), // P6-RACE
  get session() { return SESSION; },
  duelUrl: () => duelUrl(),
  loadGroveUI,
  replayStory: () => replayStory(),
  loadQuestUI,
  startLevel: (id) => startLevel(id),
  startMode: (id) => startMode(id),
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
  // screenshots only: fast-forward until the tree reaches `m` metres
  fastTo: (m, skill = 0.95) => {
    const b = createBot(skill, 99);
    for (let i = 0; i < 60 * 600 && !sim.dead && heightM(sim) < m; i++) { step(sim, 1 / 60, botInput(b, sim)); sim.sap = Math.max(sim.sap, 60); }
    cam.y = sim.cy; fx.shownScore = sim.score;
    return heightM(sim);
  },
};

startDemo();
setMode('title');
refreshTitle();
document.querySelector('#btn-grove .fl').innerHTML = ICON.flame;
$('btn-grove').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); sound.startMenu(); sound.page(); gui.show('streak'); });
// P6-RACE: live race (loads race code + PeerJS only when used)
function loadRaceUI() {
  if (raceUI) return Promise.resolve(raceUI);
  raceLoading = raceLoading || Promise.all([import('./ui-race.js'), loadCss('race.css')]).then(([{ createRaceUI }]) => (raceUI = createRaceUI({
    transport: RACE_RT, sound,
    getMe: () => ({ name: S.ret.name || '', p: (R.PORTRAIT[S.ret.avatar.portrait] || R.PORTRAIT.sparrow).i, f: (R.FRAME[S.ret.avatar.frame] || R.FRAME.twig).i }),
    onStart: (seed, rules) => { raceSeed = seed; raceRules = rules; run = { mode: 'race', stake: 'sapling', level: null, week: null }; $('title').classList.remove('show'); startRun(false); },
    onExit: () => toMenu(),
    onFallback: (seed) => { location.href = `${location.pathname}?seed=${seed}&fb=race`; },
  })));
  return raceLoading;
}
function openRace(room) {
  if (!room) sound.unlock(); // a race link opens without a gesture: audio waits for the Ready tap
  $('title').classList.remove('show');
  return loadRaceUI().then((r) => (room ? r.join(room) : r.host()));
}
$('btn-race').addEventListener('click', (e) => { e.stopPropagation(); openRace(null); });
if (RACE_ROOM) {
  import('./race.js').then(({ parseRoom }) => { const room = parseRoom(RACE_ROOM); if (room) openRace(room); else ui.toast('That race link is broken. Ask your friend for a new one.', 'badge'); });
}
if (params.get('fb') === 'race') setTimeout(() => ui.toast('Live race could not connect. Grow this course, then tap Duel to send your friend the same tree.', 'gift'), 1700);
// P6-RACE end
$('btn-story').addEventListener('click', (e) => { e.stopPropagation(); sound.unlock(); replayStory(); });
// P8-MAPS: map chip + carousel on the title; the chosen map themes the backdrop and the postcard
// v1.0: maps are owned through the save (S.econ.maps), bought with acorns
{ const E0 = EC.ensureEcon(S), legacy = MAPS_API.takeLegacyOwned(); if (legacy.length) { for (const id of legacy) if (EC.MAP_PRICE[id] && !E0.maps.includes(id)) E0.maps.push(id); persist(false); } }
MAPS_API.setOwnership({ owned: () => EC.ensureEcon(S).maps, level: () => S.level | 0,
  grant: (id) => { const E1 = EC.ensureEcon(S); if (EC.MAP_PRICE[id] && !E1.maps.includes(id)) { E1.maps.push(id); persist(false); } } });
const mapBuy = createMapBuy({ getSave: () => S, sound, maps: MAPS_API, toast: (t, k) => ui.toast(t, k),
  buy: (id) => { const paid = EC.buyMap(S, id); if (paid) persist(false); return paid; },
  onBought: (m) => { MAPS_API.grantMap(m.id); MAPS_API.select(m.id); ui.refreshBar('title'); } }); // grantMap is a no-op on the save here (buyMap already added it); it re-renders
window.addEventListener('forkwood:map-unlock', (e) => { const d = (e && e.detail) || {}; if (d.id) mapBuy.offer(d.id); });
const mapsUI = createMapsUI({ sound, onPlay: () => $('btn-play').click() });
if (window.forkwood) window.forkwood.maps = mapsUI;
// META-V2: museum hub (home painting, rails, 5 tabs, rooms, store sheets)
hub = createHub({ getSave: () => S, persist, sound, isCalm, getMode: () => mode,
  selectWorld: (id, legacy) => { try { if (MAPS_API.isUnlocked(legacy)) MAPS_API.select(legacy); } catch { /* v1 slot carry-over only */ } },
  onPlay: () => playMain(), toast: (t, k) => ui.toast(t, k), openGoals: (t) => ui.show(t), openOldShop: (v) => ui.showShop(v), openGrove: (t) => gui.show(t),
  refreshBar: () => ui.refreshBar(mode) });
window.forkwood.hub = hub; Object.defineProperty(window.forkwood, 'store', { get: () => hub.ST, configurable: true }); // store.js loads on idle (first-load budget)
hub.refresh(mode);
// V2-INT: menu events -> engine, economy, audio
window.addEventListener('forkwood:world-select', (e) => { const id = e && e.detail && e.detail.id; if (!WORLD_IDS.includes(id)) return; if (mode === 'title') startDemo(); else showWorld(id); });
window.addEventListener('forkwood:vine-skin', () => applySkin());
window.addEventListener('forkwood:world-trial', (e) => { const id = e && e.detail && e.detail.id; if (!WORLD_IDS.includes(id)) return; trialWorld = id; if (hub) hub.closeRoom(); startMode('classic'); });
applyLowMem();
if (mode === 'title') showWorld(selectedWorld());
if (FIRST_LAUNCH) {
  // the story, then straight into the first (tutorial) run; the menu appears only after it
  document.body.classList.add('intro-hold');
  $('title').classList.remove('show');
  $('press').classList.add('done');
  import('./intro.js').then(({ playIntro }) => playIntro({ calm: isCalm(), sound, onDone: (why) => {
    S.ret.introSeen = true; persist(false);
    document.body.classList.remove('intro-hold');
    window.forkwood.introEnd = why;
    startMode('classic');
  } })).catch(() => { document.body.classList.remove('intro-hold'); $('title').classList.add('show'); });
} else {
  // the print pull: the paper sheet lifts off the first frame (skipped in calm mode)
  setTimeout(() => $('press').classList.add('done'), BOT_MODE || isCalm() ? 0 : 1400);
}
{
  // what happened while you were away (shown once the title is up)
  const notes = [];
  if (SESSION.comeback) notes.push([`Welcome back after ${SESSION.comeback.days} days: +${SESSION.comeback.acorns} acorns${SESSION.comeback.freeze ? ' and a frost guard' : ''}`, 'gift']);
  if (SESSION.league) { const L = SESSION.league; notes.push([`League week over: #${L.rank} in ${R.TIERS[L.from]}${L.to > L.from ? `, promoted to ${R.TIERS[L.to]}` : L.to < L.from ? `, down to ${R.TIERS[L.to]}` : ''} · +${L.acorns} acorns`, 'badge']); }
  if (REPLY) notes.push([`${REPLY.from} answered your duel: ${REPLY.theirs} m vs your ${REPLY.mine} m. ${REPLY.won ? 'You win' : 'They win'}: +${REPLY.acorns} acorns`, 'gift']);
  if (notes.length && !FIRST_LAUNCH) { persist(false); notes.forEach(([t, k], i) => setTimeout(() => ui.toast(t, k), 1700 + i * 900)); }
}
if (S.migrationBonus) { const n = S.migrationBonus; delete S.migrationBonus; persist(false); setTimeout(() => ui.toast(`Welcome back: +${n} acorns for the ${S.stats.meters.toLocaleString('en-US')} m you already grew`, 'gift'), 1600); }
requestAnimationFrame((t) => { last = t; frame(t); });
