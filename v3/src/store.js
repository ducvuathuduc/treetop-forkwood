// Forkwood 2.0 store: product catalogue, owned items (entitlements ledger),
// purchase + rewarded-ad hooks, offer rules, exchange rates, odds disclosure and a
// parental-consent placeholder. No real payments and no ad SDK are loaded: the
// providers below are STUBS that answer "coming soon" and count interest, so the
// whole shop works end to end and plugging in Xsolla / CrazyGames / Poki later is
// one adapter object passed to setPaymentProvider() / setAdProvider().
//
// Rules (work/v12-research/MENU-MONETIZATION.md, approved):
//   - fair modes stay fair: nothing bought changes daily / weekly / quest / race /
//     duel runs (runAcornMult() returns 1 there, like boosts and charms)
//   - money is a shortcut, never a wall: every world and gameplay item stays earnable
//   - fixed contents in paid bundles; random items only in pods, odds always shown
//   - value badges are computed from catalogue prices, never typed by hand
//   - rewarded ads capped at 8 a day; interstitials never in the first 3 runs
//
// Pure functions over the save object (S.store), like economy.js. The only side
// effect is a `forkwood:analytics` window event so a later SDK can listen.
import * as EC from './economy.js';
import { WORLDS, WORLD } from './worlds-meta.js';
import { freshStore, ensureStore, ownsWorld, startStoreSession, isFirstSession, isDayTwo, noteRun, offerLeft, freeClaimed } from './store-state.js';
export { freshStore, ensureStore, ownsWorld, startStoreSession, isFirstSession, isDayTwo, noteRun, offerLeft, freeClaimed };

export const STORE_LIVE = false;          // flips per product (`live`) once a provider is approved
export const CURRENCY = 'USD';
export const ACORNS_PER_GEM = 150;        // the economy's own valuation (ECONOMY.md)
export const AD_CAP_PER_DAY = 8;          // Subway Surfers City's cap
export const OFFER_COOLDOWN_H = 24;
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const weekKey = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };

// ------------------------------------------------------------------ vine skins (cosmetic, usable on every world)
// Registry ids follow the contract (`vine.skin.<id>`); ENGINE draws them, a missing
// id falls back to the world's default vine. Owning a world grants its artist skin.
export const VINE_SKINS = [
  { id: 'vine.skin.watercolour', name: 'Sunlit Watercolour', world: 'meadow', how: { world: 'meadow' }, tones: ['#9be38a', '#fff3c4'] },
  { id: 'vine.skin.impasto', name: 'Impasto Ochre', world: 'starry', how: { world: 'starry' }, tones: ['#e9b949', '#2f63b5'] },
  { id: 'vine.skin.tempera', name: 'Tempera & Gold', world: 'fresco', how: { world: 'fresco', acorns: 1500 }, tones: ['#d9a35f', '#f6e1a6'] },
  { id: 'vine.skin.sumi', name: 'Sumi Ink', world: 'ukiyo', how: { world: 'ukiyo', acorns: 1500 }, tones: ['#1b2a3a', '#e8dcc0'] },
  { id: 'vine.skin.dabs', name: 'Garden Dabs', world: 'lilies', how: { world: 'lilies', acorns: 1800 }, tones: ['#8cc7a1', '#e6a1bd'] },
  { id: 'vine.skin.goldleaf', name: 'Gold Leaf', world: 'gilded', how: { world: 'gilded', gems: 60 }, tones: ['#f0c75e', '#8a6420'] },
  { id: 'vine.skin.lacquer', name: 'Son & Gold Lacquer', world: 'lacquer', how: { world: 'lacquer', gems: 60 }, tones: ['#b3322a', '#e2b55a'] },
  { id: 'vine.skin.sprout', name: 'First Sprout', world: null, how: { product: 'starter_sprout' }, tones: ['#7fe0a0', '#fdf6d8'] },
  { id: 'vine.skin.season', name: 'Season Laurel', world: null, how: { pass: 30 }, tones: ['#d8b75a', '#5c8f4a'] },
  { id: 'vine.skin.explorer', name: 'Explorer’s Twine', world: null, how: { product: 'explorer_bundle' }, tones: ['#c8925a', '#f1e2c2'] },
];
export const VINE_SKIN = Object.fromEntries(VINE_SKINS.map((v) => [v.id, v]));

