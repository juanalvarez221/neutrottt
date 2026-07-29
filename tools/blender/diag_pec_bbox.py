import sys
from pathlib import Path
from collections import defaultdict

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector
from generate_neutro_body_v1_public_regions_v2 import bake_source
from neutro_body_interaction.public_region_partition import partition_public_regions, face_centroid

baked, rig, offset = bake_source()
result = partition_public_regions(baked, rig, Vector((0, 0, 0)))
mesh, mw = baked.data, baked.matrix_world
lm = result.landmarks
print("chest_width", lm.chest_width, "shoulder", lm.shoulder_width, "sternum_x", lm.sternum_x)
print("clav", lm.clavicle_l.z, lm.clavicle_r.z, "axillary_z", lm.axillary_z)
for side in ("right_pectoral_region", "left_pectoral_region"):
    faces = [i for i, r in result.face_region.items() if r == side]
    xs, ys, zs = [], [], []
    for fi in faces:
        c = face_centroid(mesh, mw, mesh.polygons[fi])
        xs.append(c.x); ys.append(c.y); zs.append(c.z)
    print(side, "n", len(faces), "x", min(xs), max(xs), "dx", max(xs)-min(xs),
          "z", min(zs), max(zs), "dz", max(zs)-min(zs), "y", min(ys), max(ys))
# Anterior torso face span at breast height
z0 = (lm.clavicle_l.z + lm.chest_lower.z) * 0.5
xs = []
for poly in mesh.polygons:
    c = face_centroid(mesh, mw, poly)
    if abs(c.z - z0) < 0.05 and c.y < 0.05:
        xs.append(c.x)
print("anterior torso x span at midchest", min(xs), max(xs), "width", max(xs)-min(xs))
