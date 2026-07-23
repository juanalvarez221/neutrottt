"""
Generate Neutro Body V1 PublicRegionHighlightModel.

Decouples visual highlight geometry from the 81-zone InteractionModel.

Strategy:
  1. Start from the official 81-zone InteractionModel meshes (same skin surface).
  2. Remap / join atomics into wider public tattoo panels.
  3. CRITICAL — espalda: absorb posterior faces that the technical torso grid
     classified as ribs/flanks (those make full_back look like a central strip).
  4. Export a dedicated GLB; do NOT replace neutro_body_v1_body_interaction.glb.

Outputs:
  assets/blender/neutro-body/interaction/neutro_body_v1_public_regions.blend
  public/models/interaction/neutro_body_v1_public_regions.glb
  artifacts/body-v1-public-regions/report.json
  artifacts/body-v1-public-regions/qa-*.png

Run:
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python tools/blender/generate_neutro_body_v1_public_regions.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction.geometry import face_area, world_bbox  # noqa: E402

INTERACTION_GLB = (
    REPO / "public" / "models" / "interaction" / "neutro_body_v1_body_interaction.glb"
)
OUT_BLEND = (
    REPO
    / "assets"
    / "blender"
    / "neutro-body"
    / "interaction"
    / "neutro_body_v1_public_regions.blend"
)
OUT_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_public_regions.glb"
ART = REPO / "artifacts" / "body-v1-public-regions"
REPORT = ART / "report.json"

# Mesh names in GLB: public_<id>
PUBLIC_FROM_ATOMICS: dict[str, tuple[str, ...]] = {
    # Back — base panels (later expanded with posterior ribs/flanks)
    "upper_back_region": (
        "left_scapula",
        "right_scapula",
        "upper_back_center",
        "left_mid_back",
        "right_mid_back",
        "mid_back_center",
    ),
    "lower_back_region": (
        "left_lower_back",
        "right_lower_back",
        "lower_back_center",
    ),
    # Chest — pectorals; sternum split for central continuity (no abdomen)
    "left_pectoral_region": ("left_chest",),
    "right_pectoral_region": ("right_chest",),
    "full_abdomen_region": ("upper_abdomen", "lower_abdomen"),
    "left_ribs_region": ("left_ribs",),
    "right_ribs_region": ("right_ribs",),
    "left_flank_region": ("left_flank",),
    "right_flank_region": ("right_flank",),
    # Arms — wider surfaces than single technical strips
    "right_shoulder_surface": ("right_shoulder",),
    "left_shoulder_surface": ("left_shoulder",),
    "right_biceps_surface": ("right_upper_arm_front", "right_upper_arm_inner"),
    "left_biceps_surface": ("left_upper_arm_front", "left_upper_arm_inner"),
    "right_triceps_surface": ("right_upper_arm_back", "right_upper_arm_outer"),
    "left_triceps_surface": ("left_upper_arm_back", "left_upper_arm_outer"),
    "right_forearm_inner_surface": ("right_forearm_front", "right_forearm_inner"),
    "left_forearm_inner_surface": ("left_forearm_front", "left_forearm_inner"),
    "right_forearm_outer_surface": ("right_forearm_back", "right_forearm_outer"),
    "left_forearm_outer_surface": ("left_forearm_back", "left_forearm_outer"),
    "right_elbow_transition": ("right_elbow",),
    "left_elbow_transition": ("left_elbow",),
    "right_wrist_transition": ("right_wrist",),
    "left_wrist_transition": ("left_wrist",),
    "right_hand_surface": ("right_hand",),
    "left_hand_surface": ("left_hand",),
    # Legs
    "right_thigh_front_surface": ("right_thigh_front",),
    "right_thigh_back_surface": ("right_thigh_back",),
    "right_thigh_inner_surface": ("right_thigh_inner",),
    "right_thigh_outer_surface": ("right_thigh_outer",),
    "left_thigh_front_surface": ("left_thigh_front",),
    "left_thigh_back_surface": ("left_thigh_back",),
    "left_thigh_inner_surface": ("left_thigh_inner",),
    "left_thigh_outer_surface": ("left_thigh_outer",),
    "right_knee_transition": ("right_knee",),
    "left_knee_transition": ("left_knee",),
    "right_shin_surface": ("right_lower_leg_front", "right_lower_leg_inner"),
    "left_shin_surface": ("left_lower_leg_front", "left_lower_leg_inner"),
    "right_calf_surface": ("right_lower_leg_back", "right_lower_leg_outer"),
    "left_calf_surface": ("left_lower_leg_back", "left_lower_leg_outer"),
    "right_ankle_transition": ("right_ankle",),
    "left_ankle_transition": ("left_ankle",),
    "right_foot_surface": ("right_foot",),
    "left_foot_surface": ("left_foot",),
    # Head / neck (face omitted — non-selectable)
    "head_top_surface": ("head_top",),
    "head_back_surface": ("head_back",),
    "head_left_surface": ("head_left_side", "left_ear"),
    "head_right_surface": ("head_right_side", "right_ear"),
    "neck_front_surface": ("neck_front",),
    "neck_back_surface": ("neck_back",),
    "neck_left_surface": ("neck_left",),
    "neck_right_surface": ("neck_right",),
    # Hips (sacrum omitted from public highlight)
    "left_hip_surface": ("left_hip",),
    "right_hip_surface": ("right_hip",),
    "left_glute_surface": ("left_glute",),
    "right_glute_surface": ("right_glute",),
}

# Sources whose POSTERIOR faces are absorbed into dorsal public panels
BACK_EXPAND_SOURCES = (
    "left_ribs",
    "right_ribs",
    "left_flank",
    "right_flank",
)

# Posterior / dorsal half thresholds (body back ≈ +Y in this asset).
# Technical torso grid parks lateral dorsal canvas in ribs/flanks; we reclaim
# any face that is clearly on the back half of the torso, not only strong +Y normals.
POSTERIOR_DOT = 0.08
BACK_HALF_Y = 0.09
# Vertical split upper/lower using mid-back center centroid Z as reference
# (computed at runtime)


def log(msg: str) -> None:
    print(f"[public-regions] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def zone_name(atomic: str) -> str:
    return f"zone_{atomic}"


def load_interaction_zones() -> dict[str, bpy.types.Object]:
    if not INTERACTION_GLB.exists():
        fail(f"Missing InteractionModel {INTERACTION_GLB}")
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(INTERACTION_GLB))
    by_atomic: dict[str, bpy.types.Object] = {}
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" and obj.name.startswith("zone_"):
            # non-mesh with zone_ prefix — ignore
            continue
        if not obj.name.startswith("zone_"):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        base = obj.name.split(".")[0]
        atomic = base[len("zone_") :]
        if atomic in by_atomic:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        by_atomic[atomic] = obj
        obj.name = base
    if len(by_atomic) != 81:
        fail(f"Expected 81 zone meshes, got {len(by_atomic)}")
    log(f"Loaded {len(by_atomic)} interaction zones")
    return by_atomic


def duplicate_mesh(src: bpy.types.Object, name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    dup = bpy.context.active_object
    dup.name = name
    dup.data = dup.data.copy()
    return dup


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def face_centroid_world(obj, poly) -> Vector:
    mw = obj.matrix_world
    c = Vector((0.0, 0.0, 0.0))
    for vi in poly.vertices:
        c += mw @ obj.data.vertices[vi].co
    return c / float(len(poly.vertices))


def face_normal_world(obj, poly) -> Vector:
    return (obj.matrix_world.to_3x3() @ poly.normal).normalized()


def delete_faces_keep(obj: bpy.types.Object, keep: set[int]) -> int:
    """Keep only face indices in `keep`. Returns remaining face count."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(
        bm,
        geom=[f for f in bm.faces if f.index not in keep],
        context="FACES",
    )
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(obj.data)
    remaining = len(bm.faces)
    bm.free()
    obj.data.update()
    return remaining