// ------------------------------------------------------------------ catalogue (prices from the approved table)
const paidWorlds = WORLDS.filter((w) => EC.MAP_PRICE[w.legacy]);
export const PRODUCTS = [
  // offers (pass first, Brawl Stars order)
  { id: 'pass_premium', kind: 'season', section: 'offers', price: 4.99, firstPrice: 2.99, name: 'Season Pass', blurb: 'Unlock the premium track: skins, golden pods and gems. Buying late pays every tier you already passed.', grants: { passPremium: true }, live: false },
  { id: 'pass_plus', kind: 'season', section: 'offers', price: 9.99, name: 'Season Pass Plus', blurb: 'Premium track + 10 tiers at once + the Season Laurel vine.', grants: { passPremium: true, passTiers: 10, skins: ['vine.skin.season'] }, live: false },
  { id: 'starter_sprout', kind: 'bundle', section: 'offers', price: 1.99, limit: 1, name: 'Starter Sprout', blurb: 'One time only.', grants: { gems: 30, skins: ['vine.skin.sprout'], boosts: { sprout: 1, ink: 1, bark: 1 } }, show: { minRuns: 3, notFirstSession: true, hours: 48 }, live: false },
  { id: 'explorer_bundle', kind: 'bundle', section: 'offers', price: 4.99, limit: 1, name: 'Explorer Bundle', blurb: 'All five paid worlds + the Explorer’s Twine vine. Every world stays unlockable with acorns.', grants: { worlds: paidWorlds.map((w) => w.id), skins: ['vine.skin.explorer'] }, live: false },
  { id: 'acorn_doubler', kind: 'nonconsumable', section: 'offers', price: 4.99, limit: 1, name: 'Acorn Doubler', blurb: '×2 acorns from free-play runs, forever. Off in daily, weekly, quest, race and duel runs.', grants: { runAcornMultiplier: 2 }, live: false },
  { id: 'no_ads', kind: 'nonconsumable', section: 'offers', price: 2.99, limit: 1, name: 'No Ads', blurb: 'Removes interstitial ads. Rewarded ads stay optional. Any purchase also turns interstitials off.', grants: { noInterstitials: true }, live: false },
  { id: 'dew_jar', kind: 'bundle', section: 'offers', price: 2.99, name: 'Dew Jar', blurb: 'Fills with 1 gem per 100 m you climb (up to 60). Break it once it holds 20.', grants: { gems: 'jar' }, jar: { per100m: 1, cap: 60, min: 20 }, live: false },
  ...paidWorlds.map((w) => ({ id: `world_pack_${w.id}`, kind: 'bundle', section: 'worlds', price: 1.99, limit: 1, name: `${w.name} pack`, blurb: `The world + its ${VINE_SKINS.find((v) => v.world === w.id).name} vine.`, grants: { worlds: [w.id], skins: [w.vine] }, world: w.id, live: false })),
  // gems (bonus badges computed below)
  ...[[0.99, 10], [4.99, 55], [9.99, 115], [19.99, 240], [49.99, 650], [99.99, 1400]].map(([price, gems], i) => ({ id: `gems_${gems}`, kind: 'consumable', section: 'gems', price, name: `${gems} gems`, grants: { gems }, tier: i, live: false })),
  // acorns for gems (exchange; real, works now)
  { id: 'acorns_s', kind: 'exchange', section: 'acorns', priceGems: 10, name: '1,500 acorns', grants: { acorns: 1500 } },
  { id: 'acorns_m', kind: 'exchange', section: 'acorns', priceGems: 50, name: '8,000 acorns', grants: { acorns: 8000 } },
  { id: 'acorns_l', kind: 'exchange', section: 'acorns', priceGems: 120, name: '20,000 acorns', grants: { acorns: 20000 } },
];
export const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const SECTIONS = [
  { id: 'offers', name: 'Offers' }, { id: 'free', name: 'Free' }, { id: 'gems', name: 'Gems' },
  { id: 'acorns', name: 'Acorns' }, { id: 'skins', name: 'Skins' }, { id: 'pods', name: 'Pods' },
];
/** Gem packs a non-payer sees (King pattern: three price points). */
export const gemPacksFor = (S) => PRODUCTS.filter((p) => p.section === 'gems' && (isPayer(S) || p.tier <= 2 || p.tier === 3));

