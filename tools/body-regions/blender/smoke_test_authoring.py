"""
Smoke-test Neutro authoring operators in background Blender.
Does NOT claim anatomical PASS — only infrastructure.

  blender.exe authoring.blend --background --python tools/body-regions/blender/smoke_test_authoring.py
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
ADDON = Path(__file__).resolve().parent / "neutro_anatomical_mask_authoring.py"
RESULTS = ROOT / "artifacts/manual-anatomical-mask-authoring-smoke.json"

spec = importlib.util.spec_from_file_location("neutro_anatomical_mask_authoring", ADDON)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
try:
    mod.unregister()
except Exception:
    pass
mod.register()


def ok(name, cond, detail=""):
    return {"name": name, "pass": bool(cond), "detail": detail}


def main():
    results = []

    # Prepare
    r = bpy.ops.neutro.prepare_authoring_session()
    results.append(ok("prepare_session", r == {"FINISHED"}))

    obj = bpy.data.objects.get(mod.PAINTABLE_NAME)
    results.append(ok("paintable_object", obj is not None, obj.name if obj else "missing"))

    img = bpy.data.images.get(mod.IMAGE_NAME)
    results.append(ok("authoring_image", img is not None))

    # Load / Save / Backup / Restore
    results.append(ok("load", bpy.ops.neutro.load_authoring_mask() == {"FINISHED"}))
    results.append(ok("backup", bpy.ops.neutro.create_backup() == {"FINISHED"}))
    results.append(ok("save", bpy.ops.neutro.save_authoring_mask() == {"FINISHED"}))
    results.append(ok("restore", bpy.ops.neutro.restore_last_backup() == {"FINISHED"}))

    # Regions
    region_ok = True
    for rid, _label, _ in mod.TORSO_REGIONS:
        if bpy.ops.neutro.set_active_region(region_id=rid) != {"FINISHED"}:
            region_ok = False
            break
    results.append(ok("regions", region_ok))

    # Tools
    results.append(ok("paint", bpy.ops.neutro.paint_active_region() == {"FINISHED"}))
    results.append(ok("erase", bpy.ops.neutro.erase_to_non_selectable() == {"FINISHED"}))
    results.append(ok("sample", bpy.ops.neutro.sample_region() == {"FINISHED"}))
    results.append(ok("fill", bpy.ops.neutro.fill_connected_area() == {"FINISHED"}))

    # Mirror (pectoral) — may paint stamps; restore backup after
    bpy.ops.neutro.set_active_region(region_id="right_pectoral_region")
    mirror_r = bpy.ops.neutro.mirror_right_to_left()
    results.append(ok("mirror", mirror_r == {"FINISHED"}))
    # Restore baseline so smoke test does not leave mirrored seed as curated
    bpy.ops.neutro.restore_last_backup()

    # Cameras
    cam_ok = True
    for name, _ in mod.CAMERA_SPECS:
        if bpy.ops.neutro.set_review_camera(cam_id=name) != {"FINISHED"}:
            cam_ok = False
            break
    results.append(ok("cameras", cam_ok))

    # Guides
    col = bpy.data.collections.get(mod.GUIDES_COLLECTION)
    guide_names = [
        "guide_sternal_line",
        "guide_clavicular_base",
        "guide_axillary_anterior_R",
        "guide_axillary_anterior_L",
        "guide_axillary_posterior_R",
        "guide_axillary_posterior_L",
        "guide_inframammary_R",
        "guide_inframammary_L",
        "guide_inferior_scapular",
        "guide_waist",
        "guide_lumbar_pelvic",
    ]
    if col is None:
        for g in guide_names:
            results.append(ok(g, False, "collection missing"))
    else:
        for g in guide_names:
            results.append(ok(g, bpy.data.objects.get(g) is not None))

    # Validate / quantize / render (can be slower)
    results.append(ok("validate", bpy.ops.neutro.validate_current_mask() == {"FINISHED"}))
    results.append(ok("quantize", bpy.ops.neutro.quantize_export() == {"FINISHED"}))
    results.append(ok("render_qa", bpy.ops.neutro.render_torso_gate() == {"FINISHED"}))

    # Protections
    locked = obj and all(obj.lock_location) and all(obj.lock_rotation) and all(obj.lock_scale)
    results.append(ok("geometry_locks", locked))
    helpers_protected = True
    for o in bpy.data.objects:
        if o.name.startswith(("guide_", "cam_", "lm_")) and not o.hide_select:
            helpers_protected = False
    results.append(ok("helpers_protected", helpers_protected))

    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "results": results,
        "failed": [r for r in results if not r["pass"]],
        "passed": sum(1 for r in results if r["pass"]),
        "total": len(results),
    }
    RESULTS.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print("SMOKE", json.dumps(payload, indent=2))
    if payload["failed"]:
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
