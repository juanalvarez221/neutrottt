"""
Blender authoring scaffold for Neutro anatomical highlight regions.

Usage (when Blender is installed):
  blender --background --python tools/anatomical-overlay/create-authoring-blend.py

Creates:
  assets/blender/neutro-body/neutro_body_v1_anatomical_regions_authoring.blend

Collections: BodyVisual_REF, HighlightSurface, Landmarks, Curves, Cameras
The Node bake pipeline (bake-highlight.mjs) remains the reproducible runtime path
when Blender is unavailable; this blend is the human-editable mirror of the
boundary control points in assets/body-regions/neutro_body_v1_anatomical_boundaries.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import bpy
except ImportError:
    print("Run inside Blender: blender --background --python create-authoring-blend.py")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
BODY_GLB = ROOT / "public/models/production/neutro_body_v1.glb"
LANDMARKS = ROOT / "assets/body-regions/neutro_body_v1_landmarks.json"
BOUNDARIES = ROOT / "assets/body-regions/neutro_body_v1_anatomical_boundaries.json"
OUT_BLEND = ROOT / "assets/blender/neutro-body/neutro_body_v1_anatomical_regions_authoring.blend"


def ensure_collection(name: str):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name in (
        "BodyVisual_REF",
        "HighlightSurface",
        "Landmarks",
        "Curves",
        "Cameras",
        "AuditMaterials",
    ):
        ensure_collection(name)

    if BODY_GLB.exists():
        bpy.ops.import_scene.gltf(filepath=str(BODY_GLB))
        for obj in list(bpy.context.selected_objects):
            ensure_collection("BodyVisual_REF").objects.link(obj)
            for col in obj.users_collection:
                if col.name != "BodyVisual_REF":
                    col.objects.unlink(obj)
            obj.name = "BodyVisual_REF"
            obj.hide_select = True

    if LANDMARKS.exists():
        data = json.loads(LANDMARKS.read_text(encoding="utf-8"))
        lm_col = ensure_collection("Landmarks")
        for key, xyz in data.get("points", {}).items():
            bpy.ops.object.empty_add(type="PLAIN_AXES", location=xyz)
            empty = bpy.context.active_object
            empty.name = f"lm_{key}"
            empty.empty_display_size = 0.01
            lm_col.objects.link(empty)
            for col in list(empty.users_collection):
                if col != lm_col:
                    col.objects.unlink(empty)

    if BOUNDARIES.exists():
        data = json.loads(BOUNDARIES.read_text(encoding="utf-8"))
        curve_col = ensure_collection("Curves")
        for bid, boundary in data.get("boundaries", {}).items():
            pts = boundary.get("controlPoints") or []
            if len(pts) < 2:
                continue
            curve_data = bpy.data.curves.new(bid, type="CURVE")
            curve_data.dimensions = "3D"
            spline = curve_data.splines.new("BEZIER")
            spline.bezier_points.add(len(pts) - 1)
            for i, p in enumerate(pts):
                bp = spline.bezier_points[i]
                bp.co = p
                bp.handle_left_type = "AUTO"
                bp.handle_right_type = "AUTO"
            obj = bpy.data.objects.new(bid, curve_data)
            curve_col.objects.link(obj)

    # Canonical cameras
    cam_col = ensure_collection("Cameras")
    for name, loc, target in (
        ("cam_front", (0, 1.2, 2.2), (0, 1.2, 0)),
        ("cam_back", (0, 1.2, -2.2), (0, 1.2, 0)),
        ("cam_right", (-2.2, 1.2, 0), (0, 1.2, 0)),
        ("cam_left", (2.2, 1.2, 0), (0, 1.2, 0)),
    ):
        cam_data = bpy.data.cameras.new(name)
        cam = bpy.data.objects.new(name, cam_data)
        cam.location = loc
        cam_col.objects.link(cam)

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    print(f"wrote {OUT_BLEND}")


if __name__ == "__main__":
    main()
