// Forkwood 2.0 store: the save block and the few rules the Home screen needs at boot.
// Split from store.js so the catalogue, adapters and offer logic load after the first
// frame (first-load budget). store.js re-exports everything here.
import * as EC from './economy.js';
import { WORLD } from './worlds-meta.js';
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const PRODUCT_IDS = ['pass_premium', 'pass_plus', 'starter_sprout', 'explorer_bundle', 'acorn_doubler', 'no_ads', 'dew_jar', 'gems_10', 'gems_55', 'gems_115', 'gems_240', 'gems_650', 'gems_1400', 'acorns_s', 'acorns_m', 'acorns_l'];
export const known = (id) => PRODUCT_IDS.includes(id) || /^world_pack_[a-z]+$/.test(id);
const SKIN_RX = /^vine\.skin\.[a-z]+$/;
/** Timed offers: hours they stay up after first shown (catalogue `show.hours`). */
export const OFFER_HOURS = { starter_sprout: 48 };

export function freshStore() {
  return { v: 1, owned: [], skins: [], ledger: [], interest: {}, notify: [], ads: { day: '', n: 0, per: {}, week: '', weekPer: {}, run: {} },
    offers: { session: 0, last: 0, first: {}, dismissed: {} }, free: { day: '', got: [] }, consent: { age: null, parent: false },
    vineSkin: '', world: '', sessions: 0, firstDay: '', passSeen: 0, passPremium: false, everPass: false, jar: 0, losses: 0, intro: {} };
}
export function ensureStore(S) {
  const F = freshStore();
  if (!S.store || typeof S.store !== 'object' || Array.isArray(S.store)) S.store = F;
  const T = S.store;
  for (const k of Object.keys(F)) if (T[k] == null || typeof T[k] !== typeof F[k] || Array.isArray(T[k]) !== Array.isArray(F[k])) T[k] = F[k];
  for (const k of Object.keys(F.ads)) if (T.ads[k] == null || typeof T.ads[k] !== typeof F.ads[k]) T.ads[k] = F.ads[k];
  for (const k of Object.keys(F.offers)) if (T.offers[k] == null || typeof T.offers[k] !== typeof F.offers[k]) T.offers[k] = F.offers[k];
  T.owned = T.owned.filter(known);
  T.skins = T.skins.filter((id) => typeof id === 'string' && SKIN_RX.test(id));
  if (T.vineSkin && !SKIN_RX.test(T.vineSkin)) T.vineSkin = '';
  if (T.world && !WORLD[T.world]) T.world = '';
  T.ledger.length = Math.min(T.ledger.length, 50);
  return T;
}
export const ownsWorld = (S, id) => !!WORLD[id] && EC.ownsMap(S, WORLD[id].legacy);
export const freeClaimed = (S, now = new Date()) => ensureStore(S).free.day === dayKey(now);
/** Start of a session: count it, remember the first day. Call once per page load. */
export function startStoreSession(S, now = new Date()) {
  const T = ensureStore(S);
  T.sessions++; T.offers.session = 0;
  if (!T.firstDay) T.firstDay = dayKey(now);
  return T.sessions;
}
export const isFirstSession = (S) => ensureStore(S).sessions <= 1;
export const isDayTwo = (S, now = new Date()) => { const T = ensureStore(S); return !!T.firstDay && T.firstDay !== dayKey(now); };
/** Record a finished run's result for the "never after two losses in a row" rule. */
export function noteRun(S, { lost }) { const T = ensureStore(S); T.losses = lost ? T.losses + 1 : 0; }
/** Time left on a timed offer (ms), or null. */
export function offerLeft(S, id, now = new Date()) { const h = OFFER_HOURS[id], f = ensureStore(S).offers.first[id]; if (!h || !f) return null; return Math.max(0, f + h * 3600e3 - +now); }
