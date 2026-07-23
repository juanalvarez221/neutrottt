"""
Audit anatomical landmarks for Neutro Body V1 public region partition.

Source: assets/blender/neutro-body/neutro_body_v1_complete_source.blend
(same source used to export neutro_body_v1.glb)

Outputs (artifact, not committed by default):
  artifacts/body-public-region-landmarks/public_region_landmarks.json

Run:
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python tools/blender/audit_public_region_landmarks.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction.geometry import world_bbox  # noqa: E402
from neutro_body_interaction.public_region_partition import (  # noqa: E402
    build_landmarks,
)

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
ART = REPO / "artifacts" / "body-public-region-landmarks"
OUT = ART / "public_region_landmarks.json"


def log(msg: str) -> None:
    print(f"[landmark-audit] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def main():
    if not SOURCE.is_file():
        fail(f"Missing {SOURCE}")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human / Human.rig")

    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    try:
        baked_mesh = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
        )
    except TypeError:
        baked_mesh = bpy.data.meshes.new_from_object(evaluated)
    baked = bpy.data.objects.new("LandmarkBake", baked_mesh)
    bpy.context.collection.objects.link(baked)
    baked.matrix_world = evaluated.matrix_world.copy()
    bpy.context.view_layer.update()

    mn, mx = world_bbox(baked)
    offset = Vector((-(mn.x + mx.x) * 0.5, -(mn.y + mx.y) * 0.5, -mn.z))
    baked.location += offset
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    lm = build_landmarks(baked, rig, Vector((0, 0, 0)))
    ART.mkdir(parents=True, exist_ok=True)
    report = {
        "source": str(SOURCE.relative_to(REPO)).replace("\\", "/"),
        "productionGlb": "public/models/production/neutro_body_v1.glb",
        "vertexCount": len(baked.data.vertices),
        "faceCount": len(baked.data.polygons),
        "landmarkPriority": [
            "Human.rig bone heads",
            "joint-* / nipple / scalp vertex groups",
            "geometry width profiles at landmark Z",
        ],
        "landmarks": lm.to_dict(),
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Wrote {OUT}")
    log(
        f"height={lm.body_height:.3f} shoulderW={lm.shoulder_width:.3f} "
        f"chestW={lm.chest_width:.3f} waistW={lm.waist_width:.3f} hipW={lm.hip_width:.3f}"
    )


if __name__ == "__main__":
    main()