// ------------------------------------------------------------------ prices, badges, exchange rates
const fmtUSD = (n) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(n); } catch { return '$' + n.toFixed(2); } };
export const priceText = (p, S) => (p.priceGems ? `${p.priceGems} gems` : fmtUSD(priceFor(p, S)));
/** Discounted first-time pass price (Brawl pattern) until the player has ever bought a pass. */
export const priceFor = (p, S) => (p.firstPrice && S && !(ensureStore(S).owned.includes('pass_premium') || ensureStore(S).everPass) ? p.firstPrice : p.price);
const BASE_RATE = 10 / 0.99; // gems per dollar of the smallest pack
/** "+N%" bonus vs the smallest pack, computed (FTC: badges must be provable from prices). */
export function bonusPct(p) { if (!p.grants || typeof p.grants.gems !== 'number' || !p.price) return 0; return Math.round((p.grants.gems / p.price / BASE_RATE - 1) * 100); }
export function badgeFor(p) {
  if (p.section === 'gems') { const b = bonusPct(p); const best = PRODUCTS.filter((q) => q.section === 'gems').reduce((a, q) => (bonusPct(q) > bonusPct(a) ? q : a)); return p === best ? `Best value · +${b}%` : b >= 5 ? `+${b}%` : ''; }
  if (p.section === 'acorns') { const base = 1500 / 10, r = p.grants.acorns / p.priceGems; const b = Math.round((r / base - 1) * 100); return b >= 5 ? `+${b}%` : ''; }
  return '';
}
/** Exchange-rate line shown on every currency card (FTC v. HoYoverse). */
export function exchangeText(p) {
  if (p.section === 'gems') { const per = p.price / p.grants.gems; return `${fmtUSD(p.price)} = ${p.grants.gems} gems · 1 gem ≈ ${fmtUSD(per)} ≈ ${ACORNS_PER_GEM} acorns of play`; }
  if (p.section === 'acorns') return `${p.priceGems} gems = ${p.grants.acorns.toLocaleString('en-US')} acorns · 1 gem = ${Math.round(p.grants.acorns / p.priceGems)} acorns`;
  return '';
}
/** Odds table for a pod, as shown next to its buy button (Apple 3.1.1 / Google Play). */
export function oddsFor(kind) {
  const t = kind === 'golden' ? EC.GOLDEN_ODDS : EC.POD_ODDS;
  return t.map((o) => ({ id: o.id, text: o.text, pct: o.w }));
}
export const POD_INFO = {
  seed: { name: 'Seed pod', cost: (S) => ({ acorns: EC.podPrice(S) }), note: 'Price rises with each pod today (max 900).' },
  golden: { name: 'Golden pod', cost: () => ({ gems: EC.GEM_SHOP.golden.gems }), note: 'Better odds. Bought with gems you earned or bought.' },
};

