"""Cut bubbles.png into clean, individual transparent bubble sprites.

The sheet has real alpha, but a noisy low-alpha cyan "splatter" between bubbles. Each bubble is a
solid round component at alpha >= 200; we find those, fit a circle (centre = component centroid,
radius from its area and box), and keep only pixels inside that circle, with a soft 1.5px edge. The
splatter outside the circle is removed; nothing inside the bubble is changed. No black, no boxes.

usage: python extract_bubbles.py <bubbles.png> <out_dir> <preview.png>
"""
import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

src, out_dir, preview = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)
im = np.array(Image.open(src).convert('RGBA')).astype(np.float32)
a = im[..., 3]
solid = ndimage.binary_opening(a >= 200, iterations=2)
solid = ndimage.binary_fill_holes(solid)
lab, n = ndimage.label(solid)
objs = ndimage.find_objects(lab)

MAX = 384          # largest sprite edge (px): crisp at the biggest foreground size on a 2x screen
MIN_DIAM = 30      # smaller satellites are mostly rim and noise at display size
sprites = []
for i, sl in enumerate(objs, start=1):
    ys, xs = sl
    h, w = ys.stop - ys.start, xs.stop - xs.start
    diam = (h + w) / 2
    if diam < MIN_DIAM or abs(h - w) > 0.12 * diam:
        continue
    cy, cx = ndimage.center_of_mass(lab == i)
    # Radius: the component's own extent, plus the thin bright rim that sits just under alpha 200.
    r = diam / 2 + 1.5
    pad = 3
    y0, y1 = int(np.floor(cy - r - pad)), int(np.ceil(cy + r + pad))
    x0, x1 = int(np.floor(cx - r - pad)), int(np.ceil(cx + r + pad))
    y0, x0 = max(0, y0), max(0, x0)
    y1, x1 = min(im.shape[0], y1), min(im.shape[1], x1)
    crop = im[y0:y1, x0:x1].copy()
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.sqrt((yy + 0.5 - cy - 0.5) ** 2 + (xx + 0.5 - cx - 0.5) ** 2)
    # Soft circular mask: 1 inside r-1.5, fading to 0 at r.
    mask = np.clip((r - d) / 1.5, 0, 1)
    crop[..., 3] = crop[..., 3] * mask
    # Fully transparent pixels get the bubble's edge colour, not black, so scaling never shows a dark fringe.
    rim = crop[..., 3] > 32
    if rim.any():
        mean = crop[rim][:, :3].mean(axis=0)
        clear = crop[..., 3] < 1
        crop[clear, :3] = mean
    sprite = Image.fromarray(np.clip(crop, 0, 255).astype(np.uint8))
    edge = max(sprite.size)
    if edge > MAX:
        k = MAX / edge
        sprite = sprite.resize((round(sprite.size[0] * k), round(sprite.size[1] * k)), Image.LANCZOS)
    sprites.append((diam, sprite))

sprites.sort(key=lambda s: -s[0])
manifest = []
for k, (diam, sp) in enumerate(sprites):
    kind = 'large' if diam >= 180 else 'medium' if diam >= 60 else 'small'
    name = f'bubble-{k:02d}.webp'
    sp.save(os.path.join(out_dir, name), 'WEBP', lossless=True, quality=100, method=6)
    manifest.append({'file': name, 'kind': kind, 'source_diameter': round(diam)})
json.dump(manifest, open(os.path.join(out_dir, 'manifest.json'), 'w'), indent=1)

# A check sheet: every sprite on black and on the seascape cyan, to spot halos or boxes.
cols = 6
cell = 160
rows = (len(sprites) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell * 2, rows * cell), (0, 0, 0))
for k, (_, sp) in enumerate(sprites):
    r_, c_ = divmod(k, cols)
    t = sp.copy()
    t.thumbnail((cell - 10, cell - 10), Image.LANCZOS)
    for bg_i, bg in enumerate([(0, 0, 0), (25, 160, 220)]):
        tile = Image.new('RGBA', (cell, cell), bg + (255,))
        tile.alpha_composite(t, ((cell - t.size[0]) // 2, (cell - t.size[1]) // 2))
        sheet.paste(tile.convert('RGB'), (c_ * cell * 2 + bg_i * cell, r_ * cell))
sheet.save(preview)
print(len(sprites), 'sprites:', ', '.join(f"{m['file']} {m['kind']} d{m['source_diameter']}" for m in manifest))
