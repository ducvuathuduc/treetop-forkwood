#!/usr/bin/env python3
"""V3.2 LIVING BACKDROPS: rebuild the far cloud plates that read as cut-and-pasted stickers.

The V3.1 far plates of meadow (day + night), ukiyo and starry were slices with hard alpha
(straight vertical fade seams, floating rock islands, mini-moons). They are replaced by new
paintings made for the job (art-src/living-src/*.webp, generated on pure black in each world's
style) and LUMINANCE-KEYED: alpha comes from the paint itself, so every edge is as soft as the
brush that painted it (no matte line, no cut). Then:
  * colour is un-premultiplied from black (fg = rgb / alpha) and graded to the zone,
  * a low-frequency noise mask thins dense paintings into separate wisps (starry),
  * alpha fades to zero at the top/bottom of the plate so tile-y repeats have no seam,
  * desktop (.d, 2560 wide) is mirrored-tiled from the same paint.
The living shader then boils and noise-erodes these plates at runtime (src/gfx/living.js).

  python3 art-src/tools/living_far.py
Writes assets/v2/<world>/<world>.layer.far[.night].{p,d}.webp (+ .avif where the registry has one).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art-src', 'living-src')
V2 = os.path.join(ROOT, 'assets', 'v2')


def f32(im): return np.asarray(im.convert('RGB')).astype(np.float32) / 255.0


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1); return t * t * (3 - 2 * t)


def key(rgb, lo=0.05, hi=0.5, gamma=1.0):
    """Luminance key off black, the exact inverse of a 'screen' over black: linear alpha from the
    brightest channel, colour un-premultiplied (fg * a == rgb), so fades to black become fades to clear."""
    m = rgb.max(-1)
    al = np.clip((m - lo) / (hi - lo), 0, 1)
    fg = np.clip(rgb / np.maximum(m, 1e-3)[..., None] * np.maximum(m, hi)[..., None], 0, 1)  # hue kept, brightness of the full-strength paint
    return fg, al ** gamma


def feather(p, frac=0.15):
    """Fade a premultiplied piece to clear at its own top and bottom (no straight crop lines)."""
    h = p.shape[0]; y = np.arange(h)[:, None] / max(1, h - 1)
    return p * (smooth(0, frac, y) * smooth(0, frac, 1 - y))[..., None]


def noise(h, w, scale, seed):
    rng = np.random.default_rng(seed)
    x = rng.standard_normal((max(2, h // scale), max(2, w // scale)))
    x = ndi.zoom(ndi.gaussian_filter(x, 1.2, mode='wrap'), (h / x.shape[0], w / x.shape[1]), order=3)[:h, :w]
    return (x - x.min()) / (x.max() - x.min() + 1e-9)


def ends_fade(a, frac=0.1):
    h = a.shape[0]
    y = np.arange(h)[:, None] / (h - 1)
    return a * smooth(0, frac, y) * smooth(0, frac, 1 - y)


def resize(arr, w, h):
    """Resize premultiplied RGBA float arrays."""
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA' if arr.shape[2] == 4 else 'RGB')
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0


def premul(fg, a): return np.concatenate([fg * a[..., None], a[..., None]], -1)


def unpremul(p):
    a = p[..., 3:4]
    return np.concatenate([np.where(a > 1e-3, np.clip(p[..., :3] / np.maximum(a, 1e-3), 0, 1), 0), a], -1)


def place(canvas, piece, y, flip=False):
    if flip: piece = piece[:, ::-1]
    h = min(piece.shape[0], canvas.shape[0] - y)
    if h <= 0: return
    c = canvas[y:y + h]; p = piece[:h]
    canvas[y:y + h] = p + c * (1 - p[..., 3:4])  # premultiplied "over"


def mirror_tile(p, W):
    """Widen a premultiplied plate to W by mirrored repeats (seamless at every join)."""
    out = [p]; k = 1
    while sum(x.shape[1] for x in out) < W:
        out.append(p[:, ::-1] if k % 2 else p); k += 1
    return np.concatenate(out, 1)[:, :W]


def save(p, path, avif=False):
    rgba = unpremul(p)
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    im.save(path + '.webp', 'WEBP', quality=80, method=6, alpha_quality=85)
    if avif: im.save(path + '.avif', 'AVIF', quality=70)
    print(os.path.relpath(path, ROOT), im.size, os.path.getsize(path + '.webp'))


def build_meadow():
    src = f32(Image.open(os.path.join(SRC, 'v32-meadow-clouds.webp')))
    H, W = src.shape[:2]
    band = src[: int(H * 0.5)]  # the cloud field (the rest of the painting is black)
    fg, a = key(band, 0.03, 0.6)
    # warm cloud tops stay; shadow sides lean toward the sky blue so the clouds sit in the air
    a = a * 0.9
    for night, out_h in ((False, 1216), (True, 1104)):
        g = fg.copy()
        if night:  # blue hour / night: cool, dimmer, thinner
            g = g * np.array([0.55, 0.6, 0.85]) + np.array([0.06, 0.07, 0.14])
            aa = a * 0.62
        else:
            aa = a
        P = premul(np.clip(g, 0, 1), aa)
        name = 'meadow.layer.far.night' if night else 'meadow.layer.far'
        for var, w in (('p', 1080), ('d', 2560)):
            canvas = np.zeros((out_h, w, 4), np.float32)
            bw = 1080 if var == 'p' else 1376
            piece = resize(P, bw, int(round(P.shape[0] * bw / P.shape[1])))
            if var == 'd':
                piece = mirror_tile(piece, w)
            piece = feather(piece, 0.12); ph = piece.shape[0]
            place(canvas, piece, int(out_h * 0.06))
            place(canvas, resize(piece[:, ::-1], piece.shape[1], int(ph * 0.72)), int(out_h * 0.55))  # a smaller mirrored field lower down
            canvas *= ends_fade(np.ones((out_h, 1)), 0.08)[..., None]
            save(canvas, os.path.join(V2, 'meadow', f'{name}.{var}'), avif=True)


def build_ukiyo():
    src = f32(Image.open(os.path.join(SRC, 'v32-ukiyo-kasumi.webp')))
    H, W = src.shape[:2]
    band = src[int(H * 0.04): int(H * 0.86)]  # kasumi bands, Fuji silhouette cropped off
    fg, a = key(band, 0.04, 0.6)
    # the source fades its band ends to grey; in the sky they must fade to clear in the band's own cream
    m = band.max(-1)[..., None]
    cream = np.array([0.95, 0.88, 0.78])
    # keep each texel's hue (peach / cream) but lift it to the band's paper brightness, so the darker
    # bokashi ends read as thinning paint, not grey smudges, over the pale sky
    Lf = (fg * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
    fg = np.clip(fg * (0.88 / np.maximum(Lf, 0.05)), 0, 1) * 0.85 + cream * 0.15
    # bokashi: soften the hard woodblock edge a touch so the bands sit in the haze
    a = ndi.gaussian_filter(a, 1.6) * 0.8
    P = premul(fg, a)
    for var, w in (('p', 1080), ('d', 2560)):
        piece = resize(P, 1080, int(round(P.shape[0] * 1080 / P.shape[1])))
        if var == 'd': piece = mirror_tile(piece, w)
        canvas = np.zeros((1216, w, 4), np.float32)
        place(canvas, piece[: 1216], 0)
        canvas *= ends_fade(np.ones((1216, 1)), 0.1)[..., None]
        save(canvas, os.path.join(V2, 'ukiyo', f'ukiyo.layer.far.{var}'))


def build_starry():
    src = f32(Image.open(os.path.join(SRC, 'v32-starry-wind.webp')))
    H, W = src.shape[:2]
    band = src[int(H * 0.1): int(H * 0.92)]
    fg, a = key(band, 0.12, 0.7, 1.2)
    # thin the dense wall of swirls into separate drifting wisps (soft low-frequency mask)
    n = noise(a.shape[0], a.shape[1], 90, 11)
    a = a * smooth(0.5, 0.72, n) * 0.62
    P = premul(fg, a)
    for var, w in (('p', 1080), ('d', 2560)):
        piece = resize(P, 1080, int(round(P.shape[0] * 1080 / P.shape[1])))
        if var == 'd': piece = mirror_tile(piece, w)
        canvas = np.zeros((1216, w, 4), np.float32)
        place(canvas, piece[: 1216], 0)
        canvas *= ends_fade(np.ones((1216, 1)), 0.1)[..., None]
        save(canvas, os.path.join(V2, 'starry', f'starry.layer.far.{var}'))


if __name__ == '__main__':
    build_meadow(); build_ukiyo(); build_starry()
