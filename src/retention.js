// Forkwood retention layer: streak milestones, a free season track, a weekly
// practice league against seeded ghost growers, avatars, comeback gifts and
// async duel links. Pure functions over the save, no network, no money: every
// reward is earned by playing, and the league says plainly that its rivals are
// simulated. Runs the same in the browser and in node tests.

// ------------------------------------------------------------------ dates (UTC)
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dn = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  const fy = t.getUTCFullYear(), ft = new Date(Date.UTC(fy, 0, 4));
  const wk = 1 + Math.round(((t - ft) / 864e5 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7);
  return `${fy}-W${String(wk).padStart(2, '0')}`;
}
/** Monday 00:00 UTC of the ISO week containing d. */
export function weekStart(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t;
}
export const seasonKey = (d = new Date()) => d.toISOString().slice(0, 7); // one season per UTC month
export function seasonEndsIn(d = new Date()) {
  const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return e - d;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const seasonName = (key) => { const [y, m] = key.split('-'); return `${MONTHS[(+m - 1) % 12] || ''} ${y}`; };
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ avatar catalogue
// portraits are cells of assets/art/critters.webp (same order)
export const PORTRAITS = [
  { id: 'sparrow', name: 'Sparrow', unlock: { free: true } },
  { id: 'squirrel', name: 'Squirrel', unlock: { free: true } },
  { id: 'owl', name: 'Barn owl', unlock: { season: 6 } },
  { id: 'fox', name: 'Fox', unlock: { streak: 7 } },
  { id: 'snail', name: 'Snail', unlock: { season: 12 } },
  { id: 'moth', name: 'Luna moth', unlock: { league: 2 } },
  { id: 'frog', name: 'Tree frog', unlock: { season: 18 } },
  { id: 'beetle', name: 'Stag beetle', unlock: { season: 24 } },
];
export const FRAMES = [
  { id: 'twig', name: 'Twig', unlock: { free: true } },
  { id: 'ochre', name: 'Ochre ring', unlock: { season: 3 } },
  { id: 'leaf', name: 'Leaf wreath', unlock: { season: 9 } },
  { id: 'blossom', name: 'Blossom', unlock: { streak: 14 } },
  { id: 'frost', name: 'Hoarfrost', unlock: { season: 15 } },
  { id: 'canopy', name: 'Canopy gold', unlock: { league: 4 } },
  { id: 'star', name: 'Starlight', unlock: { season: 30 } },
  { id: 'gilded', name: 'Gilded', unlock: { streak: 100 } },
];
export const PORTRAIT = Object.fromEntries(PORTRAITS.map((p, i) => [p.id, { ...p, i }]));
export const FRAME = Object.fromEntries(FRAMES.map((p, i) => [p.id, { ...p, i }]));

// ------------------------------------------------------------------ league
export const TIERS = ['Seedling', 'Sprout', 'Sapling', 'Bough', 'Canopy', 'Treetop', 'Ancient'];
const TIER_BASE = [110, 200, 320, 480, 680, 950, 1300]; // typical ghost weekly rings per tier
export const PROMOTE = 3, DEMOTE = 2, LEAGUE_SIZE = 10;
const GHOSTS = ['Moss', 'Fern', 'Juniper', 'Hazel', 'Rowan', 'Alder', 'Briar', 'Clover', 'Linden', 'Sorrel', 'Tansy', 'Yarrow', 'Willow', 'Aspen', 'Cedar', 'Ivy', 'Laurel', 'Sage', 'Thistle', 'Bracken', 'Wren', 'Birch', 'Poppy', 'Larch'];
/** Nine ghost growers for a week and tier: same for everyone, from the week's seed. */
export function rivals(week, tier) {
  const r = rng(fnv(`league:${week}:${tier}`));
  const used = new Set(), out = [];
  for (let i = 0; i < LEAGUE_SIZE - 1; i++) {
    let n; do n = GHOSTS[Math.floor(r() * GHOSTS.length)]; while (used.has(n)); used.add(n);
    const final = Math.round(TIER_BASE[tier] * (0.28 + 1.45 * Math.pow(r(), 1.25)));
    out.push({ name: n, portrait: Math.floor(r() * PORTRAITS.length), final, pace: 0.75 + r() * 0.5, ghost: true });
  }
  return out;
}
/** A ghost's score at a moment of its week: they grow in daily steps toward their final. */
export function ghostScore(g, week, now = new Date()) {
  const cur = isoWeek(now);
  if (cur > week) return g.final;
  if (cur < week) return 0;
  const frac = Math.min(1, Math.max(0, (now - weekStart(now)) / (7 * 864e5)));
  const steps = Math.floor(frac * 28) / 28; // six-hour steps
  return Math.round(g.final * Math.min(1, Math.pow(steps, g.pace) * 1.02));
}
export function standings(S, now = new Date()) {
  const L = S.ret.league;
  const list = rivals(L.week, L.tier).map((g) => ({ ...g, score: ghostScore(g, L.week, now) }));
  list.push({ name: S.ret.name || 'You', you: true, portrait: (PORTRAIT[S.ret.avatar.portrait] || PORTRAIT.sparrow).i, score: L.xp });
  list.sort((a, b) => b.score - a.score || (a.you ? -1 : b.you ? 1 : 0));
  return list;
}
/** Settle the stored week if a new one has started. Returns the result to show, or null. */
export function resolveLeague(S, now = new Date()) {
  const L = S.ret.league, cur = isoWeek(now);
  if (!L.week) { L.week = cur; return null; }
  if (L.week === cur) return null;
  let res = null;
  if (L.xp > 0) {
    const finals = rivals(L.week, L.tier).map((g) => g.final);
    const rank = 1 + finals.filter((f) => f > L.xp).length;
    const from = L.tier;
    let to = from;
    if (rank <= PROMOTE && from < TIERS.length - 1) to = from + 1;
    else if (rank > LEAGUE_SIZE - DEMOTE && from > 0) to = from - 1;
    const acorns = rank === 1 ? 120 + 40 * from : rank <= PROMOTE ? 80 + 30 * from : rank <= 6 ? 30 + 10 * from : 10;
    S.acorns += acorns; S.earned += acorns;
    let freeze = false;
    if (to > from && S.streak.freezes < 2) { S.streak.freezes++; freeze = true; }
    L.tier = to;
    L.best = Math.max(L.best, to);
    res = { week: L.week, from, to, rank, xp: L.xp, acorns, freeze };
    L.history.unshift({ w: L.week, t: from, r: rank }); L.history.length = Math.min(L.history.length, 8);
  }
  L.week = cur; L.xp = 0;
  L.result = res;
  return res;
}

// ------------------------------------------------------------------ season track
export const SEASON_TIERS = 30;
export const tierCost = (t) => (t <= 5 ? 60 : 100); // rings to go from tier t-1 to t
export function tierAt(xp) { let t = 0, need = tierCost(1); while (t < SEASON_TIERS && xp >= need) { xp -= need; t++; need = tierCost(t + 1); } return { tier: t, into: xp, need: t < SEASON_TIERS ? need : 0 }; }
// rewards by tier; items are cosmetic ids (skins live in skins.js, avatar bits here)
export const SEASON_REWARDS = {
  3: { item: 'frame.ochre' }, 4: { item: 'trail.pollen' }, 6: { item: 'portrait.owl' }, 8: { freeze: 1 }, 9: { item: 'frame.leaf' },
  10: { item: 'trail.petals' }, 12: { item: 'portrait.snail' }, 13: { item: 'leaf.sakura' }, 15: { item: 'frame.frost' }, 16: { item: 'blossom.lotus' },
  18: { item: 'portrait.frog', freeze: 1 }, 21: { item: 'bark.mossy' }, 24: { item: 'portrait.beetle' }, 27: { item: 'trail.stardust' }, 30: { item: 'frame.star', acorns: 300 },
};
export const tierAcorns = (t) => (SEASON_REWARDS[t] && SEASON_REWARDS[t].acorns) || (SEASON_REWARDS[t] && SEASON_REWARDS[t].item ? 0 : 20 + t * 2);
/** Rings for one finished run (season and league both count them). */
export function runRings(sum, out = {}, firstToday = false) {
  const parts = [['run', 10], ['height', Math.floor((sum.height || 0) / 10)]];
  const goals = (out.goalsDone || []).length, lv = (out.levelUps || []).length, ch = (out.daily || []).length + (out.weekly || []).length;
  if (goals) parts.push(['goals', 8 * goals]);
  if (lv) parts.push(['level up', 15 * lv]);
  if (ch) parts.push(['challenges', 6 * ch]);
  if (firstToday) parts.push(['first run today', 20]);
  const total = Math.min(160, parts.reduce((a, p) => a + p[1], 0));
  return { total, parts };
}

// ------------------------------------------------------------------ streak milestones
export const STREAK_MILESTONES = [
  { d: 3, acorns: 30 }, { d: 7, acorns: 60, item: 'portrait.fox' }, { d: 14, acorns: 100, item: 'frame.blossom' },
  { d: 30, acorns: 200, item: 'trail.fireflies' }, { d: 60, acorns: 300 }, { d: 100, acorns: 500, item: 'frame.gilded' },
];
/** Call after the streak count changed; pays any milestone reached for the first time. */
export function streakMilestones(S) {
  ensure(S);
  const got = [];
  for (const m of STREAK_MILESTONES) {
    if (S.streak.count >= m.d && !S.ret.streakMs.includes(m.d)) {
      S.ret.streakMs.push(m.d);
      S.acorns += m.acorns; S.earned += m.acorns;
      if (m.item) grantItem(S, m.item);
      got.push(m);
    }
  }
  return got;
}
export const nextMilestone = (S) => STREAK_MILESTONES.find((m) => !S.ret.streakMs.includes(m.d) && m.d > S.streak.count) || null;

// ------------------------------------------------------------------ save block
export function freshRet() {
  return {
    v: 1, name: '',
    avatar: { portrait: 'sparrow', frame: 'twig', badge: '' },
    owned: ['portrait.sparrow', 'portrait.squirrel', 'frame.twig'],
    days: [], lastDay: '', comeback: null,
    streakMs: [],
    season: { id: '', xp: 0, tier: 0, best: 0 },
    league: { week: '', tier: 0, xp: 0, best: 0, result: null, history: [] },
    duels: { sent: [], done: [] },
    introSeen: false,
  };
}
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
/** Create or repair S.ret in place (old saves get a fresh block; broken fields are reset). */
export function ensure(S) {
  const F = freshRet();
  if (!isObj(S.ret)) S.ret = F;
  const R = S.ret;
  for (const k of Object.keys(F)) if (R[k] === undefined || (F[k] !== null && (R[k] === null || typeof R[k] !== typeof F[k])) || Array.isArray(R[k]) !== Array.isArray(F[k])) R[k] = F[k];
  for (const k of ['season', 'league', 'duels', 'avatar']) for (const j of Object.keys(F[k])) if (R[k][j] === undefined || (F[k][j] !== null && (R[k][j] === null || typeof R[k][j] !== typeof F[k][j] || Array.isArray(R[k][j]) !== Array.isArray(F[k][j])))) R[k][j] = F[k][j];
  R.name = cleanName(R.name);
  R.owned = [...new Set(R.owned.filter((x) => typeof x === 'string').concat(F.owned))];
  if (!PORTRAIT[R.avatar.portrait] || !R.owned.includes('portrait.' + R.avatar.portrait)) R.avatar.portrait = 'sparrow';
  if (!FRAME[R.avatar.frame] || !R.owned.includes('frame.' + R.avatar.frame)) R.avatar.frame = 'twig';
  if (typeof R.avatar.badge !== 'string') R.avatar.badge = '';
  R.league.tier = Math.max(0, Math.min(TIERS.length - 1, Math.floor(+R.league.tier) || 0));
  R.league.xp = Math.max(0, Math.floor(+R.league.xp) || 0);
  R.season.xp = Math.max(0, Math.floor(+R.season.xp) || 0);
  R.days = R.days.filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).slice(-120);
  R.duels.sent = R.duels.sent.filter(isObj).slice(-30);
  R.duels.done = R.duels.done.filter(isObj).slice(-60);
  return R;
}
export const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12);

