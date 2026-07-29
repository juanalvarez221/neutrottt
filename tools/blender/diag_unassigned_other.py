"""Diagnose unassigned 'other' faces from Paso 29 coverage."""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
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
from neutro_body_interaction.geometry import face_area  # noqa: E402
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
    human, rig, baked, baked_mesh, offset = bi.open_and_bake()
    vg_map = {vg.name: vg.index for vg in baked.vertex_groups}
    mw = baked.matrix_world

    def bh(name: str) -> Vector:
        v = bi.bone_head(rig, name)
        if v is None:
            raise RuntimeError(name)
        return v + offset

    def bt(name: str) -> Vector:
        t = bi.bone_tip(rig, name)
        if t is None:
            raise RuntimeError(name)
        return t + offset

    body, torso_lm = build_torso_context(
        bh("pelvis"),
        bh("spine_01"),
        bh("spine_02"),
        bh("spine_03"),
        bh("neck_01"),
        bh("clavicle_l"),
        bh("clavicle_r"),
    )
    tip_r = bi.bone_tip(rig, "middle_03_r")
    tip_l = bi.bone_tip(rig, "middle_03_l")
    tip_r = (tip_r + offset) if tip_r is not None else bt("hand_r")
    tip_l = (tip_l + offset) if tip_l is not None else bt("hand_l")
    arm_universe = collect_arm_universe_faces(
        baked_mesh,
        mw,
        vg_map,
        bh("upperarm_r"),
        bh("lowerarm_r"),
        bh("hand_r"),
        tip_r,
        bh("upperarm_l"),
        bh("lowerarm_l"),
        bh("hand_l"),
        tip_l,
    )
    torso = segment_torso_faces(
        baked_mesh, mw, vg_map, body, torso_lm, arm_universe, TORSO_T2_CONFIG
    )
    margin = PELVIS_FINAL_CONFIG.thigh_start_margin
    pelvis_lm = resolve_pelvis_landmarks(
        torso_lm.waist_level,
        torso_lm.pelvis_top,
        bh("pelvis"),
        bh("thigh_l"),
        bh("thigh_r"),
        bh("calf_l"),
        bh("calf_r"),
        thigh_margin=margin,
    )
    combined = integrate_pelvis_with_torso(
        baked_mesh,
        mw,
        vg_map,
        body,
        pelvis_lm,
        arm_universe,
        torso.face_zone,
        torso.coords,
        torso.centroids,
        torso.tris_by_face,
        torso.areas,
        PELVIS_FINAL_CONFIG,
    )
    leg_faces: set[int] = set()
    for side, sfx in (("right", "r"), ("left", "l")):
        lm = resolve_leg_landmarks(
            side,
            bh(f"thigh_{sfx}"),
            bh(f"calf_{sfx}"),
            bh(f"foot_{sfx}"),
            bt(f"ball_{sfx}"),
            margin,
        )
        long = segment_leg_faces(
            baked_mesh, mw, vg_map, lm, LEG_FINAL_LONGITUDINAL_CONFIG
        )
        circ = apply_leg_circumferential(
            baked_mesh, mw, long, bh("pelvis"), LEG_FINAL_CIRCUMFERENTIAL_CONFIG
        )
        leg_faces |= set(circ.face_zone.keys())

    assigned = set(arm_universe) | set(combined.face_zone.keys()) | leg_faces
    unassigned = [p.index for p in baked_mesh.polygons if p.index not in assigned]

    vg_hits: Counter[str] = Counter()
    z_buckets: Counter[float] = Counter()
    samples = []
    other_area = 0.0
    other_faces = 0
    for fi in unassigned:
        poly = baked_mesh.polygons[fi]
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
        region = bi.classify_unassigned_region(w, c, body.up, bh("pelvis"))
        if region != "other":
            continue
        other_faces += 1
        area = face_area(baked_mesh, poly, mw)
        other_area += area
        dom = max(w.items(), key=lambda kv: kv[1])[0] if w else "(none)"
        vg_hits[dom] += 1
        z_buckets[round(c.z, 1)] += 1
        if len(samples) < 30:
            samples.append(
                {
                    "face": fi,
                    "z": round(c.z, 3),
                    "dom": dom,
                    "w": round(w.get(dom, 0), 3),
                    "area": round(area, 6),
                }
            )

    out = {
        "otherFaces": other_faces,
        "otherArea": round(other_area, 6),
        "topDominantVGs": vg_hits.most_common(25),
        "zBuckets": sorted(z_buckets.items()),
        "samples": samples,
    }
    path = REPO / "artifacts" / "body-v1-69-zone-map" / "other-diagnosis.json"
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
