"""Merge layer + sprite registry parts into assets/v2/registry.json, bake zone-grade previews, write palettes."""
import os, sys, json, glob, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from artlib import *
REVIEW = os.path.abspath(os.path.join(ROOT, '..', 'art-review'))
WORLDS = ['meadow', 'starry', 'fresco', 'ukiyo', 'lilies', 'gilded', 'lacquer']
SAFE = dict(reward='#FFC94A', danger='#FF5A2A', vineInk='#1E2A1C')
# zone grades low->high: name, multiply rgb, add rgb (0..1), saturation. Applied once per zone to a cached copy of sky/far/side (no live filter).
Z = lambda n, m, a=(0, 0, 0), s=1.0: dict(name=n, mul=list(m), add=list(a), sat=s)
ZONES = {
 'meadow': [Z('Windy meadow', (1, 1, 1)), Z('Railway embankment', (1.03, 1.0, 0.95)), Z('Cumulus towers', (1.06, 0.97, 0.88), (0.02, 0.01, 0)), Z('Orange-violet dusk', (1.0, 0.78, 0.82), (0.04, 0.0, 0.05), 1.05), Z('Meteor night', (0.42, 0.48, 0.72), (0.02, 0.03, 0.08), 0.85)],
 'starry': [Z('Wheatfield with crows', (1.08, 1.04, 0.9), (0.04, 0.03, 0)), Z('Cypress rows', (1, 1, 1)), Z('Village lights', (0.95, 0.95, 1.02)), Z('Swirling sky', (0.9, 0.95, 1.08), (0, 0.01, 0.03), 1.08), Z('Stars and moon', (0.7, 0.74, 0.92), (0.0, 0.0, 0.04), 1.1)],
 'fresco': [Z('Mosaic floor', (1.02, 0.98, 0.92)), Z('Colonnade', (1, 1, 1)), Z('Coffered vault', (0.98, 0.95, 0.9), (0.02, 0.01, 0)), Z('Cherub clouds', (1.04, 1.0, 1.02), (0.03, 0.03, 0.04), 0.95), Z('Golden dome', (1.08, 0.95, 0.72), (0.05, 0.03, 0), 1.05)],
 'ukiyo': [Z('Boats in the surf', (0.95, 1, 1.05)), Z('Wave foot', (1, 1, 1)), Z('Claw foam', (1.02, 1.0, 0.97)), Z('Sacred peak', (1.05, 0.93, 0.88), (0.03, 0.0, 0.0)), Z('Ink night', (0.45, 0.5, 0.72), (0.0, 0.02, 0.06), 0.8)],
 'lilies': [Z('Pond surface', (1, 1, 1)), Z('Japanese bridge', (0.98, 1.02, 0.98)), Z('Wisteria arbour', (1.02, 0.95, 1.06), (0.02, 0, 0.03)), Z('Haystacks at noon', (1.08, 1.02, 0.88), (0.03, 0.02, 0)), Z('Sunrise impression', (1.05, 0.82, 0.78), (0.05, 0.01, 0.02), 1.1)],
 'gilded': [Z('Flower carpet', (1, 1, 1)), Z('Birch spirals', (0.98, 0.98, 0.95)), Z('Mosaic grove', (0.95, 0.98, 0.98), (0, 0.01, 0.02)), Z('Gold leaf field', (1.06, 1.0, 0.85), (0.03, 0.02, 0)), Z('Golden stars', (0.62, 0.55, 0.45), (0.03, 0.02, 0.0), 1.05)],
 'lacquer': [Z('Lotus pond', (1.05, 1.02, 0.98), (0.02, 0.02, 0.01)), Z('Bamboo hedge', (1, 1, 1)), Z('Village gate and đình roofs', (1.04, 0.96, 0.9), (0.02, 0, 0)), Z('Lantern night', (1.02, 0.9, 0.85)), Z('Gold-leaf moon', (0.85, 0.88, 1.0), (0.0, 0.0, 0.02), 1.05)],
}
VINE_DEFAULT = {'meadow': 'cel', 'starry': 'impasto', 'fresco': 'frescochalk', 'ukiyo': 'sumi', 'lilies': 'dabs', 'gilded': 'goldleaf', 'lacquer': 'lacquer'}
PARALLAX = dict(sky=0.0, far=0.25, side=0.5)

def grade(img, z):
    o = img * np.array(z['mul'][::-1], np.float32) + np.array(z['add'][::-1], np.float32)
    o = np.clip(o, 0, 1)
    if z['sat'] != 1:
        g = cv2.cvtColor(o, cv2.COLOR_BGR2GRAY)[..., None]; o = np.clip(g + (o - g) * z['sat'], 0, 1)
    return o

