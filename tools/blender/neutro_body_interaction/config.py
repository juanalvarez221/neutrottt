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


@dataclass(frozen=True)
class PelvisGridConfig:
    """
    Pelvis / hip / glute grid on body-normalized coords.

    Vertical cuts are fractions along waist→thighStart.
    Lateral / front thresholds are fractions of local half-width / half-depth.
    """

    # Vertical (0 = thigh start, 1 = waist)
    lower_back_lo: float = 0.55  # above this → lower_back; below → sacrum/glute/hip
    sacrum_hi: float = 0.62
    sacrum_lo: float = 0.28
    glute_hi: float = 0.55
    hip_hi: float = 0.72
    abdomen_lo: float = 0.22  # front center stops above thigh
    # Lateral
    sacrum_half: float = 0.28
    abdomen_half: float = 0.48
    hip_inner: float = 0.28
    glute_inner: float = 0.18
    # Front / back
    front_thresh: float = 0.18
    back_thresh: float = 0.16
    # Membership
    pelvis_weight_min: float = 0.10
    thigh_exclude_weight: float = 0.28
    thigh_start_margin: float = 0.08  # along thigh bone from hip
    max_dist_from_pelvis: float = 0.22
    # If True, sacrum claims its band before lower_back (F1 taller growth).
    sacrum_priority: bool = False


PELVIS_P1_CONFIG = PelvisGridConfig(
    lower_back_lo=0.42,
    sacrum_hi=0.48,
    sacrum_lo=0.18,
    glute_hi=0.50,
    hip_hi=0.70,
    abdomen_lo=0.18,
    sacrum_half=0.34,
    abdomen_half=0.52,
)

PELVIS_P2_CONFIG = PelvisGridConfig(
    lower_back_lo=0.38,
    sacrum_hi=0.52,
    sacrum_lo=0.14,
    glute_hi=0.55,
    hip_hi=0.78,
    abdomen_lo=0.12,
    sacrum_half=0.38,
    abdomen_half=0.58,
    hip_inner=0.20,
    glute_inner=0.10,
    front_thresh=0.12,
    back_thresh=0.10,
)

# F1A — Wider Sacrum (from P1): grow laterally into central LBC / medial glute
PELVIS_F1A_CONFIG = PelvisGridConfig(
    lower_back_lo=0.44,
    sacrum_hi=0.50,
    sacrum_lo=0.16,
    glute_hi=0.50,
    hip_hi=0.70,
    abdomen_lo=0.18,
    sacrum_half=0.50,
    abdomen_half=0.52,
    sacrum_priority=True,
)

# F1B — Taller Sacrum (from P1): grow into lower_back_center + slight upper glute
PELVIS_F1B_CONFIG = PelvisGridConfig(
    lower_back_lo=0.50,
    sacrum_hi=0.56,
    sacrum_lo=0.14,
    glute_hi=0.50,
    hip_hi=0.70,
    abdomen_lo=0.18,
    sacrum_half=0.36,
    abdomen_half=0.52,
    sacrum_priority=True,
)

# Official frozen torso+pelvis map (Paso 26): F1A Wider Sacrum on P1 base.
PELVIS_FINAL_CONFIG = PELVIS_F1A_CONFIG

PELVIS_ZONE_IDS: tuple[str, ...] = (
    "left_hip",
    "right_hip",
    "left_glute",
    "right_glute",
    "sacrum",
)

# Lower torso zones whose inferior boundary may be redrawn with pelvis.
MUTABLE_LOWER_TORSO_IDS: tuple[str, ...] = (
    "lower_abdomen",
    "left_lower_back",
    "right_lower_back",
    "lower_back_center",
)

LOCKED_TORSO_IDS: tuple[str, ...] = tuple(
    z for z in TORSO_ZONE_IDS if z not in MUTABLE_LOWER_TORSO_IDS
)

COMBINED_TORSO_PELVIS_ZONE_IDS: tuple[str, ...] = TORSO_ZONE_IDS + PELVIS_ZONE_IDS

PELVIS_ZONE_COLORS: dict[str, tuple[float, float, float, float]] = {
    "left_hip": (0.78, 0.62, 0.28, 1.0),
    "right_hip": (0.88, 0.68, 0.22, 1.0),
    "left_glute": (0.72, 0.38, 0.48, 1.0),
    "right_glute": (0.82, 0.32, 0.42, 1.0),
    "sacrum": (0.70, 0.72, 0.55, 1.0),
}

PELVIS_ISLAND_CLEANUP = IslandCleanupConfig(
    max_fraction_of_parent=0.10,
    min_faces=2,
)

# Stronger cleanup for wrapping rib panels
RIBS_ISLAND_CLEANUP = IslandCleanupConfig(
    max_fraction_of_parent=0.18,
    min_faces=2,
)


@dataclass(frozen=True)
class LegLongitudinalConfig:
    """Fractions of thigh / lower-leg / foot bone lengths (longitudinal only)."""

    knee_prox_of_thigh: float = 0.11
    knee_dist_of_lower: float = 0.11
    ankle_prox_of_lower: float = 0.11
    ankle_dist_of_foot: float = 0.14
    thigh_start_margin: float = 0.08  # frozen pelvis frontier (same as PELVIS)


@dataclass(frozen=True)
class LegMembershipConfig:
    leg_weight_thresh: float = 0.12
    lateral_bias: float = 0.02
    pelvis_bias: float = 0.04
    outlier_dist: float = 0.16
    outlier_w_min: float = 0.35
    distal_override_weight: float = 0.28


