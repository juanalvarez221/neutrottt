"""
Public base region partition from BodyVisual source topology.

Authority: measured landmarks + local anatomical frames + surface region growing.
NOT a join of the 81 technical InteractionModel zones.
"""

from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass, field

from mathutils import Vector

from .anatomical_frames import build_upper_arm_frame, transport_forearm_frame
from .geometry import arm_polyline_param, face_area, project_point_on_segment
from .island_cleanup import build_edge_face_map, connected_components


# ---------------------------------------------------------------------------
# Taxonomy
# ---------------------------------------------------------------------------

PUBLIC_BASE_SELECTABLE = (
    "head_top_surface",
    "head_left_surface",
    "head_right_surface",
    "head_back_surface",
    "neck_front_surface",
    "neck_back_surface",
    "neck_left_surface",
    "neck_right_surface",
    "left_pectoral_region",
    "right_pectoral_region",
    "full_abdomen_region",
    "left_ribs_region",
    "right_ribs_region",
    "upper_back_region",
    "lower_back_region",
    "right_shoulder_surface",
    "left_shoulder_surface",
    "right_biceps_surface",
    "left_biceps_surface",
    "right_triceps_surface",
    "left_triceps_surface",
    "right_forearm_inner_surface",
    "left_forearm_inner_surface",
    "right_forearm_outer_surface",
    "left_forearm_outer_surface",
    "right_hand_surface",
    "left_hand_surface",
    "right_thigh_front_surface",
    "right_thigh_back_surface",
    "right_thigh_inner_surface",
    "right_thigh_outer_surface",
    "left_thigh_front_surface",
    "left_thigh_back_surface",
    "left_thigh_inner_surface",
    "left_thigh_outer_surface",
    "right_shin_surface",
    "left_shin_surface",
    "right_calf_surface",
    "left_calf_surface",
    "right_foot_surface",
    "left_foot_surface",
    "left_hip_surface",
    "right_hip_surface",
    "left_glute_surface",
    "right_glute_surface",
)

ROUTING_ONLY_BASE = (
    "right_elbow_transition",
    "left_elbow_transition",
    "right_wrist_transition",
    "left_wrist_transition",
    "right_knee_transition",
    "left_knee_transition",
    "right_ankle_transition",
    "left_ankle_transition",
)

NON_SELECTABLE_BASE = (
    "face_non_selectable",
    "genital_non_selectable",
    "helper_non_selectable",
)

ALL_CLASSIFIED = PUBLIC_BASE_SELECTABLE + ROUTING_ONLY_BASE + NON_SELECTABLE_BASE


@dataclass
class PublicLandmarks:
    """Measured landmarks in world space (after bake transform)."""

    body_height: float
    shoulder_width: float
    chest_width: float
    waist_width: float
    hip_width: float
    neck_base: Vector
    upper_chest: Vector
    chest_lower: Vector
    waist_level: Vector
    pelvis: Vector
    clavicle_l: Vector
    clavicle_r: Vector
    shoulder_l: Vector
    shoulder_r: Vector
    elbow_l: Vector
    elbow_r: Vector
    wrist_l: Vector
    wrist_r: Vector
    hand_l: Vector
    hand_r: Vector
    hip_l: Vector
    hip_r: Vector
    knee_l: Vector
    knee_r: Vector
    ankle_l: Vector
    ankle_r: Vector
    foot_l: Vector
    foot_r: Vector
    head: Vector
    nipple_l: Vector | None
    nipple_r: Vector | None
    torso_center: Vector
    body_up: Vector
    body_front: Vector
    body_right: Vector  # anatomical right
    axillary_z: float
    sternum_x: float

    def to_dict(self) -> dict:
        def v(p: Vector | None):
            if p is None:
                return None
            return [round(p.x, 5), round(p.y, 5), round(p.z, 5)]

        return {
            "body_height": round(self.body_height, 5),
            "shoulder_width": round(self.shoulder_width, 5),
            "chest_width": round(self.chest_width, 5),
            "waist_width": round(self.waist_width, 5),
            "hip_width": round(self.hip_width, 5),
            "neck_base": v(self.neck_base),
            "upper_chest": v(self.upper_chest),
            "chest_lower": v(self.chest_lower),
            "waist_level": v(self.waist_level),
            "pelvis": v(self.pelvis),
            "clavicle_l": v(self.clavicle_l),
            "clavicle_r": v(self.clavicle_r),
            "shoulder_l": v(self.shoulder_l),
            "shoulder_r": v(self.shoulder_r),
            "elbow_l": v(self.elbow_l),
            "elbow_r": v(self.elbow_r),
            "wrist_l": v(self.wrist_l),
            "wrist_r": v(self.wrist_r),
            "hip_l": v(self.hip_l),
            "hip_r": v(self.hip_r),
            "knee_l": v(self.knee_l),
            "knee_r": v(self.knee_r),
            "ankle_l": v(self.ankle_l),
            "ankle_r": v(self.ankle_r),
            "head": v(self.head),
            "nipple_l": v(self.nipple_l),
            "nipple_r": v(self.nipple_r),
            "torso_center": v(self.torso_center),
            "body_up": v(self.body_up),
            "body_front": v(self.body_front),
            "body_right": v(self.body_right),
            "axillary_z": round(self.axillary_z, 5),
            "sternum_x": round(self.sternum_x, 5),
        }


@dataclass
class PartitionResult:
    face_region: dict[int, str]
    landmarks: PublicLandmarks
    stats: dict[str, dict] = field(default_factory=dict)
    adjacency: dict[str, list[str]] = field(default_factory=dict)
    validation: dict = field(default_factory=dict)


