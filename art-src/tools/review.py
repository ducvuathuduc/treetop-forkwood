"""Contact sheets per category + in-situ readability frames + review gallery (work/v2/art-review/index.html)."""
import os, sys, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from artlib import *
from PIL import Image, ImageDraw
REVIEW = os.path.abspath(os.path.join(ROOT, '..', 'art-review')); os.makedirs(os.path.join(REVIEW, 'sheets'), exist_ok=True)
reg = {e['id']: e for e in json.load(open(os.path.join(OUT, 'registry.json')))}
WA = json.load(open(os.path.join(OUT, 'worlds-art.json')))
atl = {}
def frame(id_, i=0):
    e = reg[id_]; p = os.path.join(OUT, e['file'])
    if p not in atl: atl[p] = Image.open(p).convert('RGBA')
    x, y, w, h = e['rects'][i] if e.get('rects') else (0, 0, e['w'], e['h'])
    return atl[p].crop((x, y, x + w, y + h))
def sheet(ids, out, bg=(118, 118, 118), cell=150, cols=8, title=''):
    rows = (len(ids) + cols - 1) // cols
    S = Image.new('RGB', (cols * cell, rows * (cell + 16) + 24), bg); d = ImageDraw.Draw(S); d.text((6, 6), title, fill=(255, 255, 255))
    for k, (id_, i) in enumerate(ids):
        im = frame(id_, i); im.thumbnail((cell - 10, cell - 10), Image.LANCZOS)
        x = (k % cols) * cell; y = 24 + (k // cols) * (cell + 16)
        S.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im); d.text((x + 4, y + cell), id_.split('.', 1)[1][:24] + (f'#{i}' if i else ''), fill=(255, 255, 255))
    S.save(os.path.join(REVIEW, 'sheets', out), quality=86)
cats = {
 'traps.jpg': [(i, f) for i, e in reg.items() if '.trap.' in i or i.endswith('fx.embers') for f in range(e['frames'])],
 'pickups.jpg': [(i, 0) for i in reg if i.startswith('icon.pickup') or i == 'fx.dewdrop'],
 'vehicles.jpg': [(i, 0) for i in reg if i.startswith('vehicle.')],
 'currency-drops-boosts.jpg': [(i, f) for i, e in reg.items() if i.startswith(('icon.cur', 'icon.boost', 'icon.drop')) for f in range(e['frames'])],
 'skills.jpg': [(i, 0) for i in reg if i.startswith('icon.skill')],
 'rings-knots.jpg': [(i, f) for i, e in reg.items() if i.startswith(('icon.ring', 'icon.knot', 'ui.ring')) for f in range(e['frames'])],
 'bosses.jpg': [(i, f) for i, e in reg.items() if '.boss.' in i for f in range(e['frames'])],
 'vines.jpg': [(i, 0) for i in reg if i.startswith('vine.skin')],
 'ui.jpg': [(i, 0) for i in reg if i.startswith('ui.') and not i.startswith('ui.ring')],
}
for out, ids in cats.items():
    big = out in ('bosses.jpg',)
    sheet(ids, out, cell=260 if big else 150, cols=6 if big else 8, title=out[:-4])
    sheet(ids, out.replace('.jpg', '-dark.jpg'), bg=(22, 24, 30), cell=260 if big else 150, cols=6 if big else 8, title=out[:-4] + ' on dark')
