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

## Ideas and references

* Trauma-based screen shake: Squirrel Eiserloh, "Math for Game Programmers: Juicing Your Cameras With Math", GDC 2016.
* Game feel: Martin Jonasson & Petri Purho, "Juice it or lose it" (2012); Jan Willem Nijman, "The Art of Screenshake" (2013).

## Not shipped

Playwright and Chromium are used only to test the game locally. No libraries, trackers or third-party requests are included in the game.
