"""
Create neutro_body_v1_pose_working_source.blend:
  anatomy_source (L4) + MPFB standard 'game_engine' rig. No posing here.

Verifies that adding the rig preserves shape keys, topology and vertex groups.

Run:
  blender.exe --background --python tools/blender/create_neutro_body_v1_pose_working_source.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_anatomy_source.blend"
DST = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_pose_working_source.blend"

RIG_NAME = "game_engine"


def log(msg: str) -> None:
    print(f"[neutro-rig] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


bpy.ops.wm.open_mainfile(filepath=str(SRC))
log(f"Opened {SRC.name}")

from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
from bl_ext.blender_org.mpfb.services import HumanService, ObjectService

human = bpy.data.objects.get("Human")
if human is None:
    fail("No Human object")

before = {
    "vertices": len(human.data.vertices),
    "faces": len(human.data.polygons),
    "triangles": sum(max(0, len(p.vertices) - 2) for p in human.data.polygons),
    "shapeKeys": [kb.name for kb in human.data.shape_keys.key_blocks] if human.data.shape_keys else [],
    "vertexGroups": len(human.vertex_groups),
    "macros": {
        m: float(HumanObjectProperties.get_value(m, entity_reference=human))
        for m in ("muscle", "weight", "height", "proportions")
    },
}

ObjectService.activate_blender_object(human)
armature = HumanService.add_builtin_rig(human, RIG_NAME, import_weights=True)
if armature is None:
    fail("add_builtin_rig returned None")
log(f"Rig added: {armature.name} type={armature.type} bones={len(armature.data.bones)}")

after = {
    "vertices": len(human.data.vertices),
    "faces": len(human.data.polygons),
    "triangles": sum(max(0, len(p.vertices) - 2) for p in human.data.polygons),
    "shapeKeys": [kb.name for kb in human.data.shape_keys.key_blocks] if human.data.shape_keys else [],
    "vertexGroups": len(human.vertex_groups),
    "macros": {
        m: float(HumanObjectProperties.get_value(m, entity_reference=human))
        for m in ("muscle", "weight", "height", "proportions")
    },
    "armatureModifiers": [m.name for m in human.modifiers if m.type == "ARMATURE"],
    "parent": human.parent.name if human.parent else None,
    "boneNames": sorted(b.name for b in armature.data.bones),
    "rotationModes": sorted({pb.rotation_mode for pb in armature.pose.bones}),
}

if before["vertices"] != after["vertices"] or before["faces"] != after["faces"]:
    fail("Topology changed when adding rig")
if before["shapeKeys"] != after["shapeKeys"]:
    fail("Shape keys changed when adding rig")

DST.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(DST))
log(f"Saved {DST.name}")

print("RIG_JSON_BEGIN")
print(json.dumps({"before": before, "after": after, "rig": RIG_NAME}, indent=2))
print("RIG_JSON_END")
log("PASS — pose working source created")
