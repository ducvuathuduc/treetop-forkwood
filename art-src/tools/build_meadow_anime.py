"""V3 ANIME MEADOW: five height zones as distinct art (not grades).
Zone story (ZONE_M 0/200/450/800/1200 m): 0 Sunset meadow -> 1 Shrine hill -> 2 Sea of clouds -> 3 Blue hour above the clouds -> 4 Milky Way night.
Layers (registry ids; .p 1080x1920 portrait, .d 2560x1440 desktop; zone = worlds-art layer zone index):
  meadow.layer.sky      (zone 0)  meadow.layer.sky.z1..z4   (zones 1-4)   stretch-cover, opaque, AVIF + WebP
  meadow.layer.far      (zone 0)  meadow.layer.far.z1, .z2 (same 'day' file), .z3, .z4 (same 'night' file)  tile-y RGBA, AVIF + WebP
  meadow.layer.side     (zone 0)  meadow.layer.side.z1..z4                                                  tile-y RGBA, AVIF + WebP
Sources: art-src/raw/anime/ (sky-{p,l}-z<k>-hd.png from anime_upres.py; side-L/R-z<k>.png; far-day/night.png).
python3 build_meadow_anime.py"""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from artlib import *
import build_backdrops as BB
A = os.path.join(RAW, 'anime'); WID = 'meadow'
D = os.path.join(OUT, WID)
REVIEW = os.path.abspath(os.path.join(ROOT, '..', 'anime')); os.makedirs(REVIEW, exist_ok=True)
ZN = ['Sunset meadow', 'Shrine hill', 'Sea of clouds', 'Blue hour above the clouds', 'Milky Way night']
SUF = ['', '.z1', '.z2', '.z3', '.z4']
# side sources per zone: (left raw, right raw or None = mirrored left, flip right raw?)
SIDES = {0: ('side-L-z0.png', 'side-R-z0.png', True), 1: ('side-L-z1.png', 'side-R-z1.png', False), 2: ('side-L-z2.png', None, False),
         3: ('side-L-z3.png', None, False), 4: ('side-L-z4.png', None, False)}
FAR = {0: 'day', 1: 'day', 2: 'day', 3: 'night', 4: 'night'}
# phone budget (bytes, AVIF is what browsers load; WebP is the fallback)
BUD = {'sky.p': 42_000, 'sky.d': 120_000, 'far.p': 14_000, 'far.d': 30_000, 'side.p': 24_000, 'side.d': 48_000}

def bloom(img, thr=0.82, sigma=18, k=0.22):
    """baked lens bloom: screen-add a blurred copy of the brightest highlights (sun, rims)."""
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY); m = np.clip((lum - thr) / (1 - thr), 0, 1)[..., None]
    b = cv2.GaussianBlur(img * m, (0, 0), sigma) * k
    return 1 - (1 - img) * (1 - b)

def sky(z, kind):
    W_, H_ = (1080, 1920) if kind == 'p' else (2560, 1440)
    im = rd(os.path.join(A, f'sky-{"p" if kind == "p" else "l"}-z{z}-hd.png'))
    im = cover(im, W_, H_)
    im = bloom(im, sigma=W_ / 60)
    im = calm_lane(im, 0.32, 1 / 3 if kind == 'p' else 0.30)
    rng = np.random.default_rng(1000 + z)
    im = grain(im, 2.2, rng)  # film grain at native resolution
    return np.clip(im, 0, 1)

def side_strip(path, flip=False, crop_bottom=0.0):
    im = rd(os.path.join(A, path), alpha=True)
    if flip: im = im[:, ::-1].copy()
    if crop_bottom: im = im[:int(im.shape[0] * (1 - crop_bottom))]
    return tidy(im)

def mirror_side(L):
    # plain mirror: compose_side already offsets the right strip by H/2 (vertical wrap); rolling here put the
    # un-tiled top/bottom junction mid-strip as a hard horizontal seam
    return L[:, ::-1].copy()

def feather_x(F, frac=0.08):
    """fade alpha to 0 at the left/right borders so mirror-tiled far copies never butt as hard boxes"""
    w = F.shape[1]; n = max(2, int(w * frac)); r = np.ones(w, np.float32); t = np.linspace(0, 1, n)
    r[:n] = t * t * (3 - 2 * t); r[w - n:] = r[:n][::-1]
    F = F.copy(); F[..., 3] *= r[None, :]; return F

def save_layer(key, im, budget, alpha):
    fn = f'{WID}.layer.{key}.webp'; sz, q = fit_webp(im, os.path.join(D, fn), budget * 2 if alpha else budget * 4)
    av = fn.replace('.webp', '.avif'); s2, q2 = fit_avif(im, os.path.join(D, av), budget, qmax=60, qmin=20)
    return dict(file=f'{WID}/{fn}', avif=f'{WID}/{av}', bytes=sz, bytesAvif=s2, q=q, qAvif=q2, w=im.shape[1], h=im.shape[0])

