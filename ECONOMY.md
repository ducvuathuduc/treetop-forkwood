# Forkwood economy (v1.0)

Two currencies, both earned only by playing. No real-money store, no ads, nothing to buy with money.

* **Acorns** (soft): picked up in the tree, plus height, merges, blooms, golden hours, goals, challenges, the daily gift, season tiers, league and duels (unchanged sources from earlier passes).
* **Dew gems** (hard, rare): see "Gem sources". They are the only way to pay for a second chance.

Code: `src/economy.js` (rules, pure), `src/ui-econ.js` (shop sections, word hunt card, second-chance prompt), hooks in `src/sim.js` (`opts.econ`, `revive()`), `src/meta.js` (`finishRun` → `out.econ`), `src/retention.js` (streak / season / league gems).
Tests: `tests/economy.mjs` (rules + this simulation), `tests/econ-ui.mjs` (browser).

**Fairness rule:** boosts, upgrades, the grower multiplier, letters and gem drops are switched **off** on the daily tree, weekly tree, quest levels, challenge and duel links, live races and the tutorial run (`econAllowed()` / `createSim({ pure })`), exactly like charms.

## Sinks

| sink | price | recurring? |
|---|---|---|
| Boost: Head start (8 s Sap Rush, ~+40 m) | 150 acorns | yes, one use |
| Boost: Mega head start (18 s Sap Rush, ~+95 m) | 450 acorns | yes |
| Boost: Score booster (points ×1.5 for the run) | 300 acorns | yes |
| Boost: Pollen start (15 s pollen) | 100 acorns | yes |
| Boost: Bark shield (one hit blocked) | 120 acorns | yes |
| Upgrades: Pollen, Ink ×2, Sap Rush, Golden hour, Dew (6 levels each) | 250, 500, 900, 1,500, 2,400, 3,600 (9,150 per track, 45,750 total) | no (scaling) |
| Shop skins (38 items: 18 classic + 20 themed to the new maps, filterable by map) | 150-640 (13,650 total), daily deal −25% | no |
| Map: Arashiyama Bamboo (Kyoto) | 900 acorns | no |
| Map: Redwood Giants (California) | 1,200 acorns | no |
| Map: Black Forest (Hansel & Gretel) | 1,500 acorns | no |
| Map: Amazon Canopy | 1,800 acorns | no |
| Map: Beanstalk Sky (Jack and the Beanstalk) | 2,400 acorns (maps 7,800 total; Forkwood and Phong Nha Caves are free) | no |
| Seed pod (mystery box) | 300 × 1.25ⁿ for the n-th pod today, max 900, resets daily | yes |
| Second chance | 1, 2, 4, 8 gems in the same run (max 4) | yes |
| Golden pod | 5 gems | yes |
| Frost guard (streak freeze, max 2) | 4 gems | yes |
| Skip a level goal | 3 gems | yes |

Boosts are capped at one of each per run. Upgrade durations: Pollen 6 s → 11.4 s, Ink 8 s → 15.2 s, Sap Rush 3 s → 5.2 s, Golden hour 6 s → 9.6 s, Dew 30 → 44 sap.

## Seed pod odds (shown in full in the shop)

| outcome | chance |
|---|---|
| 60-180 acorns | 46% |
| a random boost | 30% |
| 400-600 acorns | 10% |
| 1 dew gem | 8% |
| 2 dew gems | 3% |
| a shop skin you do not own (or 800 acorns) | 2.5% |
| jackpot 3,000 acorns | 0.5% |

Expected value ≈ 218 acorns (boosts at shop price, gems at 150, skins at 400) for 300: a net sink. Golden pod (5 gems): 500-900 acorns 40%, three boosts 25%, 2 gems 15%, 4 gems 5%, skin 13%, 5,000 jackpot 2%. `tests/economy.mjs` opens 20,000 pods and checks the published odds.

## Gem sources

| source | gems |
|---|---|
| every 3rd level-up (levels are Subway-style mission sets of 3 goals) | 1 |
| all three daily challenges | 1 |
| all three weekly challenges | 2 |
| word hunt, day 3 and day 5+ in a row | 1 |
| streak 7 / 14 / 30 / 60 / 100 days | 3 / 3 / 8 / 10 / 15 |
| season tiers 5, 10, 15, 20, 25, 30 (free track) | 2, 2, 2, 3, 3, 5 |
| league promotion | 2 |
| a dew gem in the tree (10% of free-play runs, past 250 m) | 1 |
| seed pod (11%) | 1-2 |

