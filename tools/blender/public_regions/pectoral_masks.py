"""Authoritative pectoral face masks — full breast tattoo surface (female BodyVisual)."""

from __future__ import annotations

import math
from collections import deque

from mathutils import Vector

from .breast_landmarks import BreastSideLandmarks, find_breast_side_landmarks, surface_azimuth
from .geodesic import (
    build_face_adjacency,
    build_vertex_adjacency,
    closed_loop_edges,
    optimize_boundary_faces,
    shortest_path,
)


def _center_at(centroids, sternum_x, shoulder_w, h):
    band = 0.04
    pts = [
        c
        for c in centroids.values()
        if abs(c.z - h) <= band and abs(c.x - sternum_x) < shoulder_w * 0.55
    ]
    if len(pts) < 6:
        return Vector((sternum_x, 0.0, h))
    return Vector(
        (sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), h)
    )


def _measure_imf_z(
    *,
    side: str,
    lm,
    centroids,
    normals,
    remaining: set[int],
    apex: Vector,
) -> float:
    """
    Inframammary fold height: lowest z of downward-facing anterior faces
    under the breast mound, else apex.z - measured drop.
    """
    is_right = side == "right"
    half = max(lm.chest_width * 0.5, 0.12)
    underside = []
    for fi in remaining:
        c = centroids[fi]
        n = normals[fi]
        if is_right and c.x > lm.sternum_x - 0.005:
            continue
        if not is_right and c.x < lm.sternum_x + 0.005:
            continue
        if c.z > apex.z or c.z < apex.z - half * 0.85:
            continue
        dx = abs(c.x - apex.x)
        if dx > half * 0.7:
            continue
        # Underside of breast: normal points down / less frontal, still near mound
        if n.dot(lm.body_up) < -0.08 and (c - apex).length < half * 0.85:
            underside.append(c.z)
        elif n.dot(lm.body_front) > 0.05 and c.z < apex.z - 0.03:
            # Anterior lower breast wall
            if -c.y > -apex.y - 0.02:
                underside.append(c.z)
    if underside:
        # Prefer lower quartile (true fold), not extreme outliers
        underside.sort()
        return underside[max(0, len(underside) // 5)]
    return apex.z - max(0.07, half * 0.38)


def build_one_pectoral(
    mesh,
    mw,
    *,
    side: str,
    lm,
    centroids,
    normals,
    remaining: set[int],
    face_adj: dict[int, set[int]],
    vadj: dict,
) -> tuple[set[int], BreastSideLandmarks, dict]:
    bl = find_breast_side_landmarks(
        mesh,
        mw,
        side=side,
        lm=lm,
        centroids=centroids,
        normals=normals,
        remaining=remaining,
    )
    is_right = side == "right"
    half = max(lm.chest_width * 0.5, lm.shoulder_width * 0.32, 0.12)
    apex = bl.apex
    imf_z = _measure_imf_z(
        side=side,
        lm=lm,
        centroids=centroids,
        normals=normals,
        remaining=remaining,
        apex=apex,
    )
    # Ensure IMF is meaningfully below apex (female breast drop)
    imf_z = min(imf_z, apex.z - 0.075)
    imf_z = max(imf_z, apex.z - half * 0.62)

    z_top = min(lm.clavicle_l.z, lm.clavicle_r.z) - 0.008
    # Lateral limit: push toward shoulder / anterior axillary fold
    shoulder = lm.shoulder_r if is_right else lm.shoulder_l
    x_ax = 0.55 * bl.anterior_axillary_fold.x + 0.45 * shoulder.x
    x_stern = lm.sternum_x

    # Breast mound radius — cover full breast width to axilla
    r_mound = half * 0.98

    grown: set[int] = set()
    for fi in remaining:
        c = centroids[fi]
        n = normals[fi]
        if is_right and c.x > x_stern + 0.012:
            continue
        if not is_right and c.x < x_stern - 0.012:
            continue
        # Hard inferior: never below IMF into abdomen
        if c.z < imf_z - 0.008:
            continue
        if c.z > z_top + 0.01:
            continue
        # Lateral: stop before arm mass
        if is_right and c.x < min(x_ax, shoulder.x) - 0.01:
            continue
        if not is_right and c.x > max(x_ax, shoulder.x) + 0.01:
            continue
        # Must be anterior-ish (allow underside of breast)
        if n.dot(lm.body_front) < -0.55:
            continue
        # Stay on anterior breast surface (Blender front = −Y)
        if c.y > 0.02:
            continue
        center = _center_at(centroids, lm.sternum_x, lm.shoulder_width, c.z)
        az = abs(surface_azimuth(c, center, lm.body_front, lm.body_right))
        if az > math.radians(72):
            continue

        # Elliptical breast mound in (x,z) relative to apex
        dx = (c.x - apex.x) / max(r_mound, 1e-6)
        z_span_up = max(z_top - apex.z, 0.05)
        z_span_dn = max(apex.z - imf_z, 0.07)
        if c.z >= apex.z:
            dz = (c.z - apex.z) / z_span_up
        else:
            dz = (apex.z - c.z) / z_span_dn
        ell = dx * dx + 0.85 * dz * dz

        # Frontness relative to apex — include full breast volume
        frontal_enough = (-c.y) >= (-apex.y) - 0.045

        near_mound = ell <= 1.35 and frontal_enough
        infraclav = (
            c.z > apex.z - 0.015
            and c.z <= z_top + 0.008
            and abs(c.x - apex.x) < r_mound * 1.15
            and n.dot(lm.body_front) > 0.0
        )
        medial = (
            abs(c.x - x_stern) < half * 0.28
            and imf_z <= c.z <= z_top
            and n.dot(lm.body_front) > 0.08
        )
        # Lower breast wall down to IMF across full width
        lower_breast = (
            imf_z - 0.006 <= c.z <= apex.z
            and abs(c.x - apex.x) < r_mound * 1.05
            and n.dot(lm.body_front) > -0.25
            and frontal_enough
        )
        if near_mound or infraclav or medial or lower_breast:
            grown.add(fi)

    # Geodesic expand from apex within grown∪candidates to fill holes
    seeds = {bl.apex_face} if bl.apex_face in remaining else set()
    if not seeds and grown:
        seeds = {min(grown, key=lambda fi: (centroids[fi] - apex).length)}
    # Also seed infraclavicular
    for fi in list(grown):
        if centroids[fi].z > apex.z + 0.02:
            seeds.add(fi)

    # Fill holes: grow inside grown's bounding accept set
    accept = set(grown)
    # Add neighbors that clearly belong (1-ring fill)
    for _ in range(3):
        add = set()
        for fi in list(accept):
            for nb in face_adj.get(fi, ()):
                if nb in accept or nb not in remaining:
                    continue
                c = centroids[nb]
                if c.z < imf_z - 0.008 or c.z > z_top + 0.01:
                    continue
                if is_right and (c.x > x_stern + 0.012 or c.x < x_ax - 0.03):
                    continue
                if not is_right and (c.x < x_stern - 0.012 or c.x > x_ax + 0.03):
                    continue
                if normals[nb].dot(lm.body_front) < -0.4:
                    continue
                dx = (c.x - apex.x) / max(r_mound, 1e-6)
                if c.z >= apex.z:
                    dz = (c.z - apex.z) / max(z_top - apex.z, 0.04)
                else:
                    dz = (apex.z - c.z) / max(apex.z - imf_z, 0.05)
                if dx * dx + dz * dz <= 1.25:
                    add.add(nb)
        if not add:
            break
        accept |= add

    grown = optimize_boundary_faces(accept, face_adj, passes=4)

    # Hard strip anything below IMF (prevent abdomen drip)
    grown = {fi for fi in grown if centroids[fi].z >= imf_z - 0.006}

    # Geodesic boundary polish (optional edges for meta)
    blocked = set()
    try:
        segs = [
            (bl.v_sternum_sup, bl.v_infraclav),
            (bl.v_infraclav, bl.v_clav_lat),
            (bl.v_clav_lat, bl.v_axilla),
            (bl.v_axilla, bl.v_imf_lat),
            (bl.v_imf_lat, bl.v_imf_med),
            (bl.v_imf_med, bl.v_sternum_mid),
            (bl.v_sternum_mid, bl.v_sternum_sup),
        ]
        paths = []
        for a, b in segs:
            p = shortest_path(vadj, a, b)
            if len(p) >= 2:
                paths.append(p)
        blocked = closed_loop_edges(paths)
    except Exception:
        blocked = set()

    meta = {
        "imf_z": round(imf_z, 5),
        "apex": [round(apex.x, 5), round(apex.y, 5), round(apex.z, 5)],
        "boundaryEdgeCount": len(blocked),
        "faceCount": len(grown),
        "landmarks": bl.to_dict(),
    }
    return grown, bl, meta


def build_sternal_bridge(
    *,
    lm,
    centroids,
    normals,
    remaining: set[int],
    pec_r: set[int],
    pec_l: set[int],
) -> tuple[set[int], set[int]]:
    if not pec_r or not pec_l:
        return set(), set()
    zs_r = [centroids[i].z for i in pec_r]
    zs_l = [centroids[i].z for i in pec_l]
    # Bridge only in UPPER-MID pec range (avoid inferior band / abdomen look)
    z_lo = max(min(zs_r), min(zs_l))
    z_hi = min(max(zs_r), max(zs_l))
    z_mid = 0.5 * (z_lo + z_hi)
    z_lo_b = z_mid - 0.02
    z_hi_b = z_hi - 0.01
    half = max(lm.chest_width * 0.5, 0.12)
    add_r, add_l = set(), set()
    for fi in remaining:
        c = centroids[fi]
        n = normals[fi]
        if abs(c.x - lm.sternum_x) > half * 0.12:
            continue
        if n.dot(lm.body_front) < 0.15:
            continue
        if c.z < z_lo_b or c.z > z_hi_b:
            continue
        if c.x <= lm.sternum_x:
            add_r.add(fi)
        else:
            add_l.add(fi)
    return add_r, add_l


def build_pectoral_masks(
    mesh,
    mw,
    *,
    lm,
    centroids,
    normals,
    remaining: set[int],
) -> tuple[set[int], set[int], dict]:
    face_adj = build_face_adjacency(mesh)
    vadj = build_vertex_adjacency(mesh)

    right, bl_r, meta_r = build_one_pectoral(
        mesh,
        mw,
        side="right",
        lm=lm,
        centroids=centroids,
        normals=normals,
        remaining=remaining,
        face_adj=face_adj,
        vadj=vadj,
    )
    left, bl_l, meta_l = build_one_pectoral(
        mesh,
        mw,
        side="left",
        lm=lm,
        centroids=centroids,
        normals=normals,
        remaining=remaining - right,
        face_adj=face_adj,
        vadj=vadj,
    )
    # Shared IMF (symmetric inferior boundary)
    imf_shared = min(meta_r.get("imf_z", 1e9), meta_l.get("imf_z", 1e9))
    right = {fi for fi in right if centroids[fi].z >= imf_shared - 0.004}
    left = {fi for fi in left if centroids[fi].z >= imf_shared - 0.004}
    meta_r["imf_z_shared"] = imf_shared
    meta_l["imf_z_shared"] = imf_shared

    # Symmetry: expand smaller toward larger face count via apex ellipse
    if abs(len(right) - len(left)) > 25:
        smaller = "right" if len(right) < len(left) else "left"
        target = max(len(right), len(left))
        src = right if smaller == "right" else left
        bl = bl_r if smaller == "right" else bl_l
        pool = remaining - right - left
        half = max(lm.chest_width * 0.5, 0.12)
        ranked = sorted(pool, key=lambda fi: (centroids[fi] - bl.apex).length)
        for fi in ranked:
            if len(src) >= target:
                break
            c = centroids[fi]
            if (c - bl.apex).length > half * 0.75:
                continue
            if normals[fi].dot(lm.body_front) < -0.2:
                continue
            src.add(fi)
        if smaller == "right":
            right = optimize_boundary_faces(src, face_adj)
        else:
            left = optimize_boundary_faces(src, face_adj)

    bridge_r, bridge_l = build_sternal_bridge(
        lm=lm,
        centroids=centroids,
        normals=normals,
        remaining=remaining - right - left,
        pec_r=right,
        pec_l=left,
    )
    right |= bridge_r
    left |= bridge_l
    for fi in right & left:
        if centroids[fi].x <= lm.sternum_x:
            left.discard(fi)
        else:
            right.discard(fi)

    meta = {
        "right": meta_r,
        "left": meta_l,
        "bridgeRight": len(bridge_r),
        "bridgeLeft": len(bridge_l),
        "rightFaces": len(right),
        "leftFaces": len(left),
        "method": "breast_mound_imf_ellipse",
    }
    return right, left, meta