# in-situ readability frame per world at 1x phone size (540x960 = 1080x1920 /2)
def stem_vertical(skin, H):
    s = frame(f'vine.skin.{skin}.stem').rotate(90, expand=True); s = s.resize((s.width // 2, s.height // 2), Image.LANCZOS)
    col = Image.new('RGBA', (s.width, H)); y = 0
    while y < H: col.alpha_composite(s, (0, y)); y += s.height
    return col
for w, info in WA.items():
    bd = Image.open(os.path.join(REVIEW, f'bd-{w}-p.jpg')).convert('RGBA').resize((540, 960), Image.LANCZOS)
    skin = info['vineSkinDefault'].split('.')[-1]
    v = stem_vertical(skin, 960); bd.alpha_composite(v, (270 - v.width // 2, 0))
    for k, y in ((1, 300), (2, 520)):
        lf = frame(f'vine.skin.{skin}.leaf'); lf = lf.resize((lf.width // 2, lf.height // 2)); bd.alpha_composite(lf, (270 + 6, y))
    traps = [t['id'] for t in info['trapSet']]
    def put(id_, i, x, y):
        im = frame(id_, i); im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS); bd.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))
    put(traps[0], 0, 180, 200); put(traps[0], reg[traps[0]]['warnFrames'][0], 380, 380); put(traps[2], 0, 300, 700)
    for k in range(5): put('icon.pickup.sunlight', 0, 230 + k * 22, 560 - k * 18)
    put('icon.pickup.prism', 0, 330, 820)
    bd.convert('RGB').save(os.path.join(REVIEW, 'sheets', f'insitu-{w}.jpg'), quality=86)
    g = cv2.cvtColor(np.array(bd.convert('RGB')), cv2.COLOR_RGB2GRAY); cv2.imwrite(os.path.join(REVIEW, 'sheets', f'insitu-{w}-gray.jpg'), g)
# QA table
qa = []
for part in ('traps', 'common', 'bosses', 'vines', 'ui'): qa += json.load(open(os.path.join(ROOT, 'art-src', 'reg', f'qa-{part}.json')))
def badge(r):
    fails = []
    if r.get('A1_halo', 0) > 0.05: fails.append('A1')
    if r.get('A2_spill', 0) > 0.005: fails.append('A2')
    if r.get('A3_islands', 0) > 0: fails.append('A3')
    if 'A6_pad' in r and r['A6_pad'] < 2: fails.append('A6')
    if 'A7_sharp1x' in r and r['A7_sharp1x'] < 0.004: fails.append('A7')
    return fails
rows = ''.join(f"<tr class='{'bad' if badge(r) else ''}'><td>{r['id']}</td>" + ''.join(f"<td>{r.get(k, '')}</td>" for k in ('A1_halo', 'A2_spill', 'A3_islands', 'A4_inkring', 'A6_pad', 'A7_sharp1x', 'A8_drift1x', 'A9_bytesRGBA', 'file_bytes', 'dims')) + f"<td>{' '.join(badge(r)) or 'pass'}</td></tr>" for r in qa)
nfail = sum(1 for r in qa if badge(r)); json.dump(dict(items=len(qa), failing=[r['id'] for r in qa if badge(r)]), open(os.path.join(REVIEW, 'qa-summary.json'), 'w'), indent=1)
sizes = {}
for w in WA:
    s = {e['id']: e for e in reg.values() if e.get('world') == w}
    p = s[f'{w}.layer.sky.p']['bytesAvif'] + s[f'{w}.layer.far.p']['bytes'] + s[f'{w}.layer.side.p']['bytes']
    pw = s[f'{w}.layer.sky.p']['bytes'] + s[f'{w}.layer.far.p']['bytes'] + s[f'{w}.layer.side.p']['bytes']
    tr = os.path.getsize(os.path.join(OUT, w, f'{w}.traps.webp')); bo = os.path.getsize(os.path.join(OUT, w, f'{w}.boss.webp'))
    sizes[w] = (p, pw, tr, bo)
srow = ''.join(f"<tr><td>{w}</td><td>{a//1000} KB</td><td>{b//1000} KB</td><td>{c//1000} KB</td><td>{d//1000} KB</td></tr>" for w, (a, b, c, d) in sizes.items())
W = list(WA)
html = f"""<!doctype html><meta charset=utf-8><title>Forkwood 2.0 art review</title>
<style>body{{background:#1b1a19;color:#eee;font:14px system-ui;margin:24px}} img{{max-width:100%;border-radius:4px}} .g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}} h2{{margin-top:40px;border-bottom:1px solid #444}} table{{border-collapse:collapse;font-size:12px}} td,th{{border:1px solid #333;padding:3px 6px}} tr.bad{{background:#4a2020}} .w{{display:grid;grid-template-columns:1fr 2fr;gap:12px;align-items:start}}</style>
<h1>Forkwood 2.0 "Living Masterpieces": art review</h1>
<p>Built by the ART stream on branch v2-art. Every image here is generated by the reproducible pipeline in <code>wt-art/art-src/tools/</code>; registry: <code>wt-art/assets/v2/registry.json</code>; per-world art data: <code>worlds-art.json</code>. QA: {len(qa)} items, {nfail} flagged (see table).</p>
<h2>Budgets (portrait default variant)</h2><table><tr><th>world</th><th>backdrop (AVIF sky + WebP far/side)</th><th>backdrop all-WebP</th><th>trap atlas</th><th>boss atlas</th></tr>{srow}</table>
<h2>Backdrops: portrait 1080×1920 (sky+far+side composited) | desktop 2560×1440</h2>
{''.join(f"<h3>{w}</h3><div class=w><img src='bd-{w}-p.jpg'><img src='bd-{w}-d.jpg'></div>" for w in W)}
<h2>Five height zones per world (graded once per zone; low → high)</h2><img src='zones.jpg'>
<h2>In-situ readability at 1x phone (vine skin + traps + warn glow + pickups) and grayscale squint test</h2>
<div class=g>{''.join(f"<div><img src='sheets/insitu-{w}.jpg'><img src='sheets/insitu-{w}-gray.jpg'><p>{w}</p></div>" for w in W)}</div>
<h2>Contact sheets (mid-grey | dark)</h2>
{''.join(f"<h3>{c[:-4]}</h3><img src='sheets/{c}'><img src='sheets/{c.replace('.jpg','-dark.jpg')}'>" for c in cats)}
<h2>Automated QA (PIPELINE.md A1–A9)</h2><p>A1 halo = share of soft-edge pixels brighter than any opaque pixel within 2 px (light fringe), fail &gt;5%. A2 chroma spill share, fail &gt;0.5%. A3 islands &lt;6 px. A4 share of 1x silhouette ring that is dark ink (info). A6 transparent padding px (≥2). A7 Laplacian variance at 1x (fail &lt;0.004 = mush). A8 centroid drift between anim frames at 1x (flaps drift by design). A9 decoded RGBA bytes per atlas.</p>
<table><tr><th>id</th><th>A1</th><th>A2</th><th>A3</th><th>A4</th><th>A6</th><th>A7</th><th>A8</th><th>A9 RGBA</th><th>file</th><th>dims</th><th>result</th></tr>{rows}</table>"""
open(os.path.join(REVIEW, 'index.html'), 'w').write(html)
print('qa items', len(qa), 'flagged', nfail, [r['id'] for r in qa if badge(r)][:20]); print(sizes)
