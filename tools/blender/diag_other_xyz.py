"""Sample XYZ of unassigned 'other' faces."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_neutro_body_v1_body_interaction as bi  # noqa: E402
from neutro_body_interaction.arm_segmentation import vertex_weight  # noqa: E402
from neutro_body_interaction.config import (  # noqa: E402
    LEG_FINAL_CIRCUMFERENTIAL_CONFIG,
    LEG_FINAL_LONGITUDINAL_CONFIG,
    PELVIS_FINAL_CONFIG,
    TORSO_T2_CONFIG,
)
from neutro_body_interaction.leg_segmentation import (  # noqa: E402
    apply_leg_circumferential,
    resolve_leg_landmarks,
    segment_leg_faces,
)
from neutro_body_interaction.pelvis_segmentation import (  # noqa: E402
    integrate_pelvis_with_torso,
    resolve_pelvis_landmarks,
)
from neutro_body_interaction.torso_segmentation import (  # noqa: E402
    build_torso_context,
    collect_arm_universe_faces,
    segment_torso_faces,
)


def main():
    _, rig, baked, baked_mesh, offset = bi.open_and_bake()
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    def bh(name: str) -> Vector:
        return bi.bone_head(rig, name) + offset

    def bt(name: str) -> Vector:
        return bi.bone_tip(rig, name) + offset

    body, torso_lm = build_torso_context(
        bh("pelvis"), bh("spine_01"), bh("spine_02"), bh("spine_03"),
        bh("neck_01"), bh("clavicle_l"), bh("clavicle_r"),
    )
    tip_r = bi.bone_tip(rig, "middle_03_r")
    tip_l = bi.bone_tip(rig, "middle_03_l")
    tip_r = (tip_r + offset) if tip_r is not None else bt("hand_r")
    tip_l = (tip_l + offset) if tip_l is not None else bt("hand_l")
    arm_universe = collect_arm_universe_faces(
        baked_mesh, mw, vg_map,
        bh("upperarm_r"), bh("lowerarm_r"), bh("hand_r"), tip_r,
        bh("upperarm_l"), bh("lowerarm_l"), bh("hand_l"), tip_l,
    )
    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_universe, TORSO_T2_CONFIG
    )
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin
    combined = integrate_pelvis_with_torso(
        baked_mesh, mw, vg_map, body,
        resolve_pelvis_landmarks(
            torso_lm.waist_level, torso_lm.pelvis_top, bh("pelvis"),
            bh("thigh_l"), bh("thigh_r"), bh("calf_l"), bh("calf_r"),
            thigh_margin=margin,
        ),
        arm_universe, torso.face_zone, torso.coords, torso.centroids,
        torso.tris_by_face, torso.areas, PELVIS_FINAL_CONFIG,
    )
    leg_faces: set[int] = set()
    for side, sfx in (("right", "r"), ("left", "l")):
        lm = resolve_leg_landmarks(
            side, bh(f"thigh_{sfx}"), bh(f"calf_{sfx}"),
            bh(f"foot_{sfx}"), bt(f"ball_{sfx}"), margin,
        )
        long = segment_leg_faces(
            baked_mesh, mw, vg_map, lm, LEG_FINAL_LONGITUDINAL_CONFIG
        )
        circ = apply_leg_circumferential(
            baked_mesh, mw, long, bh("pelvis"), LEG_FINAL_CIRCUMFERENTIAL_CONFIG
        )
        leg_faces |= set(circ.face_zone.keys())
    assigned = set(arm_universe) | set(combined.face_zone.keys()) | leg_faces

    xs, ys, zs = [], [], []
    for poly in baked_mesh.polygons:
        if poly.index in assigned:
            continue
        w_acc: dict[str, float] = defaultdict(float)
        c = Vector((0, 0, 0))
        n = len(poly.vertices)
        for vi in poly.vertices:
            v = baked_mesh.vertices[vi]
            c += mw @ v.co
            for name, gi in vg_map.items():
                ww = vertex_weight(v, gi)
                if ww > 0:
                    w_acc[name] += ww
        c /= float(n)
        w = {k: val / float(n) for k, val in w_acc.items()}
        if bi.classify_unassigned_region(w, c, body.up, bh("pelvis")) != "other":
            continue
        xs.append(c.x); ys.append(c.y); zs.append(c.z)

    def stats(vals):
        vals = sorted(vals)
        return {
            "n": len(vals),
            "min": round(vals[0], 4),
            "p50": round(vals[len(vals)//2], 4),
            "max": round(vals[-1], 4),
            "mean": round(sum(vals)/len(vals), 4),
        }

    out = {"x": stats(xs), "y": stats(ys), "z": stats(zs)}
    path = REPO / "artifacts" / "body-v1-69-zone-map" / "other-xyz.json"
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
