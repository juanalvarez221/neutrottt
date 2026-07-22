"""Canonical torso membership + anatomical grid classification (T1/T2)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from mathutils import Vector

from .arm_segmentation import ArmBoneNames, is_arm_member, vertex_weight
from .body_frame import (
    BodyFrame,
    TorsoLandmarks,
    build_body_frame,
    resolve_torso_landmarks,
    spine_polyline,
)
from .config import TORSO_T1_CONFIG, TORSO_ZONE_IDS, TorsoGridConfig
from .geometry import arm_polyline_param, face_area, project_point_on_segment


TORSO_INCLUDE_GROUPS = (
    "spine_01",
    "spine_02",
    "spine_03",
    "pelvis",
    "clavicle_l",
    "clavicle_r",
)

TORSO_EXCLUDE_LIMB_GROUPS = (
    "thigh_l",
    "thigh_r",
    "calf_l",
    "calf_r",
    "foot_l",
    "foot_r",
    "toes_l",
    "toes_r",
    "upperarm_l",
    "upperarm_r",
    "lowerarm_l",
    "lowerarm_r",
    "hand_l",
    "hand_r",
)

HEAD_GROUPS = ("head",)
NECK_GROUPS = ("neck_01",)


@dataclass
class FaceCoords:
    vertical: float  # 0 pelvisTop → 1 neckBase
    front_back: float  # -1 back … +1 front (local half-depth)
    left_right: float  # -1 left … +1 right (local half-width)
    raw_lateral: float
    raw_depth: float
    dist_spine: float


@dataclass
class TorsoSegmentationResult:
    face_zone: dict[int, str]
    universe_faces: int
    universe_tris: int
    surface_area: float
    body_frame: BodyFrame
    landmarks: TorsoLandmarks
    vertical_s: dict[str, float]
    arm_overlap_faces: int
    coords: dict[int, FaceCoords]
    centroids: dict[int, Vector]
    tris_by_face: dict[int, int]
    areas: dict[int, float]


def _param_of_point(p: Vector, chain: list[Vector]) -> float:
    s, _ = arm_polyline_param(p, chain)
    total = sum((chain[i + 1] - chain[i]).length for i in range(len(chain) - 1))
    if total < 1e-9:
        return 0.0
    return max(0.0, min(1.0, s / total))


def landmark_vertical_params(lm: TorsoLandmarks) -> dict[str, float]:
    chain = spine_polyline(lm)
    return {
        "pelvisTop": _param_of_point(lm.pelvis_top, chain),
        "waistLevel": _param_of_point(lm.waist_level, chain),
        "navelLevel": _param_of_point(lm.navel_level, chain),
        "chestLower": _param_of_point(lm.chest_lower, chain),
        "upperChest": _param_of_point(lm.upper_chest, chain),
        "neckBase": _param_of_point(lm.neck_base, chain),
    }


def collect_arm_universe_faces(
    mesh,
    mw,
    vg_map: dict[str, int],
    shoulder_r: Vector,
    elbow_r: Vector,
    wrist_r: Vector,
    tip_r: Vector,
    shoulder_l: Vector,
    elbow_l: Vector,
    wrist_l: Vector,
    tip_l: Vector,
) -> set[int]:
    """Official arm universes — faces that must never enter the torso."""
    out: set[int] = set()
    sides = (
        ("right", ArmBoneNames.for_side("right"), [shoulder_r, elbow_r, wrist_r, tip_r]),
        ("left", ArmBoneNames.for_side("left"), [shoulder_l, elbow_l, wrist_l, tip_l]),
    )
    for _side, bones, joints in sides:
        needed = bones.deformation_groups() + bones.opposite_groups()
        for poly in mesh.polygons:
            w_acc: dict[str, float] = defaultdict(float)
            centroid = Vector((0, 0, 0))
            n = len(poly.vertices)
            for vi in poly.vertices:
                v = mesh.vertices[vi]
                centroid += mw @ v.co
                for name in needed:
                    if name in vg_map:
                        w_acc[name] += vertex_weight(v, vg_map[name])
            centroid /= float(n)
            w_avg = {k: val / float(n) for k, val in w_acc.items()}
            _s, dist = arm_polyline_param(centroid, joints)
            if is_arm_member(w_avg, dist, bones):
                out.add(poly.index)
    return out


def is_torso_member(
    w: dict[str, float],
    dist_spine: float,
    in_arm: bool,
    cfg: TorsoGridConfig,
) -> bool:
    if in_arm:
        return False
    w_head = max((w.get(n, 0.0) for n in HEAD_GROUPS), default=0.0)
    if w_head >= cfg.exclude_head_weight:
        return False
    w_neck = max((w.get(n, 0.0) for n in NECK_GROUPS), default=0.0)
    w_spine = max((w.get(n, 0.0) for n in ("spine_01", "spine_02", "spine_03")), default=0.0)
    if w_neck >= cfg.exclude_neck_only_weight and w_spine < 0.12:
        return False
    w_limb = max((w.get(n, 0.0) for n in TORSO_EXCLUDE_LIMB_GROUPS), default=0.0)
    if w_limb >= cfg.exclude_limb_weight and w_spine < 0.15:
        return False
    # Soft pelvis/buttock exclusion: high pelvis + low spine + below waist-ish handled
    # by vertical clamp later; still require torso weight or proximity.
    w_torso = max(
        w_spine,
        w.get("pelvis", 0.0) * 0.55,
        w.get("clavicle_l", 0.0),
        w.get("clavicle_r", 0.0),
    )
    if w_torso < cfg.torso_weight_min and dist_spine > cfg.max_dist_from_spine * 0.55:
        return False
    if dist_spine > cfg.max_dist_from_spine and w_torso < 0.28:
        return False
    # Drop lower pelvis / glute region: strong pelvis, weak spine_02/03, low vertical
    # is applied after coords; membership here stays inclusive enough.
    return w_torso >= cfg.torso_weight_min or dist_spine <= cfg.max_dist_from_spine * 0.7


def classify_torso_zone(
    v: float,
    lr: float,
    fb: float,
    cfg: TorsoGridConfig,
    cuts: dict[str, float],
) -> str:
    """
    Anatomical grid classification in normalized body coords.
    cuts: landmark-derived vertical thresholds
      chest_lo, scapula_lo, mid_back_lo, navel, upper_abd_lo
    """
    abs_lr = abs(lr)
    is_right = lr >= 0.0
    v_chest_lo = cuts["chest_lo"]
    v_scapula_lo = cuts["scapula_lo"]
    v_mid_back_lo = cuts["mid_back_lo"]
    v_navel = cuts["navel"]
    v_upper_abd_lo = cuts["upper_abd_lo"]

    # Strong lateral band → ribs / flanks
    if abs(fb) < cfg.front_thresh and abs_lr >= cfg.chest_outer * 0.85:
        if v >= v_navel:
            return "right_ribs" if is_right else "left_ribs"
        return "right_flank" if is_right else "left_flank"

    if fb >= cfg.front_thresh:
        # FRONT
        if v >= v_chest_lo:
            if abs_lr <= cfg.sternum_half:
                return "sternum"
            if abs_lr <= cfg.chest_outer:
                return "right_chest" if is_right else "left_chest"
            return "right_ribs" if is_right else "left_ribs"
        # Abdomen / lower front
        if abs_lr <= cfg.abdomen_half:
            if v >= v_upper_abd_lo:
                return "upper_abdomen"
            return "lower_abdomen"
        return "right_flank" if is_right else "left_flank"

    if fb <= -cfg.back_thresh:
        # BACK
        if v >= v_scapula_lo:
            if abs_lr <= cfg.back_center_half:
                return "upper_back_center"
            if abs_lr <= cfg.scapula_outer:
                return "right_scapula" if is_right else "left_scapula"
            return "right_ribs" if is_right else "left_ribs"
        if v >= v_mid_back_lo:
            if abs_lr <= cfg.back_center_half:
                return "mid_back_center"
            if abs_lr <= cfg.mid_back_outer:
                return "right_mid_back" if is_right else "left_mid_back"
            return "right_ribs" if is_right else "left_ribs"
        if abs_lr <= cfg.back_center_half:
            return "lower_back_center"
        if abs_lr <= cfg.mid_back_outer:
            return "right_lower_back" if is_right else "left_lower_back"
        return "right_flank" if is_right else "left_flank"

    # Ambiguous front/back strip → sides
    if v >= v_navel:
        return "right_ribs" if is_right else "left_ribs"
    return "right_flank" if is_right else "left_flank"


def vertical_cuts_from_landmarks(
    v_params: dict[str, float], cfg: TorsoGridConfig
) -> dict[str, float]:
    """Derive classification cuts from measured landmark spine parameters."""
    chest_lo = v_params["chestLower"] + cfg.chest_lo_bias
    upper_chest = v_params["upperChest"]
    navel = v_params["navelLevel"] + cfg.navel_bias
    # Scapula occupies upper thoracic: cut below mid clavicle↔underbust.
    scapula_lo = 0.35 * chest_lo + 0.65 * upper_chest + cfg.mid_back_bias
    # Mid-back fills from navel up to scapula band.
    mid_back_lo = navel
    # Front chest uses underbust; abdomen below. Give lower abdomen ≥ half of
    # the abdomen band (pelvis→underbust).
    upper_abd_lo = 0.40 * navel + 0.60 * chest_lo
    return {
        "chest_lo": chest_lo,
        "scapula_lo": scapula_lo,
        "mid_back_lo": mid_back_lo,
        "navel": navel,
        "upper_abd_lo": upper_abd_lo,
    }


def _build_width_depth_bins(
    samples: list[tuple[float, float, float]],
    n_bins: int = 24,
) -> tuple[list[float], list[float]]:
    """samples: (v, abs_lateral_raw, abs_depth_raw) → per-bin half-width / half-depth."""
    bins_w = [0.05] * n_bins
    bins_d = [0.04] * n_bins
    for v, lat, depth in samples:
        bi = min(n_bins - 1, max(0, int(v * n_bins)))
        bins_w[bi] = max(bins_w[bi], lat)
        bins_d[bi] = max(bins_d[bi], depth)
    # Fill empty bins from neighbors
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


def segment_torso_faces(
    mesh,
    mw,
    vg_map: dict[str, int],
    body: BodyFrame,
    lm: TorsoLandmarks,
    arm_faces: set[int],
    cfg: TorsoGridConfig | None = None,
) -> TorsoSegmentationResult:
    cfg = cfg or TORSO_T1_CONFIG
    chain = spine_polyline(lm)
    v_params = landmark_vertical_params(lm)

    weight_names = (
        list(TORSO_INCLUDE_GROUPS)
        + list(TORSO_EXCLUDE_LIMB_GROUPS)
        + list(HEAD_GROUPS)
        + list(NECK_GROUPS)
    )
    weight_names = [n for n in weight_names if n in vg_map]

    # Pass 1: candidate membership + raw samples for local width/depth
    candidates: list[tuple[int, Vector, dict[str, float], float, float, float, float]] = []
    # fi, centroid, w, v, lat_raw, depth_raw, dist
    for poly in mesh.polygons:
        fi = poly.index
        in_arm = fi in arm_faces
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
        _closest, _, dist = project_point_on_segment(
            centroid, chain[0], chain[-1]
        )
        # Better: distance to polyline
        _s, dist = arm_polyline_param(centroid, chain)
        if not is_torso_member(w_avg, dist, in_arm, cfg):
            continue
        v_norm = _param_of_point(centroid, chain)
        # Drop below pelvisTop / above neck with slack; also drop glute-heavy low faces
        if v_norm < -0.02 or v_norm > 1.02:
            continue
        if v_norm < 0.02 and w_avg.get("pelvis", 0.0) > 0.35 and w_avg.get("spine_02", 0.0) < 0.08:
            continue
        # Project relative to nearest spine point
        closest, _, _ = project_point_on_segment(centroid, chain[0], chain[-1])
        # Use polyline closest for better mid-spine projection
        best_c, best_d = chain[0], 1e9
        for i in range(len(chain) - 1):
            c, _, d = project_point_on_segment(centroid, chain[i], chain[i + 1])
            if d < best_d:
                best_d, best_c = d, c
        rel = centroid - best_c
        lat_raw = rel.dot(body.right)
        depth_raw = rel.dot(body.front)
        candidates.append((fi, centroid, w_avg, v_norm, lat_raw, depth_raw, best_d))

    samples = [(v, abs(lat), abs(dep)) for _fi, _c, _w, v, lat, dep, _d in candidates]
    bins_w, bins_d = _build_width_depth_bins(samples)
    cuts = vertical_cuts_from_landmarks(v_params, cfg)

    face_zone: dict[int, str] = {}
    coords: dict[int, FaceCoords] = {}
    centroids: dict[int, Vector] = {}
    tris_by_face: dict[int, int] = {}
    areas: dict[int, float] = {}
    surface = 0.0
    tris = 0
    arm_overlap = 0

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
        zid = classify_torso_zone(v_norm, lr, fb, cfg, cuts)
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
        surface += a
        tris += tcount

    return TorsoSegmentationResult(
        face_zone=face_zone,
        universe_faces=len(face_zone),
        universe_tris=tris,
        surface_area=surface,
        body_frame=body,
        landmarks=lm,
        vertical_s=v_params,
        arm_overlap_faces=arm_overlap,
        coords=coords,
        centroids=centroids,
        tris_by_face=tris_by_face,
        areas=areas,
    )


def build_torso_context(
    pelvis: Vector,
    spine_01: Vector,
    spine_02: Vector,
    spine_03: Vector,
    neck_01: Vector,
    clavicle_l: Vector,
    clavicle_r: Vector,
) -> tuple[BodyFrame, TorsoLandmarks]:
    body = build_body_frame(
        pelvis, spine_01, spine_02, spine_03, neck_01, clavicle_l, clavicle_r
    )
    lm = resolve_torso_landmarks(
        pelvis, spine_01, spine_02, spine_03, neck_01, clavicle_l, clavicle_r
    )
    return body, lm
