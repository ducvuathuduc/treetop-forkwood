#!/usr/bin/env python3
"""V3.2 LIVING BACKDROPS: bake a flow/mask map for every painted sky plate.

A production "living painting" keeps the painting itself and moves it in the shader:
flow maps (Vlachos, Water Flow in Portal 2, SIGGRAPH 2010) drag the paint along a vector
field in two cross-faded phases, masks say where water ripples, grass sways, stars twinkle,
haze drifts and light rays may fall. This tool derives those maps from each plate:

  * flow direction = the painting's OWN brush direction (structure-tensor tangent), signed
    to agree with a per-world base field (prevailing wind, Van Gogh vortices around the stars),
    so the paint slides along its strokes instead of smearing across them;
  * masks from colour/position heuristics per world (reviewed by eye, see V32-MAPS-REPORT.md).

Output per plate (1/8 of the plate size, two halves side by side, RGB webp, no alpha so the
GPU never premultiplies the data):
  left  half  R,G = flow vector (0.5 = still, magnitude = speed), B = wave (0..0.5 water ripple,
              0.5..1 wind sway)
  right half  R = twinkle / glow pulse, G = drifting haze, B = light-ray mask
plus src/gfx/living-data.js (ray origins per plate).

  python3 art-src/tools/living_maps.py            # all plates
  python3 art-src/tools/living_maps.py starry     # one world
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'v2')
OUT = os.path.join(ROOT, 'assets', 'v3', 'living')
DATA_JS = os.path.join(ROOT, 'src', 'gfx', 'living-data.js')
DOWN = 8  # map texel = 8x8 plate pixels (the shader filters it bilinearly)


def load(path, scale):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    im = im.resize((max(8, w // scale), max(8, h // scale)), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255.0


def hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    s = np.where(mx > 1e-4, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx


def lum(a):
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def blur(x, s):
    return ndi.gaussian_filter(x, s, mode='nearest')


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def tangent(L, s=3.0):
    """Dominant brush direction (unit tangent, sign ambiguous) and coherence 0..1."""
    gx = ndi.sobel(L, 1, mode='nearest'); gy = ndi.sobel(L, 0, mode='nearest')
    jxx, jyy, jxy = blur(gx * gx, s), blur(gy * gy, s), blur(gx * gy, s)
    ang = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2  # perpendicular to the gradient
    tr = jxx + jyy + 1e-9
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / tr
    return np.cos(ang), np.sin(ang), np.clip(coh, 0, 1)


def flow_field(img, base, align=0.75, s=3.0):
    """Brush-aligned flow: tangent signed by the base field, blended by coherence."""
    L = lum(img)
    tx, ty, coh = tangent(L, s)
    bx, by = base
    sg = np.sign(tx * bx + ty * by); sg[sg == 0] = 1
    tx, ty = tx * sg, ty * sg
    bn = np.sqrt(bx * bx + by * by) + 1e-9
    k = np.clip(coh * align, 0, 1)
    fx = bx / bn * (1 - k) + tx * k
    fy = by / bn * (1 - k) + ty * k
    n = np.sqrt(fx * fx + fy * fy) + 1e-9
    return fx / n, fy / n


def grid(img):
    h, w = img.shape[:2]
    v, u = np.mgrid[0:h, 0:w].astype(np.float32)
    return u / (w - 1), v / (h - 1), w, h


def local_peaks(L, s=1.2, k=0.12):
    """Small bright points (stars, lights): luminance above its neighbourhood."""
    return smooth(k * 0.5, k * 1.6, L - blur(L, 4.0)) * smooth(0.45, 0.75, L)


def vortex(u, v, cx, cy, r, aspect, ccw=1.0):
    dx, dy = u - cx, (v - cy) * aspect
    d = np.sqrt(dx * dx + dy * dy) + 1e-4
    k = np.exp(-(d * d) / (r * r)) * ccw
    return -dy / d * k, dx / d * k


def blobs(mask, min_px=6):
    lab, n = ndi.label(mask > 0.5)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < min_px: continue
        out.append((xs.mean(), ys.mean(), np.sqrt(len(xs) / np.pi)))
    return out


def horizon_row(mask, frac=0.3):
    rows = mask.mean(1)
    idx = np.nonzero(rows > frac)[0]
    return idx[0] if len(idx) else mask.shape[0]


# ---------------------------------------------------------------- per world
def m_meadow0(img):
    u, v, w, h = grid(img); H, S, V = hsv(img)
    grass = ((H > 45) & (H < 150) & (V < 0.8) & (S > 0.18) & (v > 0.55)).astype(np.float32)
    grass = blur(grass, 1.5)
    hr = horizon_row(grass > 0.5, 0.35) / (h - 1)
    sky = 1 - smooth(hr - 0.06, hr + 0.01, v)
    fx, fy = flow_field(img, (np.ones_like(u), np.zeros_like(u) - 0.05), align=0.35)
    sun = blur(smooth(0.9, 0.99, lum(img)) * (v > 0.3) * (v < hr + 0.05), 1.5)
    speed = sky * (1 - sun) * (0.45 + 0.55 * smooth(0.55, 0.9, lum(img)))  # clouds move, open sky barely
    sway = smooth(0.25, 0.6, grass) * smooth(hr - 0.02, hr + 0.06, v)
    tw = sun * 0.9
    mist = np.exp(-((v - hr) / 0.06) ** 2) * 0.9
    ray = sky
    return dict(flow=(fx * speed, fy * speed), water=0, sway=sway, tw=tw, mist=mist, ray=ray, rayO=peak(lum(img) * (v < hr + 0.05) * (v > 0.25)), hz=hr - 0.03)


def m_meadow1(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    cloud = smooth(0.62, 0.85, L) * smooth(0.25, 0.08, S)
    fx, fy = flow_field(img, (np.ones_like(u), -0.1 * np.ones_like(u)), align=0.3)
    speed = blur(cloud, 2) * (v < 0.8)
    grass = ((H > 50) & (H < 160) & (S > 0.25) & (v > 0.86)).astype(np.float32)
    sway = blur(grass, 1.2) * 0.8
    tw = blur(smooth(0.88, 0.98, L), 1.2) * 0.7
    ray = smooth(0.35, 0.6, L) * (v < 0.85)
    return dict(flow=(fx * speed, fy * speed), water=0, sway=sway, tw=tw, mist=np.exp(-((v - 0.82) / 0.1) ** 2) * 0.6, ray=ray, rayO=peak(blur(L, 4) * (v < 0.6)), hz=0.8)


def m_meadow2(img):
    u, v, w, h = grid(img); L = lum(img)
    sun = blur(smooth(0.9, 0.99, L), 1.5)
    fx, fy = flow_field(img, (np.ones_like(u), np.zeros_like(u)), align=0.4)
    near = 0.55 + 0.45 * smooth(0.6, 1.0, v)  # the sea of clouds below drifts faster (closer)
    speed = (1 - sun) * near * smooth(0.25, 0.6, L)
    return dict(flow=(fx * speed, fy * speed), water=0, sway=0, tw=sun * 0.9, mist=np.exp(-((v - 0.66) / 0.08) ** 2) * 0.8, ray=smooth(0.3, 0.6, L), rayO=peak(L * (v > 0.3) * (v < 0.85)))


def m_meadow3(img):
    u, v, w, h = grid(img); L = lum(img)
    stars = local_peaks(L, k=0.08) * (v < 0.6)
    moon = blur(smooth(0.8, 0.95, L) * (v < 0.3), 1.0)
    fx, fy = flow_field(img, (np.ones_like(u), np.zeros_like(u)), align=0.35)
    speed = smooth(0.3, 0.6, L) * (1 - np.clip(stars + moon, 0, 1))
    return dict(flow=(fx * speed, fy * speed), water=0, sway=0, tw=np.clip(stars * 1.2 + moon * 0.6, 0, 1), mist=np.exp(-((v - 0.66) / 0.08) ** 2) * 0.7, ray=0, rayO=None)


def m_meadow4(img):
    u, v, w, h = grid(img); L = lum(img)
    stars = local_peaks(L, k=0.07)
    fx, fy = flow_field(img, (np.zeros_like(u) + 0.3, -np.ones_like(u)), align=0.7, s=4)
    band = smooth(0.25, 0.5, blur(L, 4)) * (v < 0.85)
    cloud = (v > 0.82) * smooth(0.15, 0.4, L)
    speed = band * 0.35 * (1 - stars) + cloud * 0.8
    fx2 = np.where(v > 0.82, 1.0, fx); fy2 = np.where(v > 0.82, 0.0, fy)
    return dict(flow=(fx2 * speed, fy2 * speed), water=0, sway=0, tw=np.clip(stars * 1.3, 0, 1), mist=0, ray=0, rayO=None)


def m_starry(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    asp = h / w
    yellow = ((H > 30) & (H < 65) & (S > 0.25) & (V > 0.6)).astype(np.float32)
    yellow = ndi.binary_opening(yellow > 0.5, iterations=1).astype(np.float32)
    # ground / river band at the bottom (dark rows)
    rows = blur(L, 2).mean(1)
    dark = np.nonzero(rows[::-1] > 0.12)[0]
    gy = (h - 1 - (dark[0] if len(dark) else 0)) / (h - 1)
    ground = smooth(gy - 0.015, gy + 0.005, v)
    bx = np.ones_like(u) * 0.55; by = np.zeros_like(u)
    for (cx, cy, r) in blobs(yellow, 8):
        rr = max(r / w * 2.6, 0.06)
        vx, vy = vortex(u, v, cx / (w - 1), cy / (h - 1), rr, asp, 1.0)
        bx += vx * 2.2; by += vy * 2.2
    # the big central swirls (Van Gogh's S-curve), slower counter-rotation
    for (cx, cy, r, d) in [(0.32, 0.36, 0.2, -1), (0.66, 0.5, 0.18, 1), (0.3, 0.7, 0.16, -1)]:
        vx, vy = vortex(u, v, cx, cy, r, asp, d)
        bx += vx * 0.9; by += vy * 0.9
    fx, fy = flow_field(img, (bx, by), align=0.85, s=2.5)
    starm = blur(yellow, 1.2)
    speed = (1 - ground) * (1 - np.clip(starm * 1.4, 0, 1) * 0.85)
    lights = local_peaks(L, k=0.06) * ground
    tw = np.clip(starm * 0.9 + lights * 1.2, 0, 1)
    water = ground * 0.95
    return dict(flow=(fx * speed, fy * speed), water=water, sway=0, tw=tw, mist=0, ray=0, rayO=None, hz=gy - 0.02)


def m_fresco(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    blue = ((H > 185) & (H < 235) & (S > 0.12) & (V > 0.45)).astype(np.float32)
    sky = smooth(0.35, 0.6, blur(blue, 3.0))
    sky = ndi.grey_erosion(sky, size=(3, 3))
    fx, fy = flow_field(img, (np.ones_like(u), np.zeros_like(u)), align=0.3)
    speed = sky * (0.4 + 0.6 * smooth(0.55, 0.85, L))
    gold = ((H > 30) & (H < 55) & (S > 0.45) & (V > 0.55)).astype(np.float32) * (1 - sky)
    tw = blur(gold, 0.8) * 0.35
    top = peak(blur(L, 3) * (v < 0.4) * sky + 1e-3 * (1 - v))
    return dict(flow=(fx * speed, fy * speed), water=0, sway=0, tw=tw, mist=sky * 0.6, ray=sky, rayO=top)


def m_ukiyo(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    blue = ((H > 180) & (H < 235) & (S > 0.2)).astype(np.float32)
    hue_rows = H.mean(1)  # the sea band reads cool (hue > 110) under a warm cream sky
    sea = np.nonzero((hue_rows > 110) & (np.arange(h) > h * 0.8))[0]
    sy = (sea[0] if len(sea) else h - 1) / (h - 1)  # top of the wave band
    water = smooth(sy - 0.005, sy + 0.015, v) * 0.9
    fuji = blur(((v > sy - 0.12) & (v < sy + 0.02) & ((blue > 0.5) | (L > 0.85))).astype(np.float32), 1.5)
    red = ((H < 20) | (H > 345)) & (S > 0.35) & (V > 0.5)
    sun = blur(red.astype(np.float32), 1.5)
    fx, fy = flow_field(img, (np.ones_like(u), np.zeros_like(u)), align=0.6)
    sky = 1 - smooth(sy - 0.14, sy - 0.04, v)
    speed = sky * (1 - sun) * (1 - fuji)
    return dict(flow=(fx * speed, fy * speed), water=water, sway=0, tw=sun * 0.7, mist=sky * (0.5 + 0.5 * np.exp(-((v - (sy - 0.08)) / 0.1) ** 2)), ray=0, rayO=None, hz=sy - 0.1)


def m_lilies(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    edge = np.minimum(u, 1 - u)
    green = ((H > 60) & (H < 170) & (S > 0.15)).astype(np.float32)
    willow = blur(green * (edge < 0.3) * (v < 0.8), 1.5)
    willow = smooth(0.25, 0.55, willow) * (1 - smooth(0.6, 0.8, v))
    water = smooth(0.48, 0.62, v) * (1 - willow) * (0.6 + 0.4 * smooth(0.6, 0.95, v))
    haze = (1 - smooth(0.45, 0.6, v)) * (1 - willow)
    fx, fy = flow_field(img, (0.35 * np.ones_like(u), -np.ones_like(u)), align=0.3)
    speed = haze * 0.8
    sway = willow
    ray = haze
    return dict(flow=(fx * speed, fy * speed), water=water * 0.5, sway=sway, tw=local_peaks(L, k=0.08) * smooth(0.5, 0.6, v) * 0.6, mist=haze * 0.8 + water * 0.3, ray=ray, rayO=peak(blur(L, 4) * (v < 0.35) * (edge > 0.25)), hz=0.5)


def m_gilded(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    gold = ((H > 30) & (H < 58) & (S > 0.35) & (V > 0.5)).astype(np.float32)
    flowers = ((S > 0.45) & (v > 0.82) & ((H < 25) | (H > 270) | ((H > 180) & (H < 260)))).astype(np.float32)
    sway = blur(smooth(0.82, 0.9, v) * (1 - blur(gold, 1) * 0.5), 1.0) * 0.7
    centre = smooth(0.3, 0.6, blur(gold, 5)) * (1 - smooth(0.8, 0.9, v))
    fx, fy = flow_field(img, (0.2 * np.ones_like(u), -np.ones_like(u)), align=0.2)
    speed = centre * 0.5
    tw = np.clip(blur(gold, 0.7) * centre * 0.8 + local_peaks(L, k=0.1) * (v < 0.35) * 0.4, 0, 1)
    return dict(flow=(fx * speed, fy * speed), water=0, sway=sway, tw=tw, mist=centre * 0.7, ray=centre, rayO=peak(blur(L, 5) * (v < 0.45) + 1e-3 * (1 - v)))


def m_lacquer(img):
    u, v, w, h = grid(img); H, S, V = hsv(img); L = lum(img)
    moon = blur(((L > 0.45) & (v < 0.35) & (H > 25) & (H < 60)).astype(np.float32), 1.5)
    goldc = ((H > 25) & (H < 60) & (S > 0.3) & (L > 0.25) & (v < 0.3)).astype(np.float32) * (1 - smooth(0.3, 0.6, moon))
    leaves = ((H > 60) & (H < 180) & (S > 0.15) & (v > 0.75)).astype(np.float32)
    white = ((L > 0.6) & (v > 0.75)).astype(np.float32)
    lotus = blur(np.clip(leaves + white, 0, 1), 1.2)
    darkwater = (L < 0.12) * smooth(0.8, 0.86, v)
    water = blur(darkwater.astype(np.float32), 1.5) * (1 - smooth(0.2, 0.5, lotus)) * 0.8
    fx, fy = flow_field(img, (np.ones_like(u), np.zeros_like(u)), align=0.5)
    speed = blur(goldc, 2.0)
    sway = smooth(0.2, 0.5, lotus) * 0.6
    black = (L < 0.15) * (1 - smooth(0.82, 0.86, v))
    return dict(flow=(fx * speed, fy * speed), water=water * 0.5, sway=sway, tw=np.clip(moon * 0.7 + local_peaks(L, k=0.1) * 0.5, 0, 1), mist=blur(black.astype(np.float32), 3) * 0.7, ray=0, rayO=None)


def peak(x):
    if x is None: return None
    j, i = np.unravel_index(np.argmax(blur(x, 3)), x.shape)
    return [round(float(i) / (x.shape[1] - 1), 3), round(float(j) / (x.shape[0] - 1), 3)]


PLATES = {
    'meadow': [('meadow.layer.sky', m_meadow0), ('meadow.layer.sky.z1', m_meadow1), ('meadow.layer.sky.z2', m_meadow2), ('meadow.layer.sky.z3', m_meadow3), ('meadow.layer.sky.z4', m_meadow4)],
    'starry': [('starry.layer.sky', m_starry)], 'fresco': [('fresco.layer.sky', m_fresco)], 'ukiyo': [('ukiyo.layer.sky', m_ukiyo)],
    'lilies': [('lilies.layer.sky', m_lilies)], 'gilded': [('gilded.layer.sky', m_gilded)], 'lacquer': [('lacquer.layer.sky', m_lacquer)],
}


def bake(world, key, fn, var):
    path = os.path.join(SRC, world, f'{key}.{var}.webp')
    if not os.path.exists(path): return None
    img = load(path, 4)  # analysis at 1/4, written at 1/8
    m = fn(img)
    h, w = img.shape[:2]
    z = lambda x: np.full((h, w), float(x), np.float32) if np.isscalar(x) else np.asarray(x, np.float32)
    fx, fy = m['flow']
    fx, fy = blur(z(fx), 1.2), blur(z(fy), 1.2)
    water = np.clip(z(m['water']), 0, 1); sway = np.clip(z(m['sway']), 0, 1)
    wave = np.where(sway > water, 0.5 + 0.5 * sway, 0.5 * water)
    wave = np.where((sway < 0.02) & (water < 0.02), 0, wave)
    left = np.stack([0.5 + 0.5 * np.clip(fx, -1, 1), 0.5 + 0.5 * np.clip(fy, -1, 1), wave], -1)
    right = np.stack([np.clip(z(m['tw']), 0, 1), np.clip(z(m['mist']), 0, 1), np.clip(z(m['ray']), 0, 1)], -1)
    W2, H2 = max(4, w // 2), max(4, h // 2)
    to = lambda a: Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((W2, H2), Image.BILINEAR)
    out = Image.new('RGB', (W2 * 2, H2))
    out.paste(to(left), (0, 0)); out.paste(to(right), (W2, 0))
    os.makedirs(OUT, exist_ok=True)
    name = f'{key}.{var}.flow.webp'
    out.save(os.path.join(OUT, name), 'WEBP', quality=88, method=6)
    return name, m.get('rayO'), m.get('hz')


def bake_noise(n=256, seed=7):
    """Tileable noise (FFT-filtered, so it wraps): R,G = soft fbm (haze, gusts), B = fine grain (sparkle)."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(n)[:, None]; fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy) + 1e-6
    def band(power, lo=0.0, hi=1.0):
        spec = np.fft.fft2(rng.standard_normal((n, n))) * (f ** -power) * (f > lo) * (f < hi)
        x = np.real(np.fft.ifft2(spec)); x = (x - x.mean()) / (x.std() + 1e-9)
        return np.clip(0.5 + x * 0.18, 0, 1)
    img = np.stack([band(1.6, 1.5 / n), band(1.4, 1.5 / n), band(0.4, 8 / n)], -1)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, 'noise.webp'), 'WEBP', quality=82, method=6)


def main():
    only = set(sys.argv[1:])
    bake_noise()
    data = {}
    if os.path.exists(DATA_JS):
        try:
            txt = open(DATA_JS).read(); data = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
        except Exception:
            data = {}
    for world, plates in PLATES.items():
        if only and world not in only: continue
        for key, fn in plates:
            for var in ('p', 'd'):
                r = bake(world, key, fn, var)
                if not r: continue
                name, rayO, hz = r
                data[f'{key}.{var}'] = {'map': name, 'ray': rayO}
                if hz is not None: data[f'{key}.{var}']['hz'] = round(float(hz), 3)
                print(name, os.path.getsize(os.path.join(OUT, name)), 'ray', rayO)
    with open(DATA_JS, 'w') as f:
        f.write('// GENERATED by art-src/tools/living_maps.py (V3.2 living backdrops): flow/mask map per painted plate\n')
        f.write('// and the light-ray origin (plate uv) where the plate has a sun / oculus / canopy light. Do not edit.\n')
        f.write('export const LIVING_MAPS = ' + json.dumps(data, indent=1, sort_keys=True) + ';\n')


if __name__ == '__main__':
    main()
