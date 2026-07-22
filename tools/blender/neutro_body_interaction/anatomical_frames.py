"""Anatomical frames: upper-arm init + forearm rotation-minimizing transport (D2)."""

from __future__ import annotations

import math
from dataclasses import dataclass

from mathutils import Quaternion, Vector

from .config import BODY_FRONT_BLENDER


@dataclass(frozen=True)
class AnatomicalFrame:
    L: Vector  # distal longitudinal
    F: Vector  # front (anterior)
    S: Vector  # outer (away from torso)


def _orthonormalize(
    L: Vector, F: Vector, S: Vector, torso_center: Vector, mid: Vector
) -> AnatomicalFrame:
    L = L.normalized()
    F = F - F.dot(L) * L
    if F.length < 1e-8:
        tmp = Vector((0, 0, 1)) if abs(L.z) < 0.9 else Vector((1, 0, 0))
        F = tmp - tmp.dot(L) * L
    F = F.normalized()
    S = S - S.dot(L) * L
    S = S - S.dot(F) * F
    if S.length < 1e-8:
        S = L.cross(F).normalized()
    else:
        S = S.normalized()
    # Outer = away from torso (works for both left and right arms).
    to_torso = torso_center - mid
    to_torso = to_torso - to_torso.dot(L) * L
    if to_torso.length > 1e-8 and S.dot(to_torso.normalized()) > 0:
        S = -S
    return AnatomicalFrame(L=L, F=F, S=S)


def rotation_minimizing_quat(from_dir: Vector, to_dir: Vector) -> Quaternion:
    """Minimal rotation taking unit `from_dir` onto `to_dir` (Rodrigues / quat)."""
    a = from_dir.normalized()
    b = to_dir.normalized()
    c = max(-1.0, min(1.0, a.dot(b)))
    if c > 0.999999:
        return Quaternion((1.0, 0.0, 0.0, 0.0))
    if c < -0.999999:
        axis = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
        axis = (axis - axis.dot(a) * a).normalized()
        return Quaternion(axis, math.pi)
    axis = a.cross(b).normalized()
    return Quaternion(axis, math.acos(c))


def estimate_twist_about_L(F_ref: Vector, F_test: Vector, L: Vector) -> float:
    """Signed angle (deg) between two vectors in the plane ⊥ L."""
    L = L.normalized()
    a = (F_ref - F_ref.dot(L) * L).normalized()
    b = (F_test - F_test.dot(L) * L).normalized()
    if a.length < 1e-8 or b.length < 1e-8:
        return 0.0
    return math.degrees(math.atan2(L.dot(a.cross(b)), a.dot(b)))


def build_upper_arm_frame(
    shoulder: Vector,
    elbow: Vector,
    torso_center: Vector,
    body_front: Vector | None = None,
) -> AnatomicalFrame:
    """Initial upper-arm frame: L + projected BODY_FRONT + outer away from torso."""
    if body_front is None:
        body_front = Vector(BODY_FRONT_BLENDER)
    L = (elbow - shoulder).normalized()
    F = body_front - body_front.dot(L) * L
    if F.length < 1e-8:
        F = Vector((0, -1, 0))
    F = F.normalized()
    mid = (shoulder + elbow) * 0.5
    to_torso = torso_center - mid
    to_torso = to_torso - to_torso.dot(L) * L
    S = (-to_torso).normalized() if to_torso.length > 1e-8 else L.cross(F).normalized()
    return _orthonormalize(L, F, S, torso_center, mid)


def transport_forearm_frame(
    upper: AnatomicalFrame,
    elbow: Vector,
    wrist: Vector,
    torso_center: Vector,
) -> tuple[AnatomicalFrame, Quaternion]:
    """
    D2 — Parallel transport / RMF:
      q = min rotation L_upper → L_forearm
      apply q to F_upper, S_upper; re-orthonormalize; keep S outer.
    Artificial twist about L_forearm is 0 by construction relative to transported F.
    """
    L_f = (wrist - elbow).normalized()
    q = rotation_minimizing_quat(upper.L, L_f)
    F = q @ upper.F
    S = q @ upper.S
    mid = (elbow + wrist) * 0.5
    frame = _orthonormalize(L_f, F, S, torso_center, mid)
    return frame, q
