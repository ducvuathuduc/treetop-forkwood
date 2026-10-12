// Store module (no browser): catalogue prices match the approved table, badges are
// provable from prices, stub purchases log interest and grant nothing, entitlements
// are idempotent, ad caps (8/day + per placement), offer popup rules, consent gate,
// odds disclosure, fairness of paid perks, exchange and skins.
// usage: node tests/store.mjs
import * as ST from '../src/store.js';
import * as M from '../src/meta.js';
import * as EC from '../src/economy.js';
import { WORLDS } from '../src/worlds-meta.js';

const fails = [];
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails.push(msg); };
const fresh = () => { const S = M.freshSave('2026-10-11'); M.repair(S, '2026-10-11'); ST.ensureStore(S); return S; };

// 1. catalogue = approved price table
const P = ST.PRODUCT;
const want = { pass_premium: 4.99, pass_plus: 9.99, starter_sprout: 1.99, explorer_bundle: 4.99, acorn_doubler: 4.99, no_ads: 2.99, dew_jar: 2.99, gems_10: 0.99, gems_55: 4.99, gems_115: 9.99, gems_240: 19.99, gems_650: 49.99, gems_1400: 99.99 };
ok(Object.entries(want).every(([id, pr]) => P[id] && P[id].price === pr), 'catalogue prices match the approved table');
ok(P.pass_premium.firstPrice === 2.99, 'first-time pass price $2.99');
ok(WORLDS.filter((w) => EC.MAP_PRICE[w.legacy]).every((w) => P['world_pack_' + w.id] && P['world_pack_' + w.id].price === 1.99), 'a $1.99 pack for each of the 5 paid worlds');
ok([['acorns_s', 10, 1500], ['acorns_m', 50, 8000], ['acorns_l', 120, 20000]].every(([id, g, a]) => P[id].priceGems === g && P[id].grants.acorns === a), 'acorn exchange packs 10/50/120 gems');
ok(ST.PRODUCTS.filter((p) => !p.priceGems).every((p) => p.live === false), 'every real-money product is live:false (stub phase)');
ok(ST.SECTIONS.map((s) => s.id).join() === 'offers,free,gems,acorns,skins,pods', 'shop section order Offers→Free→Gems→Acorns→Skins→Pods');
ok(WORLDS.length === 7 && WORLDS[0].id === 'meadow' && !EC.MAP_PRICE[WORLDS[0].legacy], '7 worlds, meadow is the free starter');

import { known } from '../src/store-state.js';
ok(ST.PRODUCTS.every((p) => known(p.id)), 'store-state knows every catalogue product id (save repair keeps them)');
// 2. badges computed from prices
const b55 = ST.bonusPct(P.gems_55), b1400 = ST.bonusPct(P.gems_1400);
ok(b55 >= 9 && b55 <= 12 && b1400 >= 38 && b1400 <= 42, `gem bonus computed: 55 pack +${b55}%, 1400 pack +${b1400}%`);
ok(ST.badgeFor(P.gems_1400).startsWith('Best value'), 'best-value badge goes to the highest computed bonus');
ok(ST.badgeFor(P.gems_10) === '', 'no badge on the base pack');
ok(/1 gem ≈ \$0\.10/.test(ST.exchangeText(P.gems_10)) && /150 acorns/.test(ST.exchangeText(P.gems_10)), 'exchange rate shown: ' + ST.exchangeText(P.gems_10));
ok(/1 gem = 150 acorns/.test(ST.exchangeText(P.acorns_s)), 'acorn exchange rate shown');

// 3. odds disclosure
for (const k of ['seed', 'golden']) { const o = ST.oddsFor(k); const sum = o.reduce((a, x) => a + x.pct, 0); ok(Math.abs(sum - 100) < 1e-9 && o.every((x) => x.text), `${k} pod odds listed and add to 100%`); }

