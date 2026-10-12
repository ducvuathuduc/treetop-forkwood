// Forkwood seasons (P6): time-of-day and seasonal maps from the player's LOCAL clock.
//
//   active(date)            -> { list, theme }   pure + deterministic (inject any Date)
//   applyRules(rules, list, { fair }) -> rules   gameplay modifiers (none when fair)
//   isFair(ctx)             -> true for daily / weekly / race / quest levels / challenge + duel links
//   untilText(until, now)   -> 'open until 05:00 · 3 h 12 m left'
//   drawOverlay(...)        -> cosmetic particles over the canvas (no DOM at import time)
//
// The theme object is shaped for the backdrop's planned API: backdrop.setTheme(theme.palette).
// Fair modes keep the cosmetic tint and particles; modifiers that change difficulty
// or score (score ×, fireflies, envelopes, wind, slippery branches, twin storms) stay OFF there.
import { STORMS } from './sim.js';

// Lunar New Year (Tết) day 1, local calendar. Window: 7 days before to 7 days after.
export const TET_TABLE = { 2026: [1, 17], 2027: [1, 6], 2028: [0, 26] }; // [monthIndex, day]
export const TET_BEFORE = 7, TET_AFTER = 7;

export const SEASONS = {
  night:  { id: 'night',  name: 'Firefly Night', kind: 'time',   icon: 'firefly',  effect: 'fireflies count as sunlight', when: '19:00–05:00' },
  dawn:   { id: 'dawn',   name: 'Golden Dawn',   kind: 'time',   icon: 'dawn',     effect: 'points ×1.5', when: '05:00–07:00' },
  autumn: { id: 'autumn', name: 'Autumn Maple',  kind: 'season', icon: 'maple',    effect: 'stronger leaf wind', when: 'Sep–Nov' },
  winter: { id: 'winter', name: 'Winter Snow',   kind: 'season', icon: 'snow',     effect: 'slippery branches', when: 'Dec–Feb' },
  tet:    { id: 'tet',    name: 'Tết',           kind: 'festival', icon: 'envelope', effect: 'red envelopes: 3 acorns', when: 'Lunar New Year' },
  storm:  { id: 'storm',  name: 'Twin Storm',    kind: 'event',  icon: 'storm',    effect: 'storms come twice · ×1.25', when: 'Sat–Sun' },
};

// Gameplay modifiers per season (merged into sim RULES; see the P6-SEASONS hooks in sim.js).
export const MODS = {
  night: { fireflies: 1 },
  dawn: { scoreK: 1.5 },
  autumn: { windK: 1.6 },
  winter: { slip: 0.45 },
  tet: { envelopes: 1 },
  storm: { twinStorms: true, scoreK: 1.25 },
};

