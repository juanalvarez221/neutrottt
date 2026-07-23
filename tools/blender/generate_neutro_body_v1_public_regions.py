"""
Generate Neutro Body V1 PublicRegionHighlightModel.

Delegates to v2 pipeline:
  BodyVisual source bake + InteractionModel face transfer
  + anatomical refinements (pectoral growing, wide back, flank absorption).

Run:
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python tools/blender/generate_neutro_body_v1_public_regions.py
"""

from __future__ import annotations

import runpy
from pathlib import Path

V2 = Path(__file__).resolve().parent / "generate_neutro_body_v1_public_regions_v2.py"

if __name__ == "__main__":
    runpy.run_path(str(V2), run_name="__main__")
