"""
Prepare / refresh the Neutro anatomical mask authoring .blend:
- rename paintable body
- guides, cameras, preview material
- lock helpers
- create NEUTRO — Anatomical Mask workspace
- register addon from tools path
- prepare session defaults

Usage (called by open-torso-authoring.ps1 or manually):
  blender.exe authoring.blend --python tools/body-regions/blender/setup_authoring_scene.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
ADDON = Path(__file__).resolve().parent / "neutro_anatomical_mask_authoring.py"
BLEND = ROOT / "assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend"
AUTHORING = ROOT / "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png"

sys.path.insert(0, str(ADDON.parent))

# Import addon module by path
import importlib.util

spec = importlib.util.spec_from_file_location("neutro_anatomical_mask_authoring", ADDON)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

try:
    mod.unregister()
except Exception:
    pass
mod.register()


def ensure_workspace():
    name = "NEUTRO — Anatomical Mask"
    ws = bpy.data.workspaces.get(name)
    if ws is None:
        src = bpy.data.workspaces.get("Layout") or bpy.context.window.workspace
        try:
            ws = src.copy()
            ws.name = name
        except Exception as exc:
            print("WARN workspace copy:", exc)
            ws = src
            try:
                ws.name = name
            except Exception:
                pass
    try:
        for window in bpy.context.window_manager.windows:
            window.workspace = ws
    except Exception as exc:
        print("WARN set workspace:", exc)

    screen = ws.screens[0] if ws.screens else None
    if screen is None:
        return ws

    for area in screen.areas:
        if area.type == "VIEW_3D":
            try:
                area.spaces.active.shading.type = "MATERIAL"
            except Exception:
                pass
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    try:
                        space.show_region_ui = True
                    except Exception:
                        pass
        if area.type == "IMAGE_EDITOR":
            img = bpy.data.images.get(mod.IMAGE_NAME)
            if img is not None:
                try:
                    area.spaces.active.image = img
                except Exception:
                    pass

    print("WORKSPACE_NAME", ws.name)
    return ws


def main():
    if BLEND.exists() and bpy.data.filepath != str(BLEND):
        # If started empty, open blend
        if not bpy.data.filepath:
            bpy.ops.wm.open_mainfile(filepath=str(BLEND))

    # Register props already done
    obj = mod._find_paintable()
    if obj is None:
        print("ERROR: no mesh found")
        sys.exit(1)
    if obj.name != mod.PAINTABLE_NAME:
        # Keep previous names as aliases if needed
        obj.name = mod.PAINTABLE_NAME

    img = mod._ensure_image_loaded()
    mod._ensure_preview_material(obj, img, 0.85)
    mod.ensure_anatomical_guides()
    mod._ensure_runtime_cameras(obj)

    # Protect helpers
    for o in bpy.data.objects:
        if o == obj:
            o.hide_select = False
            o.lock_location = (True, True, True)
            o.lock_rotation = (True, True, True)
            o.lock_scale = (True, True, True)
            continue
        if o.type in {"LIGHT", "CAMERA", "EMPTY", "CURVE", "ARMATURE"}:
            o.hide_select = True
            o.hide_render = True if o.type != "CAMERA" else o.hide_render
        if o.name.startswith(("guide_", "cam_", "lm_", "swatch_", "NeutroCam")):
            o.hide_select = True

    # Do not allow saving over source body blends by clearing default save path confusion
    # (authoring blend path is the only intended save target)

    ws = ensure_workspace()

    # Prepare session defaults
    bpy.ops.neutro.prepare_authoring_session()

    # Persist
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("SETUP_OK", BLEND)
    print("PAINTABLE", obj.name)
    print("IMAGE", img.name, AUTHORING.exists())
    print("WORKSPACE", ws.name if ws else bpy.context.window.workspace.name)


if __name__ == "__main__":
    main()
