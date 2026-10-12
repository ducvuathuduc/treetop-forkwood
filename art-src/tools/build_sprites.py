"""Build sprite atlases + registry entries + QA from sliced generated sheets.
python3 build_sprites.py traps|common|bosses|vines|ui|all"""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from artlib import *
import sprites as S

SL = os.path.join(ROOT, 'art-src', 'tmp', 'slices')
WARN = np.array([42, 90, 255], np.float32) / 255  # BGR of #FF5A2A danger red-orange
PAD = 10

def fill_holes(rgba):
    a = (rgba[..., 3] > 0.5).astype(np.uint8)
    ff = a.copy(); h, w = a.shape; m = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, m, (0, 0), 2)
    holes = (ff == 0).astype(np.uint8)
    if holes.sum() == 0: return rgba
    out = rgba.copy()
    u = to_u8(rgba[..., :3]); inp = cv2.inpaint(u, cv2.dilate(holes, np.ones((3, 3), np.uint8)), 5, cv2.INPAINT_TELEA)
    out[..., :3] = np.where(holes[..., None] > 0, inp.astype(np.float32) / 255, rgba[..., :3])
    out[..., 3] = np.maximum(rgba[..., 3], cv2.GaussianBlur(holes.astype(np.float32), (0, 0), 0.7))
    return out

def load(ref, ex):
    im = rd(os.path.join(SL, ref + '.png'), alpha=True)
    if ex.get('fill') or ref in S.FILL: im = fill_holes(im)
    if ex.get('glow'):
        soft = im[..., 3] < 0.97; mx = np.maximum(im[..., 0], im[..., 2])
        im[..., 1] = np.where(soft, np.minimum(im[..., 1], im[..., 2] * 0.78), im[..., 1])  # BGR: in soft glow keep g <= 0.78 r (warm, never olive)
    return im

def trim(im):
    ys, xs = np.where(im[..., 3] > 0.02)
    if not len(xs): return im
    return im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

def frames_for(srcs, maxpx, ex):
    fr = [trim(load(s, ex)) for s in srcs]
    big = max(max(f.shape[:2]) for f in fr)
    sc = min(1.0, maxpx / big)
    out = []
    for f in fr:
        f = cv2.resize(f, (max(1, round(f.shape[1] * sc)), max(1, round(f.shape[0] * sc))), interpolation=cv2.INTER_AREA) if sc < 1 else f
        out.append(f)
    W = max(f.shape[1] for f in out) + 2 * PAD; H = max(f.shape[0] for f in out) + 2 * PAD
    res = []
    for f in out:  # centre-align (bbox centre); flaps keep body roughly fixed
        c = np.zeros((H, W, 4), np.float32); y = (H - f.shape[0]) // 2; x = (W - f.shape[1]) // 2
        c[y:y + f.shape[0], x:x + f.shape[1]] = f; res.append(c)
    return res, sc