/** Grant a cosmetic: avatar bits go into S.ret.owned, skins into S.owned. Returns false if already owned. */
export function grantItem(S, id) {
  const [kind] = id.split('.');
  if (kind === 'portrait' || kind === 'frame') {
    if (S.ret.owned.includes(id)) return false;
    S.ret.owned.push(id); return true;
  }
  if (S.owned.includes(id)) return false;
  S.owned.push(id); return true;
}
export function itemUnlocked(S, u) {
  if (!u) return false;
  if (u.free) return true;
  if (u.season) return (S.ret.season.best || 0) >= u.season;
  if (u.streak) return (S.streak.best || 0) >= u.streak;
  if (u.league) return (S.ret.league.best || 0) >= u.league;
  return false;
}
export function unlockLabel(u) {
  if (!u) return '';
  if (u.free) return 'Starter';
  if (u.season) return `Season tier ${u.season}`;
  if (u.streak) return `${u.streak}-day streak`;
  if (u.league) return `Reach ${TIERS[u.league]} league`;
  return '';
}
/** Re-derive avatar unlocks from bests (keeps things owned even if a reward was missed). */
export function syncAvatar(S) {
  const got = [];
  for (const [list, kind] of [[PORTRAITS, 'portrait'], [FRAMES, 'frame']]) for (const it of list) if (itemUnlocked(S, it.unlock) && grantItem(S, `${kind}.${it.id}`)) got.push(`${kind}.${it.id}`);
  return got;
}
export function setAvatar(S, part, id) {
  const ok = part === 'portrait' ? PORTRAIT[id] && S.ret.owned.includes('portrait.' + id)
    : part === 'frame' ? FRAME[id] && S.ret.owned.includes('frame.' + id)
    : part === 'badge' ? typeof id === 'string' : false;
  if (!ok) return false;
  S.ret.avatar[part] = id;
  return true;
}

