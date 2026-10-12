# Forkwood 2.0 art prompts (reproducibility record)

Tool: Hark `generate_image` (portrait 768×1376, landscape 1376×768). `transparent_background:true` keys chroma green. Raw outputs are in `art-src/raw/` (gitignored, about 90 MB). Post-processing: `tools/build_backdrops.py`, `tools/slicer.py`, `tools/build_sprites.py`, `tools/make_registry.py`, `tools/review.py`.

## Shared blocks
- **Lane rule (backdrops):** "COMPOSITION RULE: the middle vertical third is calm … low contrast, no objects, so things drawn on top later read clearly; detail lives at the left and right thirds and the bottom."
- **Negative:** "No vine, no birds, no people … No text, no letters, no watermark, no signature, no logo, no UI, no frame or border. Not a 3D render, not glossy, no airbrushed gradients, no plastic CGI look."
- **Sprite sheet:** "A game sprite sheet: N separate objects in a C×R grid on a solid pure flat chroma green #00FF00 background … wide green margin, nothing overlapping, no grid lines, no labels, no text. Style: <world medium> SIMPLIFIED for a game: clean bold readable silhouette, a consistent thin <ink colour> ink outline of even weight, flat planes with 2-3 value steps, light from the upper left; not 3D. Every hazard carries a small glowing red-orange (#FF5A2A) warning accent."
- **Common sprite style:** "hand-painted gouache game sprite in a refined storybook style, clean bold readable silhouette, a consistent thin warm dark-brown ink outline (#2A1A12) of even weight, flat painted planes with 2-3 value steps and subtle brush texture, warm key light from the upper left, a small crisp highlight (+ soft warm golden glow halo for rewards); not 3D, no plastic sheen."

## Per asset (subject lines; full text = subject + world medium + shared blocks)
| File (raw) | Ref images | Subject |
|---|---|---|
| sky-p-meadow / sky-l-meadow | v13 map-1, owner image-7 / sky-p | golden-hour sky, cumulus towers at the edges, small snowy cone peak low right, pampas sliver |
| sky-p-starry2 / sky-l-starry | sky-p-starry (v1, rejected: clip-art stars), owner image-8 | horizontal wind ribbons, edge eddies, haloed blob stars, full moon upper left, village lights along the bottom; NOT The Starry Night |
| sky-p-fresco / sky-l-fresco | owner image-9, v13 map-3 | original sotto-in-su painted ceiling, coffered vaults at the edges, no crowd |
| sky-p-ukiyo / sky-l-ukiyo | v13 map-4 | dawn bokashi sky, cloud bands, vermilion sun, small cone mountain low left |
| sky-p-lilies / sky-l-lilies | v13 map-5 | pond surface reflecting lilac/gold sky, willow reflections at the edges |
| sky-p-gilded / sky-l-gilded | v13 map-6 | gold-leaf canopy field, leaf-dot mosaic at the top and edges, flower strip at the bottom |
| sky-p-lacquer / sky-l-lacquer | v13 map-7 | black lacquer night, gold-leaf moon, silver cloud scrolls, đình roofs and lotus low |
| side-L-* / side-R-* | world sky | single framing element hugging the left/right edge, top-to-bottom continuous (tree+pampas / birch; cypress / olive; column / niche pier; cliff+pines / waterfall; willow / wisteria trellis; birches; banyan+lanterns / bamboo+lantern) |
| far-* | world sky/side | sparse distant elements on green (clouds; wind wisps; arcade towers; cloud bands+birds; lily clusters; hazy birches; bamboo+sky lanterns) |
| trap-<world> | world side | 6 hazards per world, see registry `*.trap.*` (flyer in two poses) |
| pick-a, pick-b | none | 12 pickups (MECHANICS §2.1 + pollen/ink/rush) |
| veh-a, veh-b | none | 10 rides (MECHANICS §2.2) + kite |
| cur-a, cur-b | none | acorn, dew gem, piles, ride token, seed pod, knot hollow closed/open, chest closed/open, magnet, head start |
| skill-a | none | 8 critter skill badges (MECHANICS §2.4) |
| rings-a, rings-b | none | 12 ring medallions (+2 spare), 4 knots, ring card, I/II/III pips |
| boss-<world> | world trap sheet | 2 poses (idle, wind-up): Crow King, Night Mistral, Stone Cherub, Oni Kite, Heron Matriarch, Golden Peacock, Carp Dragon |
| vine-a..d | none | 3 skins per sheet: stem strip + leaf + flower (cel, impasto, fresco chalk / sumi, dabs, gold leaf / lacquer, watercolour, sakura / maple, moon silver, Chu Dau ceramic) |
| ui-frames-a/b, ui-kit | none | 8 museum frames (9-slice) and the kit: primary/pressed/secondary button, parchment panel, close, bar track, plaque, velvet rope |