def palette(img, k=6):
    px = cv2.resize(img, (90, 160), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32)
    _, lab, cen = cv2.kmeans(px, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    order = np.argsort(-np.bincount(lab.ravel(), minlength=k))
    return ['#%02X%02X%02X' % tuple(int(c * 255) for c in cen[i][::-1]) for i in order]

reg = []; worlds = {}
for w in WORLDS:
    d = f'{w}'
    for key in ('sky', 'far', 'side'):
        for v, (W, H) in (('p', (1080, 1920)), ('d', (2560, 1440))):
            fn = f'{w}/{w}.layer.{key}.{v}.webp'; p = os.path.join(OUT, fn)
            from PIL import Image
            im = Image.open(p); e = dict(id=f'{w}.layer.{key}.{v}', file=fn, type='layer', world=w, frames=1, fps=0, w=im.width, h=im.height, anchor=[0.5, 0.5], atlas=None,
                 parallax=PARALLAX[key], mode='stretch-cover' if key == 'sky' else 'tile-y', target=f'{W}x{H}', bytes=os.path.getsize(p))
            if key == 'sky': e['avif'] = fn.replace('.webp', '.avif'); e['bytesAvif'] = os.path.getsize(os.path.join(OUT, e['avif']))
            e['notes'] = {'sky': 'opaque, static (parallax 0), cover-fit; centre lane pre-calmed', 'far': 'RGBA, tiles vertically (seamless), scroll at cam*0.25; already hazed toward the sky colour; lane alpha pre-reduced',
                          'side': 'RGBA, tiles vertically (seamless), scroll at cam*0.5; left+right framing baked in one strip, centre transparent'}[key] + ('; portrait variant' if v == 'p' else '; desktop variant (full-width composition)')
            reg.append(e)
    sky = rd(os.path.join(OUT, f'{w}/{w}.layer.sky.p.webp'))
    pal = palette(sky)
    worlds[w] = dict(palette=dict(bg=pal[0], swatch=pal, vine=None, reward=SAFE['reward'], danger=SAFE['danger'], vineInk=SAFE['vineInk']),
                     zones=ZONES[w], vineSkinDefault=f'vine.skin.{VINE_DEFAULT[w]}', layers=[dict(key=f'{w}.layer.{k}', parallax=PARALLAX[k], mode='stretch-cover' if k == 'sky' else 'tile-y', zone=None) for k in ('sky', 'far', 'side')],
                     trapSet=[], boss=None)
for part in ('traps', 'common', 'bosses', 'vines', 'ui'):
    for e in json.load(open(os.path.join(ROOT, 'art-src', 'reg', f'{part}.json'))):
        reg.append(e)
        if e.get('world') and '.trap.' in e['id']: worlds[e['world']]['trapSet'].append(dict(id=e['id'], mech=e.get('mech')))
        if e.get('world') and e.get('type') == 'anim' and '.boss.' in e['id']: worlds[e['world']]['boss'] = e['id']
VINE_COL = {'cel': '#3E8C3A', 'impasto': '#2F7D5B', 'frescochalk': '#7E9C6A', 'sumi': '#2A2A2A', 'dabs': '#5E8F6E', 'goldleaf': '#C9A23A', 'lacquer': '#B5301F'}
for w in WORLDS: worlds[w]['palette']['vine'] = VINE_COL[VINE_DEFAULT[w]]
json.dump(reg, open(os.path.join(OUT, 'registry.json'), 'w'), indent=1, ensure_ascii=False)
json.dump(worlds, open(os.path.join(OUT, 'worlds-art.json'), 'w'), indent=1, ensure_ascii=False)
print('registry entries', len(reg))
# zone preview: 5 graded thumbs per world with side+far over
rows = []
for w in WORLDS:
    sky = cv2.resize(rd(os.path.join(OUT, f'{w}/{w}.layer.sky.p.webp')), (216, 384), interpolation=cv2.INTER_AREA)
    far = rd(os.path.join(OUT, f'{w}/{w}.layer.far.p.webp'), alpha=True); side = rd(os.path.join(OUT, f'{w}/{w}.layer.side.p.webp'), alpha=True)
    def ov(b, L):
        L = cv2.resize(L, (216, int(L.shape[0] * 216 / L.shape[1])), interpolation=cv2.INTER_AREA); idx = np.arange(384) % L.shape[0]; L = L[idx]
        return b * (1 - L[..., 3:]) + L[..., :3] * L[..., 3:]
    base = ov(ov(sky, far), side)
    rows.append(np.concatenate([np.pad(grade(base, z), ((4, 4), (4, 4), (0, 0)), constant_values=0.15) for z in ZONES[w]], 1))
cv2.imwrite(os.path.join(REVIEW, 'zones.jpg'), to_u8(np.concatenate(rows, 0)), [cv2.IMWRITE_JPEG_QUALITY, 82])