// Cosmetic looks. palette: overrides for backdrop.setTheme; tint: a CSS layer over the canvas.
export const LOOKS = {
  night:  { tint: { color: '#141b3a', alpha: 0.48, blend: 'multiply' }, palette: { skyTop: '#0f1630', skyBottom: '#2b3560', haze: '#3b4a7a', light: '#cfe39a', accent: '#e8f59a' }, particles: ['fireflies'] },
  dawn:   { tint: { color: '#ffb35c', alpha: 0.22, blend: 'soft-light' }, palette: { skyTop: '#f7b06a', skyBottom: '#ffe3b0', haze: '#ffd08a', light: '#fff1c4', accent: '#f6c445' }, particles: ['motes'] },
  autumn: { tint: { color: '#d9792b', alpha: 0.14, blend: 'soft-light' }, palette: { leaf: '#d9792b', leaf2: '#b8452a', haze: '#f0c99a', accent: '#c8562a' }, particles: ['leaves'] },
  winter: { tint: { color: '#bcd6ee', alpha: 0.18, blend: 'soft-light' }, palette: { leaf: '#e8f2fa', leaf2: '#a9c6de', haze: '#dfeaf4', ground: '#f4f8fb', accent: '#7fb0d8' }, particles: ['snow'] },
  tet:    { tint: { color: '#e0392b', alpha: 0.08, blend: 'soft-light' }, palette: { accent: '#d62f22', gold: '#f2c14e', blossom: '#f7d23e', blossom2: '#f4a6b8' }, particles: ['blossoms'] },
  storm:  { tint: { color: '#4a5870', alpha: 0.12, blend: 'multiply' }, palette: { haze: '#8a97ad', accent: '#9fb3d6' }, particles: [] },
};
// Zone colour overrides in the backdrop's own keys (src/backdrop.js ZONES: top bot mass cloud deep mid lite acc crit).
export const ZONES = {
  night:  { meadow: { top: '#2b3560', bot: '#55608a', crit: '#e8f59a' }, oak: { top: '#2e3358', bot: '#5a5f80', crit: '#e8f59a' } },
  dawn:   { meadow: { top: '#f7b06a', bot: '#ffe3b0' }, oak: { top: '#f4a860', bot: '#ffe0aa' } },
  autumn: { meadow: { deep: '#8a4a2a', mid: '#c8762f', lite: '#e0a24a', mass: '#d0a070' }, oak: { mid: '#b8452a', lite: '#d9792b' } },
  winter: { meadow: { mid: '#9fb6c2', lite: '#eef3f6', mass: '#c9d6e0', bot: '#f2f5f7' }, oak: { lite: '#e8eef2', mass: '#c4ccd6' } },
  tet:    { meadow: { acc: '#d62f22', crit: '#f7d23e' }, oak: { acc: '#d62f22', crit: '#f2c14e' } },
  storm:  {},
};

const at = (d, y, mo, day, h = 0) => new Date(y, mo, day, h, 0, 0, 0);
const addDays = (d, n) => at(d, d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Tết window [start, end) for the date's year (or the next year's, which can start in January), or null. */
export function tetWindow(date) {
  for (const y of [date.getFullYear(), date.getFullYear() + 1]) {
    const t = TET_TABLE[y];
    if (!t) continue;
    const day1 = at(date, y, t[0], t[1]);
    const start = addDays(day1, -TET_BEFORE), end = addDays(day1, TET_AFTER + 1);
    if (date >= start && date < end) return { start, end, day1 };
  }
  return null;
}

/** Which seasons are open at `date` (local clock), each with `until` (a Date), plus the merged theme. */
export function active(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!(d instanceof Date) || isNaN(d)) return { list: [], theme: themeFor([]) };
  const y = d.getFullYear(), mo = d.getMonth(), day = d.getDate(), h = d.getHours(), wd = d.getDay();
  const list = [];
  const push = (id, until) => list.push({ ...SEASONS[id], until, mods: { ...MODS[id] } });
  if (h >= 19) push('night', at(d, y, mo, day + 1, 5));
  else if (h < 5) push('night', at(d, y, mo, day, 5));
  else if (h < 7) push('dawn', at(d, y, mo, day, 7));
  if (mo >= 8 && mo <= 10) push('autumn', at(d, y, 11, 1));
  if (mo === 11) push('winter', at(d, y + 1, 2, 1));
  else if (mo <= 1) push('winter', at(d, y, 2, 1));
  const tet = tetWindow(d);
  if (tet) push('tet', tet.end);
  if (wd === 6 || wd === 0) push('storm', at(d, y, mo, day + (wd === 6 ? 2 : 1)));
  return { list, theme: themeFor(list) };
}

/** Merge looks in order (time of day, season, festival, event); later ones override palette keys. */
export function themeFor(list) {
  const theme = { ids: list.map((s) => s.id), tint: null, palette: {}, particles: [], backdrop: null };
  const zones = {};
  for (const s of list) {
    const L = LOOKS[s.id];
    if (!L) continue;
    if (!theme.tint) theme.tint = { ...L.tint };
    Object.assign(theme.palette, L.palette);
    for (const p of L.particles) if (!theme.particles.includes(p)) theme.particles.push(p);
    for (const [z, o] of Object.entries(ZONES[s.id] || {})) zones[z] = { ...(zones[z] || {}), ...o };
  }
  // ready for backdrop.setTheme(theme.backdrop) (null resets the backdrop)
  if (theme.tint) theme.backdrop = { tint: theme.tint.color, amount: Math.min(0.35, theme.tint.alpha), zones };
  return theme;
}

