# Credits

Forkwood was designed, coded and drawn during Twigpine Project Treetop Round 01 (9–16 October 2026) by Huynh Dieu Thanh ([@thanhdicode](https://github.com/thanhdicode)), with AI assistance.

The tree, leaves, blossoms, skins, effects and interface icons are drawn in code at runtime (Canvas 2D / inline SVG). The music is generated live with WebAudio. The files the game loads are the fonts, one small sound-effect sprite and the illustrations listed below. All of them allow use in a public MIT-licensed project.

## Illustrations (v0.7, made for Forkwood)

`assets/art/` holds images generated for Forkwood with an AI image model during the round, from our own prompts (woodblock-print style, palette matched to the game), then cropped, keyed and compressed to WebP by us: five stage backdrops (`bg-*.webp`), the side foliage, the meadow ground strip, the thorn vine, beetle and sun sprites, five story plates (`story*.webp`) and the eight critter portraits (`critters.webp`). They depict no existing characters, logos or brands, and are released with the game under its MIT licence.

## Fonts (SIL Open Font License 1.1)

Self-hosted, subset to Latin and converted to WOFF2 (the OFL allows modified versions; the subsets keep their original names inside the font files and are not sold).

| Font | Used for | Source | Licence |
|---|---|---|---|
| Fraunces (Undercase Type) | logo, big numbers, banners (variable subset, weight 300-900, opsz 144, SOFT 100) | https://github.com/google/fonts/tree/main/ofl/fraunces | OFL 1.1, [assets/fonts/OFL-Fraunces.txt](assets/fonts/OFL-Fraunces.txt) |
| Bricolage Grotesque (Mathieu Triay) | interface text | https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque | OFL 1.1, [assets/fonts/OFL-BricolageGrotesque.txt](assets/fonts/OFL-BricolageGrotesque.txt) |
| JetBrains Mono (JetBrains) | the share card's commit hash line (not used in menus) | https://github.com/google/fonts/tree/main/ofl/jetbrainsmono | OFL 1.1, [assets/fonts/OFL-JetBrainsMono.txt](assets/fonts/OFL-JetBrainsMono.txt) |

## Interface icons (ISC)

The menu icons in `src/icons.js` and `index.html` (pause, volume, map, calendar, radio, list-checks, shopping-bag, gem, award, gift, lock, check, flame, snowflake, sprout, star, package, layers, swords, share, download, house, rotate-ccw, arrow-right, book-open, moon, info, leaf, timer, shield, flip-horizontal, cloud-lightning, x) are from Lucide, https://lucide.dev (some originally from Feather, MIT). The acorn icon is our own in the same style.

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Sound effects (CC0 1.0, public domain)

Nine clips, trimmed and packed into one 37 KB sprite (`assets/audio/sfx.mp3`), layered under synthesised tones:

* [Impact Sounds](https://kenney.nl/assets/impact-sounds) by Kenney (kenney.nl), CC0: `impactWood_light_002` (fork), `impactWood_medium_001` (merge), `impactWood_heavy_002` (hit), `impactPlank_medium_000` (bark shield), `impactSoft_medium_001` (sprout, empty merge).
* [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney (kenney.nl), CC0: `scratch_002` (revert), `click_002` (buttons), `toggle_002` (calm mode), `drop_002` (dew).

Licence texts: [assets/audio/LICENSE-Kenney-Impact-Sounds.txt](assets/audio/LICENSE-Kenney-Impact-Sounds.txt), [assets/audio/LICENSE-Kenney-Interface-Sounds.txt](assets/audio/LICENSE-Kenney-Interface-Sounds.txt). Crediting Kenney is not required; we do it gladly.

## Code library (MIT)

| Library | Used for | Source | Licence |
|---|---|---|---|
| ZzFX 1.4.0 by Frank Force | rendering the short menu, shop and charm sound effects (acorn, buy, stamp, page turn, sparkle, charms) | https://github.com/KilledByAPixel/ZzFX | MIT, [src/vendor/LICENSE-ZzFX.txt](src/vendor/LICENSE-ZzFX.txt) |

Vendored as `src/vendor/zzfx.js` with one change, noted at the top of the file: it no longer creates an AudioContext when imported (browsers warn about audio before a user gesture). Forkwood only calls `ZZFX.buildSamples` and plays the result through its own mixer.

## Ideas and references

* Trauma-based screen shake: Squirrel Eiserloh, "Math for Game Programmers: Juicing Your Cameras With Math", GDC 2016.
* Game feel: Martin Jonasson & Petri Purho, "Juice it or lose it" (2012); Jan Willem Nijman, "The Art of Screenshake" (2013).
* Progression design: levels of three goals after Alto's Adventure (Snowman); cosmetic-only unlocks so scores stay comparable after Crossy Road (Hipster Whale, GDC 2015); quests as an "endless tutorial" after David Fox, "Don't Pass on Battle Pass" (GDC 2022); streak freeze after Duolingo. Ideas only, no assets.
* Course and power-up design (pass 3): chunk tiers with costs and a growing budget after Tommy Thompson's write-up of *Sure Footing*; a sawtooth with designed rest beats after the build/peak/relax pacing of *Left 4 Dead*'s director; vehicles as pace breakers after *Jetpack Joyride* (Luke Muscat, GDC 2012); stackable timed power-ups after *Subway Surfers*; self-chosen risk for reward after *Downwell*'s combo; a guaranteed path first after *Spelunky*'s generator. Ideas only, no assets. The storm, lightning, thorn columns, sliding thorns, power-up tokens and graft medallions are drawn in code for Forkwood; the new sounds are synthesised in code (no new files).

## Not shipped

Playwright and Chromium are used only to test the game locally. Apart from ZzFX above, no libraries, trackers or third-party requests are included in the game. All skins, icons and the acorn are drawn in code or as inline SVG made for Forkwood.

* Retention design (v0.7): streaks, up to two streak freezes and milestone celebrations after Duolingo's published experiments (blog.duolingo.com, "The habit-building research behind your Duolingo streak", 2022); weekly leagues with promotion and demotion after Duolingo Leagues; a free tiered season track after Subway Surfers' Season Hunt (sybo.helpshift.com); async challenge links after Wordle-style sharing. Ideas only, no assets. Forkwood's league rivals are simulated ghosts and say so.
