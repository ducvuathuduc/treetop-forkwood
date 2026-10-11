# Trap and hazard events (P8-ECON)

The simulation (`src/sim.js`, `src/traps.js`) pushes plain objects onto `sim.events`
every step. `main.js` already handles the older ones (`hit`, `revert`, `crow`, ...).
These are the **new, uniform** events for rendering trap feedback. Every coordinate is
in world units (playfield 560 wide, `y` grows downwards, the tip is at `sim.cx, sim.cy`).

## `trapWarn` — the telegraph

Fired **once per trap or hazard**, about `WARN_LEAD` = 1.2 s before the growing tip can
reach it (at the current speed), plus the trap-specific warnings below. Always at least
0.8 s before anything can hurt (asserted by `tests/trap-audit.mjs`).

```js
{ type: 'trapWarn', trap, x, y, t, hazard }
```

| field | meaning |
|---|---|
| `trap` | `twig`, `pulse`, `door`, `gust`, `sap`, `lure`, `twins`, `tide`, `crow` (the 9 traps) or a hazard: `gate`, `split`, `slide`, `thorn` (column), `bolt`, `beetle`, `frost`, `wind` |
| `x, y` | where the danger is (gap centre for gates, column x, beetle position, ...) |
| `t` | seconds until the tip reaches it (or until it strikes) |
| `hazard` | `true` for the classic hazards, absent/false for the 9 traps |

Trap-specific extra warnings (same event type):

| trap | when | extra fields |
|---|---|---|
| `twig` | the tip steps onto a cracked twig (it snaps after 0.6 s) | `creak: true`, `t` = time left before the snap |
| `gust` | the crosswind on (or just above) your band enters its 1.0 s warning phase | `dir` (-1 left, +1 right), `t` = seconds until it blows |
| `tide` | the rising thorns start climbing behind you | `y` = thorn top |
| `crow` | the crow leaves its perch and marks your lane | `lane` = half-width of the dive lane (46), `t` = 1.1 s until it dives |

Suggested visuals: a pulsing coral outline or "!" chevron at `x, y`; for the crow a
vertical shaded lane `x ± lane` with a countdown ring (the crow trap object keeps
`st: 'warn'`, `t` = seconds left, `x` = lane centre, `yy` = tip height, `lane`).

## `trapHit` — the consequence

Fired whenever a trap or hazard actually lands on the player (after shields/invulnerability).

```js
{ type: 'trapHit', trap, src, hazard, effect, dmg, x, y, sap }
```

| field | meaning |
|---|---|
| `trap` | same ids as above (`lure` covers its wall and cap, `gust` covers its thorn hedge, `twins` the twin beetles) |
| `src` | raw hit source (`cap`, `wall`, `hedge`, `beetle`, `gate`, ...) |
| `effect` | `sap` (sap lost, combo reset, knock-back), `cut` (a forked branch was reverted: staged sunlight lost), `shield` (a bark shield absorbed it), `fatal` (Hardcore: run over), `drain` (entered a sap-drain zone; it keeps draining 26 sap/s while you stay) |
| `dmg` | sap lost (0 for `shield`/`fatal`/`drain`) |
| `sap` | sap left after the hit |

## Other trap events

| event | fields | meaning |
|---|---|---|
| `trapClear` | `trap: 'sap'`, `drained` | left a sap-drain zone; total sap it drank |
| `crow` | `x, y, lane, t` | (existing) the crow marks your lane |
| `crowsteal` | `x, y, lost, pts, sap` | the crow pecked you: `lost` staged sunlight, `pts` points stolen (5% of score, max 400), `sap` sap lost |
| `crowfoil` | `x, y, bonus` | the crow missed (you swerved out or forked round its lane) |
| `snap` | `x, y` | (existing) a cracked twig snapped |
| `tide` | — | (existing) rising thorns started |
| `trapintro` | `id, name, hint, y` | (existing) first appearance of a trap this run |

## Trap behaviour summary (pass 8)

| trap | telegraph | consequence | how to avoid |
|---|---|---|---|
| Cracked twig | drawn the whole time; `trapWarn` 1.2 s ahead, `creak` on contact | snaps after 0.6 s on it: hit (18 × stake dmg sap, combo reset) | keep moving across it / go round |
| Pulse thorns | breathing row, 0.8 s+ growing phase | thorn hit (26) | take the lane that is open when you arrive |
| Trapdoor gate | door swings, 0.85 s warn phase | thorn hit (26) | time the door or use the side squeeze gap (never shuts) |
| Crosswind | leaf streaks, 1.0 s warn phase | pushes you into the thorn hedge (22) | lean into the wind |
| Sap drain | withered bark drawn | drains 26 sap/s while inside | go round |
| Golden lure | pocket wall drawn | thorn wall / cap hit (22) | ignore the too-easy sunlight |
| Twin beetles | beetles drawn | beetle hit (24) | fork around them (bonus) or squeeze past one side |
| Rising thorns | `tide` + `trapWarn` | hit (20) if they catch you | keep climbing |
| Crow | perch drawn, then 1.1 s lane mark | **always dives now**: −16 sap × stake, staged sunlight stolen, −5% points | swerve out of the lane or fork round it |

Pass-8 combos (Cloudline and up): `crowpulse` (520 m), `doubledoor` (560 m), `gusttwig` (600 m), `tidetwins` (650 m).