/** Same rules for everyone: no gameplay modifiers in these runs (cosmetics still show). */
export function isFair(ctx = {}) {
  return !!(ctx.daily || ctx.weekly || ctx.race || ctx.level || ctx.challenge || ctx.duel || ctx.pure || ctx.mode === 'weekly' || ctx.mode === 'race');
}

/** Each storm followed by a shorter twin, kept clear of the next storm. */
export function twinStorms(list) {
  const out = [];
  const src = [...(list || STORMS)].sort((a, b) => a.m - b.m);
  src.forEach((st, i) => {
    out.push({ ...st });
    const tw = { m: st.m + st.len + 25, len: Math.max(30, Math.round(st.len * 0.6)) };
    const next = src[i + 1];
    if (!next || tw.m + tw.len + 20 <= next.m) out.push(tw);
  });
  return out;
}

/** Rules with the open seasons' gameplay modifiers merged in. Returns a new object; `fair` returns a copy unchanged. */
export function applyRules(rules = {}, list = [], { fair = false } = {}) {
  const r = { ...rules };
  if (fair) return r;
  for (const s of list) {
    const m = s.mods || MODS[s.id] || {};
    if (m.scoreK) r.score = (r.score ?? 1) * m.scoreK;
    if (m.windK) r.windK = (r.windK ?? 1) * m.windK;
    if (m.slip) r.slip = Math.max(r.slip || 0, m.slip);
    if (m.fireflies) r.fireflies = 1;
    if (m.envelopes) r.envelopes = 1;
    if (m.twinStorms) r.storms = twinStorms(r.storms);
  }
  return r;
}

/** Countdown text in the game's UI language. */
export function untilText(until, now = new Date()) {
  const ms = Math.max(0, until - now);
  const mins = Math.ceil(ms / 60000);
  const sameDay = until.getFullYear() === now.getFullYear() && until.getMonth() === now.getMonth() && until.getDate() === now.getDate();
  const hhmm = `${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')}`;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const midnight = until.getHours() === 0 && until.getMinutes() === 0;
  const when = sameDay ? hhmm : ms < 6 * 864e5 && !midnight ? `${DAY[until.getDay()]} ${hhmm}` : `${until.getDate()} ${MON[until.getMonth()]}`;
  const left = mins < 60 ? `${mins} m left` : mins < 48 * 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} m` : ''} left` : `${Math.round(mins / 1440)} d left`;
  return `open until ${when} · ${left}`;
}

/** Small inline icons for the title cards (currentColor). */
export const ICONS = {
  night: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3" fill="currentColor"/><circle cx="3" cy="4" r="1.2" fill="currentColor"/><circle cx="13" cy="12" r="1.2" fill="currentColor"/></svg>',
  dawn: '<svg viewBox="0 0 16 16"><path d="M2 12h12M4 12a4 4 0 0 1 8 0M8 3v3M3.5 6l1.5 1.5M12.5 6L11 7.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  autumn: '<svg viewBox="0 0 16 16"><path d="M8 1l2 4 4-1-2 4 3 2-5 1v4H8V11L3 10l3-2-2-4 4 1z" fill="currentColor"/></svg>',
  winter: '<svg viewBox="0 0 16 16"><path d="M8 1v14M2 4.5l12 7M14 4.5l-12 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tet: '<svg viewBox="0 0 16 16"><rect x="3.5" y="1.5" width="9" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="7" r="2" fill="currentColor"/></svg>',
  storm: '<svg viewBox="0 0 16 16"><path d="M7 1L3 9h4l-2 6 8-9H9l2-5z" fill="currentColor"/></svg>',
};

