"""
Create Neutro anatomical mask authoring blend for Texture Paint.

Usage:
  $env:BLENDER_EXE = "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe"
  & $env:BLENDER_EXE --background --python tools/body-regions/create-mask-authoring-blend.py

Outputs:
  assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "assets/blender/neutro-body/neutro_body_v1_complete_source.blend"
PALETTE = ROOT / "assets/body-regions/neutro_body_v1_region_palette.json"
LANDMARKS = ROOT / "assets/body-regions/neutro_body_v1_landmarks.json"
AUTHORING_PNG = ROOT / "assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png"
OUT_BLEND = ROOT / "assets/blender/neutro-body/neutro_body_v1_anatomical_mask_authoring.blend"
BODY_GLB = ROOT / "public/models/production/neutro_body_v1.glb"


def hex_to_rgba(hex_color: str):
    h = hex_color.lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (r, g, b, 1.0)


def ensure_collection(name: str):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def find_body_mesh():
    best = None
    best_verts = -1
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        n = len(obj.data.vertices)
        if n > best_verts:
            best_verts = n
            best = obj
    return best


def load_authoring_image():
    if not AUTHORING_PNG.exists():
        print(f"ERROR: missing authoring PNG {AUTHORING_PNG}")
        print("Run: node tools/body-regions/seed-authoring-mask-from-indexed.mjs")
        sys.exit(2)
    # Reload if already present
    existing = bpy.data.images.get("AnatomicalRegionsAuthoring")
    if existing:
        bpy.data.images.remove(existing)
    img = bpy.data.images.load(str(AUTHORING_PNG))
    img.name = "AnatomicalRegionsAuthoring"
    img.colorspace_settings.name = "sRGB"
    return img


def setup_mask_material(obj, img):
    mat = bpy.data.materials.get("AnatomicalMaskPreview")
    if mat is None:
        mat = bpy.data.materials.new("AnatomicalMaskPreview")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emis = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], emis.inputs["Color"])
    nt.links.new(emis.outputs["Emission"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def setup_texture_paint(obj, img):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if obj.data.uv_layers:
        obj.data.uv_layers.active = obj.data.uv_layers[0]
    # Enter Texture Paint so the workspace defaults to IMAGE mode on the mask.
    try:
        bpy.ops.object.mode_set(mode="TEXTURE_PAINT")
        settings = bpy.context.tool_settings.image_paint
        settings.mode = "IMAGE"
        # Blender 5.x: ImagePaint.brush is read-only; configure active paint brush if present.
        brush = getattr(settings, "brush", None)
        if brush is not None:
            brush.color = (0.898, 0.223, 0.207)  # pec R default
            brush.strength = 1.0
            if hasattr(brush, "blend"):
                brush.blend = "MIX"
            if hasattr(brush, "curve_preset"):
                try:
                    brush.curve_preset = "CONSTANT"
                except Exception:
                    pass
    except Exception as exc:
        print(f"WARN texture paint setup: {exc}")
    finally:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass



def add_landmarks():
    col = ensure_collection("Landmarks")
    if not LANDMARKS.exists():
        return
    data = json.loads(LANDMARKS.read_text(encoding="utf-8"))
    points = data.get("points") or data.get("landmarks") or {}
    if isinstance(points, dict) and points and not isinstance(next(iter(points.values())), (list, tuple)):
        # y-only landmarks from anatomy json style
        return
    for key, xyz in points.items():
        if not isinstance(xyz, (list, tuple)) or len(xyz) < 3:
            continue
        empty = bpy.data.objects.new(f"lm_{key}", None)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.012
        empty.location = (float(xyz[0]), float(xyz[1]), float(xyz[2]))
        col.objects.link(empty)


def add_cameras(body):
    col = ensure_collection("Cameras")
    # Assume imported GLB uses +Y up, +Z front (runtime). Blender Z-up may differ after import.
    # Place cameras in object space relative to body center.
    center = body.location.copy()
    try:
        from mathutils import Vector

        bbox = [body.matrix_world @ Vector(c) for c in body.bound_box]
        cx = sum(v.x for v in bbox) / 8.0
        cy = sum(v.y for v in bbox) / 8.0
        cz = sum(v.z for v in bbox) / 8.0
        center = Vector((cx, cy, cz))
    except Exception:
        pass

    target = bpy.data.objects.new("CamTarget", None)
    target.location = center
    col.objects.link(target)

    # Blender default Z-up: front ≈ -Y looking toward +Y? For GLB with Y-up imported,
    # Blender typically remaps. Use track-to and orbit on XZ if Z-up.
    dist = 2.7
    specs = [
        ("FRONT", (0.0, -dist, center.z if hasattr(center, "z") else 1.1)),
        ("BACK", (0.0, dist, center.z if hasattr(center, "z") else 1.1)),
        ("RIGHT", (-dist, 0.0, center.z if hasattr(center, "z") else 1.1)),
        ("LEFT", (dist, 0.0, center.z if hasattr(center, "z") else 1.1)),
        ("FRONT_RIGHT_30", (-dist * 0.5, -dist * 0.866, center.z if hasattr(center, "z") else 1.1)),
        ("FRONT_LEFT_30", (dist * 0.5, -dist * 0.866, center.z if hasattr(center, "z") else 1.1)),
        ("BACK_RIGHT_30", (-dist * 0.5, dist * 0.866, center.z if hasattr(center, "z") else 1.1)),
        ("BACK_LEFT_30", (dist * 0.5, dist * 0.866, center.z if hasattr(center, "z") else 1.1)),
    ]
    for name, loc in specs:
        cam_data = bpy.data.cameras.new(name)
        cam_data.lens = 50
        cam = bpy.data.objects.new(f"cam_{name}", cam_data)
        cam.location = loc
        con = cam.constraints.new(type="TRACK_TO")
        con.target = target
        con.track_axis = "TRACK_NEGATIVE_Z"
        con.up_axis = "UP_Y"
        col.objects.link(cam)


def add_studio_lights():
    col = ensure_collection("StudioLights")
    for name, loc, energy in (
        ("Key", (1.5, -1.8, 2.2), 400),
        ("Fill", (-2.0, -1.0, 1.5), 180),
        ("Rim", (0.0, 2.2, 1.8), 220),
    ):
        light_data = bpy.data.lights.new(name=name, type="AREA")
        light_data.energy = energy
        light_data.size = 1.2
        light = bpy.data.objects.new(name, light_data)
        light.location = loc
        col.objects.link(light)


def add_palette_swatches(palette: dict):
    col = ensure_collection("PaletteSwatches")
    x = -0.55
    for region_id, entry in palette["regions"].items():
        if entry.get("gate") != "torso":
            continue
        mesh = bpy.data.meshes.new(f"swatch_mesh_{region_id}")
        # tiny diamond via cube
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.028, location=(x, -0.7, 1.65))
        sw = bpy.context.active_object
        sw.name = f"swatch_{region_id}"
        mat = bpy.data.materials.new(f"swatch_mat_{region_id}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = hex_to_rgba(entry["authoringColor"])
            bsdf.inputs["Emission Color"].default_value = hex_to_rgba(entry["authoringColor"])
            bsdf.inputs["Emission Strength"].default_value = 0.35
        sw.data.materials.append(mat)
        for c in list(sw.users_collection):
            if c != col:
                c.objects.unlink(sw)
        if sw.name not in col.objects:
            col.objects.link(sw)
        x += 0.09


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    palette = json.loads(PALETTE.read_text(encoding="utf-8"))

    if SOURCE_BLEND.exists():
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
    elif BODY_GLB.exists():
        bpy.ops.import_scene.gltf(filepath=str(BODY_GLB))
    else:
        print("ERROR: no source blend or GLB")
        sys.exit(1)

    body = find_body_mesh()
    if body is None:
        print("ERROR: no mesh found")
        sys.exit(1)
    body.name = "BodyVisual_REF"
    body_col = ensure_collection("BodyVisual")
    if body.name not in body_col.objects:
        try:
            body_col.objects.link(body)
        except RuntimeError:
            pass

    img = load_authoring_image()
    setup_mask_material(body, img)
    setup_texture_paint(body, img)
    add_landmarks()
    add_cameras(body)
    add_studio_lights()
    add_palette_swatches(palette)

    # Instruction empty
    empty = bpy.data.objects.new("AUTHORING_README", None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.location = (0.0, -0.85, 1.9)
    empty["note"] = (
        "Texture Paint torso on BodyVisual with palette colors. "
        "Save image to assets/body-regions/neutro_body_v1_anatomical_regions_authoring.png "
        "then run node tools/body-regions/quantize-anatomical-mask.mjs"
    )
    bpy.context.scene.collection.objects.link(empty)

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    print(f"WROTE_BLEND {OUT_BLEND}")
    print(f"AUTHORING_PNG {AUTHORING_PNG} size={AUTHORING_PNG.stat().st_size}")


if __name__ == "__main__":
    main()