// ------------------------------------------------------------------ daily presence + comeback
/**
 * Call once per session start. Marks today, settles a finished league week,
 * rolls the season over, and pays a comeback gift after 3+ days away.
 */
export function startSession(S, now = new Date()) {
  ensure(S);
  const R = S.ret, today = dayKey(now);
  const out = { comeback: null, league: resolveLeague(S, now), season: rollSeason(S, now) };
  if (R.lastDay && R.lastDay < today) {
    const gap = dayDiff(R.lastDay, today);
    if (gap >= 3) {
      const acorns = gap >= 7 ? 150 : 75, freeze = gap >= 7 && S.streak.freezes < 2;
      S.acorns += acorns; S.earned += acorns;
      if (freeze) S.streak.freezes++;
      out.comeback = R.comeback = { days: gap, acorns, freeze, day: today };
    }
  }
  if (R.lastDay < today) R.lastDay = today;
  return out;
}
export function rollSeason(S, now = new Date()) {
  const R = S.ret, key = seasonKey(now);
  if (R.season.id === key) return null;
  const prev = R.season.id ? { id: R.season.id, tier: R.season.tier } : null;
  R.season = { id: key, xp: 0, tier: 0, best: R.season.best || 0 };
  return prev;
}
export function markActive(S, now = new Date()) {
  const d = dayKey(now);
  if (!S.ret.days.includes(d)) { S.ret.days.push(d); S.ret.days = S.ret.days.slice(-120); }
}

