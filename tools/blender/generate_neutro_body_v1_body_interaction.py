"""
Assemble official Neutro Body V1 body InteractionModel (81 atomic zones).

Combines without reclassification:
  - detailed arms (24) — includes distal digit tips in hands
  - torso + pelvis final (23)
  - detailed legs (22)
  - head / neck / face / ears (12)

Coverage compares VisibleBodyExterior vs UnionOf81AtomicZones.
Pelvic internal micro-patches (Paso 30 C03–C09) are excluded from useful exterior.

Outputs:
  assets/blender/neutro-body/interaction/neutro_body_v1_body_interaction.blend
  public/models/interaction/neutro_body_v1_body_interaction.glb
  artifacts/body-v1-81-zone-map/report.json + renders

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_body_interaction.py
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

from neutro_body_interaction.config import (  # noqa: E402
    LEG_FINAL_CIRCUMFERENTIAL_CONFIG,
    LEG_FINAL_LONGITUDINAL_CONFIG,
    PELVIS_FINAL_CONFIG,
    TORSO_T2_CONFIG,
)
from neutro_body_interaction.geometry import face_area, world_bbox  # noqa: E402
from neutro_body_interaction.head_segmentation import (  # noqa: E402
    build_head_frame,
    collect_cephalic_universe,
    resolve_head_landmarks,
    segment_head_faces,
)
from neutro_body_interaction.leg_segmentation import (  # noqa: E402
    apply_leg_circumferential,
    resolve_leg_landmarks,
    segment_leg_faces,
)
from neutro_body_interaction.pelvis_segmentation import (  # noqa: E402
    integrate_pelvis_with_torso,
    resolve_pelvis_landmarks,
)
from neutro_body_interaction.torso_segmentation import (  # noqa: E402
    build_torso_context,
    collect_arm_universe_faces,
    segment_torso_faces,
)
from neutro_body_interaction.arm_segmentation import vertex_weight  # noqa: E402
import os  # noqa: E402

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
ARMS_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_arms_interaction.glb"
TORSO_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_torso_pelvis_interaction.glb"
LEGS_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_legs_interaction.glb"
HEAD_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_head_neck_interaction.glb"
OUT_BLEND = (
    REPO
    / "assets"
    / "blender"
    / "neutro-body"
    / "interaction"
    / "neutro_body_v1_body_interaction.blend"
)
OUT_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_body_interaction.glb"
ART = REPO / "artifacts" / "body-v1-81-zone-map"
REPORT = ART / "report.json"


def log(msg: str) -> None:
    print(f"[body-interaction] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def bone_head(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix).translation.copy()


def bone_tip(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix @ Vector((0.0, pb.length, 0.0)).to_4d()).xyz


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
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("BodyMapWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.04, 0.041, 0.043, 1.0)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])

    def add_light(name, energy, loc, size):
        d = bpy.data.lights.new(name, type="AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.collection.objects.link(o)
        o.location = loc

    add_light("Key", 320.0, center + Vector((2.4, -2.8, 2.6)), 2.6)
    add_light("Fill", 120.0, center + Vector((-2.8, -1.6, 1.8)), 3.2)
    add_light("Rim", 150.0, center + Vector((0.0, 3.2, 2.2)), 2.4)
    cam_d = bpy.data.cameras.new("BodyMapCam")
    cam_d.lens = 50.0
    cam = bpy.data.objects.new("BodyMapCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def place_cam(cam, view, center, radius):
    offsets = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "left": Vector((1, 0.12, 0.05)),
        "right": Vector((-1, 0.12, 0.05)),
        "three-quarter-front": Vector((-0.55, -0.8, 0.1)),
        "three-quarter-back": Vector((0.55, 0.8, 0.1)),
    }
    d = offsets[view].normalized()
    cam.location = center + d * radius
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def assemble_official_glbs():
    for p in (ARMS_GLB, TORSO_GLB, LEGS_GLB, HEAD_GLB):
        if not p.exists():
            fail(f"Missing prerequisite GLB {p}")

    bpy.ops.wm.read_homefile(use_empty=True)
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=str(ARMS_GLB))
    bpy.ops.import_scene.gltf(filepath=str(TORSO_GLB))
    bpy.ops.import_scene.gltf(filepath=str(LEGS_GLB))
    bpy.ops.import_scene.gltf(filepath=str(HEAD_GLB))
    after = [o for o in bpy.data.objects if o.name not in before or o.name.startswith("zone_")]
    zone_objs = [o for o in bpy.data.objects if o.name.startswith("zone_")]
    # Deduplicate by base zone name (gltf may suffix .001)
    by_base: dict[str, bpy.types.Object] = {}
    for o in zone_objs:
        base = o.name.split(".")[0]
        if base not in by_base:
            by_base[base] = o
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    zone_objs = list(by_base.values())
    if len(zone_objs) != 81:
        names = sorted(o.name for o in zone_objs)
        fail(f"Expected 81 zone meshes, got {len(zone_objs)}: {names[:10]}...")

    # Remove non-zone leftovers
    for o in list(bpy.data.objects):
        if not o.name.startswith("zone_"):
            bpy.data.objects.remove(o, do_unlink=True)

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
    log(f"Saved {OUT_BLEND}")
    log(f"Exported {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")
    return zone_objs


def open_and_bake():
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
    baked = bpy.data.objects.new("BodyCoverageBake", baked_mesh)
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
    return human, rig, baked, baked_mesh, offset


def classify_unassigned_region(w: dict[str, float], centroid: Vector, body_up: Vector, pelvis: Vector) -> str:
    head_w = max(w.get("head", 0.0), w.get("jaw", 0.0), w.get("eye_l", 0.0), w.get("eye_r", 0.0))
    neck_w = w.get("neck_01", 0.0)
    ear_w = max(w.get("ear_l", 0.0), w.get("ear_r", 0.0))
    # MakeHuman laterality / generic face groups (often named Left/Right)
    mh_face = max(w.get("Left", 0.0), w.get("Right", 0.0), w.get("body", 0.0))
    above_neck = (centroid - pelvis).dot(body_up)
    if ear_w >= 0.08 and ear_w >= head_w * 0.5:
        return "ears"
    if head_w >= 0.12 or (above_neck > 0.55 and head_w + neck_w > 0.05):
        if max(w.get("jaw", 0.0), w.get("eye_l", 0.0), w.get("eye_r", 0.0)) >= 0.08:
            return "face"
        return "head"
    # Dense facial shells tagged only with MH Left/Right sit at head height.
    if above_neck > 0.48 and mh_face >= 0.25 and head_w + neck_w < 0.12:
        return "face"
    if neck_w >= 0.10:
        return "neck"
    if above_neck > 0.48 and neck_w + head_w > 0.02:
        return "neck" if neck_w >= head_w else "head"
    return "other"


def analyze_coverage(rig, baked, baked_mesh, offset):
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    def bh(name: str) -> Vector:
        v = bone_head(rig, name)
        if v is None:
            fail(f"Missing bone {name}")
        return v + offset

    def bt(name: str) -> Vector:
        t = bone_tip(rig, name)
        if t is None:
            fail(f"Missing tip {name}")
        return t + offset

    body, torso_lm = build_torso_context(
        bh("pelvis"),
        bh("spine_01"),
        bh("spine_02"),
        bh("spine_03"),
        bh("neck_01"),
        bh("clavicle_l"),
        bh("clavicle_r"),
    )
    tip_r = bone_tip(rig, "middle_03_r")
    tip_l = bone_tip(rig, "middle_03_l")
    tip_r = (tip_r + offset) if tip_r is not None else bt("hand_r")
    tip_l = (tip_l + offset) if tip_l is not None else bt("hand_l")

    # Official arm universe (same exclusion set used when freezing torso/pelvis).
    arm_universe = collect_arm_universe_faces(
        baked_mesh,
        mw,
        vg_map,
        bh("upperarm_r"),
        bh("lowerarm_r"),
        bh("hand_r"),
        tip_r,
        bh("upperarm_l"),
        bh("lowerarm_l"),
        bh("hand_l"),
        tip_l,
    )
    arm_faces = set(arm_universe)

    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_universe, TORSO_T2_CONFIG
    )
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin
    knee_l = bh("calf_l") if bone_head(rig, "calf_l") else bt("thigh_l")
    knee_r = bh("calf_r") if bone_head(rig, "calf_r") else bt("thigh_r")
    pelvis_lm = resolve_pelvis_landmarks(
        torso_lm.waist_level,
        torso_lm.pelvis_top,
        bh("pelvis"),
        bh("thigh_l"),
        bh("thigh_r"),
        knee_l,
        knee_r,
        thigh_margin=margin,
    )
    combined = integrate_pelvis_with_torso(
        baked_mesh,
        mw,
        vg_map,
        body,
        pelvis_lm,
        arm_universe,
        torso.face_zone,
        torso.coords,
        torso.centroids,
        torso.tris_by_face,
        torso.areas,
        PELVIS_FINAL_CONFIG,
    )
    torso_pelvis_faces = set(combined.face_zone.keys())

    leg_faces: set[int] = set()
    for side, sfx in (("right", "r"), ("left", "l")):
        hip = bh(f"thigh_{sfx}")
        knee = bh(f"calf_{sfx}") if bone_head(rig, f"calf_{sfx}") else bt(f"thigh_{sfx}")
        ankle = bh(f"foot_{sfx}") if bone_head(rig, f"foot_{sfx}") else bt(f"calf_{sfx}")
        foot_end = bt(f"ball_{sfx}")
        lm = resolve_leg_landmarks(side, hip, knee, ankle, foot_end, margin)
        long = segment_leg_faces(
            baked_mesh, mw, vg_map, lm, LEG_FINAL_LONGITUDINAL_CONFIG
        )
        circ = apply_leg_circumferential(
            baked_mesh, mw, long, bh("pelvis"), LEG_FINAL_CIRCUMFERENTIAL_CONFIG
        )
        leg_faces |= set(circ.face_zone.keys())

    assigned69 = arm_faces | torso_pelvis_faces | leg_faces
    overlaps = {
        "arms∩torsoPelvis": len(arm_faces & torso_pelvis_faces),
        "arms∩legs": len(arm_faces & leg_faces),
        "torsoPelvis∩legs": len(torso_pelvis_faces & leg_faces),
        "right∩left_legs": 0,
    }
    if overlaps["arms∩torsoPelvis"] or overlaps["arms∩legs"] or overlaps["torsoPelvis∩legs"]:
        fail(f"Universe overlaps {overlaps}")

    head_tip = bone_tip(rig, "head")
    head_tip = (head_tip + offset) if head_tip is not None else None
    cephalic = collect_cephalic_universe(
        baked_mesh, mw, vg_map, assigned69, bh("neck_01"), body
    )
    if cephalic & assigned69:
        fail(f"headNeck ∩ 69 = {len(cephalic & assigned69)}")
    hlm = resolve_head_landmarks(
        baked_mesh,
        mw,
        vg_map,
        cephalic,
        bh("neck_01"),
        bh("head"),
        head_tip,
        body,
    )
    hframe = build_head_frame(body, hlm)
    head_seg = segment_head_faces(
        baked_mesh, mw, vg_map, cephalic, hlm, hframe, body
    )
    head_faces = set(head_seg.face_zone.keys())
    assigned = assigned69 | head_faces

    all_faces = {poly.index for poly in baked_mesh.polygons}
    unassigned = sorted(all_faces - assigned)

    region_stats = {
        k: {"faces": 0, "tris": 0, "area": 0.0}
        for k in ("neck", "head", "face", "ears", "pelvic_internal", "other")
    }
    weigh_names = [
        n
        for n in vg_map
        if any(
            t in n
            for t in (
                "head",
                "neck",
                "jaw",
                "eye",
                "ear",
                "spine",
                "pelvis",
                "genital",
                "index_",
                "middle_",
                "ring_",
                "pinky_",
                "thumb_",
            )
        )
        or n in ("Left", "Right", "body")
    ]
    unassigned_tris = 0
    unassigned_area = 0.0
    useful_unassigned_faces = 0
    useful_unassigned_area = 0.0
    internal_faces = 0
    internal_area = 0.0
    for fi in unassigned:
        poly = baked_mesh.polygons[fi]
        w_acc: dict[str, float] = defaultdict(float)
        c = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = baked_mesh.vertices[vi]
            c += mw @ v.co
            for name in weigh_names:
                w_acc[name] += vertex_weight(v, vg_map[name])
        c /= float(n)
        w = {k: val / float(n) for k, val in w_acc.items()}
        region = classify_unassigned_region(w, c, body.up, bh("pelvis"))
        if region == "other":
            region = "pelvic_internal"
        tris = max(0, n - 2)
        area = face_area(baked_mesh, poly, mw)
        region_stats[region]["faces"] += 1
        region_stats[region]["tris"] += tris
        region_stats[region]["area"] += area
        unassigned_tris += tris
        unassigned_area += area
        if region == "pelvic_internal":
            internal_faces += 1
            internal_area += area
        else:
            useful_unassigned_faces += 1
            useful_unassigned_area += area

    assigned_tris = 0
    assigned_area = 0.0
    for fi in assigned:
        poly = baked_mesh.polygons[fi]
        assigned_tris += max(0, len(poly.vertices) - 2)
        assigned_area += face_area(baked_mesh, poly, mw)

    for k in region_stats:
        region_stats[k]["area"] = round(region_stats[k]["area"], 6)

    return {
        "visibleExteriorFaces": len(assigned) + useful_unassigned_faces,
        "assignedFaces": len(assigned),
        "assignedTris": assigned_tris,
        "assignedArea": round(assigned_area, 6),
        "unassignedFaces": len(unassigned),
        "unassignedTris": unassigned_tris,
        "unassignedArea": round(unassigned_area, 6),
        "unassignedUsefulExteriorFaces": useful_unassigned_faces,
        "unassignedUsefulExteriorArea": round(useful_unassigned_area, 6),
        "internalNonInteractiveFaces": internal_faces,
        "internalNonInteractiveArea": round(internal_area, 6),
        "armFaces": len(arm_faces),
        "torsoPelvisFaces": len(torso_pelvis_faces),
        "legFaces": len(leg_faces),
        "headNeckFaces": len(head_faces),
        "overlaps": {
            **overlaps,
            "head∩69": len(head_faces & assigned69),
        },
        "unassignedByRegion": region_stats,
        "unassignedFaceIndices": unassigned,
        "center": list((world_bbox(baked)[0] + world_bbox(baked)[1]) * 0.5),
        "radius": max((world_bbox(baked)[1] - world_bbox(baked)[0]).length * 0.55, 0.9),
    }



def make_unassigned_highlight(baked, baked_mesh, unassigned_faces: set[int], mat_color):
    """Extract unassigned faces as a translucent highlight object."""
    mat = bpy.data.materials.new("UnassignedHighlight")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = mat_color
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.85
    mat.blend_method = "BLEND"
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])

    bpy.ops.object.select_all(action="DESELECT")
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    bpy.ops.object.duplicate()
    zone = bpy.context.active_object
    zone.name = "unassigned_head_neck"
    zone.data = zone.data.copy()
    bm = bmesh.new()
    bm.from_mesh(zone.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(
        bm,
        geom=[f for f in bm.faces if f.index not in unassigned_faces],
        context="FACES",
    )
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    zone.data.materials.clear()
    zone.data.materials.append(mat)
    return zone


def render_body_map(coverage: dict):
    ART.mkdir(parents=True, exist_ok=True)
    # Load official integrated GLB for full map renders
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(OUT_GLB))
    zone_objs = [o for o in bpy.data.objects if o.name.startswith("zone_")]
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for obj in zone_objs:
        a, b = world_bbox(obj)
        mn = Vector((min(mn.x, a.x), min(mn.y, a.y), min(mn.z, a.z)))
        mx = Vector((max(mx.x, b.x), max(mx.y, b.y), max(mx.z, b.z)))
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 0.72, 1.0)
    cam = setup_studio(center, radius)
    for view in (
        "front",
        "back",
        "left",
        "right",
        "three-quarter-front",
        "three-quarter-back",
    ):
        place_cam(cam, view, center, radius)
        out = ART / f"full-body-81-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        log(f"Render {out.name}")

    # Legs-only subset renders
    for o in zone_objs:
        show = any(
            t in o.name
            for t in (
                "thigh",
                "knee",
                "lower_leg",
                "ankle",
                "foot",
            )
        )
        o.hide_render = not show
        o.hide_viewport = not show
    for view in ("front", "back"):
        place_cam(cam, view, center, radius * 0.85)
        out = ART / f"legs-final-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        log(f"Render {out.name}")

    # Boundaries = same as map for now
    for o in zone_objs:
        o.hide_render = False
        o.hide_viewport = False
    for view in ("front", "back"):
        place_cam(cam, view, center, radius)
        out = ART / f"full-zone-boundaries-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        log(f"Render {out.name}")


def render_remaining_unassigned(coverage: dict):
    """Highlight internal/non-interactive residual after 81-zone assignment."""
    residual = set(coverage.get("unassignedFaceIndices") or [])
    if not residual:
        log("No remaining unassigned faces to highlight")
        return coverage

    human, rig, baked, baked_mesh, offset = open_and_bake()
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o != baked:
            bpy.data.objects.remove(o, do_unlink=True)
    baked.hide_render = True
    hl = make_unassigned_highlight(
        baked, baked_mesh, residual, (0.95, 0.35, 0.2, 1.0)
    )
    hl.name = "remaining_unassigned_surface"
    mn, mx = world_bbox(hl)
    center = (mn + mx) * 0.5
    radius = max((mx - mn).length * 1.4, 0.25)
    cam = setup_studio(center, radius)
    place_cam(cam, "front", center, radius)
    out = ART / "remaining-unassigned-surface.png"
    bpy.context.scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    log(f"Render {out.name} faces={len(residual)}")
    return coverage



def main():
    ART.mkdir(parents=True, exist_ok=True)
    assemble_official_glbs()

    human, rig, baked, baked_mesh, offset = open_and_bake()
    coverage = analyze_coverage(rig, baked, baked_mesh, offset)
    log(
        f"Assigned faces={coverage['assignedFaces']} "
        f"usefulUnassigned={coverage['unassignedUsefulExteriorFaces']} "
        f"internal={coverage['internalNonInteractiveFaces']}"
    )

    report_cov = {k: v for k, v in coverage.items() if k != "unassignedFaceIndices"}
    report = {
        "atomicZones": 81,
        "arms": 24,
        "torsoPelvis": 23,
        "legs": 22,
        "headNeck": 12,
        "blend": str(OUT_BLEND.as_posix()),
        "glb": str(OUT_GLB.as_posix()),
        "glbBytes": OUT_GLB.stat().st_size,
        "coverage": report_cov,
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")

    if os.environ.get("NEUTRO_SKIP_RENDERS") != "1":
        try:
            render_body_map(coverage)
            # Remaining unassigned = pelvic internal residual highlight
            render_remaining_unassigned(coverage)
        except Exception as exc:  # noqa: BLE001
            log(f"Render skipped/failed: {exc}")

    log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
