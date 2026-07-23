"""Pelvis / hip / glute / sacrum segmentation + lower-torso boundary redraw."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from mathutils import Vector

from .arm_segmentation import vertex_weight
from .body_frame import BodyFrame
from .config import (
    COMBINED_TORSO_PELVIS_ZONE_IDS,
    LOCKED_TORSO_IDS,
    MUTABLE_LOWER_TORSO_IDS,
    PELVIS_P1_CONFIG,
    PELVIS_ZONE_IDS,
    PelvisGridConfig,
)
from .geometry import arm_polyline_param, face_area, project_point_on_segment
from .torso_segmentation import FaceCoords, TORSO_EXCLUDE_LIMB_GROUPS


PELVIS_WEIGHT_GROUPS = (
    "pelvis",
    "spine_01",
    "thigh_l",
    "thigh_r",
)

HELPER_EXCLUDE_TOKENS = (
    "genital",
    "penis",
    "helper",
    "joint-",
)


@dataclass(frozen=True)
class PelvisLandmarks:
    waist_level: Vector
    pelvis_top: Vector
    pelvis_center: Vector
    hip_joint_l: Vector
    hip_joint_r: Vector
    glute_lower: Vector
    thigh_start_l: Vector
    thigh_start_r: Vector
    knee_l: Vector | None = None
    knee_r: Vector | None = None


@dataclass
class CombinedSegmentationResult:
    face_zone: dict[int, str]
    universe_faces: int
    universe_tris: int
    surface_area: float
    body_frame: BodyFrame
    pelvis_landmarks: PelvisLandmarks
    coords: dict[int, FaceCoords]
    centroids: dict[int, Vector]
    tris_by_face: dict[int, int]
    areas: dict[int, float]
    arm_overlap_faces: int
    thigh_excluded_faces: int
    ribs_components_before: dict[str, int]
    vertical_pelvis_s: dict[str, float]


def resolve_pelvis_landmarks(
    waist_level: Vector,
    pelvis_top: Vector,
    pelvis_center: Vector,
    hip_l: Vector,
    hip_r: Vector,
    knee_l: Vector | None,
    knee_r: Vector | None,
    thigh_margin: float = 0.08,
) -> PelvisLandmarks:
    """
    Pelvis landmarks from rig bones.

    thighStart = hip + margin * (knee - hip) along each thigh.
    gluteLowerBoundary = mid hips lowered toward thigh starts (posterior bias applied by caller).
    """
    def thigh_start(hip: Vector, knee: Vector | None) -> Vector:
        if knee is None:
            return hip + Vector((0.0, 0.0, -0.08))
        return hip.lerp(knee, max(0.05, min(0.35, thigh_margin)))

    ts_l = thigh_start(hip_l, knee_l)
    ts_r = thigh_start(hip_r, knee_r)
    hips_mid = (hip_l + hip_r) * 0.5
    thighs_mid = (ts_l + ts_r) * 0.5
    glute_lower = hips_mid.lerp(thighs_mid, 0.55)

    return PelvisLandmarks(
        waist_level=waist_level.copy(),
        pelvis_top=pelvis_top.copy(),
        pelvis_center=pelvis_center.copy(),
        hip_joint_l=hip_l.copy(),
        hip_joint_r=hip_r.copy(),
        glute_lower=glute_lower,
        thigh_start_l=ts_l,
        thigh_start_r=ts_r,
        knee_l=knee_l.copy() if knee_l else None,
        knee_r=knee_r.copy() if knee_r else None,
    )


def pelvis_polyline(lm: PelvisLandmarks) -> list[Vector]:
    hips_mid = (lm.hip_joint_l + lm.hip_joint_r) * 0.5
    thighs_mid = (lm.thigh_start_l + lm.thigh_start_r) * 0.5
    return [
        thighs_mid,
        lm.glute_lower,
        hips_mid,
        lm.pelvis_center,
        lm.pelvis_top,
        lm.waist_level,
    ]


def _param_of_point(p: Vector, chain: list[Vector]) -> float:
    s, _ = arm_polyline_param(p, chain)
    total = sum((chain[i + 1] - chain[i]).length for i in range(len(chain) - 1))
    if total < 1e-9:
        return 0.0
    return max(0.0, min(1.0, s / total))


def landmark_pelvis_params(lm: PelvisLandmarks) -> dict[str, float]:
    chain = pelvis_polyline(lm)
    return {
        "thighStart": 0.0,
        "gluteLower": _param_of_point(lm.glute_lower, chain),
        "hipsMid": _param_of_point((lm.hip_joint_l + lm.hip_joint_r) * 0.5, chain),
        "pelvisCenter": _param_of_point(lm.pelvis_center, chain),
        "pelvisTop": _param_of_point(lm.pelvis_top, chain),
        "waistLevel": _param_of_point(lm.waist_level, chain),
    }


def is_clear_thigh(
    w: dict[str, float],
    centroid: Vector,
    lm: PelvisLandmarks,
    body: BodyFrame,
    cfg: PelvisGridConfig,
) -> bool:
    """True when face belongs to upper leg rather than pelvis shell."""
    w_th_l = w.get("thigh_l", 0.0)
    w_th_r = w.get("thigh_r", 0.0)
    w_th = max(w_th_l, w_th_r)
    w_pelvis = w.get("pelvis", 0.0)
    if w_th < cfg.thigh_exclude_weight:
        return False
    # Along dominant thigh bone: below thighStart → leg
    if w_th_l >= w_th_r:
        hip, start, knee = lm.hip_joint_l, lm.thigh_start_l, lm.knee_l
    else:
        hip, start, knee = lm.hip_joint_r, lm.thigh_start_r, lm.knee_r
    if knee is None:
        # Fallback: below glute lower along UP
        return (centroid - lm.glute_lower).dot(body.up) < -0.01 and w_th > w_pelvis
    _c, t, _d = project_point_on_segment(centroid, hip, knee)
    # t=0 at hip, t=1 at knee; thighStart margin ≈ cfg.thigh_start_margin
    return t >= cfg.thigh_start_margin and w_th >= w_pelvis + 0.05


def is_pelvis_shell_member(
    w: dict[str, float],
    dist_pelvis: float,
    in_arm: bool,
    is_thigh: bool,
    cfg: PelvisGridConfig,
) -> bool:
    if in_arm or is_thigh:
        return False
    w_pelvis = w.get("pelvis", 0.0)
    w_spine = w.get("spine_01", 0.0)
    w_th = max(w.get("thigh_l", 0.0), w.get("thigh_r", 0.0))
    score = max(w_pelvis, w_spine * 0.7, w_th * 0.45)
    if score < cfg.pelvis_weight_min and dist_pelvis > cfg.max_dist_from_pelvis * 0.65:
        return False
    if dist_pelvis > cfg.max_dist_from_pelvis and score < 0.25:
        return False
    return True


def classify_lower_and_pelvis(
    v_pelvis: float,
    lr: float,
    fb: float,
    cfg: PelvisGridConfig,
) -> str:
    """
    Classify mutable lower-torso + pelvis zones.
    v_pelvis: 0 at thighStart … 1 at waistLevel.
    """
    abs_lr = abs(lr)
    is_right = lr >= 0.0

    # FRONT
    if fb >= cfg.front_thresh:
        if v_pelvis >= cfg.abdomen_lo and abs_lr <= cfg.abdomen_half:
            return "lower_abdomen"
        if v_pelvis >= cfg.abdomen_lo * 0.5 and abs_lr >= cfg.hip_inner:
            return "right_hip" if is_right else "left_hip"
        if abs_lr <= cfg.abdomen_half:
            return "lower_abdomen"
        return "right_hip" if is_right else "left_hip"

    # BACK
    if fb <= -cfg.back_thresh:
        # Optional: claim sacrum before lower_back so taller variants can grow upward.
        if getattr(cfg, "sacrum_priority", False):
            if cfg.sacrum_lo <= v_pelvis <= cfg.sacrum_hi and abs_lr <= cfg.sacrum_half:
                return "sacrum"
        if v_pelvis >= cfg.lower_back_lo:
            if abs_lr <= cfg.sacrum_half * 0.85:
                return "lower_back_center"
            return "right_lower_back" if is_right else "left_lower_back"
        if cfg.sacrum_lo <= v_pelvis <= cfg.sacrum_hi and abs_lr <= cfg.sacrum_half:
            return "sacrum"
        if v_pelvis <= cfg.glute_hi and abs_lr >= cfg.glute_inner:
            return "right_glute" if is_right else "left_glute"
        if abs_lr <= cfg.sacrum_half:
            return "sacrum" if v_pelvis < cfg.lower_back_lo else "lower_back_center"
        return "right_glute" if is_right else "left_glute"

    # SIDE strip
    if v_pelvis >= cfg.hip_hi * 0.55:
        if abs_lr >= cfg.hip_inner * 0.7:
            return "right_hip" if is_right else "left_hip"
        if fb > 0:
            return "lower_abdomen"
        return "lower_back_center" if abs_lr < cfg.sacrum_half else (
            "right_lower_back" if is_right else "left_lower_back"
        )
    if fb > 0:
        return "right_hip" if is_right else "left_hip"
    return "right_glute" if is_right else "left_glute"


def _width_depth_bins(samples: list[tuple[float, float, float]], n_bins: int = 20):
    bins_w = [0.05] * n_bins
    bins_d = [0.04] * n_bins
    for v, lat, depth in samples:
        bi = min(n_bins - 1, max(0, int(v * n_bins)))
        bins_w[bi] = max(bins_w[bi], lat)
        bins_d[bi] = max(bins_d[bi], depth)
    for i in range(n_bins):
        if bins_w[i] <= 0.05:
            for j in range(1, n_bins):
                if i - j >= 0 and bins_w[i - j] > 0.05:
                    bins_w[i] = bins_w[i - j]
                    break
                if i + j < n_bins and bins_w[i + j] > 0.05:
                    bins_w[i] = bins_w[i + j]
                    break
        if bins_d[i] <= 0.04:
            for j in range(1, n_bins):
                if i - j >= 0 and bins_d[i - j] > 0.04:
                    bins_d[i] = bins_d[i - j]
                    break
                if i + j < n_bins and bins_d[i + j] > 0.04:
                    bins_d[i] = bins_d[i + j]
                    break
    return bins_w, bins_d


def integrate_pelvis_with_torso(
    mesh,
    mw,
    vg_map: dict[str, int],
    body: BodyFrame,
    lm: PelvisLandmarks,
    arm_faces: set[int],
    torso_face_zone: dict[int, str],
    torso_coords: dict[int, FaceCoords],
    torso_centroids: dict[int, Vector],
    torso_tris: dict[int, int],
    torso_areas: dict[int, float],
    cfg: PelvisGridConfig | None = None,
) -> CombinedSegmentationResult:
    """
    Keep locked T2 torso zones; redraw mutable lower torso + add pelvis zones.
    Combined universe = locked ∪ mutable ∪ new pelvis shell faces.
    """
    cfg = cfg or PELVIS_P1_CONFIG
    chain = pelvis_polyline(lm)
    v_params = landmark_pelvis_params(lm)

    weight_names = [
        n
        for n in list(PELVIS_WEIGHT_GROUPS)
        + list(TORSO_EXCLUDE_LIMB_GROUPS)
        + ["spine_02", "spine_03"]
        if n in vg_map
    ]

    # Seed with locked torso assignments
    face_zone: dict[int, str] = {}
    coords: dict[int, FaceCoords] = {}
    centroids: dict[int, Vector] = {}
    tris_by_face: dict[int, int] = {}
    areas: dict[int, float] = {}

    for fi, zid in torso_face_zone.items():
        if zid in LOCKED_TORSO_IDS:
            face_zone[fi] = zid
            if fi in torso_coords:
                coords[fi] = torso_coords[fi]
            if fi in torso_centroids:
                centroids[fi] = torso_centroids[fi]
            tris_by_face[fi] = torso_tris.get(fi, 1)
            areas[fi] = torso_areas.get(fi, 0.0)

    locked_set = set(face_zone.keys())
    candidates: list[tuple[int, Vector, dict[str, float], float, float, float, float]] = []
    thigh_excluded = 0
    arm_overlap = 0

    hips_mid = (lm.hip_joint_l + lm.hip_joint_r) * 0.5

    for poly in mesh.polygons:
        fi = poly.index
        if fi in locked_set:
            continue
        in_arm = fi in arm_faces
        if in_arm:
            continue

        w_acc: dict[str, float] = defaultdict(float)
        centroid = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            centroid += mw @ v.co
            for name in weight_names:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(n)
        w_avg = {k: val / float(n) for k, val in w_acc.items()}

        # Skip helper/genital geometry by name presence on mesh groups
        # (weights already exclude if groups absent)

        is_thigh = is_clear_thigh(w_avg, centroid, lm, body, cfg)
        if is_thigh:
            thigh_excluded += 1
            continue

        _s, dist = arm_polyline_param(centroid, chain)
        # Also accept previous mutable torso faces even if slightly outside shell
        was_mutable = torso_face_zone.get(fi) in MUTABLE_LOWER_TORSO_IDS
        if not was_mutable and not is_pelvis_shell_member(
            w_avg, dist, False, False, cfg
        ):
            continue

        v_norm = _param_of_point(centroid, chain)
        best_c, best_d = chain[0], 1e9
        for i in range(len(chain) - 1):
            c, _, d = project_point_on_segment(centroid, chain[i], chain[i + 1])
            if d < best_d:
                best_d, best_c = d, c
        rel = centroid - best_c
        lat_raw = rel.dot(body.right)
        depth_raw = rel.dot(body.front)
        candidates.append((fi, centroid, w_avg, v_norm, lat_raw, depth_raw, best_d))

    samples = [(v, abs(lat), abs(dep)) for _i, _c, _w, v, lat, dep, _d in candidates]
    # Include locked face samples near waist for stable width bins
    for fi, c in coords.items():
        samples.append((max(0.7, c.vertical), abs(c.raw_lateral), abs(c.raw_depth)))
    bins_w, bins_d = _width_depth_bins(samples)
    n_bins = len(bins_w)

    for fi, centroid, w_avg, v_norm, lat_raw, depth_raw, dist in candidates:
        if fi in arm_faces:
            arm_overlap += 1
            continue
        bi = min(n_bins - 1, max(0, int(v_norm * n_bins)))
        half_w = max(0.04, bins_w[bi])
        half_d = max(0.03, bins_d[bi])
        lr = max(-1.5, min(1.5, lat_raw / half_w))
        fb = max(-1.5, min(1.5, depth_raw / half_d))
        zid = classify_lower_and_pelvis(v_norm, lr, fb, cfg)
        face_zone[fi] = zid
        coords[fi] = FaceCoords(
            vertical=v_norm,
            front_back=fb,
            left_right=lr,
            raw_lateral=lat_raw,
            raw_depth=depth_raw,
            dist_spine=dist,
        )
        centroids[fi] = centroid
        poly = mesh.polygons[fi]
        tcount = max(0, len(poly.vertices) - 2)
        tris_by_face[fi] = tcount
        a = face_area(mesh, poly, mw)
        areas[fi] = a

    surface = sum(areas.values())
    tris = sum(tris_by_face.values())

    return CombinedSegmentationResult(
        face_zone=face_zone,
        universe_faces=len(face_zone),
        universe_tris=tris,
        surface_area=surface,
        body_frame=body,
        pelvis_landmarks=lm,
        coords=coords,
        centroids=centroids,
        tris_by_face=tris_by_face,
        areas=areas,
        arm_overlap_faces=arm_overlap,
        thigh_excluded_faces=thigh_excluded,
        ribs_components_before={},
        vertical_pelvis_s=v_params,
    )


def ribs_secondary_ok(
    coords: dict[int, FaceCoords],
    comp: set[int],
    from_zone: str,
    to_zone: str,
) -> bool:
    """Gate rib island reassignment using mean local anatomy."""
    if "ribs" not in from_zone and "hip" not in from_zone and "glute" not in from_zone:
        return True
    vs, lrs, fbs = [], [], []
    for fi in comp:
        c = coords.get(fi)
        if c is None:
            continue
        vs.append(c.vertical)
        lrs.append(c.left_right)
        fbs.append(c.front_back)
    if not vs:
        return False
    mv = sum(vs) / len(vs)
    ml = abs(sum(lrs) / len(lrs))
    mf = sum(fbs) / len(fbs)
    if "ribs" in from_zone:
        if to_zone.endswith("_chest") and mf > 0.02 and ml < 0.90:
            return True
        if to_zone.endswith("_flank") and ml > 0.50:
            return True
        if "scapula" in to_zone and mf < -0.02:
            return True
        if "mid_back" in to_zone and mf < -0.05 and ml < 0.85:
            return True
        if "hip" in to_zone and mv < 0.55 and ml > 0.45:
            return True
        if "ribs" in to_zone and ml > 0.65:
            return True
        return False
    if "hip" in from_zone:
        if to_zone.endswith("_flank") and mv > 0.55:
            return True
        if "glute" in to_zone and mf < 0.05:
            return True
        if "abdomen" in to_zone and mf > 0.05 and ml < 0.55:
            return True
        if "hip" in to_zone:
            return True
        return False
    if "glute" in from_zone:
        if "sacrum" in to_zone and ml < 0.45:
            return True
        if "lower_back" in to_zone and mv > 0.4:
            return True
        if "glute" in to_zone:
            return True
        if "hip" in to_zone and abs(mf) < 0.25:
            return True
        return False
    return True


def expand_lower_back_from_lumbar_mid(
    face_zone: dict[int, str],
    centroids: dict[int, Vector],
    body: BodyFrame,
    waist_level: Vector,
    chest_lower: Vector,
) -> int:
    """
    Transfer mid_back faces that sit in the lumbar band (near/below waist)
    into lower_back_*. This redraws the inferior frontier of the lower-back
    system without altering scapula / upper mid-back semantics.
    """
    # Plane: faces below midpoint of chest_lower and waist along UP.
    cut = chest_lower.lerp(waist_level, 0.55)
    moved = 0
    for fi, zid in list(face_zone.items()):
        if zid not in ("left_mid_back", "right_mid_back", "mid_back_center"):
            continue
        c = centroids.get(fi)
        if c is None:
            continue
        if (c - cut).dot(body.up) > 0:
            continue  # still above cut → keep mid
        if zid == "mid_back_center":
            face_zone[fi] = "lower_back_center"
        elif zid.startswith("left_"):
            face_zone[fi] = "left_lower_back"
        else:
            face_zone[fi] = "right_lower_back"
        moved += 1
    return moved


def cleanup_wrapping_islands(
    mesh,
    face_zone: dict[int, str],
    coords: dict[int, FaceCoords],
    zone_ids: tuple[str, ...],
    max_fraction: float = 0.22,
) -> tuple[int, list[dict], dict[str, dict]]:
    """
    Extra pass for wrapping zones (ribs/hips/glutes): reassign secondary
    components up to max_fraction of the zone when shared edges + anatomy agree.
    """
    from .config import IslandCleanupConfig
    from .island_cleanup_generic import cleanup_islands_generic

    def parent_tris(zid: str) -> int:
        faces = [fi for fi, z in face_zone.items() if z == zid]
        return max(16, len(faces))

    def score_fn(comp_set, zid: str):
        scores = {z: 0.05 for z in zone_ids}
        for z in zone_ids:
            if z == zid:
                continue
            sc = 0.2
            for token in ("ribs", "chest", "flank", "scapula", "back", "hip", "glute", "sacrum", "abdomen"):
                if token in zid and token in z:
                    sc += 0.6
            if ("left" in zid) == ("left" in z):
                sc += 0.3
            if ("right" in zid) == ("right" in z):
                sc += 0.3
            scores[z] = sc
        return scores

    return cleanup_islands_generic(
        mesh,
        face_zone,
        zone_ids,
        parent_tris,
        score_fn=score_fn,
        cfg=IslandCleanupConfig(max_fraction_of_parent=max_fraction, min_faces=1),
        secondary_ok_fn=lambda comp, frm, to: ribs_secondary_ok(coords, comp, frm, to),
        max_passes=10,
    )