# L1 — Proportional Baseline (arm-like fractions)
LEG_L1_CONFIG = LegLongitudinalConfig(
    knee_prox_of_thigh=0.11,
    knee_dist_of_lower=0.11,
    ankle_prox_of_lower=0.11,
    ankle_dist_of_foot=0.14,
)

# L2 — Leg Anatomical Balanced (larger selectable knee, slightly larger ankle)
LEG_L2_CONFIG = LegLongitudinalConfig(
    knee_prox_of_thigh=0.15,
    knee_dist_of_lower=0.14,
    ankle_prox_of_lower=0.13,
    ankle_dist_of_foot=0.16,
)

LEG_MEMBERSHIP_CONFIG = LegMembershipConfig()

LEG_LONGITUDINAL_ZONE_IDS: tuple[str, ...] = (
    "right_thigh",
    "right_knee",
    "right_lower_leg",
    "right_ankle",
    "right_foot",
    "left_thigh",
    "left_knee",
    "left_lower_leg",
    "left_ankle",
    "left_foot",
)

LEG_ZONE_COLORS: dict[str, tuple[float, float, float, float]] = {
    "right_thigh": (0.18, 0.72, 0.78, 1.0),
    "left_thigh": (0.18, 0.72, 0.78, 1.0),
    "right_knee": (0.95, 0.82, 0.18, 1.0),
    "left_knee": (0.95, 0.82, 0.18, 1.0),
    "right_lower_leg": (0.35, 0.48, 0.92, 1.0),
    "left_lower_leg": (0.35, 0.48, 0.92, 1.0),
    "right_ankle": (0.55, 0.78, 0.95, 1.0),
    "left_ankle": (0.55, 0.78, 0.95, 1.0),
    "right_foot": (0.72, 0.38, 0.88, 1.0),
    "left_foot": (0.72, 0.38, 0.88, 1.0),
}

LEG_ISLAND_CLEANUP = IslandCleanupConfig(
    max_fraction_of_parent=0.06,
    min_faces=2,
)

# Official longitudinal base (Paso 27/28): L2 Anatomical Balanced
LEG_FINAL_LONGITUDINAL_CONFIG = LEG_L2_CONFIG

# Circumferential angular sectors for legs (NOT arm defaults).
# front_deg = full front span; outer/inner are contiguous spans;
# back = remainder to 360°.


@dataclass(frozen=True)
class LegCircumferentialPair:
    """Separate angular configs for thigh vs lower_leg."""

    thigh: AngularConfig
    lower_leg: AngularConfig


# G1 — Balanced Quadrants (~90° each)
LEG_G1_CONFIG = LegCircumferentialPair(
    thigh=AngularConfig(front_deg=90.0, outer_deg=90.0, back_deg=90.0, inner_deg=90.0),
    lower_leg=AngularConfig(front_deg=90.0, outer_deg=90.0, back_deg=90.0, inner_deg=90.0),
)

# G2 — Tattoo Optimized Legs
# Thigh: generous front + outer; back/inner remain usable (>= ~20% target intent)
# Lower: front/outer/back emphasized; inner not minimal
LEG_G2_CONFIG = LegCircumferentialPair(
    thigh=AngularConfig(front_deg=105.0, outer_deg=100.0, back_deg=80.0, inner_deg=75.0),
    lower_leg=AngularConfig(front_deg=100.0, outer_deg=95.0, back_deg=90.0, inner_deg=75.0),
)

LEG_CIRC_ISLAND_CLEANUP = IslandCleanupConfig(
    max_fraction_of_parent=0.03,
    min_faces=2,
)

LEG_DETAILED_QUAD_SUFFIXES: tuple[str, ...] = tuple(
    f"{seg}_{q}" for seg in ("thigh", "lower_leg") for q in QUAD
)

LEG_DETAILED_ZONE_IDS: tuple[str, ...] = tuple(
    f"{side}_{suf}"
    for side in ("right", "left")
    for suf in (
        "thigh_front",
        "thigh_back",
        "thigh_inner",
        "thigh_outer",
        "knee",
        "lower_leg_front",
        "lower_leg_back",
        "lower_leg_inner",
        "lower_leg_outer",
        "ankle",
        "foot",
    )
)

LEG_DETAILED_ZONE_COLORS: dict[str, tuple[float, float, float, float]] = {
    **{f"{side}_thigh_{q}": QUAD_COLORS[q] for side in ("right", "left") for q in QUAD},
    "right_lower_leg_front": (0.12, 0.68, 0.72, 1.0),
    "left_lower_leg_front": (0.12, 0.68, 0.72, 1.0),
    "right_lower_leg_back": (0.78, 0.22, 0.50, 1.0),
    "left_lower_leg_back": (0.78, 0.22, 0.50, 1.0),
    "right_lower_leg_inner": (0.30, 0.40, 0.90, 1.0),
    "left_lower_leg_inner": (0.30, 0.40, 0.90, 1.0),
    "right_lower_leg_outer": (0.92, 0.50, 0.10, 1.0),
    "left_lower_leg_outer": (0.92, 0.50, 0.10, 1.0),
    "right_knee": (0.95, 0.82, 0.18, 1.0),
    "left_knee": (0.95, 0.82, 0.18, 1.0),
    "right_ankle": (0.55, 0.78, 0.95, 1.0),
    "left_ankle": (0.55, 0.78, 0.95, 1.0),
    "right_foot": (0.72, 0.38, 0.88, 1.0),
    "left_foot": (0.72, 0.38, 0.88, 1.0),
}