// 4. stub purchase: age gate first, then interest logged, nothing granted
{
  const S = fresh(); const events = []; const off = ST.onAnalytics((e) => events.push(e));
  const g0 = S.econ.gems;
  let r = await ST.purchase(S, 'gems_55');
  ok(r.status === 'age_gate', 'first purchase asks the age question first');
  ST.setAge(S, '16plus');
  r = await ST.purchase(S, 'gems_55', { where: 'test' });
  ok(r.status === 'coming_soon' && r.price === '$4.99', 'stub purchase → coming soon with the real price');
  await ST.purchase(S, 'gems_55');
  ok(S.store.interest.gems_55 === 2 && S.econ.gems === g0, 'interest counted locally, no gems granted');
  ok(events.filter((e) => e.type === 'purchase_intent' && e.productId === 'gems_55').length === 2, 'purchase_intent analytics event fired');
  ST.setAge(S, '13to15');
  r = await ST.purchase(S, 'pass_premium');
  ok(r.status === 'parental_consent', 'under-16 → parental consent placeholder blocks the purchase');
  ok(!ST.personalisedAdsAllowed(S), 'no personalised ads for under-16');
  off();
}
// 5. provider adapter: a fake provider that succeeds grants once, idempotent
{
  const S = fresh(); ST.setAge(S, '16plus');
  let n = 0;
  ST.setPaymentProvider({ name: 'fake', available: () => true, async purchase() { n++; return { status: 'success', txId: 'tx-1' }; }, async restore() { return [{ txId: 'tx-1', productId: 'gems_115' }]; } });
  const saved = P.gems_115.live; P.gems_115.live = true;
  const g0 = S.econ.gems;
  const r = await ST.purchase(S, 'gems_115');
  ok(r.status === 'success' && S.econ.gems === g0 + 115, 'adapter success grants the pack');
  const again = await ST.restore(S);
  ok(again === 0 && S.econ.gems === g0 + 115, 'restore with the same txId does not grant twice');
  ok(ST.isPayer(S) && ST.interstitialsOff(S), 'any purchase turns interstitials off');
  P.gems_115.live = saved; ST.setPaymentProvider(null);
  ok(ST.paymentProvider().name === 'stub', 'provider resets to the stub');
}
// 6. ads: dev stub rewards, caps per placement and 8/day
{
  const S = fresh(); const now = new Date('2026-10-11T08:00:00Z');
  ST.setAdProvider(ST.createStubAds('none'));
  let r = await ST.rewarded(S, 'free_pod', { now });
  ok(r.status === 'unavailable' && S.store.interest['ad:free_pod'] === 1, 'no ad provider → unavailable, interest logged');
  ST.setAdProvider(ST.createStubAds('dev'));
  r = await ST.rewarded(S, 'free_pod', { now });
  ok(r.status === 'rewarded', 'dev stub ad rewards');
  r = await ST.rewarded(S, 'free_pod', { now });
  ok(r.status === 'capped', 'free pod ad: 1 per day');
  r = await ST.rewarded(S, 'revive', { now, runId: 7 });
  const r2 = await ST.rewarded(S, 'revive', { now, runId: 7 });
  const r3 = await ST.rewarded(S, 'revive', { now, runId: 8 });
  ok(r.status === 'rewarded' && r2.status === 'capped' && r3.status === 'rewarded', 'revive ad: 1 per run');
  for (let i = 0; i < 10; i++) await ST.rewarded(S, 'double_run', { now, runId: 100 + i });
  ok(S.store.ads.n === 8 && ST.adsLeftToday(S, now) === 0, `rewarded ads capped at 8 a day (${S.store.ads.n})`);
  const tomorrow = new Date('2026-10-12T08:00:00Z');
  ok(ST.adAllowed(S, 'free_pod', { now: tomorrow }) && ST.adsLeftToday(S, tomorrow) === 8, 'cap resets the next day');
  ST.setAdProvider(null);
  ok(!ST.canInterstitial(S, { at: 'gameover' }), 'no interstitials without a portal SDK / in early runs');
}
// 7. offers
{
  const S = fresh(); const now = new Date('2026-10-11T08:00:00Z');
  ST.startStoreSession(S, now);
  S.stats.runs = 5;
  ok(ST.offerFor(S, { now }) === null, 'never an offer in the first session');
  ST.startStoreSession(S, now);
  ok(ST.offerFor(S, { now, midRun: true }) === null, 'never mid-run');
  const o = ST.offerFor(S, { now });
  ok(o && o.id === 'starter_sprout', 'second session after run 3 → starter offer');
  ST.markOfferShown(S, o.id, now);
  ok(ST.offerFor(S, { now }) === null, 'at most one popup per session');
  ST.startStoreSession(S, new Date(+now + 3600e3));
  ok(ST.offerFor(S, { now: new Date(+now + 3600e3) }) === null, '24 h cooldown between popups');
  const later = new Date(+now + 50 * 3600e3);
  ST.startStoreSession(S, later);
  const o2 = ST.offerFor(S, { now: later });
  ok(o2 && o2.id === 'pass_premium', 'starter offer expires 48 h after first shown; pass next');
  ST.noteRun(S, { lost: true }); ST.noteRun(S, { lost: true });
  ok(ST.offerFor(S, { now: later }) === null, 'never after two losses in a row');
  const S2 = fresh(); ST.startStoreSession(S2, now); ST.startStoreSession(S2, now); S2.stats.runs = 2;
  ok(ST.offerFor(S2, { now }) === null, 'not before run 3 on day 1');
}
// 8. fairness, exchange, skins, freebie, grant idempotency
{
  const S = fresh();
  ST.grant(S, 'test-doubler', ST.PRODUCT.acorn_doubler.grants, { product: 'acorn_doubler' });
  ok(ST.runAcornMult(S, {}) === 2 && ST.runAcornMult(S, { pure: true }) === 1 && ST.runAcornMult(S, { race: true }) === 1 && ST.runAcornMult(S, { level: true }) === 1, 'acorn doubler: ×2 in free play only, ×1 in fair modes');
  ok(!ST.grant(S, 'test-doubler', { gems: 99 }) && S.econ.gems === 0, 'grant is idempotent per txId');
  let r = ST.exchange(S, 'acorns_s');
  ok(r.status === 'short', 'exchange needs gems');
  EC.gainGems(S, 12); const a0 = S.acorns;
  r = ST.exchange(S, 'acorns_s');
  ok(r.status === 'success' && S.acorns === a0 + 1500 && S.econ.gems === 2, 'exchange 10 gems → 1,500 acorns');
  ok(ST.ownsSkin(S, 'vine.skin.watercolour') && ST.ownsSkin(S, 'vine.skin.impasto'), 'free worlds grant their vine skins');
  ok(ST.buySkin(S, 'vine.skin.tempera').status === 'locked', 'a world’s artist skin needs the world first');
  S.econ.maps.push('arashiyama'); S.acorns = 2000;
  ok(ST.buySkin(S, 'vine.skin.tempera').status === 'success' && S.acorns === 500, 'buy Tempera vine for 1,500 acorns');
  ok(ST.equipSkin(S, 'vine.skin.tempera') && S.store.vineSkin === 'vine.skin.tempera' && !ST.equipSkin(S, 'vine.skin.goldleaf'), 'equip owned skin only');
  const now = new Date('2026-10-11T08:00:00Z');
  const f = ST.freebie(S, now); const c = ST.claimFreebie(S, now);
  ok(c && !f.claimed && ST.freebie(S, now).claimed && ST.claimFreebie(S, now) === null, 'daily freebie: one claim a day, tomorrow shown: ' + f.nextText);
  ok(ST.gemPacksFor(fresh()).length === 4 && ST.gemPacksFor(S).length === 4, 'non-payers see four gem packs');
}

