"""Forkwood 2.0 art pipeline library (shared by backdrop + sprite builders).
All functions are deterministic given a seed. Images: float32 BGR(A) in 0..1 unless noted."""
import cv2, numpy as np, os, io
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'art-src', 'raw')
OUT = os.path.join(ROOT, 'assets', 'v2')

def rd(path, alpha=False):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if im.ndim == 2: im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR)
    if alpha and im.shape[2] == 3: im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
    if not alpha and im.shape[2] == 4: im = im[..., :3]
    return im.astype(np.float32) / 255.

# ---------------------------------------------------------------- noise / texture
def noise(shape, scale, rng, octaves=4):
    out = np.zeros(shape, np.float32); amp = 1.; tot = 0
    for o in range(octaves):
        s = max(1, int(scale / (2 ** o)))
        n = rng.standard_normal((shape[0] // s + 2, shape[1] // s + 2)).astype(np.float32)
        n = cv2.resize(n, (shape[1] + 2 * s, shape[0] + 2 * s), interpolation=cv2.INTER_CUBIC)[s:s + shape[0], s:s + shape[1]]
        out += amp * n; tot += amp; amp *= 0.5
    return out / tot

def bump(img, height, strength):
    gx = cv2.Sobel(height, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(height, cv2.CV_32F, 0, 1, ksize=3)
    sh = (-gx * 0.7 - gy * 0.7) * strength
    out = img.copy(); out[..., :3] = np.clip(img[..., :3] + sh[..., None], 0, 1); return out

def medium_texture(img, kind, rng, k=1.0):
    """Native-resolution medium texture (paper / canvas / plaster / washi / gold / lacquer).
    Applied AFTER upscaling so fine detail is native, never upscaled. k scales strength."""
    h, w = img.shape[:2]; c = img[..., :3]
    if kind == 'gouache':
        paper = noise((h, w), 3, rng, 3) * 0.022 + noise((h, w), 40, rng, 2) * 0.015
        c = c * (1 + k * paper[..., None]); c = bump(c, cv2.GaussianBlur(cv2.cvtColor(np.clip(c,0,1).astype(np.float32), cv2.COLOR_BGR2GRAY), (0, 0), 0.8), 0.06 * k)
    elif kind in ('canvas', 'impasto'):
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        weave = np.sin(xx * 2 * np.pi / 4.5) * np.sin(yy * 2 * np.pi / 4.5) * 0.5 + noise((h, w), 2, rng, 2) * 0.5
        c = bump(c, weave * 0.012 * k, 1.0)
        if kind == 'impasto':
            lum = cv2.cvtColor(np.clip(c,0,1).astype(np.float32), cv2.COLOR_BGR2GRAY); hp = lum - cv2.GaussianBlur(lum, (0, 0), 3)
            c = bump(c, hp, 0.22 * k)
    elif kind == 'plaster':
        c = c * (1 + k * noise((h, w), 60, rng, 5)[..., None] * 0.05)
        c = bump(c, noise((h, w), 4, rng, 3) * 0.013 * k, 1.0)
        cr = np.zeros((h, w), np.uint8)
        for _ in range(int(h * w / 40000 * k)):
            x, y = int(rng.integers(0, w)), int(rng.integers(0, h)); a = rng.uniform(0, 2 * np.pi)
            for _ in range(int(rng.integers(15, 60))):
                a += rng.normal(0, 0.5); nx, ny = int(x + np.cos(a) * 6), int(y + np.sin(a) * 6)
                cv2.line(cr, (x, y), (nx, ny), 255, 1, cv2.LINE_AA); x, y = nx, ny
        c = c * (1 - cv2.GaussianBlur(cr.astype(np.float32) / 255, (0, 0), 0.6)[..., None] * 0.22)
    elif kind == 'washi':
        f1 = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), sigmaX=0.6, sigmaY=9)
        f2 = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), sigmaX=9, sigmaY=0.6)
        c = c * (1 + k * ((f1 + f2) * 0.9 + noise((h, w), 30, rng, 3) * 0.02)[..., None] * 0.05)
    elif kind == 'gold':
        hsv = cv2.cvtColor((np.clip(c,0,1) * 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
        gold = ((hsv[..., 0] > 12) & (hsv[..., 0] < 32) & (hsv[..., 1] > 90) & (hsv[..., 2] > 120)).astype(np.float32)
        gold = cv2.GaussianBlur(gold, (0, 0), 1.5)
        sp = np.clip(noise((h, w), 6, rng, 3) * 3 - 1.6, 0, 1); sheet = noise((h, w), 90, rng, 2) * 0.07
        c = c + (gold * (sp * 0.14 + sheet) * k)[..., None] * np.array([0.55, 0.85, 1.0], np.float32)
        c = bump(c, noise((h, w), 3, rng, 2) * 0.011 * k, 1.0)
    elif kind == 'lacquer':
        sc = np.zeros((h, w), np.float32)
        for _ in range(int(h * w / 2300 * k)):
            x, y = int(rng.integers(0, w)), int(rng.integers(0, h)); a = rng.normal(0.35, 0.25); L = int(rng.integers(15, 90))
            cv2.line(sc, (x, y), (int(x + np.cos(a) * L), int(y + np.sin(a) * L)), float(rng.uniform(0.3, 1)), 1, cv2.LINE_AA)
        lum = cv2.cvtColor(np.clip(c,0,1).astype(np.float32), cv2.COLOR_BGR2GRAY); dark = np.clip(1 - lum * 2.2, 0, 1)
        c = c + (sc * dark * 0.05)[..., None]
    out = img.copy(); out[..., :3] = np.clip(c, 0, 1); return out

MEDIUM = {'meadow': 'gouache', 'starry': 'impasto', 'fresco': 'plaster', 'ukiyo': 'washi', 'lilies': 'canvas', 'gilded': 'gold', 'lacquer': 'lacquer'}

def lane_mask(w, h, centre=0.5, inner=0.12, outer=0.28):
    """0 in the middle third (gameplay lane), 1 at the edges, smoothstep between."""
    x = np.abs(np.linspace(0, 1, w) - centre)
    m = np.clip((x - inner) / (outer - inner), 0, 1); m = m * m * (3 - 2 * m)
    return np.repeat(m[None, :], h, 0).astype(np.float32)

def calm_lane(img, amount=0.45, lane_frac=1/3):
    """Lower local contrast in the central lane: blend toward a blurred copy and compress around local mean."""
    h, w = img.shape[:2]
    inner = lane_frac / 2 * 0.72; outer = lane_frac / 2 * 1.75
    m = 1 - lane_mask(w, h, inner=inner, outer=outer)
    blur = cv2.GaussianBlur(img, (0, 0), max(2, w / 300))
    mean = cv2.GaussianBlur(img, (0, 0), max(8, w / 40))
    calm = mean + (blur - mean) * 0.6
    wgt = (m * amount)[..., None]
    return img * (1 - wgt) + calm * wgt

def grain(img, amt, rng):
    g = rng.standard_normal(img.shape[:2]).astype(np.float32) * amt / 255
    out = img.copy(); out[..., :3] = np.clip(img[..., :3] + g[..., None], 0, 1); return out

def unsharp(img, sigma=1.0, amt=0.35):
    b = cv2.GaussianBlur(img, (0, 0), sigma); return np.clip(img + (img - b) * amt, 0, 1)

def cover(img, W, H):
    """Crop to aspect then Lanczos resize to exactly W×H."""
    h, w = img.shape[:2]; ta = W / H
    if w / h > ta:
        nw = int(round(h * ta)); x0 = (w - nw) // 2; img = img[:, x0:x0 + nw]
    else:
        nh = int(round(w / ta)); y0 = (h - nh) // 2; img = img[y0:y0 + nh]
    return cv2.resize(img, (W, H), interpolation=cv2.INTER_LANCZOS4 if img.shape[1] < W else cv2.INTER_AREA)

# ---------------------------------------------------------------- alpha hygiene
def despill(rgba, band_px=4):
    """Kill chroma-green spill on the silhouette band + any near-pure key-green inside."""
    out = rgba.copy(); a = rgba[..., 3]; b, g, r = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    opaque = (a > 0.98).astype(np.uint8)
    band = (cv2.erode(opaque, np.ones((2 * band_px + 1,) * 2, np.uint8)) == 0)
    mx = np.maximum(r, b)
    spill_edge = band & (g > mx)
    keyish = (g > 0.6) & (r < 0.35) & (b < 0.35) & (g > 1.8 * mx)
    fix = spill_edge | keyish
    out[..., 1] = np.where(fix, np.minimum(g, mx * 1.02 + 0.01), g)
    return out

def clean_islands(rgba, min_area=24, a_floor=0.03):
    a = rgba[..., 3].copy(); a[a < a_floor] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), 8)
    small = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < min_area])
    a[small] = 0
    out = rgba.copy(); out[..., 3] = a; return out

