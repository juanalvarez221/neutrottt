"""Debug classify at landmark positions + sample mesh near breast."""
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

lm = json.loads((ROOT / "assets/body-regions/neutro_body_v1_landmarks.json").read_text(encoding="utf-8"))
obj = mod.find_body()
_to_b, to_rt, mode = mod.detect_runtime_to_blender(obj)
print("mode", mode)

for name, p in lm["points"].items():
    if any(k in name.lower() for k in ("breast", "infra", "clav", "sternum", "waist", "scap", "axillar")):
        # p is runtime
        rid = mod.classify_torso(tuple(p), lm, lm["levels"], lm["axisZSamples"])
        print(f"LM {name:30s} {p} -> {rid}")

# Sample mesh vertices near breast apex runtime
apex = Vector((-0.072, 1.268, 0.031))  # runtime
# convert to blender for distance
ab = _to_b(apex)
hits = []
for v in obj.data.vertices:
    pw = obj.matrix_world @ v.co
    d = (pw - ab).length
    if d < 0.05:
        pr = to_rt(pw)
        rid = mod.classify_torso(pr, lm, lm["levels"], lm["axisZSamples"])
        hits.append((d, pr, rid))
hits.sort()
print("NEAR_APEX", len(hits))
for h in hits[:12]:
    print(" ", h)
