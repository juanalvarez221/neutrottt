"""Quick face-count dump for public partition."""
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from neutro_body_interaction.geometry import world_bbox
from neutro_body_interaction.public_region_partition import partition_public_regions

SOURCE = REPO / "assets/blender/neutro-body/neutro_body_v1_complete_source.blend"
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
human = bpy.data.objects["Human"]
rig = bpy.data.objects["Human.rig"]
for m in human.modifiers:
    m.show_viewport = True
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = human.evaluated_get(dg)
mesh = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
baked = bpy.data.objects.new("B", mesh)
bpy.context.collection.objects.link(baked)
baked.matrix_world = ev.matrix_world.copy()
bpy.context.view_layer.update()
mn, mx = world_bbox(baked)
baked.location += Vector((-(mn.x + mx.x) * 0.5, -(mn.y + mx.y) * 0.5, -mn.z))
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="DESELECT")
baked.select_set(True)
bpy.context.view_layer.objects.active = baked
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
r = partition_public_regions(baked, rig, Vector((0, 0, 0)))
c = Counter(r.face_region.values())
keys = [
    "right_biceps_surface",
    "right_triceps_surface",
    "right_forearm_inner_surface",
    "right_forearm_outer_surface",
    "left_shin_surface",
    "left_calf_surface",
    "right_pectoral_region",
    "left_pectoral_region",
    "upper_back_region",
    "lower_back_region",
    "right_ribs_region",
    "full_abdomen_region",
    "right_thigh_front_surface",
    "right_thigh_back_surface",
    "right_thigh_inner_surface",
    "right_thigh_outer_surface",
]
for k in keys:
    st = r.stats.get(k, {})
    print(f"{c.get(k, 0):5d} {k} w={st.get('widthX')} comps={st.get('connectedComponents')}")
