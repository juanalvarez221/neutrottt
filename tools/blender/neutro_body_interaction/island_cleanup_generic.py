"""Generic connected-component island cleanup (zone-agnostic)."""

from __future__ import annotations

from collections import defaultdict
from typing import Callable

from .config import IslandCleanupConfig
from .island_cleanup import build_edge_face_map, connected_components


def cleanup_islands_generic(
    mesh,
    face_zone: dict[int, str],
    zone_ids: tuple[str, ...] | list[str],
    parent_tris_fn: Callable[[str], int],
    score_fn: Callable[[set[int], str], dict[str, float]] | None = None,
    cfg: IslandCleanupConfig | None = None,
    secondary_ok_fn: Callable[[set[int], str, str], bool] | None = None,
    max_passes: int = 5,
) -> tuple[int, list[dict], dict[str, dict]]:
    """
    Reassign small islands when shared boundary + score coherence agree.

    parent_tris_fn(zone_id) → triangle budget used for size threshold.
    score_fn(comp, zone_id) → optional affinity scores to candidate zones.
    secondary_ok_fn(comp, from_zone, to_zone) → optional anatomical gate.
    """
    cfg = cfg or IslandCleanupConfig(max_fraction_of_parent=0.04, min_faces=2)
    all_faces = set(face_zone.keys())
    edge_to_faces = build_edge_face_map(mesh, all_faces)

    before = {
        zid: len(connected_components(mesh, [i for i, z in face_zone.items() if z == zid]))
        for zid in zone_ids
    }
    reassigned_total = 0
    details: list[dict] = []
    reassigned_by_zone: dict[str, int] = defaultdict(int)

    def neighbor_edge_counts(comp_faces: set[int]) -> dict[str, int]:
        counts: dict[str, int] = defaultdict(int)
        for faces in edge_to_faces.values():
            if len(faces) != 2:
                continue
            a, b = faces
            if a in comp_faces and b not in comp_faces and b in face_zone:
                counts[face_zone[b]] += 1
            elif b in comp_faces and a not in comp_faces and a in face_zone:
                counts[face_zone[a]] += 1
        return counts

    for _pass in range(max_passes):
        changed = 0
        for zid in zone_ids:
            faces = [fi for fi, z in face_zone.items() if z == zid]
            if not faces:
                continue
            parent_tris = max(1, parent_tris_fn(zid))
            threshold = max(cfg.min_faces, int(parent_tris * cfg.max_fraction_of_parent))
            comps = connected_components(mesh, faces)
            if len(comps) <= 1:
                continue
            for comp in comps[1:]:
                if len(comp) >= threshold:
                    continue
                comp_set = set(comp)
                neigh = neighbor_edge_counts(comp_set)
                cand = {k: v for k, v in neigh.items() if k != zid and k in zone_ids}
                if not cand:
                    continue
                scores = score_fn(comp_set, zid) if score_fn else {}
                ranked = sorted(cand.items(), key=lambda kv: kv[1], reverse=True)
                best = None
                if scores:
                    top2 = {
                        k
                        for k, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:2]
                    }
                    best_score = -1.0
                    for nz, ec in ranked:
                        if nz not in top2:
                            continue
                        if secondary_ok_fn is not None and not secondary_ok_fn(
                            comp_set, zid, nz
                        ):
                            continue
                        sc = ec + 2.0 + scores.get(nz, 0.0)
                        if sc > best_score:
                            best_score = sc
                            best = nz
                else:
                    for nz, ec in ranked:
                        ok = True
                        if secondary_ok_fn is not None:
                            ok = secondary_ok_fn(comp_set, zid, nz)
                        if not ok:
                            continue
                        if len(ranked) == 1 or ec >= ranked[1][1]:
                            best = nz
                            break
                    if best is None and secondary_ok_fn is None:
                        if len(ranked) == 1 or ranked[0][1] >= ranked[1][1] + 1:
                            best = ranked[0][0]
                if best is None:
                    continue
                for fi in comp_set:
                    face_zone[fi] = best
                    reassigned_total += 1
                    reassigned_by_zone[zid] += 1
                    changed += 1
                details.append(
                    {
                        "from": zid,
                        "to": best,
                        "faces": len(comp_set),
                        "neighborEdges": dict(cand),
                    }
                )
        if changed == 0:
            break

    after = {
        zid: len(connected_components(mesh, [i for i, z in face_zone.items() if z == zid]))
        for zid in zone_ids
    }
    stats = {
        zid: {
            "before": before.get(zid, 0),
            "after": after.get(zid, 0),
            "reassigned": reassigned_by_zone.get(zid, 0),
        }
        for zid in zone_ids
    }
    return reassigned_total, details, stats
