"""
Rebuild authoring blend mesh from PRODUCTION GLB so Texture Paint UVs
match runtime / quantize / offline renderer.

  blender.exe --background --python tools/body-regions/blender/resync_authoring_uv_from_glb.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
GLB = ROOT / "public/models/production/neutro_body_v1.glb"
BLEND = ROOT / "assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend"
AUTHORING = ROOT / "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png"
PALETTE = ROOT / "assets/body-regions/neutro_body_v1_region_palette.json"
ADDON = Path(__file__).resolve().parent / "neutro_anatomical_mask_authoring.py"
PAINTABLE = "NEUTRO_BODY_MASK_AUTHORING"


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if not GLB.exists():
        print("ERROR missing GLB", GLB)
        sys.exit(1)

    bpy.ops.import_scene.gltf(filepath=str(GLB))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print("ERROR no mesh from GLB")
        sys.exit(1)
    body = max(meshes, key=lambda o: len(o.data.vertices))
    body.name = PAINTABLE
    body.lock_location = (True, True, True)
    body.lock_rotation = (True, True, True)
    body.lock_scale = (True, True, True)

    # Remove other imported empties/cameras if any noise
    for o in list(bpy.data.objects):
        if o != body and o.type != "LIGHT":
            if o.type in {"EMPTY", "CAMERA", "ARMATURE"}:
                bpy.data.objects.remove(o, do_unlink=True)

    if not AUTHORING.exists():
        print("ERROR missing authoring png")
        sys.exit(1)
    img = bpy.data.images.load(str(AUTHORING))
    img.name = "AnatomicalRegionsAuthoring"
    img.colorspace_settings.name = "sRGB"

    mat = bpy.data.materials.new("NeutroMaskPreview")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.name = "NeutroMix"
    mix.inputs["Fac"].default_value = 0.85
    skin = nt.nodes.new("ShaderNodeBsdfPrincipled")
    skin.inputs["Base Color"].default_value = (0.72, 0.58, 0.5, 1)
    emis = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], emis.inputs["Color"])
    nt.links.new(skin.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emis.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    body.data.materials.clear()
    body.data.materials.append(mat)

    # Register addon helpers for guides/cameras
    sys.path.insert(0, str(ADDON.parent))
    import importlib.util

    spec = importlib.util.spec_from_file_location("neutro_anatomical_mask_authoring", ADDON)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    try:
        mod.unregister()
    except Exception:
        pass
    mod.register()
    mod.ensure_anatomical_guides()
    mod._ensure_runtime_cameras(body)

    # Workspace name
    ws = bpy.data.workspaces.get("Layout")
    if ws:
        try:
            ws.name = "NEUTRO — Anatomical Mask"
        except Exception:
            pass

    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("RESYNC_OK", BLEND)
    print("VERTS", len(body.data.vertices), "UV", bool(body.data.uv_layers))


if __name__ == "__main__":
    main()