def bone_head(rig, name: str) -> Vector | None:
    bone = rig.pose.bones.get(name) or rig.data.bones.get(name)
    if bone is None:
        return None
    if hasattr(bone, "head"):
        # pose bone
        return rig.matrix_world @ bone.head
    return rig.matrix_world @ bone.head_local


def vg_centroid(obj, group_name: str, weight_min: float = 0.25) -> Vector | None:
    if group_name not in obj.vertex_groups:
        return None
    gidx = obj.vertex_groups[group_name].index
    mesh = obj.data
    mw = obj.matrix_world
    acc = Vector((0, 0, 0))
    wsum = 0.0
    for v in mesh.vertices:
        for g in v.groups:
            if g.group == gidx and g.weight >= weight_min:
                acc += (mw @ v.co) * g.weight
                wsum += g.weight
                break
    if wsum < 1e-8:
        return None
    return acc / wsum


def vertex_weight(v, gidx: int) -> float:
    for g in v.groups:
        if g.group == gidx:
            return g.weight
    return 0.0


def measure_width_at_z(mesh, mw, z: float, band: float, front_only: bool = False) -> float:
    xs = []
    for poly in mesh.polygons:
        c = Vector((0, 0, 0))
        for vi in poly.vertices:
            c += mw @ mesh.vertices[vi].co
        c /= float(len(poly.vertices))
        if abs(c.z - z) > band:
            continue
        if front_only and c.y > 0.05:
            continue
        xs.append(c.x)
    if len(xs) < 4:
        return 0.0
    return max(xs) - min(xs)


def build_landmarks(baked, rig, offset: Vector) -> PublicLandmarks:
    def b(name: str) -> Vector:
        p = bone_head(rig, name)
        if p is None:
            raise RuntimeError(f"Missing bone {name}")
        return p + offset

    pelvis = b("pelvis")
    spine01 = b("spine_01")
    spine02 = b("spine_02")
    spine03 = b("spine_03")
    neck = b("neck_01")
    head = b("head")
    clav_l = b("clavicle_l")
    clav_r = b("clavicle_r")
    sh_l = b("upperarm_l")
    sh_r = b("upperarm_r")
    el_l = b("lowerarm_l")
    el_r = b("lowerarm_r")
    wr_l = b("hand_l")
    wr_r = b("hand_r")
    hip_l = b("thigh_l")
    hip_r = b("thigh_r")
    kn_l = b("calf_l")
    kn_r = b("calf_r")
    an_l = b("foot_l")
    an_r = b("foot_r")

    # Distal tips from toe / finger bones when available
    tip_l = bone_head(rig, "toe_l") or bone_head(rig, "toes_l")
    tip_r = bone_head(rig, "toe_r") or bone_head(rig, "toes_r")
    # Foot bone head ≈ ankle; extend tip along -Y (anterior-inferior) for a real foot segment
    if tip_l is None:
        tip_l = an_l + Vector((0.0, -0.18, -0.04))
    else:
        tip_l = tip_l + offset
    if tip_r is None:
        tip_r = an_r + Vector((0.0, -0.18, -0.04))
    else:
        tip_r = tip_r + offset
    foot_l = tip_l
    foot_r = tip_r
    hand_tip_l = bone_head(rig, "middle_03_l")
    hand_tip_r = bone_head(rig, "middle_03_r")
    hand_l = (hand_tip_l + offset) if hand_tip_l else wr_l + (wr_l - el_l).normalized() * 0.08
    hand_r = (hand_tip_r + offset) if hand_tip_r else wr_r + (wr_r - el_r).normalized() * 0.08

    body_up = (neck - pelvis).normalized()
    body_front = Vector((0, -1, 0))
    body_front = (body_front - body_front.dot(body_up) * body_up).normalized()
    body_right = body_front.cross(body_up).normalized()  # anatomical right (-X for MPFB)

    upper_chest = (clav_l + clav_r) * 0.5
    chest_lower = spine02
    waist_level = spine01.lerp(pelvis, 0.55)
    torso_center = spine02

    mw = baked.matrix_world
    mesh = baked.data
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for v in mesh.vertices:
        p = mw @ v.co
        mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z)))
        mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    body_height = mx.z - mn.z

    shoulder_width = (sh_l - sh_r).length
    chest_width = measure_width_at_z(mesh, mw, upper_chest.z - 0.04, 0.035) or shoulder_width * 0.85
    waist_width = measure_width_at_z(mesh, mw, waist_level.z, 0.04) or shoulder_width * 0.65
    hip_width = measure_width_at_z(mesh, mw, pelvis.z + 0.05, 0.04) or shoulder_width * 0.75

    axillary_z = (sh_l.z + sh_r.z) * 0.5 - 0.02
    sternum_x = (clav_l.x + clav_r.x) * 0.5

    # Nipple anchors: never trust a single bilateral VG centroid on the sternum.
    # Place reproducible seeds on the anterior chest from clavicle / chest width.
    half_chest_seed = max(chest_width * 0.5, shoulder_width * 0.32, 0.12)
    z_nip_seed = upper_chest.z * 0.42 + chest_lower.z * 0.58
    y_nip_seed = upper_chest.y - 0.07
    nipple_r = Vector((sternum_x - half_chest_seed * 0.42, y_nip_seed, z_nip_seed))
    nipple_l = Vector((sternum_x + half_chest_seed * 0.42, y_nip_seed, z_nip_seed))
    # Optional refinement from nipple VG if it is clearly lateral
    nip_vg = vg_centroid(baked, "nipple")
    if nip_vg is not None and abs(nip_vg.x - sternum_x) > half_chest_seed * 0.18:
        if nip_vg.x > sternum_x:
            nipple_l = Vector((nip_vg.x, nip_vg.y, nip_vg.z))
        else:
            nipple_r = Vector((nip_vg.x, nip_vg.y, nip_vg.z))

    return PublicLandmarks(
        body_height=body_height,
        shoulder_width=shoulder_width,
        chest_width=chest_width,
        waist_width=waist_width,
        hip_width=hip_width,
        neck_base=neck,
        upper_chest=upper_chest,
        chest_lower=chest_lower,
        waist_level=waist_level,
        pelvis=pelvis,
        clavicle_l=clav_l,
        clavicle_r=clav_r,
        shoulder_l=sh_l,
        shoulder_r=sh_r,
        elbow_l=el_l,
        elbow_r=el_r,
        wrist_l=wr_l,
        wrist_r=wr_r,
        hand_l=hand_l,
        hand_r=hand_r,
        hip_l=hip_l,
        hip_r=hip_r,
        knee_l=kn_l,
        knee_r=kn_r,
        ankle_l=an_l,
        ankle_r=an_r,
        foot_l=foot_l,
        foot_r=foot_r,
        head=head,
        nipple_l=nipple_l,
        nipple_r=nipple_r,
        torso_center=torso_center,
        body_up=body_up,
        body_front=body_front,
        body_right=body_right,
        axillary_z=axillary_z,
        sternum_x=sternum_x,
    )


