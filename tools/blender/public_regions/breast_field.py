"""
World-space breast mound classifier for UV mask texel overrides.

Continuous field (not face ownership) so UV borders can be curved.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from mathutils import Vector

from public_regions.breast_landmarks import BreastSideLandmarks


@dataclass
class BreastField:
    side: str
    apex: Vector
    sternum_x: float
    imf_z: float
    z_top: float
    half_w: float
    body_front: Vector
    landmarks: BreastSideLandmarks

    def membership(self, p: Vector) -> float:
        """
        Soft membership in [0,1] for breast exterior surface (tattooable mound).
        """
        is_right = self.side == "right"
        # Side ownership
        if is_right and p.x > self.sternum_x + 0.008:
            return 0.0
        if not is_right and p.x < self.sternum_x - 0.008:
            return 0.0
        if p.z < self.imf_z - 0.01 or p.z > self.z_top + 0.02:
            return 0.0

        # Lateral distance from sternum
        lat = abs(p.x - self.sternum_x)
        if lat > self.half_w * 1.05:
            return 0.0

        # Normalized ellipse coords around apex
        dx = (p.x - self.apex.x) / max(self.half_w * 0.72, 0.04)
        # Asymmetric vertical: shorter above apex, longer toward IMF
        if p.z >= self.apex.z:
            up = max(self.z_top - self.apex.z, 0.03)
            dz = (p.z - self.apex.z) / up
        else:
            dn = max(self.apex.z - self.imf_z, 0.05)
            dz = (self.apex.z - p.z) / dn

        # Slight pear shape toward IMF
        pear = 1.0 + 0.18 * max(0.0, -dz if p.z < self.apex.z else 0.0)
        r2 = (dx * dx) + (dz * dz) / (pear * pear)

        # Frontness gate — do not spill to ribs/back
        # Prefer points near anterior of apex band
        frontness = -(p.y - self.apex.y)  # Blender: more negative Y = more anterior
        if frontness < -0.04:
            return 0.0

        # Soft edge
        if r2 > 1.15:
            return 0.0
        if r2 <= 0.85:
            m = 1.0
        else:
            m = 1.0 - (r2 - 0.85) / 0.30

        # IMF soft floor (curved): raise threshold laterally
        lat_t = lat / max(self.half_w, 0.05)
        imf_local = self.imf_z + 0.012 * (lat_t ** 2)
        if p.z < imf_local:
            drop = (imf_local - p.z) / 0.02
            m *= max(0.0, 1.0 - drop)

        # Sternum soft wall
        sternum_gap = abs(p.x - self.sternum_x)
        if sternum_gap < 0.012:
            m *= sternum_gap / 0.012

        return max(0.0, min(1.0, m))


def build_breast_field(bl: BreastSideLandmarks, lm) -> BreastField:
    half = max(lm.chest_width * 0.48, lm.shoulder_width * 0.30, 0.11)
    imf_z = min(bl.inframammary_medial.z, bl.inframammary_lateral.z)
    imf_z = min(imf_z, bl.apex.z - 0.07)
    imf_z = max(imf_z, bl.apex.z - half * 0.7)
    z_top = max(bl.infraclavicular_mid.z, bl.sternum_superior.z)
    z_top = min(z_top, bl.apex.z + half * 0.55)
    return BreastField(
        side=bl.side,
        apex=bl.apex.copy(),
        sternum_x=lm.sternum_x,
        imf_z=imf_z,
        z_top=z_top,
        half_w=half,
        body_front=lm.body_front.copy(),
        landmarks=bl,
    )


def contour_control_points(field: BreastField) -> list[list[float]]:
    """Versioned closed contour approx in world space for authorship."""
    bl = field.landmarks
    pts = [
        bl.sternum_superior,
        bl.infraclavicular_mid,
        bl.clavicle_lateral,
        bl.anterior_axillary_fold,
        bl.inframammary_lateral,
        bl.inframammary_medial,
        bl.sternum_mid,
    ]
    # Sample IMF arc
    mid_imf = (bl.inframammary_medial + bl.inframammary_lateral) * 0.5
    mid_imf = Vector((mid_imf.x, mid_imf.y + 0.01, field.imf_z))
    pts.insert(5, mid_imf)
    return [[round(p.x, 5), round(p.y, 5), round(p.z, 5)] for p in pts]


def mirror_field_x(field: BreastField, side: str, lm, bl_other: BreastSideLandmarks) -> BreastField:
    """Build contralateral field by mirroring apex/IMF in X (anatomical symmetry)."""
    apex = Vector((-field.apex.x, field.apex.y, field.apex.z))
    # Prefer measured apex if close
    if (bl_other.apex - apex).length < 0.05:
        apex = bl_other.apex.copy()
    return BreastField(
        side=side,
        apex=apex,
        sternum_x=lm.sternum_x,
        imf_z=field.imf_z,
        z_top=field.z_top,
        half_w=field.half_w,
        body_front=field.body_front.copy(),
        landmarks=bl_other,
    )
