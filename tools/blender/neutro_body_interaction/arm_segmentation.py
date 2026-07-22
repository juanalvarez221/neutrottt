"""Arm membership, R2 longitudinal + C2 angular classification (side-agnostic)."""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from mathutils import Vector

from .anatomical_frames import AnatomicalFrame, build_upper_arm_frame, transport_forearm_frame
from .config import (
    ARM_ANGULAR_CONFIG,
    ARM_LONGITUDINAL_CONFIG,
    ARM_MEMBERSHIP_CONFIG,
    AngularConfig,
    LongitudinalConfig,
    MembershipConfig,
    QUAD,
)
from .geometry import arm_polyline_param, face_area, project_point_on_segment

ArmSide = Literal["right", "left"]


@dataclass(frozen=True)
class ArmBoneNames:
    clavicle: str
    upperarm: str
    lowerarm: str
    hand: str
    thumb_01: str
    thumb_02: str
    thumb_03: str
    middle_03: str

    @staticmethod
    def for_side(side: ArmSide) -> "ArmBoneNames":
        s = "r" if side == "right" else "l"
        return ArmBoneNames(
            clavicle=f"clavicle_{s}",
            upperarm=f"upperarm_{s}",
            lowerarm=f"lowerarm_{s}",
            hand=f"hand_{s}",
            thumb_01=f"thumb_01_{s}",
            thumb_02=f"thumb_02_{s}",
            thumb_03=f"thumb_03_{s}",
            middle_03=f"middle_03_{s}",
        )

    def deformation_groups(self) -> list[str]:
        return [
            self.clavicle,
            self.upperarm,
            self.lowerarm,
            self.hand,
            self.thumb_01,
            self.thumb_02,
            self.thumb_03,
        ]

    def opposite_groups(self) -> list[str]:
        other = "l" if self.clavicle.endswith("_r") else "r"
        return [
            f"clavicle_{other}",
            f"upperarm_{other}",
            f"lowerarm_{other}",
            f"hand_{other}",
        ]


@dataclass(frozen=True)
class LongitudinalBands:
    shoulder_end: float
    elbow_lo: float
    elbow_hi: float
    wrist_lo: float
    wrist_hi: float
    ua_len: float
    fa_len: float
    hand_len: float
    s_elbow: float
    s_wrist: float


def resolve_longitudinal_bands(
    ua_len: float,
    fa_len: float,
    hand_len: float,
    cfg: LongitudinalConfig | None = None,
) -> LongitudinalBands:
    cfg = cfg or ARM_LONGITUDINAL_CONFIG
    s_elbow = ua_len
    s_wrist = ua_len + fa_len
    return LongitudinalBands(
        shoulder_end=cfg.shoulder_end_of_ua * ua_len,
        elbow_lo=s_elbow - cfg.elbow_prox_of_ua * ua_len,
        elbow_hi=s_elbow + cfg.elbow_dist_of_fa * fa_len,
        wrist_lo=s_wrist - cfg.wrist_prox_of_fa * fa_len,
        wrist_hi=s_wrist + cfg.wrist_dist_of_hand * hand_len,
        ua_len=ua_len,
        fa_len=fa_len,
        hand_len=hand_len,
        s_elbow=s_elbow,
        s_wrist=s_wrist,
    )


def is_arm_member(
    w: dict[str, float],
    dist: float,
    bones: ArmBoneNames,
    cfg: MembershipConfig | None = None,
) -> bool:
    cfg = cfg or ARM_MEMBERSHIP_CONFIG
    w_side = max(
        w.get(bones.clavicle, 0.0),
        w.get(bones.upperarm, 0.0),
        w.get(bones.lowerarm, 0.0),
        w.get(bones.hand, 0.0),
    ) + 0.25 * min(
        1.0,
        w.get(bones.thumb_01, 0.0)
        + w.get(bones.thumb_02, 0.0)
        + w.get(bones.thumb_03, 0.0),
    )
    w_opp = max(w.get(n, 0.0) for n in bones.opposite_groups())
    if w_side < cfg.arm_weight_thresh:
        return False
    if w_opp > w_side + cfg.lateral_bias:
        return False
    if dist > cfg.outlier_dist and w_side < cfg.outlier_w_min:
        return False
    return True


def classify_longitudinal_r2(
    s: float,
    w: dict[str, float],
    bands: LongitudinalBands,
    bones: ArmBoneNames,
    side: ArmSide,
) -> str:
    prefix = f"{side}_"
    w_la = w.get(bones.lowerarm, 0.0)
    w_hand = w.get(bones.hand, 0.0)
    w_thumb = (
        w.get(bones.thumb_01, 0.0)
        + w.get(bones.thumb_02, 0.0)
        + w.get(bones.thumb_03, 0.0)
    )
    if s >= bands.wrist_hi:
        return f"{prefix}hand"
    if bands.wrist_lo <= s < bands.wrist_hi:
        if (w_hand + w_thumb * 0.5) > w_la + 0.05:
            return f"{prefix}hand"
        return f"{prefix}wrist"
    if bands.elbow_lo <= s <= bands.elbow_hi:
        return f"{prefix}elbow"
    if s <= bands.shoulder_end:
        return f"{prefix}shoulder"
    if s < bands.elbow_lo:
        return f"{prefix}upper_arm"
    if s < bands.wrist_lo:
        return f"{prefix}forearm"
    return f"{prefix}hand"