def warn_variant(f):
    a = f[..., 3]; k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    g = cv2.GaussianBlur(cv2.dilate(a, k), (0, 0), 2.2) * 0.9
    base = np.zeros_like(f); base[..., :3] = WARN; base[..., 3] = g
    sa = f[..., 3:4]; da = base[..., 3:4]; oa = sa + da * (1 - sa)
    out = np.zeros_like(f); out[..., :3] = (f[..., :3] * sa + base[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6); out[..., 3:4] = oa
    return out

# ---------------------------------------------------------------- QA
def qa(f, maxpx):
    a = f[..., 3]; r = {}
    edge = (a > 0.02) & (a < 0.98)
    opaque = (a >= 0.98).astype(np.uint8)
    lum0 = cv2.cvtColor(np.ascontiguousarray(f[..., :3]), cv2.COLOR_BGR2GRAY)
    lo = np.where(opaque > 0, lum0, 0).astype(np.float32); nmax = cv2.dilate(lo, np.ones((5, 5), np.uint8))
    if edge.sum():
        r['A1_halo'] = round(float(((lum0 - nmax) > 0.15)[edge & (nmax > 0)].mean()), 4)  # light fringe brighter than any nearby opaque pixel
        bgr = (f[..., :3] * 255)[edge]
        r['A2_spill'] = round(float(((bgr[:, 1] > bgr[:, 2] + 40) & (bgr[:, 1] > bgr[:, 0] + 40)).mean()), 4)
    else: r['A1_halo'] = r['A2_spill'] = 0.0
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.03).astype(np.uint8), 8)
    r['A3_islands'] = int(sum(1 for i in range(1, n) if st[i, cv2.CC_STAT_AREA] < 6))
    ys, xs = np.where(a > 0.02)
    r['A6_pad'] = int(min(ys.min(), xs.min(), f.shape[0] - 1 - ys.max(), f.shape[1] - 1 - xs.max())) if len(xs) else 0
    one = cv2.resize(f, (max(1, f.shape[1] // 2), max(1, f.shape[0] // 2)), interpolation=cv2.INTER_AREA)
    lum = cv2.cvtColor(np.ascontiguousarray(one[..., :3] * one[..., 3:4]), cv2.COLOR_BGR2GRAY)
    r['A7_sharp1x'] = round(float(cv2.Laplacian(lum, cv2.CV_32F).var()), 4)
    sil = (one[..., 3] > 0.5).astype(np.uint8); ring = sil - cv2.erode(sil, np.ones((3, 3), np.uint8))
    l1 = cv2.cvtColor(np.ascontiguousarray(one[..., :3]), cv2.COLOR_BGR2GRAY)
    r['A4_inkring'] = round(float((l1[ring > 0] < 0.33).mean()), 3) if ring.sum() else 0
    return r

def centroid(f):
    a = f[..., 3]; s = a.sum(); ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    return ((xs * a).sum() / s, (ys * a).sum() / s)

# ---------------------------------------------------------------- atlas
def pack(items, maxw=2048):
    """items: list of (key, img). Shelf pack; returns (atlas, rects dict)."""
    items = sorted(items, key=lambda t: -t[1].shape[0])
    for W in (256, 512, 1024, 2048):
        if max(i[1].shape[1] for i in items) > W: continue
        x = y = sh = 0; rects = {}; ok = True
        for k, im in items:
            h, w = im.shape[:2]
            if x + w > W: x = 0; y += sh; sh = 0
            rects[k] = (x, y, w, h); x += w; sh = max(sh, h)
        H = y + sh
        if H <= 2048 and (H <= W * 2 or W == 2048): break
    H = (H + 3) // 4 * 4
    at = np.zeros((H, W, 4), np.float32)
    for k, im in items:
        x, y, w, h = rects[k]; at[y:y + h, x:x + w] = im
    return at, rects

REG = []; QA = []
def emit(atlas_id, world, groups, sub):
    """groups: list of dict(id, frames[list img], type, fps, anchor, notes, mech, extra)"""
    items = []
    for g in groups:
        for i, f in enumerate(g['frames']): items.append((f"{g['id']}#{i}", f))
    at, rects = pack(items)
    d = os.path.join(OUT, sub); os.makedirs(d, exist_ok=True)
    fn = f'{atlas_id}.webp'; p = os.path.join(d, fn)
    pil(bleed(at, 4)).save(p, 'WEBP', quality=84, alpha_quality=95, method=6)
    size = os.path.getsize(p)
    for g in g_iter(groups):
        rs = [list(rects[f"{g['id']}#{i}"]) for i in range(len(g['frames']))]
        e = dict(id=g['id'], file=f'{sub}/{fn}', type=g.get('type', 'sprite'), world=world, frames=len(rs), fps=g.get('fps', 0),
                 w=rs[0][2], h=rs[0][3], anchor=g.get('anchor', [0.5, 0.5]), atlas=atlas_id, rects=rs, scale='@2x (draw at w/2 x h/2 CSS px)')
        for k in ('mech', 'notes', 'anim', 'warnFrames', 'slice9', 'tile'):
            if g.get(k) is not None: e[k] = g[k]
        REG.append(e)
        nq = g['warnFrames'][0] if g.get('warnFrames') else len(g['frames'])
        q = [qa(f, 0) for f in g['frames'][:nq]]
        worst = {k: max(x[k] for x in q) if k not in ('A6_pad', 'A7_sharp1x', 'A4_inkring') else min(x[k] for x in q) for k in q[0]}
        if len(g['frames']) > 1 and g.get('fps'):
            cs = [centroid(cv2.resize(f, (f.shape[1] // 2, f.shape[0] // 2))) for f in g['frames'][:nq]]
            worst['A8_drift1x'] = round(max(np.hypot(c[0] - cs[0][0], c[1] - cs[0][1]) for c in cs), 2)
        QA.append(dict(id=g['id'], atlas=atlas_id, **worst))
    QA.append(dict(id=f'ATLAS {atlas_id}', atlas=atlas_id, A9_bytesRGBA=at.shape[0] * at.shape[1] * 4, file_bytes=size, dims=f'{at.shape[1]}x{at.shape[0]}'))
    print(atlas_id, at.shape[1], at.shape[0], size, flush=True)

def g_iter(groups): return groups

def build_traps():
    for w, lst in S.TRAPS.items():
        groups = []
        for id_, srcs, mx, ex in lst:
            fr, sc = frames_for(srcs, mx, ex)
            warn = [warn_variant(fr[0])]
            groups.append(dict(id=id_, frames=fr + warn, fps=ex.get('fps', 0), anchor=ex.get('anchor', [0.5, 0.5]), mech=ex.get('mech'),
                               anim=(ex.get('anim') or 'still') + f'; frames 0..{len(fr)-1} normal, frame {len(fr)} = frame 0 with baked red-orange (#FF5A2A) warn glow (cross-fade it in over the telegraph)',
                               warnFrames=[len(fr)], notes=ex.get('note')))
        emit(f'{w}.traps', w, groups, w)

def build_common():
    for cat, lst in S.COMMON.items():
        groups = []
        for id_, srcs, mx, ex in lst:
            fr, sc = frames_for(srcs, mx, ex)
            groups.append(dict(id=id_, frames=fr, type='icon' if id_.startswith('icon') else ('ui' if id_.startswith('ui') else 'sprite'),
                               fps=ex.get('fps', 0), mech=ex.get('mech'), anim=ex.get('anim'), notes=ex.get('note')))
        emit(f'common.{cat}', None, groups, 'common')

def build_bosses():
    for w, (id_, srcs, title) in S.BOSSES.items():
        fr, sc = frames_for(srcs, 512, {})
        groups = [dict(id=id_, frames=fr, type='anim', fps=0, anim='frame0 = idle/hover, frame1 = attack wind-up (anticipation pose)',
                       notes=f'{title}. Cut-out motion in code: idle bob 6px @0.5Hz ease-in-out sine + 2% breathe; wind-up = lerp to frame1 over 0.25s with 4% squash, hold through the 1.2s telegraph, release with 8% stretch; hurt = 3-frame white flash (code tint), defeat = drop + fade.')]
        for fid, fsrc, fm in S.BOSS_FX:
            if fid.startswith(w + '.'):
                f2, _ = frames_for(fsrc, fm, {}); groups.append(dict(id=fid, frames=f2, type='fx'))
        emit(f'{w}.boss', w, groups, w)

def stem_strip(ref):
    im = trim(load(ref, {}))
    h = im.shape[0]; im = im[:, int(im.shape[1] * 0.04):int(im.shape[1] * 0.96)]
    sc = 48 / h; im = cv2.resize(im, (round(im.shape[1] * sc), 48), interpolation=cv2.INTER_AREA)
    im = seam_x(im, 64)
    return im[:, :512] if im.shape[1] >= 512 else im

def build_vines():
    groups = []
    for sid, sheet, s, l, fl, wdef in S.VINES:
        st = stem_strip(f'{sheet}/{s:02d}')
        lf, _ = frames_for([l if isinstance(l, str) else f'{sheet}/{l:02d}'], 96, {}); fw, _ = frames_for([f'{sheet}/{fl:02d}'], 96, {})
        note = f'default skin of {wdef}' if wdef else 'shop skin'
        groups += [dict(id=f'vine.skin.{sid}.stem', frames=[np.pad(st, ((PAD, PAD), (0, 0), (0, 0)))], type='sprite', tile='x', notes=f'{note}; tileable stem strip along x, stretch/warp along the vine path; 48px core thickness @2x'),
                   dict(id=f'vine.skin.{sid}.leaf', frames=lf, notes='anchor = leaf base (rotate around it)', anchor=[0.1, 0.9]),
                   dict(id=f'vine.skin.{sid}.flower', frames=fw, notes='bud/flower at forks and merges')]
    emit('common.vines', None, groups, 'common')

def slice9(im, kind):
    a = im[..., 3]; h, w = a.shape
    if kind == 'frame':
        row = a[h // 2]; col = a[:, w // 2]
        l = int(np.argmax(row < 0.5)); r = int(w - np.argmax(row[::-1] < 0.5)); t = int(np.argmax(col < 0.5)); b = int(h - np.argmax(col[::-1] < 0.5))
        return [t + 2, w - r + 2, h - b + 2, l + 2]
    s = int(min(h, w) * 0.42); return [s, s, s, s]

def build_ui():
    for id_, ref in S.UI:
        im = trim(load(ref, {})); im = np.pad(im, ((4, 4), (4, 4), (0, 0)))
        d = os.path.join(OUT, 'common', 'ui'); os.makedirs(d, exist_ok=True)
        fn = f'{id_}.webp'; pil(bleed(im, 4)).save(os.path.join(d, fn), 'WEBP', quality=92, alpha_quality=100, method=6)
        kind = 'frame' if '.frame.' in id_ else 'kit'
        REG.append(dict(id=id_, file=f'common/ui/{fn}', type='ui', world=(id_.split('.')[2] if kind == 'frame' and id_.split('.')[2] != 'default' else None), frames=1, fps=0,
                        w=im.shape[1], h=im.shape[0], anchor=[0.5, 0.5], atlas=None, slice9=slice9(im, kind),
                        notes='9-slice insets [top,right,bottom,left] px; CSS border-image ready' + ('; centre opening transparent' if kind == 'frame' else '')))
        QA.append(dict(id=id_, atlas=None, **qa(im, 0)))
    print('ui', len(S.UI))

if __name__ == '__main__':
    what = sys.argv[1]
    {'traps': build_traps, 'common': build_common, 'bosses': build_bosses, 'vines': build_vines, 'ui': build_ui}[what]()
    os.makedirs(os.path.join(ROOT, 'art-src', 'reg'), exist_ok=True)
    json.dump(REG, open(os.path.join(ROOT, 'art-src', 'reg', f'{what}.json'), 'w'), indent=0)
    json.dump(QA, open(os.path.join(ROOT, 'art-src', 'reg', f'qa-{what}.json'), 'w'), indent=0)