/**
 * Apply one finished run. `out` is meta.finishRun's result; `claimGift` is
 * meta.claimGift (passed in to keep this module free of imports).
 * Returns what the game-over screen announces.
 */
export function afterRun(S, sum, out, claimGift, now = new Date()) {
  ensure(S);
  const res = { rings: null, tiers: [], items: [], gift: null, milestones: [], league: resolveLeague(S, now), seasonRolled: rollSeason(S, now), rank: null, prevRank: null };
  const today = dayKey(now);
  const firstToday = !S.ret.days.includes(today);
  markActive(S, now);
  if (S.ret.lastDay < today) S.ret.lastDay = today;
  // a finished run counts for the streak: open today's gift if it is still waiting
  if (claimGift && S.streak.last !== today) { res.gift = claimGift(S, today); if (res.gift && res.gift.milestones) res.milestones.push(...res.gift.milestones); }
  res.prevRank = standings(S, now).findIndex((r) => r.you) + 1;
  const rings = runRings(sum, out, firstToday);
  res.rings = rings;
  // season track: rewards are paid the moment a tier is reached (nothing to miss)
  const Se = S.ret.season, before = tierAt(Se.xp).tier;
  Se.xp += rings.total;
  const after = tierAt(Se.xp).tier;
  for (let t = before + 1; t <= after; t++) {
    const rw = SEASON_REWARDS[t] || {};
    let acorns = tierAcorns(t);
    if (rw.item && !grantItem(S, rw.item)) acorns += 40; // already owned from an earlier season
    if (rw.item) res.items.push(rw.item);
    if (rw.freeze && S.streak.freezes < 2) S.streak.freezes++;
    S.acorns += acorns; S.earned += acorns;
    res.tiers.push({ tier: t, acorns, item: rw.item || null, freeze: !!rw.freeze });
  }
  Se.tier = after; Se.best = Math.max(Se.best || 0, after);
  S.ret.league.xp += rings.total;
  res.rank = standings(S, now).findIndex((r) => r.you) + 1;
  res.items.push(...syncAvatar(S));
  return res;
}

