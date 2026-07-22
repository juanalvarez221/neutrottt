"""Declarative configuration for Neutro arm interaction zones (R2 + C2 + D2)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LongitudinalConfig:
    """Fractions of segment bone lengths (R2 — Anatomical Balanced)."""

    shoulder_end_of_ua: float = 0.18
    elbow_prox_of_ua: float = 0.11
    elbow_dist_of_fa: float = 0.11
    wrist_prox_of_fa: float = 0.11
    wrist_dist_of_hand: float = 0.14


@dataclass(frozen=True)
class AngularConfig:
    """
    Circumferential sectors in degrees (C2 — Tattoo Optimized).
    front is centered at 0°; outer toward +S; inner toward -S; back opposite.
    """

    front_deg: float = 110.0
    outer_deg: float = 95.0
    back_deg: float = 70.0
    inner_deg: float = 85.0

    @property
    def front_half_deg(self) -> float:
        return self.front_deg * 0.5


@dataclass(frozen=True)
class MembershipConfig:
    arm_weight_thresh: float = 0.12
    lateral_bias: float = 0.02
    outlier_dist: float = 0.14
    outlier_w_min: float = 0.35


@dataclass(frozen=True)
class IslandCleanupConfig:
    """Relative to parent segment triangle count."""

    max_fraction_of_parent: float = 0.03
    min_faces: int = 2


ARM_LONGITUDINAL_CONFIG = LongitudinalConfig()
ARM_ANGULAR_CONFIG = AngularConfig()
ARM_MEMBERSHIP_CONFIG = MembershipConfig()
ISLAND_CLEANUP_CONFIG = IslandCleanupConfig()

# Blender anatomical front for MPFB Neutro Body V1 (nose toward -Y).
BODY_FRONT_BLENDER = (0.0, -1.0, 0.0)

# Semantic debug colors — same hue on left and right.
QUAD_COLORS = {
    "front": (0.15, 0.78, 0.82, 1.0),
    "back": (0.85, 0.25, 0.55, 1.0),
    "inner": (0.35, 0.45, 0.95, 1.0),
    "outer": (0.98, 0.55, 0.12, 1.0),
}

JOINT_COLORS = {
    "shoulder": (0.92, 0.28, 0.22, 1.0),
    "elbow": (0.95, 0.88, 0.18, 1.0),
    "wrist": (0.55, 0.72, 0.95, 1.0),
    "hand": (0.62, 0.28, 0.88, 1.0),
}

QUAD = ("front", "back", "inner", "outer")


@dataclass(frozen=True)
class TorsoGridConfig:
    """
    Normalized torso grid.

    Lateral thresholds are fractions of the local torso half-width at that height.
    Front/back thresholds are fractions of local half-depth.

    Vertical splits are derived from landmark parameters at runtime; the
    `v_*` fields below are only fallbacks / relative biases.
    """

    # Lateral (of local half-width)
    sternum_half: float = 0.18
    chest_outer: float = 0.72
    back_center_half: float = 0.22
    scapula_outer: float = 0.80
    mid_back_outer: float = 0.80
    abdomen_half: float = 0.55
    # Front / back (of local half-depth); |fb| below side_band → lateral ribs/flank
    front_thresh: float = 0.20
    back_thresh: float = 0.20
    # Biases added to landmark-derived vertical cuts (in normalized spine param)
    chest_lo_bias: float = 0.0
    navel_bias: float = 0.0
    mid_back_bias: float = 0.0
    # Membership
    torso_weight_min: float = 0.10
    exclude_limb_weight: float = 0.22
    exclude_head_weight: float = 0.18
    exclude_neck_only_weight: float = 0.28
    max_dist_from_spine: float = 0.28


# T1 — Anatomical Grid (balanced clarity)
TORSO_T1_CONFIG = TorsoGridConfig()

# T2 — Tattoo Optimized (more usable chest / ribs / scapula; centers still selectable)
TORSO_T2_CONFIG = TorsoGridConfig(
    sternum_half=0.14,
    chest_outer=0.80,
    back_center_half=0.18,
    scapula_outer=0.88,
    mid_back_outer=0.85,
    abdomen_half=0.50,
    front_thresh=0.16,
    back_thresh=0.16,
    chest_lo_bias=-0.02,
    navel_bias=0.01,
)

TORSO_ZONE_IDS: tuple[str, ...] = (
    "left_chest",
    "right_chest",
    "sternum",
    "upper_abdomen",
    "lower_abdomen",
    "left_ribs",
    "right_ribs",
    "left_flank",
    "right_flank",
    "left_scapula",
    "right_scapula",
    "upper_back_center",
    "left_mid_back",
    "right_mid_back",
    "mid_back_center",
    "left_lower_back",
    "right_lower_back",
    "lower_back_center",
)

# Semantic debug colors (stable across candidates)
TORSO_ZONE_COLORS: dict[str, tuple[float, float, float, float]] = {
    "left_chest": (0.92, 0.42, 0.38, 1.0),
    "right_chest": (0.95, 0.55, 0.32, 1.0),
    "sternum": (0.98, 0.88, 0.35, 1.0),
    "upper_abdomen": (0.55, 0.82, 0.42, 1.0),
    "lower_abdomen": (0.35, 0.72, 0.48, 1.0),
    "left_ribs": (0.42, 0.72, 0.92, 1.0),
    "right_ribs": (0.32, 0.58, 0.95, 1.0),
    "left_flank": (0.55, 0.45, 0.88, 1.0),
    "right_flank": (0.68, 0.38, 0.82, 1.0),
    "left_scapula": (0.88, 0.35, 0.55, 1.0),
    "right_scapula": (0.95, 0.28, 0.42, 1.0),
    "upper_back_center": (0.75, 0.75, 0.78, 1.0),
    "left_mid_back": (0.45, 0.55, 0.72, 1.0),
    "right_mid_back": (0.38, 0.48, 0.68, 1.0),
    "mid_back_center": (0.65, 0.68, 0.72, 1.0),
    "left_lower_back": (0.58, 0.48, 0.38, 1.0),
    "right_lower_back": (0.68, 0.52, 0.32, 1.0),
    "lower_back_center": (0.55, 0.58, 0.52, 1.0),
}

# Island cleanup for torso (relative to zone triangle count)
TORSO_ISLAND_CLEANUP = IslandCleanupConfig(
    max_fraction_of_parent=0.08,
    min_faces=2,
)