def split_sternum_into_pectorals(
    zones: dict[str, bpy.types.Object],
) -> tuple[bpy.types.Object | None, bpy.types.Object | None]:
    """Split sternum mesh into left/right halves for chest continuity (no abdomen)."""
    sternum = zones.get("sternum")
    if sternum is None:
        return None, None
    left_faces: set[int] = set()
    right_faces: set[int] = set()
    for poly in sternum.data.polygons:
        c = face_centroid_world(sternum, poly)
        # Anatomical right is -X in this asset (right_chest has negative X)
        if c.x <= 0:
            right_faces.add(poly.index)
        else:
            left_faces.add(poly.index)

    left_obj = duplicate_mesh(sternum, "_sternum_left_tmp")
    right_obj = duplicate_mesh(sternum, "_sternum_right_tmp")
    delete_faces_keep(left_obj, left_faces)
    delete_faces_keep(right_obj, right_faces)
    if len(left_obj.data.polygons) == 0:
        bpy.data.objects.remove(left_obj, do_unlink=True)
        left_obj = None
    if len(right_obj.data.polygons) == 0:
        bpy.data.objects.remove(right_obj, do_unlink=True)
        right_obj = None
    return left_obj, right_obj


def absorb_posterior_into_back(
    zones: dict[str, bpy.types.Object],
    mid_z: float,
) -> tuple[bpy.types.Object | None, bpy.types.Object | None, dict]:
    """
    Extract posterior faces from ribs/flanks into upper/lower back temps.
    Remaining anterior/lateral faces stay on the source zone objects.
    """
    upper_parts: list[bpy.types.Object] = []
    lower_parts: list[bpy.types.Object] = []
    meta = {"absorbedFaces": 0, "bySource": {}}

    for atomic in BACK_EXPAND_SOURCES:
        src = zones.get(atomic)
        if src is None:
            continue
        post_upper: set[int] = set()
        post_lower: set[int] = set()
        keep_src: set[int] = set()
        for poly in src.data.polygons:
            n = face_normal_world(src, poly)
            c = face_centroid_world(src, poly)
            # Dorsal canvas: posterior normal OR centroid already on back half
            on_back_half = c.y >= BACK_HALF_Y and n.y >= -0.35
            posterior = n.y >= POSTERIOR_DOT or on_back_half
            if not posterior:
                keep_src.add(poly.index)
                continue
            # Exclude very low sacral / glute-adjacent
            if c.z < mid_z - 0.22:
                keep_src.add(poly.index)
                continue
            # Exclude under-armpit / extreme lateral that wraps to front
            if c.y < 0.02:
                keep_src.add(poly.index)
                continue
            if c.z >= mid_z:
                post_upper.add(poly.index)
            else:
                post_lower.add(poly.index)

        absorbed = len(post_upper) + len(post_lower)
        meta["bySource"][atomic] = {
            "upper": len(post_upper),
            "lower": len(post_lower),
            "kept": len(keep_src),
        }
        meta["absorbedFaces"] += absorbed

        if post_upper:
            part = duplicate_mesh(src, f"_back_abs_{atomic}_u")
            delete_faces_keep(part, post_upper)
            upper_parts.append(part)
        if post_lower:
            part = duplicate_mesh(src, f"_back_abs_{atomic}_l")
            delete_faces_keep(part, post_lower)
            lower_parts.append(part)

        # Shrink original zone to non-posterior remainder (public ribs/flanks)
        delete_faces_keep(src, keep_src)
        log(
            f"  absorb {atomic}: +U{len(post_upper)} +L{len(post_lower)} keep={len(keep_src)}"
        )

    upper = join_objects(upper_parts, "_absorbed_upper_back") if upper_parts else None
    lower = join_objects(lower_parts, "_absorbed_lower_back") if lower_parts else None
    return upper, lower, meta


