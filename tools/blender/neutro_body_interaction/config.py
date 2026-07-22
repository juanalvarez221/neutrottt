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
