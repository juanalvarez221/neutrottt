"""Balanced thigh quadrant masks using local hip→knee circumferential frame."""

from __future__ import annotations

import math
from collections import defaultdict

from mathutils import Vector


def build_thigh_frame(hip: Vector, knee: Vector, lm, side: str):
    L = (knee - hip).normalized()
    F = lm.body_front - lm.body_front.dot(L) * L
    if F.length < 1e-8:
        F = Vector((0.0, -1.0, 0.0))
        F = (F - F.dot(L) * L).normalized()
    else:
        F = F.normalized()
    # Anatomical outer axis in world X (MPFB: left=+X, right=-X)
    outer = Vector((1.0, 0.0, 0.0)) if side == "left" else Vector((-1.0, 0.0, 0.0))
    S = outer - outer.dot(L) * L
    S = S - S.dot(F) * F
    if S.length < 1e-8:
        S = L.cross(F)
    S = S.normalized()
    return L, F, S


def assign_thigh_faces(
    items: list[tuple[int, Vector]],
    *,
    F: Vector,
    S: Vector,
    normals: dict[int, Vector],
    lm,
    prefix: str,
) -> dict[int, str]:
    """
    Balanced 4-way split using surface normals in local (F,S) basis.

    Primary signal: normal.dot(F) vs normal.dot(S).
    Falls back to radial angle of centroid offset if normals collapse.
    Forces approximate balance via angle-bin equalization.
    """
    if not items:
        return {}

    # Orient F with anterior normals
    def mean_nf(sign: float) -> float:
        acc = 0.0
        n = 0
        for fi, _rel in items:
            if normals[fi].dot(F) * sign >= 0:
                acc += normals[fi].dot(lm.body_front)
                n += 1
        return acc / max(n, 1)

    F_use = F if mean_nf(1.0) >= mean_nf(-1.0) else -F
    S_use = S

    scored: list[tuple[int, float, float, float]] = []
    for fi, rel in items:
        n = normals[fi]
        nf = n.dot(F_use)
        ns = n.dot(S_use)
        ang = math.degrees(math.atan2(ns, nf))
        # Blend normal angle with geometric radial angle for stability
        ang_g = math.degrees(math.atan2(rel.dot(S_use), rel.dot(F_use)))
        ang_b = 0.65 * ang + 0.35 * ang_g
        scored.append((fi, nf, ns, ang_b))

    def quad_from_ang(a: float) -> str:
        if -45.0 <= a <= 45.0:
            return "front"
        if 45.0 < a <= 135.0:
            return "outer"
        if -135.0 <= a < -45.0:
            return "inner"
        return "back"

    # Rotate S to minimize imbalance
    best_offset = 0
    best_imbalance = 1e9
    best_assign: dict[int, str] = {}
    total = len(scored)
    for offset in range(-35, 40, 5):
        counts = defaultdict(int)
        assign = {}
        for fi, _nf, _ns, ang in scored:
            q = quad_from_ang(((ang + offset + 180) % 360) - 180)
            assign[fi] = q
            counts[q] += 1
        vals = [counts.get(k, 0) for k in ("front", "back", "inner", "outer")]
        imb = max(vals) - min(vals)
        # Prefer also that none is tiny
        tiny_pen = sum(200 for v in vals if v < max(3, int(0.10 * total)))
        score = imb + tiny_pen
        if score < best_imbalance:
            best_imbalance = score
            best_offset = offset
            best_assign = assign

    # If still badly skewed, force equal bins by sorted angle
    counts = defaultdict(int)
    for q in best_assign.values():
        counts[q] += 1
    if min(counts.get(k, 0) for k in ("front", "back", "inner", "outer")) < max(3, int(0.08 * total)):
        ordered = sorted(scored, key=lambda t: ((t[3] + best_offset + 180) % 360))
        n = len(ordered)
        edges = [0, n // 4, n // 2, (3 * n) // 4, n]
        labels = ["front", "outer", "back", "inner"]
        # Map circular quarters starting from most-anterior angle cluster
        # Find index of most frontal (ang closest to 0 after offset)
        def adj(a):
            return ((a + best_offset + 180) % 360) - 180

        front_i = min(range(n), key=lambda i: abs(adj(ordered[i][3])))
        # Rotate ordered so front_i is start of front quarter
        ordered = ordered[front_i:] + ordered[:front_i]
        best_assign = {}
        for qi, lab in enumerate(labels):
            for fi, *_ in ordered[edges[qi] : edges[qi + 1]]:
                best_assign[fi] = lab

    return {fi: f"{prefix}_thigh_{q}_surface" for fi, q in best_assign.items()}
