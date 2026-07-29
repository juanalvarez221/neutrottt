"""Finalize Paso 26 from existing F1 blends: pick, export official, stitch, combo."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_neutro_body_v1_pelvis_interaction as gen  # noqa: E402
from neutro_body_interaction.config import (  # noqa: E402
    PELVIS_F1A_CONFIG,
    PELVIS_F1B_CONFIG,
    PELVIS_P1_CONFIG,
)

ART = REPO / "artifacts" / "body-v1-torso-pelvis-final"
REPORT = ART / "report.json"
ARMS_GLB = REPO / "public" / "models" / "interaction" / "neutro_body_v1_detailed_arms_interaction.glb"


def focus_keys(result: dict) -> dict:
    keys = (
        "sacrum",
        "lower_back_center",
        "left_glute",
        "right_glute",
        "left_lower_back",
        "right_lower_back",
        "left_hip",
        "right_hip",
        "lower_abdomen",
        "left_ribs",
        "right_ribs",
    )
    out = {}
    for zid in keys:
        z = result["zones"][zid]
        out[zid] = {
            "triangles": z["triangleCount"],
            "surfaceArea": z["surfaceArea"],
            "percentageOfTorsoPelvis": z["percentageOfCombinedTorsoPelvis"],
            "components": z["connectedComponentsAfter"],
        }
    return out


def main():
    ART.mkdir(parents=True, exist_ok=True)
    gen.ART = ART
    gen.REPORT = REPORT

    p1 = gen.run_pipeline("P1", PELVIS_P1_CONFIG)
    f1a = gen.run_pipeline(
        "F1A",
        PELVIS_F1A_CONFIG,
        center_hint=Vector(p1["center"]),
        radius_hint=p1["radius"],
    )
    f1b = gen.run_pipeline(
        "F1B",
        PELVIS_F1B_CONFIG,
        center_hint=Vector(p1["center"]),
        radius_hint=p1["radius"],
    )

    gen.stitch_images(
        [ART / "p1-back.png", ART / "f1a-back.png", ART / "f1b-back.png"],
        ART / "sacrum-comparison.png",
    )

    choice = gen._pick_final(p1, f1a, f1b)
    chosen = {"P1": p1, "F1A": f1a, "F1B": f1b}[choice]
    print(f"[finalize] choice={choice}", flush=True)

    for view in (
        "front",
        "back",
        "left",
        "right",
        "three-quarter-front",
        "three-quarter-back",
    ):
        src = Path(chosen["paths"][view])
        dst = ART / f"final-{view}.png"
        if src.exists():
            shutil.copy2(src, dst)

    official_blend, official_glb = gen.export_official_from_pilot(
        Path(chosen["glb"]), Path(chosen["blend"])
    )
    gen.render_combo_arms(official_glb, p1["center"], p1["radius"], ART)

    # GLB structural summary via bpy after import
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(official_glb))
    nodes = len(bpy.data.objects)
    meshes = len(bpy.data.meshes)
    primitives = meshes
    tris = 0
    for me in bpy.data.meshes:
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)

    report = {
        "base": "P1 Anatomical Pelvis + T2 torso",
        "choice": choice,
        "P1": {
            "cfg": p1["cfg"],
            "invariants": {
                "coverage": p1["coverage"],
                "overlap": p1["overlap"],
                "holes": p1["holes"],
                "duplicates": p1["duplicates"],
                "armOverlap": p1["armOverlap"],
            },
            "focus": focus_keys(p1),
            "ribsAfter": p1["ribsAfter"],
            "zones": p1["zones"],
        },
        "F1A": {
            "cfg": f1a["cfg"],
            "invariants": {
                "coverage": f1a["coverage"],
                "overlap": f1a["overlap"],
                "holes": f1a["holes"],
                "duplicates": f1a["duplicates"],
                "armOverlap": f1a["armOverlap"],
            },
            "focus": focus_keys(f1a),
            "ribsAfter": f1a["ribsAfter"],
            "zones": f1a["zones"],
        },
        "F1B": {
            "cfg": f1b["cfg"],
            "invariants": {
                "coverage": f1b["coverage"],
                "overlap": f1b["overlap"],
                "holes": f1b["holes"],
                "duplicates": f1b["duplicates"],
                "armOverlap": f1b["armOverlap"],
            },
            "focus": focus_keys(f1b),
            "ribsAfter": f1b["ribsAfter"],
            "zones": f1b["zones"],
        },
        "official": {
            "blend": str(official_blend.as_posix()),
            "glb": str(official_glb.as_posix()),
            "glbBytes": official_glb.stat().st_size,
            "atomicZones": 23,
            "nodes": nodes,
            "meshes": meshes,
            "primitives": primitives,
            "triangles": tris,
            "animations": 0,
            "skins": 0,
        },
        "below_1_5_pct": {
            tag: [
                zid
                for zid, m in res["zones"].items()
                if m["percentageOfCombinedTorsoPelvis"] < 1.5
                and zid
                in (
                    "sacrum",
                    "lower_back_center",
                    "left_glute",
                    "right_glute",
                    "left_lower_back",
                    "right_lower_back",
                )
            ]
            for tag, res in (("P1", p1), ("F1A", f1a), ("F1B", f1b))
        },
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("choice", "official", "below_1_5_pct")}, indent=2))
    print(f"Wrote {REPORT}", flush=True)


if __name__ == "__main__":
    main()
