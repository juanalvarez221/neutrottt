"""
Generate full_chest_surface anatomically from production GLB + landmarks.

Headless entry (Blender):
  & $env:BLENDER_EXE --background --python tools/body-regions/generate-full-chest-surface.py

Implementation note:
  Heavy mesh/UV rasterization runs via Node (same repo tools + production GLB
  loader). Blender validates the session environment and delegates the generator
  so BVH-like projection + per-texel UV PIP stay deterministic across platforms.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NODE_SCRIPT = ROOT / "tools" / "body-regions" / "generate-full-chest-surface.mjs"
REPORT = ROOT / "artifacts" / "full-chest-code-generation" / "report.json"
GLB = ROOT / "public" / "models" / "production" / "neutro_body_v1.glb"
LANDMARKS = ROOT / "assets" / "body-regions" / "neutro_body_v1_landmarks.json"


def _node_bin() -> str:
    return os.environ.get("NODE_EXE") or "node"


def main() -> int:
    print("NEUTRO_FULL_CHEST_CODEGEN_START")
    print("ROOT", ROOT)
    print("GLB", GLB, "exists", GLB.exists())
    print("LANDMARKS", LANDMARKS, "exists", LANDMARKS.exists())
    print("NODE_SCRIPT", NODE_SCRIPT, "exists", NODE_SCRIPT.exists())

    if not GLB.exists():
        print("FAIL missing production GLB")
        return 1
    if not LANDMARKS.exists():
        print("FAIL missing landmarks")
        return 1
    if not NODE_SCRIPT.exists():
        print("FAIL missing node generator")
        return 1

    lm = json.loads(LANDMARKS.read_text(encoding="utf-8"))
    required = [
        "clavicleLeft",
        "clavicleRight",
        "sternumTop",
        "sternumBottom",
        "breastApexLeft",
        "breastApexRight",
        "inframammaryMedialLeft",
        "inframammaryLateralLeft",
        "inframammaryMedialRight",
        "inframammaryLateralRight",
        "anteriorAxillaryFoldLeft",
        "anteriorAxillaryFoldRight",
    ]
    for key in required:
        if key not in lm.get("points", {}):
            print("FAIL missing landmark", key)
            return 1
    print("LANDMARK_SOURCE_HASH", lm.get("sourceHash"))
    print("SOURCE_MESH", lm.get("sourceMesh"))

    # Optional Blender context probe (when launched under bpy)
    try:
        import bpy  # type: ignore

        print("BLENDER", bpy.app.version_string)
        print("BLENDER_BACKGROUND", bpy.app.background)
    except Exception as exc:
        print("BLENDER_CONTEXT", "unavailable", exc)

    cmd = [_node_bin(), str(NODE_SCRIPT)]
    print("RUN", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=str(ROOT))
    if proc.returncode != 0:
        print("FAIL generator exit", proc.returncode)
        return proc.returncode

    if REPORT.exists():
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        print("BEST_SCORE", report.get("bestScore"))
        print("SYMMETRY_PCT", report.get("metrics", {}).get("symmetryPct"))
        print("PIXELS", report.get("metrics", {}).get("areaPixels"))
        print("REPORT_OK", REPORT)
    else:
        print("WARN missing report.json")

    print("NEUTRO_FULL_CHEST_CODEGEN_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
