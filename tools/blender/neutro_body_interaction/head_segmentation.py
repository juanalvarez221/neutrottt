"""
Canonical head / neck / face / ear segmentation for Neutro Body V1.

Priority (Paso 31):
  1. ears
  2. neck
  3. face
  4. scalp/head remainder → top / back / left_side / right_side

Frame:
  HEAD_UP ≈ body.up (skull axis)
  HEAD_FRONT ≈ body.front projected ⊥ HEAD_UP (anterior)
  HEAD_RIGHT ≈ anatomical right (body.right)

Classification is camera-independent.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

from mathutils import Vector

from .arm_segmentation import vertex_weight
from .body_frame import BodyFrame
from .config import (
    HEAD_HELPER_VG_SUBSTRINGS,
    HEAD_ISLAND_CLEANUP,
    HEAD_ZONE_IDS,
)
from .geometry import face_area
from .island_cleanup import connected_components
from .island_cleanup_generic import cleanup_islands_generic


@dataclass(frozen=True)
class HeadLandmarks:
    neck_base: Vector
    jaw_level: Vector
    left_ear_center: Vector
    right_ear_center: Vector
    face_front_reference: Vector
    head_top: Vector


@dataclass(frozen=True)
class HeadFrame:
    origin: Vector
    up: Vector
    front: Vector
    right: Vector


@dataclass
class HeadSegmentationResult:
    face_zone: dict[int, str]
    universe_faces: set[int]
    landmarks: HeadLandmarks
    frame: HeadFrame
    metrics: dict[str, dict]
    components_before: dict[str, int]
    components_after: dict[str, int]
    triangles_reassigned: int


def build_head_frame(body: BodyFrame, lm: HeadLandmarks) -> HeadFrame:
    up = (lm.head_top - lm.neck_base).normalized()
    if up.length < 1e-6:
        up = body.up.copy()
    front = body.front - body.front.dot(up) * up
    if front.length < 1e-6:
        front = Vector((0.0, -1.0, 0.0)) - Vector((0.0, -1.0, 0.0)).dot(up) * up
    front = front.normalized()
    right = front.cross(up).normalized()
    # Prefer anatomical right toward right ear (-X in Neutro frame)
    toward_r = lm.right_ear_center - lm.left_ear_center
    toward_r = toward_r - toward_r.dot(up) * up
    if toward_r.length > 1e-6 and right.dot(toward_r.normalized()) < 0:
        right = -right
        front = -front
        right = front.cross(up).normalized()
    up = right.cross(front).normalized()
    origin = lm.jaw_level.copy()
    return HeadFrame(origin=origin, up=up, front=front, right=right)


def resolve_head_landmarks(
    mesh,
    mw,
    vg_map: dict[str, int],
    universe: set[int],
    neck_01: Vector,
    head_bone: Vector,
    head_tip: Vector | None,
    body: BodyFrame,
) -> HeadLandmarks:
    """Rebuild landmarks from geometry + bones (verify Paso-30 seeds)."""
    neck_base = neck_01.copy()
    head_top = head_tip.copy() if head_tip is not None else head_bone + body.up * 0.12

    ear_l: list[Vector] = []
    ear_r: list[Vector] = []
    jaw_pts: list[Vector] = []
    face_pts: list[Vector] = []

    ears_gi = vg_map.get("ears")
    jaw_gi = vg_map.get("joint-jaw")

    for fi in universe:
        poly = mesh.polygons[fi]
        c = Vector((0, 0, 0))
        w_ear = 0.0
        w_jaw = 0.0
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            p = mw @ v.co
            c += p
            if ears_gi is not None:
                w_ear += vertex_weight(v, ears_gi)
            if jaw_gi is not None:
                w_jaw += vertex_weight(v, jaw_gi)
        c /= float(n)
        w_ear /= float(n)
        w_jaw /= float(n)
        if w_ear >= 0.12:
            # body.right points to anatomical right: positive · right → right ear
            if (c - head_bone).dot(body.right) >= 0.0:
                ear_r.append(c)
            else:
                ear_l.append(c)
        if w_jaw >= 0.10:
            jaw_pts.append(c)
        # anterior facial candidates
        if (c - neck_base).dot(body.up) > 0.04 and (-c.y) > 0.02:
            face_pts.append(c)

    def avg(pts: list[Vector], fb: Vector) -> Vector:
        if not pts:
            return fb
        s = Vector((0, 0, 0))
        for p in pts:
            s += p
        return s / float(len(pts))

    # Fallbacks: ± anatomical right from head center (left = opposite of right)
    left_ear = avg(ear_l, head_bone - body.right * 0.075 + body.front * 0.02)
    right_ear = avg(ear_r, head_bone + body.right * 0.075 + body.front * 0.02)
    jaw_level = avg(jaw_pts, neck_base.lerp(head_bone, 0.45))
    face_front = avg(face_pts, head_bone + body.front * 0.08)
    return HeadLandmarks(
        neck_base=neck_base,
        jaw_level=jaw_level,
        left_ear_center=left_ear,
        right_ear_center=right_ear,
        face_front_reference=face_front,
        head_top=head_top,
    )


def _helper_weight(w: dict[str, float]) -> float:
    return max((w.get(n, 0.0) for n in HEAD_HELPER_VG_SUBSTRINGS), default=0.0)


def collect_cephalic_universe(
    mesh,
    mw,
    vg_map: dict[str, int],
    assigned69: set[int],
    neck_01: Vector,
    body: BodyFrame,
) -> set[int]:
    """
    Exterior cephalic faces = unassigned faces that are head/neck/ears related,
    excluding MakeHuman internal helpers and the pelvic/digit residuals.
    Seeded by the large head connected component (U01 analogue).
    """
    from .island_cleanup import build_edge_face_map

    candidates: set[int] = set()
    weigh_names = [
        n
        for n in vg_map
        if any(
            t in n.lower()
            for t in (
                "head",
                "neck",
                "ear",
                "jaw",
                "eye",
                "mouth",
                "face",
                "teeth",
                "tongue",
            )
        )
        or n in ("Left", "Right", "body")
    ]
    for poly in mesh.polygons:
        fi = poly.index
        if fi in assigned69:
            continue
        w_acc: dict[str, float] = defaultdict(float)
        c = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            c += mw @ v.co
            for name in weigh_names:
                w_acc[name] += vertex_weight(v, vg_map[name])
        c /= float(n)
        w = {k: val / float(n) for k, val in w_acc.items()}
        if _helper_weight(w) >= 0.20:
            continue
        # Height gate: near/above neck
        if (c - neck_01).dot(body.up) < -0.06:
            continue
        headish = max(
            w.get("head", 0.0),
            w.get("neck_01", 0.0),
            w.get("ears", 0.0),
            w.get("joint-jaw", 0.0),
            w.get("joint-head", 0.0),
        )
        if headish < 0.05 and c.z < neck_01.z - 0.02:
            continue
        # Exclude digit residuals (finger tips at hand height with digit VGs)
        digit = max(
            (w.get(n, 0.0) for n in weigh_names if any(d in n for d in ("index_", "middle_", "ring_", "pinky_"))),
            default=0.0,
        )
        if digit >= 0.10:
            continue
        candidates.add(fi)

    if not candidates:
        return set()

    # Keep largest connected component (= U01 head/neck block)
    comps = connected_components(mesh, list(candidates))
    comps.sort(
        key=lambda fs: sum(face_area(mesh, mesh.polygons[i], mw) for i in fs),
        reverse=True,
    )
    universe = set(comps[0])
    # Drop any remaining helper-dominated faces inside the component
    cleaned = set()
    for fi in universe:
        poly = mesh.polygons[fi]
        w_acc: dict[str, float] = defaultdict(float)
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            for name in HEAD_HELPER_VG_SUBSTRINGS:
                if name in vg_map:
                    w_acc[name] += vertex_weight(v, vg_map[name])
        w = {k: val / float(n) for k, val in w_acc.items()}
        if _helper_weight(w) >= 0.25:
            continue
        cleaned.add(fi)
    return cleaned if cleaned else universe


def _face_weights(mesh, fi: int, vg_map: dict[str, int], names: list[str]) -> dict[str, float]:
    poly = mesh.polygons[fi]
    w_acc: dict[str, float] = defaultdict(float)
    n = len(poly.vertices)
    for vi in poly.vertices:
        v = mesh.vertices[vi]
        for name in names:
            if name in vg_map:
                w_acc[name] += vertex_weight(v, vg_map[name])
    return {k: val / float(n) for k, val in w_acc.items()}


def _centroid(mesh, mw, fi: int) -> Vector:
    poly = mesh.polygons[fi]
    c = Vector((0, 0, 0))
    for vi in poly.vertices:
        c += mw @ mesh.vertices[vi].co
    return c / float(len(poly.vertices))


def segment_head_faces(
    mesh,
    mw,
    vg_map: dict[str, int],
    universe: set[int],
    lm: HeadLandmarks,
    frame: HeadFrame,
    body: BodyFrame,
) -> HeadSegmentationResult:
    """
    Classify each cephalic exterior face into exactly one of HEAD_ZONE_IDS.

    Algorithm:
      ears  — ears VG / proximity to ear centers + connectivity
      neck  — between neckBase and jawLevel band; quadrant by atan2(right, front)
      face  — anterior scalp below hairline / above jaw; L/R by sagittal (right axis)
      scalp — remainder: top by up-height; else angular sectors back/left/right
    """
    names = [
        n
        for n in vg_map
        if any(t in n.lower() for t in ("head", "neck", "ear", "jaw", "eye", "mouth"))
        or n in HEAD_HELPER_VG_SUBSTRINGS
    ]

    face_zone: dict[int, str] = {}
    ear_seed_l: set[int] = set()
    ear_seed_r: set[int] = set()

    neck_axis = lm.head_top - lm.neck_base
    neck_len = max(neck_axis.length, 1e-6)
    neck_dir = neck_axis / neck_len

    # --- Pass 1: ears ---
    for fi in universe:
        c = _centroid(mesh, mw, fi)
        w = _face_weights(mesh, fi, vg_map, names)
        ears_w = w.get("ears", 0.0)
        dl = (c - lm.left_ear_center).length
        dr = (c - lm.right_ear_center).length
        if ears_w >= 0.10 or min(dl, dr) < 0.048:
            if dl <= dr:
                ear_seed_l.add(fi)
            else:
                ear_seed_r.add(fi)

    # Grow ears slightly within universe by adjacency among ear-like faces
    from .island_cleanup import build_edge_face_map

    edge_map = build_edge_face_map(mesh, universe)

    def grow(seeds: set[int], other: set[int]) -> set[int]:
        out = set(seeds)
        frontier = list(seeds)
        while frontier:
            cur = frontier.pop()
            poly = mesh.polygons[cur]
            vs = list(poly.vertices)
            for i in range(len(vs)):
                e = tuple(sorted((vs[i], vs[(i + 1) % len(vs)])))
                for nb in edge_map.get(e, []):
                    if nb not in universe or nb in out or nb in other:
                        continue
                    c = _centroid(mesh, mw, nb)
                    w = _face_weights(mesh, nb, vg_map, names)
                    if w.get("ears", 0.0) >= 0.06 or min(
                        (c - lm.left_ear_center).length,
                        (c - lm.right_ear_center).length,
                    ) < 0.055:
                        out.add(nb)
                        frontier.append(nb)
        return out

    ear_l = grow(ear_seed_l, ear_seed_r)
    ear_r = grow(ear_seed_r, ear_l)
    for fi in ear_l:
        face_zone[fi] = "left_ear"
    for fi in ear_r:
        face_zone[fi] = "right_ear"

    # --- Pass 2: neck (strict collar between neckBase and jaw/ear) ---
    # Do NOT use a loose neck_w height gate — that steals occipital scalp.
    t_jaw = (lm.jaw_level - lm.neck_base).dot(neck_dir)
    ear_mid = (lm.left_ear_center + lm.right_ear_center) * 0.5
    t_ear = (ear_mid - lm.neck_base).dot(neck_dir)
    t_neck_hi = min(max(t_jaw + 0.022, 0.05), t_ear * 0.48)
    t_nape_hi = min(t_jaw + 0.048, t_ear * 0.55)
    for fi in universe:
        if fi in face_zone:
            continue
        c = _centroid(mesh, mw, fi)
        w = _face_weights(mesh, fi, vg_map, names)
        t = (c - lm.neck_base).dot(neck_dir)
        neck_w = w.get("neck_01", 0.0)
        head_w = w.get("head", 0.0)
        local = c - lm.neck_base
        planar = local - local.dot(frame.up) * frame.up
        front_n = planar.dot(frame.front) if planar.length > 1e-8 else 1.0
        in_band = -0.015 <= t <= t_neck_hi
        # Posterior nape climbs slightly higher toward skull base
        in_nape = front_n < 0.0 and -0.015 <= t <= t_nape_hi and head_w < 0.55
        is_neck = (in_band or in_nape) and (
            neck_w >= 0.05
            or (t <= t_jaw + 0.02 and head_w < 0.50)
            or (in_nape and neck_w + (1.0 - head_w) * 0.2 >= 0.08)
        )
        if not is_neck:
            continue
        if planar.length < 1e-8:
            face_zone[fi] = "neck_front"
            continue
        f = planar.dot(frame.front)
        r = planar.dot(frame.right)
        ang = math.degrees(math.atan2(r, f))
        # Balanced collar quadrants (usable tattoo hit targets)
        if -50.0 <= ang <= 50.0:
            face_zone[fi] = "neck_front"
        elif 50.0 < ang <= 130.0:
            face_zone[fi] = "neck_right"
        elif ang > 130.0 or ang < -130.0:
            face_zone[fi] = "neck_back"
        else:
            face_zone[fi] = "neck_left"

    # --- Pass 3: face (forehead → jaw, anterior of ear coronal plane) ---
    hairline_t = (ear_mid.lerp(lm.head_top, 0.28) - lm.neck_base).dot(neck_dir)
    ear_half = max(
        abs((lm.left_ear_center - ear_mid).dot(frame.right)),
        abs((lm.right_ear_center - ear_mid).dot(frame.right)),
        1e-4,
    )
    for fi in universe:
        if fi in face_zone:
            continue
        c = _centroid(mesh, mw, fi)
        w = _face_weights(mesh, fi, vg_map, names)
        rel_ear = c - ear_mid
        front_s = rel_ear.dot(frame.front)
        lat = abs(rel_ear.dot(frame.right))
        t = (c - lm.neck_base).dot(neck_dir)
        above_jaw = (c - lm.jaw_level).dot(frame.up) > -0.012
        below_hairline = t < hairline_t
        # Face stays forward of the ear coronal plane; temples only if anterior.
        face_vg = max(
            w.get("joint-jaw", 0.0),
            w.get("joint-mouth", 0.0),
            w.get("joint-l-eye", 0.0),
            w.get("joint-r-eye", 0.0),
        )
        faceish = (
            above_jaw
            and below_hairline
            and front_s > 0.004
            and (
                face_vg >= 0.03
                or front_s > 0.028
                or (front_s > 0.012 and lat < ear_half * 0.92)
            )
        )
        if faceish:
            # Sagittal split from body/head frame (anatomical right)
            face_zone[fi] = (
                "face_right" if rel_ear.dot(frame.right) >= 0.0 else "face_left"
            )

    # --- Pass 4: scalp / head remainder ---
    # Origin near cranial center so angular sectors balance around the skull.
    scalp_origin = ear_mid.lerp(lm.head_top, 0.40)
    h_span = max((lm.head_top - lm.jaw_level).dot(frame.up), 1e-6)
    for fi in universe:
        if fi in face_zone:
            continue
        c = _centroid(mesh, mw, fi)
        local = c - scalp_origin
        up_s = local.dot(frame.up)
        h_n = (c - lm.jaw_level).dot(frame.up) / h_span
        planar = local - up_s * frame.up
        # Crown / vertex
        if planar.length < 1e-8 or h_n >= 0.70 or up_s > 0.05:
            face_zone[fi] = "head_top"
            continue
        f = planar.dot(frame.front)
        r = planar.dot(frame.right)
        ang = math.degrees(math.atan2(r, f))
        # Wide lateral sectors for usable scalp tattoo zones
        if -40.0 <= ang <= 40.0:
            face_zone[fi] = "head_top"
        elif 40.0 < ang <= 140.0:
            face_zone[fi] = "head_right_side"
        elif ang > 140.0 or ang < -140.0:
            face_zone[fi] = "head_back"
        else:
            face_zone[fi] = "head_left_side"

    # Ensure full coverage
    missing = universe - set(face_zone.keys())
    for fi in missing:
        c = _centroid(mesh, mw, fi)
        local = c - frame.origin
        face_zone[fi] = (
            "head_right_side" if local.dot(frame.right) >= 0 else "head_left_side"
        )

    # Drop any face outside universe (safety)
    face_zone = {fi: z for fi, z in face_zone.items() if fi in universe}

    components_before = {
        zid: len(connected_components(mesh, [i for i, z in face_zone.items() if z == zid]))
        for zid in HEAD_ZONE_IDS
    }

    def parent_tris(zid: str) -> int:
        return max(
            1,
            sum(
                max(0, len(mesh.polygons[fi].vertices) - 2)
                for fi, z in face_zone.items()
                if z == zid
            ),
        )

    reassigned, _details, _ = cleanup_islands_generic(
        mesh,
        face_zone,
        HEAD_ZONE_IDS,
        parent_tris_fn=parent_tris,
        cfg=HEAD_ISLAND_CLEANUP,
    )

    components_after = {
        zid: len(connected_components(mesh, [i for i, z in face_zone.items() if z == zid]))
        for zid in HEAD_ZONE_IDS
    }

    total_area = sum(face_area(mesh, mesh.polygons[fi], mw) for fi in universe) or 1.0
    metrics: dict[str, dict] = {}
    for zid in HEAD_ZONE_IDS:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        area = sum(face_area(mesh, mesh.polygons[fi], mw) for fi in faces)
        tris = sum(max(0, len(mesh.polygons[fi].vertices) - 2) for fi in faces)
        metrics[zid] = {
            "faces": len(faces),
            "triangles": tris,
            "surfaceArea": round(area, 6),
            "percentageOfHeadNeck": round(100.0 * area / total_area, 2),
            "connectedComponentsBefore": components_before.get(zid, 0),
            "connectedComponentsAfter": components_after.get(zid, 0),
            "trianglesReassigned": 0,
        }

    return HeadSegmentationResult(
        face_zone=face_zone,
        universe_faces=set(universe),
        landmarks=lm,
        frame=frame,
        metrics=metrics,
        components_before=components_before,
        components_after=components_after,
        triangles_reassigned=reassigned,
    )