def bleed(rgba, iters=6):
    """Fill RGB under fully transparent pixels with nearby opaque colour (no dark halos when filtered)."""
    out = rgba.copy(); a = (rgba[..., 3] > 0.5).astype(np.float32); c = rgba[..., :3] * a[..., None]; wsum = a.copy()
    for _ in range(iters):
        c = cv2.blur(c, (3, 3)) * 9; wsum = cv2.blur(wsum, (3, 3)) * 9
        c2 = c / np.maximum(wsum, 1e-6)[..., None]
        holes = rgba[..., 3] <= 0.5
        out[..., :3] = np.where(holes[..., None] & (wsum[..., None] > 0), c2, out[..., :3])
        c = out[..., :3] * (wsum > 0)[..., None]; wsum = (wsum > 0).astype(np.float32)
    return out

def tidy(rgba, min_area=24):
    return bleed(clean_islands(despill(rgba), min_area))

# ---------------------------------------------------------------- seamless tiling
def seam_y(img, overlap):
    """Make an image vertically tileable by cross-fading its bottom `overlap` rows into the top."""
    h = img.shape[0]; o = overlap
    t = np.linspace(0, 1, o, dtype=np.float32)[:, None, None]
    t = t * t * (3 - 2 * t)
    top = img[:o]; bot = img[h - o:]
    blend = top * t + bot * (1 - t)
    return np.concatenate([blend, img[o:h - o]], 0)