def build_public_regions(zones: dict[str, bpy.types.Object]) -> tuple[list, dict, dict]:
    # Mid-Z from mid_back_center for upper/lower split of absorbed faces
    mid = zones.get("mid_back_center") or zones.get("lower_back_center")
    if mid is None:
        fail("Missing mid/lower back center for vertical split")
    zs = [face_centroid_world(mid, p).z for p in mid.data.polygons]
    mid_z = sum(zs) / max(len(zs), 1)
    log(f"Back vertical split mid_z={mid_z:.3f}")

    absorbed_u, absorbed_l, absorb_meta = absorb_posterior_into_back(zones, mid_z)

    sternum_l, sternum_r = split_sternum_into_pectorals(zones)

    created: list[bpy.types.Object] = []
    stats: dict[str, dict] = {}

    for public_id, atomics in PUBLIC_FROM_ATOMICS.items():
        parts: list[bpy.types.Object] = []
        for atomic in atomics:
            src = zones.get(atomic)
            if src is None:
                log(f"WARN missing atomic {atomic} for {public_id}")
                continue
            # Skip empty after absorption
            if len(src.data.polygons) == 0:
                continue
            parts.append(duplicate_mesh(src, f"_part_{public_id}_{atomic}"))

        if public_id == "upper_back_region" and absorbed_u is not None:
            parts.append(absorbed_u)
        if public_id == "lower_back_region" and absorbed_l is not None:
            parts.append(absorbed_l)
        if public_id == "left_pectoral_region" and sternum_l is not None:
            parts.append(sternum_l)
        if public_id == "right_pectoral_region" and sternum_r is not None:
            parts.append(sternum_r)

        obj = join_objects(parts, f"public_{public_id}")
        tris = len(obj.data.polygons) if obj else 0
        area = 0.0
        width = 0.0
        if obj is not None:
            for poly in obj.data.polygons:
                area += face_area(obj.data, poly, obj.matrix_world)
            a, b = world_bbox(obj)
            width = b.x - a.x
            created.append(obj)
        stats[public_id] = {
            "tris": tris,
            "area": round(area, 6),
            "widthX": round(width, 4),
        }
        log(f"  {public_id}: tris={tris} widthX={width:.3f}")

    # Remove original zone_* leftovers
    for atomic, obj in list(zones.items()):
        if obj.name.startswith("public_"):
            continue
        try:
            bpy.data.objects.remove(obj, do_unlink=True)
        except ReferenceError:
            pass

    # Remove any leftover temps
    for obj in list(bpy.data.objects):
        if obj.name.startswith("_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    return created, stats, absorb_meta


def setup_studio(center: Vector, radius: float):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            scene.render.engine = "CYCLES"
            scene.cycles.samples = 24
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("PublicRegionsWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is None:
        nt = world.node_tree
        nt.nodes.clear()
        bg = nt.nodes.new("ShaderNodeBackground")
        out = nt.nodes.new("ShaderNodeOutputWorld")
        nt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs[0].default_value = (0.06, 0.05, 0.045, 1.0)
    bg.inputs[1].default_value = 1.0
    cam_data = bpy.data.cameras.new("PublicQACam")
    cam = bpy.data.objects.new("PublicQACam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam_data.lens = 50
    # Soft key light
    light_data = bpy.data.lights.new("QAKey", type="AREA")
    light_data.energy = 280.0
    light_data.size = 2.4
    light = bpy.data.objects.new("QAKey", light_data)
    bpy.context.collection.objects.link(light)
    light.location = center + Vector((2.2, -2.6, 2.4))
    return cam


def place_cam(cam, view: str, center: Vector, radius: float):
    offsets = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "left": Vector((1, 0.12, 0.05)),
        "right": Vector((-1, 0.12, 0.05)),
    }
    d = offsets[view].normalized()
    cam.location = center + d * radius
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def paint_region(obj, color, *, emissive: bool = False):
    mat = bpy.data.materials.new(obj.name + "_mat")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    if emissive:
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*color[:3], 1.0)
        emit.inputs["Strength"].default_value = 1.35
        links.new(emit.outputs[0], out.inputs[0])
    else:
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 1.0
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.65
        links.new(bsdf.outputs[0], out.inputs[0])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def render_qa(created: list[bpy.types.Object]):
    ART.mkdir(parents=True, exist_ok=True)
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in created:
        a, b = world_bbox(obj)
        mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
        mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 0.72, 1.0)
    cam = setup_studio(center, radius)

    gold = (0.91, 0.66, 0.25, 1.0)
    dim = (0.22, 0.19, 0.16, 1.0)

    def paint_all_dim():
        for obj in created:
            obj.hide_render = False
            obj.hide_viewport = False
            paint_region(obj, dim, emissive=False)

    def highlight(ids: set[str]):
        paint_all_dim()
        for obj in created:
            rid = obj.name.replace("public_", "", 1)
            if rid in ids:
                paint_region(obj, gold, emissive=True)

    # Full back with body context
    highlight({"upper_back_region", "lower_back_region"})
    place_cam(cam, "back", center, radius)
    out = ART / "qa-full-back.png"
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log(f"Render {out.name}")

    for rid, view, fname in (
        ("upper_back_region", "back", "qa-upper-back.png"),
        ("lower_back_region", "back", "qa-lower-back.png"),
        ("right_biceps_surface", "front", "qa-biceps-right.png"),
        ("right_triceps_surface", "back", "qa-triceps-right.png"),
    ):
        highlight({rid})
        place_cam(cam, view, center, radius)
        out = ART / fname
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        log(f"Render {out.name}")

    highlight({"left_pectoral_region", "right_pectoral_region"})
    place_cam(cam, "front", center, radius)
    out = ART / "qa-full-chest.png"
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log(f"Render {out.name}")


