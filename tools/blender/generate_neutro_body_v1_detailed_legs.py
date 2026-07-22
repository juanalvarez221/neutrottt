"""
Generate official Neutro Body V1 detailed legs InteractionModel (L2 + G2).

Outputs:
  assets/blender/neutro-body/interaction/neutro_body_v1_detailed_legs_interaction.blend
  public/models/interaction/neutro_body_v1_detailed_legs_interaction.glb
  artifacts/body-v1-detailed-legs/report.json

22 meshes. Canonical configs: LEG_FINAL_LONGITUDINAL_CONFIG + LEG_FINAL_CIRCUMFERENTIAL_CONFIG.

Run:
  blender.exe --background --python tools/blender/generate_neutro_body_v1_detailed_legs.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_neutro_body_v1_leg_circumferential as circ  # noqa: E402
from neutro_body_interaction.config import (  # noqa: E402
    LEG_FINAL_CIRCUMFERENTIAL_CONFIG,
    LEG_FINAL_LONGITUDINAL_CONFIG,
)

OUT_BLEND = (
    REPO
    / "assets"
    / "blender"
    / "neutro-body"
    / "interaction"
    / "neutro_body_v1_detailed_legs_interaction.blend"
)
OUT_GLB = (
    REPO
    / "public"
    / "models"
    / "interaction"
    / "neutro_body_v1_detailed_legs_interaction.glb"
)
ART = REPO / "artifacts" / "body-v1-detailed-legs"
REPORT = ART / "report.json"


def log(msg: str) -> None:
    print(f"[detailed-legs] {msg}", flush=True)


def main():
    # Official = G2 algorithm on L2 longitudinal (canonical finals).
    assert LEG_FINAL_CIRCUMFERENTIAL_CONFIG is not None
    assert LEG_FINAL_LONGITUDINAL_CONFIG is not None

    circ.ART = ART
    circ.REPORT = ART / "pipeline-report.json"
    ART.mkdir(parents=True, exist_ok=True)

    result = circ.run_pipeline("G2", LEG_FINAL_CIRCUMFERENTIAL_CONFIG)

    # Promote pilot outputs to official paths
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(result["blend"], OUT_BLEND)
    shutil.copy2(result["glb"], OUT_GLB)

    # Also keep renders under detailed-legs by copying G2 views if present
    for view in (
        "front",
        "back",
        "left",
        "right",
        "three-quarter-front",
        "three-quarter-back",
    ):
        src = ART / f"g2-{view}.png"
        # run_pipeline wrote to circ.ART which we remapped to ART
        if src.exists():
            shutil.copy2(src, ART / f"legs-final-{view}.png")

    report = {
        "official": True,
        "longitudinal": "L2",
        "circumferential": "G2",
        "cfg": result["cfg"],
        "blend": str(OUT_BLEND.as_posix()),
        "glb": str(OUT_GLB.as_posix()),
        "glbBytes": OUT_GLB.stat().st_size,
        "meshes": 22,
        "coverage": result["coverage"],
        "overlap": result["overlap"],
        "holes": result["holes"],
        "duplicates": result["duplicates"],
        "rightLeftOverlap": result["rightLeftOverlap"],
        "legsTorsoPelvisOverlap": result["legsTorsoPelvisOverlap"],
        "right": result["right"],
        "left": result["left"],
        "zones": result["zones"],
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"Official blend {OUT_BLEND}")
    log(f"Official glb {OUT_GLB} ({OUT_GLB.stat().st_size} bytes)")
    log(f"Report {REPORT}")
    log("DONE")


if __name__ == "__main__":
    main()
