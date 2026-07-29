"""
Atlas QA: BodyVisual + UV region ID mask sampled in shader (not face paint).

Matches runtime PublicRegionMaskHighlight visual authority.

Run:
  blender --background --python tools/blender/public_regions/render_uv_mask_atlas_v2.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from generate_neutro_body_v1_public_regions_v2 import bake_source  # noqa: E402

MASK_PNG = REPO / "public/models/interaction/neutro_body_v1_public_region_mask.png"
MANIFEST = REPO / "public/models/interaction/neutro_body_v1_public_region_mask.json"
ATLAS = REPO / "artifacts/body-public-region-atlas-v2"


def log(msg: str) -> None:
    print(f"[atlas-v2] {msg}", flush=True)


def load_mask_buffer():
    """Load mask PNG into top-down buf (y=0 = UV v=1), matching bake convention."""
    img = bpy.data.images.load(str(MASK_PNG))
    w, h = img.size[0], img.size[1]
    px = list(img.pixels)  # Blender: y=0 bottom
    buf = [0] * (w * h)
    for y in range(h):
        src_row = y * w  # blender bottom-up
        dst_row = (h - 1 - y) * w  # top-down
        for x in range(w):
            buf[dst_row + x] = int(round(px[(src_row + x) * 4] * 255.0))
    bpy.data.images.remove(img)
    return buf, w, h


def write_membership_image(path: Path, buf, w, h, active: set[int]):
    """Binary membership PNG; buf is top-down, Blender pixels bottom-up."""
    img = bpy.data.images.new("Membership", width=w, height=h, alpha=False)
    pixels = [0.0] * (w * h * 4)
    for y in range(h):
        src_row = y * w
        dst_row = (h - 1 - y) * w
        for x in range(w):
            t = 1.0 if buf[src_row + x] in active else 0.0
            o = (dst_row + x) * 4
            pixels[o] = t
            pixels[o + 1] = t
            pixels[o + 2] = t
            pixels[o + 3] = 1.0
    img.pixels = pixels
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save()
    bpy.data.images.remove(img)
    loaded = bpy.data.images.load(str(path))
    loaded.colorspace_settings.name = "Non-Color"
    loaded.pack()
    return loaded


def build_mask_material(membership_img, uv_map_name: str, gold=(0.95, 0.62, 0.18), skin=(0.72, 0.62, 0.52)):
    mat = bpy.data.materials.new(name="UVMaskHighlight")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (480, 0)
    try:
        bsdf.inputs["Roughness"].default_value = 0.55
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.2
    except Exception:
        pass

    # Prefer MixRGB; fall back to Mix
    try:
        mix = nodes.new("ShaderNodeMixRGB")
        mix.location = (260, 0)
        mix.blend_type = "MIX"
        mix.inputs["Color1"].default_value = (*skin, 1.0)
        mix.inputs["Color2"].default_value = (*gold, 1.0)
        fac_in = mix.inputs["Fac"]
        col_out = mix.outputs["Color"]
    except Exception:
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.location = (260, 0)
        mix.inputs["A"].default_value = (*skin, 1.0)
        mix.inputs["B"].default_value = (*gold, 1.0)
        fac_in = mix.inputs["Factor"]
        col_out = mix.outputs["Result"]

    tex = nodes.new("ShaderNodeTexImage")
    tex.location = (-80, 0)
    tex.image = membership_img
    tex.interpolation = "Closest"
    membership_img.colorspace_settings.name = "Non-Color"

    uv = nodes.new("ShaderNodeUVMap")
    uv.location = (-320, 0)
    uv.uv_map = uv_map_name

    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], fac_in)
    # If Fac expects float, use separate
    try:
        sep = nodes.new("ShaderNodeSeparateColor")
        sep.location = (80, 0)
        links.new(tex.outputs["Color"], sep.inputs["Color"])
        # reconnect fac from R
        for link in list(links):
            if link.to_socket == fac_in:
                links.remove(link)
        links.new(sep.outputs["Red"], fac_in)
    except Exception:
        pass

    links.new(col_out, bsdf.inputs["Base Color"])
    # Also drive emission for visibility
    if "Emission Color" in bsdf.inputs:
        links.new(col_out, bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 0.35
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def setup_scene(baked):
    for o in list(bpy.data.objects):
        if o != baked:
            o.hide_render = True
            o.hide_viewport = True
    baked.hide_render = False
    baked.hide_viewport = False

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = 32
        except Exception:
            pass
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("AtlasWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.12, 0.12, 0.13, 1)
    bg.inputs[1].default_value = 1.0

    light_data = bpy.data.lights.new(name="Key", type="AREA")
    light_data.energy = 90
    light_data.size = 3.5
    light = bpy.data.objects.new("Key", light_data)
    bpy.context.collection.objects.link(light)
    light.location = (1.6, -2.4, 2.3)

    fill = bpy.data.lights.new(name="Fill", type="AREA")
    fill.energy = 25
    fill.size = 4
    fill_o = bpy.data.objects.new("Fill", fill)
    bpy.context.collection.objects.link(fill_o)
    fill_o.location = (-1.2, -1.0, 1.5)

    cam_data = bpy.data.cameras.new("AtlasCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("AtlasCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def region_focus(mesh, mw, buf, w, h, uv_layer, active: set[int]):
    pts = []
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            uv = uv_layer.data[li].uv
            x = int(max(0, min(w - 1, round(uv.x * (w - 1)))))
            y = int(max(0, min(h - 1, round((1.0 - uv.y) * (h - 1)))))
            if buf[y * w + x] in active:
                c = Vector((0, 0, 0))
                for vi in poly.vertices:
                    c += mw @ mesh.vertices[vi].co
                c /= float(len(poly.vertices))
                pts.append(c)
                break
    if not pts:
        return Vector((0, 0, 1.0)), 1.2
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) * 0.5
    r = max((mx - mn).length * 1.45, 0.5)
    return c, r


def main():
    if not MASK_PNG.exists() or not MANIFEST.exists():
        raise SystemExit("Missing UV mask — run bake_uv_region_mask.py first")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    name_to_idx = {k: int(v["maskIndex"]) for k, v in manifest["regions"].items()}

    ATLAS.mkdir(parents=True, exist_ok=True)
    baked, _rig, _ = bake_source()
    mesh = baked.data
    mw = baked.matrix_world
    uv_layer = mesh.uv_layers.active or mesh.uv_layers[0]
    uv_name = uv_layer.name
    buf, w, h = load_mask_buffer()
    log(f"mask {w}x{h} uv={uv_name}")

    # Sanity: how many texels for right pec
    pec_i = name_to_idx.get("right_pectoral_region", -1)
    pec_n = sum(1 for v in buf if v == pec_i)
    log(f"right_pectoral texels={pec_n}")

    scene, cam = setup_scene(baked)

    shots = [
        ({"right_pectoral_region"}, "front", "01-pectoral-right-front.png"),
        ({"left_pectoral_region"}, "front", "02-pectoral-left-front.png"),
        ({"left_pectoral_region", "right_pectoral_region"}, "front", "03-full-chest-front.png"),
        ({"full_abdomen_region"}, "front", "04-abdomen-front.png"),
        ({"right_ribs_region"}, "oblique_r", "05-ribs-right-oblique.png"),
        ({"right_ribs_region"}, "right", "06-ribs-right-side.png"),
        ({"left_ribs_region"}, "oblique_l", "07-ribs-left-oblique.png"),
        ({"left_ribs_region"}, "left", "08-ribs-left-side.png"),
        ({"upper_back_region"}, "back", "09-upper-back-back.png"),
        ({"lower_back_region"}, "back", "10-lower-back-back.png"),
        ({"upper_back_region", "lower_back_region"}, "back", "11-full-back-back.png"),
        ({"right_biceps_surface"}, "oblique_r", "12-biceps-right.png"),
        ({"right_triceps_surface"}, "oblique_back_r", "13-triceps-right.png"),
        ({"right_forearm_inner_surface"}, "front", "14-forearm-inner-right.png"),
        ({"right_forearm_outer_surface"}, "right", "15-forearm-outer-right.png"),
        ({"left_thigh_front_surface"}, "front", "16-thigh-front-left.png"),
        ({"left_thigh_back_surface"}, "back", "17-thigh-back-left.png"),
        ({"left_thigh_inner_surface"}, "left", "18-thigh-inner-left.png"),
        ({"left_thigh_outer_surface"}, "left", "19-thigh-outer-left.png"),
        ({"left_shin_surface"}, "front", "20-shin-left.png"),
        ({"left_calf_surface"}, "back", "21-calf-left.png"),
        ({"left_shin_surface", "left_calf_surface"}, "left", "22-lower-leg-complete-left.png"),
        ({"head_top_surface"}, "top", "23-head-top.png"),
        ({"head_left_surface"}, "left", "24-head-left.png"),
        ({"head_back_surface"}, "back", "25-head-back.png"),
        ({"neck_front_surface"}, "front", "26-neck-front.png"),
        ({"neck_left_surface"}, "left", "27-neck-left.png"),
        ({"neck_back_surface"}, "back", "28-neck-back.png"),
    ]

    view_dir = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "left": Vector((1, 0.12, 0.05)),
        "right": Vector((-1, 0.12, 0.05)),
        "oblique_r": Vector((0.55, -1, 0.08)),
        "oblique_l": Vector((-0.55, -1, 0.08)),
        "oblique_back_r": Vector((-0.45, 1, 0.05)),
        "top": Vector((0.15, -0.4, 1.0)),
    }

    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = "PNG"
    tmp_dir = ATLAS / "_membership"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for names, view, fname in shots:
        active = {name_to_idx[n] for n in names if n in name_to_idx}
        if not active:
            log(f"SKIP {fname}")
            continue
        mem_path = tmp_dir / f"{fname}.membership.png"
        mem_img = write_membership_image(mem_path, buf, w, h, active)
        mat = build_mask_material(mem_img, uv_name)
        baked.data.materials.clear()
        baked.data.materials.append(mat)
        for poly in mesh.polygons:
            poly.material_index = 0

        # Debug: count active face corners
        hit = 0
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                uv = uv_layer.data[li].uv
                x = int(max(0, min(w - 1, round(float(uv.x) * (w - 1)))))
                y = int(max(0, min(h - 1, round((1.0 - float(uv.y)) * (h - 1)))))
                if buf[y * w + x] in active:
                    hit += 1
                    break
        log(f"{fname} active_faces~={hit} ids={sorted(active)}")

        look, dist = region_focus(mesh, mw, buf, w, h, uv_layer, active)
        d = view_dir[view].normalized()
        cam.location = look + d * dist
        cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(ATLAS / fname)
        bpy.ops.render.render(write_still=True)
        log(f"wrote {fname}")
        # Cleanup material/image to avoid memory blowup
        bpy.data.materials.remove(mat)
        bpy.data.images.remove(mem_img)

    log("DONE atlas v2")


if __name__ == "__main__":
    main()
