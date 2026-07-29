"""Dump P1/F1A/F1B sacrum focus metrics (no renders)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Import pipeline helpers from the generate script without running main.
import generate_neutro_body_v1_pelvis_interaction as gen  # noqa: E402
from neutro_body_interaction.config import (  # noqa: E402
    PELVIS_F1A_CONFIG,
    PELVIS_F1B_CONFIG,
    PELVIS_P1_CONFIG,
)

FOCUS = ("sacrum", "lower_back_center", "left_glute", "right_glute", "left_ribs", "right_ribs")


def focus(result: dict) -> dict:
    out = {}
    for zid in FOCUS:
        z = result["zones"][zid]
        out[zid] = {
            "tris": z["triangleCount"],
            "area%": z["percentageOfCombinedTorsoPelvis"],
            "components": z["connectedComponentsAfter"],
        }
    return out


def main():
    # Skip expensive PNG writes
    gen.ART = REPO / "artifacts" / "body-v1-torso-pelvis-final"
    gen.ART.mkdir(parents=True, exist_ok=True)

    orig_render = gen.bpy.ops.render.render

    def noop_render(*_a, **_k):
        class R:
            def __getitem__(self, _):
                return True

        return {"FINISHED"}

    gen.bpy.ops.render.render = noop_render

    p1 = gen.run_pipeline("P1", PELVIS_P1_CONFIG)
    f1a = gen.run_pipeline("F1A", PELVIS_F1A_CONFIG)
    f1b = gen.run_pipeline("F1B", PELVIS_F1B_CONFIG)

    report = {
        "P1": {"cfg": p1["cfg"], "focus": focus(p1), "inv": {
            "coverage": p1["coverage"], "overlap": p1["overlap"],
            "armOverlap": p1["armOverlap"], "ribs": p1["ribsAfter"],
        }},
        "F1A": {"cfg": f1a["cfg"], "focus": focus(f1a), "inv": {
            "coverage": f1a["coverage"], "overlap": f1a["overlap"],
            "armOverlap": f1a["armOverlap"], "ribs": f1a["ribsAfter"],
        }},
        "F1B": {"cfg": f1b["cfg"], "focus": focus(f1b), "inv": {
            "coverage": f1b["coverage"], "overlap": f1b["overlap"],
            "armOverlap": f1b["armOverlap"], "ribs": f1b["ribsAfter"],
        }},
        "pick": gen._pick_final(p1, f1a, f1b),
    }
    out = gen.ART / "metrics-focus.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Wrote {out}")
    gen.bpy.ops.render.render = orig_render


if __name__ == "__main__":
    main()
