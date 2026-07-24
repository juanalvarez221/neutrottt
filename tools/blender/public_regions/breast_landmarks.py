"""Reproducible breast / pectoral surface landmarks on BodyVisual bake."""

from __future__ import annotations

import math
from dataclasses import dataclass

from mathutils import Vector


@dataclass
class BreastSideLandmarks:
    side: str  # "left" | "right"
    apex: Vector
    apex_face: int
    sternum_superior: Vector
    sternum_mid: Vector
    clavicle_medial: Vector
    clavicle_lateral: Vector
    anterior_axillary_fold: Vector
    inframammary_medial: Vector
    inframammary_lateral: Vector
    infraclavicular_mid: Vector
    # Stable vertex anchors
    v_apex: int
    v_sternum_sup: int
    v_sternum_mid: int
    v_clav_med: int
    v_clav_lat: int
    v_axilla: int
    v_imf_med: int
    v_imf_lat: int
    v_infraclav: int

    def to_dict(self) -> dict:
        def v(p: Vector):
            return [round(p.x, 5), round(p.y, 5), round(p.z, 5)]

        return {
            "side": self.side,
            "apex": v(self.apex),
            "apex_face": self.apex_face,
            "sternum_superior": v(self.sternum_superior),
            "sternum_mid": v(self.sternum_mid),
            "clavicle_medial": v(self.clavicle_medial),
            "clavicle_lateral": v(self.clavicle_lateral),
            "anterior_axillary_fold": v(self.anterior_axillary_fold),
            "inframammary_medial": v(self.inframammary_medial),
            "inframammary_lateral": v(self.inframammary_lateral),
            "infraclavicular_mid": v(self.infraclavicular_mid),
            "vertices": {
                "apex": self.v_apex,
                "sternum_sup": self.v_sternum_sup,
                "sternum_mid": self.v_sternum_mid,
                "clav_med": self.v_clav_med,
                "clav_lat": self.v_clav_lat,
                "axilla": self.v_axilla,
                "imf_med": self.v_imf_med,
                "imf_lat": self.v_imf_lat,
                "infraclav": self.v_infraclav,
            },
        }


def _nearest_vertex(mesh, mw, point: Vector) -> int:
    best = 0
    best_d = 1e18
    for i, v in enumerate(mesh.vertices):
        d = (mw @ v.co - point).length_squared
        if d < best_d:
            best_d = d
            best = i
    return best


def _torso_center_at_height(centroids: dict[int, Vector], sternum_x: float, shoulder_w: float, h: float) -> Vector:
    band = 0.04
    pts = [
        c
        for c in centroids.values()
        if abs(c.z - h) <= band and abs(c.x - sternum_x) < shoulder_w * 0.55
    ]
    if len(pts) < 6:
        return Vector((sternum_x, 0.0, h))
    return Vector(
        (
            sum(p.x for p in pts) / len(pts),
            sum(p.y for p in pts) / len(pts),
            h,
        )
    )


def surface_azimuth(c: Vector, center: Vector, body_front: Vector, body_right: Vector) -> float:
    rel = Vector((c.x - center.x, c.y - center.y, 0.0))
    if rel.length < 1e-8:
        return 0.0
    fwd = Vector((body_front.x, body_front.y, 0.0)).normalized()
    right = Vector((body_right.x, body_right.y, 0.0)).normalized()
    return math.atan2(rel.dot(right), rel.dot(fwd))