// ------------------------------------------------------------------ save block + entitlements
export const isPayer = (S) => ensureStore(S).ledger.some((t) => t.paid);
export const owns = (S, id) => ensureStore(S).owned.includes(id);
export function ownsSkin(S, id) {
  const v = VINE_SKIN[id]; if (!v) return false;
  if (ensureStore(S).skins.includes(id)) return true;
  if (v.how.world && ownsWorld(S, v.how.world) && !v.how.acorns && !v.how.gems) return true;
  return false;
}
/** Grant a receipt's contents. Idempotent per txId (same path later for server receipts). */
export function grant(S, txId, grants, meta = {}) {
  const T = ensureStore(S);
  if (T.ledger.some((t) => t.tx === txId)) return false;
  const g = grants || {};
  if (typeof g.gems === 'number') EC.gainGems(S, g.gems, meta.why || 'shop');
  if (g.acorns) { S.acorns += g.acorns; S.earned += g.acorns; }
  if (g.skins) for (const id of g.skins) if (VINE_SKIN[id] && !T.skins.includes(id)) T.skins.push(id);
  if (g.worlds) { const E = EC.ensureEcon(S); for (const w of g.worlds) { const lg = WORLD[w] && WORLD[w].legacy; if (lg && EC.MAP_PRICE[lg] && !E.maps.includes(lg)) E.maps.push(lg); } }
  if (g.boosts) { const E = EC.ensureEcon(S); for (const [id, n] of Object.entries(g.boosts)) if (EC.BOOSTS[id]) E.boosts[id] = Math.min(99, (E.boosts[id] | 0) + n); }
  if (g.passPremium) { T.passPremium = true; T.everPass = true; }
  if (meta.product && !T.owned.includes(meta.product)) T.owned.push(meta.product);
  T.ledger.unshift({ tx: txId, p: meta.product || '', paid: !!meta.paid, t: meta.t || Date.now() });
  T.ledger.length = Math.min(T.ledger.length, 50);
  return true;
}
/** Acorn multiplier from paid perks: always 1 in fair modes (same rule as boosts). */
export function runAcornMult(S, ctx = {}) {
  if (!EC.econAllowed(ctx)) return 1;
  return owns(S, 'acorn_doubler') ? 2 : 1;
}
export const interstitialsOff = (S) => owns(S, 'no_ads') || isPayer(S);
/** Interstitials: portal SDK only, at game over, never in the first 3 runs, off after any purchase. */
export const canInterstitial = (S, ctx = {}) => !interstitialsOff(S) && (S.stats.runs | 0) > 3 && ctx.at === 'gameover' && !!adProvider.interstitial && adProvider.available();

// ------------------------------------------------------------------ analytics hook
const listeners = new Set();
export function onAnalytics(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function track(type, data = {}) {
  const ev = { type, ...data, t: Date.now() };
  for (const fn of listeners) try { fn(ev); } catch { /* listener errors never break the shop */ }
  try { if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('forkwood:analytics', { detail: ev })); } catch { /* ignore */ }
  return ev;
}
function countInterest(S, key) { const T = ensureStore(S); T.interest[key] = (T.interest[key] | 0) + 1; return T.interest[key]; }

// ------------------------------------------------------------------ consent (placeholder until a real flow exists)
// FTC v. HoYoverse: no random paid items for under-16s without parental consent.
// Asked once, before the first purchase attempt; nothing is sent anywhere.
export const needsAgeGate = (S) => ensureStore(S).consent.age == null;
export function setAge(S, band) { const C = ensureStore(S).consent; C.age = band === 'under13' || band === '13to15' || band === '16plus' ? band : null; track('consent_age', { band: C.age }); return C.age; }
export const purchasesBlocked = (S) => { const C = ensureStore(S).consent; return (C.age === 'under13' || C.age === '13to15') && !C.parent; };
export const personalisedAdsAllowed = (S) => ensureStore(S).consent.age === '16plus';

// ------------------------------------------------------------------ payment provider (adapter)
/**
 * Provider shape (Xsolla Pay Station, CrazyGames Xsolla IAP, app stores later):
 *   { name, available(): bool, init?(): Promise, purchase(product, ctx): Promise<{status, txId?}>, restore(): Promise<[{txId, productId}]> }
 *   status: 'success' | 'cancelled' | 'failed' | 'coming_soon'
 * On 'success' the caller grants through grant(S, txId, product.grants) — once real money is
 * live, the receipt must be confirmed server-side first (webhook -> server -> grant).
 */
export const StubPayments = {
  name: 'stub',
  available: () => false,
  async purchase() { return { status: 'coming_soon' }; },
  async restore() { return []; },
};
let payProvider = StubPayments;
export function setPaymentProvider(p) { payProvider = p && typeof p.purchase === 'function' ? p : StubPayments; return payProvider.name; }
export const paymentProvider = () => payProvider;

