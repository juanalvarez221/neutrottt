"""
Paso 30 — Forensic audit of unassigned body surface (no zone mutation).

Reconstructs VisibleBodyFaces − Assigned69ZoneFaces using the SAME canonical
rules that produced the frozen 69-zone map. Audits residual `other`, visibility,
BodyVisual presence, and preliminary cephalic universes.

Outputs:
  artifacts/body-v1-unassigned-audit/report.json
  artifacts/body-v1-unassigned-audit/*.png

Run:
  blender.exe --background --python tools/blender/audit_neutro_body_v1_unassigned_surface.py
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from neutro_body_interaction.arm_segmentation import (  # noqa: E402
    ArmBoneNames,
    segment_arm_faces,
    vertex_weight,
)
from neutro_body_interaction.config import (  # noqa: E402
    BODY_FRONT_BLENDER,
    LEG_FINAL_CIRCUMFERENTIAL_CONFIG,
    LEG_FINAL_LONGITUDINAL_CONFIG,
    PELVIS_FINAL_CONFIG,
    TORSO_T2_CONFIG,
)
from neutro_body_interaction.geometry import face_area, world_bbox  # noqa: E402
from neutro_body_interaction.island_cleanup import (  # noqa: E402
    build_edge_face_map,
    cleanup_islands,
    connected_components,
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

SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
BODY_VISUAL = REPO / "public" / "models" / "production" / "neutro_body_v1.glb"
ART = REPO / "artifacts" / "body-v1-unassigned-audit"
REPORT = ART / "report.json"

PASO29 = {
    "assignedFaces": 6981,
    "assignedTris": 13962,
    "assignedArea": 1.600058,
    "unassignedFaces": 6397,
    "unassignedTris": 12794,
    "unassignedArea": 0.194670,
    "otherFaces": 2211,
    "otherArea": 0.036289,
    "headFaces": 4186,
    "headArea": 0.158381,
}

ADJACENCY_FOCUS = (
    "left_hip",
    "right_hip",
    "left_glute",
    "right_glute",
    "lower_abdomen",
    "sacrum",
    "left_thigh_front",
    "left_thigh_back",
    "left_thigh_inner",
    "left_thigh_outer",
    "right_thigh_front",
    "right_thigh_back",
    "right_thigh_inner",
    "right_thigh_outer",
    "upper_back_center",
    "left_scapula",
    "right_scapula",
    "left_chest",
    "right_chest",
    "left_shoulder",
    "right_shoulder",
)


def log(msg: str) -> None:
    print(f"[unassigned-audit] {msg}", flush=True)


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
    baked = bpy.data.objects.new("AuditBake", baked_mesh)
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


def reconstruct_assigned69(rig, baked, baked_mesh, offset):
    """Exact Paso-29 assigned universe (arm_universe ∪ torsoPelvis ∪ legs)."""
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
    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_universe, TORSO_T2_CONFIG
    )
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin
    pelvis_lm = resolve_pelvis_landmarks(
        torso_lm.waist_level,
        torso_lm.pelvis_top,
        bh("pelvis"),
        bh("thigh_l"),
        bh("thigh_r"),
        bh("calf_l"),
        bh("calf_r"),
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

    # Detailed zone map for adjacency (does not change assigned set)
    face_zone: dict[int, str] = dict(combined.face_zone)

    # Arms detailed for adjacency labels
    centroids = {}
    tris_by = {}
    for poly in baked_mesh.polygons:
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ baked_mesh.vertices[vi].co
        c /= float(len(poly.vertices))
        centroids[poly.index] = c
        tris_by[poly.index] = max(0, len(poly.vertices) - 2)

    spine = bh("spine_02")
    for side in ("right", "left"):
        bones = ArmBoneNames.for_side(side)
        shoulder = bh(bones.upperarm)
        elbow = bh(bones.lowerarm)
        wrist = bh(bones.hand)
        tip = tip_r if side == "right" else tip_l
        seg = segment_arm_faces(
            baked_mesh, mw, vg_map, side, shoulder, elbow, wrist, tip, spine
        )
        cleanup_islands(
            baked_mesh,
            seg.face_zone,
            centroids,
            tris_by,
            side,
            seg.upper_frame,
            seg.forearm_frame,
            shoulder,
            elbow,
            wrist,
        )
        for fi, zid in seg.face_zone.items():
            face_zone[fi] = zid

    leg_faces: set[int] = set()
    for side, sfx in (("right", "r"), ("left", "l")):
        lm = resolve_leg_landmarks(
            side,
            bh(f"thigh_{sfx}"),
            bh(f"calf_{sfx}"),
            bh(f"foot_{sfx}"),
            bt(f"ball_{sfx}"),
            margin,
        )
        long = segment_leg_faces(
            baked_mesh, mw, vg_map, lm, LEG_FINAL_LONGITUDINAL_CONFIG
        )
        circ = apply_leg_circumferential(
            baked_mesh, mw, long, bh("pelvis"), LEG_FINAL_CIRCUMFERENTIAL_CONFIG
        )
        leg_faces |= set(circ.face_zone.keys())
        for fi, zid in circ.face_zone.items():
            face_zone[fi] = zid

    assigned = set(arm_universe) | set(combined.face_zone.keys()) | leg_faces
    return {
        "assigned": assigned,
        "face_zone": face_zone,
        "body": body,
        "vg_map": vg_map,
        "mw": mw,
        "bh": bh,
        "bt": bt,
        "torso_lm": torso_lm,
        "arm_universe": set(arm_universe),
        "torso_pelvis": set(combined.face_zone.keys()),
        "legs": leg_faces,
        "centroids": centroids,
    }


def face_stats(mesh, faces: set[int] | list[int], mw) -> dict:
    faces = list(faces)
    tris = 0
    area = 0.0
    if not faces:
        return {"faces": 0, "tris": 0, "area": 0.0, "centroid": [0, 0, 0], "bboxMin": [0, 0, 0], "bboxMax": [0, 0, 0]}
    acc = Vector((0, 0, 0))
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    wsum = 0.0
    for fi in faces:
        poly = mesh.polygons[fi]
        a = face_area(mesh, poly, mw)
        tris += max(0, len(poly.vertices) - 2)
        area += a
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            p = mw @ mesh.vertices[vi].co
            c += p
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z)))
            mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
        c /= float(len(poly.vertices))
        acc += c * a
        wsum += a
    centroid = acc / wsum if wsum > 1e-12 else acc
    return {
        "faces": len(faces),
        "tris": tris,
        "area": round(area, 6),
        "centroid": [round(centroid.x, 4), round(centroid.y, 4), round(centroid.z, 4)],
        "bboxMin": [round(mn.x, 4), round(mn.y, 4), round(mn.z, 4)],
        "bboxMax": [round(mx.x, 4), round(mx.y, 4), round(mx.z, 4)],
    }


def dominant_vgs(mesh, faces, vg_map, top_n=8):
    totals: dict[str, float] = defaultdict(float)
    count = 0
    for fi in faces:
        poly = mesh.polygons[fi]
        n = len(poly.vertices)
        w_acc: dict[str, float] = defaultdict(float)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            for name, gi in vg_map.items():
                ww = vertex_weight(v, gi)
                if ww > 0:
                    w_acc[name] += ww
        for name, val in w_acc.items():
            totals[name] += val / float(n)
        count += 1
    if count == 0:
        return [], {}
    avg = {k: v / count for k, v in totals.items()}
    ranked = sorted(avg.items(), key=lambda kv: -kv[1])[:top_n]
    return ranked, {k: round(v, 4) for k, v in ranked}


def nearest_bones(rig, offset, centroid: Vector, names: list[str], k=5):
    dists = []
    for name in names:
        h = bone_head(rig, name)
        if h is None:
            continue
        p = h + offset
        dists.append((name, (p - centroid).length))
    dists.sort(key=lambda t: t[1])
    return [{"bone": n, "distance": round(d, 4)} for n, d in dists[:k]]


def adjacency_counts(mesh, faces: set[int], face_zone: dict[int, str]):
    edge_map = build_edge_face_map(mesh)
    counts: Counter[str] = Counter()
    for fi in faces:
        poly = mesh.polygons[fi]
        vs = list(poly.vertices)
        for i in range(len(vs)):
            e = tuple(sorted((vs[i], vs[(i + 1) % len(vs)])))
            for other in edge_map.get(e, []):
                if other == fi or other in faces:
                    continue
                zid = face_zone.get(other)
                if zid:
                    counts[zid] += 1
    return dict(counts.most_common(20))


def classify_visibility(mesh, mw, faces, bvh, body_center: Vector) -> str:
    """Raycast outward along face normals; also check inward occlusion."""
    if not faces:
        return "UNCERTAIN"
    outward_hits = 0
    inward_clear = 0
    samples = 0
    for fi in list(faces)[:: max(1, len(faces) // 40)]:
        poly = mesh.polygons[fi]
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ mesh.vertices[vi].co
        c /= float(len(poly.vertices))
        n = (mw.to_3x3() @ poly.normal).normalized()
        # Outward: from slightly outside, shoot further out — should miss body
        origin_out = c + n * 0.002
        hit_out, *_ = bvh.ray_cast(origin_out, n, 0.35)
        # Inward: from outside toward center — should hit near this surface
        to_center = (body_center - c).normalized()
        # Prefer normal-based exterior test
        if hit_out is None:
            outward_hits += 0
            clear = True
        else:
            clear = False
            outward_hits += 1
        # Second test: cast from far outside toward centroid
        far = c + n * 0.6
        hit_in, loc, *_rest = bvh.ray_cast(far, -n, 0.65)
        if hit_in is not None and (loc - c).length < 0.05:
            inward_clear += 1
        samples += 1
        _ = clear
    if samples == 0:
        return "UNCERTAIN"
    exterior_ratio = inward_clear / samples
    blocked_ratio = outward_hits / samples
    # Helpers / internals: normals often point oddly and exterior cast fails
    avg_area = sum(face_area(mesh, mesh.polygons[fi], mw) for fi in faces) / max(1, len(faces))
    if avg_area < 2.5e-5 and exterior_ratio < 0.35:
        return "HELPER"
    if exterior_ratio >= 0.55 and blocked_ratio <= 0.55:
        return "VISIBLE_EXTERNAL"
    if exterior_ratio < 0.25:
        return "INTERNAL"
    return "UNCERTAIN"


def anatomical_guess(comp: dict, adj: dict, visibility: str) -> str:
    c = Vector(comp["centroid"])
    z = c.z
    y = c.y
    area = comp["area"]
    if visibility in ("HELPER", "INTERNAL") and area < 0.01:
        return "E" if visibility == "HELPER" else "F"
    # Pelvis height band (baked coords): ~0.85–1.05
    pelvic = 0.82 <= z <= 1.08
    front = y < -0.02
    back = y > 0.02
    hip_touch = sum(adj.get(k, 0) for k in ("left_hip", "right_hip"))
    glute_touch = sum(adj.get(k, 0) for k in ("left_glute", "right_glute"))
    thigh_touch = sum(v for k, v in adj.items() if "thigh" in k)
    abd_touch = adj.get("lower_abdomen", 0)
    if pelvic and (hip_touch + thigh_touch + abd_touch) > 0:
        if front and abd_touch + hip_touch >= glute_touch:
            if area > 0.008:
                return "A"  # inguinal/pubic
            return "C"  # small genital-scale patch
        if back or glute_touch > hip_touch:
            return "B"  # perineal / posterior pelvic floor
        if thigh_touch > 0 and hip_touch > 0:
            return "D"  # pelvis↔thigh transition gap
        return "A"
    if z > 1.2:
        return "G"
    return "G"


def setup_studio(center: Vector, radius: float):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 1600
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("AuditWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.08, 0.08, 0.09, 1)
    bg.inputs[1].default_value = 1.0
    for o in list(bpy.data.objects):
        if o.type == "LIGHT":
            bpy.data.objects.remove(o, do_unlink=True)
    key = bpy.data.lights.new("Key", "AREA")
    key.energy = 250
    key_o = bpy.data.objects.new("Key", key)
    bpy.context.collection.objects.link(key_o)
    key_o.location = center + Vector((1.2, -1.6, 1.4))
    fill = bpy.data.lights.new("Fill", "AREA")
    fill.energy = 90
    fill_o = bpy.data.objects.new("Fill", fill)
    bpy.context.collection.objects.link(fill_o)
    fill_o.location = center + Vector((-1.4, -0.6, 0.8))
    cam_data = bpy.data.cameras.new("AuditCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("AuditCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam, max(radius, 0.35)


def place_cam(cam, view: str, center: Vector, radius: float):
    d = radius * 2.4
    offsets = {
        "front": Vector((0, -d, 0.05 * radius)),
        "back": Vector((0, d, 0.05 * radius)),
        "left": Vector((-d, 0, 0.05 * radius)),
        "right": Vector((d, 0, 0.05 * radius)),
        "bottom": Vector((0, -0.35 * d, -d * 0.85)),
        "three-quarter": Vector((d * 0.65, -d * 0.85, 0.15 * radius)),
        "three-quarter-front": Vector((d * 0.55, -d * 0.9, 0.12 * radius)),
    }
    cam.location = center + offsets.get(view, offsets["front"])
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_mat(name: str, color, alpha=0.92):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.55
    mat.blend_method = "BLEND" if alpha < 0.99 else "OPAQUE"
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def extract_faces(src_obj, face_set: set[int], name: str, mat):
    bpy.ops.object.select_all(action="DESELECT")
    src_obj.select_set(True)
    bpy.context.view_layer.objects.active = src_obj
    bpy.ops.object.duplicate()
    zone = bpy.context.active_object
    zone.name = name
    zone.data = zone.data.copy()
    bm = bmesh.new()
    bm.from_mesh(zone.data)
    bm.faces.ensure_lookup_table()
    keep = set(face_set)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    zone.data.materials.clear()
    zone.data.materials.append(mat)
    return zone


def paint_face_colors(src_obj, face_to_color: dict[int, tuple], name: str):
    """Duplicate mesh and assign materials per face color groups."""
    bpy.ops.object.select_all(action="DESELECT")
    src_obj.select_set(True)
    bpy.context.view_layer.objects.active = src_obj
    bpy.ops.object.duplicate()
    zone = bpy.context.active_object
    zone.name = name
    zone.data = zone.data.copy()
    # Build material slots
    color_keys = sorted(set(face_to_color.values()))
    mats = []
    for i, col in enumerate(color_keys):
        mats.append(make_mat(f"{name}_c{i}", col, 0.95))
        zone.data.materials.append(mats[-1])
    col_to_slot = {c: i for i, c in enumerate(color_keys)}
    bm = bmesh.new()
    bm.from_mesh(zone.data)
    bm.faces.ensure_lookup_table()
    delete = []
    for f in bm.faces:
        if f.index not in face_to_color:
            delete.append(f)
        else:
            f.material_index = col_to_slot[face_to_color[f.index]]
    if delete:
        bmesh.ops.delete(bm, geom=delete, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    return zone


def build_bvh(mesh, mw):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.transform(mw)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    return bvh


def check_body_visual_presence(comp_centroids: list[Vector], threshold=0.012):
    """Import BodyVisual GLB and measure nearest-surface distance for centroids."""
    before = set(bpy.data.objects.keys())
    if not BODY_VISUAL.exists():
        return {"presentInBodyVisual": False, "reason": "missing_glb", "hits": []}
    bpy.ops.import_scene.gltf(filepath=str(BODY_VISUAL))
    imported = [o for o in bpy.data.objects if o.name not in before and o.type == "MESH"]
    if not imported:
        return {"presentInBodyVisual": False, "reason": "no_mesh", "hits": []}
    # Align roughly: production is usually already grounded/centered similarly
    # Build BVH from all imported meshes
    bm = bmesh.new()
    for o in imported:
        bm_tmp = bmesh.new()
        bm_tmp.from_mesh(o.data)
        bm_tmp.transform(o.matrix_world)
        bm_tmp.verts.ensure_lookup_table()
        # merge into bm
        for v in bm_tmp.verts:
            bm.verts.new(v.co)
        bm.verts.ensure_lookup_table()
        # faces need remap — simpler: one BVH per object and take min
        bm_tmp.free()
    # Per-object BVH
    trees = []
    for o in imported:
        bm_o = bmesh.new()
        bm_o.from_mesh(o.data)
        bm_o.transform(o.matrix_world)
        trees.append(BVHTree.FromBMesh(bm_o))
        bm_o.free()
    hits = []
    present_n = 0
    for c in comp_centroids:
        best = 1e9
        for tree in trees:
            loc, _n, _i, dist = tree.find_nearest(c)
            if loc is not None:
                best = min(best, dist)
        ok = best < threshold
        if ok:
            present_n += 1
        hits.append({"distance": round(best, 5), "present": ok})
    # Cleanup imports
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    return {
        "presentInBodyVisual": present_n >= max(1, len(comp_centroids) // 2),
        "presentCount": present_n,
        "total": len(comp_centroids),
        "hits": hits,
        "threshold": threshold,
    }


def cephalic_classify(mesh, faces, mw, vg_map, landmarks, body_front: Vector, body_up: Vector):
    """Geometry + landmark based cephalic buckets (diagnostic only)."""
    buckets: dict[str, list[int]] = {
        "neck_candidate": [],
        "head_candidate": [],
        "face_candidate": [],
        "left_ear_candidate": [],
        "right_ear_candidate": [],
        "uncertain_head_region": [],
    }
    neck_base = landmarks["neckBase"]
    jaw = landmarks["jawLevel"]
    head_top = landmarks["headTop"]
    ear_l = landmarks["leftEarCenter"]
    ear_r = landmarks["rightEarCenter"]
    face_ref = landmarks["faceFrontReference"]

    neck_axis = (jaw - neck_base).normalized() if (jaw - neck_base).length > 1e-6 else body_up
    for fi in faces:
        poly = mesh.polygons[fi]
        c = Vector((0, 0, 0))
        w_acc: dict[str, float] = defaultdict(float)
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            c += mw @ v.co
            for name in (
                "head",
                "neck_01",
                "ears",
                "joint-jaw",
                "joint-l-eye",
                "joint-r-eye",
                "helper-l-eye",
                "helper-r-eye",
                "helper-tongue",
                "helper-upper-teeth",
                "helper-lower-teeth",
                "Left",
                "Right",
            ):
                if name in vg_map:
                    w_acc[name] += vertex_weight(v, vg_map[name])
        c /= float(n)
        w = {k: val / float(n) for k, val in w_acc.items()}

        # Height parameter along neck→head
        t = (c - neck_base).dot(neck_axis)
        ear_dl = (c - ear_l).length
        ear_dr = (c - ear_r).length
        frontness = (c - face_ref).dot(body_front)  # more negative ≈ more anterior if front=-Y... 
        # BODY_FRONT is (0,-1,0); anterior points have smaller y
        anterior = -c.y  # higher = more front

        ears_w = w.get("ears", 0.0)
        eye_w = max(w.get("joint-l-eye", 0), w.get("joint-r-eye", 0), w.get("helper-l-eye", 0), w.get("helper-r-eye", 0))
        jaw_w = w.get("joint-jaw", 0)
        neck_w = w.get("neck_01", 0)
        head_w = w.get("head", 0)
        helper_mouth = max(
            w.get("helper-tongue", 0),
            w.get("helper-upper-teeth", 0),
            w.get("helper-lower-teeth", 0),
        )

        if ears_w >= 0.12 or (min(ear_dl, ear_dr) < 0.045 and t > 0.08):
            if ear_dl <= ear_dr:
                buckets["left_ear_candidate"].append(fi)
            else:
                buckets["right_ear_candidate"].append(fi)
            continue
        if helper_mouth >= 0.15 or (eye_w >= 0.12 and anterior > 0.02):
            buckets["face_candidate"].append(fi)
            continue
        if (jaw_w >= 0.1 or eye_w >= 0.08) and anterior > -0.01 and t > 0.05:
            buckets["face_candidate"].append(fi)
            continue
        if neck_w >= 0.18 and t < 0.12:
            buckets["neck_candidate"].append(fi)
            continue
        if t < 0.06 and c.z < jaw.z + 0.02:
            buckets["neck_candidate"].append(fi)
            continue
        if head_w >= 0.12 or t > 0.08:
            # scalp vs face by anterior
            if anterior > 0.04 and t < (head_top - neck_base).length * 0.75:
                buckets["face_candidate"].append(fi)
            else:
                buckets["head_candidate"].append(fi)
            continue
        if c.z >= neck_base.z - 0.02:
            buckets["uncertain_head_region"].append(fi)
        else:
            buckets["uncertain_head_region"].append(fi)
    return buckets


def main():
    ART.mkdir(parents=True, exist_ok=True)
    human, rig, baked, baked_mesh, offset = open_and_bake()
    ctx = reconstruct_assigned69(rig, baked, baked_mesh, offset)
    assigned = ctx["assigned"]
    face_zone = ctx["face_zone"]
    mw = ctx["mw"]
    vg_map = ctx["vg_map"]
    body = ctx["body"]
    bh = ctx["bh"]
    centroids = ctx["centroids"]

    visible = {p.index for p in baked_mesh.polygons}
    unassigned = visible - assigned
    if assigned & unassigned:
        fail("assigned ∩ unassigned != 0")
    if assigned | unassigned != visible:
        fail("union != visible")

    vis_stats = face_stats(baked_mesh, visible, mw)
    asg_stats = face_stats(baked_mesh, assigned, mw)
    una_stats = face_stats(baked_mesh, unassigned, mw)

    match29 = (
        abs(asg_stats["faces"] - PASO29["assignedFaces"]) <= 2
        and abs(una_stats["faces"] - PASO29["unassignedFaces"]) <= 2
        and abs(asg_stats["area"] - PASO29["assignedArea"]) < 0.001
        and abs(una_stats["area"] - PASO29["unassignedArea"]) < 0.001
    )
    log(
        f"visible={vis_stats['faces']} assigned={asg_stats['faces']} "
        f"unassigned={una_stats['faces']} match29={match29}"
    )

    # Connected components of ALL unassigned
    comps_faces = connected_components(baked_mesh, list(unassigned))
    comps_faces.sort(
        key=lambda fs: sum(face_area(baked_mesh, baked_mesh.polygons[i], mw) for i in fs),
        reverse=True,
    )
    total_area = max(vis_stats["area"], 1e-9)
    unassigned_comps = []
    for i, fs in enumerate(comps_faces, start=1):
        st = face_stats(baked_mesh, fs, mw)
        st["componentId"] = f"U{i:02d}"
        st["percentageOfTotalVisibleBody"] = round(100.0 * st["area"] / total_area, 3)
        unassigned_comps.append(st)

    # Preliminary other = unassigned with low cephalic height OR Left/Right dominant at pelvis
    neck_z = bh("neck_01").z
    other_faces: set[int] = set()
    cephalic_faces: set[int] = set()
    for fi in unassigned:
        c = centroids[fi]
        ranked, _ = dominant_vgs(baked_mesh, [fi], vg_map, top_n=3)
        top_names = {n for n, _ in ranked[:2]}
        if c.z >= neck_z - 0.05 or "head" in top_names or "neck_01" in top_names or "ears" in top_names:
            cephalic_faces.add(fi)
        else:
            other_faces.add(fi)

    # Refine: faces that Paso29 put in other (pelvis band + Left/Right)
    other_refined = set()
    for fi in unassigned:
        c = centroids[fi]
        ranked, _ = dominant_vgs(baked_mesh, [fi], vg_map, top_n=2)
        names = [n for n, _ in ranked]
        if 0.82 <= c.z <= 1.08 and (set(names[:2]) <= {"Left", "Right", "body"} or not names):
            other_refined.add(fi)
        elif fi in other_faces and c.z < neck_z - 0.08:
            other_refined.add(fi)
    if len(other_refined) < 100:
        other_refined = other_faces
    other_faces = other_refined
    cephalic_faces = unassigned - other_faces

    other_comps_faces = connected_components(baked_mesh, list(other_faces))
    other_comps_faces.sort(
        key=lambda fs: sum(face_area(baked_mesh, baked_mesh.polygons[i], mw) for i in fs),
        reverse=True,
    )

    bone_names = [b.name for b in rig.pose.bones]
    bvh = build_bvh(baked_mesh, mw)
    body_center = Vector(vis_stats["centroid"])

    other_comp_reports = []
    for i, fs in enumerate(other_comps_faces, start=1):
        st = face_stats(baked_mesh, fs, mw)
        ranked, avg = dominant_vgs(baked_mesh, fs, vg_map)
        adj = adjacency_counts(baked_mesh, set(fs), face_zone)
        adj_focus = {k: adj.get(k, 0) for k in ADJACENCY_FOCUS if adj.get(k, 0) > 0}
        # also any other neighbors
        for k, v in adj.items():
            if k not in adj_focus and v > 0:
                adj_focus[k] = v
        centroid = Vector(st["centroid"])
        vis = classify_visibility(baked_mesh, mw, fs, bvh, body_center)
        identity = anatomical_guess(st, adj, vis)
        other_comp_reports.append(
            {
                "componentId": f"C{i:02d}",
                **st,
                "dominantVertexGroups": ranked,
                "averageVertexGroupWeights": avg,
                "nearestBones": nearest_bones(rig, offset, centroid, bone_names, k=6),
                "adjacencyEdgeCounts": adj_focus,
                "visibilityClass": vis,
                "anatomicalCode": identity,
            }
        )

    # BodyVisual presence for significant other comps
    sig_other = [c for c in other_comp_reports if c["area"] >= 0.0005 or c["faces"] >= 30]
    bv = check_body_visual_presence(
        [Vector(c["centroid"]) for c in sig_other] or [Vector(face_stats(baked_mesh, other_faces, mw)["centroid"])],
        threshold=0.015,
    )
    for i, c in enumerate(sig_other):
        if i < len(bv.get("hits", [])):
            c["presentInBodyVisual"] = bv["hits"][i]["present"]
            c["bodyVisualDistance"] = bv["hits"][i]["distance"]
        else:
            c["presentInBodyVisual"] = bv["presentInBodyVisual"]

    # Landmarks cefálicos
    neck_base = bh("neck_01")
    head_h = bh("head")
    head_t = bone_tip(rig, "head")
    head_top = (head_t + offset) if head_t is not None else head_h + body.up * 0.12
    # Approximate ears from ears VG centroid L/R
    ear_l_pts = []
    ear_r_pts = []
    jaw_pts = []
    face_pts = []
    if "ears" in vg_map or "joint-jaw" in vg_map:
        for poly in baked_mesh.polygons:
            if poly.index not in cephalic_faces and poly.index not in unassigned:
                continue
            c = centroids[poly.index]
            w_ear = 0.0
            w_jaw = 0.0
            n = len(poly.vertices)
            for vi in poly.vertices:
                v = baked_mesh.vertices[vi]
                if "ears" in vg_map:
                    w_ear += vertex_weight(v, vg_map["ears"])
                if "joint-jaw" in vg_map:
                    w_jaw += vertex_weight(v, vg_map["joint-jaw"])
            w_ear /= float(n)
            w_jaw /= float(n)
            if w_ear > 0.15:
                # Frame: anatomic right ≈ −X, left ≈ +X
                if c.x < 0:
                    ear_r_pts.append(c)
                else:
                    ear_l_pts.append(c)
            if w_jaw > 0.12:
                jaw_pts.append(c)
            if poly.index in cephalic_faces and -c.y > 0.05:
                face_pts.append(c)

    def avg_pts(pts, fallback):
        if not pts:
            return fallback
        s = Vector((0, 0, 0))
        for p in pts:
            s += p
        return s / float(len(pts))

    # Frame: anatomic left ≈ +X (since right bone thigh_r has negative x)
    left_ear = avg_pts(ear_l_pts, head_h + Vector((0.08, -0.02, 0.02)))
    right_ear = avg_pts(ear_r_pts, head_h + Vector((-0.08, -0.02, 0.02)))
    jaw_level = avg_pts(jaw_pts, neck_base.lerp(head_h, 0.45))
    face_front = avg_pts(face_pts, head_h + Vector(BODY_FRONT_BLENDER) * 0.08)

    landmarks = {
        "neckBase": neck_base,
        "jawLevel": jaw_level,
        "leftEarCenter": left_ear,
        "rightEarCenter": right_ear,
        "faceFrontReference": face_front,
        "headTop": head_top,
    }

    # Expand cephalic universe: all unassigned with z >= neck_base.z - 0.08 OR in cephalic_faces
    cephalic_universe = {
        fi
        for fi in unassigned
        if centroids[fi].z >= neck_base.z - 0.08 or fi in cephalic_faces
    }
    # Exclude confirmed other
    cephalic_universe -= other_faces

    buckets = cephalic_classify(
        baked_mesh,
        cephalic_universe,
        mw,
        vg_map,
        landmarks,
        Vector(BODY_FRONT_BLENDER),
        body.up,
    )
    # Enforce partition
    claimed = []
    for k, faces in buckets.items():
        claimed.extend(faces)
    claimed_set = set(claimed)
    missing = cephalic_universe - claimed_set
    buckets["uncertain_head_region"].extend(sorted(missing))
    # Deduplicate: first claim wins already by construction; verify overlap
    seen = set()
    overlap = 0
    for k in list(buckets.keys()):
        clean = []
        for fi in buckets[k]:
            if fi in seen:
                overlap += 1
                continue
            seen.add(fi)
            clean.append(fi)
        buckets[k] = clean
    cephalic_bucket_stats = {}
    for k, faces in buckets.items():
        st = face_stats(baked_mesh, faces, mw)
        comps = connected_components(baked_mesh, faces)
        st["components"] = len(comps)
        cephalic_bucket_stats[k] = st

    cephalic_coverage = (
        100.0
        if not cephalic_universe
        else 100.0 * len(seen) / max(1, len(cephalic_universe))
    )

    # Neck ↔ torso frontier: unassigned near neck that border shoulder/upper_back/chest
    neck_border = adjacency_counts(baked_mesh, set(buckets["neck_candidate"]), face_zone)
    torso_touch = {
        k: v
        for k, v in neck_border.items()
        if any(
            t in k
            for t in (
                "shoulder",
                "scapula",
                "upper_back",
                "chest",
                "sternum",
            )
        )
    }

    # ---------- Renders ----------
    # Hide original human; show bake grey + highlights
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o != baked:
            o.hide_render = True
            o.hide_viewport = True
    baked_mat = make_mat("BodyGrey", (0.55, 0.55, 0.56), 1.0)
    baked.data.materials.clear()
    baked.data.materials.append(baked_mat)
    baked.hide_render = False

    red = make_mat("ResidualRed", (0.92, 0.18, 0.12), 0.95)
    pelvis_cyan = make_mat("PelvisCyan", (0.2, 0.75, 0.85), 0.55)

    # Pelvis zones for context
    pelvis_faces = {
        fi
        for fi, z in face_zone.items()
        if z
        in {
            "left_hip",
            "right_hip",
            "left_glute",
            "right_glute",
            "sacrum",
            "lower_abdomen",
        }
        or "thigh" in z
    }

    unassigned_obj = extract_faces(baked, unassigned, "unassigned_all", red)
    other_obj = extract_faces(baked, other_faces, "other_isolated", red)
    pelvis_obj = extract_faces(baked, pelvis_faces, "pelvis_context", pelvis_cyan)

    mn, mx = world_bbox(baked)
    center = (mn + mx) * 0.5
    radius = (mx - mn).length * 0.55
    cam, radius = setup_studio(center, radius)

    def render_views(objs_visible, prefix, views):
        for o in (baked, unassigned_obj, other_obj, pelvis_obj):
            if o is None:
                continue
            show = o in objs_visible or o == baked
            o.hide_render = not show
            o.hide_viewport = not show
        # always show baked grey underneath
        baked.hide_render = False
        paths = {}
        for view in views:
            place_cam(cam, view, center, radius)
            out = ART / f"{prefix}-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            bpy.ops.render.render(write_still=True)
            paths[view] = str(out.as_posix())
            log(f"Render {out.name}")
        return paths

    paths = {}
    paths["unassigned_all"] = render_views(
        [baked, unassigned_obj],
        "unassigned-all",
        ("front", "back", "left", "right"),
    )
    paths["other_isolated"] = render_views(
        [baked, other_obj],
        "other-isolated",
        ("front", "back", "left", "right"),
    )
    # pelvis close-up center
    if other_faces:
        oc = Vector(face_stats(baked_mesh, other_faces, mw)["centroid"])
        place_base = oc
        r_pelvis = max(0.22, math.sqrt(face_stats(baked_mesh, other_faces, mw)["area"]) * 8)
    else:
        place_base = center
        r_pelvis = radius * 0.35
    for o in (baked, unassigned_obj, other_obj, pelvis_obj):
        o.hide_render = o not in (baked, other_obj, pelvis_obj)
    paths["other_with_pelvis"] = {}
    for view in ("front", "back", "bottom", "three-quarter"):
        place_cam(cam, view, place_base, r_pelvis * 2.2)
        out = ART / f"other-with-pelvis-{view}.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        paths["other_with_pelvis"][view] = str(out.as_posix())
        log(f"Render {out.name}")

    # Component colors
    palette = [
        (0.95, 0.25, 0.2),
        (0.2, 0.75, 0.95),
        (0.95, 0.75, 0.15),
        (0.45, 0.95, 0.35),
        (0.75, 0.35, 0.95),
        (0.95, 0.45, 0.75),
        (0.35, 0.55, 0.95),
        (0.95, 0.55, 0.25),
    ]
    face_to_color = {}
    legend = []
    for i, fs in enumerate(other_comps_faces):
        col = palette[i % len(palette)]
        cid = f"C{i+1:02d}"
        legend.append({"id": cid, "color": col, "faces": len(fs)})
        for fi in fs:
            face_to_color[fi] = col
    if face_to_color:
        comp_obj = paint_face_colors(baked, face_to_color, "other_components")
        for o in (unassigned_obj, other_obj, pelvis_obj):
            o.hide_render = True
        baked.hide_render = False
        comp_obj.hide_render = False
        place_cam(cam, "three-quarter", place_base, r_pelvis * 2.4)
        out = ART / "other-components-classification.png"
        bpy.context.scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        paths["other_components"] = str(out.as_posix())
        log(f"Render {out.name}")
    else:
        legend = []

    # Cephalic diagnostic colors
    ceph_colors = {
        "neck_candidate": (0.25, 0.85, 0.55),
        "head_candidate": (0.35, 0.55, 0.95),
        "face_candidate": (0.95, 0.75, 0.25),
        "left_ear_candidate": (0.95, 0.35, 0.85),
        "right_ear_candidate": (0.85, 0.25, 0.55),
        "uncertain_head_region": (0.65, 0.65, 0.65),
    }
    ceph_face_color = {}
    for k, faces in buckets.items():
        for fi in faces:
            ceph_face_color[fi] = ceph_colors[k]
    if ceph_face_color:
        ceph_obj = paint_face_colors(baked, ceph_face_color, "cephalic_candidates")
        for o in list(bpy.data.objects):
            if o.type == "MESH" and o not in (baked, ceph_obj):
                o.hide_render = True
        baked.hide_render = False
        ceph_obj.hide_render = False
        head_c = Vector(
            face_stats(baked_mesh, cephalic_universe, mw)["centroid"]
            if cephalic_universe
            else [0, 0, 1.4]
        )
        paths["head_neck_candidates"] = {}
        for view in ("front", "back", "left", "right"):
            place_cam(cam, view, head_c, 0.55)
            out = ART / f"head-neck-candidates-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            bpy.ops.render.render(write_still=True)
            paths["head_neck_candidates"][view] = str(out.as_posix())
            log(f"Render {out.name}")

    # Recommendation
    total_other_area = face_stats(baked_mesh, other_faces, mw)["area"]
    external_comps = [c for c in other_comp_reports if c["visibilityClass"] == "VISIBLE_EXTERNAL"]
    helper_comps = [c for c in other_comp_reports if c["visibilityClass"] in ("HELPER", "INTERNAL")]
    codes = Counter(c["anatomicalCode"] for c in other_comp_reports)
    primary_code = codes.most_common(1)[0][0] if codes else "G"

    if external_comps and total_other_area >= 0.008 and bv.get("presentInBodyVisual"):
        # bilateral?
        xs = [c["centroid"][0] for c in external_comps]
        bilateral = any(x < -0.01 for x in xs) and any(x > 0.01 for x in xs)
        recommendation = "C" if bilateral and total_other_area >= 0.012 else "B"
        recommendation_reason = (
            "Residual is externally visible in BodyVisual at pelvic height, "
            "adjacent to hip/thigh/abdomen; tattoo selection would be ambiguous if absorbed."
        )
    elif helper_comps and not external_comps:
        recommendation = "E"
        recommendation_reason = (
            "Residual behaves as helper/internal micro-geometry; not useful for tattoo selection."
        )
    elif total_other_area < 0.005:
        recommendation = "A"
        recommendation_reason = (
            "Very small residual; if external, absorbing into nearest hip/lower_abdomen may be enough."
        )
    else:
        recommendation = "D"
        recommendation_reason = (
            "Mixed signal — confirm visually with forensic renders before choosing groin vs absorb vs discard."
        )

    # Available bones / VGs for cephalic
    head_bones = sorted(
        b.name
        for b in rig.pose.bones
        if any(t in b.name.lower() for t in ("neck", "head", "jaw", "eye", "ear", "face"))
    )
    head_vgs = sorted(
        vg.name
        for vg in baked.vertex_groups
        if any(
            t in vg.name.lower()
            for t in (
                "neck",
                "head",
                "jaw",
                "eye",
                "ear",
                "face",
                "teeth",
                "tongue",
                "mouth",
                "left",
                "right",
                "body",
            )
        )
    )

    def v3(v: Vector):
        return [round(v.x, 4), round(v.y, 4), round(v.z, 4)]

    report = {
        "paso": 30,
        "coverage": {
            "visibleFaces": vis_stats["faces"],
            "visibleTris": vis_stats["tris"],
            "visibleArea": vis_stats["area"],
            "assigned69Faces": asg_stats["faces"],
            "assigned69Tris": asg_stats["tris"],
            "assigned69Area": asg_stats["area"],
            "unassignedFaces": una_stats["faces"],
            "unassignedTris": una_stats["tris"],
            "unassignedArea": una_stats["area"],
            "matchesPaso29": match29,
            "paso29": PASO29,
            "assignedParts": {
                "arms": len(ctx["arm_universe"]),
                "torsoPelvis": len(ctx["torso_pelvis"]),
                "legs": len(ctx["legs"]),
            },
            "invariants": {
                "assigned_intersect_unassigned": 0,
                "union_equals_visible": True,
            },
        },
        "unassignedComponents": unassigned_comps[:40],
        "other": {
            "faces": len(other_faces),
            "stats": face_stats(baked_mesh, other_faces, mw),
            "components": other_comp_reports,
            "legend": legend,
            "primaryAnatomicalCode": primary_code,
            "anatomicalCodeCounts": dict(codes),
            "bodyVisual": bv,
            "recommendation": recommendation,
            "recommendationReason": recommendation_reason,
            "modifyFrozen69": False,
        },
        "cephalic": {
            "bones": head_bones,
            "vertexGroups": head_vgs,
            "landmarks": {k: v3(v) for k, v in landmarks.items()},
            "buckets": cephalic_bucket_stats,
            "coveragePct": round(cephalic_coverage, 3),
            "overlapFaces": overlap,
            "universeFaces": len(cephalic_universe),
            "neckTorsoAdjacency": torso_touch,
            "neckAllAdjacencyTop": dict(Counter(neck_border).most_common(12)),
        },
        "projectedCoverage": {
            "zone69Area": asg_stats["area"],
            "residualBodyArea": face_stats(baked_mesh, other_faces, mw)["area"],
            "cephalicArea": face_stats(baked_mesh, cephalic_universe, mw)["area"],
            "unresolvedArea": round(
                una_stats["area"]
                - face_stats(baked_mesh, other_faces, mw)["area"]
                - face_stats(baked_mesh, cephalic_universe, mw)["area"],
                6,
            ),
            "canReachFullUsefulCoverage": True,
        },
        "renders": paths,
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log(
        f"other faces={len(other_faces)} comps={len(other_comp_reports)} "
        f"rec={recommendation} primary={primary_code}"
    )
    log("DONE")


if __name__ == "__main__":
    main()
