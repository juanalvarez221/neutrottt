"""Reclassify unassigned regions after classifier fix; update report.json only."""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_neutro_body_v1_body_interaction as bi  # noqa: E402


def main():
    human, rig, baked, baked_mesh, offset = bi.open_and_bake()
    coverage = bi.analyze_coverage(rig, baked, baked_mesh, offset)
    report_path = REPO / "artifacts" / "body-v1-69-zone-map" / "report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["coverage"] = coverage
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(coverage["unassignedByRegion"], indent=2))
    print("otherSignificant", coverage["otherSignificantOutsideHeadNeck"])
    print("DONE")


if __name__ == "__main__":
    main()
