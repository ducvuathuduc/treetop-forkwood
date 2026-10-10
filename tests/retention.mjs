// Retention logic (node, no browser): streak milestones, season track, the
// practice league (deterministic ghosts, promotion/demotion), comeback gifts,
// avatars, duel link encode/decode, and save migration/repair.
import * as M from '../src/meta.js';
import * as R from '../src/retention.js';
import { SKIN } from '../src/skins.js';

let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };
const D = (s) => new Date(s + 'T12:00:00Z');
const sum = (h, extra = {}) => ({ height: h, score: h * 40, merges: 3, forks: 4, blooms: 1, maxMult: 3, goldens: 0, nearMisses: 1, splits: 0, acorns: 2, time: 60, reverts: 0, hits: 0, charmUses: 0, grafts: 0, storms: 0, pickups: 0, ...extra });

// ---- migration: a v0.6 save (no ret block) gets one; corrupt blocks are repaired
{
  const old = M.freshSave('2026-10-01'); delete old.ret; old.stats.runs = 5; old.acorns = 77; old.loadout.trail = undefined;
  const S = M.loadSave((k) => (k === M.SAVE_KEY ? JSON.parse(JSON.stringify(old)) : null), '2026-10-10');
  ok(S.ret && S.ret.v === 1 && S.ret.avatar.portrait === 'sparrow', 'old v2 save gains a retention block');
  ok(S.acorns === 77 && S.stats.runs === 5, 'old progress kept through the migration');
  ok(S.loadout.trail === 'trail.none' && S.owned.includes('trail.none'), 'new trail slot gets the free default');
  const bad = M.freshSave(); bad.ret = { league: null, season: 'x', avatar: { portrait: 'dragon', frame: 7 }, owned: 'no', days: [1, 'x', '2026-10-01'], duels: { sent: 'x' }, name: '<b>hi</b>~~' };
  const S2 = M.loadSave((k) => (k === M.SAVE_KEY ? bad : null), '2026-10-10');
  ok(S2.ret.league && S2.ret.league.tier === 0 && typeof S2.ret.season.xp === 'number', 'corrupt league/season blocks are rebuilt');
  ok(S2.ret.avatar.portrait === 'sparrow' && S2.ret.avatar.frame === 'twig', 'unknown avatar parts fall back to the starters');
  ok(S2.ret.days.length === 1 && Array.isArray(S2.ret.duels.sent), 'bad day keys and duel lists are cleaned');
  ok(S2.ret.name === 'bhib', `names are sanitised (${S2.ret.name})`);
  const rt = JSON.parse(JSON.stringify(S2)); M.repair(rt, '2026-10-10');
  ok(JSON.stringify(rt.ret) === JSON.stringify(S2.ret), 'retention block survives a JSON round trip unchanged');
}

// ---- streak milestones: paid once, items granted, frost guards capped at 2
{
  const S = M.freshSave('2026-10-01');
  let day = Date.parse('2026-10-01T12:00:00Z'), got = [];
  for (let i = 0; i < 15; i++) { const r = M.claimGift(S, new Date(day).toISOString().slice(0, 10)); got.push(...r.milestones.map((m) => m.d)); day += 864e5; }
  ok(S.streak.count === 15 && got.join(',') === '3,7,14', `milestones at 3, 7, 14 days (${got})`);
  ok(S.ret.owned.includes('portrait.fox') && S.ret.owned.includes('frame.blossom'), '7-day fox portrait and 14-day blossom frame granted');
  ok(S.streak.freezes <= 2, `frost guards capped (${S.streak.freezes})`);
  const again = R.streakMilestones(S);
  ok(again.length === 0, 'milestones never pay twice');
  // a missed day with a guard keeps the streak
  const S3 = M.freshSave(); S3.streak = { last: '2026-10-05', count: 9, best: 9, freezes: 1 };
  const r = M.claimGift(S3, '2026-10-07');
  ok(r.usedFreeze && S3.streak.count === 10 && S3.streak.freezes === 0, 'a frost guard covers one missed day');
}

