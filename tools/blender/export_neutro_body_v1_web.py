"""
Export Neutro Body V1 for web (static posed mesh → GLB).

Source (immutable):
  assets/blender/neutro-body/neutro_body_v1_complete_source.blend

Pipeline:
  open source
  → evaluate Human via depsgraph (shape keys + Armature Q2 + Mask helpers)
  → new static mesh NeutroBodyV1
  → transform: feet on Z=0, center X/Y, apply transforms
  → assign NeutroSkinV1
  → save production .blend
  → export public/models/production/neutro_body_v1.glb
  → reimport verify
  → diagnostic renders

Run:
  blender.exe --background --python tools/blender/export_neutro_body_v1_web.py
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
PROD_DIR = REPO / "assets" / "blender" / "neutro-body" / "production"
PROD_BLEND = PROD_DIR / "neutro_body_v1_web_source.blend"
GLB_PATH = REPO / "public" / "models" / "production" / "neutro_body_v1.glb"
ART = REPO / "artifacts" / "body-v1-web"
REPORT = ART / "export-report.json"

SKIN_COLOR = (0.78, 0.66, 0.55, 1.0)  # warm neutral clay
SKIN_ROUGHNESS = 0.72
SKIN_METALLIC = 0.0


def log(msg: str) -> None:
    print(f"[neutro-export] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def world_bbox(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def estimate_tris(mesh) -> int:
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def clear_scene_keep(prod_obj):
    """Remove everything except the production object (and its data)."""
    for obj in list(bpy.data.objects):
        if obj != prod_obj:
            bpy.data.objects.remove(obj, do_unlink=True)
    # orphan cleanup
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_skin_material():
    mat = bpy.data.materials.new("NeutroSkinV1")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = SKIN_COLOR
    bsdf.inputs["Metallic"].default_value = SKIN_METALLIC
    bsdf.inputs["Roughness"].default_value = SKIN_ROUGHNESS
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def setup_diag_studio(lens=50.0):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = 28
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"

    world = bpy.data.worlds.new("NeutroDiagWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.035, 0.036, 0.038, 1.0)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])

    def add_light(name, energy, loc, size):
        d = bpy.data.lights.new(name, type="AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc

    add_light("NeutroKey", 250.0, (2.2, -2.5, 2.4), 2.5)
    add_light("NeutroFill", 90.0, (-2.5, -1.5, 1.8), 3.0)
    add_light("NeutroRim", 120.0, (0.0, 3.0, 2.2), 2.0)

    cam_d = bpy.data.cameras.new("NeutroDiagCamera")
    cam_d.lens = lens
    cam = bpy.data.objects.new("NeutroDiagCamera", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def place_cam(cam, view, center, radius):
    angles = {"front": 0.0, "back": math.pi, "left": math.pi / 2, "right": -math.pi / 2}
    a = angles[view]
    cam.location = (
        center.x + radius * math.sin(a),
        center.y - radius * math.cos(a),
        center.z,
    )
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(obj, prefix: str):
    ART.mkdir(parents=True, exist_ok=True)
    # remove prior diag cams/lights
    for name in list(bpy.data.objects.keys()):
        if name.startswith(("NeutroDiag", "NeutroKey", "NeutroFill", "NeutroRim")):
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    cam = setup_diag_studio(50.0)
    mn, mx = world_bbox(obj)
    center = (mn + mx) * 0.5
    dims = mx - mn
    radius = float(max(dims.z, max(dims.x, dims.y)) * 1.35)
    paths = {}
    for view in ("front", "back", "left", "right"):
        place_cam(cam, view, center, radius)
        out = ART / f"{prefix}-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        log(f"Render {out.name}")
        bpy.ops.render.render(write_still=True)
        paths[view] = str(out.as_posix())
    return paths


def facing_direction(obj) -> str:
    """Heuristic: nose tip (most -Y or +Y vertex near head top) vs body."""
    mn, mx = world_bbox(obj)
    mid_z = mn.z + (mx.z - mn.z) * 0.92  # near head
    mesh = obj.data
    mw = obj.matrix_world
    head_pts = []
    for v in mesh.vertices:
        p = mw @ v.co
        if p.z >= mid_z:
            head_pts.append(p)
    if not head_pts:
        return "unknown"
    # average of head vs body center
    body_c = (mn + mx) * 0.5
    hx = sum(p.x for p in head_pts) / len(head_pts)
    hy = sum(p.y for p in head_pts) / len(head_pts)
    # use nose: extreme Y of face band
    ys = [p.y for p in head_pts]
    # In MPFB, face points toward -Y; nose is min Y
    nose_y = min(ys)
    if nose_y < body_c.y - 0.02:
        return "-Y (Blender / anatomical front)"
    if max(ys) > body_c.y + 0.02:
        return "+Y"
    # fallback by X
    if hx < body_c.x - 0.02:
        return "-X"
    if hx > body_c.x + 0.02:
        return "+X"
    return "ambiguous"


def main():
    log(f"Blender {bpy.app.version_string}")
    if not SOURCE.is_file():
        fail(f"Missing source: {SOURCE}")

    source_sha = sha256_file(SOURCE)
    log(f"Source SHA-256: {source_sha}")

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects.get("Human")
    rig = bpy.data.objects.get("Human.rig")
    if human is None or rig is None:
        fail("Missing Human or Human.rig")

    # Document modifier stack
    mod_stack = []
    for i, m in enumerate(human.modifiers):
        entry = {
            "index": i,
            "name": m.name,
            "type": m.type,
            "show_viewport": m.show_viewport,
            "show_render": m.show_render,
        }
        if m.type == "MASK":
            entry["vertex_group"] = m.vertex_group
            entry["invert"] = m.invert_vertex_group
        if m.type == "ARMATURE":
            entry["armature"] = m.object.name if m.object else None
        mod_stack.append(entry)
    log(f"Modifiers: {mod_stack}")

    # Ensure modifiers are visible for evaluation
    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()

    # --- Bake via depsgraph evaluation ---
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)

    try:
        # Blender 5.x: new_from_object signature
        prod_mesh = bpy.data.meshes.new_from_object(
            evaluated,
            preserve_all_data_layers=True,
            depsgraph=depsgraph,
        )
    except TypeError:
        prod_mesh = bpy.data.meshes.new_from_object(evaluated)

    prod_mesh.name = "NeutroBodyV1"
    prod = bpy.data.objects.new("NeutroBodyV1", prod_mesh)
    bpy.context.collection.objects.link(prod)

    # Copy world transform of evaluated object so pose placement is preserved
    prod.matrix_world = evaluated.matrix_world.copy()
    bpy.context.view_layer.update()

    # Verify baked topology
    vcount = len(prod_mesh.vertices)
    fcount = len(prod_mesh.polygons)
    tcount = estimate_tris(prod_mesh)
    log(f"Baked mesh: {vcount} verts, {fcount} faces, {tcount} tris")
    if vcount >= 19000:
        fail("Bake did not remove helpers — vertex count still near full mesh")
    if vcount < 8000:
        fail(f"Bake removed too much geometry: {vcount}")

    # Shape keys must not exist on new mesh
    if prod_mesh.shape_keys is not None:
        fail("Production mesh unexpectedly has shape keys")

    # UVs
    uv_names = [uv.name for uv in prod_mesh.uv_layers]
    log(f"UV layers after bake: {uv_names}")

    # Material
    mat = make_skin_material()
    prod_mesh.materials.clear()
    prod_mesh.materials.append(mat)

    # Normals: ensure consistent (non-destructive recalculate)
    bpy.ops.object.select_all(action="DESELECT")
    prod.select_set(True)
    bpy.context.view_layer.objects.active = prod
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # --- Transforms: feet on Z=0, center X/Y ---
    bpy.context.view_layer.update()
    mn, mx = world_bbox(prod)
    # Shift geometry via object location first, then apply
    cx = (mn.x + mx.x) * 0.5
    cy = (mn.y + mx.y) * 0.5
    prod.location.x -= cx
    prod.location.y -= cy
    prod.location.z -= mn.z
    bpy.context.view_layer.update()

    # Apply location/rotation/scale
    bpy.ops.object.select_all(action="DESELECT")
    prod.select_set(True)
    bpy.context.view_layer.objects.active = prod
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()

    mn2, mx2 = world_bbox(prod)
    facing = facing_direction(prod)
    log(f"Facing: {facing}")
    log(f"BBox after transform: min={tuple(mn2)} max={tuple(mx2)}")

    if abs(mn2.z) > 1e-3:
        fail(f"Feet not on Z=0 after transform (minZ={mn2.z})")

    # Remove source objects from production scene
    clear_scene_keep(prod)
    # Ensure prod still linked
    if prod.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(prod)

    # Verify clean scene
    remaining = [o.name for o in bpy.data.objects]
    log(f"Production scene objects: {remaining}")
    if remaining != ["NeutroBodyV1"]:
        # allow only NeutroBodyV1
        for o in list(bpy.data.objects):
            if o.name != "NeutroBodyV1":
                bpy.data.objects.remove(o, do_unlink=True)
        remaining = [o.name for o in bpy.data.objects]
        if remaining != ["NeutroBodyV1"]:
            fail(f"Unexpected objects remain: {remaining}")

    if prod.modifiers:
        fail(f"Production object still has modifiers: {[m.name for m in prod.modifiers]}")
    if any(o.type == "ARMATURE" for o in bpy.data.objects):
        fail("Armature still present")

    # Save production blend
    PROD_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(PROD_BLEND))
    log(f"Saved {PROD_BLEND}")

    # Diagnostic renders of web source
    web_renders = render_views(prod, "web-source")

    baked_stats = {
        "vertices": vcount,
        "faces": fcount,
        "triangles": tcount,
        "shapeKeys": 0,
        "modifiers": [],
        "armatures": 0,
        "uvLayers": uv_names,
        "location": list(prod.location),
        "rotationEuler": list(prod.rotation_euler),
        "scale": list(prod.scale),
        "bboxMin": [float(mn2.x), float(mn2.y), float(mn2.z)],
        "bboxMax": [float(mx2.x), float(mx2.y), float(mx2.z)],
        "dims": [float(mx2.x - mn2.x), float(mx2.y - mn2.y), float(mx2.z - mn2.z)],
        "facing": facing,
        "feetOnZ0": abs(mn2.z) <= 1e-3,
    }

    # --- Export GLB ---
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    prod.select_set(True)
    bpy.context.view_layer.objects.active = prod

    export_kwargs = dict(
        filepath=str(GLB_PATH),
        use_selection=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    # Blender 5.x may use different flag names — try primary then fallbacks
    try:
        bpy.ops.export_scene.gltf(**export_kwargs)
    except TypeError as e:
        log(f"Primary export kwargs failed ({e}); trying minimal set")
        bpy.ops.export_scene.gltf(
            filepath=str(GLB_PATH),
            use_selection=True,
            export_animations=False,
            export_apply=False,
        )

    if not GLB_PATH.is_file():
        fail("GLB was not written")
    glb_size = GLB_PATH.stat().st_size
    log(f"Exported GLB ({glb_size} bytes): {GLB_PATH}")

    # --- Reimport verify ---
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB_PATH))
    imported = [o for o in bpy.data.objects if o.type == "MESH"]
    if len(imported) != 1:
        fail(f"Expected 1 mesh on reimport, got {[o.name for o in imported]}")
    imp = imported[0]
    bpy.context.view_layer.update()
    imn, imx = world_bbox(imp)
    idims = imx - imn
    bdims = Vector(baked_stats["dims"])
    dim_ok = all(abs(idims[i] - bdims[i]) < 0.01 for i in range(3))
    log(f"Reimport dims: {tuple(idims)} vs baked {tuple(bdims)} ok={dim_ok}")

    reimport = {
        "meshName": imp.name,
        "vertices": len(imp.data.vertices),
        "faces": len(imp.data.polygons),
        "triangles": estimate_tris(imp.data),
        "materials": [s.material.name if s.material else None for s in imp.material_slots],
        "uvLayers": [uv.name for uv in imp.data.uv_layers],
        "shapeKeys": bool(imp.data.shape_keys),
        "modifiers": [m.name for m in imp.modifiers],
        "armaturesInScene": [o.name for o in bpy.data.objects if o.type == "ARMATURE"],
        "bboxMin": [float(imn.x), float(imn.y), float(imn.z)],
        "bboxMax": [float(imx.x), float(imx.y), float(imx.z)],
        "dims": [float(idims.x), float(idims.y), float(idims.z)],
        "dimsMatchBaked": dim_ok,
        # glTF Y-up: after import into Blender, Z-up conversion may apply
        "minZ": float(imn.z),
    }

    # Source unchanged
    source_sha_final = sha256_file(SOURCE)
    if source_sha_final != source_sha:
        fail("Master source was modified during export")

    report = {
        "source": str(SOURCE.as_posix()),
        "sourceSha256": source_sha,
        "sourceUnchanged": True,
        "modifierStack": mod_stack,
        "bakeMethod": "evaluated_get + meshes.new_from_object(preserve_all_data_layers=True)",
        "helpersRemovedApprox": 19158 - vcount,
        "productionBlend": str(PROD_BLEND.as_posix()),
        "productionBlendSize": PROD_BLEND.stat().st_size,
        "glb": str(GLB_PATH.as_posix()),
        "glbSize": glb_size,
        "material": {
            "name": "NeutroSkinV1",
            "baseColor": list(SKIN_COLOR),
            "metallic": SKIN_METALLIC,
            "roughness": SKIN_ROUGHNESS,
            "textures": [],
        },
        "baked": baked_stats,
        "reimport": reimport,
        "renders": web_renders,
        # Recommended web rotation: after glTF Y-up remapping, anatomical front
        # typically faces +Z already (Blender -Y → glTF +Z). Verify in lab.
        "recommendedWebRotation": [0, 0, 0],
        "noteFacing": (
            "In Blender Z-up, anatomical front is -Y. "
            "glTF exporter remaps Blender (X,Y,Z)→(+X,+Z,-Y), so front -Y becomes +Z in glTF/Y-up. "
            "R3F expects front at +Z → rotation [0,0,0] should be correct."
        ),
    }

    ART.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"Wrote {REPORT}")
    log("PASS — Neutro Body V1 web export complete")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        fail("Unhandled exception")
