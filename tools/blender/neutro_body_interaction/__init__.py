"""Canonical Neutro Body V1 interaction-zone algorithms (Blender-side)."""

from .config import (
    ARM_ANGULAR_CONFIG,
    ARM_LONGITUDINAL_CONFIG,
    ARM_MEMBERSHIP_CONFIG,
    ISLAND_CLEANUP_CONFIG,
    BODY_FRONT_BLENDER,
    QUAD_COLORS,
    JOINT_COLORS,
)
from .geometry import (
    angle_deg,
    arm_polyline_param,
    face_area,
    project_point_on_segment,
    world_bbox,
)
from .anatomical_frames import (
    AnatomicalFrame,
    build_upper_arm_frame,
    transport_forearm_frame,
    estimate_twist_about_L,
)
from .arm_segmentation import (
    ArmSide,
    ArmBoneNames,
    resolve_longitudinal_bands,
    is_arm_member,
    classify_longitudinal_r2,
    classify_angular_c2,
    angular_sector_scores,
    segment_arm_faces,
)
from .island_cleanup import cleanup_islands, connected_components

__all__ = [
    "ARM_ANGULAR_CONFIG",
    "ARM_LONGITUDINAL_CONFIG",
    "ARM_MEMBERSHIP_CONFIG",
    "ISLAND_CLEANUP_CONFIG",
    "BODY_FRONT_BLENDER",
    "QUAD_COLORS",
    "JOINT_COLORS",
    "angle_deg",
    "arm_polyline_param",
    "face_area",
    "project_point_on_segment",
    "world_bbox",
    "AnatomicalFrame",
    "build_upper_arm_frame",
    "transport_forearm_frame",
    "estimate_twist_about_L",
    "ArmSide",
    "ArmBoneNames",
    "resolve_longitudinal_bands",
    "is_arm_member",
    "classify_longitudinal_r2",
    "classify_angular_c2",
    "angular_sector_scores",
    "segment_arm_faces",
    "cleanup_islands",
    "connected_components",
]
