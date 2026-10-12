"""Slice a generated sprite sheet into components. python3 slicer.py sheet.png -> tmp/slices/<stem>/NN.png + index sheet"""
import sys, os, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from artlib import *
from PIL import Image, ImageDraw

def key_alpha(rgba):
    """If the generator left the chroma background, key it ourselves (distance from corner colour)."""
    a = rgba[..., 3]
    if (a > 0.9).mean() < 0.85: return rgba
    c = rgba[..., :3]; h, w = c.shape[:2]
    corners = np.concatenate([c[:8, :8].reshape(-1, 3), c[:8, -8:].reshape(-1, 3), c[-8:, :8].reshape(-1, 3), c[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, 0)
    d = np.sqrt(((c - bg) ** 2).sum(-1))
    # greenness: key strongest where g dominates
    g = c[..., 1] - np.maximum(c[..., 0], c[..., 2])
    bgg = bg[1] - max(bg[0], bg[2])
    al = np.clip((d - 0.10) / 0.16, 0, 1)
    al = np.maximum(al, np.clip((bgg - g) / max(bgg, 1e-3) * 1.4 - 0.2, 0, 1) * (d > 0.06))
    out = rgba.copy(); out[..., 3] = cv2.GaussianBlur(al.astype(np.float32), (0, 0), 0.6)
    return out

def components(rgba, merge=14, min_area=900):
    a = (rgba[..., 3] > 0.08).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (merge, merge))
    m = cv2.dilate(a, k)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    boxes = []
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if (a[y:y+h, x:x+w] * (lab[y:y+h, x:x+w] == i)).sum() < min_area: continue
        boxes.append((x, y, w, h, i))
    # reading order: rows by centre y (band 18% of height), then x
    H = rgba.shape[0]
    boxes.sort(key=lambda b: (int((b[1] + b[3] / 2) / (H * 0.16)), b[0]))
    return boxes, lab

def slice_sheet(path, outdir, merge=14, min_area=900, pad=6):
    im = key_alpha(rd(path, alpha=True)); im = tidy(im, 30)
    boxes, lab = components(im, merge, min_area)
    os.makedirs(outdir, exist_ok=True); crops = []
    for j, (x, y, w, h, i) in enumerate(boxes):
        c = im[y:y+h, x:x+w].copy(); c[..., 3] *= (lab[y:y+h, x:x+w] == i)
        c = np.pad(c, ((pad, pad), (pad, pad), (0, 0)))
        cv2.imwrite(os.path.join(outdir, f'{j:02d}.png'), to_u8(c)); crops.append(c)
    # index sheet
    th = 180; tiles = []
    for j, c in enumerate(crops):
        p = pil(c); p.thumbnail((th, th)); t = Image.new('RGB', (th, th + 18), (120, 120, 120)); t.paste(p, ((th - p.width)//2, (th - p.height)//2), p)
        ImageDraw.Draw(t).text((4, th + 2), f'{j:02d} {c.shape[1]}x{c.shape[0]}', fill=(255, 255, 255)); tiles.append(t)
    cols = 8; rows = (len(tiles) + cols - 1) // cols
    S = Image.new('RGB', (cols * (th + 4), max(1, rows) * (th + 22)), (40, 40, 40))
    for j, t in enumerate(tiles): S.paste(t, ((j % cols) * (th + 4), (j // cols) * (th + 22)))
    S.save(os.path.join(outdir, '_index.jpg'), quality=85)
    return len(crops)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        stem = os.path.splitext(os.path.basename(p))[0]
        print(stem, slice_sheet(p, os.path.join(ROOT, 'art-src', 'tmp', 'slices', stem)))