// ------------------------------------------------------------------ duels (async, by link)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return s;
}
function fromB64(s) {
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => (i + k < s.length ? B64.indexOf(s[i + k]) : -2));
    if (c.some((v) => v === -1)) return null;
    const n = (c[0] << 18) | (c[1] << 12) | ((c[2] < 0 ? 0 : c[2]) << 6) | (c[3] < 0 ? 0 : c[3]);
    out.push((n >> 16) & 255); if (c[2] >= 0) out.push((n >> 8) & 255); if (c[3] >= 0) out.push(n & 255);
  }
  return out;
}
const utf8 = (s) => Array.from(new TextEncoder().encode(s));
const unutf8 = (b) => new TextDecoder().decode(new Uint8Array(b));
export const newDuelId = (r = Math.random) => Array.from({ length: 6 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(r() * 36)]).join('');
/** d: { id, seed, h, sc, t, mode, stake, p, f, n, r, rh } → URL-safe code with a checksum. */
export function encodeDuel(d) {
  const body = ['1', d.id, d.seed >>> 0, Math.floor(d.h) | 0, Math.floor(d.sc) | 0, Math.round((d.t || 0) * 10) | 0, d.mode || 'classic', d.stake || 'sapling', d.p | 0, d.f | 0, cleanName(d.n), d.r || '', Math.floor(d.rh || 0) | 0].join('~');
  const b = toB64(utf8(body));
  return b + '.' + (fnv(b) % 46656).toString(36).padStart(3, '0');
}
export function decodeDuel(code) {
  if (typeof code !== 'string' || code.length > 400) return null;
  const [b, ck] = code.split('.');
  if (!b || !ck || (fnv(b) % 46656).toString(36).padStart(3, '0') !== ck) return null;
  const bytes = fromB64(b);
  if (!bytes) return null;
  let f;
  try { f = unutf8(bytes).split('~'); } catch { return null; }
  if (f.length !== 13 || f[0] !== '1' || !/^[0-9a-z]{6}$/.test(f[1])) return null;
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.floor(n) : null; };
  const d = { id: f[1], seed: num(f[2], 4294967295), h: num(f[3], 99999), sc: num(f[4], 99999999), t: (num(f[5], 99999) ?? 0) / 10, mode: f[6], stake: f[7], p: num(f[8], PORTRAITS.length - 1) ?? 0, f: num(f[9], FRAMES.length - 1) ?? 0, n: cleanName(f[10]), r: /^[0-9a-z]{6}$/.test(f[11]) ? f[11] : '', rh: num(f[12], 99999) ?? 0 };
  if (d.seed == null || d.h == null || d.sc == null || !/^[a-z]{2,10}$/.test(d.mode) || !/^[a-z]{2,10}$/.test(d.stake)) return null;
  return d;
}
/** The sender keeps the ids of duels they sent, so a reply link can settle them. */
export function registerSent(S, d, now = new Date()) {
  ensure(S);
  if (S.ret.duels.sent.some((x) => x.id === d.id)) return;
  S.ret.duels.sent.push({ id: d.id, h: d.h, d: dayKey(now), res: null });
  S.ret.duels.sent = S.ret.duels.sent.slice(-30);
}
export const DUEL_WIN = 40, DUEL_PLAY = 15;
/** Recipient finished a duel run. Rewards once per duel id. */
export function settleDuelRun(S, d, sum) {
  ensure(S);
  const won = sum.height > d.h;
  const seen = S.ret.duels.done.find((x) => x.id === d.id && x.as === 'racer');
  if (seen) { if (won && !seen.won) { seen.won = true; seen.mine = sum.height; } return { won, acorns: 0, repeat: true }; }
  const acorns = won ? DUEL_WIN : DUEL_PLAY;
  S.acorns += acorns; S.earned += acorns;
  S.ret.duels.done.push({ id: d.id, as: 'racer', from: d.n || 'a friend', theirs: d.h, mine: sum.height, won });
  return { won, acorns, repeat: false };
}
/** Opening a reply to a duel you sent settles it on your device (once). */
export function settleReply(S, d) {
  ensure(S);
  if (!d.r) return null;
  const sent = S.ret.duels.sent.find((x) => x.id === d.r);
  if (!sent || S.ret.duels.done.some((x) => x.id === d.id && x.as === 'sender')) return null;
  const mine = sent.h, theirs = d.h, won = mine >= theirs;
  const acorns = won ? DUEL_WIN : DUEL_PLAY;
  S.acorns += acorns; S.earned += acorns;
  sent.res = won ? 'win' : 'lose';
  S.ret.duels.done.push({ id: d.id, as: 'sender', from: d.n || 'your friend', theirs, mine, won });
  return { won, acorns, mine, theirs, from: d.n || 'your friend' };
}
/** The friend line for a duel: where the rival's tip was at time t (average pace). */
export const ghostHeight = (d, t) => (d && d.t > 0 ? Math.min(d.h, (d.h / d.t) * t) : null);

/** Inline markup for an avatar (portrait cell of critters.webp inside its frame). */
export function avatarHTML(portrait = 'sparrow', frame = 'twig', size = 40) {
  const p = PORTRAIT[portrait] || PORTRAIT.sparrow, f = FRAME[frame] ? frame : 'twig';
  return `<span class="avatar fr-${f}" style="--s:${size}px"><i style="background-position:${(p.i / (PORTRAITS.length - 1)) * 100}% 0"></i></span>`;
}
