# Credits

Third-party libraries, fonts, icons and sounds used in Forkwood, with their licences.

## Libraries

| Library | Used for | Licence |
|---|---|---|
| [PixiJS v8](https://pixijs.com/) | WebGL renderer, vendored as `src/vendor/pixi.mjs` | MIT, [src/vendor/LICENSE-pixi.txt](src/vendor/LICENSE-pixi.txt) |
| [ZzFX 1.4.0](https://github.com/KilledByAPixel/ZzFX) by Frank Force | short menu and shop sound effects, `src/vendor/zzfx.js` (no AudioContext on import) | MIT, [src/vendor/LICENSE-ZzFX.txt](src/vendor/LICENSE-ZzFX.txt) |
| [GSAP 3](https://gsap.com/) | menu animation, loaded lazily, `src/vendor/gsap.mjs` | GreenSock Standard No-Charge License, [src/vendor/LICENSE-gsap.txt](src/vendor/LICENSE-gsap.txt) |
| [PeerJS 1.5.5](https://peerjs.com/) | Live race over WebRTC, loaded from CDN only when a race starts | MIT |

## Fonts (SIL Open Font License 1.1)

Self-hosted WOFF2 subsets from [Google Fonts](https://github.com/google/fonts) sources (the OFL allows subsetting).

| Font | Licence text |
|---|---|
| Baloo 2 | [assets/fonts/v3/OFL-baloo2.txt](assets/fonts/v3/OFL-baloo2.txt) |
| Nunito | [assets/fonts/v3/OFL-nunito.txt](assets/fonts/v3/OFL-nunito.txt) |
| Lexend | [assets/fonts/v3/OFL-lexend.txt](assets/fonts/v3/OFL-lexend.txt) |
| Be Vietnam Pro | [assets/fonts/v3/OFL-bevietnampro.txt](assets/fonts/v3/OFL-bevietnampro.txt) |
| Bricolage Grotesque | [assets/fonts/v3/OFL-bricolagegrotesque.txt](assets/fonts/v3/OFL-bricolagegrotesque.txt) |
| Plus Jakarta Sans | [assets/fonts/v3/OFL-plusjakartasans.txt](assets/fonts/v3/OFL-plusjakartasans.txt) |
| Grandstander | [assets/fonts/v3/OFL-grandstander.txt](assets/fonts/v3/OFL-grandstander.txt) |
| Sansita Swashed | [assets/fonts/v3/OFL-sansitaswashed.txt](assets/fonts/v3/OFL-sansitaswashed.txt) |
| Cormorant Garamond | [assets/fonts/v2/OFL-CormorantGaramond.txt](assets/fonts/v2/OFL-CormorantGaramond.txt) |
| Fraunces | [assets/fonts/OFL-Fraunces.txt](assets/fonts/OFL-Fraunces.txt) |
| JetBrains Mono | [assets/fonts/OFL-JetBrainsMono.txt](assets/fonts/OFL-JetBrainsMono.txt) |

## Icons (ISC)

Menu icons in `src/icons.js` and `index.html` are from [Lucide](https://lucide.dev) (some originally from Feather, MIT).

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

## Sound effects (CC0 1.0)

Fallback sound sprite `assets/audio/sfx.mp3`:

* [Impact Sounds](https://kenney.nl/assets/impact-sounds) by Kenney, CC0, [licence](assets/audio/LICENSE-Kenney-Impact-Sounds.txt)
* [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney, CC0, [licence](assets/audio/LICENSE-Kenney-Interface-Sounds.txt)

## Testing only (not shipped)

Playwright and Chromium, used to run the browser tests locally.