// 9. portal adapters (no SDK loaded): CrazyGames v3 shape, Xsolla async token
{
  let asked = null;
  const win = { CrazyGames: { SDK: { environment: 'local', ad: { requestAd: (t, cb) => { asked = t; cb.adFinished(); } }, game: { gameplayStart() {}, gameplayStop() {} } } } };
  const cg = ST.createCrazyGamesAds(win);
  ok(cg.available() && await cg.rewarded('revive') === true && asked === 'rewarded', 'CrazyGames v3 adapter maps rewarded → requestAd("rewarded")');
  ok(!ST.createCrazyGamesAds({}).available(), 'CrazyGames adapter unavailable without the SDK');
  const S = fresh(); ST.setAge(S, '16plus');
  const xs = ST.createXsollaPayments({ getToken: async () => 'tok', openPayStation: async () => ({ status: 'success', txId: 'x-9' }), confirm: async (tx) => ({ status: 'success', txId: tx }) });
  ST.setPaymentProvider(xs); P.no_ads.live = true;
  const r = await ST.purchase(S, 'no_ads');
  ok(r.status === 'success' && ST.owns(S, 'no_ads'), 'Xsolla adapter: async token → pay station → confirmed grant');
  P.no_ads.live = false; ST.setPaymentProvider(null);
}

console.log(fails.length ? `\n${fails.length} store check(s) FAILED` : '\nstore: all checks passed');
process.exit(fails.length ? 1 : 0);