TMP = os.path.join(ROOT, 'art-src', 'tmp', 'meadow-anime'); os.makedirs(TMP, exist_ok=True)
SZ = os.path.join(ROOT, 'art-src', 'backdrop-sizes-meadow-anime.json')
def keep(prev, key, im): prev[key] = im; np.save(os.path.join(TMP, key + '.npy'), im.astype(np.float16))
def load_prev(key): return np.load(os.path.join(TMP, key + '.npy')).astype(np.float32)

def main(stages):
    out = json.load(open(SZ)) if os.path.exists(SZ) else {}; prev = {}
    fogs = {}
    for z in range(5):
        if 'sky' not in stages and f'sky{z}' not in stages:
            fogs[z] = BB.fog_colour(load_prev(f'sky{SUF[z]}.p')); continue
        for kind in ('p', 'd'):
            im = sky(z, kind); key = f'sky{SUF[z]}.{kind}'
            out[key] = save_layer(key, im, BUD[f'sky.{kind}'], False); keep(prev, key, im)
            if kind == 'p': fogs[z] = BB.fog_colour(im)
        print('sky', z, {k: (v['bytes'], v['bytesAvif']) for k, v in out.items() if k.startswith(f'sky{SUF[z]}.')}, flush=True)
    # far: day (zones 0-2) and night (zones 3-4) files, registered once per zone
    for name, z in ((('day', 0), ('night', 3)) if 'far' in stages else ()):
        F = feather_x(tidy(rd(os.path.join(A, f'far-{name}.png'), alpha=True)))
        hz = 0.18 if name == 'day' else 0.12
        fp = BB.compose_far(F.copy(), 1080, 1 / 3, fogs[z], hz, 0.9); fd = BB.compose_far(F.copy(), 2560, 0.30, fogs[z], hz, 0.9)
        kp = 'far' if name == 'day' else 'far.night'
        out[kp + '.p'] = save_layer(kp + '.p', fp, BUD['far.p'], True); out[kp + '.d'] = save_layer(kp + '.d', fd, BUD['far.d'], True)
        keep(prev, kp + '.p', fp); keep(prev, kp + '.d', fd)
    for z in ([int(a[4:]) for a in stages if a.startswith('side') and a[4:]] or (range(5) if 'side' in stages else ())):
        l, r, flip = SIDES[z]
        L = side_strip(l, crop_bottom=0.08 if z in (0, 1) else 0)
        R = side_strip(r, flip=flip, crop_bottom=0.06 if z in (0, 1) else 0) if r else mirror_side(L)
        L = BB.inner_haze(L, 'L', fogs[z], 0.14); R = BB.inner_haze(R, 'R', fogs[z], 0.14)
        rp = max(BB.reach(L, 'L'), BB.reach(R, 'R')); sP = min(1.0, 0.34 * 1080 / rp)
        sp = BB.compose_side(L, R, 1080, sP, 1 / 3); sd = BB.compose_side(L, R, 2560, min(1.0, 0.30 * 2560 / rp * 0.62), 0.30)
        for kind, im in (('p', sp), ('d', sd)):
            key = f'side{SUF[z]}.{kind}'; out[key] = save_layer(key, im, BUD[f'side.{kind}'], True); keep(prev, key, im)
        print('side', z, out[f'side{SUF[z]}.p']['bytesAvif'], out[f'side{SUF[z]}.d']['bytesAvif'], 'sP=%.2f' % sP, flush=True)
    json.dump(out, open(SZ, 'w'), indent=1)
    if 'preview' not in stages: return
    # previews: one composited frame per zone (portrait + desktop) for review/QA
    for z in range(5):
        fk = 'far' if FAR[z] == 'day' else 'far.night'
        for kind in ('p', 'd'):
            pv = load_prev(f'sky{SUF[z]}.{kind}'); pv = BB.over(pv, load_prev(f'{fk}.{kind}'), 300); pv = BB.over(pv, load_prev(f'side{SUF[z]}.{kind}'), 0)
            cv2.imwrite(os.path.join(REVIEW, f'zone{z}-{kind}.jpg'), to_u8(pv), [cv2.IMWRITE_JPEG_QUALITY, 88])
    # the legacy single preview name used by review.py in-situ frames
    import shutil; os.makedirs(BB.REVIEW, exist_ok=True)
    for kind in ('p', 'd'): shutil.copy(os.path.join(REVIEW, f'zone0-{kind}.jpg'), os.path.join(BB.REVIEW, f'bd-meadow-{kind}.jpg'))
    tot_p = sum(v['bytesAvif'] for k, v in out.items() if k.endswith('.p')); tot_d = sum(v['bytesAvif'] for k, v in out.items() if k.endswith('.d'))
    print('phone total AVIF', tot_p, 'desktop total AVIF', tot_d)

