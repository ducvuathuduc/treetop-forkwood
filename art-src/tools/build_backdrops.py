"""Build per-world parallax layers: sky (stretch-cover), far (tile-y), side (tile-y) for
portrait 1080x1920 (p) and desktop 2560x1440 (d), plus zone-grade previews.
python3 build_backdrops.py [world ...]"""
import sys, json, os, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from artlib import *

W = {  # raw sources and per-world knobs
 'meadow':  dict(skyP='sky-p-meadow.png', skyL='sky-l-meadow.png', L='side-L-meadow.png', R='side-R-meadow.png', far='far-meadow.png', grain=3, haze=0.30),
 'starry':  dict(skyP='sky-p-starry2.png', skyL='sky-l-starry.png', L='side-L-starry.png', R='side-R-starry.png', far='far-starry.png', grain=3, haze=0.06),
 'fresco':  dict(skyP='sky-p-fresco.png', skyL='sky-l-fresco.png', L='side-L-fresco2.png', R='side-R-fresco.png', far='far-fresco.png', grain=3, haze=0.40, Rcrop=(0.13, 1.0)),
 'ukiyo':   dict(skyP='sky-p-ukiyo.png', skyL='sky-l-ukiyo.png', L='side-L-ukiyo.png', R='side-R-ukiyo.png', far='far-ukiyo.png', grain=2, haze=0.20),
 'lilies':  dict(skyP='sky-p-lilies.png', skyL='sky-l-lilies.png', L='side-L-lilies.png', R='side-R-lilies.png', far='far-lilies.png', grain=3, haze=0.30, Rcol=(0.42, 0.55)),
 'gilded':  dict(skyP='sky-p-gilded.png', skyL='sky-l-gilded.png', L='side-L-gilded.png', R='side-R-gilded.png', far='far-gilded.png', grain=2, haze=0.38, Rcol=(0.40, 0.50)),
 'lacquer': dict(skyP='sky-p-lacquer.png', skyL='sky-l-lacquer.png', L='side-L-lacquer.png', R='side-R-lacquer.png', far='far-lacquer.png', grain=2, haze=0.25, Lcrop=(0.0, 0.84)),
}
REVIEW = os.path.abspath(os.path.join(ROOT, '..', 'art-review'))

def fog_colour(sky):
    h, w = sky.shape[:2]; c = sky[int(h*0.3):int(h*0.7), int(w*0.4):int(w*0.6), :3]
    return c.reshape(-1, 3).mean(0)

def build_sky(name, raw, Wt, Ht, kind, rng, lane_frac, grain_amt):
    img = rd(os.path.join(RAW, raw))
    img = cover(img, Wt, Ht)
    img = calm_lane(img, 0.42, lane_frac)
    img = medium_texture(img, kind, rng, 0.45 if kind == 'impasto' else 0.8)
    img = unsharp(img, 1.2, 0.25)
    img = grain(img, grain_amt, rng)
    return img

def prep_strip(raw, crop=None, colmask=None, side='L'):
    im = rd(os.path.join(RAW, raw), alpha=True)
    if crop: h = im.shape[0]; im = im[int(h*crop[0]):int(h*crop[1])]
    if colmask:
        w = im.shape[1]; x = np.linspace(0, 1, w)
        m = np.clip((x - colmask[0]) / (colmask[1] - colmask[0]), 0, 1); m = m*m*(3-2*m)
        if side == 'L': m = 1 - m
        im[..., 3] *= m[None, :]
    return tidy(im)

def reach(strip, side):
    a = strip[..., 3].mean(0); cols = np.where(a > 0.02)[0]
    if not len(cols): return 1
    return (cols.max() + 1) if side == 'L' else (strip.shape[1] - cols.min())

def inner_haze(strip, side, fog, amt):
    w = strip.shape[1]; x = np.linspace(0, 1, w)
    t = x if side == 'L' else 1 - x
    t = np.clip(t / 0.6, 0, 1) ** 1.5 * amt
    out = strip.copy(); out[..., :3] = strip[..., :3] * (1 - t[None, :, None]) + fog[None, None, :] * t[None, :, None]
    return out

