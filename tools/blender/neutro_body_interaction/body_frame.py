"""Body-local anatomical frame from rig landmarks (reusable across poses)."""

from __future__ import annotations

from dataclasses import dataclass

from mathutils import Vector

from .config import BODY_FRONT_BLENDER


@dataclass(frozen=True)
class BodyFrame:
    """Orthonormal body axes in world space."""

    origin: Vector  # typically spine_02 / mid-torso
    up: Vector  # BODY_UP
    front: Vector  # BODY_FRONT (anterior / nose)
    right: Vector  # BODY_RIGHT (anatomical right)


@dataclass(frozen=True)
class TorsoLandmarks:
    pelvis: Vector
    spine_01: Vector
    spine_02: Vector
    spine_03: Vector
    neck_01: Vector
    clavicle_l: Vector
    clavicle_r: Vector
    neck_base: Vector
    upper_chest: Vector
    chest_lower: Vector
    navel_level: Vector
    waist_level: Vector
    pelvis_top: Vector


def build_body_frame(
    pelvis: Vector,
    spine_01: Vector,
    spine_02: Vector,
    spine_03: Vector,
    neck_01: Vector,
    clavicle_l: Vector,
    clavicle_r: Vector,
    body_front_hint: Vector | None = None,
) -> BodyFrame:
    """
    Construct BODY_UP / BODY_FRONT / BODY_RIGHT from spine + clavicles.

    FRONT is anchored to the anatomical anterior hint (MPFB: Blender -Y) and is
    never flipped solely to satisfy clavicle laterality. RIGHT is forced to point
    toward clavicle_r while keeping a right-handed triad (R × F ≈ U).
    """
    if body_front_hint is None:
        body_front_hint = Vector(BODY_FRONT_BLENDER)

    up = (neck_01 - pelvis).normalized()
    mid = spine_02.copy()

    front = body_front_hint - body_front_hint.dot(up) * up
    if front.length < 1e-6:
        # Fallback from clavicle plane
        across = clavicle_r - clavicle_l
        across = across - across.dot(up) * up
        front = across.cross(up) if across.length > 1e-6 else Vector((0, -1, 0))
        front = front - front.dot(up) * up
    front = front.normalized()

    # Prefer clavicle_r as anatomical right; keep FRONT fixed.
    toward_r = clavicle_r - mid
    toward_r = toward_r - toward_r.dot(up) * up
    if toward_r.length < 1e-6:
        toward_r = up.cross(front)
    right = toward_r.normalized()

    # Orthonormalize: remove front component from right, then restore RH.
    right = right - right.dot(front) * front
    if right.length < 1e-6:
        right = front.cross(up)
    right = right.normalized()

    # Right-handed with FRONT fixed: R = F × U  (for FRONT=-Y, UP=+Z → R=-X = anatomical right)
    right_rh = front.cross(up).normalized()
    if right_rh.dot(toward_r) < 0:
        # Prefer clavicle_r side; keep FRONT, accept mirrored R only if clavicles disagree.
        right_rh = -right_rh
        front = -front
        right_rh = front.cross(up).normalized()
    right = right_rh
    up = right.cross(front).normalized()

    return BodyFrame(origin=mid, up=up, front=front, right=right)


def resolve_torso_landmarks(
    pelvis: Vector,
    spine_01: Vector,
    spine_02: Vector,
    spine_03: Vector,
    neck_01: Vector,
    clavicle_l: Vector,
    clavicle_r: Vector,
) -> TorsoLandmarks:
    """
    Vertical landmarks from joints (no absolute magic coordinates).

    neckBase     ≈ neck_01
    upperChest   ≈ mid clavicles projected onto pelvis→neck
    chestLower   ≈ spine_02
    navelLevel   ≈ lerp(spine_01, pelvis, 0.35)
    waistLevel   ≈ lerp(spine_01, pelvis, 0.72)
    pelvisTop    ≈ pelvis
    """
    clav_mid = (clavicle_l + clavicle_r) * 0.5
    chain = neck_01 - pelvis
    t = 0.0
    if chain.length_squared > 1e-12:
        t = max(0.0, min(1.0, (clav_mid - pelvis).dot(chain) / chain.length_squared))
    upper_chest = pelvis + chain * t

    return TorsoLandmarks(
        pelvis=pelvis,
        spine_01=spine_01,
        spine_02=spine_02,
        spine_03=spine_03,
        neck_01=neck_01,
        clavicle_l=clavicle_l,
        clavicle_r=clavicle_r,
        neck_base=neck_01.copy(),
        upper_chest=upper_chest,
        chest_lower=spine_02.copy(),
        navel_level=spine_01.lerp(pelvis, 0.35),
        waist_level=spine_01.lerp(pelvis, 0.72),
        pelvis_top=pelvis.copy(),
    )


def spine_polyline(lm: TorsoLandmarks) -> list[Vector]:
    return [
        lm.pelvis_top,
        lm.waist_level,
        lm.navel_level,
        lm.chest_lower,
        lm.upper_chest,
        lm.neck_base,
    ]
