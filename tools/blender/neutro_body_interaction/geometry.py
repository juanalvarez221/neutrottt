"""Pure geometric helpers (mathutils)."""

from __future__ import annotations

import math

from mathutils import Vector


def world_bbox(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def project_point_on_segment(p: Vector, a: Vector, b: Vector):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-12:
        return a.copy(), 0.0, (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    closest = a + ab * t
    return closest, t, (p - closest).length


def arm_polyline_param(p: Vector, joints: list[Vector]):
    """
    Arc-length parameter s along piecewise-linear joint chain.
    Nearest segment by Euclidean distance wins (handles elbow kink).
    """
    best_dist, best_s, cum = 1e9, 0.0, 0.0
    for i in range(len(joints) - 1):
        a, b = joints[i], joints[i + 1]
        seg_len = (b - a).length
        _c, t, dist = project_point_on_segment(p, a, b)
        s = cum + t * seg_len
        if dist < best_dist:
            best_dist, best_s = dist, s
        cum += seg_len
    return best_s, best_dist


def face_area(mesh, poly, mw) -> float:
    verts = [mw @ mesh.vertices[i].co for i in poly.vertices]
    if len(verts) < 3:
        return 0.0
    area, o = 0.0, verts[0]
    for i in range(1, len(verts) - 1):
        area += ((verts[i] - o).cross(verts[i + 1] - o)).length * 0.5
    return area


def angle_deg(a: Vector, b: Vector) -> float:
    return math.degrees(
        math.acos(max(-1.0, min(1.0, a.normalized().dot(b.normalized()))))
    )