def find_breast_side_landmarks(
    mesh,
    mw,
    *,
    side: str,
    lm,
    centroids: dict[int, Vector],
    normals: dict[int, Vector],
    remaining: set[int],
) -> BreastSideLandmarks:
    """
    Locate breast surface landmarks for female BodyVisual.

    Apex = maximum anterior prominence on the side.
    IMF = under-breast fold from vertical frontness profiles.
    """
    is_right = side == "right"
    sternum_x = lm.sternum_x
    clav = lm.clavicle_r if is_right else lm.clavicle_l
    shoulder = lm.shoulder_r if is_right else lm.shoulder_l
    half = max(lm.chest_width * 0.5, lm.shoulder_width * 0.32, 0.12)

    z_hi = min(lm.clavicle_l.z, lm.clavicle_r.z) + 0.01
    z_lo = lm.waist_level.z + 0.02

    # --- Apex: most frontal face in anterior chest band ---
    best_fi = -1
    best_score = -1e18
    for fi in remaining:
        c = centroids[fi]
        n = normals[fi]
        if is_right and c.x > sternum_x - 0.01:
            continue
        if not is_right and c.x < sternum_x + 0.01:
            continue
        if not (z_lo < c.z < z_hi):
            continue
        if abs(c.x - sternum_x) < half * 0.12:
            continue
        if abs(c.x - sternum_x) > half * 1.15:
            continue
        if n.dot(lm.body_front) < 0.05:
            continue
        # Frontness: more negative Y in Blender = more anterior
        score = -c.y + 0.15 * n.dot(lm.body_front)
        if score > best_score:
            best_score = score
            best_fi = fi
    if best_fi < 0:
        # Fallback geometric seed
        sign = -1.0 if is_right else 1.0
        apex = Vector((sternum_x + sign * half * 0.42, lm.upper_chest.y - 0.08, lm.upper_chest.z - 0.06))
        apex_face = min(remaining, key=lambda fi: (centroids[fi] - apex).length)
    else:
        apex = centroids[best_fi].copy()
        apex_face = best_fi

    # --- Vertical profile → inframammary fold ---
    # Sample strips by lateral distance; find z below apex where frontness collapses.
    imf_points: list[Vector] = []
    n_strips = 10
    x0 = sternum_x + (-half * 0.18 if is_right else half * 0.18)
    x1 = sternum_x + (-half * 0.95 if is_right else half * 0.95)
    for si in range(n_strips):
        t = si / max(n_strips - 1, 1)
        x_t = x0 + (x1 - x0) * t
        strip = []
        for fi in remaining:
            c = centroids[fi]
            if abs(c.x - x_t) > half * 0.08:
                continue
            if c.z > apex.z + 0.02 or c.z < lm.pelvis.z + 0.05:
                continue
            if normals[fi].dot(lm.body_front) < -0.05:
                continue
            strip.append((c.z, -c.y, c))
        if len(strip) < 4:
            continue
        strip.sort(key=lambda t: -t[0])  # high z → low z
        # Find peak frontness at/near apex band, then fold where frontness drops
        peak_y = -1e9
        peak_z = apex.z
        for z, fy, _c in strip:
            if abs(z - apex.z) < 0.05 and fy > peak_y:
                peak_y = fy
                peak_z = z
        fold = None
        prev_fy = peak_y
        for z, fy, c in strip:
            if z > peak_z:
                continue
            # Underside / fold: frontness drops sharply OR normal turns down
            if fy < prev_fy - 0.008 and z < peak_z - 0.02:
                fold = c
                break
            prev_fy = min(prev_fy, fy)
        if fold is None:
            # Geometric fallback: fixed drop under apex
            fold = Vector((x_t, apex.y + 0.02, apex.z - max(0.055, half * 0.28)))
        imf_points.append(fold)

    if not imf_points:
        imf_med = Vector((sternum_x + (-0.02 if is_right else 0.02), apex.y + 0.01, apex.z - 0.06))
        imf_lat = Vector((apex.x + (-0.04 if is_right else 0.04), apex.y + 0.02, apex.z - 0.07))
    else:
        imf_points.sort(key=lambda p: p.x)
        imf_med = imf_points[0] if is_right else imf_points[-1]
        imf_lat = imf_points[-1] if is_right else imf_points[0]
        # Prefer extremes by |x - sternum|
        imf_med = min(imf_points, key=lambda p: abs(p.x - sternum_x))
        imf_lat = max(imf_points, key=lambda p: abs(p.x - sternum_x))

    # Clamp IMF below apex
    if imf_med.z > apex.z - 0.03:
        imf_med = Vector((imf_med.x, imf_med.y, apex.z - 0.055))
    if imf_lat.z > apex.z - 0.035:
        imf_lat = Vector((imf_lat.x, imf_lat.y, apex.z - 0.065))

    sternum_sup = Vector((sternum_x, lm.upper_chest.y - 0.02, min(clav.z, lm.upper_chest.z) - 0.02))
    sternum_mid = Vector((sternum_x, apex.y + 0.01, (apex.z + imf_med.z) * 0.5))
    clav_med = Vector((sternum_x + (-0.03 if is_right else 0.03), clav.y - 0.01, clav.z - 0.015))
    clav_lat = Vector(
        (
            clav.x * 0.35 + shoulder.x * 0.65,
            clav.y - 0.02,
            clav.z - 0.02,
        )
    )
    # Anterior axillary fold: below axilla, anterior
    axilla = Vector(
        (
            shoulder.x * 0.72 + apex.x * 0.28,
            apex.y + 0.01,
            lm.axillary_z - 0.01,
        )
    )
    infraclav = Vector(
        (
            (clav_med.x + clav_lat.x) * 0.5,
            (clav_med.y + clav_lat.y) * 0.5 - 0.01,
            (clav_med.z + clav_lat.z) * 0.5 - 0.01,
        )
    )

    return BreastSideLandmarks(
        side=side,
        apex=apex,
        apex_face=apex_face,
        sternum_superior=sternum_sup,
        sternum_mid=sternum_mid,
        clavicle_medial=clav_med,
        clavicle_lateral=clav_lat,
        anterior_axillary_fold=axilla,
        inframammary_medial=imf_med,
        inframammary_lateral=imf_lat,
        infraclavicular_mid=infraclav,
        v_apex=_nearest_vertex(mesh, mw, apex),
        v_sternum_sup=_nearest_vertex(mesh, mw, sternum_sup),
        v_sternum_mid=_nearest_vertex(mesh, mw, sternum_mid),
        v_clav_med=_nearest_vertex(mesh, mw, clav_med),
        v_clav_lat=_nearest_vertex(mesh, mw, clav_lat),
        v_axilla=_nearest_vertex(mesh, mw, axilla),
        v_imf_med=_nearest_vertex(mesh, mw, imf_med),
        v_imf_lat=_nearest_vertex(mesh, mw, imf_lat),
        v_infraclav=_nearest_vertex(mesh, mw, infraclav),
    )
