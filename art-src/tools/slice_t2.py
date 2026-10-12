"""V2-INT: slice the trap2-<world>.png sheets into components (sorted by row, then x). python3 slice_t2.py <world>"""
import sys, os, numpy as np, cv2
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
w = sys.argv[1]
im = np.array(Image.open(os.path.join(ROOT, 'art-src', 'raw', f'trap2-{w}.png')).convert('RGBA'))
a = im[..., 3]
if (a > 250).mean() > 0.9:  # not keyed: key chroma green
    c = im[..., :3].astype(np.int32); g = c[..., 1] - np.maximum(c[..., 0], c[..., 2]); a = np.where(g > 60, 0, 255).astype(np.uint8); im[..., 3] = a
m = cv2.dilate((a > 20).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
boxes = [tuple(st[i][:4]) for i in range(1, n) if st[i][4] > 1500]
H = im.shape[0]
boxes.sort(key=lambda b: (round((b[1] + b[3] / 2) / (H / 3)), b[0]))
out = os.path.join(ROOT, 'art-src', 'tmp', 'slices', f'trap2-{w}'); os.makedirs(out, exist_ok=True)
for i, (x, y, bw, bh) in enumerate(boxes):
    sub = im[y:y + bh, x:x + bw].copy()
    sub[..., 3] = np.where(lab[y:y + bh, x:x + bw] == 0, 0, sub[..., 3]) * 0 + sub[..., 3]
    Image.fromarray(sub).save(os.path.join(out, f'{i:02d}.png'))
    print(i, x, y, bw, bh)
