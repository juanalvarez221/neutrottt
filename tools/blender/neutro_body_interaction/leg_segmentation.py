"""Bilateral leg membership + longitudinal classification (no circumferential yet)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from mathutils import Vector

from .arm_segmentation import vertex_weight
from .config import (
    LEG_L1_CONFIG,
    LEG_L2_CONFIG,
    LEG_MEMBERSHIP_CONFIG,
    LegLongitudinalConfig,
    LegMembershipConfig,
)
from .geometry import arm_polyline_param, face_area, project_point_on_segment

LegSide = Literal["right", "left"]

LEG_LONGITUDINAL_ZONE_SUFFIXES: tuple[str, ...] = (
    "thigh",
    "knee",
    "lower_leg",
    "ankle",
    "foot",
)


@dataclass(frozen=True)
class LegBoneNames:
    thigh: str
    calf: str
    foot: str
    ball: str

    @staticmethod
    def for_side(side: LegSide) -> "LegBoneNames":
        s = "r" if side == "right" else "l"
        return LegBoneNames(
            thigh=f"thigh_{s}",
            calf=f"calf_{s}",
            foot=f"foot_{s}",
            ball=f"ball_{s}",
        )

    def deformation_groups(self) -> list[str]:
        return [self.thigh, self.calf, self.foot, self.ball]

    def opposite_groups(self) -> list[str]:
        other = "l" if self.thigh.endswith("_r") else "r"
        return [
            f"thigh_{other}",
            f"calf_{other}",
            f"foot_{other}",
            f"ball_{other}",
        ]

    def toe_joint_prefix(self) -> str:
        return "joint-r-toe-" if self.thigh.endswith("_r") else "joint-l-toe-"


@dataclass(frozen=True)
class LegLandmarks:
    side: LegSide
    hip_center: Vector
    thigh_start: Vector
    knee_center: Vector
    ankle_center: Vector
    foot_end: Vector
    thigh_length: float
    lower_leg_length: float
    foot_length: float
    thigh_start_margin: float


@dataclass(frozen=True)
class LegLongitudinalBands:
    knee_lo: float
    knee_hi: float
    ankle_lo: float
    ankle_hi: float
    thigh_len: float
    lower_len: float
    foot_len: float
    s_knee: float
    s_ankle: float
    s_end: float


@dataclass
class LegSegmentationResult:
    side: LegSide
    face_zone: dict[int, str]
    long_faces: dict[str, list[int]]
    universe_faces: int
    universe_tris: int
    surface_area: float
    bands: LegLongitudinalBands
    landmarks: LegLandmarks
    areas: dict[int, float]
    tris_by_face: dict[int, int]
    axial_span: dict[str, float]


def resolve_leg_landmarks(
    side: LegSide,
    hip_center: Vector,
    knee_center: Vector,
    ankle_center: Vector,
    foot_end: Vector,
    thigh_start_margin: float = 0.08,
) -> LegLandmarks:
    """
    HIP_CENTER = thigh bone head (anatomical origin).
    Interaction geometry begins at thighStart = hip.lerp(knee, margin).
    FOOT_END = ball bone tip (stable distal).
    """
    thigh_start = hip_center.lerp(
        knee_center, max(0.05, min(0.35, thigh_start_margin))
    )
    return LegLandmarks(
        side=side,
        hip_center=hip_center.copy(),
        thigh_start=thigh_start,
        knee_center=knee_center.copy(),
        ankle_center=ankle_center.copy(),
        foot_end=foot_end.copy(),
        thigh_length=(knee_center - hip_center).length,
        lower_leg_length=(ankle_center - knee_center).length,
        foot_length=(foot_end - ankle_center).length,
        thigh_start_margin=thigh_start_margin,
    )


def resolve_leg_longitudinal_bands(
    thigh_len: float,
    lower_len: float,
    foot_len: float,
    cfg: LegLongitudinalConfig,
) -> LegLongitudinalBands:
    s_knee = thigh_len
    s_ankle = thigh_len + lower_len
    s_end = s_ankle + foot_len
    return LegLongitudinalBands(
        knee_lo=s_knee - cfg.knee_prox_of_thigh * thigh_len,
        knee_hi=s_knee + cfg.knee_dist_of_lower * lower_len,
        ankle_lo=s_ankle - cfg.ankle_prox_of_lower * lower_len,
        ankle_hi=s_ankle + cfg.ankle_dist_of_foot * foot_len,
        thigh_len=thigh_len,
        lower_len=lower_len,
        foot_len=foot_len,
        s_knee=s_knee,
        s_ankle=s_ankle,
        s_end=s_end,
    )


def is_leg_member(
    w: dict[str, float],
    dist: float,
    centroid: Vector,
    bones: LegBoneNames,
    lm: LegLandmarks,
    cfg: LegMembershipConfig | None = None,
) -> bool:
    """
    Side-dominant leg shell distal to frozen thighStart.
    Excludes pelvis-dominated faces and the opposite leg.
    """
    cfg = cfg or LEG_MEMBERSHIP_CONFIG
    toe_bonus = 0.0
    for k, val in w.items():
        if k.startswith(bones.toe_joint_prefix()):
            toe_bonus += val
    toe_bonus = min(1.0, toe_bonus) * 0.2

    w_side = max(
        w.get(bones.thigh, 0.0),
        w.get(bones.calf, 0.0),
        w.get(bones.foot, 0.0),
        w.get(bones.ball, 0.0),
    ) + toe_bonus
    w_opp = max((w.get(n, 0.0) for n in bones.opposite_groups()), default=0.0)
    w_pelvis = w.get("pelvis", 0.0)

    if w_side < cfg.leg_weight_thresh:
        return False
    if w_opp > w_side + cfg.lateral_bias:
        return False
    if w_pelvis > w_side + cfg.pelvis_bias:
        return False
    if dist > cfg.outlier_dist and w_side < cfg.outlier_w_min:
        return False

    # Proximal gate: must be at/below thighStart unless clearly calf/foot.
    _c, t, _d = project_point_on_segment(centroid, lm.hip_center, lm.knee_center)
    distal_w = max(
        w.get(bones.calf, 0.0),
        w.get(bones.foot, 0.0),
        w.get(bones.ball, 0.0),
    )
    if t < lm.thigh_start_margin and distal_w < cfg.distal_override_weight:
        return False
    return True


def classify_leg_longitudinal(
    s: float,
    w: dict[str, float],
    bands: LegLongitudinalBands,
    bones: LegBoneNames,
    side: LegSide,
) -> str:
    prefix = f"{side}_"
    w_calf = w.get(bones.calf, 0.0)
    w_foot = w.get(bones.foot, 0.0) + w.get(bones.ball, 0.0)

    if s >= bands.ankle_hi:
        return f"{prefix}foot"
    if bands.ankle_lo <= s < bands.ankle_hi:
        if w_foot > w_calf + 0.05:
            return f"{prefix}foot"
        return f"{prefix}ankle"
    if bands.knee_lo <= s <= bands.knee_hi:
        return f"{prefix}knee"
    if s < bands.knee_lo:
        return f"{prefix}thigh"
    if s < bands.ankle_lo:
        return f"{prefix}lower_leg"
    return f"{prefix}foot"


def expected_leg_zones(side: LegSide) -> list[str]:
    return [f"{side}_{suf}" for suf in LEG_LONGITUDINAL_ZONE_SUFFIXES]


def segment_leg_faces(
    mesh,
    mw,
    vg_map: dict[str, int],
    landmarks: LegLandmarks,
    cfg: LegLongitudinalConfig,
    membership: LegMembershipConfig | None = None,
) -> LegSegmentationResult:
    """
    Membership → polyline HIP→KNEE→ANKLE→FOOT_END → longitudinal zones.
    No circumferential subdivision in this paso.
    """
    side = landmarks.side
    bones = LegBoneNames.for_side(side)
    needed = bones.deformation_groups() + bones.opposite_groups()
    missing = [n for n in needed if n not in vg_map]
    if missing:
        raise RuntimeError(f"Missing vertex groups for {side} leg: {missing}")

    membership = membership or LEG_MEMBERSHIP_CONFIG
    bands = resolve_leg_longitudinal_bands(
        landmarks.thigh_length,
        landmarks.lower_leg_length,
        landmarks.foot_length,
        cfg,
    )
    joints = [
        landmarks.hip_center,
        landmarks.knee_center,
        landmarks.ankle_center,
        landmarks.foot_end,
    ]

    exclude_groups = [
        n
        for n in (
            "pelvis",
            "spine_01",
            "spine_02",
            "spine_03",
            "upperarm_l",
            "upperarm_r",
            "lowerarm_l",
            "lowerarm_r",
            "hand_l",
            "hand_r",
            "clavicle_l",
            "clavicle_r",
        )
        if n in vg_map
    ]
    toe_keys = [n for n in vg_map if n.startswith(bones.toe_joint_prefix())]

    face_zone: dict[int, str] = {}
    long_faces: dict[str, list[int]] = defaultdict(list)
    areas: dict[int, float] = {}
    tris_by_face: dict[int, int] = {}
    s_min: dict[str, float] = {}
    s_max: dict[str, float] = {}
    universe_tris = 0
    surface = 0.0

    weigh_names = needed + exclude_groups + toe_keys

    for poly in mesh.polygons:
        w_acc: dict[str, float] = defaultdict(float)
        centroid = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            centroid += mw @ v.co
            for name in weigh_names:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(n)
        w_avg = {k: val / float(n) for k, val in w_acc.items()}
        s, dist = arm_polyline_param(centroid, joints)
        if not is_leg_member(w_avg, dist, centroid, bones, landmarks, membership):
            continue

        zid = classify_leg_longitudinal(s, w_avg, bands, bones, side)
        face_zone[poly.index] = zid
        long_faces[zid].append(poly.index)
        tris = max(0, len(poly.vertices) - 2)
        area = face_area(mesh, poly, mw)
        tris_by_face[poly.index] = tris
        areas[poly.index] = area
        universe_tris += tris
        surface += area
        s_min[zid] = min(s_min.get(zid, s), s)
        s_max[zid] = max(s_max.get(zid, s), s)

    axial = {
        zid: max(0.0, s_max[zid] - s_min[zid])
        for zid in long_faces
        if zid in s_min and zid in s_max
    }

    return LegSegmentationResult(
        side=side,
        face_zone=face_zone,
        long_faces=dict(long_faces),
        universe_faces=len(face_zone),
        universe_tris=universe_tris,
        surface_area=surface,
        bands=bands,
        landmarks=landmarks,
        areas=areas,
        tris_by_face=tris_by_face,
        axial_span=axial,
    )


def default_leg_config(tag: str) -> LegLongitudinalConfig:
    if tag.upper() == "L2":
        return LEG_L2_CONFIG
    return LEG_L1_CONFIG