def seam_x(img, overlap):
    return np.transpose(seam_y(np.transpose(img, (1, 0, 2)), overlap), (1, 0, 2))

# ---------------------------------------------------------------- encode
def to_u8(img): return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)

def pil(img):
    u = to_u8(img)
    if u.shape[2] == 4: return Image.fromarray(cv2.cvtColor(u, cv2.COLOR_BGRA2RGBA))
    return Image.fromarray(cv2.cvtColor(u, cv2.COLOR_BGR2RGB))

def save_webp(img, path, q=80, alpha_q=90, method=6):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    p = pil(img); p.save(path, 'WEBP', quality=q, alpha_quality=alpha_q, method=method)
    return os.path.getsize(path)

def save_avif(img, path, q=55):
    p = pil(img); p.save(path, 'AVIF', quality=q, speed=6); return os.path.getsize(path)

def fit_webp(img, path, budget, qmax=88, qmin=38):
    """Highest WebP quality whose file fits `budget` bytes."""
    p = pil(img)
    for q in range(qmax, qmin - 1, -4):
        buf = io.BytesIO(); p.save(buf, 'WEBP', quality=q, alpha_quality=80, method=6)
        if buf.tell() <= budget or q - 4 < qmin:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'wb').write(buf.getvalue()); return buf.tell(), q

def fit_avif(img, path, budget, qmax=56, qmin=32):
    p = pil(img)
    for q in range(qmax, qmin - 1, -6):
        buf = io.BytesIO(); p.save(buf, 'AVIF', quality=q, speed=8)
        if buf.tell() <= budget or q - 6 < qmin:
            open(path, 'wb').write(buf.getvalue()); return buf.tell(), q
