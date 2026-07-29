"""Debug: why pec atlas frames lack gold pixels."""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector
from generate_neutro_body_v1_public_regions_v2 import (
    bake_source,
    extract_region_mesh,
    paint_region,
    world_bbox,
)
from neutro_body_interaction.public_region_partition import partition_public_regions

baked, rig, _ = bake_source()
result = partition_public_regions(baked, rig, Vector((0, 0, 0)))
by = {}
for fi, rid in result.face_region.items():
    by.setdefault(rid, set()).add(fi)

pec = extract_region_mesh(baked, by.get("right_pectoral_region", set()), "public_right_pectoral_region")
abd = extract_region_mesh(baked, by.get("full_abdomen_region", set()), "public_full_abdomen_region")
print("pec obj", pec, "faces", len(pec.data.polygons) if pec else None)
print("abd obj", abd, "faces", len(abd.data.polygons) if abd else None)

# Delete baked so only public meshes remain
for obj in list(bpy.data.objects):
    if not obj.name.startswith("public_"):
        bpy.data.objects.remove(obj, do_unlink=True)

gold = (0.95, 0.45, 0.08, 1.0)
skin = (0.42, 0.38, 0.34, 1.0)
for obj in bpy.data.objects:
    active = "pectoral" in obj.name
    paint_region(obj, gold if active else skin, emissive=False)
    print("paint", obj.name, "active", active, "mats", [m.name for m in obj.data.materials])

# Camera
mn, mx = world_bbox(pec)
c = (mn + mx) * 0.5
r = (mx - mn).length * 1.4
cam_data = bpy.data.cameras.new("DbgCam")
cam = bpy.data.objects.new("DbgCam", cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = c + Vector((0, -1, 0.05)) * r
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 800
scene.render.resolution_y = 800
out = REPO / "artifacts/body-public-region-atlas/debug-pec-right.png"
out.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(out)
bpy.ops.render.render(write_still=True)
print("wrote", out)
