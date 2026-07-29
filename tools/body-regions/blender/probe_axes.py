"""Probe body axes vs landmarks in authoring blend."""
import json
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
LM = json.loads((ROOT / "assets/body-regions/neutro_body_v1_landmarks.json").read_text(encoding="utf-8"))

obj = bpy.data.objects.get("NEUTRO_BODY_MASK_AUTHORING")
if not obj:
    obj = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))

bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
print("BBOX", min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
print("SIZE", max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))

# Sample a few vertices near breast apex expected
apex_rt = LM["points"]["breastApexRight"]
print("LANDMARK_RUNTIME_apexR", apex_rt)

# Find closest mesh vertex to various transforms of apex
candidates = {
    "yup": Vector(apex_rt),
    "zup": Vector((apex_rt[0], -apex_rt[2], apex_rt[1])),
    "zup2": Vector((apex_rt[0], apex_rt[2], apex_rt[1])),
    "negz": Vector((apex_rt[0], apex_rt[1], -apex_rt[2])),
}
for name, target in candidates.items():
    best = None
    bestd = 1e9
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        d = (p - target).length
        if d < bestd:
            bestd = d
            best = p
    print(f"CLOSEST_{name}", bestd, best)

# Count mask indices after load of authoring
import bpy
img = bpy.data.images.get("AnatomicalRegionsAuthoring")
if img:
    print("IMG", img.size[:])
