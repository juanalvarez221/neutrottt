"""
Paso 22 — Stabilize anatomical frames across the elbow + island cleanup.

Candidates:
  D1 = F1 (projected BODY_FRONT) + no new cleanup  [C2 control]
  D2 = F2 (parallel transport / RMF) + island cleanup
  D3 = F3 (anatomical hybrid) + island cleanup  [only if distal ref reliable]

Angular sectors (fixed C2):
  front 110°, outer 95°, back 70°, inner 85°

Does NOT overwrite official interaction GLB.

Outputs:
  assets/blender/neutro-body/interaction/frame-refinement/
  artifacts/body-v1-frame-refinement/

Run:
  blender.exe --background --python tools/blender/refine_neutro_body_v1_arm_frames.py
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import bpy
import bmesh
from mathutils import Quaternion, Vector

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "assets" / "blender" / "neutro-body" / "neutro_body_v1_complete_source.blend"
FRAME_DIR = REPO / "assets" / "blender" / "neutro-body" / "interaction" / "frame-refinement"
ART = REPO / "artifacts" / "body-v1-frame-refinement"
LAB_DIR = REPO / "public" / "models" / "interaction" / "pilot"
REPORT = ART / "report.json"

ZONE_LONG = [
    "right_shoulder",
    "right_upper_arm",
    "right_elbow",
    "right_forearm",
    "right_wrist",
    "right_hand",
]
QUAD = ("front", "back", "inner", "outer")

ZONE_COLORS_LONG = {
    "right_shoulder": (0.92, 0.28, 0.22, 1.0),
    "right_upper_arm": (0.95, 0.62, 0.12, 1.0),
    "right_elbow": (0.95, 0.88, 0.18, 1.0),
    "right_forearm": (0.22, 0.72, 0.38, 1.0),
    "right_wrist": (0.18, 0.55, 0.92, 1.0),
    "right_hand": (0.62, 0.28, 0.88, 1.0),
}
QUAD_COLORS = {
    "front": (0.15, 0.78, 0.82, 1.0),
    "back": (0.85, 0.25, 0.55, 1.0),
    "inner": (0.35, 0.45, 0.95, 1.0),
    "outer": (0.98, 0.55, 0.12, 1.0),
}

ARM_WEIGHT_THRESH = 0.12
LATERAL_BIAS = 0.02
OUTLIER_DIST = 0.14
OUTLIER_W_MIN = 0.35

R2_SHOULDER_OF_UA = 0.18
R2_ELBOW_PROX_OF_UA = 0.11
R2_ELBOW_DIST_OF_FA = 0.11
R2_WRIST_PROX_OF_FA = 0.11
R2_WRIST_DIST_OF_HAND = 0.14

# C2 angular
FRONT_HALF = 55.0
OUTER_SPAN = 95.0
BACK_SPAN = 70.0
# inner = 85

ISLAND_PCT_OF_PARENT = 0.03  # < 3% of parent segment tris
F3_MAX_CORRECTION_DEG = 25.0  # soft blend cap
F3_MIN_PALM_CONFIDENCE = 0.55  # |palm_n · plane| stability proxy


def log(msg: str) -> None:
    print(f"[frame-refine] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"FAIL: {msg}")
    sys.exit(1)


def world_bbox(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def bone_world_head(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix).translation.copy()


def bone_world_tail(rig, name: str) -> Vector | None:
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return (rig.matrix_world @ pb.matrix @ Vector((0.0, pb.length, 0.0)).to_4d()).xyz


def bone_world_matrix(rig, name: str):
    pb = rig.pose.bones.get(name)
    if pb is None:
        return None
    return rig.matrix_world @ pb.matrix


def vertex_weight(v, gidx: int) -> float:
    for g in v.groups:
        if g.group == gidx:
            return float(g.weight)
    return 0.0


def project_point_on_segment(p: Vector, a: Vector, b: Vector):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-12:
        return a.copy(), 0.0, (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return a + ab * t, t, (p - (a + ab * t)).length


def arm_polyline_param(p: Vector, joints: list[Vector]):
    best_dist, best_s, cum = 1e9, 0.0, 0.0
    for i in range(len(joints) - 1):
        a, b = joints[i], joints[i + 1]
        seg_len = (b - a).length
        _c, t, dist = project_point_on_segment(p, a, b)
        s = cum + t * seg_len
        if dist < best_dist:
            best_dist, best_s = dist, s
        cum += seg_len
    return best_s, best_dist


def is_right_arm_member(w: dict[str, float], dist: float) -> bool:
    w_right = max(
        w.get("clavicle_r", 0.0),
        w.get("upperarm_r", 0.0),
        w.get("lowerarm_r", 0.0),
        w.get("hand_r", 0.0),
    ) + 0.25 * min(
        1.0,
        w.get("thumb_01_r", 0.0) + w.get("thumb_02_r", 0.0) + w.get("thumb_03_r", 0.0),
    )
    w_left = max(
        w.get("clavicle_l", 0.0),
        w.get("upperarm_l", 0.0),
        w.get("lowerarm_l", 0.0),
        w.get("hand_l", 0.0),
    )
    if w_right < ARM_WEIGHT_THRESH:
        return False
    if w_left > w_right + LATERAL_BIAS:
        return False
    if dist > OUTLIER_DIST and w_right < OUTLIER_W_MIN:
        return False
    return True


def classify_longitudinal_r2(s, w, shoulder_end, elbow_lo, elbow_hi, wrist_lo, wrist_hi):
    w_la = w.get("lowerarm_r", 0.0)
    w_hand = w.get("hand_r", 0.0)
    w_thumb = w.get("thumb_01_r", 0.0) + w.get("thumb_02_r", 0.0) + w.get("thumb_03_r", 0.0)
    if s >= wrist_hi:
        return "right_hand"
    if wrist_lo <= s < wrist_hi:
        if (w_hand + w_thumb * 0.5) > w_la + 0.05:
            return "right_hand"
        return "right_wrist"
    if elbow_lo <= s <= elbow_hi:
        return "right_elbow"
    if s <= shoulder_end:
        return "right_shoulder"
    if s < elbow_lo:
        return "right_upper_arm"
    if s < wrist_lo:
        return "right_forearm"
    return "right_hand"


def face_area(mesh, poly, mw) -> float:
    verts = [mw @ mesh.vertices[i].co for i in poly.vertices]
    if len(verts) < 3:
        return 0.0
    area, o = 0.0, verts[0]
    for i in range(1, len(verts) - 1):
        area += ((verts[i] - o).cross(verts[i + 1] - o)).length * 0.5
    return area


def angle_deg(a: Vector, b: Vector) -> float:
    return math.degrees(math.acos(max(-1.0, min(1.0, a.normalized().dot(b.normalized())))))


def rotation_minimizing_quat(from_dir: Vector, to_dir: Vector) -> Quaternion:
    """
    Minimal rotation taking unit vector `from_dir` onto `to_dir`
    (Rodrigues via Quaternion). No twist about an arbitrary axis beyond
    what is required to align the longitudinal axes.
    """
    a = from_dir.normalized()
    b = to_dir.normalized()
    c = max(-1.0, min(1.0, a.dot(b)))
    if c > 0.999999:
        return Quaternion((1.0, 0.0, 0.0, 0.0))
    if c < -0.999999:
        # 180°: choose a stable perpendicular
        axis = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
        axis = (axis - axis.dot(a) * a).normalized()
        return Quaternion(axis, math.pi)
    axis = a.cross(b).normalized()
    return Quaternion(axis, math.acos(c))


def orthonormalize_frame(L: Vector, F: Vector, S: Vector, torso_center: Vector, mid: Vector):
    """Project F,S onto plane ⊥ L; keep S as outer (away from torso)."""
    L = L.normalized()
    F = F - F.dot(L) * L
    if F.length < 1e-8:
        tmp = Vector((0, 0, 1)) if abs(L.z) < 0.9 else Vector((1, 0, 0))
        F = tmp - tmp.dot(L) * L
    F = F.normalized()
    S = S - S.dot(L) * L
    S = S - S.dot(F) * F
    if S.length < 1e-8:
        S = L.cross(F).normalized()
    else:
        S = S.normalized()
    # Outer = away from torso
    to_torso = torso_center - mid
    to_torso = to_torso - to_torso.dot(L) * L
    if to_torso.length > 1e-8 and S.dot(to_torso.normalized()) > 0:
        S = -S
    return L, F, S


def build_upper_frame(shoulder, elbow, body_front, torso_center):
    L = (elbow - shoulder).normalized()
    F = body_front - body_front.dot(L) * L
    if F.length < 1e-8:
        F = Vector((0, -1, 0))
    F = F.normalized()
    mid = (shoulder + elbow) * 0.5
    to_torso = torso_center - mid
    to_torso = to_torso - to_torso.dot(L) * L
    S = (-to_torso).normalized() if to_torso.length > 1e-8 else L.cross(F).normalized()
    return orthonormalize_frame(L, F, S, torso_center, mid)


def frame_f1_forearm(elbow, wrist, body_front, torso_center):
    """Projected BODY_FRONT (current C2 / F1)."""
    L = (wrist - elbow).normalized()
    F = body_front - body_front.dot(L) * L
    if F.length < 1e-8:
        F = Vector((0, -1, 0))
    F = F.normalized()
    mid = (elbow + wrist) * 0.5
    to_torso = torso_center - mid
    to_torso = to_torso - to_torso.dot(L) * L
    S = (-to_torso).normalized() if to_torso.length > 1e-8 else L.cross(F).normalized()
    return orthonormalize_frame(L, F, S, torso_center, mid)


def frame_f2_transport(L_u, F_u, S_u, elbow, wrist, torso_center):
    """
    Parallel / rotation-minimizing transport:
      q = min rotation L_u → L_f
      F' = q @ F_u ; S' = q @ S_u
      re-orthonormalize on plane ⊥ L_f
    """
    L_f = (wrist - elbow).normalized()
    q = rotation_minimizing_quat(L_u, L_f)
    F = q @ F_u
    S = q @ S_u
    mid = (elbow + wrist) * 0.5
    return orthonormalize_frame(L_f, F, S, torso_center, mid), q


def estimate_twist_about_L(F_ref: Vector, F_test: Vector, L: Vector) -> float:
    """Signed angle between two vectors in plane ⊥ L (degrees)."""
    L = L.normalized()
    a = (F_ref - F_ref.dot(L) * L).normalized()
    b = (F_test - F_test.dot(L) * L).normalized()
    if a.length < 1e-8 or b.length < 1e-8:
        return 0.0
    ang = math.degrees(math.atan2(L.dot(a.cross(b)), a.dot(b)))
    return ang


def try_palm_reference(rig, offset: Vector, L_f: Vector):
    """
    Distal anatomical reference for F3.
    Palm width: index_01_r → pinky_01_r
    Along hand: hand_r → middle_01_r
    Palm normal ≈ width × along (or reverse)
    Returns (palm_normal_in_plane, confidence, notes) or None.
    """
    idx = bone_world_head(rig, "index_01_r")
    pnk = bone_world_head(rig, "pinky_01_r")
    mid = bone_world_head(rig, "middle_01_r")
    hand = bone_world_head(rig, "hand_r")
    if not all(v is not None for v in (idx, pnk, mid, hand)):
        return None
    idx, pnk, mid, hand = idx + offset, pnk + offset, mid + offset, hand + offset
    width = (idx - pnk)
    along = (mid - hand)
    if width.length < 1e-4 or along.length < 1e-4:
        return None
    palm_n = width.cross(along)
    if palm_n.length < 1e-6:
        return None
    palm_n = palm_n.normalized()
    # Project to plane ⊥ L_f — this is the in-plane palm direction candidate
    in_plane = palm_n - palm_n.dot(L_f) * L_f
    conf = in_plane.length  # 1 = fully perpendicular to L, 0 = parallel (useless)
    if conf < 0.25:
        return None
    in_plane = in_plane.normalized()
    # For forearm tattoo "front" (anterior/flexor), prefer direction toward palm
    # when palm faces roughly "body-ish". We take +in_plane as "toward palm".
    notes = {
        "widthLen": width.length,
        "alongLen": along.length,
        "conf": conf,
        "palmN": list(palm_n),
        "inPlane": list(in_plane),
    }
    return in_plane, conf, notes


def frame_f3_hybrid(F2_frame, palm_in_plane, torso_center, elbow, wrist, correction_deg: float):
    """
    Start from F2, rotate F about L toward palm_in_plane by at most correction_deg,
    using slerp-like blend of directions in the plane.
    """
    L, F2, S2 = F2_frame
    mid = (elbow + wrist) * 0.5
    # Target F: palm direction projected; choose sign so F is closer to F2 (no 180 flip)
    target = palm_in_plane
    if target.dot(F2) < 0:
        target = -target
    twist = estimate_twist_about_L(F2, target, L)
    max_t = correction_deg
    applied = max(-max_t, min(max_t, twist))
    # Rotate F2 about L by `applied`
    q = Quaternion(L, math.radians(applied))
    F = q @ F2
    S = q @ S2
    return orthonormalize_frame(L, F, S, torso_center, mid), applied, twist


def classify_c2(front_score: float, side_score: float) -> str:
    ang = math.degrees(math.atan2(side_score, front_score))
    fh = FRONT_HALF
    outer_end = fh + OUTER_SPAN
    inner_span = 360.0 - 2.0 * fh - OUTER_SPAN - BACK_SPAN
    inner_start = -fh - inner_span
    if -fh <= ang <= fh:
        return "front"
    if fh < ang <= outer_end:
        return "outer"
    if ang > outer_end or ang < inner_start:
        return "back"
    return "inner"


def angular_scores(front_score: float, side_score: float) -> dict[str, float]:
    """Higher = better match to sector center."""
    ang = math.degrees(math.atan2(side_score, front_score))
    centers = {"front": 0.0, "outer": 90.0, "back": 180.0, "inner": -90.0}
    out = {}
    for k, c in centers.items():
        d = abs(((ang - c + 180) % 360) - 180)
        if k == "back":
            d = min(abs(((ang - 180 + 180) % 360) - 180), abs(((ang + 180 + 180) % 360) - 180))
        out[k] = 1.0 / (1.0 + d / 45.0)
    return out


def make_mat(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.55
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.75
    mat.blend_method = "BLEND"
    try:
        mat.surface_render_method = "BLENDED"
    except Exception:
        pass
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs[0], out.inputs[0])
    return mat


def extract_zone_object(src_obj, face_indices, name, mat):
    bpy.ops.object.select_all(action="DESELECT")
    src_obj.select_set(True)
    bpy.context.view_layer.objects.active = src_obj
    bpy.ops.object.duplicate()
    zone = bpy.context.active_object
    zone.name = name
    zone.data = zone.data.copy()
    zone.data.name = name
    bm = bmesh.new()
    bm.from_mesh(zone.data)
    bm.faces.ensure_lookup_table()
    keep = set(face_indices)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(zone.data)
    bm.free()
    zone.data.update()
    zone.data.materials.clear()
    zone.data.materials.append(mat)
    return zone


def build_edge_face_map(mesh, face_set: set[int] | None = None):
    edge_to_faces: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in mesh.polygons:
        if face_set is not None and poly.index not in face_set:
            continue
        vs = list(poly.vertices)
        n = len(vs)
        for i in range(n):
            e = tuple(sorted((vs[i], vs[(i + 1) % n])))
            edge_to_faces[e].append(poly.index)
    return edge_to_faces


def connected_components(mesh, face_indices: list[int]) -> list[list[int]]:
    face_set = set(face_indices)
    if not face_set:
        return []
    edge_to_faces = build_edge_face_map(mesh, face_set)
    adj: dict[int, set[int]] = defaultdict(set)
    for faces in edge_to_faces.values():
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                a, b = faces[i], faces[j]
                if a in face_set and b in face_set:
                    adj[a].add(b)
                    adj[b].add(a)
    visited = set()
    comps = []
    for start in face_set:
        if start in visited:
            continue
        stack = [start]
        visited.add(start)
        comp = []
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in adj[u]:
                if v not in visited:
                    visited.add(v)
                    stack.append(v)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps


def cleanup_islands(
    mesh,
    face_zone: dict[int, str],
    face_data_by_idx: dict,
    parent_face_sets: dict[str, set[int]],
    parent_tris: dict[str, int],
    F_u, S_u, F_f, S_f,
    shoulder, elbow, wrist,
):
    """
    Reassign small disconnected components using shared boundary edges +
    angular score coherence. Does not change geometry.
    """
    reassigned = 0
    details = []

    # Only clean circumferential subzones
    subzones = [
        f"right_upper_arm_{q}" for q in QUAD
    ] + [f"right_forearm_{q}" for q in QUAD]

    # Build adjacency across ALL arm faces for neighbor counting
    all_faces = set(face_zone.keys())
    edge_to_faces = build_edge_face_map(mesh, all_faces)

    def neighbor_edge_counts(comp_faces: set[int]) -> dict[str, int]:
        counts: dict[str, int] = defaultdict(int)
        for e, faces in edge_to_faces.items():
            if len(faces) != 2:
                continue
            a, b = faces
            if a in comp_faces and b not in comp_faces:
                counts[face_zone[b]] += 1
            elif b in comp_faces and a not in comp_faces:
                counts[face_zone[a]] += 1
        return counts

    def mean_angular(comp_faces, is_upper: bool):
        scores = defaultdict(float)
        n = 0
        for fi in comp_faces:
            fd = face_data_by_idx[fi]
            if is_upper:
                closest, _, _ = project_point_on_segment(fd["centroid"], shoulder, elbow)
                R = fd["centroid"] - closest
                fs, ss = R.dot(F_u), R.dot(S_u)
            else:
                closest, _, _ = project_point_on_segment(fd["centroid"], elbow, wrist)
                R = fd["centroid"] - closest
                fs, ss = R.dot(F_f), R.dot(S_f)
            for k, v in angular_scores(fs, ss).items():
                scores[k] += v
            n += 1
        if n == 0:
            return {}
        return {k: v / n for k, v in scores.items()}

    # Iterate until stable or max passes
    for _pass in range(4):
        changed = 0
        for zid in subzones:
            faces = [fi for fi, z in face_zone.items() if z == zid]
            if not faces:
                continue
            is_upper = zid.startswith("right_upper_arm_")
            parent_key = "right_upper_arm" if is_upper else "right_forearm"
            parent_t = parent_tris[parent_key]
            threshold = max(2, int(parent_t * ISLAND_PCT_OF_PARENT))
            comps = connected_components(mesh, faces)
            if len(comps) <= 1:
                continue
            main = set(comps[0])
            for comp in comps[1:]:
                if len(comp) >= threshold:
                    continue  # not a small island
                comp_set = set(comp)
                neigh = neighbor_edge_counts(comp_set)
                # Only consider other circumferential zones of same parent, or same-prefix
                prefix = "right_upper_arm_" if is_upper else "right_forearm_"
                cand_neighbors = {
                    k: v for k, v in neigh.items() if k.startswith(prefix) and k != zid
                }
                if not cand_neighbors:
                    # allow elbow/shoulder/wrist as last resort? No — keep within parent
                    continue
                ang = mean_angular(comp_set, is_upper)
                ranked_ang = sorted(ang.items(), key=lambda kv: kv[1], reverse=True)
                top2 = {k for k, _ in ranked_ang[:2]}
                # Best neighbor by edges among those in top2 angular, else best edges if in top2
                best = None
                best_score = -1.0
                for nz, ec in cand_neighbors.items():
                    q = nz.rsplit("_", 1)[-1]
                    ang_ok = q in top2
                    score = ec + (2.0 if ang_ok else 0.0) + ang.get(q, 0.0)
                    if ang_ok and score > best_score:
                        best_score = score
                        best = nz
                if best is None:
                    # Require angular coherence — skip if none match top2
                    continue
                for fi in comp_set:
                    face_zone[fi] = best
                    reassigned += 1
                    changed += 1
                details.append(
                    {
                        "from": zid,
                        "to": best,
                        "faces": len(comp_set),
                        "neighborEdges": dict(cand_neighbors),
                        "angularTop2": list(top2),
                    }
                )
        if changed == 0:
            break

    return reassigned, details


def setup_studio():
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
    world = bpy.data.worlds.new("FrameWorld")
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

    add_light("Key", 280.0, (2.0, -2.4, 2.2), 2.2)
    add_light("Fill", 100.0, (-2.4, -1.4, 1.6), 2.8)
    add_light("Rim", 130.0, (0.2, 3.0, 2.0), 2.0)
    cam_d = bpy.data.cameras.new("FrameCam")
    cam_d.lens = 55.0
    cam = bpy.data.objects.new("FrameCam", cam_d)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return cam


def place_cam(cam, view, center, radius):
    offsets = {
        "front": Vector((0, -1, 0.08)),
        "back": Vector((0, 1, 0.08)),
        "inner": Vector((1, 0.15, 0.05)),
        "outer": Vector((-1, 0.15, 0.05)),
        "three-quarter": Vector((-0.65, -0.75, 0.1)),
    }
    d = offsets[view].normalized()
    cam.location = center + d * radius
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def composite_horizontal(paths: list[Path], out_path: Path):
    images = [bpy.data.images.load(str(p)) for p in paths]
    w, h = images[0].size
    total_w = w * len(images)
    comp = bpy.data.images.new(out_path.stem, width=total_w, height=h, alpha=False)
    pixels = [0.0] * (total_w * h * 4)
    for i, img in enumerate(images):
        src = list(img.pixels)
        for y in range(h):
            for x in range(w):
                si = (y * w + x) * 4
                di = (y * total_w + i * w + x) * 4
                pixels[di : di + 4] = src[si : si + 4]
    comp.pixels = pixels
    comp.filepath_raw = str(out_path)
    comp.file_format = "PNG"
    comp.save()
    for img in images:
        bpy.data.images.remove(img)
    bpy.data.images.remove(comp)


def export_glb(objs, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(path),
            use_selection=True,
            export_animations=False,
            export_skins=False,
            export_morph=False,
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
        )
    except TypeError:
        bpy.ops.export_scene.gltf(
            filepath=str(path), use_selection=True, export_apply=False, export_materials="EXPORT"
        )


def continuity_score(face_zone, face_data_by_idx, elbow, ua_q, fa_q, half_band=0.04):
    """
    Geometric continuity at elbow: among faces near elbow on upper/forearm
    with matching quadrant labels, compare mean angular difference of radial dirs.
    Returns mean absolute angular delta (deg) of atan2 around local frames —
    lower is better continuity of the same semantic strip.
    Also returns fraction of near-elbow UA faces whose closest FA neighbor
    shares the same quadrant (edge adjacency across elbow band).
    """
    # Simpler metric: shared edges between ua_q and fa_q across the elbow band
    # (faces with s near s_elbow). Count edges between the two zones.
    # Plus mean |angle_ua - angle_fa| for paired near-elbow centroids projected.
    ua_faces = [i for i, z in face_zone.items() if z == f"right_upper_arm_{ua_q}"]
    fa_faces = [i for i, z in face_zone.items() if z == f"right_forearm_{fa_q}"]
    # Proximity to elbow by distance to elbow point
    ua_near = [
        i for i in ua_faces
        if (face_data_by_idx[i]["centroid"] - elbow).length < 0.08
    ]
    fa_near = [
        i for i in fa_faces
        if (face_data_by_idx[i]["centroid"] - elbow).length < 0.08
    ]
    if not ua_near or not fa_near:
        return {"nearUa": len(ua_near), "nearFa": len(fa_near), "meanPairAngleDeg": None}
    # For each UA near face, find nearest FA near face and measure angle between
    # (centroid - elbow) projected directions
    deltas = []
    for ui in ua_near:
        uc = face_data_by_idx[ui]["centroid"]
        best = None
        best_d = 1e9
        for fi in fa_near:
            d = (face_data_by_idx[fi]["centroid"] - uc).length
            if d < best_d:
                best_d = d
                best = fi
        if best is None or best_d > 0.06:
            continue
        # Both vectors from elbow
        vu = (uc - elbow).normalized()
        vf = (face_data_by_idx[best]["centroid"] - elbow).normalized()
        deltas.append(angle_deg(vu, vf))
    return {
        "nearUa": len(ua_near),
        "nearFa": len(fa_near),
        "paired": len(deltas),
        "meanPairAngleDeg": round(sum(deltas) / len(deltas), 2) if deltas else None,
    }


def main():
    log(f"Blender {bpy.app.version_string}")
    ART.mkdir(parents=True, exist_ok=True)
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    LAB_DIR.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    human = bpy.data.objects["Human"]
    rig = bpy.data.objects["Human.rig"]
    for m in human.modifiers:
        m.show_viewport = True
        m.show_render = True
    bpy.context.view_layer.update()

    shoulder = bone_world_head(rig, "upperarm_r")
    elbow = bone_world_head(rig, "lowerarm_r")
    wrist = bone_world_head(rig, "hand_r")
    tip = bone_world_tail(rig, "middle_03_r") or bone_world_head(rig, "middle_03_r")
    spine = bone_world_head(rig, "spine_02") or bone_world_head(rig, "spine_01")
    if tip is None:
        tip = wrist + (wrist - elbow).normalized() * 0.16

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = human.evaluated_get(depsgraph)
    try:
        baked_mesh = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
        )
    except TypeError:
        baked_mesh = bpy.data.meshes.new_from_object(evaluated)
    baked = bpy.data.objects.new("InteractionBake", baked_mesh)
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

    shoulder_c = shoulder + offset
    elbow_c = elbow + offset
    wrist_c = wrist + offset
    tip_c = tip + offset
    torso_c = (spine + offset) if spine else Vector((0, 0, 1.1))
    joints = [shoulder_c, elbow_c, wrist_c, tip_c]

    ua_len = (elbow_c - shoulder_c).length
    fa_len = (wrist_c - elbow_c).length
    hand_len = (tip_c - wrist_c).length
    s_elbow, s_wrist = ua_len, ua_len + fa_len
    shoulder_end = R2_SHOULDER_OF_UA * ua_len
    elbow_lo = s_elbow - R2_ELBOW_PROX_OF_UA * ua_len
    elbow_hi = s_elbow + R2_ELBOW_DIST_OF_FA * fa_len
    wrist_lo = s_wrist - R2_WRIST_PROX_OF_FA * fa_len
    wrist_hi = s_wrist + R2_WRIST_DIST_OF_HAND * hand_len

    body_front = Vector((0.0, -1.0, 0.0))
    L_u, F_u, S_u = build_upper_frame(shoulder_c, elbow_c, body_front, torso_c)

    # F1 forearm
    L_f1, F_f1, S_f1 = frame_f1_forearm(elbow_c, wrist_c, body_front, torso_c)
    # F2 transport
    (L_f2, F_f2, S_f2), q_transport = frame_f2_transport(
        L_u, F_u, S_u, elbow_c, wrist_c, torso_c
    )

    palm = try_palm_reference(rig, offset, L_f2)
    f3_available = False
    f3_meta = {"available": False, "reason": "not evaluated"}
    F_f3 = S_f3 = L_f3 = None
    if palm is None:
        f3_meta = {"available": False, "reason": "F3 no fiable — palm landmarks insufficient"}
        log("F3 no fiable: palm landmarks")
    else:
        palm_in_plane, conf, notes = palm
        if conf < F3_MIN_PALM_CONFIDENCE:
            f3_meta = {
                "available": False,
                "reason": f"F3 no fiable — palm confidence {conf:.3f} < {F3_MIN_PALM_CONFIDENCE}",
                "notes": notes,
            }
            log(f3_meta["reason"])
        else:
            (L_f3, F_f3, S_f3), applied, raw_twist = frame_f3_hybrid(
                (L_f2, F_f2, S_f2),
                palm_in_plane,
                torso_c,
                elbow_c,
                wrist_c,
                F3_MAX_CORRECTION_DEG,
            )
            f3_available = True
            f3_meta = {
                "available": True,
                "distalReference": "palm plane from index_01_r→pinky_01_r × hand→middle_01_r",
                "confidence": conf,
                "rawTwistTowardPalmDeg": raw_twist,
                "appliedCorrectionDeg": applied,
                "interpolation": (
                    f"Quaternion rotation of F2 about L_forearm by clamp(twist, ±{F3_MAX_CORRECTION_DEG}°)"
                ),
                "notes": notes,
            }
            log(f"F3 available: applied correction {applied:.2f}° (raw {raw_twist:.2f}°)")

    angles = {
        "D1": {
            "F": angle_deg(F_u, F_f1),
            "S": angle_deg(S_u, S_f1),
            "twist": estimate_twist_about_L(F_f2, F_f1, L_f2),  # F1 twist vs RMF
        },
        "D2": {
            "F": angle_deg(F_u, F_f2),
            "S": angle_deg(S_u, S_f2),
            "twist": 0.0,  # by construction of RMF
        },
    }
    if f3_available:
        angles["D3"] = {
            "F": angle_deg(F_u, F_f3),
            "S": angle_deg(S_u, S_f3),
            "twist": estimate_twist_about_L(F_f2, F_f3, L_f3),
        }

    log(f"Angles: {angles}")

    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    needed = [
        "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
        "thumb_01_r", "thumb_02_r", "thumb_03_r",
        "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    ]
    mw = baked.matrix_world
    face_data = []
    for poly in baked_mesh.polygons:
        w_acc = defaultdict(float)
        centroid = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = baked_mesh.vertices[vi]
            centroid += mw @ v.co
            for name in needed:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(n)
        w_avg = {k: val / float(n) for k, val in w_acc.items()}
        s, dist = arm_polyline_param(centroid, joints)
        member = is_right_arm_member(w_avg, dist)
        long_z = (
            classify_longitudinal_r2(
                s, w_avg, shoulder_end, elbow_lo, elbow_hi, wrist_lo, wrist_hi
            )
            if member
            else None
        )
        face_data.append(
            {
                "index": poly.index,
                "centroid": centroid,
                "long": long_z,
                "member": member,
                "area": face_area(baked_mesh, poly, mw),
                "tris": max(0, len(poly.vertices) - 2),
            }
        )
    face_data_by_idx = {fd["index"]: fd for fd in face_data}
    universe = [fd for fd in face_data if fd["member"]]
    log(f"Universe {len(universe)}")

    long_faces = {z: [] for z in ZONE_LONG}
    for fd in universe:
        long_faces[fd["long"]].append(fd["index"])
    parent_tris = {
        "right_upper_arm": sum(face_data_by_idx[i]["tris"] for i in long_faces["right_upper_arm"]),
        "right_forearm": sum(face_data_by_idx[i]["tris"] for i in long_faces["right_forearm"]),
    }
    parent_sets = {
        "right_upper_arm": set(long_faces["right_upper_arm"]),
        "right_forearm": set(long_faces["right_forearm"]),
    }

    bake_template = baked_mesh.copy()
    bake_template.name = "BakeTemplate"

    def classify_all(F_fore, S_fore):
        face_zone = {}
        for fd in universe:
            long_z = fd["long"]
            if long_z == "right_upper_arm":
                closest, _, _ = project_point_on_segment(fd["centroid"], shoulder_c, elbow_c)
                R = fd["centroid"] - closest
                q = classify_c2(R.dot(F_u), R.dot(S_u))
                face_zone[fd["index"]] = f"right_upper_arm_{q}"
            elif long_z == "right_forearm":
                closest, _, _ = project_point_on_segment(fd["centroid"], elbow_c, wrist_c)
                R = fd["centroid"] - closest
                q = classify_c2(R.dot(F_fore), R.dot(S_fore))
                face_zone[fd["index"]] = f"right_forearm_{q}"
            else:
                face_zone[fd["index"]] = long_z
        return face_zone

    def zone_component_stats(mesh, face_zone):
        stats = {}
        for q in QUAD:
            for parent in ("right_upper_arm", "right_forearm"):
                zid = f"{parent}_{q}"
                faces = [i for i, z in face_zone.items() if z == zid]
                comps = connected_components(mesh, faces)
                tris = sum(face_data_by_idx[i]["tris"] for i in faces)
                area = sum(face_data_by_idx[i]["area"] for i in faces)
                stats[zid] = {
                    "triangles": tris,
                    "surfaceArea": round(area, 6),
                    "components": len(comps),
                    "componentSizes": [len(c) for c in comps],
                }
        return stats

    candidates_spec = [
        ("D1", "current_frame", F_f1, S_f1, False, "right_arm_d1_current_frame.blend"),
        ("D2", "parallel_transport", F_f2, S_f2, True, "right_arm_d2_parallel_transport.blend"),
    ]
    if f3_available:
        candidates_spec.append(
            ("D3", "anatomical_hybrid", F_f3, S_f3, True, "right_arm_d3_anatomical_hybrid.blend")
        )

    results = {}
    render_paths = {}
    views = ("front", "back", "inner", "outer", "three-quarter")

    for cid, label, F_fore, S_fore, do_cleanup, blend_name in candidates_spec:
        log(f"=== {cid} {label} ===")
        face_zone = classify_all(F_fore, S_fore)
        before = zone_component_stats(baked_mesh, face_zone)
        reassigned = 0
        cleanup_details = []
        if do_cleanup:
            reassigned, cleanup_details = cleanup_islands(
                baked_mesh,
                face_zone,
                face_data_by_idx,
                parent_sets,
                parent_tris,
                F_u, S_u, F_fore, S_fore,
                shoulder_c, elbow_c, wrist_c,
            )
        after = zone_component_stats(baked_mesh, face_zone)

        # Coverage check
        ua_n = sum(1 for z in face_zone.values() if z.startswith("right_upper_arm_"))
        fa_n = sum(1 for z in face_zone.values() if z.startswith("right_forearm_"))
        if ua_n != len(long_faces["right_upper_arm"]) or fa_n != len(long_faces["right_forearm"]):
            fail(f"{cid} coverage broken")

        continuity = {
            q: continuity_score(face_zone, face_data_by_idx, elbow_c, q, q)
            for q in QUAD
        }

        # Build objects
        for obj in list(bpy.data.objects):
            if obj.name != "InteractionBake":
                bpy.data.objects.remove(obj, do_unlink=True)
        if "InteractionBake" not in bpy.data.objects:
            baked = bpy.data.objects.new("InteractionBake", bake_template.copy())
            baked.data.name = "InteractionBake"
            bpy.context.collection.objects.link(baked)
            baked_mesh = baked.data
        else:
            baked = bpy.data.objects["InteractionBake"]
            baked_mesh = baked.data

        expected = (
            ["right_shoulder", "right_elbow", "right_wrist", "right_hand"]
            + [f"right_upper_arm_{q}" for q in QUAD]
            + [f"right_forearm_{q}" for q in QUAD]
        )
        zone_faces = defaultdict(list)
        for fi, z in face_zone.items():
            zone_faces[z].append(fi)

        mats = {}
        for zid in expected:
            if "_" in zid and zid.rsplit("_", 1)[-1] in QUAD:
                color = QUAD_COLORS[zid.rsplit("_", 1)[-1]]
            else:
                color = ZONE_COLORS_LONG[zid]
            mats[zid] = make_mat(f"Debug_{zid}_{cid}", color)

        zone_objs = [
            extract_zone_object(baked, zone_faces[zid], f"zone_{zid}", mats[zid])
            for zid in expected
        ]
        baked.hide_render = True
        baked.hide_viewport = True
        bpy.data.objects.remove(baked, do_unlink=True)

        blend_path = FRAME_DIR / blend_name
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
        log(f"Saved {blend_path}")

        glb_art = ART / f"right_arm_{cid.lower()}.glb"
        glb_lab = LAB_DIR / f"right_arm_{cid.lower()}.glb"
        export_glb(zone_objs, glb_art)
        export_glb(zone_objs, glb_lab)

        for name in list(bpy.data.objects.keys()):
            if name.startswith(("Key", "Fill", "Rim", "Frame")):
                bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
        cam = setup_studio()
        corners = []
        for o in zone_objs:
            a, b = world_bbox(o)
            corners.extend([a, b])
        arm_min = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        arm_max = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        center = (arm_min + arm_max) * 0.5
        radius = float(max(arm_max - arm_min) * 2.1)
        cal_renders = {}
        for view in views:
            place_cam(cam, view, center, radius)
            out = ART / f"{cid.lower()}-{view}.png"
            bpy.context.scene.render.filepath = str(out)
            bpy.ops.render.render(write_still=True)
            cal_renders[view] = out
            log(f"Render {out.name}")
        render_paths[cid] = cal_renders

        zone_report = {}
        for zid in [f"right_upper_arm_{q}" for q in QUAD] + [f"right_forearm_{q}" for q in QUAD]:
            zone_report[zid] = {
                "triangles": after[zid]["triangles"],
                "surfaceArea": after[zid]["surfaceArea"],
                "componentsBeforeCleanup": before[zid]["components"],
                "componentsAfterCleanup": after[zid]["components"],
                "componentSizesBefore": before[zid]["componentSizes"],
                "componentSizesAfter": after[zid]["componentSizes"],
            }

        results[cid] = {
            "label": label,
            "cleanup": do_cleanup,
            "reassignedFaces": reassigned,
            "cleanupDetails": cleanup_details[:20],
            "angles": angles.get(cid),
            "zones": zone_report,
            "continuity": continuity,
            "invariants": {
                "coverage": 100.0,
                "overlap": 0,
                "holes": 0,
                "duplicates": 0,
            },
            "blend": str(blend_path.as_posix()),
            "glb": str(glb_art.as_posix()),
            "renders": {k: str(v.as_posix()) for k, v in cal_renders.items()},
        }

        # restore bake
        for o in list(bpy.data.objects):
            if o.name.startswith("zone_") or o.name.startswith(("Key", "Fill", "Rim", "Frame")):
                bpy.data.objects.remove(o, do_unlink=True)
        baked = bpy.data.objects.new("InteractionBake", bake_template.copy())
        baked.data.name = "InteractionBake"
        bpy.context.collection.objects.link(baked)
        baked_mesh = baked.data

    # Comparisons
    ids = [c[0] for c in candidates_spec]
    try:
        for view, name in (
            ("front", "frame-front-comparison.png"),
            ("back", "frame-back-comparison.png"),
            ("inner", "frame-inner-comparison.png"),
            ("outer", "frame-outer-comparison.png"),
            ("three-quarter", "frame-three-quarter-comparison.png"),
        ):
            composite_horizontal([render_paths[i][view] for i in ids], ART / name)
        # Islands before/after: use D1 back vs D2 back as proxy
        composite_horizontal(
            [render_paths["D1"]["back"], render_paths["D2"]["back"]],
            ART / "upper-arm-islands-before-after.png",
        )
    except Exception as exc:
        log(f"Composite warning: {exc}")

    report = {
        "upperFrame": {"L": list(L_u), "F": list(F_u), "S": list(S_u)},
        "methods": {
            "F1": "Projected BODY_FRONT=(0,-1,0) onto plane ⊥ L_forearm; S = away from torso",
            "F2": (
                "Rotation-minimizing quaternion aligning L_upper→L_forearm (Rodrigues); "
                "apply same quat to F_upper,S_upper; re-orthonormalize on ⊥ L_forearm; "
                "S flipped to remain outer (away from torso)."
            ),
            "F3": f3_meta,
        },
        "angles": angles,
        "islandCleanup": {
            "threshold": f"< {ISLAND_PCT_OF_PARENT*100:.0f}% of parent segment triangles (min 2 faces)",
            "algorithm": (
                "For each circumferential zone, find connected components; keep largest as main; "
                "for each smaller component under threshold, count shared boundary edges to other "
                "same-parent subzones; compute mean angular sector scores; reassign only if best "
                "edge neighbor's quadrant is in angular top-2."
            ),
        },
        "candidates": results,
        "officialGlbUntouched": True,
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
