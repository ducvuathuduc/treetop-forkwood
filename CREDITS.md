# Credits

Forkwood was designed, coded and drawn during Twigpine Project Treetop Round 01 (9–16 October 2026) by Huynh Dieu Thanh ([@thanhdicode](https://github.com/thanhdicode)), with AI assistance.

Everything visual in the game is drawn in code at runtime (Canvas 2D). The music is generated live with WebAudio. The only files the game loads are the fonts and one small sound-effect sprite listed below. All of them allow use in a public MIT-licensed project.

## Fonts (SIL Open Font License 1.1)

Self-hosted, subset to Latin and converted to WOFF2 (the OFL allows modified versions; the subsets keep their original names inside the font files and are not sold).

| Font | Used for | Source | Licence |
|---|---|---|---|
| Fraunces (Undercase Type) | logo, big numbers, banners | https://github.com/google/fonts/tree/main/ofl/fraunces | OFL 1.1, [assets/fonts/OFL-Fraunces.txt](assets/fonts/OFL-Fraunces.txt) |
| Bricolage Grotesque (Mathieu Triay) | interface text | https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque | OFL 1.1, [assets/fonts/OFL-BricolageGrotesque.txt](assets/fonts/OFL-BricolageGrotesque.txt) |
| JetBrains Mono (JetBrains) | scores and commit hashes | https://github.com/google/fonts/tree/main/ofl/jetbrainsmono | OFL 1.1, [assets/fonts/OFL-JetBrainsMono.txt](assets/fonts/OFL-JetBrainsMono.txt) |

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

## Not shipped

Playwright and Chromium are used only to test the game locally. Apart from ZzFX above, no libraries, trackers or third-party requests are included in the game. All skins, icons and the acorn are drawn in code or as inline SVG made for Forkwood.
