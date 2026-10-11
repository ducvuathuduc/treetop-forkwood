# Credits

Forkwood was designed, coded and drawn during Twigpine Project Treetop Round 01 (9–16 October 2026) by Huynh Dieu Thanh ([@thanhdicode](https://github.com/thanhdicode)), with AI assistance.

The tree, leaves, blossoms, skins, effects and interface icons are drawn in code at runtime (Canvas 2D / inline SVG). The music is generated live with WebAudio. The files the game loads are the fonts, one small sound-effect sprite and the illustrations listed below. All of them allow use in a public MIT-licensed project.

## Illustrations (v0.7, made for Forkwood)

`assets/art/` holds images generated for Forkwood with an AI image model during the round, from our own prompts (woodblock-print style, palette matched to the game), then cropped, keyed and compressed to WebP by us: five stage backdrops (`bg-*.webp`), the side foliage, the meadow ground strip, the thorn vine, beetle and sun sprites and the eight critter portraits (`critters.webp`). They depict no existing characters, logos or brands, and are released with the game under its MIT licence.

## Manga intro (v1.0, made for Forkwood)

`assets/story/` holds the eight manga panels of the opening story (`tree`, `sky`, `dark`, `eyes`, `crow`, `hero`, `reach`, `resolve`). They were made for Forkwood with an AI image model from our own prompts (manga style), then cropped and compressed to WebP by us (about 245 KB together, loaded only when the story plays). The captions, speech bubbles, speed and focus lines, sound words and panel frames are drawn in code (`src/intro.js`, `style.css`). They depict no existing characters, logos or brands, and are released with the game under its MIT licence.

## Trap effects (v1.0, made for Forkwood)

`assets/art/fx-crow.webp` (25 KB atlas: six flight frames and five perched poses of the crow trap) was generated for Forkwood with an AI image model from our own prompt (flat dark silhouette with a coral rim, art-bible direction A), then keyed, cut, aligned and packed to WebP by us. It is loaded only once a crow trap spawns. Every other trap, pickup and boost effect is drawn in code (`src/render-traps-fx.js`). Released with the game under its MIT licence.
## Maps (v1.0, made for Forkwood)

The map plates `assets/art/m-{sky,far,side}-<map>.webp` (Phong Nha, Arashiyama, Redwoods, Black Forest, Amazon, Beanstalk) were generated the same way for Forkwood with an AI image model from our own prompts in the layered-silhouette style, then keyed, looped seamlessly, squashed to the outer edges and compressed to WebP by us. The map stamps, postmarks and particles are drawn in code (`src/stamps.js`, `src/backdrop.js`). The places are real forests and the tales (Hansel and Gretel, Jack and the Beanstalk) are public-domain folk tales; no third-party art, logos or brands are used, and no Kenney/OpenGameArt asset was needed for this pass. Released with the game under its MIT licence.

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

## Music and sound, Forkwood 2.0 (own work, MIT)

Everything under `assets/v2/*/audio/` (seven adaptive world loops with calm / chase / boss stems, and 249 sound cues in nine sprites) was composed and synthesised for Forkwood by our own code in `tools/audio/` (Python + NumPy/SciPy: additive and modal instrument models, a generated reverb, our own loudness measurement), then encoded with FFmpeg (libopus for `.ogg`, FFmpeg's native AAC encoder for `.m4a`). No samples, soundfonts, loops or third-party recordings are used; the melodies and harmonies are original. The idioms are only styles (anime-film piano, a celesta waltz, choir and organ, koto and end-blown flute in the miyako-bushi scale, impressionist piano, harp, đàn tranh / sáo trúc / đàn bầu in the điệu Bắc pentatonic); no existing piece is quoted. Released with the game under its MIT licence. The build tools used (NumPy BSD-3, SciPy BSD-3, soundfile BSD-3, Matplotlib PSF-style for the analysis plots, FFmpeg LGPL/GPL as a command-line tool) are not shipped.

The v1 sprite below is kept only as the fallback when the v2 manifest cannot load.

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

## Forkwood 2.0 "Living Masterpieces" art (assets/v2/, made for Forkwood)

Everything under `assets/v2/` (7 worlds × sky/far/side layers for portrait and desktop, per-world trap and boss atlases, pickups, vehicles, currencies, drops, boosts, critter-skill badges, Growth Rings and Knots, 12 vine skins, gallery frames and UI kit) was generated for Forkwood with an AI image model (Hark `generate_image`) from our own prompts, then keyed, cleaned (despill, island removal, colour bleed, hole fill), sliced, made seamless, graded, textured at native resolution, packed and compressed by our own scripts in `art-src/tools/`. The prompt templates are recorded in `art-src/PROMPTS-V2.md`.

- **Reference images used as style input:** the owner's uploads `files/uploads/image-7/8/9.webp` (style references only), and our own v13 concept paintings `work/v13-maps/map-*.png`. No third-party image was copied into an asset.
- **Painters emulated in technique only (public domain):** Vincent van Gogh (d. 1890), Raphael and the Italian buon-fresco tradition (16th c.), the Edo ukiyo-e masters (Hokusai d. 1849), Claude Monet (d. 1926), Gustav Klimt (d. 1918), and traditional Vietnamese sơn mài lacquer technique and folk motifs (lotus, koi, bamboo, đình roofs, gold/silver leaf, eggshell inlay). All compositions are original: no Starry Night, School of Athens, Great Wave, Tree of Life or specific 20th-century lacquer work is reproduced.
- **No third-party assets, fonts, textures or code** were added by the art stream. Python libraries used offline in the pipeline: OpenCV (Apache-2.0), NumPy (BSD), Pillow (MIT-CMU). They are not shipped.
- AI disclosure line for store pages: *"Paintings and sprites AI-assisted from our own prompts and art direction, post-processed by our own pipeline; masters emulated in technique only (public domain)."*

## Forkwood 2.0 META (menus, store)
- **Cormorant Garamond** (700 + Vietnamese subset) — SIL Open Font License 1.1, © The Cormorant Project Authors. `assets/fonts/v2/cormorant-*.woff2`, licence in `assets/fonts/v2/OFL-CormorantGaramond.txt`. Latin file subset with fontTools (OFL allows modification; the Reserved Font Name is not used for the subset file name).
- **Be Vietnam Pro** (500, 800 + Vietnamese subset) — SIL Open Font License 1.1, © The Be Vietnam Pro Project Authors. `assets/fonts/v2/bevn-*.woff2`, licence in `assets/fonts/v2/OFL-BeVietnamPro.txt`.
- **GSAP 3.15** (single copy: ENGINE's `src/vendor/gsap.mjs`) — GreenSock "Standard No-Charge License" (https://gsap.com/standard-license), free for commercial use but **not** an OSI licence (flagged against CONTRACT's CC0/MIT/OFL rule; approved in PIPELINE.md / owner brief). Loaded lazily; the menus fall back to the Web Animations API without it.
- Placeholder gallery paintings `assets/meta/paintings/*.webp` — downscaled from the project's own v13 concept paintings (work/v13-maps, own-made, AI-assisted). Swappable through registry ids `<world>.ui.painting`.
- Menu icons, gilt frame corners and all CSS art — own-made.