ZN_VI = ['Đồng cỏ hoàng hôn', 'Đồi đền', 'Biển mây', 'Giờ xanh trên mây', 'Đêm Ngân Hà']
# near-neutral: each zone is its own painting now, the grade only nudges the white point
GRADE = [([1, 1, 1], [0, 0, 0], 1.0), ([1.0, 0.99, 0.97], [0, 0, 0], 1.0), ([1, 1, 1], [0, 0, 0], 1.0),
         ([0.98, 0.98, 1.0], [0, 0, 0.01], 1.0), ([0.96, 0.97, 1.0], [0, 0, 0.01], 1.0)]
PAR = {'sky': 0.0, 'far': 0.25, 'side': 0.5}

def measure(src, kind):
    """w/h/bytes straight from the shipped files (the sizes json can be stale when stages ran separately)"""
    from PIL import Image
    fn = f'{WID}/{WID}.layer.{src}.{kind}.webp'; av = fn.replace('.webp', '.avif')
    w, h = Image.open(os.path.join(OUT, fn)).size; wa_, ha_ = Image.open(os.path.join(OUT, av)).size
    assert (w, h) == (wa_, ha_), (fn, w, h, wa_, ha_)
    return dict(file=fn, avif=av, w=w, h=h, bytes=os.path.getsize(os.path.join(OUT, fn)), bytesAvif=os.path.getsize(os.path.join(OUT, av)))

def registry():
    """rewrite the meadow layer entries of assets/v2/registry.json + the meadow block of worlds-art.json in place"""
    sz = json.load(open(SZ)); rp = os.path.join(OUT, 'registry.json'); wp = os.path.join(OUT, 'worlds-art.json')
    reg = json.load(open(rp)); wa = json.load(open(wp))
    at = next(i for i, e in enumerate(reg) if e['id'].startswith(f'{WID}.layer.'))
    reg = [e for e in reg if not e['id'].startswith(f'{WID}.layer.')]
    ents, layers = [], []
    for typ in ('sky', 'far', 'side'):
        for z in range(5):
            rid = f'{WID}.layer.{typ}{SUF[z]}'
            src = f'{typ}{SUF[z]}' if typ != 'far' else ('far' if FAR[z] == 'day' else 'far.night')
            for kind in ('p', 'd'):
                v = measure(src, kind)
                if typ == 'sky': note = 'opaque, static (parallax 0), cover-fit; centre lane pre-calmed'
                elif typ == 'far': note = f'RGBA, tiles vertically (seamless), scroll at cam*0.25; {FAR[z]} far-cloud file (shared by zones ' + ('0-2' if FAR[z] == 'day' else '3-4') + ')'
                else: note = 'RGBA, tiles vertically (seamless), scroll at cam*0.5; left+right framing baked in one strip, centre transparent'
                ents.append(dict(id=f'{rid}.{kind}', file=v['file'], type='layer', world=WID, frames=1, fps=0, w=v['w'], h=v['h'], anchor=[0.5, 0.5],
                                 atlas=None, parallax=PAR[typ], mode='stretch-cover' if typ == 'sky' else 'tile-y', zone=z,
                                 target='1080x1920' if kind == 'p' else '2560x1440', bytes=v['bytes'], avif=v['avif'], bytesAvif=v['bytesAvif'],
                                 notes=f'V3 anime zone {z} ({ZN[z]}); {note}; ' + ('portrait variant' if kind == 'p' else 'desktop variant (full-width composition)')))
            layers.append(dict(key=rid, parallax=PAR[typ], mode='stretch-cover' if typ == 'sky' else 'tile-y', zone=z))
    reg[at:at] = ents
    m = wa[WID]; m['layers'] = layers
    m['zones'] = [dict(name=ZN[z], nameVi=ZN_VI[z], mul=GRADE[z][0], add=GRADE[z][1], sat=GRADE[z][2]) for z in range(5)]
    json.dump(reg, open(rp, 'w'), indent=1, ensure_ascii=False); json.dump(wa, open(wp, 'w'), indent=1, ensure_ascii=False)
    print('registry: meadow layer entries', len(ents), 'layers', len(layers))

if __name__ == '__main__':
    if sys.argv[1:] == ['registry']: registry(); sys.exit()
    main(sys.argv[1:] or ['sky', 'far', 'side', 'preview'])
