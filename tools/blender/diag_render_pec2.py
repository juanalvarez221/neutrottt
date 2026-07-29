import sys
from pathlib import Path
from collections import defaultdict

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
by = defaultdict(set)
for fi, rid in result.face_region.items():
    by[rid].add(fi)

objs = {}
for rid in (
    "right_pectoral_region",
    "left_pectoral_region",
    "full_abdomen_region",
    "upper_back_region",
    "right_ribs_region",
    "left_ribs_region",
):
    o = extract_region_mesh(baked, by[rid], f"public_{rid}")
    if o:
        objs[rid] = o

for obj in list(bpy.data.objects):
    if not obj.name.startswith("public_"):
        bpy.data.objects.remove(obj, do_unlink=True)

# ONLY pec visible, bright emission
for rid, obj in objs.items():
    active = "pectoral" in rid
    obj.hide_render = not active
    paint_region(obj, (1, 0.2, 0, 1), emissive=True)

pec = objs["right_pectoral_region"]
mn, mx = world_bbox(pec)
c = (mn + mx) * 0.5
print("pec bbox", mn, mx, "center", c)

light_data = bpy.data.lights.new("L", type="AREA")
light_data.energy = 400
light = bpy.data.objects.new("L", light_data)
bpy.context.collection.objects.link(light)
light.location = c + Vector((1.5, -2.0, 1.5))

cam_data = bpy.data.cameras.new("C")
cam = bpy.data.objects.new("C", cam_data)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam_data.lens = 50
cam.location = c + Vector((0, -0.7, 0.05))
cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 700
scene.render.resolution_y = 700
scene.render.filepath = str(REPO / "artifacts/body-public-region-atlas/debug-pec-only.png")
bpy.ops.render.render(write_still=True)
print("done", scene.render.filepath)