def main():
    ART.mkdir(parents=True, exist_ok=True)
    zones = load_interaction_zones()
    created, stats, absorb_meta = build_public_regions(zones)

    ub = stats.get("upper_back_region", {}).get("tris", 0)
    lb = stats.get("lower_back_region", {}).get("tris", 0)
    ub_w = stats.get("upper_back_region", {}).get("widthX", 0)
    lb_w = stats.get("lower_back_region", {}).get("widthX", 0)
    log(f"Back gate: upper tris={ub} w={ub_w} | lower tris={lb} w={lb_w}")
    log(f"Absorbed posterior faces: {absorb_meta.get('absorbedFaces')}")

    # Must be wider than old scapula-only strip (~0.26) and have enough tris
    if ub < 250 or lb < 100:
        fail(f"Back public regions too thin (upper={ub}, lower={lb})")
    if ub_w < 0.28:
        fail(f"upper_back_region widthX={ub_w} too narrow (need >= 0.28)")

    empty = [rid for rid, s in stats.items() if s["tris"] == 0]
    if empty:
        log(f"WARN empty regions: {empty}")

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_apply=True,
    )
    log(f"Exported {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")

    render_qa(created)

    report = {
        "model": str(OUT_GLB.relative_to(REPO)).replace("\\", "/"),
        "regionCount": len([r for r, s in stats.items() if s["tris"] > 0]),
        "emptyRegions": empty,
        "stats": stats,
        "backAbsorption": absorb_meta,
        "back": {
            "upper_back_region_tris": ub,
            "lower_back_region_tris": lb,
            "upper_back_widthX": ub_w,
            "lower_back_widthX": lb_w,
            "combined_tris": ub + lb,
        },
        "qaRenders": [
            "qa-full-back.png",
            "qa-upper-back.png",
            "qa-lower-back.png",
            "qa-full-chest.png",
            "qa-biceps-right.png",
            "qa-triceps-right.png",
        ],
        "note": (
            "PublicRegionHighlightModel is visual-only. "
            "InteractionModel (81 zones) remains the hit-detection source."
        ),
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Wrote {REPORT}")
    log("DONE")


if __name__ == "__main__":
    main()