export async function purchase(S, id, ctx = {}) {
  const p = PRODUCT[id];
  if (!p) return { status: 'failed', reason: 'unknown' };
  if (p.priceGems) return exchange(S, id);
  const T = ensureStore(S);
  if (p.limit && T.owned.includes(id)) return { status: 'owned' };
  if (needsAgeGate(S)) return { status: 'age_gate' };
  const n = countInterest(S, id);
  track('purchase_intent', { productId: id, price: priceFor(p, S), currency: CURRENCY, count: n, provider: payProvider.name, where: ctx.where || '' });
  if (purchasesBlocked(S)) return { status: 'parental_consent' };
  if (!p.live || !payProvider.available()) return { status: 'coming_soon', price: priceText(p, S) };
  const r = await payProvider.purchase(p, ctx);
  if (r && r.status === 'success' && r.txId) { grant(S, r.txId, p.grants, { product: id, paid: true, why: p.name }); track('purchase', { productId: id, txId: r.txId }); }
  return r || { status: 'failed' };
}
export function notifyMe(S, id) { const T = ensureStore(S); if (!T.notify.includes(id)) T.notify.push(id); track('notify_me', { productId: id }); return true; }
export async function restore(S) { const list = await payProvider.restore(); let n = 0; for (const r of list || []) if (PRODUCT[r.productId] && grant(S, r.txId, PRODUCT[r.productId].grants, { product: r.productId, paid: true })) n++; track('restore', { n }); return n; }

/** Gems -> acorns (works now; the rate is printed on the card). */
export function exchange(S, id) {
  const p = PRODUCT[id];
  if (!p || !p.priceGems) return { status: 'failed' };
  if (!EC.spendGems(S, p.priceGems)) return { status: 'short', need: p.priceGems - ((S.econ && S.econ.gems) | 0) };
  S.acorns += p.grants.acorns; S.earned += p.grants.acorns;
  track('exchange', { productId: id, gems: p.priceGems, acorns: p.grants.acorns });
  return { status: 'success', acorns: p.grants.acorns, gems: p.priceGems };
}
/** Vine skin for acorns or gems (earn path; works now). */
export function buySkin(S, id) {
  const v = VINE_SKIN[id], T = ensureStore(S);
  if (!v) return { status: 'failed' };
  if (ownsSkin(S, id)) return { status: 'owned' };
  if (v.how.world && !ownsWorld(S, v.how.world)) return { status: 'locked', world: v.how.world };
  if (v.how.acorns) { if (S.acorns < v.how.acorns) return { status: 'short', need: v.how.acorns - S.acorns, cur: 'acorns' }; S.acorns -= v.how.acorns; S.spent += v.how.acorns; }
  else if (v.how.gems) { if (!EC.spendGems(S, v.how.gems)) return { status: 'short', need: v.how.gems - ((S.econ && S.econ.gems) | 0), cur: 'gems' }; }
  else return { status: 'locked' };
  T.skins.push(id); track('skin_buy', { id });
  return { status: 'success' };
}
export function equipSkin(S, id) { const T = ensureStore(S); if (id && !ownsSkin(S, id)) return false; T.vineSkin = id || ''; track('skin_equip', { id }); return true; }

// ------------------------------------------------------------------ rewarded ads (adapter + caps)
export const AD_PLACEMENTS = {
  revive: { per: 'run', limit: 1, text: 'Continue free' },
  double_run: { per: 'run', limit: 1, text: 'Double acorns' },
  free_pod: { per: 'day', limit: 1, text: 'Free seed pod' },
  map_trial: { per: 'day', limit: 1, text: 'Try this world once' },
  streak_repair: { per: 'week', limit: 1, text: 'Repair streak' },
};
/**
 * Ad provider shape (Poki rewardedBreak, CrazyGames requestAd('rewarded'), H5 adBreak):
 *   { name, available(): bool, rewarded(placement): Promise<bool>, interstitial?(): Promise<void> }
 * StubAds: '?ads=dev' answers instantly with a reward (tests, demos); otherwise no ad
 * is available and the tap is logged as interest.
 */
export function createStubAds(mode = 'none') {
  return { name: mode === 'dev' ? 'stub-dev' : 'stub', available: () => mode === 'dev', async rewarded() { return mode === 'dev'; } };
}
/**
 * CrazyGames SDK v3 adapter (non-exclusive portal; TECH-RADAR "TRIAL"). The SDK script is
 * NOT loaded here: CrazyGames injects/serves it from their CDN, then the integrator calls
 * setAdProvider(createCrazyGamesAds()). Uses window.CrazyGames.SDK.ad.requestAd(type, callbacks).
 * Poki is on hold (default 5-year web exclusivity), so it has no adapter yet.
 */
