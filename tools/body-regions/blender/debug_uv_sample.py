"""Check mask value at breast UVs vs clavicle UVs."""
import json
from pathlib import Path
import bpy
from mathutils import Vector
import importlib.util

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "curate", ROOT / "tools/body-regions/blender/curate_torso_mask.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

obj = mod.find_body()
_to_b, to_rt, mode = mod.detect_runtime_to_blender(obj)
img = mod.load_image()
w, h = img.size
px = list(img.pixels)
mesh = obj.data
uvl = mesh.uv_layers.active.data
mw = obj.matrix_world

apex_b = _to_b([-0.072, 1.268, 0.031])
clav_b = _to_b([-0.1, 1.371, -0.02])

def nearest_loop_uv(target):
    best = None
    bestd = 1e9
    best_uv = None
    for poly in mesh.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            p = mw @ mesh.vertices[vi].co
            d = (p - target).length
            if d < bestd:
                bestd = d
                best = to_rt(p)
                best_uv = uvl[li].uv.copy()
    return bestd, best, best_uv

def sample_img(uv, flip):
    x = int(round(uv.x * (w - 1)))
    y = int(round(((1.0 - uv.y) if flip else uv.y) * (h - 1)))
    x = max(0, min(w - 1, x)); y = max(0, min(h - 1, y))
    o = (y * w + x) * 4
    return (round(px[o]*255), round(px[o+1]*255), round(px[o+2]*255)), (x, y)

for label, tgt in (("apex", apex_b), ("clav", clav_b)):
    d, pr, uv = nearest_loop_uv(tgt)
    print(label, "dist", d, "pos", pr, "uv", tuple(uv))
    print("  noflip", sample_img(uv, False))
    print("  flip  ", sample_img(uv, True))