// ---- season track
{
  ok(R.tierAt(0).tier === 0 && R.tierAt(60).tier === 1 && R.tierAt(299).tier === 4 && R.tierAt(300).tier === 5 && R.tierAt(400).tier === 6, 'tier thresholds (60 each to 5, then 100)');
  ok(R.tierAt(1e6).tier === R.SEASON_TIERS, 'track caps at 30');
  const S = M.freshSave('2026-10-10');
  const out = M.finishRun(S, sum(320), { now: D('2026-10-10') });
  const ret = R.afterRun(S, sum(320), out, M.claimGift, D('2026-10-10'));
  ok(ret.rings.total >= 10 + 32 + 20, `rings for a 320 m first run of the day (${ret.rings.total})`);
  ok(ret.gift && S.streak.count === 1, 'a finished run opens the daily gift (counts for the streak)');
  ok(S.ret.season.id === '2026-10' && S.ret.season.xp === ret.rings.total, 'season xp recorded for this month');
  ok(S.ret.league.xp === ret.rings.total, 'league score is the same rings');
  // grinding to tier 4 grants the pollen trail (a skin) and tier 6 the owl portrait
  for (let i = 0; i < 30; i++) { const o = M.finishRun(S, sum(400), { now: D('2026-10-11') }); R.afterRun(S, sum(400), o, M.claimGift, D('2026-10-11')); }
  ok(S.ret.season.tier >= 6, `season tier after 31 runs: ${S.ret.season.tier}`);
  ok(S.owned.includes('trail.pollen') && S.ret.owned.includes('portrait.owl'), 'season items land in the collection');
  ok(M.equip(S, 'trail.pollen') && S.loadout.trail === 'trail.pollen', 'an earned trail can be worn');
  const S2 = JSON.parse(JSON.stringify(S));
  R.rollSeason(S2, D('2026-11-02'));
  ok(S2.ret.season.id === '2026-11' && S2.ret.season.xp === 0 && S2.ret.season.best >= 6, 'new month: new season, best tier kept');
  M.repair(S2, '2026-11-02');
  ok(S2.owned.includes('trail.pollen'), 'earned items stay owned in the next season');
  ok(Object.values(R.SEASON_REWARDS).every((r) => !r.item || SKIN[r.item] || R.PORTRAIT[r.item.split('.')[1]] || R.FRAME[r.item.split('.')[1]]), 'every season reward item exists');
}

// ---- league: deterministic ghosts, promotion, demotion, inactivity
{
  const a = R.rivals('2026-W41', 2), b = R.rivals('2026-W41', 2), c = R.rivals('2026-W42', 2);
  ok(JSON.stringify(a) === JSON.stringify(b), 'same week and tier: identical ghosts for everyone');
  ok(JSON.stringify(a) !== JSON.stringify(c), 'a new week brings new ghosts');
  ok(a.length === 9 && new Set(a.map((g) => g.name)).size === 9, 'nine distinct ghost growers');
  const mid = D('2026-10-07'); // Wednesday of W41
  ok(a.every((g) => R.ghostScore(g, '2026-W41', mid) <= g.final && R.ghostScore(g, '2026-W41', mid) >= 0), 'ghost scores grow toward their final');
  ok(a.every((g) => R.ghostScore(g, '2026-W41', D('2026-10-12')) === g.final), 'after the week, ghosts sit at their final');
  const S = M.freshSave(); S.ret.league = { week: '2026-W41', tier: 2, xp: 99999, best: 2, result: null, history: [] };
  const acorns0 = S.acorns;
  const res = R.resolveLeague(S, D('2026-10-13'));
  ok(res && res.rank === 1 && res.to === 3 && S.ret.league.tier === 3 && S.ret.league.week === '2026-W42' && S.ret.league.xp === 0, 'top of the table: promoted, new week starts at 0');
  ok(S.acorns > acorns0 && S.ret.league.best === 3, `promotion pays (${S.acorns - acorns0} acorns) and records the best tier`);
  const S2 = M.freshSave(); S2.ret.league = { week: '2026-W41', tier: 3, xp: 1, best: 3, result: null, history: [] };
  const r2 = R.resolveLeague(S2, D('2026-10-13'));
  ok(r2.rank === 10 && r2.to === 2, 'bottom of the table: moved down');
  const S3 = M.freshSave(); S3.ret.league = { week: '2026-W38', tier: 4, xp: 0, best: 4, result: null, history: [] };
  ok(R.resolveLeague(S3, D('2026-10-13')) === null && S3.ret.league.tier === 4, 'a week without play changes nothing');
  const S4 = M.freshSave(); S4.ret.league = { week: '2026-W41', tier: 0, xp: 1, best: 0, result: null, history: [] };
  ok(R.resolveLeague(S4, D('2026-10-13')).to === 0, 'Seedling never moves down');
  const st = R.standings(S, D('2026-10-14'));
  ok(st.length === 10 && st.filter((r) => r.you).length === 1 && st.filter((r) => r.ghost).length === 9, 'standings: you plus nine labelled ghosts');
  // league moth portrait unlocks from the best tier
  const S5 = M.freshSave(); S5.ret.league.best = 2; R.syncAvatar(S5);
  ok(S5.ret.owned.includes('portrait.moth'), 'reaching Sapling league unlocks the moth portrait');
}