export function createCrazyGamesAds(win = typeof window !== 'undefined' ? window : {}) {
  const sdk = () => win.CrazyGames && win.CrazyGames.SDK;
  const req = (type) => new Promise((res) => {
    const s = sdk(); if (!s || !s.ad) return res(false);
    try { s.ad.requestAd(type, { adStarted: () => {}, adFinished: () => res(true), adError: () => res(false) }); } catch { res(false); }
  });
  return {
    name: 'crazygames',
    available: () => !!(sdk() && sdk().environment !== 'disabled'),
    rewarded: () => req('rewarded'),
    interstitial: () => req('midgame').then(() => {}),
    gameplayStart: () => { try { sdk() && sdk().game.gameplayStart(); } catch { /* ignore */ } },
    gameplayStop: () => { try { sdk() && sdk().game.gameplayStop(); } catch { /* ignore */ } },
  };
}
/**
 * Xsolla Pay Station adapter skeleton (TECH-RADAR: needs a server-minted token, e.g. a
 * Convex action). getToken(product) -> Promise<token>; openPayStation(token) -> Promise<{status, txId}>
 * comes from the lazily loaded Xsolla SDK. Grants still wait for the server webhook.
 */
export function createXsollaPayments({ getToken, openPayStation, confirm } = {}) {
  return {
    name: 'xsolla',
    available: () => typeof getToken === 'function' && typeof openPayStation === 'function',
    async purchase(product, ctx) {
      const token = await getToken(product, ctx);
      if (!token) return { status: 'failed' };
      const r = await openPayStation(token, product);
      if (!r || r.status !== 'success') return r || { status: 'cancelled' };
      return confirm ? confirm(r.txId, product) : r; // server-side receipt check before grant
    },
    async restore() { return []; },
  };
}
let adProvider = createStubAds(typeof location !== 'undefined' && /[?&]ads=dev\b/.test(location.search) ? 'dev' : 'none');
export function setAdProvider(p) { adProvider = p && typeof p.rewarded === 'function' ? p : createStubAds(); return adProvider.name; }
export const adProviderName = () => adProvider.name;

function rollAds(S, now = new Date()) {
  const A = ensureStore(S).ads, d = dayKey(now), w = weekKey(now);
  if (A.day !== d) { A.day = d; A.n = 0; A.per = {}; }
  if (A.week !== w) { A.week = w; A.weekPer = {}; }
  return A;
}
/** Can this placement show an ad now? runId scopes per-run placements. */
export function adAllowed(S, placement, ctx = {}) {
  const P = AD_PLACEMENTS[placement]; if (!P) return false;
  const A = rollAds(S, ctx.now);
  if (A.n >= AD_CAP_PER_DAY) return false;
  if (P.per === 'day' && (A.per[placement] | 0) >= P.limit) return false;
  if (P.per === 'week' && (A.weekPer[placement] | 0) >= P.limit) return false;
  if (P.per === 'run' && ctx.runId != null && (A.run[placement] === ctx.runId)) return false;
  return true;
}
export const adsLeftToday = (S, now) => Math.max(0, AD_CAP_PER_DAY - rollAds(S, now).n);
/** Show a rewarded ad. -> { status: 'rewarded' | 'capped' | 'unavailable' | 'skipped' } */
export async function rewarded(S, placement, ctx = {}) {
  if (!adAllowed(S, placement, ctx)) return { status: 'capped' };
  countInterest(S, 'ad:' + placement);
  track('ad_request', { placement, provider: adProvider.name });
  if (!adProvider.available()) return { status: 'unavailable' };
  let ok = false;
  try { ok = await adProvider.rewarded(placement); } catch { ok = false; }
  if (!ok) return { status: 'skipped' };
  const A = rollAds(S, ctx.now);
  A.n++;
  if (AD_PLACEMENTS[placement].per === 'day') A.per[placement] = (A.per[placement] | 0) + 1;
  if (AD_PLACEMENTS[placement].per === 'week') A.weekPer[placement] = (A.weekPer[placement] | 0) + 1;
  if (AD_PLACEMENTS[placement].per === 'run') A.run[placement] = ctx.runId != null ? ctx.runId : Date.now();
  track('ad_rewarded', { placement });
  return { status: 'rewarded' };
}