## Other mechanics

* **Grower multiplier** (Subway's mission multiplier): every level adds ×0.1 to free-play points, up to ×3.0 at level 21.
* **Word hunt** (Subway's daily word): one letter of today's word (5-7 letters, e.g. ACORN, CANOPY) waits 60-160 m up in each free-play run; spell it for day 1 a seed pod, day 2 150 acorns, day 3 1 gem, day 4 300 acorns, day 5+ a golden pod + 1 gem.
* **Item drops**: letters and dew gems are `acorn`-kind motes with `letter` / `gem` fields from their own random stream (the course never shifts); events `letter` and `gem`.
* **Second chance**: when sap runs dry on a free-play run, a 4-second prompt offers to continue for 1/2/4/8 gems; the tree comes back with 70 sap, 2.5 s of safety and the hazards right ahead cleared.
* Streaks, the free 30-tier season track, collections and badges are unchanged; season tiers and streak milestones now also pay gems.

## 30-day simulation

`tests/economy.mjs` plays real bot runs (casual = weak bot on Sapling, average = average bot on Sapling, hardcore = expert bot on Oak, 50 runs each with a charm) and feeds them through the real `finishRun` / `afterRun` / `claimGift` code for 30 simulated days.

* casual: 4 runs on 5 of 7 days, uses a head start now and then;
* average: 10 runs on 6 of 7 days, takes a second chance on good runs;
* hardcore: 30 runs every day, buys a head start + score booster every run while it holds > 1,500 acorns, takes second chances;
* hardcore (saver): the same player but never buys boosts: the fastest anyone can clear the permanent catalogue.

Shopping policy for everyone: cheapest upgrade first (unless a cosmetic is much cheaper), then the cheapest cosmetic not owned yet (skins and maps compete on price, so maps come after the cheaper skins).

| player | day | acorn balance | earned (total) | spent (total) | gems held / earned | catalogue owned | level | grower × |
|---|---|---|---|---|---|---|---|---|
| casual | 1 | 126 | 226 | 100 | 0 / 0 | 0% | 2 | ×1.1 |
| casual | 3 | 186 | 436 | 250 | 2 / 2 | 0% | 3 | ×1.2 |
| casual | 7 | 157 | 1,407 | 1,250 | 5 / 5 | 2% | 4 | ×1.3 |
| casual | 14 | 34 | 3,289 | 3,255 | 18 / 18 | 5% | 6 | ×1.5 |
| casual | 21 | 307 | 5,132 | 4,825 | 30 / 30 | 7% | 7 | ×1.6 |
| casual | 30 | 23 | 7,213 | 7,190 | 41 / 41 | 11% | 7 | ×1.6 |
| average | 1 | 98 | 1,598 | 1,500 | 5 / 7 | 2% | 3 | ×1.2 |
| average | 3 | 34 | 3,704 | 3,670 | 2 / 17 | 5% | 5 | ×1.4 |
| average | 7 | 250 | 6,145 | 5,895 | 2 / 28 | 9% | 8 | ×1.7 |
| average | 14 | 208 | 9,938 | 9,730 | 2 / 39 | 15% | 8 | ×1.7 |
| average | 21 | 81 | 13,976 | 13,895 | 2 / 54 | 22% | 8 | ×1.7 |
| average | 30 | 553 | 19,613 | 19,060 | 2 / 76 | 31% | 8 | ×1.7 |
| hardcore | 1 | 138 | 4,338 | 4,200 | 5 / 18 | 2% | 8 | ×1.7 |
| hardcore | 3 | 149 | 9,689 | 9,540 | 2 / 26 | 6% | 9 | ×1.8 |
| hardcore | 7 | 295 | 20,090 | 19,795 | 5 / 40 | 14% | 18 | ×2.7 |
| hardcore | 14 | 114 | 34,677 | 34,563 | 2 / 60 | 29% | 19 | ×2.8 |
| hardcore | 21 | 198 | 53,061 | 52,863 | 2 / 79 | 40% | 19 | ×2.8 |
| hardcore | 30 | 1,436 | 75,599 | 74,163 | 2 / 134 | 46% | 19 | ×2.8 |
| hardcore (saver) | 1 | 232 | 4,497 | 4,265 | 4 / 17 | 6% | 8 | ×1.7 |
| hardcore (saver) | 3 | 46 | 9,966 | 9,920 | 2 / 26 | 15% | 12 | ×2.1 |
| hardcore (saver) | 7 | 151 | 21,151 | 21,000 | 2 / 41 | 33% | 18 | ×2.7 |
| hardcore (saver) | 14 | 1,068 | 38,868 | 37,800 | 2 / 70 | 58% | 19 | ×2.8 |
| hardcore (saver) | 21 | 974 | 54,974 | 54,000 | 2 / 88 | 81% | 19 | ×2.8 |
| hardcore (saver) | 30 | 15,933 | 83,133 | 67,200 | 4 / 129 | 100% | 19 | ×2.8 |

| player | runs in 30 days | acorns per run (avg) | spent on upgrades / skins / maps / boosts / pods | second chances | boosts used | pods bought | maps owned |
|---|---|---|---|---|---|---|---|
| casual | 88 | 82 | 2,250 / 4,940 / 0 / 0 / 0 | 0 | 1 | 0 | 0/5 |
| average | 260 | 75 | 5,550 / 13,510 / 0 / 0 / 0 | 74 | 1 | 0 | 0/5 |
| hardcore | 900 | 84 | 14,250 / 13,263 / 2,100 / 44,550 / 0 | 132 | 274 | 0 | 2/5 |
| hardcore (saver) | 900 | 92 | 45,750 / 13,650 / 7,800 / 0 / 0 | 125 | 0 | 0 | 5/5 |

catalogue: 69350 acorns

### Reading the numbers

* **Hardcore cannot buy everything in week 1:** even saving every acorn, the expert who plays 30 runs a day owns 33% of the permanent catalogue (upgrades + 38 shop skins + 5 maps, 69,350 acorns) after 7 days, 58% after 14 and 81% after 21; it takes about four weeks to finish it. Spending on boosts, the same player owns 14% after a week.
* **Maps are the big one-off sinks (v1.0):** 900 to 2,400 acorns each, 7,800 for all five, so a map costs an average player about 12-32 runs (~75 acorns a run) and a casual player one to four weeks. Two maps (Forkwood, Phong Nha Caves) are free so nobody is locked to one look. In the simulation the cheapest-first shopper buys the cheaper skins before any map, so only the hardcore profiles reach maps inside 30 days (2 of 5 while buying boosts, all 5 for the saver); a player who wants a map first can afford Arashiyama in about two days of average play.
* **Balances do not pile up while there is something to buy:** the spending profiles never hold more than ~1,500 acorns (average max 553). The saver finishes the catalogue near the end of the month; from then on the recurring sinks (boosts at 150-450 per run, seed pods rising to 900 each per day, gem second chances) are what a finished player spends on, and the hardcore profile shows they absorb the full income (44.5k spent on boosts in 30 days).
* **Gems stay rare:** casual 41 gems a month (~1.4 a day), hardcore 134 (~4 a day at 30 runs a day), and second chances doubling within a run eat most of them (average player: 74 second chances, 2 gems held at day 30).
* **Casual players still progress:** 11% of the (now larger) catalogue and level 7 (×1.6) in a month with ~3 runs a day.
* Acorns per run including every bonus: ~82 (casual) / ~75 (average) / ~84-92 (hardcore).

## Difficulty (pass 8)

Bot medians, 60 seeds per cell (`tests/stakes.mjs`):

| stake | weak | average | expert | expert ≥ 400 m |
|---|---|---|---|---|
| Sapling | 40 s | 64 s | 98 s | 77% |
| **Oak** (target ~35 / ~55 / ~85) | **32.6 s** | **56.7 s** | **84.8 s** | 70% |
| Ancient (brutal) | 27.5 s | 37.7 s | 49 s | 25% |

v0.9.0 Oak was 37 / 57 / 71 s (the expert died of a steep late sap curve, the weak bot barely felt hits). Oak now drains from the first metre (`drainAdd`), bites harder (`dmg` ×1.45), and pays skilled play back (`bloomSap` +8 per full bloom, a gentler late curve `lateK` 0.62), so the spread between weak and expert players widens. Ancient: hazards at full strength early, `dmg` ×1.75, heavy early drain, every 2nd rest glade gone.
