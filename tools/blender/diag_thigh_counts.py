"""Quick thigh quadrant diagnostic after partition."""
import sys
from pathlib import Path
from collections import Counter

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy
from mathutils import Vector
from generate_neutro_body_v1_public_regions_v2 import bake_source
from neutro_body_interaction.public_region_partition import partition_public_regions

baked, rig, offset = bake_source()
result = partition_public_regions(baked, rig, Vector((0, 0, 0)))
c = Counter(result.face_region.values())
for k in sorted(c):
    if "thigh" in k:
        print(f"{k}: {c[k]}")
print("disconnected", result.validation.get("disconnectedSelectable"))
print("pecs", c.get("right_pectoral_region"), c.get("left_pectoral_region"))