// ------------------------------------------------------------------ daily freebie (shop "Free" section)
// One free item a day; tomorrow's is shown locked (Brawl Stars daily freebie).
const FREEBIES = [{ acorns: 80 }, { boosts: { pollen: 1 } }, { acorns: 120 }, { gems: 1 }, { boosts: { bark: 1 } }, { acorns: 150 }, { pod: 'seed' }];
const FREE_TEXT = (g) => (g.acorns ? `${g.acorns} acorns` : g.gems ? `${g.gems} gem` : g.pod ? 'A seed pod' : `${EC.BOOSTS[Object.keys(g.boosts)[0]].name}`);
const dayIndex = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);
export function freebie(S, now = new Date()) {
  const d = dayKey(now), i = dayIndex(d);
  const today = FREEBIES[((i % 7) + 7) % 7], tomorrow = FREEBIES[(((i + 1) % 7) + 7) % 7];
  const T = ensureStore(S);
  return { today, tomorrow, text: FREE_TEXT(today), nextText: FREE_TEXT(tomorrow), claimed: T.free.day === d, kind: today.acorns ? 'acorn' : today.gems ? 'gem' : today.pod ? 'pod' : 'boost' };
}
export function claimFreebie(S, now = new Date(), rng) {
  const f = freebie(S, now), T = ensureStore(S), d = dayKey(now);
  if (f.claimed) return null;
  T.free.day = d;
  const g = f.today;
  let pod = null;
  if (g.pod) pod = EC.openPod(S, EC.POD_ODDS, rng ? { rng } : {});
  else grant(S, 'free:' + d, g, { why: 'daily freebie' });
  track('freebie', { day: d });
  return { ...f, pod };
}

// ------------------------------------------------------------------ offers (when a sales popup may appear)
/**
 * The one offer allowed now, or null. Rules: never in the first session, never mid-run,
 * at most 1 per session, 24 h between popups, never after two losses in a row,
 * starter pack after run 3 (or day 2) and only for 48 h after it is first shown.
 */
export function offerFor(S, ctx = {}) {
  const T = ensureStore(S), now = ctx.now || new Date(), t = +now;
  if (ctx.midRun || isFirstSession(S)) return null;
  if (T.offers.session >= 1) return null;
  if (T.offers.last && t - T.offers.last < OFFER_COOLDOWN_H * 3600e3) return null;
  if (T.losses >= 2) return null;
  if ((S.stats.runs | 0) < 3 && !isDayTwo(S, now)) return null;
  for (const id of ['starter_sprout', 'pass_premium']) {
    const p = PRODUCT[id];
    if (p.limit && T.owned.includes(id)) continue;
    if (id === 'pass_premium' && T.passPremium) continue;
    const first = T.offers.first[id];
    if (p.show && p.show.hours && first && t - first > p.show.hours * 3600e3) continue;
    return p;
  }
  return null;
}
export function markOfferShown(S, id, now = new Date()) { const T = ensureStore(S); T.offers.session++; T.offers.last = +now; if (!T.offers.first[id]) T.offers.first[id] = +now; track('offer_shown', { productId: id }); }

// ------------------------------------------------------------------ season pass (premium track rewards; free track lives in retention.js)
export const PASS_PREMIUM = {
  1: { gems: 3 }, 2: { acorns: 300 }, 4: { pod: 'golden' }, 5: { gems: 5 }, 7: { acorns: 600 }, 8: { skin: 'vine.skin.sprout' },
  10: { gems: 8 }, 12: { pod: 'golden' }, 14: { acorns: 900 }, 15: { gems: 10 }, 17: { pod: 'golden' }, 20: { gems: 12 },
  22: { acorns: 1500 }, 24: { pod: 'golden' }, 25: { gems: 15 }, 27: { acorns: 2000 }, 30: { skin: 'vine.skin.season', gems: 20 },
};
export const premiumText = (r) => !r ? '' : r.skin ? `${VINE_SKIN[r.skin].name} vine${r.gems ? ` + ${r.gems} gems` : ''}` : r.pod ? 'Golden pod' : r.gems ? `${r.gems} gems` : `${r.acorns.toLocaleString('en-US')} acorns`;

export const store = { PRODUCTS, PRODUCT, SECTIONS, VINE_SKINS, purchase, rewarded, grant, ensureStore, offerFor, setPaymentProvider, setAdProvider };
export default store;