// ------------------------------------------------------------ cosmetic overlay (browser only)
const parts = { list: [], ids: '' };
function seedParticles(theme, cw, ch) {
  parts.list = [];
  parts.ids = theme.particles.join(',') + cw + 'x' + ch;
  const area = (cw * ch) / (1280 * 800);
  for (const kind of theme.particles) {
    const n = Math.round((kind === 'snow' ? 70 : kind === 'fireflies' ? 26 : kind === 'leaves' ? 18 : kind === 'blossoms' ? 16 : 12) * Math.max(0.4, area));
    for (let i = 0; i < n; i++) parts.list.push({ kind, x: Math.random() * cw, y: Math.random() * ch, ph: Math.random() * 6.28, s: 0.6 + Math.random() * 0.8 });
  }
}

/**
 * Draw ambient particles (screen space) and the season marks on world objects
 * (firefly glows on firefly sunlight, red envelopes on envelope acorns).
 * renderer: { ctx, dpr, cw, ch, ox, oy, sc }.
 */
export function drawOverlay(renderer, sim, theme, dt, calm = false) {
  if (!theme || !renderer || !renderer.ctx) return;
  const { ctx, dpr, cw, ch } = renderer;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // world marks
  if (sim && sim.motes && renderer.sc) {
    const sc = renderer.sc, t = sim.t;
    for (const o of sim.motes) {
      if (o.taken || !(o.ff || o.env)) continue;
      const x = renderer.ox + o.x * sc, y = renderer.oy + o.y * sc;
      if (y < -40 || y > ch + 40) continue;
      if (o.ff) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 34 * sc);
        g.addColorStop(0, 'rgba(232,245,154,0.75)'); g.addColorStop(1, 'rgba(232,245,154,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 34 * sc, 0, 6.283); ctx.fill();
      } else {
        const w = 18 * sc, hh = 24 * sc, by = y + Math.sin(t * 3 + o.ph) * 2 * sc;
        ctx.fillStyle = '#1e1a16'; ctx.fillRect(x - w / 2 - 2, by - hh / 2 - 2, w + 4, hh + 4);
        ctx.fillStyle = '#d62f22'; ctx.fillRect(x - w / 2, by - hh / 2, w, hh);
        ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, by - hh * 0.1, w * 0.22, 0, 6.283); ctx.fill();
      }
    }
  }
  // ambient particles
  if (theme.particles.length) {
    if (parts.ids !== theme.particles.join(',') + cw + 'x' + ch) seedParticles(theme, cw, ch);
    const k = calm ? 0.35 : 1;
    for (const p of parts.list) {
      p.ph += dt * k;
      if (p.kind === 'snow') { p.y += 38 * p.s * dt * k; p.x += Math.sin(p.ph) * 14 * dt; }
      else if (p.kind === 'leaves' || p.kind === 'blossoms') { p.y += 46 * p.s * dt * k; p.x += (40 + Math.sin(p.ph * 1.3) * 30) * dt * k; }
      else { p.x += Math.cos(p.ph * 0.7) * 16 * dt; p.y += Math.sin(p.ph * 0.9) * 12 * dt - (p.kind === 'motes' ? 8 * dt : 0); }
      if (p.y > ch + 20) { p.y = -20; p.x = Math.random() * cw; }
      if (p.y < -30) p.y = ch + 10;
      if (p.x > cw + 20) p.x = -20; if (p.x < -30) p.x = cw + 10;
      if (p.kind === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * p.s, 0, 6.283); ctx.fill(); }
      else if (p.kind === 'fireflies' || p.kind === 'motes') {
        const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(p.ph * 3));
        ctx.fillStyle = p.kind === 'fireflies' ? `rgba(226,245,140,${a})` : `rgba(255,226,150,${a * 0.7})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.kind === 'fireflies' ? 3 : 2) * p.s, 0, 6.283); ctx.fill();
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ph);
        ctx.fillStyle = p.kind === 'leaves' ? (p.s > 1 ? '#c8562a' : '#e08a2e') : (p.s > 1 ? '#f7d23e' : '#f4a6b8');
        ctx.beginPath(); ctx.ellipse(0, 0, 7 * p.s, 3.5 * p.s, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

export const seasons = { active, applyRules, isFair, untilText, themeFor, tetWindow, twinStorms, drawOverlay, ICONS, ZONES, SEASONS, MODS, LOOKS, TET_TABLE };
export default seasons;