def classify_angular_c2(
    front_score: float,
    side_score: float,
    cfg: AngularConfig | None = None,
) -> str:
    cfg = cfg or ARM_ANGULAR_CONFIG
    ang = math.degrees(math.atan2(side_score, front_score))
    fh = cfg.front_half_deg
    outer_end = fh + cfg.outer_deg
    inner_span = cfg.inner_deg
    inner_start = -fh - inner_span
    if -fh <= ang <= fh:
        return "front"
    if fh < ang <= outer_end:
        return "outer"
    if ang > outer_end or ang < inner_start:
        return "back"
    return "inner"


def angular_sector_scores(front_score: float, side_score: float) -> dict[str, float]:
    ang = math.degrees(math.atan2(side_score, front_score))
    centers = {"front": 0.0, "outer": 90.0, "back": 180.0, "inner": -90.0}
    out = {}
    for k, c in centers.items():
        if k == "back":
            d = min(
                abs(((ang - 180 + 180) % 360) - 180),
                abs(((ang + 180 + 180) % 360) - 180),
            )
        else:
            d = abs(((ang - c + 180) % 360) - 180)
        out[k] = 1.0 / (1.0 + d / 45.0)
    return out


def vertex_weight(v, gidx: int) -> float:
    for g in v.groups:
        if g.group == gidx:
            return float(g.weight)
    return 0.0


@dataclass
class ArmSegmentationResult:
    side: ArmSide
    face_zone: dict[int, str]
    long_faces: dict[str, list[int]]
    universe_faces: int
    universe_tris: int
    upper_frame: AnatomicalFrame
    forearm_frame: AnatomicalFrame
    twist_artificial_deg: float
    bands: LongitudinalBands
    landmarks: dict[str, list[float]]
    shoulder_torso_bleed: int


def segment_arm_faces(
    mesh,
    mw,
    vg_map: dict[str, int],
    side: ArmSide,
    shoulder: Vector,
    elbow: Vector,
    wrist: Vector,
    tip: Vector,
    torso_center: Vector,
) -> ArmSegmentationResult:
    """
    Full canonical pipeline for one arm:
      membership → R2 longitudinal → C2 angular with D2 forearm frame.
    Island cleanup is applied separately.
    """
    bones = ArmBoneNames.for_side(side)
    needed = bones.deformation_groups() + bones.opposite_groups()
    missing = [n for n in needed if n not in vg_map]
    if missing:
        raise RuntimeError(f"Missing vertex groups for {side}: {missing}")

    joints = [shoulder, elbow, wrist, tip]
    ua_len = (elbow - shoulder).length
    fa_len = (wrist - elbow).length
    hand_len = (tip - wrist).length
    bands = resolve_longitudinal_bands(ua_len, fa_len, hand_len)

    upper = build_upper_arm_frame(shoulder, elbow, torso_center)
    forearm, _q = transport_forearm_frame(upper, elbow, wrist, torso_center)
    # Artificial twist of forearm F vs transported F is 0 by construction.
    twist = 0.0

    spine_groups = [n for n in ("spine_01", "spine_02", "spine_03") if n in vg_map]

    face_zone: dict[int, str] = {}
    long_faces: dict[str, list[int]] = defaultdict(list)
    universe_tris = 0
    shoulder_bleed = 0
    prefix = f"{side}_"

    for poly in mesh.polygons:
        w_acc: dict[str, float] = defaultdict(float)
        centroid = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = mesh.vertices[vi]
            centroid += mw @ v.co
            for name in needed:
                w_acc[name] += vertex_weight(v, vg_map[name])
            for name in spine_groups:
                w_acc[name] += vertex_weight(v, vg_map[name])
        centroid /= float(n)
        w_avg = {k: val / float(n) for k, val in w_acc.items()}
        s, dist = arm_polyline_param(centroid, joints)
        if not is_arm_member(w_avg, dist, bones):
            continue

        long_z = classify_longitudinal_r2(s, w_avg, bands, bones, side)
        long_faces[long_z].append(poly.index)
        universe_tris += max(0, len(poly.vertices) - 2)

        if long_z == f"{prefix}shoulder":
            tw = max((w_avg.get(n, 0.0) for n in spine_groups), default=0.0)
            if tw >= 0.15 and w_avg.get(bones.clavicle, 0.0) < 0.25:
                shoulder_bleed += 1

        if long_z == f"{prefix}upper_arm":
            closest, _, _ = project_point_on_segment(centroid, shoulder, elbow)
            R = centroid - closest
            q = classify_angular_c2(R.dot(upper.F), R.dot(upper.S))
            zid = f"{prefix}upper_arm_{q}"
        elif long_z == f"{prefix}forearm":
            closest, _, _ = project_point_on_segment(centroid, elbow, wrist)
            R = centroid - closest
            q = classify_angular_c2(R.dot(forearm.F), R.dot(forearm.S))
            zid = f"{prefix}forearm_{q}"
        else:
            zid = long_z

        face_zone[poly.index] = zid

    return ArmSegmentationResult(
        side=side,
        face_zone=face_zone,
        long_faces=dict(long_faces),
        universe_faces=len(face_zone),
        universe_tris=universe_tris,
        upper_frame=upper,
        forearm_frame=forearm,
        twist_artificial_deg=twist,
        bands=bands,
        landmarks={
            "shoulder": list(shoulder),
            "elbow": list(elbow),
            "wrist": list(wrist),
            "tip": list(tip),
        },
        shoulder_torso_bleed=shoulder_bleed,
    )
