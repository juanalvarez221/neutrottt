import sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector
from generate_neutro_body_v1_public_regions_v2 import bake_source
from neutro_body_interaction.public_region_partition import (
    partition_public_regions,
    face_centroid,
    face_normal,
)

baked, rig, _ = bake_source()
result = partition_public_regions(baked, rig, Vector((0, 0, 0)))
mesh, mw = baked.data, baked.matrix_world
lm = result.landmarks
for rid in ("right_pectoral_region", "upper_back_region", "full_abdomen_region"):
    faces = [i for i, r in result.face_region.items() if r == rid]
    front = 0.0
    for fi in faces:
        front += face_normal(mesh, mw, mesh.polygons[fi]).dot(lm.body_front)
    front /= max(len(faces), 1)
    ys = [face_centroid(mesh, mw, mesh.polygons[fi]).y for fi in faces]
    print(rid, "n", len(faces), "meanFront", round(front, 3), "y", round(min(ys),3), round(max(ys),3))