// ---- comeback gifts + presence
{
  const S = M.freshSave(); S.ret.lastDay = '2026-10-01';
  const a0 = S.acorns, out = R.startSession(S, D('2026-10-05'));
  ok(out.comeback && out.comeback.days === 4 && S.acorns === a0 + 75, '4 days away: +75 comeback acorns');
  const out2 = R.startSession(S, D('2026-10-05'));
  ok(!out2.comeback && S.acorns === a0 + 75, 'comeback pays once per absence');
  const S2 = M.freshSave(); S2.ret.lastDay = '2026-09-20'; S2.streak.freezes = 0;
  const o3 = R.startSession(S2, D('2026-10-05'));
  ok(o3.comeback.acorns === 150 && S2.streak.freezes === 1, '2+ weeks away: +150 and a frost guard');
  const S3 = M.freshSave(); S3.ret.lastDay = '2026-10-04';
  ok(!R.startSession(S3, D('2026-10-05')).comeback, 'a normal next-day visit is not a comeback');
  const S4 = M.freshSave();
  ok(!R.startSession(S4, D('2026-10-05')).comeback && S4.ret.lastDay === '2026-10-05', 'first ever session: no comeback, day recorded');
}

// ---- avatars
{
  const S = M.freshSave();
  ok(!R.setAvatar(S, 'portrait', 'owl'), 'cannot wear a locked portrait');
  ok(R.setAvatar(S, 'portrait', 'squirrel') && S.ret.avatar.portrait === 'squirrel', 'can wear a starter portrait');
  ok(!R.setAvatar(S, 'frame', 'gilded') && R.setAvatar(S, 'frame', 'twig'), 'frames respect ownership');
  ok(R.avatarHTML('fox', 'blossom', 40).includes('fr-blossom') && R.avatarHTML('nope', 'nope').includes('fr-twig'), 'avatar markup falls back safely');
}

// ---- duels
{
  const d = { id: 'ab12cd', seed: 4242424242, h: 312, sc: 12345, t: 87.3, mode: 'classic', stake: 'oak', p: 3, f: 2, n: 'Mai Anh', r: '', rh: 0 };
  const code = R.encodeDuel(d), back = R.decodeDuel(code);
  ok(/^[A-Za-z0-9_-]+\.[0-9a-z]{3}$/.test(code) && code.length < 120, `code is URL-safe and short (${code.length} chars)`);
  ok(back && back.seed === d.seed && back.h === 312 && back.sc === 12345 && Math.abs(back.t - 87.3) < 0.01 && back.stake === 'oak' && back.n === 'Mai Anh' && back.p === 3, 'duel round-trips through its code');
  const uni = R.decodeDuel(R.encodeDuel({ ...d, n: 'Thành 🌳' }));
  ok(uni && uni.n === 'Thành', `unicode names survive, emoji stripped (${uni && uni.n})`);
  ok(R.decodeDuel(code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a')) === null, 'a wrong checksum is rejected');
  ok(R.decodeDuel(code.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))) === null, 'a tampered body is rejected');
  ok(R.decodeDuel('') === null && R.decodeDuel('x'.repeat(500)) === null && R.decodeDuel('!!!.abc') === null, 'junk codes are rejected');
  // recipient races and wins once
  const B = M.freshSave(); const b0 = B.acorns;
  const w = R.settleDuelRun(B, back, { height: 400 });
  ok(w.won && w.acorns === R.DUEL_WIN && B.acorns === b0 + R.DUEL_WIN, 'beating the duel pays the racer');
  const w2 = R.settleDuelRun(B, back, { height: 500 });
  ok(w2.repeat && w2.acorns === 0 && B.acorns === b0 + R.DUEL_WIN, 'racing the same duel again pays nothing more');
  // reply settles the sender once
  const A = M.freshSave(); R.registerSent(A, d, D('2026-10-10'));
  const reply = R.decodeDuel(R.encodeDuel({ id: 'zz99yy', seed: d.seed, h: 400, sc: 1, t: 90, mode: 'classic', stake: 'oak', p: 1, f: 0, n: 'Bao', r: d.id, rh: d.h }));
  const a0 = A.acorns, s1 = R.settleReply(A, reply);
  ok(s1 && !s1.won && s1.acorns === R.DUEL_PLAY && A.acorns === a0 + R.DUEL_PLAY && A.ret.duels.sent[0].res === 'lose', 'the sender gets the answer: lost, +taking-part acorns');
  ok(R.settleReply(A, reply) === null && A.acorns === a0 + R.DUEL_PLAY, 'an answer settles only once');
  ok(R.settleReply(M.freshSave(), reply) === null, 'an answer to a duel you never sent pays nothing');
  ok(R.ghostHeight(back, 0) === 0 && Math.abs(R.ghostHeight(back, 43.65) - 156) < 1 && R.ghostHeight(back, 999) === 312, 'rival tip climbs at the sender\u2019s average pace and stops at their height');
}

console.log(fails ? `\n${fails} FAILED` : '\nretention checks OK');
process.exit(fails ? 1 : 0);