def face_centroid(mesh, mw, poly) -> Vector:
    c = Vector((0, 0, 0))
    for vi in poly.vertices:
        c += mw @ mesh.vertices[vi].co
    return c / float(len(poly.vertices))


def face_normal(mesh, mw, poly) -> Vector:
    return (mw.to_3x3() @ poly.normal).normalized()


def avg_weight(mesh, poly, gidx: int) -> float:
    if gidx < 0:
        return 0.0
    s = 0.0
    for vi in poly.vertices:
        s += vertex_weight(mesh.vertices[vi], gidx)
    return s / float(len(poly.vertices))


def circumferential_sector(frame, rel: Vector) -> str:
    """Map vector into front/back/inner/outer around limb frame."""
    F, S = frame.F, frame.S
    # Project into FS plane
    x = rel.dot(F)
    y = rel.dot(S)
    ang = math.degrees(math.atan2(y, x))  # 0 = front, + = outer
    # Collapse to two hemispheres for forearm / lower leg when needed
    return ang


def sector_quad(ang: float) -> str:
    # front: [-55, 55], outer: (55, 125], back: (125, 180] U [-180, -125), inner: [-125, -55)
    if -55 <= ang <= 55:
        return "front"
    if 55 < ang <= 125:
        return "outer"
    if -125 <= ang < -55:
        return "inner"
    return "back"


def sector_hemi(ang: float) -> str:
    """Anterior vs posterior hemisphere."""
    if -90 <= ang <= 90:
        return "front"
    return "back"


def grow_region(
    seeds: set[int],
    allowed: set[int],
    adj: dict[int, set[int]],
    accept_fn,
) -> set[int]:
    out: set[int] = set()
    q = deque()
    for s in seeds:
        if s in allowed and accept_fn(s):
            out.add(s)
            q.append(s)
    while q:
        fi = q.popleft()
        for nb in adj.get(fi, ()):
            if nb in out or nb not in allowed:
                continue
            if accept_fn(nb):
                out.add(nb)
                q.append(nb)
    return out


def smooth_boundary(face_region: dict[int, str], adj: dict[int, set[int]], region_id: str, passes: int = 2):
    """Geodesic-ish majority vote on boundary faces."""
    for _ in range(passes):
        flips = []
        for fi, rid in list(face_region.items()):
            if rid != region_id:
                continue
            counts: dict[str, int] = defaultdict(int)
            for nb in adj.get(fi, ()):
                counts[face_region.get(nb, "")] += 1
            if not counts:
                continue
            # If mostly surrounded by another single region, leave; else keep
            best = max(counts.items(), key=lambda kv: kv[1])
            own = counts.get(region_id, 0)
            if best[0] and best[0] != region_id and best[1] >= 3 and own <= 1:
                flips.append((fi, best[0]))
        for fi, nr in flips:
            face_region[fi] = nr