def place(canvas, sprite, x, y):
    """alpha-over (premultiplied-correct) of sprite onto RGBA canvas at x,y with vertical wrap."""
    H, Wc = canvas.shape[:2]; h, w = sprite.shape[:2]
    for yy in (y - H, y, y + H):
        y0, y1 = max(0, yy), min(H, yy + h); x0, x1 = max(0, x), min(Wc, x + w)
        if y1 <= y0 or x1 <= x0: continue
        s = sprite[y0 - yy:y1 - yy, x0 - x:x1 - x]; d = canvas[y0:y1, x0:x1]
        sa = s[..., 3:4]; da = d[..., 3:4]; oa = sa + da * (1 - sa)
        oc = (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
        canvas[y0:y1, x0:x1, :3] = oc; canvas[y0:y1, x0:x1, 3:4] = oa

def compose_side(Ls, Rs, Wt, scale, lane_frac):
    h = min(Ls.shape[0], Rs.shape[0]); Ls, Rs = Ls[:h], Rs[:h]
    Ls = seam_y(Ls, 220); Rs = seam_y(Rs, 220)
    if scale != 1:
        Ls = cv2.resize(Ls, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        Rs = cv2.resize(Rs, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    H = Ls.shape[0]; can = np.zeros((H, Wt, 4), np.float32)
    place(can, Ls, 0, 0); place(can, Rs, Wt - Rs.shape[1], H // 2)
    # never paint over the lane core
    m = lane_mask(Wt, H, inner=lane_frac/2*0.55, outer=lane_frac/2*1.05)
    can[..., 3] *= m
    return bleed(can)

def compose_far(F, Wt, lane_frac, fog, haze, alpha_mul=0.85):
    F = seam_y(F, 160)
    F[..., :3] = F[..., :3] * (1 - haze) + fog * haze
    H, w = F.shape[:2]; can = np.zeros((H, Wt, 4), np.float32)
    x = -(w - (Wt % w)) // 2; k = 0
    while x < Wt:  # mirror-tiling across (seamless) with a vertical phase shift per copy: no visible repeats
        T = F[:, ::-1] if k % 2 else F; T = np.roll(T, int(H * (0.37 * k % 1)), 0)
        x0, x1 = max(0, x), min(Wt, x + w); can[:, x0:x1] = T[:, x0 - x:x1 - x]; x += w; k += 1
    m = lane_mask(Wt, H, inner=lane_frac/2*0.6, outer=lane_frac/2*1.6)
    can[..., 3] *= alpha_mul * (0.22 + 0.78 * m)
    return bleed(can)

def over(base, layer, y_off=0):
    """composite a tile-y RGBA layer over an opaque base for previews"""
    H, Wb = base.shape[:2]; out = base.copy(); h = layer.shape[0]
    rows = (np.arange(H) + y_off) % h; L = layer[rows]
    a = L[..., 3:4]; out = out * (1 - a) + L[..., :3] * a; return out

def main(worlds):
    reg = []; sizes = {}
    os.makedirs(REVIEW, exist_ok=True)
    for wid in worlds:
        c = W[wid]; kind = MEDIUM[wid]; rng = np.random.default_rng(abs(hash(wid)) % 2**32)
        rng = np.random.default_rng(sum(map(ord, wid)) * 7919)
        d = os.path.join(OUT, wid); os.makedirs(d, exist_ok=True)
        skyP = build_sky(wid, c['skyP'], 1080, 1920, kind, rng, 1/3, c['grain'])
        skyD = build_sky(wid, c['skyL'], 2560, 1440, kind, rng, 0.30, c['grain'])
        fog = fog_colour(skyP)
        L = prep_strip(c['L'], c.get('Lcrop'), c.get('Lcol'), 'L'); R = prep_strip(c['R'], c.get('Rcrop'), c.get('Rcol'), 'R')
        L = inner_haze(L, 'L', fog, 0.22); R = inner_haze(R, 'R', fog, 0.22)
        rp = max(reach(L, 'L'), reach(R, 'R'))
        sP = min(1.0, 0.36 * 1080 / rp)
        sideP = compose_side(L, R, 1080, sP, 1/3)
        sideD = compose_side(L, R, 2560, 1.0, 0.30)
        F = tidy(rd(os.path.join(RAW, c['far']), alpha=True))
        farP = compose_far(F.copy(), 1080, 1/3, fog, c['haze'])
        farD = compose_far(F.copy(), 2560, 0.30, fog, c['haze'])
        out = {}
        for key, im, budget in (('sky.p', skyP, 200_000), ('sky.d', skyD, 330_000), ('far.p', farP, 62_000), ('far.d', farD, 140_000), ('side.p', sideP, 100_000), ('side.d', sideD, 170_000)):
            fn = f'{wid}.layer.{key}.webp'; sz, q = fit_webp(im, os.path.join(d, fn), budget)
            out[key] = (fn, sz, q, im.shape[1], im.shape[0])
            if key.startswith('sky'):
                av = fn.replace('.webp', '.avif'); s2, q2 = fit_avif(im, os.path.join(d, av), 140_000 if key == 'sky.p' else 230_000); out[key + '.avif'] = (av, s2, q2)
        sizes[wid] = out
        # previews
        pv = skyP.copy(); pv = over(pv, farP, 300); pv = over(pv, sideP, 0)
        cv2.imwrite(os.path.join(REVIEW, f'bd-{wid}-p.jpg'), to_u8(pv), [cv2.IMWRITE_JPEG_QUALITY, 86])
        dv = skyD.copy(); dv = over(dv, farD, 200); dv = over(dv, sideD, 0)
        cv2.imwrite(os.path.join(REVIEW, f'bd-{wid}-d.jpg'), to_u8(dv), [cv2.IMWRITE_JPEG_QUALITY, 86])
        np.save(os.path.join(ROOT, 'art-src', 'tmp', f'fog-{wid}.npy'), fog) if os.path.isdir(os.path.join(ROOT,'art-src','tmp')) else None
        print(wid, {k: v[1] for k, v in out.items()}, 'sP=%.2f' % sP, flush=True)
    json.dump(sizes, open(os.path.join(ROOT, 'art-src', f'backdrop-sizes-{"-".join(worlds)}.json'), 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1:] or list(W))
