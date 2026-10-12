"""V3 ANIME: generative detail up-res for the meadow sky plates.
The base plate (generate_image, 768x1376 portrait / 1376x768 landscape) is cut into overlapping 16:9 tiles
(raw/anime/tiles/<p|l><zone>-<k>.png, boxes in tiles/boxes.json); each tile is re-rendered by generate_image at
1376x768 with an "identical composition, add crisp detail" prompt (raw/anime/tiles/up-*.png, ~1.8x the base
texel density). Merge = low frequencies of the (Lanczos) base + high frequencies of the aligned tile, feathered
over the overlaps, so colour/geometry drift of a tile can never show as a seam. Output at a size that needs
<= 1.0x (portrait) / 1.03x (desktop) magnification of generated texels.
python3 anime_upres.py  -> raw/anime/sky-{p,l}-z<k>-hd.png"""
import os, sys, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from artlib import RAW, rd, to_u8
A = os.path.join(RAW, 'anime'); T = os.path.join(A, 'tiles')
BOX = json.load(open(os.path.join(T, 'boxes.json')))

def align(base_crop, tile):
    """sub-pixel translation of tile onto base_crop (both same size), phase correlation on luma."""
    a = cv2.cvtColor(base_crop, cv2.COLOR_BGR2GRAY); b = cv2.cvtColor(tile, cv2.COLOR_BGR2GRAY)
    (dx, dy), r = cv2.phaseCorrelate(a, b)
    if r < 0.2 or abs(dx) > 30 or abs(dy) > 30: dx = dy = 0
    M = np.float32([[1, 0, -dx], [0, 1, -dy]])
    return cv2.warpAffine(tile, M, (tile.shape[1], tile.shape[0]), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT), (dx, dy, r)

def feather(h, w, f, t=True, b=True, l=True, r=True):
    """taper weights on the tile sides that have a neighbour (t/b/l/r); plate edges keep full weight"""
    big = 10 ** 6; ar_h, ar_w = np.arange(h), np.arange(w)
    y = np.minimum(ar_h if t else ar_h + big, (ar_h[::-1] if b else ar_h[::-1] + big)); x = np.minimum(ar_w if l else ar_w + big, (ar_w[::-1] if r else ar_w[::-1] + big))
    wy = np.clip(y / f, 0, 1); wx = np.clip(x / f, 0, 1)
    m = np.outer(wy, wx).astype(np.float32); return m * m * (3 - 2 * m)

def upres(kind, z, S, sigma):
    base = rd(os.path.join(A, f'sky-{kind}-z{z}.png'))
    H, W = base.shape[:2]; OH, OW = round(H * S), round(W * S)
    big = cv2.resize(base, (OW, OH), interpolation=cv2.INTER_LANCZOS4)
    low = cv2.GaussianBlur(big, (0, 0), sigma)
    acc = np.zeros_like(big); wsum = np.zeros((OH, OW, 1), np.float32); log = []
    for k in range(4):
        key = f'{kind[0]}{z}-{k}'; p = os.path.join(T, f'up-{key}.png')
        if not os.path.exists(p): log.append((key, 'missing')); continue
        x0, y0, x1, y1 = BOX[key]; X0, Y0, X1, Y1 = round(x0 * S), round(y0 * S), round(x1 * S), round(y1 * S)
        tile = cv2.resize(rd(p), (X1 - X0, Y1 - Y0), interpolation=cv2.INTER_AREA)
        tile, info = align(big[Y0:Y1, X0:X1].copy(), tile); log.append((key, tuple(round(v, 2) for v in info)))
        hi = tile - cv2.GaussianBlur(tile, (0, 0), sigma)
        # edges of the full plate are not feathered (no neighbour there)
        m = feather(Y1 - Y0, X1 - X0, max(8, 0.12 * min(X1 - X0, Y1 - Y0)), Y0 > 0, Y1 < OH - 1, X0 > 0, X1 < OW - 1)
        acc[Y0:Y1, X0:X1] += hi * m[..., None]; wsum[Y0:Y1, X0:X1] += m[..., None]
    hi = acc / np.maximum(wsum, 1e-4); cover = np.clip(wsum * 4, 0, 1)
    out = np.clip(low + hi * cover + (big - low) * (1 - cover), 0, 1)
    cv2.imwrite(os.path.join(A, f'sky-{kind}-z{z}-hd.png'), to_u8(out))
    return out.shape, log

if __name__ == '__main__':
    zs = [int(a) for a in sys.argv[1:]] or range(5)
    for z in zs:
        # portrait 768x1376 -> 1080x1920 needs 1.406x; tiles carry 1.79x, so build at 1.406 (<=1.0x of tile texels)
        print('p', z, upres('p', z, 1920 / 1376, 2.2))
        # landscape 1376x768 -> 2560x1440 needs 1.875x; tiles carry 1.81x -> 1.03x
        print('l', z, upres('l', z, 1440 / 768, 2.6))