def partition_public_regions(baked, rig, offset: Vector) -> PartitionResult:
    mesh = baked.data
    mw = baked.matrix_world
    lm = build_landmarks(baked, rig, offset)
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}

    centroids: dict[int, Vector] = {}
    normals: dict[int, Vector] = {}
    areas: dict[int, float] = {}
    for poly in mesh.polygons:
        centroids[poly.index] = face_centroid(mesh, mw, poly)
        normals[poly.index] = face_normal(mesh, mw, poly)
        areas[poly.index] = face_area(mesh, poly, mw)

    edge_map = build_edge_face_map(mesh)
    adj: dict[int, set[int]] = defaultdict(set)
    for faces in edge_map.values():
        for i in range(len(faces)):
            for j in range(i + 1, len(faces)):
                a, b = faces[i], faces[j]
                adj[a].add(b)
                adj[b].add(a)

    face_region: dict[int, str] = {}
    all_faces = set(centroids.keys())

    # --- helper / genital / face non-selectable ---
    helper_names = [n for n in vg_map if n.startswith("helper-") or n in ("HelperGeometry", "JointCubes")]
    genital_names = [n for n in ("genitals", "helper-genital") if n in vg_map]
    face_names = [n for n in ("lips", "joint-jaw", "joint-l-eye", "joint-r-eye", "joint-mouth") if n in vg_map]
    scalp_g = vg_map.get("scalp", -1)
    ear_g = vg_map.get("ears", -1)

    for fi, c in centroids.items():
        poly = mesh.polygons[fi]
        w_helper = max((avg_weight(mesh, poly, vg_map[n]) for n in helper_names), default=0.0)
        w_gen = max((avg_weight(mesh, poly, vg_map[n]) for n in genital_names), default=0.0)
        w_face = max((avg_weight(mesh, poly, vg_map[n]) for n in face_names), default=0.0)
        if w_helper > 0.35:
            face_region[fi] = "helper_non_selectable"
        elif w_gen > 0.25:
            face_region[fi] = "genital_non_selectable"
        elif w_face > 0.28 and c.z > lm.neck_base.z - 0.02:
            # Face: anterior cephalic, not scalp
            n = normals[fi]
            if n.dot(lm.body_front) > 0.15:
                face_region[fi] = "face_non_selectable"

    remaining = all_faces - set(face_region.keys())

    # --- arms (segment-first: nearest limb segment, then longitudinal bands) ---
    for side, sh, el, wr, hand, prefix in (
        ("right", lm.shoulder_r, lm.elbow_r, lm.wrist_r, lm.hand_r, "right"),
        ("left", lm.shoulder_l, lm.elbow_l, lm.wrist_l, lm.hand_l, "left"),
    ):
        ua_len = max((el - sh).length, 1e-6)
        fa_len = max((wr - el).length, 1e-6)
        hand_len = max((hand - wr).length, 0.05)
        ua_frame = build_upper_arm_frame(sh, el, lm.torso_center, lm.body_front)
        fa_frame, _ = transport_forearm_frame(ua_frame, el, wr, lm.torso_center)

        bones = (
            f"clavicle_{'r' if side == 'right' else 'l'}",
            f"upperarm_{'r' if side == 'right' else 'l'}",
            f"lowerarm_{'r' if side == 'right' else 'l'}",
            f"hand_{'r' if side == 'right' else 'l'}",
        )
        gidxs = [vg_map[n] for n in bones if n in vg_map]
        max_limb_dist = 0.095

        # Collect upper-arm mid faces first; calibrate anterior axis so biceps≠0
        ua_mid: list[tuple[int, Vector]] = []

        for fi in list(remaining):
            c = centroids[fi]
            poly = mesh.polygons[fi]
            w_arm = max((avg_weight(mesh, poly, gi) for gi in gidxs), default=0.0)
            s_ua, d_ua = arm_polyline_param(c, [sh, el])
            s_fa, d_fa = arm_polyline_param(c, [el, wr])
            s_h, d_h = arm_polyline_param(c, [wr, hand])
            near = min(d_ua, d_fa, d_h)
            if near > max_limb_dist and w_arm < 0.18:
                continue
            if near > max_limb_dist * 1.35:
                continue

            if d_h <= d_fa and d_h <= d_ua:
                t_hand = s_h / hand_len
                rid = (
                    f"{prefix}_wrist_transition"
                    if t_hand < 0.22
                    else f"{prefix}_hand_surface"
                )
                face_region[fi] = rid
                remaining.discard(fi)
            elif d_fa <= d_ua:
                t_fa = s_fa / fa_len
                if t_fa < 0.14:
                    face_region[fi] = f"{prefix}_elbow_transition"
                    remaining.discard(fi)
                elif t_fa > 0.86:
                    face_region[fi] = f"{prefix}_wrist_transition"
                    remaining.discard(fi)
                else:
                    closest, _, _ = project_point_on_segment(c, el, wr)
                    rel = c - closest
                    inner_score = -rel.dot(fa_frame.S)
                    face_region[fi] = (
                        f"{prefix}_forearm_inner_surface"
                        if inner_score >= 0.0
                        else f"{prefix}_forearm_outer_surface"
                    )
                    remaining.discard(fi)
            else:
                t_ua = s_ua / ua_len
                if t_ua < 0.18:
                    face_region[fi] = f"{prefix}_shoulder_surface"
                    remaining.discard(fi)
                elif t_ua > 0.88:
                    face_region[fi] = f"{prefix}_elbow_transition"
                    remaining.discard(fi)
                else:
                    closest, _, _ = project_point_on_segment(c, sh, el)
                    rel = c - closest
                    ua_mid.append((fi, rel))

        F_ua = ua_frame.F.normalized()
        if ua_mid:
            # Pick F orientation so the "anterior" set faces body_front more
            def frontness(sign: float) -> float:
                acc = 0.0
                n = 0
                for fi, rel in ua_mid:
                    if rel.dot(F_ua) * sign >= 0.0:
                        acc += normals[fi].dot(lm.body_front)
                        n += 1
                return acc / max(n, 1)

            if frontness(1.0) < frontness(-1.0):
                F_ua = -F_ua
            # Median split if still degenerate (<20% on a side)
            scores = [rel.dot(F_ua) for _fi, rel in ua_mid]
            pos = sum(1 for s in scores if s >= 0.0)
            use_median = pos < len(scores) * 0.2 or pos > len(scores) * 0.8
            thr = sorted(scores)[len(scores) // 2] if use_median else 0.0
        else:
            thr = 0.0
        for fi, rel in ua_mid:
            anterior = rel.dot(F_ua) >= thr
            face_region[fi] = (
                f"{prefix}_biceps_surface" if anterior else f"{prefix}_triceps_surface"
            )
            remaining.discard(fi)

    # --- legs (segment-first) ---
    from .anatomical_frames import rotation_minimizing_quat

    for side, hip, knee, ankle, foot, prefix in (
        ("right", lm.hip_r, lm.knee_r, lm.ankle_r, lm.foot_r, "right"),
        ("left", lm.hip_l, lm.knee_l, lm.ankle_l, lm.foot_l, "left"),
    ):
        thigh_len = max((knee - hip).length, 1e-6)
        shin_len = max((ankle - knee).length, 1e-6)
        foot_len = max((foot - ankle).length, 0.05)
        L_th = (knee - hip).normalized()
        F_th = lm.body_front - lm.body_front.dot(L_th) * L_th
        if F_th.length < 1e-8:
            F_th = Vector((0, -1, 0))
        F_th = F_th.normalized()
        mid = (hip + knee) * 0.5
        to_torso = lm.torso_center - mid
        to_torso = to_torso - to_torso.dot(L_th) * L_th
        S_th = (-to_torso).normalized() if to_torso.length > 1e-8 else L_th.cross(F_th).normalized()
        S_th = S_th - S_th.dot(L_th) * L_th - S_th.dot(F_th) * F_th
        if S_th.length < 1e-8:
            S_th = L_th.cross(F_th)
        S_th = S_th.normalized()

        L_sh = (ankle - knee).normalized()
        q = rotation_minimizing_quat(L_th, L_sh)
        F_sh = (q @ F_th).normalized()
        S_sh = (q @ S_th).normalized()

        bones = (
            f"thigh_{'r' if side == 'right' else 'l'}",
            f"calf_{'r' if side == 'right' else 'l'}",
            f"foot_{'r' if side == 'right' else 'l'}",
        )
        gidxs = [vg_map[n] for n in bones if n in vg_map]
        max_limb_dist = 0.11

        # Pass 1 collect lower-leg / thigh faces for calibrated split
        leg_faces: list[tuple[int, str, Vector, Vector]] = []
        for fi in list(remaining):
            c = centroids[fi]
            poly = mesh.polygons[fi]
            w_leg = max((avg_weight(mesh, poly, gi) for gi in gidxs), default=0.0)
            s_th, d_th = arm_polyline_param(c, [hip, knee])
            s_sh, d_sh = arm_polyline_param(c, [knee, ankle])
            s_ft, d_ft = arm_polyline_param(c, [ankle, foot])
            near = min(d_th, d_sh, d_ft)
            if near > max_limb_dist and w_leg < 0.18:
                continue
            if near > max_limb_dist * 1.4:
                continue

            if d_ft <= d_sh and d_ft <= d_th:
                t_ft = s_ft / foot_len
                face_region[fi] = (
                    f"{prefix}_ankle_transition" if t_ft < 0.2 else f"{prefix}_foot_surface"
                )
                remaining.discard(fi)
            elif d_sh <= d_th:
                t_sh = s_sh / shin_len
                if t_sh < 0.12:
                    face_region[fi] = f"{prefix}_knee_transition"
                    remaining.discard(fi)
                elif t_sh > 0.88:
                    face_region[fi] = f"{prefix}_ankle_transition"
                    remaining.discard(fi)
                else:
                    closest, _, _ = project_point_on_segment(c, knee, ankle)
                    rel = c - closest
                    leg_faces.append((fi, "shinseg", closest, rel))
            else:
                t_th = s_th / thigh_len
                if t_th > 0.88:
                    face_region[fi] = f"{prefix}_knee_transition"
                    remaining.discard(fi)
                else:
                    closest, _, _ = project_point_on_segment(c, hip, knee)
                    rel = c - closest
                    leg_faces.append((fi, "thigh", closest, rel))

        shin_items = [t for t in leg_faces if t[1] == "shinseg"]
        thigh_items = [t for t in leg_faces if t[1] == "thigh"]

        def cal_F(F0: Vector, items: list) -> Vector:
            F = F0.normalized()
            scores = [rel.dot(F) for _a, _b, _c, rel in items]
            if not scores:
                return F
            pos = sum(1 for s in scores if s >= 0.0)
            if pos < len(scores) * 0.28 or pos > len(scores) * 0.72:
                if (len(scores) - pos) > pos:
                    F = -F
            return F

        F_shin = cal_F(F_sh, shin_items)
        F_thigh = cal_F(F_th, thigh_items)

        # Orient shin anterior axis by surface normals vs body_front
        if shin_items:
            def shin_frontness(sign: float) -> float:
                acc = 0.0
                n = 0
                for fi, _s, _c, rel in shin_items:
                    if rel.dot(F_shin) * sign >= 0.0:
                        acc += normals[fi].dot(lm.body_front)
                        n += 1
                return acc / max(n, 1)

            if shin_frontness(1.0) < shin_frontness(-1.0):
                F_shin = -F_shin
            scores = [rel.dot(F_shin) for _a, _b, _c, rel in shin_items]
            pos = sum(1 for s in scores if s >= 0.0)
            shin_thr = (
                sorted(scores)[len(scores) // 2]
                if pos < len(scores) * 0.2 or pos > len(scores) * 0.8
                else 0.0
            )
        else:
            shin_thr = 0.0

        for fi, _seg, closest, rel in shin_items:
            face_region[fi] = (
                f"{prefix}_shin_surface"
                if rel.dot(F_shin) >= shin_thr
                else f"{prefix}_calf_surface"
            )
            remaining.discard(fi)

        # Thigh quadrants: driven by surface normal vs body_front / body side
        # (more stable than radial atan2 on A-pose limbs).
        S_use = S_th.normalized()
        # Ensure S points laterally outward (away from sternum)
        if thigh_items:
            sample_rel = thigh_items[len(thigh_items) // 2][3]
            # Outer should correlate with increasing |x| away from center
            outer_sign = 1.0 if (prefix == "left") else -1.0
            if S_use.x * outer_sign < 0:
                S_use = -S_use

        for fi, _seg, _closest, rel in thigh_items:
            n = normals[fi]
            nf = n.dot(lm.body_front)
            ns = n.dot(S_use)
            # Explicit posterior / anterior bands first, then laterals
            if nf <= -0.12:
                quad = "back"
            elif nf >= 0.18:
                quad = "front"
            elif ns >= 0.0:
                quad = "outer"
            else:
                quad = "inner"
            face_region[fi] = f"{prefix}_thigh_{quad}_surface"
            remaining.discard(fi)

    # --- head / neck ---
    head_g = vg_map.get("head", -1)
    neck_g = vg_map.get("neck_01", -1)
    for fi in list(remaining):
        c = centroids[fi]
        poly = mesh.polygons[fi]
        w_head = avg_weight(mesh, poly, head_g)
        w_neck = avg_weight(mesh, poly, neck_g)
        w_scalp = avg_weight(mesh, poly, scalp_g)
        w_ear = avg_weight(mesh, poly, ear_g)
        n = normals[fi]
        if w_head > 0.18 or (c.z > lm.neck_base.z + 0.04 and w_neck < 0.15):
            # Classify scalp sides
            rel = c - lm.head
            if w_scalp > 0.2 or n.dot(lm.body_up) > 0.55:
                face_region[fi] = "head_top_surface"
            elif n.dot(lm.body_front) < -0.35:
                face_region[fi] = "head_back_surface"
            elif c.x > lm.sternum_x or w_ear > 0.15 and c.x > 0:
                face_region[fi] = "head_left_surface"
            else:
                face_region[fi] = "head_right_surface"
            remaining.discard(fi)
        elif w_neck > 0.15 or (lm.clavicle_l.z < c.z < lm.neck_base.z + 0.06 and abs(c.x) < lm.shoulder_width * 0.35):
            if n.dot(lm.body_front) > 0.35:
                face_region[fi] = "neck_front_surface"
            elif n.dot(lm.body_front) < -0.35:
                face_region[fi] = "neck_back_surface"
            elif c.x > lm.sternum_x:
                face_region[fi] = "neck_left_surface"
            else:
                face_region[fi] = "neck_right_surface"
            remaining.discard(fi)

    # --- pelvis: glutes / hips ---
    pelvis_g = vg_map.get("pelvis", -1)
    for fi in list(remaining):
        c = centroids[fi]
        poly = mesh.polygons[fi]
        w_pelvis = avg_weight(mesh, poly, pelvis_g)
        n = normals[fi]
        if w_pelvis < 0.12 and c.z > lm.waist_level.z:
            continue
        if c.z > lm.waist_level.z + 0.02:
            continue
        if c.z < lm.pelvis.z - 0.08:
            continue
        # Glute: posterior pelvis
        if n.dot(lm.body_front) < -0.25 and c.z < lm.waist_level.z - 0.02:
            face_region[fi] = "left_glute_surface" if c.x > lm.sternum_x else "right_glute_surface"
            remaining.discard(fi)
        elif abs(c.x) > lm.hip_width * 0.22 and c.z < lm.waist_level.z:
            face_region[fi] = "left_hip_surface" if c.x > lm.sternum_x else "right_hip_surface"
            remaining.discard(fi)

    # --- torso frame: centerline + surface azimuth (front=0, right=π/2, back=π) ---
    def torso_center_at_height(h: float) -> Vector:
        """Centro real del torso a altura h (no cilindro perfecto)."""
        band = 0.045
        # Solo caras cercanas al torso (excluir brazos lejanos por |x|)
        pts = [
            centroids[i]
            for i, c in centroids.items()
            if abs(c.z - h) <= band and abs(c.x - lm.sternum_x) < lm.shoulder_width * 0.55
        ]
        if len(pts) < 6:
            t = (h - lm.pelvis.z) / max(lm.neck_base.z - lm.pelvis.z, 1e-6)
            t = max(0.0, min(1.0, t))
            spine = lm.pelvis.lerp(lm.neck_base, t)
            return Vector((lm.sternum_x, spine.y, h))
        ax = sum(p.x for p in pts) / len(pts)
        ay = sum(p.y for p in pts) / len(pts)
        return Vector((ax, ay, h))

    def surface_azimuth(c: Vector) -> float:
        """Azimuth alrededor del torso: 0=frente (−Y), +π/2=derecha anatómica (−X)."""
        center = torso_center_at_height(c.z)
        rel = Vector((c.x - center.x, c.y - center.y, 0.0))
        if rel.length < 1e-8:
            return 0.0
        # body_front=(0,-1,0), body_right≈(−1,0,0) for MPFB facing −Y
        fwd = Vector((lm.body_front.x, lm.body_front.y, 0.0)).normalized()
        right = Vector((lm.body_right.x, lm.body_right.y, 0.0)).normalized()
        return math.atan2(rel.dot(right), rel.dot(fwd))

    # --- torso: pectorals via region growing ---
    half_chest = max(lm.chest_width * 0.5, 0.12)
    nip_r = lm.nipple_r
    nip_l = lm.nipple_l
    z_nip = (nip_r.z + nip_l.z) * 0.5
    # Clavicle / superior: start BELOW clavicular joint (infraclavicular only)
    z_clav = min(lm.clavicle_l.z, lm.clavicle_r.z) - 0.015
    z_pec_hi = z_clav * 0.35 + z_nip * 0.65  # do not climb to clavicle
    # Inferior pectoral CURVE — short vertical span, wider laterally
    z_pec_lo_mid = z_nip - 0.018
    z_pec_lo_lat = z_nip - 0.04

    def pectoral_z_floor(lr_abs: float) -> float:
        t = min(1.0, lr_abs / (half_chest * 0.98))
        return z_pec_lo_mid + (z_pec_lo_lat - z_pec_lo_mid) * (t ** 0.55)

    def pectoral_accept(side: str):
        is_right = side == "right"

        def _fn(fi: int) -> bool:
            c = centroids[fi]
            n = normals[fi]
            if n.dot(lm.body_front) < 0.08:
                return False
            if is_right and c.x > lm.sternum_x + 0.012:
                return False
            if not is_right and c.x < lm.sternum_x - 0.012:
                return False
            if c.z > z_pec_hi:
                return False
            lr_abs = abs(c.x - lm.sternum_x)
            if c.z < pectoral_z_floor(lr_abs) - 0.006:
                return False
            if c.z < z_nip - 0.042:
                return False
            if lr_abs > half_chest * 1.35:
                return False
            az = abs(surface_azimuth(c))
            if az > math.radians(82):
                return False
            if c.y > 0.10:
                return False
            return True

        return _fn

    # Seeds: nipple neighborhood + infraclavicular band
    for side, nip, rid in (
        ("right", nip_r, "right_pectoral_region"),
        ("left", nip_l, "left_pectoral_region"),
    ):
        accept = pectoral_accept(side)
        seeds = set()
        for fi in remaining:
            c = centroids[fi]
            if not accept(fi):
                continue
            near_nip = (c - nip).length < 0.16
            infraclav = abs(c.z - (z_clav + z_nip) * 0.5) < 0.07 and abs(
                c.x - nip.x
            ) < half_chest * 0.55
            if near_nip or infraclav:
                seeds.add(fi)
        if not seeds:
            ranked = sorted(
                (fi for fi in remaining if accept(fi)),
                key=lambda fi: (centroids[fi] - nip).length,
            )
            seeds.update(ranked[:12])
        grown = grow_region(seeds, remaining, adj, accept)
        for fi in grown:
            face_region[fi] = rid
            remaining.discard(fi)

    # Limited sternal bridge within the SAME vertical pec band
    for fi in list(remaining):
        c = centroids[fi]
        n = normals[fi]
        if abs(c.x - lm.sternum_x) > half_chest * 0.16:
            continue
        if n.dot(lm.body_front) < 0.15:
            continue
        if c.z > z_pec_hi or c.z < z_pec_lo_mid - 0.008:
            continue
        face_region[fi] = (
            "right_pectoral_region" if c.x <= lm.sternum_x else "left_pectoral_region"
        )
        remaining.discard(fi)

    # Expand pecs into adjacent anterior torso faces (geodesic rings)
    def expand_pec(rid: str, accept_fn):
        frontier = {i for i, r in face_region.items() if r == rid}
        for _ in range(2):
            nxt = set()
            for fi in frontier:
                for nb in adj.get(fi, ()):
                    if nb not in remaining:
                        continue
                    if not accept_fn(nb):
                        continue
                    face_region[nb] = rid
                    remaining.discard(nb)
                    nxt.add(nb)
            if not nxt:
                break
            frontier = nxt

    expand_pec("right_pectoral_region", pectoral_accept("right"))
    expand_pec("left_pectoral_region", pectoral_accept("left"))

    # Hard clip: strip any pec face outside the anatomical band
    for fi, rid in list(face_region.items()):
        if rid not in ("right_pectoral_region", "left_pectoral_region"):
            continue
        c = centroids[fi]
        n = normals[fi]
        lr_abs = abs(c.x - lm.sternum_x)
        if (
            c.z > z_pec_hi
            or c.z < pectoral_z_floor(lr_abs) - 0.006
            or c.z < z_nip - 0.042
            or n.dot(lm.body_front) < 0.05
            or lr_abs > half_chest * 1.35
        ):
            del face_region[fi]
            remaining.add(fi)

    smooth_boundary(face_region, adj, "right_pectoral_region")
    smooth_boundary(face_region, adj, "left_pectoral_region")

    # --- abdomen (front continuous, immediately below pectoral inferior curve) ---
    for fi in list(remaining):
        c = centroids[fi]
        n = normals[fi]
        if n.dot(lm.body_front) < 0.12:
            continue
        lr_abs = abs(c.x - lm.sternum_x)
        # Start just under the pec floor at this lateral distance
        if c.z > pectoral_z_floor(lr_abs) + 0.01:
            continue
        if c.z < lm.pelvis.z + 0.02:
            continue
        if abs(surface_azimuth(c)) > math.radians(50):
            continue
        if abs(c.x - lm.sternum_x) > lm.waist_width * 0.50:
            continue
        if c.y > 0.08:
            continue
        face_region[fi] = "full_abdomen_region"
        remaining.discard(fi)

    # --- back (wide dorsal — azimuth posterior cone) ---
    back_split_z = (lm.chest_lower.z + lm.waist_level.z) * 0.52
    max_back_lr = lm.shoulder_width * 0.55
    for fi in list(remaining):
        c = centroids[fi]
        n = normals[fi]
        az = abs(surface_azimuth(c))
        posterior = n.dot(lm.body_front) < -0.02 or az > math.radians(110)
        if not posterior:
            continue
        if c.z > lm.neck_base.z - 0.015:
            continue
        if c.z < lm.pelvis.z + 0.05:
            continue
        if abs(c.x - lm.sternum_x) > max_back_lr:
            continue
        if c.z >= back_split_z:
            face_region[fi] = "upper_back_region"
        else:
            face_region[fi] = "lower_back_region"
        remaining.discard(fi)

    # --- ribs (TRUE lateral surfaces by azimuth, axilla → waist) ---
    for fi in list(remaining):
        c = centroids[fi]
        az = surface_azimuth(c)
        az_abs = abs(az)
        # Lateral band: between anterior and posterior cones
        if az_abs < math.radians(45) or az_abs > math.radians(130):
            continue
        if c.z > lm.axillary_z + 0.04:
            continue
        if c.z < lm.waist_level.z - 0.05:
            continue
        face_region[fi] = (
            "left_ribs_region" if c.x > lm.sternum_x else "right_ribs_region"
        )
        remaining.discard(fi)

    # --- residual torso cleanup (never inflate pecs vertically) ---
    for fi in list(remaining):
        c = centroids[fi]
        n = normals[fi]
        az_abs = abs(surface_azimuth(c))
        if c.z < lm.pelvis.z:
            face_region[fi] = "genital_non_selectable"
        elif n.dot(lm.body_front) < -0.1 or az_abs > math.radians(115):
            face_region[fi] = (
                "upper_back_region" if c.z >= back_split_z else "lower_back_region"
            )
        elif az_abs >= math.radians(45):
            face_region[fi] = (
                "left_ribs_region" if c.x > lm.sternum_x else "right_ribs_region"
            )
        else:
            # Anterior residual → abdomen only (pectorals already grown)
            face_region[fi] = "full_abdomen_region"
        remaining.discard(fi)

    # Island cleanup: absorb tiny components into neighboring majority region
    for rid in list(PUBLIC_BASE_SELECTABLE):
        faces = [i for i, r in face_region.items() if r == rid]
        if len(faces) < 2:
            continue
        comps = connected_components(mesh, faces)
        if len(comps) <= 1:
            continue
        comps_sorted = sorted(comps, key=len, reverse=True)
        for island in comps_sorted[1:]:
            if len(island) >= max(12, int(0.08 * len(faces))):
                continue
            for fi in island:
                votes: dict[str, int] = defaultdict(int)
                for nb in adj.get(fi, ()):
                    nr = face_region.get(nb)
                    if nr and nr != rid:
                        votes[nr] += 1
                if votes:
                    face_region[fi] = max(votes.items(), key=lambda kv: kv[1])[0]
                else:
                    for nb in adj.get(fi, ()):
                        nr = face_region.get(nb)
                        if nr:
                            face_region[fi] = nr
                            break

    # Stats + components
    stats: dict[str, dict] = {}
    for rid in ALL_CLASSIFIED:
        faces = [i for i, r in face_region.items() if r == rid]
        comps = connected_components(mesh, faces) if faces else []
        if not faces:
            continue
        xs = [centroids[i].x for i in faces]
        ys = [centroids[i].y for i in faces]
        zs = [centroids[i].z for i in faces]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        cz = sum(zs) / len(zs)
        stats[rid] = {
            "faceCount": len(faces),
            "triangleCount": sum(max(0, len(mesh.polygons[i].vertices) - 2) for i in faces),
            "surfaceArea": round(sum(areas[i] for i in faces), 6),
            "centroid": [round(cx, 5), round(cy, 5), round(cz, 5)],
            "bbox": [
                [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)],
                [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
            ],
            "widthX": round(max(xs) - min(xs), 4),
            "connectedComponents": len(comps),
            "classification": (
                "selectable"
                if rid in PUBLIC_BASE_SELECTABLE
                else ("routing_only" if rid in ROUTING_ONLY_BASE else "non_selectable")
            ),
        }

    # Adjacency from shared boundary edges
    region_adj: dict[str, set[str]] = defaultdict(set)
    for edge, faces in edge_map.items():
        if len(faces) < 2:
            continue
        regs = {face_region.get(f) for f in faces if f in face_region}
        regs.discard(None)
        regs = {r for r in regs if r in PUBLIC_BASE_SELECTABLE or r in ROUTING_ONLY_BASE}
        for a in regs:
            for b in regs:
                if a != b:
                    region_adj[a].add(b)

    adjacency = {k: sorted(v) for k, v in sorted(region_adj.items())}

    overlaps = 0
    unclass = len(all_faces) - len(face_region)
    disconnected = [
        rid
        for rid, s in stats.items()
        if s["classification"] == "selectable" and s["connectedComponents"] != 1
    ]
    side_mismatches = []
    for rid, s in stats.items():
        cx = s["centroid"][0]
        if rid.startswith("left_") and cx < lm.sternum_x - 0.02:
            side_mismatches.append(rid)
        if rid.startswith("right_") and cx > lm.sternum_x + 0.02:
            side_mismatches.append(rid)

    validation = {
        "totalFaces": len(all_faces),
        "classifiedFaces": len(face_region),
        "unclassified": unclass,
        "overlaps": overlaps,
        "disconnectedSelectable": disconnected,
        "leftRightMismatches": side_mismatches,
        "selectableCount": len([r for r in stats if stats[r]["classification"] == "selectable"]),
        "adjacencyEdgeCount": sum(len(v) for v in adjacency.values()) // 2,
    }

    return PartitionResult(
        face_region=face_region,
        landmarks=lm,
        stats=stats,
        adjacency=adjacency,
        validation=validation,
    )