## V2-INT additions (integration, 2026-10-11)
Sheets `art-src/raw/trap2-<world>.png` (generate_image, transparent_background, the world's existing `<world>.traps.webp` as style reference except lacquer, which copied its reference and was regenerated without one). Shared block = the sprite-sheet block above with "exactly N separate objects in ONE horizontal row". Subjects:
- meadow: dew orb web with red-orange spider; red squirrel holding an acorn; fallen mossy branch lashed with hemp rope + hanging planks (bough bridge, replaces the off-theme railway crossing).
- starry: swooping barn swallow (red-orange throat); falling haloed impasto star, tail up (5-point core repainted as a round dab core in post).
- fresco: brass censer on a chain with red-orange embers; ochre bat with red-orange eyes.
- ukiyo: horizontal pine bough; sweeping oar with foam; two jagged sea rocks like closing jaws.
- lilies: reed web; snapping turtle from above; pollen spore puff; pondweed tendril strip.
- gilded: vertical gold glare shaft; birch bough; black-gold spiral tendrils; gold flake cluster with ember core.
- lacquer: mosquito net (visible diamond mesh) in a black lacquer bamboo frame; ivory paper lantern with flame; firecracker string; black lacquer folding screen with gold lotus + eggshell.
Post: `tools/slice_t2.py <world>` then `tools/build_t2.py` (atlases `<world>.traps2.webp`, registry merge, warn frames baked).

## V3 ANIME MEADOW (five height zones as distinct paintings, 2026-10-12)
Record note: the session that generated these plates left no verbatim prompt log, so the subjects below are written from the delivered sources in `art-src/raw/anime/` (gitignored) and are the templates to regenerate them. Generator: Hark `generate_image` (portrait 768x1376, landscape 1376x768; sides/far with transparent background). Style block shared by all: "cinematic hand-painted anime film background, crisp cel-shaded cloud edges with soft painted gradients, saturated sky blues and warm sunset rim light, clean centre column of open sky (the playfield), no characters, no text, no logos". No film, studio or living artist is named or reproduced.

| zone (ZONE_M) | name / Vietnamese | sky plate `sky-{p,l}-z<k>` | side strip `side-L/R-z<k>` | far |
|---|---|---|---|---|
| 0 (0 m) | Sunset meadow / Đồng cỏ hoàng hôn | low sun with soft rays on the horizon, towering cumulus at both edges, distant blue hills, pampas and white wildflower meadow along the bottom | L: pampas, shrubs and wildflowers climbing the left edge; R: tall grass and white star-flowers (flipped) | `far-day`: small scattered fair-weather cumulus puffs |
| 1 (200 m) | Shrine hill / Đồi đền | cedar forest, mossy stone steps and stone lanterns up to a weathered torii, sunbeams through the trees, warm late light | L: giant cedar trunk bound with shimenawa rope and paper shide; R: yellow-green maple foliage with hanging shide | `far-day` |
| 2 (450 m) | Sea of clouds / Biển mây | above the cloud layer: endless cloud sea to the horizon, sun low right, a snowy cone peak just piercing the clouds, clear blue sky above | L: towering sunlit cumulus wall (mirrored for the right) | `far-day` |
| 3 (800 m) | Blue hour above the clouds / Giờ xanh trên mây | blue-hour violet sky over a calm cloud sea, thin orange horizon line, crescent moon and evening star, lavender cumulus towers | L: lavender-blue cumulus wall with pink rim light (mirrored) | `far-night`: long thin wind-stretched cloud streaks |
| 4 (1200 m) | Milky Way night / Đêm Ngân Hà | deep night, the Milky Way arcing up the sky, dense star field with a few bright four-point stars, dark cloud bank along the bottom with a faint glow | L: dark teal night cloud wall with small glowing green fireflies/spirit lights (mirrored) | `far-night` |

Post: `tools/anime_upres.py` (tile re-render "identical composition, add crisp detail", low-freq base + high-freq tile merge -> `sky-*-z<k>-hd.png`), then `tools/build_meadow_anime.py` (bloom, calm lane, film grain, compose/seam side + far strips, AVIF+WebP to budget, previews `work/v3/anime/zone<k>-{p,d}.jpg`), `build_meadow_anime.py registry` (meadow entries in `assets/v2/registry.json` + `worlds-art.json`). Far strips are alpha-feathered at their left/right borders before mirror-tiling; single-source side strips are mirrored without a vertical roll (compose_side already offsets the right strip by H/2).
